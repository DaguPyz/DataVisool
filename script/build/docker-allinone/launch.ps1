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

$script:ModeMarker = 'docker-allinone-launcher-v1'
$script:LegacyNodeMarker = 'docker-allinone'
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
Docker all-in-one deployment
Usage: deploy_windows.cmd [--help|-h|--check|--status|--stop|--restart]
  --logs                 Follow container logs.
  --wait-timeout SECONDS Set the startup health-check timeout.
  (no option)  Check requirements, request missing settings, and start the application.
  --check      Check requirements without prompting, changing files or starting.
  --status     Show the recorded instance status.
  --stop       Stop the recorded instance.
  --restart    Stop the instance and then start it again.
  --help, -h   Show this help.
Default health-check timeout: 600 seconds. Requires a local Docker Linux engine and Compose v2.20+.
The package image is imported from image.tar if missing. Database data, resources and logs remain in data/.
'@ | Write-Output
        return
    }
    @'
用法：deploy_windows.cmd [选项]

  (无参数)                    启动 Docker allinone 单容器并等待健康检查。
  --check                     只检查；不创建文件或 data 目录，不导入镜像，不询问。
  --status                    查看此部署目录对应的容器状态。
  --stop                      正常停止应用和 MySQL，最多等待 120 秒并保留容器与 data/。
  --logs                      跟踪最近 200 行容器日志。
  --restart                   正常停止后再启动；停止异常时不会继续。
  --wait-timeout SECONDS      启动健康检查等待时间，默认 600 秒（仅启动/重启）。
  --help, -h                  显示帮助。

需要本机 Docker Linux 引擎和 Docker Compose v2.20 或更高版本。镜像和 MySQL 基础版本固定为发布包内容；缺少镜像时仅从包根目录 image.tar 导入，不会拉取镜像。
MySQL 数据、资源和应用日志保存在包根目录 data/ 中；首次启动时填写数据库名称、账号和密码，连接信息保存在包根目录 .env。
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

function Test-DockerBindPath {
    param([string] $ActualSource, [string] $ExpectedPath)
    if (Test-SamePath $ActualSource $ExpectedPath) { return $true }
    if ($ActualSource -notmatch '^/run/desktop/mnt/host/(?<drive>[A-Za-z])(?:/(?<path>.*))?$') { return $false }
    $translated = $Matches['drive'].ToUpperInvariant() + ':\'
    if (-not [string]::IsNullOrEmpty($Matches['path'])) { $translated += $Matches['path'].Replace('/', '\') }
    return (Test-SamePath $translated $ExpectedPath)
}

function Read-TextFile {
    param([Parameter(Mandatory = $true)][string] $Path)
    $encoding = [System.Text.UTF8Encoding]::new($false, $true)
    $text = [System.IO.File]::ReadAllText($Path, $encoding)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    return $text
}

function Read-OneLine {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return (Read-TextFile $Path).Trim()
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
    foreach ($key in $counts.Keys) {
        if ($counts[$key] -gt 1) { throw (Get-DvMessage ".env 中 '$key' 出现多次；请保留唯一配置项后重试。" "The .env entry '$key' appears more than once; keep one entry and retry.") }
    }
    return [pscustomobject]@{ Lines = $lines; Newline = $newline; Entries = $entries; Counts = $counts; Text = $Text }
}

function ConvertTo-EnvValue {
    param([string] $Value)
    if ($Value -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { throw (Get-DvMessage '.env 值不能包含换行或控制字符。' '.env values cannot contain newlines or control characters.') }
    $escaped = $Value.Replace('\', '\\').Replace('"', '\"').Replace('$', '$$')
    return '"' + $escaped + '"'
}

function Set-EnvDocumentValue {
    param([pscustomobject] $Document, [string] $Key, [string] $Value)
    if ($Key -notin @('DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'MYSQL_BIND_ADDRESS', 'MYSQL_PORT', 'JAVA_TOOL_OPTIONS', 'TZ', 'DB_NAME', 'DB_USER', 'DB_PASSWORD')) { throw (Get-DvMessage "不允许修改 .env 项 '$Key'。" "Modifying .env entry '$Key' is not allowed.") }
    $line = "$Key=$(ConvertTo-EnvValue $Value)"
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

function Test-InteractiveInputAvailable {
    return -not [Console]::IsInputRedirected
}

function Get-RequiredDatabaseValues {
    param([pscustomobject] $Document, [hashtable] $ComposeValues, [bool] $Interactive)
    $required = @('DB_NAME', 'DB_USER', 'DB_PASSWORD')
    $values = @{}
    $missing = New-Object System.Collections.ArrayList
    foreach ($key in $required) {
        $value = if ($ComposeValues.ContainsKey($key)) { [string]$ComposeValues[$key] } else { '' }
        $hasValue = Test-EnvDocumentHasValue -Document $Document -Key $key
        if (-not $hasValue -or [string]::IsNullOrEmpty($value)) { [void]$missing.Add($key) }
        else { $values[$key] = $value }
    }
    if (-not $Interactive) {
        if ($missing.Count -gt 0) { throw (Get-DvMessage "数据库配置缺少或未解析：$([string]::Join(', ', [string[]]$missing.ToArray()))。检查模式不会询问或修改文件；运行 deploy_windows.cmd 补齐。" "Missing or unresolved database settings: $([string]::Join(', ', [string[]]$missing.ToArray())). Check mode does not prompt or modify files; run deploy_windows.cmd to complete setup.") }
    }
    elseif ($missing.Count -gt 0) {
        if (-not (Test-InteractiveInputAvailable)) { $script:PromptCancelled = $true; throw (Get-DvMessage "需要交互补齐数据库配置（$([string]::Join(', ', [string[]]$missing.ToArray()))），但当前终端没有可用输入。" "Database settings require interactive input ($([string]::Join(', ', [string[]]$missing.ToArray()))), but terminal input is unavailable.") }
        foreach ($key in $missing) {
            while ($true) {
                if ($key -ceq 'DB_PASSWORD') {
                    try { $secure = Read-Host -Prompt (Get-DvMessage 'MySQL 密码（直接回车取消）' 'MySQL password (press Enter to cancel)') -AsSecureString }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                    $ptr = [IntPtr]::Zero
                    try { $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
                    finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; if ($null -ne $secure) { $secure.Dispose() } }
                }
                elseif ($key -ceq 'DB_NAME') {
                    try { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 数据库名称（直接回车取消）' 'MySQL database name (press Enter to cancel)') }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                }
                else {
                    try { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 用户名（直接回车取消）' 'MySQL username (press Enter to cancel)') }
                    catch { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                }
                if (($key -ceq 'DB_PASSWORD' -and [string]::IsNullOrEmpty($value)) -or
                    ($key -cne 'DB_PASSWORD' -and [string]::IsNullOrWhiteSpace($value))) { $script:PromptCancelled = $true; throw (Get-DvMessage '已取消数据库配置。' 'Database configuration cancelled.') }
                if ($value -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { Write-Host (Get-DvMessage '数据库配置不能包含换行或控制字符，请重新输入。' 'Database configuration cannot contain newlines or control characters; try again.') -ForegroundColor Yellow; continue }
                $values[$key] = [string]$value
                break
            }
        }
    }
    if ($values['DB_NAME'] -notmatch '^[A-Za-z0-9_-]{1,64}$') { throw (Get-DvMessage 'DB_NAME 只能包含字母、数字、下划线和连字符，长度为 1 到 64。' 'DB_NAME must be 1 to 64 letters, digits, underscores or hyphens.') }
    if ($values['DB_USER'] -notmatch '^[A-Za-z0-9_.-]{1,32}$') { throw (Get-DvMessage 'DB_USER 只能包含字母、数字、下划线、点和连字符，长度为 1 到 32。' 'DB_USER must be 1 to 32 letters, digits, underscores, dots or hyphens.') }
    if ([string]::IsNullOrEmpty($values['DB_PASSWORD']) -or $values['DB_PASSWORD'] -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { throw (Get-DvMessage 'DB_PASSWORD 必须是非空的单行值，且不能包含控制字符。' 'DB_PASSWORD must be a nonempty single line without control characters.') }
    return $values
}

function ConvertTo-ValidatedHostPort {
    param([string] $Value, [string] $Name)
    if ($Value -notmatch '^[0-9]{1,5}$') { throw (Get-DvMessage "$Name 必须是 1 到 65535 之间的整数。" "$Name must be an integer between 1 and 65535.") }
    $port = 0
    if (-not [int]::TryParse($Value, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw (Get-DvMessage "$Name 必须是 1 到 65535 之间的整数。" "$Name must be an integer between 1 and 65535.") }
    return $port
}

function ConvertTo-ValidatedHostAddress {
    param([string] $Value, [string] $Name)
    $address = $null
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$' -or
        -not [System.Net.IPAddress]::TryParse($Value, [ref]$address) -or
        $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw (Get-DvMessage "$Name 必须是有效的 IPv4 地址。" "$Name must be a valid IPv4 address.")
    }
    return $address.ToString()
}

function Test-SameHostAddress {
    param([string] $Left, [string] $Right)
    $leftAddress = $null; $rightAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($Left, [ref]$leftAddress) -or
        -not [System.Net.IPAddress]::TryParse($Right, [ref]$rightAddress)) { return $false }
    return $leftAddress.Equals($rightAddress)
}

function Get-HostPortSettings {
    param([hashtable] $Values)
    $appAddress = ConvertTo-ValidatedHostAddress -Value ([string]$Values['APP_BIND_ADDRESS']) -Name 'APP_BIND_ADDRESS'
    $appPort = ConvertTo-ValidatedHostPort -Value ([string]$Values['APP_PORT']) -Name 'APP_PORT'
    $mysqlAddress = ConvertTo-ValidatedHostAddress -Value ([string]$Values['MYSQL_BIND_ADDRESS']) -Name 'MYSQL_BIND_ADDRESS'
    $mysqlPort = ConvertTo-ValidatedHostPort -Value ([string]$Values['MYSQL_PORT']) -Name 'MYSQL_PORT'
    if ($appPort -eq $mysqlPort -and (
        (Test-SameHostAddress $appAddress $mysqlAddress) -or
        $appAddress -ceq '0.0.0.0' -or $mysqlAddress -ceq '0.0.0.0')) {
        throw (Get-DvMessage 'APP_PORT 和 MYSQL_PORT 不能在相同或重叠的宿主机地址上使用相同端口。' 'APP_PORT and MYSQL_PORT cannot use the same port on identical or overlapping host addresses.')
    }
    return [pscustomobject]@{
        AppAddress = $appAddress; AppPort = $appPort
        MysqlAddress = $mysqlAddress; MysqlPort = $mysqlPort
    }
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
    $normalized = (Get-CanonicalPath $script:Root).ToLowerInvariant()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($normalized))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    return 'datavisool-b-' + $hash.Substring(0, 20)
}

function Test-ProjectName {
    param([string] $ProjectName)
    return -not [string]::IsNullOrWhiteSpace($ProjectName) -and $ProjectName -cmatch '^[a-z0-9][a-z0-9_-]*$'
}

function Get-ExpectedDataPath {
    return (Get-CanonicalPath (Join-Path $script:Root 'data'))
}

function Assert-DataDirectoryPath {
    param([string] $Path, [switch] $AllowMissing)
    $expected = Get-ExpectedDataPath
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-SamePath $Path $expected)) {
        throw (Get-DvMessage 'run/data.path 必须指向此部署包根目录的 data/；没有操作容器或数据。' 'run/data.path must point to data/ in this package root; no containers or data were modified.')
    }
    $item = Get-Item -LiteralPath $expected -Force -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        if ($AllowMissing) { return $expected }
        throw (Get-DvMessage "宿主机数据目录 '$expected' 不存在；为避免启动空数据库，请先恢复 data/ 目录。" "Host data directory '$expected' is missing; restore data/ to avoid starting an empty database.")
    }
    if (-not $item.PSIsContainer) { throw (Get-DvMessage "宿主机数据路径 '$expected' 不是目录；没有操作容器或数据。" "Host data path '$expected' is not a directory; no containers or data were modified.") }
    if ([bool]($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw (Get-DvMessage "宿主机数据目录 '$expected' 是符号链接或重解析点；为避免挂载到其他位置，没有继续。" "Host data directory '$expected' is a symlink or reparse point; operation stopped.")
    }
    return $expected
}

function Get-IdentityPaths {
    return [pscustomobject]@{
        Project = Join-Path $script:RunDir 'project.name'
        Root = Join-Path $script:RunDir 'deployment.root'
        Endpoint = Join-Path $script:RunDir 'docker.endpoint'
        Data = Join-Path $script:RunDir 'data.path'
        MysqlBase = Join-Path $script:RunDir 'mysql.base'
        Container = Join-Path $script:RunDir 'container.id'
        Pending = Join-Path $script:RunDir 'data.pending'
        Lock = Join-Path $script:RunDir 'docker-launcher.lock'
    }
}

function Get-DataIntent {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $text = Read-TextFile $Path
    if ($text.Contains("`r")) { return $null }
    $lines = $text.Split([string[]]@("`n"), [System.StringSplitOptions]::None)
    if ($lines.Length -eq 7 -and $lines[6] -ceq '') { $lines = $lines[0..5] }
    if ($lines.Length -ne 6) { return $null }
    $values = @{}
    $keys = @('type', 'project', 'root', 'docker.endpoint', 'data.path', 'mysql.base')
    for ($i = 0; $i -lt $keys.Length; $i++) {
        $prefix = $keys[$i] + '='
        if (-not $lines[$i].StartsWith($prefix, [StringComparison]::Ordinal)) { return $null }
        $values[$keys[$i]] = $lines[$i].Substring($prefix.Length)
    }
    if ($values.type -cne $script:ModeMarker -or -not (Test-ProjectName $values.project) -or
        -not (Test-SamePath $values.root $script:Root) -or $values['docker.endpoint'] -notmatch '^(?i:npipe://|unix://)' -or
        -not (Test-SamePath $values['data.path'] (Get-ExpectedDataPath)) -or [string]::IsNullOrWhiteSpace($values['mysql.base'])) { return $null }
    return [pscustomobject]@{
        Project = [string]$values.project; Root = [string]$values.root; Endpoint = [string]$values['docker.endpoint']
        DataPath = (Get-CanonicalPath $values['data.path']); MysqlBase = [string]$values['mysql.base']
    }
}

function New-DataIntentText {
    param([string] $Project, [string] $Endpoint, [string] $DataPath, [string] $MysqlBase)
    return "type=$($script:ModeMarker)`nproject=$Project`nroot=$(Get-CanonicalPath $script:Root)`ndocker.endpoint=$Endpoint`ndata.path=$(Get-CanonicalPath $DataPath)`nmysql.base=$MysqlBase`n"
}

function Get-RunState {
    param([switch] $AllowAbsent, [switch] $RecoverPending)
    $paths = Get-IdentityPaths
    $core = @($paths.Project, $paths.Root, $paths.Endpoint, $paths.Data, $paths.MysqlBase)
    $present = @($core | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    $hasAuxiliary = (Test-Path -LiteralPath $paths.Container -PathType Leaf) -or (Test-Path -LiteralPath $paths.Pending -PathType Leaf)
    if ($present.Count -eq 0 -and -not $hasAuxiliary) {
        if (Test-Path -LiteralPath $script:ExpectedModePath) {
            throw (Get-DvMessage '部署类型标记仍存在，但 run 部署身份记录缺失；请恢复原记录，未创建数据目录或空数据库。' 'Deployment marker exists but run identity records are missing; restore the records. No data directory or empty database was created.')
        }
        if ($AllowAbsent) { return $null }
        throw (Get-DvMessage '此目录没有 Docker allinone 部署状态记录；没有操作容器。' 'No Docker all-in-one deployment records exist here; no containers were modified.')
    }
    if ($present.Count -ne $core.Count) {
        $intent = Get-DataIntent -Path $paths.Pending
        if ($null -eq $intent) { throw (Get-DvMessage 'run 部署状态记录不完整或 data.pending 意图无效；为避免误接管或丢失数据，没有继续。' 'Deployment records are incomplete or data.pending is invalid; operation stopped to protect data.') }
        $expected = @{
            $paths.Project = $intent.Project; $paths.Root = $intent.Root; $paths.Endpoint = $intent.Endpoint
            $paths.Data = $intent.DataPath; $paths.MysqlBase = $intent.MysqlBase
        }
        foreach ($file in $present) {
            $actual = Read-OneLine $file
            $desired = [string]$expected[$file]
            $matches = if ($file -ceq $paths.Root) { Test-SamePath $actual $desired } else { $actual -ceq $desired }
            if (-not $matches) { throw (Get-DvMessage 'run 核心记录与 data.pending 意图不一致；没有修复或操作数据。' 'Core run records differ from data.pending; no data was repaired or modified.') }
        }
        if (-not $RecoverPending) { throw (Get-DvMessage 'data.pending 中有完整部署意图，但 run 核心记录尚未完成；--check 保持只读，请正常启动或重启以恢复。' 'data.pending is complete but core run records are incomplete; --check is read-only. Start or restart to recover.') }
        foreach ($file in $core) {
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { [void](Write-AtomicTextFile -Path $file -Text ([string]$expected[$file] + "`n")) }
        }
        $present = $core
    }
    $project = Read-OneLine $paths.Project
    $root = Read-OneLine $paths.Root
    $endpoint = Read-OneLine $paths.Endpoint
    $dataPath = Read-OneLine $paths.Data
    $mysqlBase = Read-OneLine $paths.MysqlBase
    if (-not (Test-ProjectName $project) -or -not (Test-SamePath $root $script:Root) -or
        $endpoint -notmatch '^(?i:npipe://|unix://)' -or -not (Test-SamePath $dataPath (Get-ExpectedDataPath)) -or [string]::IsNullOrWhiteSpace($mysqlBase)) {
        throw (Get-DvMessage 'run 部署身份记录无效或不属于此解压目录；没有操作容器。' 'Deployment identity records are invalid or belong to another directory; no containers were modified.')
    }
    [void](Assert-DataDirectoryPath -Path $dataPath)
    $pending = Test-Path -LiteralPath $paths.Pending -PathType Leaf
    if ($pending) {
        $intent = Get-DataIntent -Path $paths.Pending
        if ($null -eq $intent -or $intent.Project -cne $project -or -not (Test-SamePath $intent.Root $root) -or
            $intent.Endpoint -cne $endpoint -or -not (Test-SamePath $intent.DataPath $dataPath) -or $intent.MysqlBase -cne $mysqlBase) {
            throw (Get-DvMessage 'run/data.pending 意图与核心部署记录不一致；没有操作容器或数据。' 'run/data.pending differs from core deployment records; no containers or data were modified.')
        }
    }
    return [pscustomobject]@{
        Project = $project; Root = $root; Endpoint = $endpoint; DataPath = (Get-CanonicalPath $dataPath); MysqlBase = $mysqlBase
        Paths = $paths; Pending = $pending
    }
}

function Get-PackageImage {
    $imagePath = Join-Path $script:AppDir 'IMAGE'
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw (Get-DvMessage "Docker allinone 发布包缺少文件：'$imagePath'。" "Docker all-in-one package is missing '$imagePath'.") }
    $image = (Read-TextFile $imagePath).Trim()
    if ($image -notmatch '^\S+:(?<tag>[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})$' -or $image.Contains('@') -or $image -match '(?i):latest$') {
        throw (Get-DvMessage 'docker-allinone/IMAGE 必须指定明确的 IMAGE:TAG，且不能使用 latest。' 'docker-allinone/IMAGE must specify an explicit IMAGE:TAG other than latest.')
    }
    return $image
}

function Get-Package {
    $image = Get-PackageImage
    $platformPath = Join-Path $script:AppDir 'PLATFORM'
    foreach ($file in @($platformPath, (Join-Path $script:AppDir '.env.example'), $script:ComposePath, (Join-Path $script:Root 'config\application.yml'))) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw (Get-DvMessage "Docker allinone 发布包缺少文件：'$file'。" "Docker all-in-one package is missing '$file'.") }
    }
    $platform = (Read-TextFile $platformPath).Trim()
    if ($platform -notin @('linux/amd64', 'linux/arm64')) { throw (Get-DvMessage "不支持发布包平台 '$platform'；仅支持 linux/amd64 或 linux/arm64。" "Unsupported package platform '$platform'; only linux/amd64 and linux/arm64 are supported.") }
    $applicationConfig = Read-TextFile (Join-Path $script:Root 'config\application.yml')
    foreach ($variable in @('${DB_USER}', '${DB_PASSWORD}')) {
        if (-not $applicationConfig.Contains($variable)) { throw (Get-DvMessage "config/application.yml 缺少数据库变量引用 '$variable'；脚本不会修改此文件。" "config/application.yml is missing the database variable reference '$variable'; the file was not modified.") }
    }
    if (-not $applicationConfig.Contains('${DB_NAME}')) {
        throw ((Get-DvMessage "config/application.yml 缺少数据库变量引用 '{0}'；脚本不会修改此文件。" "config/application.yml is missing database variable reference '{0}'; the file was not modified.") -f '${DB_NAME}')
    }
    return [pscustomobject]@{ Image = $image; Platform = $platform }
}

function Assert-ModeMarker {
    if (-not (Test-Path -LiteralPath $script:ExpectedModePath -PathType Leaf)) { return }
    $marker = Read-OneLine $script:ExpectedModePath
    if ($marker -ceq $script:LegacyNodeMarker) { throw (Get-DvMessage '此目录带有旧 Node.js Docker allinone 部署标记；Windows helper 不会接管旧部署，请继续使用原 deploy.mjs。' 'This directory contains legacy Node.js Docker all-in-one deployment markers. Continue using the original deploy.mjs.') }
    if ($marker -cne $script:ModeMarker) { throw (Get-DvMessage "包根目录标记文件 '$($script:ExpectedModePath)' 已属于另一种部署方式。" "Package marker '$($script:ExpectedModePath)' belongs to another deployment type.") }
}

function Ensure-ModeMarker {
    Assert-ModeMarker
    if (-not (Test-Path -LiteralPath $script:ExpectedModePath -PathType Leaf)) { [void](Write-AtomicTextFile -Path $script:ExpectedModePath -Text ($script:ModeMarker + "`n")) }
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
        if ($character -eq '"') { [void]$builder.Append(('\' * (2 * $slashes + 1))); [void]$builder.Append('"'); $slashes = 0; continue }
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
    $startInfo.UseShellExecute = $false; $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true; $startInfo.RedirectStandardOutput = $true; $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $startInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
    foreach ($item in Get-ChildItem Env:) {
        if ($item.Name -match '^(?i:COMPOSE_|DATAVISOOL_|APP_|DB_|MYSQL_)' -or $item.Name -in @('JAVA_TOOL_OPTIONS', 'TZ') -or $script:ManagedEnvNames -contains $item.Name) {
            [void]$startInfo.EnvironmentVariables.Remove([string]$item.Name)
        }
    }
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
        if ($process.ExitCode -ne 0) { throw (Get-DvMessage "Docker Compose 配置解析失败（退出码 $($process.ExitCode)）；已隐藏原始输出。" "Docker Compose configuration parsing failed (exit code $($process.ExitCode)); output is hidden.") }
        return $stdout
    }
    finally { $process.Dispose() }
}

function Invoke-Docker {
    param([string[]] $DockerArgs, [switch] $Capture, [switch] $AllowFailure, [switch] $RedactFailure)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Resolve-DockerExecutable
    $startInfo.Arguments = [string]::Join(' ', [string[]]@($DockerArgs | ForEach-Object { ConvertTo-WindowsArgument ([string]$_) }))
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = [bool]$Capture
    $startInfo.RedirectStandardOutput = [bool]$Capture
    $startInfo.RedirectStandardError = [bool]$Capture
    if ($Capture) {
        $startInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
        $startInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
    }
    foreach ($item in Get-ChildItem Env:) {
        if ($item.Name -match '^(?i:COMPOSE_|DATAVISOOL_|APP_|DB_|MYSQL_)' -or $item.Name -in @('JAVA_TOOL_OPTIONS', 'TZ') -or $script:ManagedEnvNames -contains $item.Name) {
            [void]$startInfo.EnvironmentVariables.Remove([string]$item.Name)
        }
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw (Get-DvMessage '无法启动 Docker CLI。' 'Cannot start Docker CLI.') }
        $stdoutTask = $null
        $stderrTask = $null
        if ($Capture) {
            $stdoutTask = $process.StandardOutput.ReadToEndAsync()
            $stderrTask = $process.StandardError.ReadToEndAsync()
        }
        $process.WaitForExit()
        if ($Capture) {
            $stdoutTask.Wait()
            $stderrTask.Wait()
        }
        $stdout = if ($Capture) { [string]$stdoutTask.Result } else { '' }
        $stderr = if ($Capture) { [string]$stderrTask.Result } else { '' }
        $text = if ([string]::IsNullOrEmpty($stdout)) { $stderr } elseif ([string]::IsNullOrEmpty($stderr)) { $stdout } else { $stdout.TrimEnd("`r", "`n") + "`n" + $stderr }
        $code = $process.ExitCode
        if ($code -ne 0 -and -not $AllowFailure) {
            if ($RedactFailure) { throw (Get-DvMessage "Docker 命令失败（退出码 $code）；已隐藏原始输出。" "Docker command failed (exit code $code); output is hidden.") }
            throw (Get-DvMessage "Docker 命令失败（退出码 $code）：docker $($DockerArgs -join ' ')`n$text" "Docker command failed (exit code $code): docker $($DockerArgs -join ' ')`n$text")
        }
        return [pscustomobject]@{ ExitCode = $code; Text = $text }
    }
    finally { $process.Dispose() }
}

function Get-ComposeEnvironment {
    param([string] $EnvFile)
    Update-ManagedEnvNames -Text (Read-TextFile $EnvFile)
    $probe = @'
services:
  app:
    image: scratch
    environment:
      DATAVISOOL_IMAGE: "${DATAVISOOL_IMAGE:-}"
      DATAVISOOL_PROJECT_NAME: "${DATAVISOOL_PROJECT_NAME:-datavisool-web-allinone}"
      APP_BIND_ADDRESS: "${APP_BIND_ADDRESS:-0.0.0.0}"
      APP_PORT: "${APP_PORT:-8080}"
      MYSQL_BIND_ADDRESS: "${MYSQL_BIND_ADDRESS:-127.0.0.1}"
      MYSQL_PORT: "${MYSQL_PORT:-3306}"
      JAVA_TOOL_OPTIONS: "${JAVA_TOOL_OPTIONS:--XX:MaxRAMPercentage=50.0 -Duser.timezone=Asia/Shanghai}"
      TZ: "${TZ:-Asia/Shanghai}"
      DB_NAME: "${DB_NAME:-}"
      DB_USER: "${DB_USER:-}"
      DB_PASSWORD: "${DB_PASSWORD:-}"
'@
    $args = @('compose', '-p', 'datavisool-web-allinone-probe', '--project-directory', $script:Root, '--env-file', $EnvFile, '-f', '-', 'config', '--format', 'json')
    $output = Invoke-DockerWithInput -DockerArgs $args -InputText $probe
    try { $config = ConvertFrom-Json -InputObject $output -ErrorAction Stop }
    catch { throw (Get-DvMessage 'Docker Compose 返回了无效的 JSON 配置；已隐藏原始输出。' 'Docker Compose returned invalid JSON; output is hidden.') }
    if ($null -eq $config -or $config -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $servicesProperty = $config.PSObject.Properties['services']
    if ($null -eq $servicesProperty -or $servicesProperty.Value -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $appProperty = $servicesProperty.Value.PSObject.Properties['app']
    if ($null -eq $appProperty -or $appProperty.Value -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $environmentProperty = $appProperty.Value.PSObject.Properties['environment']
    if ($null -eq $environmentProperty -or $environmentProperty.Value -isnot [System.Management.Automation.PSCustomObject]) { throw (Get-DvMessage 'Docker Compose JSON 配置结构无效；缺少 services.app.environment。' 'Invalid Docker Compose JSON: services.app.environment is missing.') }
    $environment = $environmentProperty.Value
    $values = @{}
    foreach ($key in @('DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'MYSQL_BIND_ADDRESS', 'MYSQL_PORT', 'JAVA_TOOL_OPTIONS', 'TZ', 'DB_NAME', 'DB_USER', 'DB_PASSWORD')) {
        $property = $environment.PSObject.Properties[$key]
        if ($null -eq $property -or $property.Value -isnot [string]) { throw (Get-DvMessage "Docker Compose JSON 配置缺少字符串环境变量 '$key'；原始输出已隐藏。" "Docker Compose JSON is missing string environment variable '$key'; output is hidden.") }
        # Compose doubles dollars when serializing config JSON; collapse one escape layer.
        $values[$key] = ([string]$property.Value).Replace('$$', '$')
    }
    return $values
}

function Get-ProjectName {
    param([switch] $RequireEnv, [switch] $RecoverPending)
    $state = Get-RunState -AllowAbsent -RecoverPending:$RecoverPending
    if ($null -ne $state) {
        $hasEnv = Test-Path -LiteralPath $script:EnvPath -PathType Leaf
        if ($RequireEnv -and -not $hasEnv) { throw (Get-DvMessage '包根目录缺少 .env；这是首次运行，请执行无参数启动。检查模式不会生成文件。' 'Package root .env is missing. For initial setup, start without arguments; check mode does not create files.') }
        if ($hasEnv) {
            $document = Get-EnvDocument -Text (Read-TextFile $script:EnvPath)
            $effective = Get-ComposeEnvironment -EnvFile $script:EnvPath
            if ($document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME') -and [string]$effective['DATAVISOOL_PROJECT_NAME'] -cne $state.Project) {
                throw (Get-DvMessage 'run/project.name 与 .env 中的 DATAVISOOL_PROJECT_NAME 不一致；为避免误操作，没有继续。' 'run/project.name differs from DATAVISOOL_PROJECT_NAME in .env; operation stopped.')
            }
        }
        return $state.Project
    }
    $hasEnv = Test-Path -LiteralPath $script:EnvPath -PathType Leaf
    if ($RequireEnv -and -not $hasEnv) { throw (Get-DvMessage '包根目录缺少 .env；这是首次运行，请执行无参数启动。检查模式不会生成文件。' 'Package root .env is missing. For initial setup, start without arguments; check mode does not create files.') }
    $envFile = if ($hasEnv) { $script:EnvPath } else { Join-Path $script:AppDir '.env.example' }
    $effective = Get-ComposeEnvironment -EnvFile $envFile
    $configured = [string]$effective['DATAVISOOL_PROJECT_NAME']
    if ([string]::IsNullOrWhiteSpace($configured) -or $configured -ceq 'datavisool-web-allinone') { $configured = Get-GeneratedProjectName }
    if (-not (Test-ProjectName $configured)) { throw (Get-DvMessage '.env 中 DATAVISOOL_PROJECT_NAME 不是有效的 Docker Compose 项目名。' 'DATAVISOOL_PROJECT_NAME in .env is not a valid Docker Compose project name.') }
    return $configured
}

function Invoke-Compose {
    param([string] $ProjectName, [string[]] $ComposeArgs, [switch] $Capture, [switch] $AllowFailure)
    $arguments = @('compose', '--project-directory', $script:Root, '--env-file', $script:EnvPath, '-f', $script:ComposePath, '-p', $ProjectName) + $ComposeArgs
    $result = Invoke-Docker -DockerArgs $arguments -Capture -AllowFailure -RedactFailure
    if ($result.ExitCode -ne 0 -and -not $AllowFailure) { throw (Get-DvMessage "Docker Compose 命令失败（退出码 $($result.ExitCode)）；已隐藏原始输出。" "Docker Compose failed (exit code $($result.ExitCode)); output is hidden.") }
    if ($Capture) { return $result }
    return [pscustomobject]@{ ExitCode = $result.ExitCode; Text = '' }
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
    if ($endpoint -notmatch '^(?i:npipe://|unix://)') { throw (Get-DvMessage "Docker endpoint '$endpoint' 不是本机 endpoint；此启动脚本只管理本机 Docker 引擎。" "Docker endpoint '$endpoint' is not local; this launcher manages only the local Docker engine.") }
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
    if ($ExpectedPlatform -and $ExpectedPlatform.Split('/')[1] -cne $architecture) { throw (Get-DvMessage "发布包平台 '$ExpectedPlatform' 与本机 Docker 引擎架构 '$architecture' 不匹配。" "Package platform '$ExpectedPlatform' does not match Docker engine architecture '$architecture'.") }
    if ($RequireCompose) {
        $compose = Invoke-Docker -DockerArgs @('compose', 'version', '--short') -Capture
        if ($compose.Text -notmatch '(?i)(?:^|\s)v?(?<major>\d+)\.(?<minor>\d+)(?:\.(?<patch>\d+))?') { throw (Get-DvMessage '无法识别 Docker Compose 版本。' 'Cannot identify the Docker Compose version.') }
        $major = [int]$Matches['major']; $minor = [int]$Matches['minor']
        if ($major -lt 2 -or ($major -eq 2 -and $minor -lt 20)) { throw (Get-DvMessage "需要 Docker Compose v2.20 或更高版本；当前版本是 $($compose.Text.Trim())。" "Docker Compose v2.20 or later is required; current version: $($compose.Text.Trim()).") }
    }
    return [pscustomobject]@{ Architecture = $architecture; Endpoint = $endpoint }
}

function Get-ImageMetadata {
    param([string] $Image, [string] $ExpectedPlatform)
    $result = Invoke-Docker -DockerArgs @('image', 'inspect', '--format', '{{.Os}}|{{.Architecture}}|{{index .Config.Labels "io.datavisool.deployment"}}|{{index .Config.Labels "io.datavisool.mysql.base"}}', $Image) -Capture -AllowFailure
    if ($result.ExitCode -ne 0) { return $null }
    $fields = $result.Text.Trim() -split '\|', 4
    if ($fields.Length -ne 4) { throw (Get-DvMessage '无法读取 Docker allinone 的平台和 MySQL 基础版本标签。' 'Cannot read Docker all-in-one platform and MySQL base version labels.') }
    $os = $fields[0].Trim().ToLowerInvariant(); $architecture = $fields[1].Trim().ToLowerInvariant()
    if ($architecture -in @('x86_64', 'x86-64')) { $architecture = 'amd64' }
    elseif ($architecture -ceq 'aarch64') { $architecture = 'arm64' }
    if ($os -cne 'linux' -or $ExpectedPlatform -and $ExpectedPlatform.Split('/')[1] -cne $architecture) {
        throw (Get-DvMessage "镜像 '$Image' 的平台 '$os/$architecture' 与发布包平台不匹配。" "Image '$Image' platform '$os/$architecture' does not match the package platform.")
    }
    if ($fields[2].Trim() -cne 'allinone' -or [string]::IsNullOrWhiteSpace($fields[3].Trim())) { throw (Get-DvMessage '指定镜像不是含 MySQL 的 Docker allinone，或缺少 io.datavisool.mysql.base 标签。' 'The image is not a Docker all-in-one image with MySQL, or lacks the io.datavisool.mysql.base label.') }
    return [pscustomobject]@{ Platform = "$os/$architecture"; MysqlBase = $fields[3].Trim() }
}

function Ensure-LocalImage {
    param([pscustomobject] $Package)
    $metadata = Get-ImageMetadata -Image $Package.Image -ExpectedPlatform $Package.Platform
    if ($null -ne $metadata) { return $metadata }
    $archive = Join-Path $script:Root 'image.tar'
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw (Get-DvMessage "本机缺少镜像 '$($Package.Image)'，发布包也缺少 image.tar。" "Local image '$($Package.Image)' and package image.tar are missing.") }
    Write-Host (Get-DvMessage "本机缺少指定镜像，正在从包内 image.tar 导入 '$($Package.Image)'……" "Required image is missing locally; importing '$($Package.Image)' from package image.tar...")
    [void](Invoke-Docker -DockerArgs @('load', '--input', $archive))
    $metadata = Get-ImageMetadata -Image $Package.Image -ExpectedPlatform $Package.Platform
    if ($null -eq $metadata) { throw (Get-DvMessage "image.tar 未包含发布包指定镜像 '$($Package.Image)'；没有拉取其他镜像。" "image.tar does not contain package image '$($Package.Image)'; no image was pulled.") }
    return $metadata
}

function Test-EnvAndPrepare {
    param([pscustomobject] $Package, [string] $ProjectName, [switch] $Commit)
    $hasExisting = Test-Path -LiteralPath $script:EnvPath -PathType Leaf
    $sourcePath = if ($hasExisting) { $script:EnvPath } else { Join-Path $script:AppDir '.env.example' }
    $sourceText = Read-TextFile $sourcePath
    Update-ManagedEnvNames -Text $sourceText
    $document = Get-EnvDocument -Text $sourceText
    $effective = Get-ComposeEnvironment -EnvFile $sourcePath
    $database = Get-RequiredDatabaseValues -Document $document -ComposeValues $effective -Interactive:$true
    $configuredImage = [string]$effective['DATAVISOOL_IMAGE']
    $exampleImage = [string](Get-ComposeEnvironment -EnvFile (Join-Path $script:AppDir '.env.example'))['DATAVISOOL_IMAGE']
    Update-ManagedEnvNames -Text $sourceText
    if ($hasExisting -and -not [string]::IsNullOrWhiteSpace($configuredImage) -and $configuredImage -cne $Package.Image -and $configuredImage -cne $exampleImage) {
        throw (Get-DvMessage '.env 中 DATAVISOOL_IMAGE 与发布包 IMAGE 不一致；部署脚本不会升级或切换镜像。' 'DATAVISOOL_IMAGE in .env differs from package IMAGE; the launcher will not upgrade or switch images.')
    }
    $configuredProject = [string]$effective['DATAVISOOL_PROJECT_NAME']
    $projectIsDefault = [string]::IsNullOrWhiteSpace($configuredProject) -or $configuredProject -ceq 'datavisool-web-allinone'
    $state = Get-RunState -AllowAbsent -RecoverPending
    if ($null -ne $state -and -not $projectIsDefault -and $configuredProject -cne $state.Project) { throw (Get-DvMessage '.env 项目名与 run/project.name 不一致；没有修改文件。' 'The .env project name differs from run/project.name; files were not modified.') }
    if ($null -eq $state -and -not $projectIsDefault -and $configuredProject -cne $ProjectName) { throw (Get-DvMessage '.env 项目名与本次部署身份不一致；没有修改文件。' 'The .env project name differs from the deployment identity; files were not modified.') }
    if (-not $hasExisting -or -not $document.Entries.ContainsKey('DATAVISOOL_IMAGE') -or [string]::IsNullOrWhiteSpace($configuredImage) -or $configuredImage -ceq $exampleImage) {
        Set-EnvDocumentValue -Document $document -Key 'DATAVISOOL_IMAGE' -Value $Package.Image
    }
    if (-not $document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME') -or $projectIsDefault -or [string]::IsNullOrWhiteSpace($configuredProject)) {
        Set-EnvDocumentValue -Document $document -Key 'DATAVISOOL_PROJECT_NAME' -Value $ProjectName
    }
    foreach ($key in @('DB_NAME', 'DB_USER', 'DB_PASSWORD')) {
        $effectiveValue = if ($effective.ContainsKey($key)) { [string]$effective[$key] } else { '' }
        if (-not (Test-EnvDocumentHasValue -Document $document -Key $key) -or [string]::IsNullOrEmpty($effectiveValue)) {
            Set-EnvDocumentValue -Document $document -Key $key -Value $database[$key]
        }
    }
    foreach ($key in @('MYSQL_BIND_ADDRESS', 'MYSQL_PORT')) {
        $effectiveValue = if ($effective.ContainsKey($key)) { [string]$effective[$key] } else { '' }
        if (-not (Test-EnvDocumentHasValue -Document $document -Key $key) -or [string]::IsNullOrEmpty($effectiveValue)) {
            Set-EnvDocumentValue -Document $document -Key $key -Value $effectiveValue
        }
    }
    $preparedText = $document.Text.TrimEnd("`r", "`n") + "`n"
    if ($Commit) {
        if (-not $hasExisting -or $preparedText -cne $sourceText) {
            $backup = Write-AtomicTextFile -Path $script:EnvPath -Text $preparedText -BackupExisting:$hasExisting -Private
            if ($backup) { Write-Host (Get-DvMessage ".env 修改前备份：'$backup'。" "Backup before .env changes: '$backup'.") }
        }
        elseif ($hasExisting) { Set-PrivateEnvFileAcl -Path $script:EnvPath }
    }
    return [pscustomobject]@{ Text = $preparedText; Values = $effective; Created = -not $hasExisting }
}

function Get-ComposeConfig {
    param([string] $ProjectName)
    $result = Invoke-Compose -ProjectName $ProjectName -ComposeArgs @('config', '--format', 'json') -Capture
    try { return ($result.Text | ConvertFrom-Json -ErrorAction Stop) }
    catch { throw (Get-DvMessage '无法解析 Compose 展开的配置；已隐藏原始输出。' 'Cannot parse expanded Compose configuration; output is hidden.') }
}

function Assert-ComposePortMappings {
    param([object[]] $Ports, [pscustomobject] $Expected)
    if ($Ports.Count -ne 2) { throw (Get-DvMessage 'Compose 必须且只能发布应用 8080 和 MySQL 3306 两个 TCP 端口。' 'Compose must publish only application port 8080 and MySQL port 3306 over TCP.') }
    $expectations = @(
        [pscustomobject]@{ Target = 8080; Address = $Expected.AppAddress; Port = [int]$Expected.AppPort; Name = 'APP' }
        [pscustomobject]@{ Target = 3306; Address = $Expected.MysqlAddress; Port = [int]$Expected.MysqlPort; Name = 'MYSQL' }
    )
    foreach ($expectedPort in $expectations) {
        $matching = @($Ports | Where-Object { [string]$_.target -ceq [string]$expectedPort.Target })
        if ($matching.Count -ne 1) { throw (Get-DvMessage 'Compose 必须且只能发布应用 8080 和 MySQL 3306 两个 TCP 端口。' 'Compose must publish only application port 8080 and MySQL port 3306 over TCP.') }
        $port = $matching[0]
        $protocol = [string]$port.protocol
        if ([string]::IsNullOrWhiteSpace($protocol)) { $protocol = 'tcp' }
        $published = 0
        $publishedText = [string]$port.published
        $publishedValid = $publishedText -match '^[0-9]{1,5}$' -and [int]::TryParse($publishedText, [ref]$published) -and $published -ge 1 -and $published -le 65535
        $hostAddress = ''
        $hostAddressProperty = $port.PSObject.Properties['host_ip']
        if ($null -ne $hostAddressProperty) { $hostAddress = [string]$hostAddressProperty.Value }
        $validAddress = $false
        try { $hostAddress = ConvertTo-ValidatedHostAddress -Value $hostAddress -Name 'Compose host_ip'; $validAddress = $true } catch { }
        if ($protocol -ine 'tcp' -or -not $publishedValid -or $published -ne [int]$expectedPort.Port -or
            -not $validAddress -or -not (Test-SameHostAddress $hostAddress ([string]$expectedPort.Address))) {
            throw (Get-DvMessage "Compose 的 $($expectedPort.Name) 宿主机映射必须与 .env 配置一致，且容器目标端口为 $($expectedPort.Target)/tcp。" "Compose host mapping for $($expectedPort.Name) must match .env and target container port $($expectedPort.Target)/tcp.")
        }
    }
}

function Assert-ComposeConfig {
    param([string] $ProjectName, [string] $ExpectedImage, [string] $ExpectedDataPath)
    $config = Get-ComposeConfig -ProjectName $ProjectName
    $services = @($config.services.PSObject.Properties)
    if ($services.Count -ne 1 -or $services[0].Name -cne 'app') { throw (Get-DvMessage 'Docker allinone Compose 必须且只能包含 app 一个容器服务。' 'Docker all-in-one Compose must contain only the app service.') }
    $app = $config.services.app
    if ([string]$app.image -cne $ExpectedImage) { throw (Get-DvMessage 'Compose 镜像与发布包固定 IMAGE 不一致。' 'The Compose image differs from the package IMAGE.') }
    if ([string]$app.pull_policy -cne 'never') { throw (Get-DvMessage 'Compose 必须设置 pull_policy: never。' 'Compose must set pull_policy: never.') }
    if (-not [string]::IsNullOrWhiteSpace([string]$app.user) -and [string]$app.user -notin @('0', '0:0', 'root', 'root:root')) { throw (Get-DvMessage 'Docker allinone 使用入口进程管理容器权限，不允许 Compose 覆盖 user。' 'Docker all-in-one manages container permissions in its entrypoint; Compose must not override user.') }
    $health = $app.healthcheck
    if ($null -ne $health) {
        $test = @($health.test)
        if ([bool]$health.disable -or ($test.Count -gt 0 -and [string]$test[0] -match '^(?i:NONE)$')) { throw (Get-DvMessage 'Compose 不得禁用镜像健康检查。' 'Compose must not disable the image health check.') }
    }
    $envKeys = @()
    if ($null -ne $app.environment) { $envKeys = @($app.environment.PSObject.Properties | ForEach-Object { $_.Name }) }
    if (@($envKeys | Where-Object { $_ -match '^(?i:MYSQL_|APP_UID$|APP_GID$)' }).Count -gt 0) { throw (Get-DvMessage 'Compose 不得将 MYSQL_* 或 APP_UID/APP_GID 覆盖传入 Docker allinone。' 'Compose must not pass MYSQL_* or override APP_UID/APP_GID in Docker all-in-one.') }
    if (@($envKeys | Where-Object { $_ -match '^(?i:DATAVISOOL_)' -and $_ -cne 'DATAVISOOL_MYSQL_HOST_PORT_ENABLED' }).Count -gt 0) { throw (Get-DvMessage 'Compose 只允许固定的 DATAVISOOL_MYSQL_HOST_PORT_ENABLED 运行时兼容开关。' 'Compose permits only the fixed DATAVISOOL_MYSQL_HOST_PORT_ENABLED compatibility switch.') }
    $databaseKeys = @('DB_NAME', 'DB_USER', 'DB_PASSWORD')
    if (@($envKeys | Where-Object { $_ -match '^(?i:DB_)' -and $_ -notin $databaseKeys }).Count -gt 0) { throw (Get-DvMessage 'Compose 仅可向 Docker allinone 传入 DB_NAME、DB_USER 和 DB_PASSWORD。' 'Compose may pass only DB_NAME, DB_USER and DB_PASSWORD to Docker all-in-one.') }
    $allowedEnvironmentKeys = @('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS', 'TZ', 'DATAVISOOL_MYSQL_HOST_PORT_ENABLED')
    if (@($envKeys | Where-Object { $_ -cnotin $allowedEnvironmentKeys }).Count -gt 0) { throw (Get-DvMessage 'Compose app.environment 包含 Docker allinone 不支持的变量。' 'Compose app.environment contains variables unsupported by Docker all-in-one.') }
    $runtimePortFlag = if ($null -ne $app.environment) { $app.environment.PSObject.Properties['DATAVISOOL_MYSQL_HOST_PORT_ENABLED'] } else { $null }
    if ($null -eq $runtimePortFlag -or [string]$runtimePortFlag.Value -cne '1') { throw (Get-DvMessage 'Compose 必须将 DATAVISOOL_MYSQL_HOST_PORT_ENABLED 固定为 1，以启用容器内 MySQL 宿主机连接兼容。' 'Compose must set DATAVISOOL_MYSQL_HOST_PORT_ENABLED to 1 for MySQL host connectivity.') }
    $envText = Read-TextFile $script:EnvPath
    $envDocument = Get-EnvDocument -Text $envText
    $composeEnvironment = Get-ComposeEnvironment -EnvFile $script:EnvPath
    $expectedDatabase = Get-RequiredDatabaseValues -Document $envDocument -ComposeValues $composeEnvironment -Interactive:$false
    $expectedPorts = Get-HostPortSettings -Values $composeEnvironment
    foreach ($key in $databaseKeys) {
        $property = if ($null -ne $app.environment) { $app.environment.PSObject.Properties[$key] } else { $null }
        $actualValue = if ($null -ne $property) { [string]$property.Value } else { '' }
        if ($key -ceq 'DB_PASSWORD') { $actualValue = $actualValue.Replace('$$', '$') }
        if ($null -eq $property -or $actualValue -cne [string]$expectedDatabase[$key]) {
            throw (Get-DvMessage "Compose 中 $key 缺失或与包根目录 .env 当前解析值不一致。" "Compose variable $key is missing or differs from the value resolved from package root .env.")
        }
    }
    Assert-ComposePortMappings -Ports @($app.ports) -Expected $expectedPorts
    $volumes = @($app.volumes)
    if ($volumes.Count -ne 2) { throw (Get-DvMessage 'Compose 必须且只能配置 /data 宿主机目录和只读 application.yml 两个挂载。' 'Compose must configure only the /data host directory and read-only application.yml mounts.') }
    $data = @($volumes | Where-Object { [string]$_.target -ceq '/data' })
    $configMount = @($volumes | Where-Object { [string]$_.target -ceq '/config/application.yml' })
    $topVolumes = @()
    if ($null -ne $config.volumes) { $topVolumes = @($config.volumes.PSObject.Properties) }
    if ($topVolumes.Count -ne 0) { throw (Get-DvMessage 'Compose 不得定义 Docker 命名数据卷；数据必须保存在包根目录 data/。' 'Compose must not define named volumes; data must remain in package root data/.') }
    $createHostPath = $null
    if ($data.Count -eq 1 -and $null -ne $data[0].bind) {
        $createHostPathProperty = $data[0].bind.PSObject.Properties['create_host_path']
        if ($null -ne $createHostPathProperty) { $createHostPath = [bool]$createHostPathProperty.Value }
    }
    if ($data.Count -ne 1 -or [string]$data[0].type -cne 'bind' -or [bool]$data[0].read_only -or
        -not [System.IO.Path]::IsPathRooted([string]$data[0].source) -or
        -not (Test-SamePath ([string]$data[0].source) $ExpectedDataPath) -or $null -eq $createHostPath -or $createHostPath) {
        throw (Get-DvMessage 'Compose 必须将包根目录 data/ 以可写 bind 挂载到 /data，并设置 bind.create_host_path: false。' 'Compose must bind mount package root data/ writable at /data with bind.create_host_path: false.')
    }
    if ($configMount.Count -ne 1 -or [string]$configMount[0].type -cne 'bind' -or [bool]$configMount[0].read_only -ne $true -or
        -not [System.IO.Path]::IsPathRooted([string]$configMount[0].source) -or
        -not (Test-SamePath ([string]$configMount[0].source) (Join-Path $script:Root 'config\application.yml'))) {
        throw (Get-DvMessage 'Compose 必须将包根目录 config/application.yml 以只读 bind 挂载到 /config/application.yml。' 'Compose must bind mount package root config/application.yml read-only at /config/application.yml.')
    }
    if ([string]$app.stop_grace_period -notin @('2m0s', '2m', '120s', '120')) { throw (Get-DvMessage 'Compose stop_grace_period 必须为 120 秒。' 'Compose stop_grace_period must be 120 seconds.') }
    return $config
}

function Get-ContainerObject {
    param([string] $Id)
    $result = Invoke-Docker -DockerArgs @('inspect', '--format', '{{json .}}', $Id) -Capture -AllowFailure -RedactFailure
    if ($result.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($result.Text)) { return $null }
    try { return ($result.Text | ConvertFrom-Json -ErrorAction Stop) } catch { throw (Get-DvMessage '无法解析容器身份；已隐藏 Docker inspect 输出。' 'Cannot parse container identity; Docker inspect output is hidden.') }
}

function Get-ContainerHostPort {
    param([pscustomobject] $Container, [int] $ContainerPort)
    $key = "$ContainerPort/tcp"
    $portSource = if ($null -ne $Container.NetworkSettings) { $Container.NetworkSettings.Ports } else { $null }
    if ([string]$Container.State.Status -notin @('running', 'paused', 'restarting') -and
        $null -ne $Container.HostConfig -and $null -ne $Container.HostConfig.PortBindings) {
        $portSource = $Container.HostConfig.PortBindings
    }
    $property = if ($null -ne $portSource) { $portSource.PSObject.Properties[$key] } else { $null }
    $bindings = @()
    if ($null -ne $property -and $null -ne $property.Value) { $bindings = @($property.Value) }
    $address = ''
    $hostPort = 0
    $valid = $false
    if ($bindings.Count -eq 1 -and $null -ne $bindings[0]) {
        try {
            $address = ConvertTo-ValidatedHostAddress -Value ([string]$bindings[0].HostIp) -Name (Get-DvMessage '容器 HostIp' 'Container HostIp')
            $hostPort = ConvertTo-ValidatedHostPort -Value ([string]$bindings[0].HostPort) -Name (Get-DvMessage '容器 HostPort' 'Container HostPort')
            $valid = $true
        }
        catch { $valid = $false }
    }
    return [pscustomobject]@{ Count = $bindings.Count; Address = $address; Port = $hostPort; Valid = $valid }
}

function Test-ContainerPortMappings {
    param([pscustomobject] $Container, [pscustomobject] $Expected)
    $expectedPortKeys = @('8080/tcp', '3306/tcp')
    $publishedPortKeys = if ($null -ne $Container) { @($Container.PublishedPortKeys) } else { @() }
    if ($null -eq $Container -or -not $Container.MysqlHostPortEnabled -or -not $Container.AppPortValid -or -not $Container.MysqlPortValid -or
        $publishedPortKeys.Count -ne 2 -or @($publishedPortKeys | Where-Object { $_ -notin $expectedPortKeys }).Count -gt 0 -or
        @($expectedPortKeys | Where-Object { $_ -notin $publishedPortKeys }).Count -gt 0) { return $false }
    return ([int]$Container.AppHostPort -eq [int]$Expected.AppPort -and
        [int]$Container.MysqlHostPort -eq [int]$Expected.MysqlPort -and
        (Test-SameHostAddress ([string]$Container.AppHostAddress) ([string]$Expected.AppAddress)) -and
        (Test-SameHostAddress ([string]$Container.MysqlHostAddress) ([string]$Expected.MysqlAddress)))
}

function Assert-ContainerPortMappings {
    param([pscustomobject] $Container, [pscustomobject] $Expected)
    if (-not (Test-ContainerPortMappings -Container $Container -Expected $Expected)) {
        throw (Get-DvMessage '当前容器的宿主机端口映射或 MySQL 宿主机连接兼容设置与当前 Compose 配置不一致；请运行 deploy_windows.cmd --restart 重新创建容器。' 'Container host port mappings or MySQL host connectivity settings differ from Compose; run deploy_windows.cmd --restart to recreate the container.')
    }
}

function Assert-RunningContainerPortMappings {
    param([pscustomobject] $Container, [pscustomobject] $Expected)
    if (Test-ContainerPortMappings -Container $Container -Expected $Expected) { return }
    if ($Container.MysqlPortCount -eq 0) {
        throw (Get-DvMessage '当前运行中的旧 Docker allinone 容器没有宿主机 MySQL 端口映射；请运行 deploy_windows.cmd --restart 重新创建容器后再使用数据库宿主机地址。' 'The running legacy Docker all-in-one container has no MySQL host port mapping; run deploy_windows.cmd --restart before using the database host address.')
    }
    throw (Get-DvMessage '当前运行中的 Docker allinone 容器宿主机端口映射或 MySQL 宿主机连接兼容设置与当前配置不一致；请运行 deploy_windows.cmd --restart 重新创建容器。' 'Running Docker all-in-one host port mappings or MySQL connectivity settings differ from configuration; run deploy_windows.cmd --restart.')
}

function Assert-ContainerObject {
    param([pscustomobject] $Container, [pscustomobject] $Identity, [string] $ExpectedImage)
    $mounts = @($Container.Mounts)
    $data = @($mounts | Where-Object { [string]$_.Destination -ceq '/data' })
    $labels = $Container.Config.Labels
    if ([string]$labels.'com.docker.compose.project' -cne $Identity.Project -or [string]$labels.'com.docker.compose.service' -cne 'app' -or
        -not (Test-SamePath ([string]$labels.'com.docker.compose.project.working_dir') $script:Root)) {
        throw (Get-DvMessage "发现容器 '$($Container.Id)' 的 Compose 标签不属于此解压目录；没有操作容器。" "Container '$($Container.Id)' has Compose labels belonging to another directory; it was not modified.")
    }
    if ($mounts.Count -ne 2) { throw (Get-DvMessage "容器 '$($Container.Id)' 的挂载数量不符合 Docker allinone 要求；没有操作容器。" "Container '$($Container.Id)' mount count does not meet Docker all-in-one requirements; it was not modified.") }
    $config = @($mounts | Where-Object { [string]$_.Destination -ceq '/config/application.yml' })
    if ($data.Count -ne 1 -or [string]$data[0].Type -cne 'bind' -or [bool]$data[0].RW -ne $true -or
        -not (Test-DockerBindPath ([string]$data[0].Source) $Identity.DataPath)) {
        throw (Get-DvMessage "容器 '$($Container.Id)' 的 /data bind 挂载必须指向 run/data.path 所记录的宿主机目录且可写；没有操作容器或数据。" "Container '$($Container.Id)' /data bind mount must be writable and point to run/data.path; no containers or data were modified.")
    }
    if ($config.Count -ne 1 -or [string]$config[0].Type -cne 'bind' -or [bool]$config[0].RW -ne $false -or
        -not (Test-DockerBindPath ([string]$config[0].Source) (Join-Path $script:Root 'config\application.yml'))) {
        throw (Get-DvMessage "容器 '$($Container.Id)' 的 application.yml 挂载身份不匹配；没有操作容器。" "Container '$($Container.Id)' application.yml mount identity does not match; it was not modified.")
    }
    if ([string]$Container.Config.Image -cne $ExpectedImage) { throw (Get-DvMessage "容器 '$($Container.Id)' 的镜像与发布包固定 IMAGE 不一致；没有操作容器。" "Container '$($Container.Id)' image differs from package IMAGE; it was not modified.") }
    $portBindingsSource = if ($null -ne $Container.NetworkSettings) { $Container.NetworkSettings.Ports } else { $null }
    if ([string]$Container.State.Status -notin @('running', 'paused', 'restarting') -and
        $null -ne $Container.HostConfig -and $null -ne $Container.HostConfig.PortBindings) {
        $portBindingsSource = $Container.HostConfig.PortBindings
    }
    $publishedPortKeys = @()
    if ($null -ne $portBindingsSource) {
        $publishedPortKeys = @($portBindingsSource.PSObject.Properties | Where-Object { $null -ne $_.Value -and @($_.Value).Count -gt 0 } | ForEach-Object { $_.Name })
    }
    $appPortMapping = Get-ContainerHostPort -Container $Container -ContainerPort 8080
    $mysqlPortMapping = Get-ContainerHostPort -Container $Container -ContainerPort 3306
    $mysqlHostPortEnabled = $false
    foreach ($environmentValue in @($Container.Config.Env)) {
        if ([string]$environmentValue -ceq 'DATAVISOOL_MYSQL_HOST_PORT_ENABLED=1') { $mysqlHostPortEnabled = $true; break }
    }
    return [pscustomobject]@{
        Id = [string]$Container.Id; State = [string]$Container.State.Status
        ExitCode = [int]$Container.State.ExitCode; OOMKilled = [bool]$Container.State.OOMKilled
        Health = if ($null -ne $Container.State.Health) { [string]$Container.State.Health.Status } else { 'none' }
        AppPortCount = [int]$appPortMapping.Count; AppHostAddress = [string]$appPortMapping.Address
        AppHostPort = [int]$appPortMapping.Port; AppPortValid = [bool]$appPortMapping.Valid
        MysqlPortCount = [int]$mysqlPortMapping.Count; MysqlHostAddress = [string]$mysqlPortMapping.Address
        MysqlHostPort = [int]$mysqlPortMapping.Port; MysqlPortValid = [bool]$mysqlPortMapping.Valid
        MysqlHostPortEnabled = $mysqlHostPortEnabled
        PublishedPortKeys = [string[]]$publishedPortKeys
        Raw = $Container
    }
}

function Get-Containers {
    param([pscustomobject] $Identity, [string] $ExpectedImage)
    $list = Invoke-Docker -DockerArgs @('ps', '--all', '--filter', ('label=com.docker.compose.project=' + $Identity.Project), '--format', '{{.ID}}') -Capture
    $items = New-Object System.Collections.ArrayList
    foreach ($id in ($list.Text -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })) {
        $object = Get-ContainerObject -Id $id.Trim()
        if ($null -ne $object) { [void]$items.Add((Assert-ContainerObject -Container $object -Identity $Identity -ExpectedImage $ExpectedImage)) }
    }
    if ($items.Count -eq 0) {
        $savedId = Read-OneLine $Identity.Paths.Container
        if ($savedId) {
            $object = Get-ContainerObject -Id $savedId
            if ($null -ne $object) { [void]$items.Add((Assert-ContainerObject -Container $object -Identity $Identity -ExpectedImage $ExpectedImage)) }
        }
    }
    if ($items.Count -gt 1) { throw (Get-DvMessage '发现多个属于此 Docker allinone 部署目录的 app 容器；为避免误操作，没有继续。' 'Multiple app containers belong to this Docker all-in-one deployment; operation stopped.') }
    return [object[]]$items.ToArray()
}

function Select-Container {
    param([object[]] $Containers)
    if ($Containers.Count -gt 1) { throw (Get-DvMessage '发现多个属于此 Docker allinone 部署目录的 app 容器。' 'Multiple app containers belong to this Docker all-in-one deployment.') }
    if ($Containers.Count -eq 1) { return $Containers[0] }
    return $null
}

function Write-ContainerId {
    param([pscustomobject] $Paths, [string] $Id)
    if (-not [string]::IsNullOrWhiteSpace($Id)) { [void](Write-AtomicTextFile -Path $Paths.Container -Text ($Id + "`n")) }
}

function Get-DatabaseStatusText {
    param([pscustomobject] $Container)
    if ($Container.MysqlPortValid) { return (Get-DvMessage "数据库宿主机地址=$($Container.MysqlHostAddress):$($Container.MysqlHostPort)" "Database host address=$($Container.MysqlHostAddress):$($Container.MysqlHostPort)") }
    if ($Container.MysqlPortCount -eq 0) { return (Get-DvMessage '数据库宿主机地址=未映射；运行 deploy_windows.cmd --restart 重新创建容器。' 'Database host address=not mapped; run deploy_windows.cmd --restart to recreate the container.') }
    return (Get-DvMessage '数据库宿主机地址=映射异常；运行 deploy_windows.cmd --restart 重新创建容器。' 'Database host address=invalid mapping; run deploy_windows.cmd --restart to recreate the container.')
}

function Invoke-Status {
    param([object[]] $Containers)
    $container = Select-Container -Containers $Containers
    if ($null -eq $container) { Write-Host (Get-DvMessage '此部署目录尚无容器。' 'This deployment directory has no container.'); return 3 }
    Write-Host (Get-DvMessage "容器 $($container.Id)：状态=$($container.State)，健康=$($container.Health)，退出码=$($container.ExitCode)，OOMKilled=$($container.OOMKilled)" "Container $($container.Id): state=$($container.State), health=$($container.Health), exit code=$($container.ExitCode), OOMKilled=$($container.OOMKilled)")
    Write-Host (Get-DatabaseStatusText -Container $container)
    return 0
}

function Invoke-Stop {
    param([object[]] $Containers, [pscustomobject] $Identity, [string] $ExpectedImage)
    $container = Select-Container -Containers $Containers
    if ($null -eq $container) { Write-Host (Get-DvMessage '此部署目录没有容器。' 'This deployment directory has no container.'); return 0 }
    if ($container.State -in @('exited', 'created', 'dead')) {
        if ($container.OOMKilled -or $container.ExitCode -ne 0) { throw (Get-DvMessage "容器已异常退出（ExitCode=$($container.ExitCode), OOMKilled=$($container.OOMKilled)）；请检查日志，restart 不会继续。" "Container exited abnormally (ExitCode=$($container.ExitCode), OOMKilled=$($container.OOMKilled)); check logs. Restart will not continue.") }
        if ($container.State -ceq 'created') { Write-Host (Get-DvMessage '容器尚未启动；宿主机 data/ 保留。' 'Container is not running; host data/ was retained.'); return 0 }
        Assert-CleanShutdownMarker -Container $container -Identity $Identity
        Write-Host (Get-DvMessage '容器已停止，MySQL 正常关闭标记已确认，宿主机 data/ 保留。' 'Container stopped and MySQL clean-shutdown marker confirmed; host data/ was retained.')
        return 0
    }
    if ($container.State -notin @('running', 'paused', 'restarting')) { throw (Get-DvMessage "容器状态 '$($container.State)' 无法确认正常停止；没有执行强制终止。" "Cannot confirm a clean stop from container state '$($container.State)'; no forced termination was performed.") }
    Write-Host (Get-DvMessage "正在请求 runtime 依次停止应用和 MySQL（最多 120 秒）……" "Requesting runtime to stop the application and MySQL in sequence (up to 120 seconds)...")
    [void](Invoke-Docker -DockerArgs @('stop', '--time', '120', $container.Id))
    $object = Get-ContainerObject -Id $container.Id
    if ($null -eq $object) { throw (Get-DvMessage '停止后无法读取容器状态；没有删除容器或 data/。' 'Cannot read container state after stop; container and data/ were retained.') }
    $stopped = Assert-ContainerObject -Container $object -Identity $Identity -ExpectedImage $ExpectedImage
    if ($stopped.State -notin @('exited', 'created', 'dead')) { throw (Get-DvMessage "Docker 接受了停止请求，但容器状态为 '$($stopped.State)'；没有强制终止。" "Docker accepted the stop request but container state is '$($stopped.State)'; no forced termination was performed.") }
    if ($stopped.OOMKilled -or $stopped.ExitCode -ne 0) { throw (Get-DvMessage "容器异常退出（ExitCode=$($stopped.ExitCode), OOMKilled=$($stopped.OOMKilled)）；请检查日志，restart 不会继续。" "Container exited abnormally (ExitCode=$($stopped.ExitCode), OOMKilled=$($stopped.OOMKilled)); check logs. Restart will not continue.") }
    if ($container.State -cne 'created') { Assert-CleanShutdownMarker -Container $stopped -Identity $Identity }
    Write-Host (Get-DvMessage '容器已停止，MySQL 正常关闭标记已确认；容器和宿主机 data/ 均已保留。' 'Container stopped and MySQL clean-shutdown marker confirmed; container and host data/ were retained.')
    return 0
}

function ConvertTo-DockerMountCsvField {
    param([Parameter(Mandatory = $true)][string] $Value)
    return '"' + $Value.Replace('"', '""') + '"'
}

function Assert-CleanShutdownMarker {
    param([pscustomobject] $Container, [pscustomobject] $Identity)
    $image = Invoke-Docker -DockerArgs @('inspect', '--format', '{{.Image}}', $Container.Id) -Capture
    $imageId = $image.Text.Trim()
    if ($imageId -notmatch '^sha256:[a-f0-9]{64}$') { throw (Get-DvMessage '无法读取已停止容器的原始镜像 SHA；宿主机 data/ 已保留，restart 不会继续。' 'Cannot read the stopped container''s original image SHA; host data/ was retained and restart will not continue.') }
    $mount = 'type=bind,' + (ConvertTo-DockerMountCsvField -Value ('source=' + $Identity.DataPath)) + ',target=/data,readonly'
    $probeArgs = @(
        'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--mount', $mount,
        '--entrypoint', '/bin/sh', $imageId, '-c', 'test -s /data/config/clean-shutdown && test ! -L /data/config/clean-shutdown'
    )
    $result = Invoke-Docker -DockerArgs $probeArgs -Capture -AllowFailure -RedactFailure
    if ($result.ExitCode -ne 0) { throw (Get-DvMessage 'MySQL 未留下有效的 clean-shutdown 标记；宿主机 data/ 已保留，restart 不会继续。请查看容器日志并确认数据库状态。' 'MySQL did not leave a valid clean-shutdown marker; host data/ was retained and restart will not continue. Check container logs and database state.') }
}

function Invoke-Logs {
    param([object[]] $Containers)
    $container = Select-Container -Containers $Containers
    if ($null -eq $container) { Write-Host (Get-DvMessage '此部署目录尚无容器，无法查看日志。' 'No container exists in this deployment directory; logs are unavailable.'); return 3 }
    [void](Invoke-Docker -DockerArgs @('logs', '--follow', '--tail', '200', $container.Id))
    return 0
}

function Assert-EndpointIdentity {
    param([pscustomobject] $State, [string] $Endpoint)
    if ($State.Endpoint -cne $Endpoint) { throw (Get-DvMessage '当前 Docker endpoint 与 run/docker.endpoint 不一致；没有操作容器或数据。' 'Current Docker endpoint differs from run/docker.endpoint; no containers or data were modified.') }
}

function Get-ControlIdentity {
    Assert-ModeMarker
    $state = Get-RunState
    return [pscustomobject]@{ Project = $state.Project; DataPath = $state.DataPath; MysqlBase = $state.MysqlBase; Paths = $state.Paths; State = $state; Image = (Get-PackageImage) }
}

function Acquire-LauncherLock {
    $paths = Get-IdentityPaths
    if (-not (Test-Path -LiteralPath $script:RunDir -PathType Container)) { [void][System.IO.Directory]::CreateDirectory($script:RunDir) }
    try { return [System.IO.File]::Open($paths.Lock, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None) }
    catch { throw (Get-DvMessage '另一个 Docker allinone 部署操作正在执行；请等待它完成后再试。' 'Another Docker all-in-one deployment operation is running; wait for it to finish and retry.') }
}

function Ensure-DeploymentState {
    param([string] $ProjectName, [string] $Endpoint, [string] $DataPath, [string] $MysqlBase)
    $paths = Get-IdentityPaths
    $state = Get-RunState -AllowAbsent -RecoverPending
    if ($null -ne $state) {
        if ($state.Project -cne $ProjectName -or $state.Endpoint -cne $Endpoint -or
            -not (Test-SamePath $state.DataPath $DataPath) -or $state.MysqlBase -cne $MysqlBase) {
            throw (Get-DvMessage '当前配置、Docker endpoint、data 路径或 MySQL 基础版本与 run 状态记录不一致；没有修改数据。' 'Configuration, Docker endpoint, data path or MySQL base version differs from run records; data was not modified.')
        }
        if ($state.Pending) {
            Remove-Item -LiteralPath $state.Paths.Pending -Force
            $state.Pending = $false
        }
        return $state
    }
    $canonicalDataPath = Assert-DataDirectoryPath -Path $DataPath
    [void](Write-AtomicTextFile -Path $paths.Pending -Text (New-DataIntentText -Project $ProjectName -Endpoint $Endpoint -DataPath $canonicalDataPath -MysqlBase $MysqlBase))
    [void](Write-AtomicTextFile -Path $paths.Project -Text ($ProjectName + "`n"))
    [void](Write-AtomicTextFile -Path $paths.Root -Text ((Get-CanonicalPath $script:Root) + "`n"))
    [void](Write-AtomicTextFile -Path $paths.Endpoint -Text ($Endpoint + "`n"))
    [void](Write-AtomicTextFile -Path $paths.Data -Text ($canonicalDataPath + "`n"))
    [void](Write-AtomicTextFile -Path $paths.MysqlBase -Text ($MysqlBase + "`n"))
    $state = Get-RunState -RecoverPending
    if (Test-Path -LiteralPath $paths.Pending -PathType Leaf) {
        Remove-Item -LiteralPath $paths.Pending -Force
        $state.Pending = $false
    }
    return $state
}

function Ensure-DataDirectory {
    param([string] $DataPath)
    $expected = Get-ExpectedDataPath
    if (-not (Test-SamePath $DataPath $expected)) { throw (Get-DvMessage '数据目录必须是包根目录 data/；没有创建目录或操作容器。' 'Data directory must be package root data/; no directory was created or container modified.') }
    $existing = Get-Item -LiteralPath $expected -Force -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        [void][System.IO.Directory]::CreateDirectory($expected)
        Write-Host (Get-DvMessage "已创建宿主机数据目录：'$expected'。" "Created host data directory: '$expected'.")
    }
    return (Assert-DataDirectoryPath -Path $expected)
}

function Assert-ImageBaseIdentity {
    param([pscustomobject] $Metadata, [pscustomobject] $State)
    if ($null -ne $State -and $State.MysqlBase -cne $Metadata.MysqlBase) { throw (Get-DvMessage "镜像 MySQL 基础版本与 run/mysql.base 记录不一致；拒绝变更或迁移数据库。" "Image MySQL base version differs from run/mysql.base; database changes or migration were refused.") }
}

function Assert-ExpectedEnvironment {
    param([pscustomobject] $Package, [string] $ProjectName)
    if (-not (Test-Path -LiteralPath $script:EnvPath -PathType Leaf)) { throw (Get-DvMessage '包根目录缺少 .env；这是首次运行，请执行无参数启动。检查模式不会生成文件。' 'Package root .env is missing. For initial setup, start without arguments; check mode does not create files.') }
    $text = Read-TextFile $script:EnvPath
    Update-ManagedEnvNames -Text $text
    $document = Get-EnvDocument -Text $text
    $effective = Get-ComposeEnvironment -EnvFile $script:EnvPath
    [void](Get-RequiredDatabaseValues -Document $document -ComposeValues $effective -Interactive:$false)
    if ([string]$effective['DATAVISOOL_IMAGE'] -cne $Package.Image) { throw (Get-DvMessage '.env 中 DATAVISOOL_IMAGE 必须与发布包固定 IMAGE 一致；检查模式不会修改文件。' 'DATAVISOOL_IMAGE in .env must match the package IMAGE; check mode does not modify files.') }
    $state = Get-RunState -AllowAbsent
    if ($null -ne $state) {
        if ($state.Project -cne $ProjectName) { throw (Get-DvMessage 'run/project.name 与当前部署身份不一致。' 'run/project.name differs from the current deployment identity.') }
        if ($document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME') -and [string]$effective['DATAVISOOL_PROJECT_NAME'] -cne $state.Project) { throw (Get-DvMessage '.env 项目名与 run/project.name 不一致。' 'The .env project name differs from run/project.name.') }
    }
    elseif ($document.Entries.ContainsKey('DATAVISOOL_PROJECT_NAME') -and [string]$effective['DATAVISOOL_PROJECT_NAME'] -cne $ProjectName -and [string]$effective['DATAVISOOL_PROJECT_NAME'] -cne 'datavisool-web-allinone') {
        throw (Get-DvMessage '.env 项目名与部署身份不一致。' 'The .env project name differs from the deployment identity.')
    }
    return $effective
}

function Assert-ContainerHealthcheck {
    param([string] $Image)
    $result = Invoke-Docker -DockerArgs @('image', 'inspect', '--format', '{{if .Config.Healthcheck}}{{json .Config.Healthcheck}}{{end}}', $Image) -Capture
    if ([string]::IsNullOrWhiteSpace($result.Text)) { throw (Get-DvMessage 'Docker allinone 必须带有健康检查，不能以无健康检查镜像启动。' 'Docker all-in-one requires an image with a health check.') }
    try { $health = $result.Text | ConvertFrom-Json -ErrorAction Stop } catch { throw (Get-DvMessage '无法解析镜像健康检查配置。' 'Cannot parse image health check configuration.') }
    if ($null -eq $health -or @($health.Test).Count -eq 0 -or [string]$health.Test[0] -match '^(?i:NONE)$') { throw (Get-DvMessage 'Docker allinone 的健康检查缺失或已禁用。' 'Docker all-in-one health check is missing or disabled.') }
}

function Invoke-Start {
    param([pscustomobject] $Package, [pscustomobject] $Engine, [string] $ProjectName, [int] $Timeout, [bool] $Restarted)
    $state = Get-RunState -AllowAbsent -RecoverPending
    if ($null -ne $state) { Assert-EndpointIdentity -State $state -Endpoint $Engine.Endpoint }
    $metadata = Ensure-LocalImage -Package $Package
    Assert-ImageBaseIdentity -Metadata $metadata -State $state
    Assert-ContainerHealthcheck -Image $Package.Image

    $dataPath = if ($null -ne $state) { $state.DataPath } else { Get-ExpectedDataPath }
    $identity = [pscustomobject]@{ Project = $ProjectName; DataPath = $dataPath; Paths = (Get-IdentityPaths) }
    $containers = @(Get-Containers -Identity $identity -ExpectedImage $Package.Image)
    $existing = Select-Container -Containers $containers
    if ($null -ne $existing) { [void](Assert-DataDirectoryPath -Path $dataPath) }
    $prepared = Test-EnvAndPrepare -Package $Package -ProjectName $ProjectName -Commit
    [void](Assert-ComposeConfig -ProjectName $ProjectName -ExpectedImage $Package.Image -ExpectedDataPath $dataPath)
    $expectedPorts = Get-HostPortSettings -Values (Get-ComposeEnvironment -EnvFile $script:EnvPath)
    if ($null -ne $state -and $null -ne $existing -and $existing.State -ceq 'running' -and -not $Restarted) {
        Assert-RunningContainerPortMappings -Container $existing -Expected $expectedPorts
        if (Test-Path -LiteralPath $script:EnvPath -PathType Leaf) { Set-PrivateEnvFileAcl -Path $script:EnvPath }
        Write-Host (Get-DvMessage "Docker allinone 容器已在运行，ID=$($existing.Id)，健康状态=$($existing.Health)；当前宿主机端口映射已与 .env 一致，不会重建或升级。" "Docker all-in-one container is already running, ID=$($existing.Id), health=$($existing.Health); host port mappings match .env. It will not be recreated or upgraded.")
        Write-Host (Get-DvMessage '查看日志：deploy_windows.cmd --logs' 'View logs: deploy_windows.cmd --logs')
        return 0
    }
    Ensure-ModeMarker
    $dataPath = Ensure-DataDirectory -DataPath $dataPath
    $state = Ensure-DeploymentState -ProjectName $ProjectName -Endpoint $Engine.Endpoint -DataPath $dataPath -MysqlBase $metadata.MysqlBase

    $identity = [pscustomobject]@{ Project = $ProjectName; DataPath = $state.DataPath; Paths = $state.Paths }
    $existing = @(Get-Containers -Identity $identity -ExpectedImage $Package.Image)
    $container = Select-Container -Containers $existing
    Write-Host (Get-DvMessage "正在启动 Docker allinone 容器并等待应用与 MySQL 健康检查（最多 $Timeout 秒）……" "Starting Docker all-in-one and waiting for application and MySQL health checks (up to $Timeout seconds)...")
    try {
        [void](Invoke-Compose -ProjectName $ProjectName -ComposeArgs @('up', '--detach', '--wait', '--wait-timeout', [string]$Timeout, '--pull', 'never'))
        $containers = @(Get-Containers -Identity $identity -ExpectedImage $Package.Image)
        $container = Select-Container -Containers $containers
        if ($null -eq $container -or $container.State -cne 'running') { throw (Get-DvMessage 'Compose 命令完成，但没有找到运行中的 Docker allinone 容器。' 'Compose completed but no running Docker all-in-one container was found.') }
        if ($container.Health -cne 'healthy') { throw (Get-DvMessage "容器未达到 healthy 状态（当前状态=$($container.Health)）。" "Container did not become healthy (current health=$($container.Health)).") }
        Assert-ContainerPortMappings -Container $container -Expected $expectedPorts
        Write-ContainerId -Paths $state.Paths -Id $container.Id
    }
    catch {
        try {
            $failed = @(Get-Containers -Identity $identity -ExpectedImage $Package.Image)
            $failedContainer = Select-Container -Containers $failed
            if ($null -ne $failedContainer) { Write-ContainerId -Paths $state.Paths -Id $failedContainer.Id }
        }
        catch { }
        throw (Get-DvMessage "Docker allinone 容器未通过启动健康检查或宿主机端口映射验证；容器和宿主机 data/ 已保留供排查。查看日志：deploy_windows.cmd --logs`n$($_.Exception.Message)" "Docker all-in-one failed startup health or host port mapping checks; container and host data/ retained for investigation. Logs: deploy_windows.cmd --logs`n$($_.Exception.Message)")
    }
    if ($Restarted) { Write-Host (Get-DvMessage "Docker allinone 已重启并通过健康检查，容器 ID=$($container.Id)。" "Docker all-in-one restarted and passed health checks, container ID=$($container.Id).") }
    else { Write-Host (Get-DvMessage "Docker allinone 已启动并通过健康检查，容器 ID=$($container.Id)。" "Docker all-in-one started and passed health checks, container ID=$($container.Id).") }
    Write-Host (Get-DvMessage '查看日志：deploy_windows.cmd --logs；查看状态：deploy_windows.cmd --status；停止：deploy_windows.cmd --stop' 'Logs: deploy_windows.cmd --logs; status: deploy_windows.cmd --status; stop: deploy_windows.cmd --stop')
    return 0
}

function Invoke-Check {
    param([pscustomobject] $Package, [string] $ProjectName)
    $engine = Assert-DockerEngine -RequireCompose:$true -ExpectedPlatform $Package.Platform
    $effective = Assert-ExpectedEnvironment -Package $Package -ProjectName $ProjectName
    $state = Get-RunState -AllowAbsent
    $dataPath = if ($null -ne $state) { $state.DataPath } else { Get-ExpectedDataPath }
    if ($null -ne $state) { Assert-EndpointIdentity -State $state -Endpoint $engine.Endpoint }
    else { [void](Assert-DataDirectoryPath -Path $dataPath -AllowMissing) }
    [void](Assert-ComposeConfig -ProjectName $ProjectName -ExpectedImage $Package.Image -ExpectedDataPath $dataPath)
    $identity = [pscustomobject]@{ Project = $ProjectName; DataPath = $dataPath; Paths = (Get-IdentityPaths) }
    $containers = @(Get-Containers -Identity $identity -ExpectedImage $Package.Image)
    if ($containers.Count -gt 0) { [void](Assert-DataDirectoryPath -Path $dataPath) }
    if ($containers.Count -eq 1) {
        $expectedPorts = Get-HostPortSettings -Values (Get-ComposeEnvironment -EnvFile $script:EnvPath)
        Assert-ContainerPortMappings -Container $containers[0] -Expected $expectedPorts
    }
    $metadata = Get-ImageMetadata -Image $Package.Image -ExpectedPlatform $Package.Platform
    if ($null -eq $metadata) {
        if (-not (Test-Path -LiteralPath (Join-Path $script:Root 'image.tar') -PathType Leaf)) { throw (Get-DvMessage "本机缺少镜像 '$($Package.Image)'，发布包也缺少 image.tar。" "Local image '$($Package.Image)' and package image.tar are missing.") }
        Write-Host (Get-DvMessage "检查通过；启动时会从 image.tar 导入 '$($Package.Image)' 并验证 MySQL 基础版本。" "Checks passed; '$($Package.Image)' will be imported from image.tar and its MySQL base version verified at startup.")
    }
    else {
        Assert-ContainerHealthcheck -Image $Package.Image
        Assert-ImageBaseIdentity -Metadata $metadata -State $state
        Write-Host (Get-DvMessage "检查通过；镜像平台匹配，MySQL 基础版本=$($metadata.MysqlBase)。" "Checks passed; image platform matches, MySQL base version=$($metadata.MysqlBase).")
    }
    Write-Host (Get-DvMessage '检查未创建或修改文件、data 目录、容器，也未导入镜像。' 'Checks did not create or modify files, data directory or containers, or import images.')
    return 0
}

function Invoke-Main {
    $mode = 'start'
    $timeout = 600
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
            $operationProvided = $true; $mode = $arg.Substring(2)
        }
        else { throw (Get-DvMessage "不支持的参数 '$arg'。运行 deploy_windows.cmd --help 查看用法。" "Unsupported argument '$arg'. Run deploy_windows.cmd --help for usage.") }
    }
    if ($mode -eq 'help') { Write-Usage; return 0 }
    if ($timeoutProvided -and $mode -notin @('start', 'restart')) { throw (Get-DvMessage '--wait-timeout 仅可用于启动和重启。' '--wait-timeout can only be used to start or restart.') }
    Assert-ModeMarker

    if ($mode -in @('status', 'stop', 'logs')) {
        $identity = Get-ControlIdentity
        $engine = Assert-DockerEngine -RequireCompose:$false -ExpectedPlatform:$null
        Assert-EndpointIdentity -State $identity.State -Endpoint $engine.Endpoint
        $containers = @(Get-Containers -Identity $identity -ExpectedImage $identity.Image)
        if ($mode -eq 'status') { return (Invoke-Status -Containers $containers) }
        if ($mode -eq 'logs') { return (Invoke-Logs -Containers $containers) }
        $lock = Acquire-LauncherLock
        try {
            $containers = @(Get-Containers -Identity $identity -ExpectedImage $identity.Image)
            return (Invoke-Stop -Containers $containers -Identity $identity -ExpectedImage $identity.Image)
        }
        finally { $lock.Dispose() }
    }

    $package = Get-Package
    if ($mode -eq 'check') {
        if (-not (Test-Path -LiteralPath $script:EnvPath -PathType Leaf)) { throw (Get-DvMessage '包根目录缺少 .env；这是首次运行，请执行无参数启动。检查模式不会生成文件。' 'Package root .env is missing. For initial setup, start without arguments; check mode does not create files.') }
        return (Invoke-Check -Package $package -ProjectName (Get-ProjectName -RequireEnv))
    }
    $engine = Assert-DockerEngine -RequireCompose:$true -ExpectedPlatform $package.Platform
    $lock = Acquire-LauncherLock
    try {
        $projectName = Get-ProjectName -RecoverPending
        if ($mode -eq 'restart') {
            $state = Get-RunState -AllowAbsent -RecoverPending
            if ($null -ne $state) {
                Assert-EndpointIdentity -State $state -Endpoint $engine.Endpoint
                $identity = [pscustomobject]@{ Project = $state.Project; DataPath = $state.DataPath; Paths = $state.Paths }
                $containers = @(Get-Containers -Identity $identity -ExpectedImage $package.Image)
                if ($containers.Count -gt 0 -and (Invoke-Stop -Containers $containers -Identity $identity -ExpectedImage $package.Image) -ne 0) {
                    throw (Get-DvMessage 'Docker allinone 未正常停止；restart 不会继续启动应用或 MySQL。' 'Docker all-in-one did not stop cleanly; restart will not start the application or MySQL.')
                }
            }
        }
        return (Invoke-Start -Package $package -Engine $engine -ProjectName $projectName -Timeout $timeout -Restarted:($mode -eq 'restart'))
    }
    finally { $lock.Dispose() }
}

try {
    $exitCode = Invoke-Main
    exit [int]$exitCode
}
catch {
    [System.Console]::Error.WriteLine((Get-DvMessage 'Docker allinone 部署失败：{0}' 'Docker all-in-one deployment failed: {0}'), $_.Exception.Message)
    exit 1
}
