# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$dvLocale = if ([string]::IsNullOrWhiteSpace($env:DATAVISOOL_LANG)) { [System.Globalization.CultureInfo]::CurrentUICulture.Name } else { $env:DATAVISOOL_LANG }
$script:DvLanguage = if ($dvLocale -match '^(?i:en)(?:[-_]|$)') { 'en-US' } else { 'zh-CN' }
$env:DATAVISOOL_LANG = $script:DvLanguage
function Get-DvMessage([string] $Chinese, [string] $English) {
    if ($script:DvLanguage -eq 'en-US') { return $English }
    return $Chinese
}

$script:ModeMarker = 'docker-app-launcher-v1'
$script:ManagedEnvNames = @()
$script:DockerExecutable = 'docker.exe'
$script:Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:AppDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
$script:RunDir = Join-Path $script:Root 'run'
$script:EnvPath = Join-Path $script:Root '.env'
$script:ComposePath = Join-Path $script:AppDir 'docker-compose.yml'
$script:ExpectedModePath = Join-Path $script:Root '.datavisool-deployment'
$script:ScriptArgs = @($args)

function Write-Usage {
    if ($script:DvLanguage -eq 'en-US') {
@'
Docker app deployment
Usage: deploy_windows.cmd [--help|-h|--check|--status|--stop|--restart]
  --logs                 Follow container logs.
  --wait-timeout SECONDS Set the startup health-check timeout.
  (no option)  Check requirements, request missing settings, and start the application.
  --check      Check requirements without prompting, changing files or starting.
  --status     Show the recorded instance status.
  --stop       Stop the recorded instance.
  --restart    Stop the instance and then start it again.
  --help, -h   Show this help.
Default health-check timeout: 300 seconds. Requires a local Docker Linux engine, Compose v2.20+ and an existing MySQL database.
The package image is imported from image.tar if missing; resource/ and logs/ remain on the host.
'@ | Write-Output
        return
    }
    @'
用法：deploy_windows.cmd [选项]

  (无参数)                    准备配置并启动 Docker app 包应用。
  --check                     只检查；不生成文件、不导入镜像、不询问。
  --status                    查看此部署目录对应的容器状态。
  --stop                      停止应用容器并保留容器及宿主机数据。
  --logs                      跟踪应用容器最近 200 行日志。
  --restart                   停止成功后重新启动。
  --wait-timeout SECONDS      启动健康检查等待时间，默认 300 秒（仅启动/重启）。
  --help, -h                  显示帮助。

需要本机 Docker Linux 引擎和 Docker Compose v2.20 或更高版本，以及可访问的 MySQL。
应用镜像按发布包指定版本运行；缺少该镜像时从包根目录的 image.tar 导入，不会拉取镜像。
数据库配置写入包根目录 .env；resource/ 和 logs/ 保存在包根目录并映射到容器。
'@ | Write-Host
}

function Get-CanonicalPath {
    param([Parameter(Mandatory = $true)][string] $Path)
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($full)
    if ($full.Length -gt $root.Length) { $full = $full.TrimEnd([char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)) }
    return $full
}

function Test-SamePath {
    param([string] $Left, [string] $Right)
    try { return [string]::Equals((Get-CanonicalPath $Left), (Get-CanonicalPath $Right), [StringComparison]::OrdinalIgnoreCase) }
    catch { return $false }
}

function Read-TextFile {
    param([Parameter(Mandatory = $true)][string] $Path)
    $encoding = [System.Text.UTF8Encoding]::new($false, $true)
    $text = [System.IO.File]::ReadAllText($Path, $encoding)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    return $text
}

function Get-EnvDocument {
    param([string] $Text)
    $hasCrLf = $Text.Contains("`r`n")
    if ($hasCrLf) {
        $withoutCrLf = $Text.Replace("`r`n", '')
        if ($withoutCrLf.Contains("`n") -or $withoutCrLf.Contains("`r")) { throw (Get-DvMessage '.env 混用了不同换行格式，请先统一为 LF 或 CRLF。' '.env mixes line endings; use LF or CRLF consistently.') }
        $newline = "`r`n"
    }
    else {
        if ($Text.Contains("`r")) { throw (Get-DvMessage '.env 使用了不支持的单独回车换行格式。' '.env contains unsupported standalone carriage returns.') }
        $newline = "`n"
    }
    $lines = $Text.Split([string[]]@($newline), [System.StringSplitOptions]::None)
    $entries = @{}
    $counts = @{}
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '^\s*(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*(?:=|$)') {
            $key = $Matches['key']
            if (-not $counts.ContainsKey($key)) { $counts[$key] = 0 }
            $counts[$key]++
            $entries[$key] = [pscustomobject]@{ Index = $i }
        }
    }
    foreach ($key in @('DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD')) {
        if ($counts.ContainsKey($key) -and $counts[$key] -gt 1) { throw (Get-DvMessage ".env 中 '$key' 出现多次；请保留唯一配置项后重试。" "The .env entry '$key' appears more than once; keep one entry and retry.") }
    }
    return [pscustomobject]@{ Lines = $lines; Newline = $newline; Entries = $entries; Counts = $counts; Text = $Text }
}

function ConvertTo-EnvValue {
    param([string] $Value)
    if ($Value -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { throw (Get-DvMessage '数据库配置不能包含换行或控制字符。' 'Database configuration cannot contain newlines or control characters.') }
    $escaped = $Value.Replace('\', '\\').Replace('"', '\"').Replace('$', '$$')
    return '"' + $escaped + '"'
}

function Set-EnvDocumentValue {
    param([pscustomobject] $Document, [string] $Key, [string] $Value, [bool] $Quote = $false)
    $line = if ($Quote) { "$Key=$(ConvertTo-EnvValue $Value)" } else { "$Key=$Value" }
    $newLines = New-Object System.Collections.ArrayList
    $written = $false
    foreach ($oldLine in $Document.Lines) {
        if ($oldLine -match '^\s*(?:export\s+)?' + [regex]::Escape($Key) + '\s*(?:=|$)') {
            if (-not $written) { [void]$newLines.Add($line); $written = $true }
        }
        else { [void]$newLines.Add([string]$oldLine) }
    }
    if (-not $written) { [void]$newLines.Add($line) }
    $Document.Lines = [string[]]$newLines.ToArray()
    $Document.Text = [string]::Join($Document.Newline, [string[]]$Document.Lines)
    $Document.Entries[$Key] = [pscustomobject]@{ Index = $Document.Lines.Length - 1 }
    $Document.Counts[$Key] = 1
}

function Test-EnvDocumentHasValue {
    param([pscustomobject] $Document, [string] $Key)
    if (-not $Document.Entries.ContainsKey($Key)) { return $false }
    foreach ($line in $Document.Lines) {
        if ($line -match '^\s*(?:export\s+)?' + [regex]::Escape($Key) + '\s*=\s*(?<raw>.*)$') {
            $raw = [string]$Matches['raw']
            $trimmed = $raw.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#') -or $trimmed -ceq '""' -or $trimmed -ceq "''") { return $false }
            return $true
        }
    }
    return $false
}

function Write-AtomicTextFile {
    param([string] $Path, [string] $Text, [switch] $BackupExisting, [switch] $Private)
    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { [void][System.IO.Directory]::CreateDirectory($directory) }
    $temporary = Join-Path $directory ('.' + [System.IO.Path]::GetFileName($Path) + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backup = $null
    $originalAcl = $null
    $privateOnWindows = [bool]$Private -and [Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
    try {
        $targetExists = Test-Path -LiteralPath $Path -PathType Leaf
        if ($targetExists -and -not $privateOnWindows) { $originalAcl = Get-Acl -LiteralPath $Path }
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
        if ($privateOnWindows) {
            $stream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            $stream.Dispose()
            Set-PrivateEnvFileAcl -Path $temporary
            $stream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        }
        else {
            $stream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        }
        try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        if ($null -ne $originalAcl) { Set-Acl -LiteralPath $temporary -AclObject $originalAcl }
        if ($targetExists) {
            if ($BackupExisting) {
                $backup = $Path + '.bak.' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '.' + [Guid]::NewGuid().ToString('N')
                if ($privateOnWindows) {
                    $backupBytes = [System.IO.File]::ReadAllBytes($Path)
                    $stream = [System.IO.File]::Open($backup, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
                    $stream.Dispose()
                    Set-PrivateEnvFileAcl -Path $backup
                    $stream = [System.IO.File]::Open($backup, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
                    try { $stream.Write($backupBytes, 0, $backupBytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
                }
                else {
                    [System.IO.File]::Copy($Path, $backup, $false)
                    if ($null -ne $originalAcl) { Set-Acl -LiteralPath $backup -AclObject $originalAcl }
                }
            }
            if ($privateOnWindows) { Set-PrivateEnvFileAcl -Path $Path }
            try { [System.IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value) }
            catch [System.PlatformNotSupportedException] { [System.IO.File]::Delete($Path); [System.IO.File]::Move($temporary, $Path) }
        }
        else { [System.IO.File]::Move($temporary, $Path) }
        if ($privateOnWindows) { Set-PrivateEnvFileAcl -Path $Path }
    }
    finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue } }
    return $backup
}

function Set-PrivateEnvFileAcl {
    param([Parameter(Mandatory = $true)][string] $Path)
    if ([Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) { return }
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    if ($null -eq $identity.User) { throw (Get-DvMessage '无法确定当前 Windows 用户；无法安全设置 .env 权限。' 'Cannot identify the current Windows user; .env permissions cannot be set safely.') }
    $security = New-Object System.Security.AccessControl.FileSecurity
    $security.SetAccessRuleProtection($true, $false)
    $security.SetOwner($identity.User)
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null)
    $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null)
    $seen = @{}
    foreach ($sid in @($identity.User, $systemSid, $administratorsSid)) {
        if ($seen.ContainsKey($sid.Value)) { continue }
        $seen[$sid.Value] = $true
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $sid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        [void]$security.AddAccessRule($rule)
    }
    [void](Set-Acl -LiteralPath $Path -AclObject $security)
}

function Get-GeneratedProjectName {
    $identityPath = Get-CanonicalPath $script:Root
    $normalized = $identityPath.ToLowerInvariant()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalized))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    return 'datavisool-app-' + $hash.Substring(0, 20)
}

function Test-ProjectName {
    param([string] $ProjectName)
    return -not [string]::IsNullOrWhiteSpace($ProjectName) -and $ProjectName -cmatch '^[a-z0-9][a-z0-9_-]*$'
}

function Get-IdentityPaths {
    return [pscustomobject]@{
        Project = Join-Path $script:RunDir 'project.name'
        Root = Join-Path $script:RunDir 'deployment.root'
        Container = Join-Path $script:RunDir 'container.id'
        Endpoint = Join-Path $script:RunDir 'docker.endpoint'
        Lock = Join-Path $script:RunDir 'docker-launcher.lock'
    }
}

function Read-OneLine {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return (Read-TextFile $Path).Trim()
}

function Assert-StoredIdentity {
    param([pscustomobject] $Paths, [string] $ProjectName, [bool] $AllowAbsent = $false)
    $hasProject = Test-Path -LiteralPath $Paths.Project -PathType Leaf
    $hasRoot = Test-Path -LiteralPath $Paths.Root -PathType Leaf
    if (-not $hasProject -and -not $hasRoot) {
        if ($AllowAbsent) { return $false }
        throw (Get-DvMessage '此目录没有 Docker 部署身份记录；没有操作容器。' 'No Docker deployment identity exists in this directory; no containers were modified.')
    }
    if (-not $hasProject -or -not $hasRoot) { throw (Get-DvMessage 'run/project.name 与 run/deployment.root 不完整；为避免误操作，没有继续。' 'run/project.name or run/deployment.root is incomplete; operation stopped.') }
    $savedProject = Read-OneLine $Paths.Project
    $savedRoot = Read-OneLine $Paths.Root
    if ($savedProject -cne $ProjectName -or -not (Test-SamePath $savedRoot $script:Root)) {
        throw (Get-DvMessage '部署身份记录不属于此解压目录；为避免误操作，没有继续。' 'The deployment identity belongs to another directory; operation stopped.')
    }
    return $true
}

function Get-PackageImage {
    $imagePath = Join-Path $script:AppDir 'IMAGE'
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw (Get-DvMessage "Docker app 发布包缺少文件：'$imagePath'。" "Docker app package is missing '$imagePath'.") }
    $image = (Read-TextFile $imagePath).Trim()
    if ($image -notmatch '^\S+:(?<tag>[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$' -or $image.Contains('@') -or $image -match '(?i):latest$') {
        throw (Get-DvMessage 'docker-app/IMAGE 必须指定明确的 IMAGE:TAG，且不能使用 latest。' 'docker-app/IMAGE must specify an explicit IMAGE:TAG other than latest.')
    }
    return $image
}

function Assert-DatabaseConfigReferences {
    param([string] $ApplicationConfig)
    foreach ($variable in @('${DB_HOST}', '${DB_PORT:3306}', '${DB_USER}', '${DB_PASSWORD}')) {
        if (-not $ApplicationConfig.Contains($variable)) { throw (Get-DvMessage "config/application.yml 缺少数据库变量引用 '$variable'；脚本不会修改此文件。" "config/application.yml is missing the database variable reference '$variable'; the file was not modified.") }
    }
    if (-not $ApplicationConfig.Contains('${DB_NAME}')) {
        throw (Get-DvMessage "config/application.yml 缺少数据库变量引用 'DB_NAME'；脚本不会修改此文件。" "config/application.yml is missing the DB_NAME reference; the file was not modified.")
    }
}

function Assert-PackageFiles {
    $required = @(
        (Join-Path $script:AppDir 'PLATFORM'), (Join-Path $script:AppDir '.env.example'), $script:ComposePath,
        (Join-Path $script:Root 'config\application.yml')
    )
    foreach ($path in $required) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw (Get-DvMessage "Docker app 发布包缺少文件：'$path'。" "Docker app package is missing '$path'.") } }
    $image = Get-PackageImage
    $platform = (Read-TextFile (Join-Path $script:AppDir 'PLATFORM')).Trim()
    if ($platform -notin @('linux/amd64', 'linux/arm64')) { throw (Get-DvMessage "不支持发布包平台 '$platform'；仅支持 linux/amd64 或 linux/arm64。" "Unsupported package platform '$platform'; only linux/amd64 and linux/arm64 are supported.") }
    $applicationConfig = Read-TextFile (Join-Path $script:Root 'config\application.yml')
    Assert-DatabaseConfigReferences -ApplicationConfig $applicationConfig
    return [pscustomobject]@{ Image = $image; Platform = $platform }
}

function Update-ManagedEnvNames {
    param([string] $Text)
    $names = New-Object System.Collections.ArrayList
    foreach ($match in [regex]::Matches($Text, '(?m)^[\t ]*(?:export[\t ]+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)(?=[\t ]*(?:=|#|\r?$))')) {
        $key = $match.Groups['key'].Value
        if ($key -match '^(?i:DOCKER_)' -or $key -match '^(?i:HOME|USERPROFILE|HOMEDRIVE|HOMEPATH)$') {
            throw (Get-DvMessage ".env 中 '$key' 是 Docker 客户端连接或配置目录保留变量，必须在启动环境中设置，不能作为部署参数。" "'$key' in .env is reserved for Docker client connection or configuration; set it in the launch environment instead.")
        }
        if (-not $names.Contains($key)) { [void]$names.Add($key) }
    }
    $script:ManagedEnvNames = [string[]]$names.ToArray()
}

function ConvertTo-WindowsArgument {
    param([string] $Value)
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $slashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            [void]$builder.Append(('\' * (2 * $slashes + 1)))
            [void]$builder.Append('"')
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) { [void]$builder.Append(('\' * $slashes)); $slashes = 0 }
        [void]$builder.Append($character)
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * (2 * $slashes))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Resolve-DockerExecutable {
    if ([System.IO.Path]::IsPathRooted($script:DockerExecutable)) { return $script:DockerExecutable }
    $command = Get-Command -Name $script:DockerExecutable -CommandType Application -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $command -or [string]::IsNullOrWhiteSpace([string]$command.Path)) { throw (Get-DvMessage '无法解析 Docker CLI 的绝对路径。' 'Cannot resolve the absolute Docker CLI path.') }
    return [string]$command.Path
}

function Invoke-DockerWithInput {
    param([string[]] $DockerArgs, [string] $InputText)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Resolve-DockerExecutable
    $startInfo.Arguments = [string]::Join(' ', [string[]]@($DockerArgs | ForEach-Object { ConvertTo-WindowsArgument ([string]$_) }))
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $startInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
    $managed = @{}
    foreach ($item in Get-ChildItem Env:) {
        if ($item.Name -match '^(?i:COMPOSE_|DATAVISOOL_|DB_|APP_)' -or $item.Name -ceq 'JAVA_TOOL_OPTIONS' -or $script:ManagedEnvNames -contains $item.Name) {
            $managed[$item.Name] = $true
        }
    }
    foreach ($name in $managed.Keys) { [void]$startInfo.EnvironmentVariables.Remove([string]$name) }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw (Get-DvMessage '无法启动 Docker CLI。' 'Cannot start Docker CLI.') }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $inputBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($InputText)
        $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
        $process.StandardInput.BaseStream.Flush()
        $process.StandardInput.Close()
        $process.WaitForExit()
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        if ($process.ExitCode -ne 0) { throw (Get-DvMessage "Docker Compose 配置解析失败（退出码 $($process.ExitCode)）；为避免泄露配置值，已隐藏命令输出。" "Docker Compose configuration parsing failed (exit code $($process.ExitCode)); output is hidden to protect configuration values.") }
        return $stdout
    }
    finally { $process.Dispose() }
}

function Get-ComposeEnvironment {
    param([string] $EnvFile)
    Update-ManagedEnvNames -Text (Read-TextFile $EnvFile)
    $minimalConfig = @'
services:
  app:
    image: scratch
    environment:
      DATAVISOOL_IMAGE: "${DATAVISOOL_IMAGE:-}"
      DATAVISOOL_PROJECT_NAME: "${DATAVISOOL_PROJECT_NAME:-datavisool-web-app}"
      APP_BIND_ADDRESS: "${APP_BIND_ADDRESS:-0.0.0.0}"
      APP_PORT: "${APP_PORT:-8080}"
      APP_UID: "${APP_UID:-10001}"
      APP_GID: "${APP_GID:-10001}"
      DB_HOST: "${DB_HOST:-host.docker.internal}"
      DB_PORT: "${DB_PORT:-3306}"
      DB_NAME: "${DB_NAME:-}"
      DB_USER: "${DB_USER:-}"
      DB_PASSWORD: "${DB_PASSWORD:-}"
      JAVA_TOOL_OPTIONS: "${JAVA_TOOL_OPTIONS:--XX:MaxRAMPercentage=75.0 -Duser.timezone=Asia/Shanghai}"
'@
    $arguments = @('compose', '-p', 'datavisool-env-probe', '--project-directory', $script:Root, '--env-file', $EnvFile, '-f', '-', 'config', '--format', 'json')
    $output = Invoke-DockerWithInput -DockerArgs $arguments -InputText $minimalConfig
    try { $config = ConvertFrom-Json -InputObject $output -ErrorAction Stop }
    catch { throw (Get-DvMessage 'Docker Compose 返回了无效的 JSON 配置；为避免泄露配置值，已隐藏原始输出。' 'Docker Compose returned invalid JSON; output is hidden to protect configuration values.') }
    if ($null -eq $config -or $config -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $servicesProperty = $config.PSObject.Properties['services']
    if ($null -eq $servicesProperty -or $servicesProperty.Value -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $appProperty = $servicesProperty.Value.PSObject.Properties['app']
    if ($null -eq $appProperty -or $appProperty.Value -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $environmentProperty = $appProperty.Value.PSObject.Properties['environment']
    if ($null -eq $environmentProperty -or $environmentProperty.Value -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $environment = $environmentProperty.Value
    $values = @{}
    foreach ($key in @('DATAVISOOL_PROJECT_NAME', 'DATAVISOOL_IMAGE', 'APP_BIND_ADDRESS', 'APP_PORT', 'APP_UID', 'APP_GID', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS')) {
        $property = $environment.PSObject.Properties[$key]
        if ($null -eq $property -or $property.Value -isnot [string]) { throw (Get-DvMessage "Docker Compose JSON 配置缺少字符串环境变量 '$key'；原始输出已隐藏。" "Docker Compose JSON is missing string environment variable '$key'; output is hidden.") }
        # Compose doubles dollars when serializing config JSON; collapse one escape layer.
        $values[$key] = ([string]$property.Value).Replace('$$', '$')
    }
    return $values
}

function Get-ProjectName {
    $paths = Get-IdentityPaths
    $hasProject = Test-Path -LiteralPath $paths.Project -PathType Leaf
    $hasRoot = Test-Path -LiteralPath $paths.Root -PathType Leaf
    if ($hasProject -xor $hasRoot) { throw (Get-DvMessage 'run/project.name 与 run/deployment.root 不完整；为避免误操作，没有继续。' 'run/project.name or run/deployment.root is incomplete; operation stopped.') }
    $savedProject = $null
    if ($hasProject) {
        $savedProject = Read-OneLine $paths.Project
        $savedRoot = Read-OneLine $paths.Root
        if (-not (Test-ProjectName $savedProject) -or -not (Test-SamePath $savedRoot $script:Root)) {
            throw (Get-DvMessage '部署身份记录不属于此解压目录；为避免误操作，没有继续。' 'The deployment identity belongs to another directory; operation stopped.')
        }
    }
    $hasExistingEnv = Test-Path -LiteralPath $script:EnvPath -PathType Leaf
    $envFile = if ($hasExistingEnv) { $script:EnvPath } else { Join-Path $script:AppDir '.env.example' }
    $effective = Get-ComposeEnvironment -EnvFile $envFile
    $configured = [string]$effective['DATAVISOOL_PROJECT_NAME']
    if ($hasProject) {
        $document = Get-EnvDocument -Text (Read-TextFile $envFile)
        if ($hasExistingEnv -and $document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME') -and $configured -cne $savedProject) {
            throw (Get-DvMessage 'run/project.name 与 .env 中的 DATAVISOOL_PROJECT_NAME 不一致；为避免操作其他项目，没有继续。' 'run/project.name differs from DATAVISOOL_PROJECT_NAME in .env; operation stopped.')
        }
        return $savedProject
    }
    if ([string]::IsNullOrWhiteSpace($configured) -or $configured -ceq 'datavisool-web-app') { $configured = Get-GeneratedProjectName }
    if (-not (Test-ProjectName $configured)) { throw (Get-DvMessage '.env 中 DATAVISOOL_PROJECT_NAME 不是有效的 Docker Compose 项目名。' 'DATAVISOOL_PROJECT_NAME in .env is not a valid Docker Compose project name.') }
    return $configured
}

function Invoke-Docker {
    param([string[]] $DockerArgs, [switch] $Capture, [switch] $AllowFailure, [switch] $RedactFailure)
    $dockerExecutable = Resolve-DockerExecutable
    $saved = @{}
    $toClear = New-Object System.Collections.ArrayList
    foreach ($item in Get-ChildItem Env:) {
        if ($item.Name -match '^(?i:COMPOSE_|DATAVISOOL_|DB_|APP_)' -or $item.Name -ceq 'JAVA_TOOL_OPTIONS' -or $script:ManagedEnvNames -contains $item.Name) {
            if (-not $toClear.Contains($item.Name)) { [void]$toClear.Add($item.Name) }
        }
    }
    foreach ($name in $toClear) {
        $saved[$name] = [System.Environment]::GetEnvironmentVariable([string]$name, 'Process')
        [System.Environment]::SetEnvironmentVariable([string]$name, $null, 'Process')
    }
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($Capture) {
            $output = @(& $dockerExecutable @DockerArgs 2>&1 | ForEach-Object { [string]$_ })
            $code = $LASTEXITCODE
            $text = [string]::Join("`n", [string[]]$output)
            if ($code -ne 0 -and -not $AllowFailure) {
                if ($RedactFailure) { throw (Get-DvMessage "Docker 命令失败（退出码 $code）；为避免泄露配置值，已隐藏命令输出。" "Docker command failed (exit code $code); output is hidden to protect configuration values.") }
                throw (Get-DvMessage "Docker 命令失败（退出码 $code）：docker $($DockerArgs -join ' ')`n$text" "Docker command failed (exit code $code): docker $($DockerArgs -join ' ')`n$text")
            }
            return [pscustomobject]@{ ExitCode = $code; Text = $text }
        }
        & $dockerExecutable @DockerArgs 2>&1 | Out-Host
        $code = $LASTEXITCODE
        if ($code -ne 0) { throw (Get-DvMessage "Docker 命令失败（退出码 $code）：docker $($DockerArgs -join ' ')" "Docker command failed (exit code $code): docker $($DockerArgs -join ' ')") }
        return [pscustomobject]@{ ExitCode = 0; Text = '' }
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        foreach ($name in $saved.Keys) {
            if ($null -eq $saved[$name]) { [System.Environment]::SetEnvironmentVariable([string]$name, $null, 'Process') }
            else { [System.Environment]::SetEnvironmentVariable([string]$name, [string]$saved[$name], 'Process') }
        }
    }
}

function Get-DockerEndpoint {
    $contextVariable = [System.Environment]::GetEnvironmentVariable('DOCKER_CONTEXT', 'Process')
    $hostVariable = [System.Environment]::GetEnvironmentVariable('DOCKER_HOST', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($contextVariable)) {
        $result = Invoke-Docker -DockerArgs @('context', 'inspect', $contextVariable, '--format', '{{.Endpoints.docker.Host}}') -Capture
    }
    elseif (-not [string]::IsNullOrWhiteSpace($hostVariable)) { $result = [pscustomobject]@{ Text = $hostVariable.Trim(); ExitCode = 0 } }
    else {
        $selected = Invoke-Docker -DockerArgs @('context', 'show') -Capture
        $context = $selected.Text.Trim()
        if ([string]::IsNullOrWhiteSpace($context)) { throw (Get-DvMessage '无法读取当前 Docker context。' 'Cannot read the current Docker context.') }
        $result = Invoke-Docker -DockerArgs @('context', 'inspect', $context, '--format', '{{.Endpoints.docker.Host}}') -Capture
    }
    $endpoint = $result.Text.Trim()
    if ($endpoint -notmatch '^(?i:npipe://|unix://)') {
        throw (Get-DvMessage "Docker endpoint '$endpoint' 不是支持的本机 endpoint；此启动脚本只管理本机 Docker 引擎。" "Docker endpoint '$endpoint' is not a supported local endpoint; this launcher manages only a local Docker engine.")
    }
    return $endpoint
}

function Assert-DockerEngine {
    param([bool] $RequireCompose, [string] $ExpectedPlatform)
    $endpoint = Get-DockerEndpoint
    $info = Invoke-Docker -DockerArgs @('info', '--format', '{{.OSType}}|{{.Architecture}}') -Capture
    $parts = $info.Text.Trim().Split('|')
    if ($parts.Length -ne 2 -or $parts[0].Trim() -cne 'linux') { throw (Get-DvMessage 'Docker 必须使用 Linux 容器引擎；当前引擎不可用或不是 Linux。' 'Docker must use a Linux container engine; the current engine is unavailable or not Linux.') }
    $architecture = $parts[1].Trim().ToLowerInvariant()
    if ($architecture -in @('x86_64', 'x86-64', 'amd64')) { $architecture = 'amd64' }
    elseif ($architecture -in @('aarch64', 'arm64')) { $architecture = 'arm64' }
    else { throw (Get-DvMessage "Docker 引擎报告了不支持的架构 '$($parts[1].Trim())'。" "Docker engine reports unsupported architecture '$($parts[1].Trim())'.") }
    if ($ExpectedPlatform -and $ExpectedPlatform.Split('/')[1] -cne $architecture) {
        throw (Get-DvMessage "发布包平台是 '$ExpectedPlatform'，但本机 Docker Linux 引擎是 '$architecture'；请使用架构匹配的发布包。" "Package platform '$ExpectedPlatform' does not match Docker engine architecture '$architecture'; use a matching package.")
    }
    if ($RequireCompose) {
        $compose = Invoke-Docker -DockerArgs @('compose', 'version', '--short') -Capture
        if ($compose.Text -notmatch '(?i)(?:^|\s)v?(?<major>\d+)\.(?<minor>\d+)(?:\.(?<patch>\d+))?') { throw (Get-DvMessage "无法识别 Docker Compose 版本：$($compose.Text)" "Cannot identify Docker Compose version: $($compose.Text)") }
        $major = [int]$Matches['major']; $minor = [int]$Matches['minor']
        if ($major -lt 2 -or ($major -eq 2 -and $minor -lt 20)) { throw (Get-DvMessage "需要 Docker Compose v2.20 或更高版本；当前版本是 $($compose.Text.Trim())。" "Docker Compose v2.20 or later is required; current version: $($compose.Text.Trim()).") }
    }
    return [pscustomobject]@{ Architecture = $architecture; Endpoint = $endpoint }
}

function Acquire-LauncherLock {
    $paths = Get-IdentityPaths
    $script:CreatedRunDirForLock = -not (Test-Path -LiteralPath $script:RunDir -PathType Container)
    if ($script:CreatedRunDirForLock) { [void][System.IO.Directory]::CreateDirectory($script:RunDir) }
    $script:CreatedLockForOperation = -not (Test-Path -LiteralPath $paths.Lock -PathType Leaf)
    try { return [System.IO.File]::Open($paths.Lock, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None) }
    catch { throw (Get-DvMessage '另一个 Docker 部署操作正在执行；请等待它完成后再试。' 'Another Docker deployment operation is running; wait for it to finish and retry.') }
}

function Remove-CancelArtifacts {
    if (-not $script:PromptCancelled) { return }
    $paths = Get-IdentityPaths
    if ($script:CreatedLockForOperation -and (Test-Path -LiteralPath $paths.Lock -PathType Leaf)) {
        try {
            $stream = [System.IO.File]::Open($paths.Lock, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            $stream.Dispose()
            [System.IO.File]::Delete($paths.Lock)
        }
        catch { }
    }
    if ($script:CreatedRunDirForLock -and (Test-Path -LiteralPath $script:RunDir -PathType Container)) {
        try {
            if ([System.IO.Directory]::GetFileSystemEntries($script:RunDir).Length -eq 0) { [System.IO.Directory]::Delete($script:RunDir) }
        }
        catch { }
    }
}

function Ensure-ModeMarker {
    if (Test-Path -LiteralPath $script:ExpectedModePath -PathType Leaf) {
        if ((Read-OneLine $script:ExpectedModePath) -cne $script:ModeMarker) { throw (Get-DvMessage "包根目录标记文件 '$($script:ExpectedModePath)' 已属于另一种部署方式。" "Package marker '$($script:ExpectedModePath)' belongs to another deployment type.") }
    }
    else { [void](Write-AtomicTextFile -Path $script:ExpectedModePath -Text ($script:ModeMarker + "`n")) }
}

function Ensure-DeploymentIdentity {
    param([string] $ProjectName, [string] $Endpoint)
    $paths = Get-IdentityPaths
    $exists = Assert-StoredIdentity -Paths $paths -ProjectName $ProjectName -AllowAbsent
    if (-not $exists) {
        [void](Write-AtomicTextFile -Path $paths.Project -Text ($ProjectName + "`n"))
        [void](Write-AtomicTextFile -Path $paths.Root -Text ((Get-CanonicalPath $script:Root) + "`n"))
    }
    $savedEndpoint = Read-OneLine $paths.Endpoint
    if ($savedEndpoint -and $savedEndpoint -cne $Endpoint) { throw (Get-DvMessage '当前 Docker endpoint 与 run/docker.endpoint 记录不一致；为避免操作另一套 Docker 引擎，没有继续。' 'The current Docker endpoint differs from run/docker.endpoint; operation stopped.') }
    if (-not $savedEndpoint) { [void](Write-AtomicTextFile -Path $paths.Endpoint -Text ($Endpoint + "`n")) }
    return $paths
}

function Assert-EndpointIdentity {
    param([pscustomobject] $Paths, [string] $Endpoint)
    $saved = Read-OneLine $Paths.Endpoint
    if ([string]::IsNullOrWhiteSpace($saved)) { throw (Get-DvMessage 'run/docker.endpoint 缺失；为避免操作另一套 Docker 引擎，没有继续。' 'run/docker.endpoint is missing; operation stopped.') }
    if ($saved -cne $Endpoint) { throw (Get-DvMessage '当前 Docker endpoint 与部署记录不一致；没有操作容器。' 'The Docker endpoint differs from the deployment record; no containers were modified.') }
}

function Get-Containers {
    param([string] $ProjectName, [string] $ExpectedImage)
    $list = Invoke-Docker -DockerArgs @('ps', '--all', '--filter', "label=com.docker.compose.project=$ProjectName", '--format', '{{.ID}}') -Capture
    $items = New-Object System.Collections.ArrayList
    foreach ($id in ($list.Text -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        $id = $id.Trim()
        $inspection = Invoke-Docker -DockerArgs @('inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Config.Image}}|{{range (index .NetworkSettings.Ports "8080/tcp")}}{{.HostIp}}:{{.HostPort}} {{end}}', $id) -Capture
        $fields = $inspection.Text.TrimEnd() -split '\|', 7
        if ($fields.Length -lt 6) { throw (Get-DvMessage "无法验证容器 '$id' 的部署标签；没有操作该容器。" "Cannot verify deployment labels for container '$id'; it was not modified.") }
        if ($fields[0] -cne $ProjectName -or $fields[1] -cne 'app' -or -not (Test-SamePath $fields[2] $script:Root)) {
            throw (Get-DvMessage "发现容器 '$id' 使用同一 Compose 项目名，但其 service 或工作目录不属于此解压目录；为避免误操作，没有继续。" "Container '$id' shares the Compose project name but its service or directory does not belong to this deployment; operation stopped.")
        }
        if ($fields[5] -cne $ExpectedImage) { throw (Get-DvMessage "容器 '$id' 使用镜像 '$($fields[5])'，与发布包指定镜像不一致；没有停止或重建容器。" "Container '$id' uses image '$($fields[5])', not the package image; it was not stopped or recreated.") }
        [void]$items.Add([pscustomobject]@{ Id = $id; State = $fields[3]; Health = $fields[4]; Image = $fields[5]; Ports = if ($fields.Length -ge 7) { $fields[6].Trim() } else { '' } })
    }
    if ($items.Count -gt 1) { throw (Get-DvMessage '发现多个属于此部署目录的 app 容器；为避免选择错误实例，没有继续。' 'Multiple app containers belong to this deployment directory; operation stopped.') }
    return [object[]]$items.ToArray()
}

function Select-Container {
    param([object[]] $Containers, [pscustomobject] $Paths)
    if ($Containers.Count -gt 1) { throw (Get-DvMessage '发现多个属于此部署目录的 app 容器；为避免选择错误实例，没有继续。' 'Multiple app containers belong to this deployment directory; operation stopped.') }
    if ($Containers.Count -eq 1) { return $Containers[0] }
    $savedId = Read-OneLine $Paths.Container
    return $null
}

function Invoke-Status {
    param([object[]] $Containers)
    if ($Containers.Count -eq 0) { Write-Host (Get-DvMessage '此部署目录尚无应用容器。' 'This deployment directory has no application container.'); return 3 }
    foreach ($container in $Containers) {
        Write-Host (Get-DvMessage "容器 $($container.Id)：状态=$($container.State)，健康=$($container.Health)" "Container $($container.Id): state=$($container.State), health=$($container.Health)")
        if ($container.Ports) { Write-Host (Get-DvMessage "端口：$($container.Ports)" "Ports: $($container.Ports)") }
    }
    return 0
}

function Invoke-Stop {
    param([object[]] $Containers, [pscustomobject] $Paths)
    $container = Select-Container -Containers $Containers -Paths $Paths
    if ($null -eq $container) { Write-Host (Get-DvMessage '此部署目录没有应用容器。' 'This deployment directory has no application container.'); return 0 }
    if ($container.State -in @('exited', 'created', 'dead')) { Write-Host (Get-DvMessage "应用容器已停止（状态=$($container.State)）。" "Application container is stopped (state=$($container.State))."); return 0 }
    if ($container.State -notin @('running', 'paused', 'restarting')) { throw (Get-DvMessage "容器状态为 '$($container.State)'，无法确认安全停止；没有执行停止操作。" "Cannot safely stop container in state '$($container.State)'; no stop was attempted.") }
    Write-Host (Get-DvMessage "正在停止应用容器 $($container.Id)（最多等待 60 秒）……" "Stopping application container $($container.Id) (waiting up to 60 seconds)...")
    [void](Invoke-Docker -DockerArgs @('stop', '--time', '60', $container.Id))
    $inspection = Invoke-Docker -DockerArgs @('inspect', '--format', '{{.State.Status}}', $container.Id) -Capture
    if ($inspection.Text.Trim() -notin @('exited', 'created', 'dead')) { throw (Get-DvMessage "Docker 已接受停止请求，但容器状态为 '$($inspection.Text.Trim())'；保留容器记录，请稍后重试。" "Docker accepted the stop request, but container state is '$($inspection.Text.Trim())'; its record was retained. Retry later.") }
    Write-Host (Get-DvMessage '应用容器已停止，容器和宿主机数据均已保留。' 'Application container stopped; container and host data were retained.')
    return 0
}

function Invoke-Logs {
    param([object[]] $Containers, [pscustomobject] $Paths)
    $container = Select-Container -Containers $Containers -Paths $Paths
    if ($null -eq $container) { Write-Host (Get-DvMessage '此部署目录尚无应用容器，无法查看日志。' 'No application container exists in this directory; logs are unavailable.'); return 3 }
    [void](Invoke-Docker -DockerArgs @('logs', '--follow', '--tail', '200', $container.Id))
    return 0
}

function Get-ControlIdentity {
    $paths = Get-IdentityPaths
    $hasProject = Test-Path -LiteralPath $paths.Project -PathType Leaf
    $hasRoot = Test-Path -LiteralPath $paths.Root -PathType Leaf
    if (-not $hasProject -and -not $hasRoot) { return $null }
    if (-not $hasProject -or -not $hasRoot) { throw (Get-DvMessage 'run/project.name 与 run/deployment.root 不完整；为避免误操作，没有继续。' 'run/project.name or run/deployment.root is incomplete; operation stopped.') }
    $project = Read-OneLine $paths.Project
    $root = Read-OneLine $paths.Root
    if (-not (Test-ProjectName $project) -or -not (Test-SamePath $root $script:Root)) { throw (Get-DvMessage '部署身份记录不属于此解压目录；没有操作容器。' 'The deployment identity belongs to another directory; no containers were modified.') }
    return [pscustomobject]@{ Project = $project; Image = (Get-PackageImage); Paths = $paths }
}

function Get-RequiredDatabaseValues {
    param([pscustomobject] $Document, [hashtable] $ComposeValues, [bool] $Interactive)
    $required = @('DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD')
    $values = @{}
    $missing = New-Object System.Collections.ArrayList
    foreach ($key in $required) {
        $value = if ($ComposeValues.ContainsKey($key)) { [string]$ComposeValues[$key] } else { '' }
        if ([string]::IsNullOrWhiteSpace($value)) { [void]$missing.Add($key) }
        else { $values[$key] = $value }
    }
    if (-not $Interactive) {
        if ($missing.Count -gt 0) { throw (Get-DvMessage "数据库配置缺少或未解析：$([string]::Join(', ', [string[]]$missing.ToArray()))。检查模式不会询问或修改文件；运行 deploy_windows.cmd 补齐。" "Missing or unresolved database settings: $([string]::Join(', ', [string[]]$missing.ToArray())). Check mode does not prompt or modify files; run deploy_windows.cmd to complete setup.") }
    }
    else {
        if ([Console]::IsInputRedirected -and $missing.Count -gt 0) { $script:PromptCancelled = $true; throw (Get-DvMessage "需要交互补齐数据库配置（$([string]::Join(', ', [string[]]$missing.ToArray()))），但当前终端没有可用输入。" "Database settings require interactive input ($([string]::Join(', ', [string[]]$missing.ToArray()))), but terminal input is unavailable.") }
        foreach ($key in $missing) {
            while ($true) {
                if ($key -ceq 'DB_PASSWORD') {
                    try { $secure = Read-Host -Prompt (Get-DvMessage 'MySQL 密码（直接回车取消）' 'MySQL password (press Enter to cancel)') -AsSecureString }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                    $ptr = [IntPtr]::Zero
                    try { $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
                    finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; if ($null -ne $secure) { $secure.Dispose() } }
                }
                elseif ($key -ceq 'DB_HOST') {
                    try { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 主机（容器可访问的地址，直接回车取消）' 'MySQL host (reachable from the container; press Enter to cancel)') }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                }
                elseif ($key -ceq 'DB_PORT') {
                    try { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 端口（例如 3306，直接回车取消）' 'MySQL port (for example 3306; press Enter to cancel)') }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                }
                elseif ($key -ceq 'DB_NAME') {
                    try { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 数据库名称（直接回车取消）' 'MySQL database name (press Enter to cancel)') }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                }
                else {
                    try { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 用户名（直接回车取消）' 'MySQL username (press Enter to cancel)') }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                }
                if ([string]::IsNullOrWhiteSpace($value)) { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                if ($value -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { Write-Host (Get-DvMessage '此项不能包含换行或控制字符，请重新输入。' 'This value cannot contain newlines or control characters. Try again.') -ForegroundColor Yellow; continue }
                if ($key -ceq 'DB_PORT' -and ($value -notmatch '^[0-9]{1,5}$' -or [int]$value -lt 1 -or [int]$value -gt 65535)) { Write-Host (Get-DvMessage '端口必须是 1 到 65535 的正整数。' 'Port must be an integer from 1 to 65535.') -ForegroundColor Yellow; continue }
                if ($key -ceq 'DB_NAME' -and $value -notmatch '^[A-Za-z0-9_$-]{1,64}$') { Write-Host (Get-DvMessage '数据库名称只能包含字母、数字、下划线、连字符或美元符号，长度不超过 64。' 'Database name must be at most 64 letters, digits, underscores, hyphens or dollar signs.') -ForegroundColor Yellow; continue }
                $values[$key] = [string]$value
                break
            }
        }
    }
    if ($values['DB_PORT'] -notmatch '^[0-9]{1,5}$' -or [int]$values['DB_PORT'] -lt 1 -or [int]$values['DB_PORT'] -gt 65535) {
        throw (Get-DvMessage '.env 中 DB_PORT 必须是 1 到 65535 的正整数。' 'DB_PORT in .env must be an integer from 1 to 65535.')
    }
    if ($values['DB_NAME'] -notmatch '^[A-Za-z0-9_$-]{1,64}$') { throw (Get-DvMessage '.env 中 DB_NAME 必须是长度不超过 64 的数据库名称。' 'DB_NAME in .env must be a database name of at most 64 characters.') }
    foreach ($key in $required) {
        if ([string]$values[$key] -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { throw (Get-DvMessage ".env 中 '$key' 含换行或控制字符。" "'$key' in .env contains newlines or control characters.") }
    }
    return $values
}

function New-PreparedEnv {
    param([string] $Image, [string] $ProjectName, [bool] $Interactive)
    $hasExistingEnv = Test-Path -LiteralPath $script:EnvPath -PathType Leaf
    $sourceText = if ($hasExistingEnv) { Read-TextFile $script:EnvPath } else { Read-TextFile (Join-Path $script:AppDir '.env.example') }
    Update-ManagedEnvNames -Text $sourceText
    $document = Get-EnvDocument -Text $sourceText
    $envSourcePath = if ($hasExistingEnv) { $script:EnvPath } else { Join-Path $script:AppDir '.env.example' }
    $effective = Get-ComposeEnvironment -EnvFile $envSourcePath
    $db = Get-RequiredDatabaseValues -Document $document -ComposeValues $effective -Interactive:$Interactive
    $configuredImage = [string]$effective['DATAVISOOL_IMAGE']
    if ($hasExistingEnv -and -not [string]::IsNullOrWhiteSpace($configuredImage) -and $configuredImage -cne $Image) {
        throw (Get-DvMessage ".env 中 DATAVISOOL_IMAGE='$configuredImage' 与发布包指定镜像不一致；启动器不会切换或升级镜像。" "DATAVISOOL_IMAGE='$configuredImage' differs from the package image; the launcher will not switch or upgrade it.")
    }
    if (-not $hasExistingEnv -or -not $document.Entries.ContainsKey('DATAVISOOL_IMAGE') -or [string]::IsNullOrWhiteSpace($configuredImage)) {
        Set-EnvDocumentValue -Document $document -Key 'DATAVISOOL_IMAGE' -Value $Image
    }
    $configuredProject = [string]$effective['DATAVISOOL_PROJECT_NAME']
    if ($hasExistingEnv -and -not [string]::IsNullOrWhiteSpace($configuredProject) -and $configuredProject -cne 'datavisool-web-app' -and $configuredProject -cne $ProjectName) {
        throw (Get-DvMessage '.env 中 DATAVISOOL_PROJECT_NAME 与部署身份不一致；没有修改现有配置。' 'DATAVISOOL_PROJECT_NAME in .env differs from the deployment identity; configuration was not modified.')
    }
    if (-not $document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME') -or [string]::IsNullOrWhiteSpace($configuredProject) -or $configuredProject -ceq 'datavisool-web-app' -or $configuredProject -cne $ProjectName) {
        Set-EnvDocumentValue -Document $document -Key 'DATAVISOOL_PROJECT_NAME' -Value $ProjectName
    }
    foreach ($key in @('DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD')) {
        $effectiveValue = if ($effective.ContainsKey($key)) { [string]$effective[$key] } else { '' }
        $isMissing = -not (Test-EnvDocumentHasValue -Document $document -Key $key) -or [string]::IsNullOrWhiteSpace($effectiveValue)
        if ($isMissing) { Set-EnvDocumentValue -Document $document -Key $key -Value $db[$key] -Quote:$true }
    }
    $appPort = [string]$effective['APP_PORT']
    return [pscustomobject]@{ Text = $document.Text; Values = @{ APP_PORT = $appPort } }
}

function Assert-ExpectedEnv {
    param([string] $Image, [string] $ProjectName, [bool] $RequireDatabase)
    if (-not (Test-Path -LiteralPath $script:EnvPath -PathType Leaf)) { throw (Get-DvMessage "缺少包根目录 .env；检查模式不会生成它。请运行 deploy_windows.cmd 完成首次配置。" "Package root .env is missing; check mode does not create it. Run deploy_windows.cmd for initial setup.") }
    $text = Read-TextFile $script:EnvPath
    Update-ManagedEnvNames -Text $text
    $document = Get-EnvDocument -Text $text
    $effective = Get-ComposeEnvironment -EnvFile $script:EnvPath
    if (-not $effective.ContainsKey('DATAVISOOL_IMAGE') -or [string]$effective['DATAVISOOL_IMAGE'] -cne $Image) { throw (Get-DvMessage '.env 中 DATAVISOOL_IMAGE 必须与发布包指定镜像一致；检查模式不会修改文件。' 'DATAVISOOL_IMAGE in .env must match the package image; check mode does not modify files.') }
    $configuredProject = [string]$effective['DATAVISOOL_PROJECT_NAME']
    $projectMissing = -not $document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME')
    $defaultProjectIsExpected = $configuredProject -ceq 'datavisool-web-app' -and $ProjectName -ceq (Get-GeneratedProjectName)
    if ($configuredProject -cne $ProjectName -and -not $projectMissing -and -not $defaultProjectIsExpected) { throw (Get-DvMessage '.env 中 DATAVISOOL_PROJECT_NAME 必须与部署身份一致；检查模式不会修改文件。' 'DATAVISOOL_PROJECT_NAME in .env must match the deployment identity; check mode does not modify files.') }
    if ($RequireDatabase) { [void](Get-RequiredDatabaseValues -Document $document -ComposeValues $effective -Interactive:$false) }
    return $document
}

function Invoke-Compose {
    param([string] $ProjectName, [string[]] $ComposeArgs, [switch] $Capture, [switch] $AllowFailure)
    $arguments = @('compose', '--project-directory', $script:Root, '--env-file', $script:EnvPath,
        '-f', $script:ComposePath, '-p', $ProjectName) + $ComposeArgs
    $result = Invoke-Docker -DockerArgs $arguments -Capture -AllowFailure -RedactFailure
    if ($result.ExitCode -ne 0 -and -not $AllowFailure) { throw (Get-DvMessage "Docker Compose 命令失败（退出码 $($result.ExitCode)）；为避免泄露配置值，已隐藏命令输出。" "Docker Compose failed (exit code $($result.ExitCode)); output is hidden to protect configuration values.") }
    if ($Capture) { return $result }
    return [pscustomobject]@{ ExitCode = $result.ExitCode; Text = '' }
}

function Test-LocalImage {
    param([string] $Image, [string] $ExpectedPlatform)
    $result = Invoke-Docker -DockerArgs @('image', 'inspect', '--format', '{{.Os}}|{{.Architecture}}', $Image) -Capture -AllowFailure
    if ($result.ExitCode -ne 0) { return $false }
    $parts = $result.Text.Trim().Split('|')
    if ($parts.Length -ne 2) { throw (Get-DvMessage "无法读取本机镜像 '$Image' 的操作系统和架构。" "Cannot read the operating system and architecture of local image '$Image'.") }
    $os = $parts[0].Trim().ToLowerInvariant()
    $architecture = $parts[1].Trim().ToLowerInvariant()
    if ($architecture -in @('x86_64', 'x86-64')) { $architecture = 'amd64' }
    elseif ($architecture -ceq 'aarch64') { $architecture = 'arm64' }
    if ($os -cne 'linux' -or $ExpectedPlatform.Split('/')[1] -cne $architecture) {
        throw (Get-DvMessage "本机镜像 '$Image' 的平台是 '$os/$architecture'，与发布包 '$ExpectedPlatform' 不匹配。" "Local image '$Image' platform '$os/$architecture' does not match package platform '$ExpectedPlatform'.")
    }
    return $true
}

function Assert-ComposeConfig {
    param([string] $ProjectName, [string] $ExpectedImage)
    $result = Invoke-Compose -ProjectName $ProjectName -ComposeArgs @('config', '--format', 'json') -Capture
    try { $config = $result.Text | ConvertFrom-Json -ErrorAction Stop }
    catch { throw (Get-DvMessage '无法解析 Docker Compose 展开的配置；为避免泄露数据库凭据，已隐藏原始输出。' 'Cannot parse expanded Docker Compose configuration; output is hidden to protect database credentials.') }
    $services = @($config.services.PSObject.Properties)
    if ($services.Count -ne 1 -or $services[0].Name -cne 'app') { throw (Get-DvMessage 'Compose 展开后的服务必须且只能包含 app。' 'Expanded Compose configuration must contain only the app service.') }
    $app = $config.services.app
    if ([string]$app.image -cne $ExpectedImage) { throw (Get-DvMessage 'Compose 展开后的镜像与发布包指定镜像不一致。' 'Expanded Compose image differs from the package image.') }
    if ([string]$app.pull_policy -cne 'never') { throw (Get-DvMessage 'Compose 必须设置 pull_policy: never，避免拉取其他镜像。' 'Compose must set pull_policy: never to avoid pulling another image.') }
    $envValues = Get-ComposeEnvironment -EnvFile $script:EnvPath
    $uid = [string]$envValues['APP_UID']; $gid = [string]$envValues['APP_GID']
    if ($uid -notmatch '^[0-9]+$' -or $gid -notmatch '^[0-9]+$' -or [string]$app.user -cne ($uid + ':' + $gid)) {
        throw (Get-DvMessage 'Compose 展开后的容器 user 与 APP_UID/APP_GID 不一致。' 'Expanded Compose container user does not match APP_UID/APP_GID.')
    }
    $expectedVolumes = @(
        [pscustomobject]@{ Source = Join-Path $script:Root 'config\application.yml'; Target = '/config/application.yml'; ReadOnly = $true },
        [pscustomobject]@{ Source = Join-Path $script:Root 'resource'; Target = '/usr/app/resource'; ReadOnly = $false },
        [pscustomobject]@{ Source = Join-Path $script:Root 'logs'; Target = '/datavisool/server/logs'; ReadOnly = $false }
    )
    $volumes = @($app.volumes)
    if ($volumes.Count -ne $expectedVolumes.Count) { throw (Get-DvMessage 'Compose 展开后的挂载数量不符合 Docker app 的固定要求。' 'Expanded Compose mount count does not meet Docker app requirements.') }
    foreach ($expected in $expectedVolumes) {
        $matchingVolumes = @($volumes | Where-Object { [string]$_.target -ceq $expected.Target })
        if ($matchingVolumes.Count -ne 1) { throw (Get-DvMessage "Compose 缺少唯一挂载目标 '$($expected.Target)'。" "Compose is missing a unique mount target '$($expected.Target)'.") }
        $volume = $matchingVolumes[0]
        if ([string]$volume.type -cne 'bind' -or -not [System.IO.Path]::IsPathRooted([string]$volume.source) -or -not (Test-SamePath ([string]$volume.source) $expected.Source)) {
            throw (Get-DvMessage "Compose 挂载 '$($expected.Target)' 的宿主机路径不是此解压目录中的预期绝对路径。" "Compose mount '$($expected.Target)' does not use the expected absolute path in this deployment.")
        }
        if ([bool]$volume.read_only -ne $expected.ReadOnly) { throw (Get-DvMessage "Compose 挂载 '$($expected.Target)' 的只读属性不符合要求。" "Compose mount '$($expected.Target)' has an invalid read-only setting.") }
    }
}

function Ensure-MountDirectories {
    foreach ($name in @('resource', 'logs')) {
        $path = Join-Path $script:Root $name
        if (Test-Path -LiteralPath $path -PathType Leaf) { throw (Get-DvMessage "持久化挂载路径 '$path' 已存在且不是目录。" "Persistent mount path '$path' exists but is not a directory.") }
        [void][System.IO.Directory]::CreateDirectory($path)
    }
}

function Start-Application {
    param([pscustomobject] $Package, [pscustomobject] $Engine, [string] $ProjectName, [int] $Timeout, [bool] $Restarted)
    $paths = Get-IdentityPaths
    $previousIdentity = Assert-StoredIdentity -Paths $paths -ProjectName $ProjectName -AllowAbsent
    if ($previousIdentity) { Assert-EndpointIdentity -Paths $paths -Endpoint $Engine.Endpoint }
    $existing = @(Get-Containers -ProjectName $ProjectName -ExpectedImage $Package.Image)
    $running = @($existing | Where-Object { $_.State -ceq 'running' })
    if ($running.Count -eq 1) {
        if (Test-Path -LiteralPath $script:EnvPath -PathType Leaf) { Set-PrivateEnvFileAcl -Path $script:EnvPath }
        Ensure-ModeMarker
        if (-not $previousIdentity) { $paths = Ensure-DeploymentIdentity -ProjectName $ProjectName -Endpoint $Engine.Endpoint }
        $health = $running[0].Health
        Write-Host (Get-DvMessage "应用容器已在运行，ID=$($running[0].Id)，Docker 健康状态=$health；不会重建容器。" "Application container is already running, ID=$($running[0].Id), health=$health; it will not be recreated.")
        if ($running[0].Ports) { Write-Host (Get-DvMessage "端口：$($running[0].Ports)" "Ports: $($running[0].Ports)") }
        Write-Host (Get-DvMessage '查看日志：deploy_windows.cmd --logs' 'View logs: deploy_windows.cmd --logs')
        return
    }

    $prepared = New-PreparedEnv -Image $Package.Image -ProjectName $ProjectName -Interactive:$true
    Ensure-ModeMarker
    Ensure-MountDirectories
    if (-not (Test-LocalImage -Image $Package.Image -ExpectedPlatform $Package.Platform)) {
        $archive = Join-Path $script:Root 'image.tar'
        if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw (Get-DvMessage "本机缺少镜像 '$($Package.Image)'，发布包也缺少 '$archive'。" "Local image '$($Package.Image)' and package archive '$archive' are missing.") }
        Write-Host (Get-DvMessage "本机缺少指定镜像，正在从 '$archive' 导入……" "Required image is missing locally; importing from '$archive'...")
        [void](Invoke-Docker -DockerArgs @('load', '--input', $archive))
        if (-not (Test-LocalImage -Image $Package.Image -ExpectedPlatform $Package.Platform)) { throw (Get-DvMessage "image.tar 未包含平台匹配的发布包指定镜像 '$($Package.Image)'；没有拉取其他镜像。" "image.tar does not contain package image '$($Package.Image)' for this platform; no image was pulled.") }
    }
    $currentEnv = if (Test-Path -LiteralPath $script:EnvPath -PathType Leaf) { Read-TextFile $script:EnvPath } else { $null }
    if ($null -eq $currentEnv -or $currentEnv -cne $prepared.Text) {
        $backup = Write-AtomicTextFile -Path $script:EnvPath -Text ($prepared.Text.TrimEnd("`r", "`n") + "`n") -BackupExisting:($null -ne $currentEnv) -Private
        if ($backup) { Write-Host (Get-DvMessage ".env 更新前备份：'$backup'。" "Backup before .env update: '$backup'.") }
    }
    elseif ($null -ne $currentEnv) { Set-PrivateEnvFileAcl -Path $script:EnvPath }
    Ensure-ModeMarker
    $paths = Ensure-DeploymentIdentity -ProjectName $ProjectName -Endpoint $Engine.Endpoint
    Assert-ComposeConfig -ProjectName $ProjectName -ExpectedImage $Package.Image
    Write-Host (Get-DvMessage "正在启动应用容器并等待健康检查（最多 $Timeout 秒）……" "Starting application container and waiting for health checks (up to $Timeout seconds)...")
    try {
        [void](Invoke-Compose -ProjectName $ProjectName -ComposeArgs @('up', '--detach', '--wait', '--wait-timeout', [string]$Timeout, '--pull', 'never'))
        $containers = @(Get-Containers -ProjectName $ProjectName -ExpectedImage $Package.Image)
        $container = Select-Container -Containers $containers -Paths $paths
        if ($null -eq $container -or $container.State -cne 'running') { throw (Get-DvMessage 'Compose 命令完成，但没有找到归属于此部署目录的运行中 app 容器。' 'Compose completed, but no running app container belonging to this deployment was found.') }
        if ($container.Health -cne 'healthy') { throw (Get-DvMessage "容器未达到 healthy 状态（当前状态=$($container.Health)）。" "Container did not become healthy (current health=$($container.Health)).") }
        [void](Write-AtomicTextFile -Path $paths.Container -Text ($container.Id + "`n"))
    }
    catch {
        throw (Get-DvMessage "应用未通过健康检查或容器身份校验；容器已保留以供排查。查看日志：deploy_windows.cmd --logs`n$($_.Exception.Message)" "Application failed health or container identity checks; container retained for investigation. Logs: deploy_windows.cmd --logs`n$($_.Exception.Message)")
    }
    $appPort = [string]$prepared.Values['APP_PORT']
    if ([string]::IsNullOrWhiteSpace($appPort)) { $appPort = '8080' }
    if ($Restarted) { Write-Host (Get-DvMessage "应用已重启并通过健康检查，容器 ID=$($container.Id)。" "Application restarted and passed health checks, container ID=$($container.Id).") }
    else { Write-Host (Get-DvMessage "应用已启动并通过健康检查，容器 ID=$($container.Id)。" "Application started and passed health checks, container ID=$($container.Id).") }
    Write-Host (Get-DvMessage "默认访问地址：http://localhost:$appPort" "Default address: http://localhost:$appPort")
    if ($container.Ports) { Write-Host (Get-DvMessage "Docker 映射端口：$($container.Ports)" "Docker published ports: $($container.Ports)") }
    Write-Host (Get-DvMessage '查看日志：deploy_windows.cmd --logs；查看状态：deploy_windows.cmd --status；停止：deploy_windows.cmd --stop' 'Logs: deploy_windows.cmd --logs; status: deploy_windows.cmd --status; stop: deploy_windows.cmd --stop')
}

function Invoke-Main {
    $mode = 'start'
    $timeout = 300
    $timeoutProvided = $false
    $operationProvided = $false
    for ($i = 0; $i -lt $script:ScriptArgs.Count; $i++) {
        $arg = [string]$script:ScriptArgs[$i]
        if ($arg -in @('--help', '-h')) {
            if ($script:ScriptArgs.Count -ne 1) { throw (Get-DvMessage '--help/-h 不能与其他参数同时指定。' '--help/-h cannot be combined with other options.') }
            $mode = 'help'
        }
        elseif ($arg -eq '--wait-timeout') {
            if ($timeoutProvided -or ($i + 1) -ge $script:ScriptArgs.Count) { throw (Get-DvMessage '--wait-timeout 后必须提供正整数秒数。' '--wait-timeout requires a positive number of seconds.') }
            $timeoutText = [string]$script:ScriptArgs[++$i]
            if ($timeoutText -notmatch '^[1-9][0-9]*$' -or [long]$timeoutText -gt [int]::MaxValue) { throw (Get-DvMessage '--wait-timeout 必须是正整数。' '--wait-timeout must be a positive integer.') }
            $timeout = [int]$timeoutText; $timeoutProvided = $true
        }
        elseif ($arg -in @('--check', '--status', '--stop', '--logs', '--restart')) {
            if ($operationProvided) { throw (Get-DvMessage '一次只能指定一个操作。' 'Specify only one operation.') }
            $operationProvided = $true
            $mode = $arg.Substring(2)
        }
        else {
            throw (Get-DvMessage "不支持的参数 '$arg'。运行 deploy_windows.cmd --help 查看用法。" "Unsupported argument '$arg'. Run deploy_windows.cmd --help for usage.")
        }
    }
    if ($mode -eq 'help') { Write-Usage; return 0 }
    if ($timeoutProvided -and $mode -notin @('start', 'restart')) { throw (Get-DvMessage '--wait-timeout 仅可用于启动和重启。' '--wait-timeout can only be used to start or restart.') }
    if ((Test-Path -LiteralPath $script:ExpectedModePath -PathType Leaf) -and (Read-OneLine $script:ExpectedModePath) -cne $script:ModeMarker) {
        throw (Get-DvMessage "包根目录标记文件 '$($script:ExpectedModePath)' 已属于另一种部署方式。" "Package marker '$($script:ExpectedModePath)' belongs to another deployment type.")
    }

    if ($mode -in @('status', 'stop', 'logs')) {
        $identity = Get-ControlIdentity
        if ($null -eq $identity) {
            Write-Host (Get-DvMessage '此部署目录尚未启动过 Docker app 应用。' 'Docker app has not been started in this deployment directory.')
            return $(if ($mode -eq 'stop') { 0 } else { 3 })
        }
        $engine = Assert-DockerEngine -RequireCompose:$false -ExpectedPlatform:$null
        Assert-EndpointIdentity -Paths $identity.Paths -Endpoint $engine.Endpoint
        $containers = @(Get-Containers -ProjectName $identity.Project -ExpectedImage $identity.Image)
        if ($mode -eq 'status') { return (Invoke-Status -Containers $containers) }
        if ($mode -eq 'logs') { return (Invoke-Logs -Containers $containers -Paths $identity.Paths) }
        if ($containers.Count -eq 0) { Write-Host (Get-DvMessage '此部署目录没有应用容器；没有执行停止操作。' 'No application container exists in this directory; no stop was attempted.'); return 0 }
        $lock = Acquire-LauncherLock
        try {
            $containers = @(Get-Containers -ProjectName $identity.Project -ExpectedImage $identity.Image)
            return (Invoke-Stop -Containers $containers -Paths $identity.Paths)
        }
        finally { $lock.Dispose() }
    }

    $package = Assert-PackageFiles
    $projectName = Get-ProjectName

    if ($mode -eq 'check') {
        Write-Host (Get-DvMessage '正在只读检查 Docker app 部署条件……' 'Checking Docker app deployment requirements without modifying files...')
        $engine = Assert-DockerEngine -RequireCompose:$true -ExpectedPlatform $package.Platform
        [void](Assert-ExpectedEnv -Image $package.Image -ProjectName $projectName -RequireDatabase:$true)
        Assert-ComposeConfig -ProjectName $projectName -ExpectedImage $package.Image
        $imagePresent = Test-LocalImage -Image $package.Image -ExpectedPlatform $package.Platform
        if (-not $imagePresent -and -not (Test-Path -LiteralPath (Join-Path $script:Root 'image.tar') -PathType Leaf)) { throw (Get-DvMessage "本机缺少 '$($package.Image)'，发布包也缺少 image.tar。" "Local image '$($package.Image)' and package image.tar are missing.") }
        foreach ($name in @('resource', 'logs')) {
            $path = Join-Path $script:Root $name
            if ((Test-Path -LiteralPath $path) -and -not (Test-Path -LiteralPath $path -PathType Container)) { throw (Get-DvMessage "宿主机挂载路径 '$path' 不是目录。" "Host mount path '$path' is not a directory.") }
        }
        if (-not $imagePresent) { Write-Host (Get-DvMessage "检查通过；启动时会从 image.tar 导入 '$($package.Image)'。" "Checks passed; '$($package.Image)' will be imported from image.tar at startup.") }
        else { Write-Host (Get-DvMessage "检查通过；本机已有指定镜像 '$($package.Image)'。" "Checks passed; required image '$($package.Image)' is available locally.") }
        Write-Host (Get-DvMessage '检查未创建或修改文件，也未导入镜像或启动容器。' 'Checks did not create or modify files, import images, or start containers.')
        return 0
    }

    $engine = Assert-DockerEngine -RequireCompose:$true -ExpectedPlatform $package.Platform
    $lock = Acquire-LauncherLock
    try {
        $paths = Get-IdentityPaths
        $hasIdentity = Assert-StoredIdentity -Paths $paths -ProjectName $projectName -AllowAbsent
        if ($hasIdentity) { Assert-EndpointIdentity -Paths $paths -Endpoint $engine.Endpoint }
        $restarted = $false
        if ($mode -eq 'restart') {
            $containers = @(Get-Containers -ProjectName $projectName -ExpectedImage $package.Image)
            if ($containers.Count -gt 0) {
                $stopCode = Invoke-Stop -Containers $containers -Paths $paths
                if ($stopCode -ne 0) { throw (Get-DvMessage '无法确认应用容器已停止；为避免启动重复实例，本次不会启动新容器。' 'Cannot confirm the application container stopped; no duplicate was started.') }
            }
            $restarted = $true
        }
        Start-Application -Package $package -Engine $engine -ProjectName $projectName -Timeout $timeout -Restarted:$restarted
        return 0
    }
    finally { $lock.Dispose() }
}

try {
    $exitCode = Invoke-Main
    exit [int]$exitCode
}
catch {
    Remove-CancelArtifacts
    [System.Console]::Error.WriteLine((Get-DvMessage 'Docker app 部署失败：{0}' 'Docker app deployment failed: {0}'), $_.Exception.Message)
    exit 1
}
