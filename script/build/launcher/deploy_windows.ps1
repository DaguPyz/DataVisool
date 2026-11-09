# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
$Arguments = @($args)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$dvLocale = if ([string]::IsNullOrWhiteSpace($env:DATAVISOOL_LANG)) { [System.Globalization.CultureInfo]::CurrentUICulture.Name } else { $env:DATAVISOOL_LANG }
$script:DvLanguage = if ($dvLocale -match '^(?i:en)(?:[-_]|$)') { 'en-US' } else { 'zh-CN' }
$env:DATAVISOOL_LANG = $script:DvLanguage
function Get-DvMessage([string] $Chinese, [string] $English) {
    if ($script:DvLanguage -eq 'en-US') { return $English }
    return $Chinese
}

if ($Arguments.Count -eq 2 -and $Arguments[0] -eq '--wrapper-pause-message') {
    if ($Arguments[1] -eq '0') {
        Write-Host (Get-DvMessage '应用在后台运行，关闭此窗口不会停止应用。' 'The application is running in the background. Closing this window will not stop it.')
    } else {
        Write-Host (Get-DvMessage '部署未完成，请查看上方错误。' 'Deployment did not complete. Review the error above.')
    }
    Write-Host (Get-DvMessage '按任意键关闭窗口。' 'Press any key to close this window.')
    exit 0
}

function Write-Usage {
    if ($script:DvLanguage -eq 'en-US') {
@'
Native deployment
Usage: deploy_windows.cmd [--help|-h|--check|--status|--stop|--restart]
  (no option)  Check requirements, request missing settings, and start the application.
  --check      Check requirements without prompting, changing files or starting.
  --status     Show the recorded instance status.
  --stop       Stop the recorded instance.
  --restart    Stop the instance and then start it again.
  --help, -h   Show this help.
Java 17 and an existing MySQL database are required. Missing database settings are requested interactively.
Configuration is backed up before changes. Logs are in logs/startup.stdout.log and logs/startup.stderr.log.
On Windows, stopping directly terminates Java without running its shutdown hooks.
For a new database, the administrator password is requested without writing it to the configuration.
Startup waits up to 120 seconds for the application and local HTTP checks.
'@ | Write-Output
        return
    }
    @'
用法：deploy_windows.cmd [--help|-h|--check|--status|--stop|--restart]

  (无参数)   检查环境，交互式补齐数据库配置并在后台启动应用。
  --check    只检查压缩包、数据库配置和 Java 17；不提示、不修改文件、不启动。
  --status   查看本脚本启动的应用进程状态。
  --stop     停止本脚本启动的应用进程（Windows 会直接终止进程，不运行 Java 关闭钩子）。
  --restart  停止本脚本启动的应用进程，再检查配置和 Java 17 并在后台启动；未运行时直接启动。
  --help, -h 显示帮助。

数据库配置保存到 config/application.yml，每次修改都会在同目录生成独立备份文件。
后台进程日志位于 logs/startup.stdout.log 和 logs/startup.stderr.log。
需要 Java 17。找不到可用 Java 17 时，正常启动会询问 JDK 安装目录（不会修改系统环境）。本脚本只支持常规部署，不安装软件、不创建数据库，也不注册系统服务。
'@ | Write-Output
}

function Test-ReadableFile {
    param([Parameter(Mandatory = $true)][string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $stream = $null
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        return $true
    }
    catch { return $false }
    finally { if ($null -ne $stream) { $stream.Dispose() } }
}

function Test-Java17Executable {
    param([Parameter(Mandatory = $true)][string] $JavaPath)
    if (-not (Test-Path -LiteralPath $JavaPath -PathType Leaf)) { throw (Get-DvMessage "找不到 Java 可执行文件：'$JavaPath'。" "Java executable not found: '$JavaPath'.") }
    $JavaPath = (Get-Item -LiteralPath $JavaPath).FullName
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $JavaPath
    $startInfo.Arguments = '-version'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw (Get-DvMessage "无法启动 Java：'$JavaPath'。" "Cannot start Java: '$JavaPath'.") }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $versionText = $stdoutTask.Result + "`n" + $stderrTask.Result
        $versionExitCode = $process.ExitCode
    }
    finally { $process.Dispose() }

    if ($versionExitCode -ne 0) { throw (Get-DvMessage "无法读取 Java 版本（退出码 $versionExitCode）。请检查：'$javaPath'。" "Cannot read the Java version (exit code $versionExitCode). Check '$javaPath'.") }
    if ($versionText -notmatch '(?im)(?:version\s+"|openjdk\s+)(?<major>\d+)') { throw (Get-DvMessage "无法识别 Java 版本。输出：$versionText" "Cannot identify the Java version. Output: $versionText") }
    if ($Matches['major'] -ne '17') { throw (Get-DvMessage "需要 Java 17；'$JavaPath' 报告的主版本是 $($Matches['major'])。" "Java 17 is required; '$JavaPath' reports major version $($Matches['major']).") }
    return $JavaPath
}

function Resolve-Java17 {
    param([bool] $AllowInteractive = $false)
    $javaPath = $null
    $initialFailure = $null
    try {
        if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
            $javaPath = Join-Path $env:JAVA_HOME 'bin\java.exe'
        }
        else {
            $javaCommand = Get-Command -Name 'java.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($null -eq $javaCommand) { $javaCommand = Get-Command -Name 'java' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 }
            if ($null -ne $javaCommand) { $javaPath = $javaCommand.Source }
        }
        if ($null -ne $javaPath) { return (Test-Java17Executable -JavaPath $javaPath) }
        $initialFailure = (Get-DvMessage '未找到 Java。' 'Java was not found.')
    }
    catch { $initialFailure = $_.Exception.Message }

    if (-not $AllowInteractive) {
        throw (Get-DvMessage "$initialFailure 请安装 Java 17，或修正 JAVA_HOME / PATH 后重试。" "$initialFailure Install Java 17 or correct JAVA_HOME / PATH and retry.")
    }
    if ([Console]::IsInputRedirected) {
        throw (Get-DvMessage "$initialFailure 当前没有可用的终端输入，无法询问 JDK 路径。请在 Windows 终端中运行部署脚本。" "$initialFailure No interactive terminal is available. Run the deployment script in a Windows terminal.")
    }

    Write-Host $initialFailure -ForegroundColor Yellow
    Write-Host (Get-DvMessage '请提供 Java 17 的 JDK 安装目录（该目录下应有 bin\java.exe）；此路径只用于本次启动，不会修改系统环境。' 'Enter the Java 17 JDK installation directory (containing bin\java.exe). It is used only for this launch.')
    while ($true) {
        $jdkRoot = Read-Host (Get-DvMessage 'JDK 安装目录（直接回车取消）' 'JDK installation directory (press Enter to cancel)')
        if ([string]::IsNullOrWhiteSpace($jdkRoot)) { throw (Get-DvMessage '已取消：没有提供 JDK 安装目录。' 'Cancelled: no JDK installation directory was provided.') }
        $jdkRoot = $jdkRoot.Trim()
        if ($jdkRoot.Length -ge 2 -and (($jdkRoot.StartsWith('"') -and $jdkRoot.EndsWith('"')) -or ($jdkRoot.StartsWith("'") -and $jdkRoot.EndsWith("'")))) {
            $jdkRoot = $jdkRoot.Substring(1, $jdkRoot.Length - 2)
        }
        if ([string]::IsNullOrWhiteSpace($jdkRoot)) { throw (Get-DvMessage '已取消：没有提供 JDK 安装目录。' 'Cancelled: no JDK installation directory was provided.') }

        try {
            $candidateJava = Join-Path $jdkRoot 'bin\java.exe'
            return (Test-Java17Executable -JavaPath $candidateJava)
        }
        catch {
            Write-Host (Get-DvMessage "无法使用该 JDK：$($_.Exception.Message)" "Cannot use that JDK: $($_.Exception.Message)") -ForegroundColor Yellow
            Write-Host (Get-DvMessage '请重新输入有效的 Java 17 JDK 安装目录；直接回车可取消。' 'Enter a valid Java 17 JDK directory, or press Enter to cancel.')
        }
    }
}

function Test-ConfigPlaceholder {
    param([string] $Field, [string] $Value)
    $placeholder = switch ($Field) {
        'username' { 'change_me_database_user(?:name)?' }
        'password' { 'change_me_database_password' }
        default { return $false }
    }
    $quotedOrPlain = "(?:'$placeholder'|" + [char]34 + $placeholder + [char]34 + "|$placeholder)"
    $pattern = '^\s*' + $quotedOrPlain + '(?:[ \t]+#.*)?\s*$'
    return [regex]::IsMatch($Value, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}

function Test-ConfigValueMissing {
    param([string] $Field, [string] $Value)
    $candidate = $Value.Trim()
    if ($candidate -match '^\s*(?:#.*)?$') { return $true }
    if ($candidate -match '^(?i:null|~)\s*(?:#.*)?$') { return $true }
    if ($candidate -match '^(?:''[ \t]*''|"[ \t]*")(?:[ \t]+#.*)?\s*$') { return $true }
    return Test-ConfigPlaceholder -Field $Field -Value $Value
}

function Get-JdbcUrlConfiguration {
    param([string] $RawValue)

    $candidate = $RawValue.Trim()
    $value = $null
    if ($candidate.StartsWith("'")) {
        if ($candidate -notmatch "^'(?<scalar>(?:''|[^'])*)'[ \t]*(?:#.*)?$") {
            throw (Get-DvMessage '数据库 JDBC URL 格式不正确。请检查 config/application.yml 中的数据库主机和端口，或恢复发布包里的配置模板。' 'Invalid database JDBC URL. Check the host and port in config/application.yml or restore the package template.')
        }
        $value = $Matches['scalar'].Replace("''", "'")
    }
    elseif ($candidate.StartsWith('"')) {
        if ($candidate -notmatch '^"(?<scalar>[^"]*)"[ \t]*(?:#.*)?$') {
            throw (Get-DvMessage '数据库 JDBC URL 格式不正确。请检查 config/application.yml 中的数据库主机和端口，或恢复发布包里的配置模板。' 'Invalid database JDBC URL. Check the host and port in config/application.yml or restore the package template.')
        }
        $value = $Matches['scalar']
    }
    else {
        if ($candidate -match '^\s*(?:#.*)?$' -or $candidate -match '^(?i:null|~)\s*(?:#.*)?$') {
            throw (Get-DvMessage '数据库 JDBC URL 为空。请在 config/application.yml 中填写数据库主机和端口，或恢复发布包里的配置模板。' 'The database JDBC URL is empty. Set the host and port in config/application.yml or restore the package template.')
        }
        if ($candidate -match '^(?<scalar>.*?)(?:[ \t]+#.*)?[ \t]*$') { $value = $Matches['scalar'].TrimEnd() }
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
        throw (Get-DvMessage '数据库 JDBC URL 为空。请在 config/application.yml 中填写数据库主机和端口，或恢复发布包里的配置模板。' 'The database JDBC URL is empty. Set the host and port in config/application.yml or restore the package template.')
    }

    $urlPattern = '^jdbc:mysql://(?<authority>[^/?#\s]+)/(?<database>[^/?#\s]*)(?<query>\?[^\s]*)?$'
    $match = [regex]::Match($value, $urlPattern)
    if (-not $match.Success) {
        throw (Get-DvMessage '数据库 JDBC URL 格式不正确。请在 config/application.yml 中填写 jdbc:mysql://主机:端口/数据库名?参数，检查主机和端口后重试。' 'Invalid database JDBC URL. Use jdbc:mysql://host:port/database?parameters and verify the host and port.')
    }
    if ($match.Groups['authority'].Value -match '^(?i:mysql-host)(?::\d+)?$') {
        throw (Get-DvMessage '数据库 JDBC URL 仍使用 mysql-host 模板占位主机。请在 config/application.yml 中填写实际主机和端口，或恢复发布包里的配置模板。' 'The JDBC URL still uses the mysql-host placeholder. Set the actual host and port or restore the template.')
    }

    $databaseName = $match.Groups['database'].Value
    $needsDatabaseName = [string]::IsNullOrEmpty($databaseName) -or $databaseName -ieq 'CHANGE_ME_DATABASE_NAME'
    $prefix = $value.Substring(0, $match.Groups['database'].Index)
    return [pscustomobject]@{
        NeedsDatabaseName = $needsDatabaseName
        Prefix = $prefix
        Query = $match.Groups['query'].Value
        Value = $value
    }
}

function Get-DatabaseConfiguration {
    param([string] $Text)
    if ($Text.Contains("`r`n")) {
        $newline = "`r`n"
        $withoutCrLf = $Text.Replace("`r`n", '')
        if ($withoutCrLf.Contains("`n") -or $withoutCrLf.Contains("`r")) { throw (Get-DvMessage '配置文件混用了不同换行格式；请先统一换行格式。' 'The configuration mixes line endings. Use one consistent line ending.') }
    }
    else {
        $newline = "`n"
        if ($Text.Contains("`r")) { throw (Get-DvMessage '配置文件使用了不支持的回车换行格式；请先转换成 LF 或 CRLF。' 'Unsupported configuration line endings. Convert them to LF or CRLF.') }
    }

    $lines = $Text.Split([string[]]@($newline), [System.StringSplitOptions]::None)
    $fields = @('url', 'username', 'password')
    $entries = @{}
    foreach ($field in $fields) { $entries[$field] = New-Object System.Collections.ArrayList }

    # The release template has one plain, line-based entry for each field.
    # Match only those names; comments and every other YAML line are ignored.
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = [string]$lines[$i]
        if ($line -cmatch '^(?<prefix>[ \t]*(?<key>url|username|password)[ \t]*:[ \t]*)(?<value>.*)$') {
            $field = $Matches['key']
            [void]$entries[$field].Add([pscustomobject]@{
                Index = $i
                Prefix = $Matches['prefix']
                Value = $Matches['value']
            })
        }
    }

    $missing = New-Object System.Collections.ArrayList
    foreach ($field in $fields) {
        if ($entries[$field].Count -eq 0) {
            throw (Get-DvMessage "配置文件缺少 '$field' 行；请从发布包恢复该行后重新运行。脚本不会创建或猜测配置层级。" "Configuration field '$field' is missing. Restore it from the package; the script will not guess the configuration hierarchy.")
        }
        if ($entries[$field].Count -gt 1) {
            throw (Get-DvMessage "配置文件中 '$field' 行出现多次；请保留唯一的数据库配置行后重新运行。" "Configuration field '$field' occurs more than once. Keep one entry and retry.")
        }
        if ($field -ceq 'url') {
            $urlConfiguration = Get-JdbcUrlConfiguration -RawValue $entries[$field][0].Value
            if ($urlConfiguration.NeedsDatabaseName) { [void]$missing.Add($field) }
        }
        elseif (Test-ConfigValueMissing -Field $field -Value $entries[$field][0].Value) { [void]$missing.Add($field) }
    }
    return [pscustomobject]@{ Lines = $lines; Newline = $newline; Paths = $fields; Missing = $missing; Entries = $entries; Url = $urlConfiguration }
}

function Set-ConfigLineValue {
    param([System.Collections.ArrayList] $Lines, [pscustomobject] $Entry, [string] $Value)
    $safeValue = $Value.Replace("'", "''")
    # Only replace the value on this matched line. Existing inline comments on
    # this line may be dropped; all other lines remain unchanged.
    $Lines[$Entry.Index] = $Entry.Prefix.TrimEnd() + " '$safeValue'"
}

function Read-InteractiveValue {
    param([string] $Path, [pscustomobject] $UrlConfiguration)
    while ($true) {
        if ($Path -ceq 'password') {
            $secure = Read-Host -Prompt (Get-DvMessage 'MySQL 密码' 'MySQL password') -AsSecureString
            $ptr = [IntPtr]::Zero
            try {
                $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
                $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
            }
            finally {
                if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
                if ($null -ne $secure) { $secure.Dispose() }
            }
        }
        elseif ($Path -ceq 'username') { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 用户名' 'MySQL username') }
        else { $value = Read-Host -Prompt (Get-DvMessage 'MySQL 数据库名称（例如 datavisool_server02）' 'MySQL database name (for example datavisool_server02)') }

        if ([string]::IsNullOrWhiteSpace($value)) { Write-Host (Get-DvMessage '此项不能为空，请重新输入。' 'This value cannot be empty. Try again.') -ForegroundColor Yellow; continue }
        if ($value -match '[\r\n\x00-\x08\x0B\x0C\x0E-\x1F]') { Write-Host (Get-DvMessage '此项不能包含换行或控制字符，请重新输入。' 'This value cannot contain newlines or control characters. Try again.') -ForegroundColor Yellow; continue }
        if ($Path -ceq 'url') {
            if ($value -match '^(?i:jdbc:mysql)://') {
                Write-Host (Get-DvMessage '这里只需输入数据库名称，不要输入完整 JDBC URL。' 'Enter only the database name, not a full JDBC URL.') -ForegroundColor Yellow
                continue
            }
            if ($value -ieq 'CHANGE_ME_DATABASE_NAME') {
                Write-Host (Get-DvMessage '请替换数据库名称占位值。' 'Replace the database name placeholder.') -ForegroundColor Yellow
                continue
            }
            if ($value -notmatch '^[A-Za-z0-9_-]{1,64}$') {
                Write-Host (Get-DvMessage '数据库名称只能包含英文字母、数字、下划线和连字符，长度为 1 到 64 个字符。' 'The database name must be 1–64 characters using letters, digits, underscores or hyphens.') -ForegroundColor Yellow
                continue
            }
            return [string]($UrlConfiguration.Prefix + $value + $UrlConfiguration.Query)
        }
        if (Test-ConfigPlaceholder -Field $Path -Value $value) { Write-Host (Get-DvMessage '请替换模板占位值。' 'Replace the template placeholder.') -ForegroundColor Yellow; continue }
        return [string]$value
    }
}

function Write-UpdatedConfiguration {
    param([string] $ConfigPath, [pscustomobject] $Database, [hashtable] $Answers, [bool] $HasUtf8Bom, [byte[]] $OriginalBytes)
    $lines = New-Object System.Collections.ArrayList
    foreach ($line in $Database.Lines) { [void]$lines.Add([string]$line) }
    foreach ($path in $Database.Paths) {
        if ($Answers.ContainsKey($path)) { Set-ConfigLineValue -Lines $lines -Entry $Database.Entries[$path][0] -Value $Answers[$path] }
    }
    $updatedText = [string]::Join($Database.Newline, [string[]]$lines.ToArray())
    # Parse the proposed text before touching the original file.
    $updated = Get-DatabaseConfiguration -Text $updatedText
    if ($updated.Missing.Count -gt 0) { throw (Get-DvMessage '补齐后的数据库配置仍不完整，原文件没有更改。' 'Database configuration is still incomplete; the original file was not changed.') }
    $utf8 = [System.Text.UTF8Encoding]::new([bool]$HasUtf8Bom)
    $textBytes = $utf8.GetBytes($updatedText)
    if ($HasUtf8Bom) {
        $preamble = $utf8.GetPreamble()
        $bytes = [byte[]]::new($preamble.Length + $textBytes.Length)
        [Array]::Copy($preamble, 0, $bytes, 0, $preamble.Length)
        [Array]::Copy($textBytes, 0, $bytes, $preamble.Length, $textBytes.Length)
    }
    else { $bytes = $textBytes }
    $directory = Split-Path -Parent $ConfigPath
    $temporaryPath = Join-Path $directory ('.application.yml.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $backupPath = $ConfigPath + '.bak.' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '.' + [Guid]::NewGuid().ToString('N')
    $guard = $null
    try {
        # Keep the existing file open without write sharing while we compare,
        # back it up, and atomically replace it. This prevents overwriting an
        # edit made while the interactive prompts were open.
        $guard = [System.IO.File]::Open($ConfigPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::Read -bor [System.IO.FileShare]::Delete))
        $currentBytes = [byte[]]::new([int]$guard.Length)
        $readOffset = 0
        while ($readOffset -lt $currentBytes.Length) {
            $count = $guard.Read($currentBytes, $readOffset, $currentBytes.Length - $readOffset)
            if ($count -le 0) { throw (Get-DvMessage '读取当前配置快照时文件意外结束。' 'The configuration snapshot ended unexpectedly.') }
            $readOffset += $count
        }
        if ($currentBytes.Length -ne $OriginalBytes.Length) { throw (Get-DvMessage '配置文件在提示期间被其他程序修改；为保留修改，未覆盖文件，请重新运行部署脚本。' 'The configuration changed while prompting. It was not overwritten; rerun the launcher.') }
        for ($i = 0; $i -lt $currentBytes.Length; $i++) {
            if ($currentBytes[$i] -ne $OriginalBytes[$i]) { throw (Get-DvMessage '配置文件在提示期间被其他程序修改；为保留修改，未覆盖文件，请重新运行部署脚本。' 'The configuration changed while prompting. It was not overwritten; rerun the launcher.') }
        }

        $temporaryStream = [System.IO.File]::Open($temporaryPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try { $temporaryStream.Write($bytes, 0, $bytes.Length); $temporaryStream.Flush($true) }
        finally { $temporaryStream.Dispose() }
        $oldAcl = Get-Acl -LiteralPath $ConfigPath
        Set-Acl -LiteralPath $temporaryPath -AclObject $oldAcl
        [System.IO.File]::Copy($ConfigPath, $backupPath, $false)
        [System.IO.File]::Replace($temporaryPath, $ConfigPath, [System.Management.Automation.Language.NullString]::Value)
    }
    catch {
        throw (Get-DvMessage "保存数据库配置失败；原配置保持不变。错误：$($_.Exception.Message)" "Failed to save database configuration; the original was retained. Error: $($_.Exception.Message)")
    }
    finally {
        if ($null -ne $guard) { $guard.Dispose() }
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue }
    }
    Write-Output (Get-DvMessage "数据库配置已保存到 '$ConfigPath'；原文件备份为 '$backupPath'。" "Database configuration saved to '$ConfigPath'; original backup: '$backupPath'.")
}

function Get-TrackingPaths {
    param([string] $PackageRoot)
    $runDirectory = Join-Path $PackageRoot 'run'
    return [pscustomobject]@{
        PackageRoot = $PackageRoot
        Directory = $runDirectory
        Metadata = Join-Path $runDirectory 'application.json'
        Pid = Join-Path $runDirectory 'application.pid'
        Lock = Join-Path $runDirectory 'launcher.lock'
        Stdin = Join-Path $runDirectory 'startup.stdin'
        Stdout = Join-Path (Join-Path $PackageRoot 'logs') 'startup.stdout.log'
        Stderr = Join-Path (Join-Path $PackageRoot 'logs') 'startup.stderr.log'
    }
}

function Read-TrackingRecord {
    param([pscustomobject] $Paths)
    if (-not (Test-Path -LiteralPath $Paths.Metadata -PathType Leaf)) { return $null }
    try { return (Get-Content -LiteralPath $Paths.Metadata -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { throw (Get-DvMessage "进程记录 '$($Paths.Metadata)' 无法读取；为避免操作其他进程，未执行任何进程操作。" "Cannot read process record '$($Paths.Metadata)'; no process was modified.") }
}

function Get-VerifiedTrackedProcess {
    param([pscustomobject] $Record, [string] $PackageRoot)
    if ($null -eq $Record) { return [pscustomobject]@{ State = 'none'; Process = $null } }
    if (-not $Record.Pid -or -not $Record.StartTimeUtcTicks -or -not $Record.LaunchId -or -not $Record.JavaPath -or -not $Record.JarPath -or -not $Record.PackageRoot) {
        return [pscustomobject]@{ State = 'invalid'; Process = $null }
    }
    $expectedRoot = [System.IO.Path]::GetFullPath($PackageRoot)
    $expectedJar = [System.IO.Path]::GetFullPath((Join-Path $expectedRoot 'server.jar'))
    if (-not [string]::Equals([System.IO.Path]::GetFullPath([string]$Record.PackageRoot), $expectedRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals([System.IO.Path]::GetFullPath([string]$Record.JarPath), $expectedJar, [StringComparison]::OrdinalIgnoreCase)) {
        return [pscustomobject]@{ State = 'stale'; Process = $null }
    }
    try { $process = Get-Process -Id ([int]$Record.Pid) -ErrorAction Stop }
    catch { return [pscustomobject]@{ State = 'stale'; Process = $null } }
    try { $actualStart = $process.StartTime.ToUniversalTime().Ticks }
    catch { return [pscustomobject]@{ State = 'unverifiable'; Process = $null } }
    if ([Math]::Abs([double]$actualStart - [double]$Record.StartTimeUtcTicks) -gt [TimeSpan]::TicksPerSecond * 2) {
        return [pscustomobject]@{ State = 'stale'; Process = $null }
    }

    $actual = $null
    try {
        if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
            $actual = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $([int]$Record.Pid)" -ErrorAction Stop
        }
        else { $actual = Get-WmiObject -Class Win32_Process -Filter "ProcessId = $([int]$Record.Pid)" -ErrorAction Stop }
    }
    catch { return [pscustomobject]@{ State = 'unverifiable'; Process = $null } }
    if ($null -eq $actual -or [string]::IsNullOrWhiteSpace([string]$actual.ExecutablePath) -or [string]::IsNullOrWhiteSpace([string]$actual.CommandLine)) {
        return [pscustomobject]@{ State = 'unverifiable'; Process = $null }
    }
    if (-not [string]::Equals([IO.Path]::GetFullPath([string]$actual.ExecutablePath), [IO.Path]::GetFullPath([string]$Record.JavaPath), [StringComparison]::OrdinalIgnoreCase)) {
        return [pscustomobject]@{ State = 'stale'; Process = $null }
    }
    $token = '-Ddatavisool.deployment.launcher-id=' + [string]$Record.LaunchId
    if (-not ([string]$actual.CommandLine).Contains($token)) { return [pscustomobject]@{ State = 'stale'; Process = $null } }
    if (-not ([string]$actual.CommandLine).Contains([string]$Record.JarPath)) { return [pscustomobject]@{ State = 'stale'; Process = $null } }
    return [pscustomobject]@{ State = 'running'; Process = $process }
}

function Write-AtomicTextFile {
    param([string] $Path, [string] $Text)
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [System.IO.File]::WriteAllText($temporary, $Text, [System.Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $Path) { [System.IO.File]::Replace($temporary, $Path, [System.Management.Automation.Language.NullString]::Value) }
        else { [System.IO.File]::Move($temporary, $Path) }
    }
    finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue } }
}

function Invoke-Status {
    param([pscustomobject] $Paths)
    $record = Read-TrackingRecord -Paths $Paths
    $verified = Get-VerifiedTrackedProcess -Record $record -PackageRoot $Paths.PackageRoot
    switch ($verified.State) {
        'none' { Write-Host (Get-DvMessage '当前没有由此部署脚本记录的应用进程。' 'No application process is recorded by this deployment script.'); return 3 }
        'running' {
            Write-Host (Get-DvMessage "应用进程正在运行，PID=$($record.Pid)。" "Application process is running, PID=$($record.Pid).")
            Write-Host (Get-DvMessage "日志：$($Paths.Stdout)；错误日志：$($Paths.Stderr)" "Log: $($Paths.Stdout); error log: $($Paths.Stderr)")
            return 0
        }
        'stale' { Write-Host (Get-DvMessage '进程记录属于其他部署目录，或应用已退出/PID 已被复用；不会操作该进程。' 'The process record belongs to another directory, or the application exited/PID was reused; no process was modified.'); return 3 }
        default { Write-Host (Get-DvMessage '无法验证记录进程的身份；为避免操作其他进程，没有执行任何操作。' 'Cannot verify the recorded process identity; no action was taken.'); return 1 }
    }
}

function Invoke-Stop {
    param([pscustomobject] $Paths)
    Write-Host (Get-DvMessage '正在检查当前应用进程……' 'Checking the current application process...')
    $record = Read-TrackingRecord -Paths $Paths
    $verified = Get-VerifiedTrackedProcess -Record $record -PackageRoot $Paths.PackageRoot
    if ($verified.State -eq 'none') { Write-Host (Get-DvMessage '当前没有由此部署脚本记录的应用进程。' 'No application process is recorded by this deployment script.'); return 0 }
    if ($verified.State -eq 'stale') {
        if (Test-Path -LiteralPath $Paths.Metadata) { Remove-Item -LiteralPath $Paths.Metadata -Force }
        if (Test-Path -LiteralPath $Paths.Pid) { Remove-Item -LiteralPath $Paths.Pid -Force }
        Write-Host (Get-DvMessage '应用已停止或记录的 PID 已被复用；没有操作其他进程。' 'The application stopped or its PID was reused; no other process was modified.')
        return 0
    }
    if ($verified.State -ne 'running') { Write-Host (Get-DvMessage '无法确认记录的 PID 仍是本部署脚本启动的应用；没有停止任何进程。' 'Cannot confirm that the recorded PID belongs to this application; no process was stopped.'); return 1 }
    # Kill through the already verified Process handle, not by PID again;
    # the PID could be reused between verification and the kill call.
    Write-Host (Get-DvMessage "正在停止应用进程，PID=$($record.Pid)……" "Stopping application process, PID=$($record.Pid)...")
    $verified.Process.Kill()
    Write-Host (Get-DvMessage '停止请求已发送，正在等待进程退出（最多 10 秒）……' 'Stop requested; waiting up to 10 seconds for process exit...')
    try { $verified.Process.WaitForExit(10000) | Out-Null } catch { }
    if (-not $verified.Process.HasExited) { throw (Get-DvMessage '停止请求已发送，但 Java 进程仍在运行；保留进程记录，请稍后重试。' 'Stop requested but Java is still running. The process record was retained; try again later.') }
    $after = Get-VerifiedTrackedProcess -Record $record -PackageRoot $Paths.PackageRoot
    if ($after.State -eq 'running') { throw (Get-DvMessage '停止请求已发送，但进程仍在运行。' 'Stop requested but the process is still running.') }
    if (Test-Path -LiteralPath $Paths.Metadata) { Remove-Item -LiteralPath $Paths.Metadata -Force }
    if (Test-Path -LiteralPath $Paths.Pid) { Remove-Item -LiteralPath $Paths.Pid -Force }
    Write-Host (Get-DvMessage '应用进程已停止。Windows 会直接终止 Java 进程，不会运行 Java 关闭钩子。' 'Application stopped. Windows terminates Java directly without running its shutdown hooks.')
    return 0
}

function Acquire-LauncherLock {
    param([pscustomobject] $Paths)
    [void][System.IO.Directory]::CreateDirectory($Paths.Directory)
    try { return [System.IO.File]::Open($Paths.Lock, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None) }
    catch { throw (Get-DvMessage '另一个部署脚本正在检查或启动应用。请等待它完成后再试。' 'Another deployment script is checking or starting the application. Wait for it to finish and retry.') }
}

$restartStopCompleted = $false
try {
    $dispatchRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
    $dispatchNative = Test-Path -LiteralPath (Join-Path $dispatchRoot 'server.jar') -PathType Leaf
    $dispatchApp = Test-Path -LiteralPath (Join-Path $dispatchRoot 'docker-app') -PathType Container
    $dispatchAllInOne = Test-Path -LiteralPath (Join-Path $dispatchRoot 'docker-allinone') -PathType Container
    if (($dispatchNative -and ($dispatchApp -or $dispatchAllInOne)) -or ($dispatchApp -and $dispatchAllInOne)) {
        throw (Get-DvMessage '此目录混有多种部署产物。请将单个发布包解压到独立目录。' 'This directory contains multiple deployment types. Extract one package to a separate directory.')
    }
    if ($dispatchAllInOne -and -not $dispatchNative -and -not $dispatchApp) {
        $dockerLauncher = Join-Path (Join-Path $dispatchRoot 'docker-allinone') 'launch.ps1'
        if (-not (Test-Path -LiteralPath $dockerLauncher -PathType Leaf)) { throw (Get-DvMessage "检测到 Docker allinone 发布包，但缺少启动 helper：'$dockerLauncher'。" "Docker all-in-one package detected, but its launcher is missing: '$dockerLauncher'.") }
        & $dockerLauncher @Arguments
        if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
        exit 0
    }
    if ($dispatchApp -and -not $dispatchNative -and -not $dispatchAllInOne) {
        $dockerLauncher = Join-Path (Join-Path $dispatchRoot 'docker-app') 'launch.ps1'
        if (-not (Test-Path -LiteralPath $dockerLauncher -PathType Leaf)) { throw (Get-DvMessage "检测到 Docker app 发布包，但缺少启动 helper：'$dockerLauncher'。" "Docker app package detected, but its launcher is missing: '$dockerLauncher'.") }
        & $dockerLauncher @Arguments
        if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
        exit 0
    }

    if ($Arguments.Count -gt 1) { throw (Get-DvMessage '一次只能指定一个选项：--help、--check、--status、--stop 或 --restart。' 'Specify only one of --help, --check, --status, --stop or --restart.') }
    $mode = 'start'
    if ($Arguments.Count -eq 1) {
        switch ($Arguments[0]) {
            { $_ -in @('--help', '-h') } { Write-Usage; exit 0 }
            '--check' { $mode = 'check' }
            '--status' { $mode = 'status' }
            '--stop' { $mode = 'stop' }
            '--restart' { $mode = 'restart' }
            default { throw (Get-DvMessage "不支持的选项 '$($Arguments[0])'。运行 --help 查看用法。" "Unsupported option '$($Arguments[0])'. Run --help for usage.") }
        }
    }

    switch ($mode) {
        'start' { Write-Host (Get-DvMessage '准备启动应用，正在检查部署目录……' 'Preparing to start; checking the deployment directory...') }
        'check' { Write-Host (Get-DvMessage '正在检查部署条件……' 'Checking deployment requirements...') }
        'status' { Write-Host (Get-DvMessage '正在查询应用进程……' 'Checking the application process...') }
        'stop' { Write-Host (Get-DvMessage '正在准备停止应用，正在检查部署目录……' 'Preparing to stop; checking the deployment directory...') }
        'restart' { Write-Host (Get-DvMessage '准备重启应用，正在检查部署目录……' 'Preparing to restart; checking the deployment directory...') }
    }

    $packageRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
    $nativeJar = Join-Path $packageRoot 'server.jar'
    $dockerApp = Join-Path $packageRoot 'docker-app'
    $dockerAllInOne = Join-Path $packageRoot 'docker-allinone'
    $hasNative = Test-Path -LiteralPath $nativeJar -PathType Leaf
    $hasDockerApp = Test-Path -LiteralPath $dockerApp -PathType Container
    $hasDockerAllInOne = Test-Path -LiteralPath $dockerAllInOne -PathType Container
    if (($hasNative -and ($hasDockerApp -or $hasDockerAllInOne)) -or ($hasDockerApp -and $hasDockerAllInOne)) {
        throw (Get-DvMessage '此目录混有多种部署产物。请将单个发布包解压到独立目录。' 'This directory contains multiple deployment types. Extract one package to a separate directory.')
    }
    if ($hasDockerApp -or $hasDockerAllInOne) { throw (Get-DvMessage '检测到 Docker 部署包；此一键脚本目前仅支持 Docker app 包和常规部署，Docker allinone 包尚不支持。' 'A Docker package was detected, but its launcher could not be selected.') }
    if (-not $hasNative) { throw (Get-DvMessage '无法识别常规部署包：缺少 server.jar。请从解压后的发布包运行。' 'Unrecognized native package: server.jar is missing. Run from the extracted package.') }

    $configPath = Join-Path $packageRoot 'config\application.yml'
    $paths = Get-TrackingPaths -PackageRoot $packageRoot

    if ($mode -eq 'status') { exit (Invoke-Status -Paths $paths) }
    if ($mode -eq 'stop') {
        $stopLock = Acquire-LauncherLock -Paths $paths
        try { exit (Invoke-Stop -Paths $paths) }
        finally { if ($null -ne $stopLock) { $stopLock.Dispose() } }
    }

    if ($mode -eq 'check') {
        if (-not (Test-ReadableFile -Path $nativeJar)) { throw (Get-DvMessage "应用 JAR 缺失或不可读：'$nativeJar'。" "Application JAR is missing or unreadable: '$nativeJar'.") }
        if (-not (Test-ReadableFile -Path $configPath)) { throw (Get-DvMessage "应用配置缺失或不可读：'$configPath'。" "Application configuration is missing or unreadable: '$configPath'.") }
        Write-Host (Get-DvMessage '正在检查 Java 17 和数据库配置……' 'Checking Java 17 and database configuration...')
        $javaPath = Resolve-Java17 -AllowInteractive:$false
        $rawBytes = [System.IO.File]::ReadAllBytes($configPath)
        $hasUtf8Bom = $rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF
        $utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
        $offset = if ($hasUtf8Bom) { 3 } else { 0 }
        $configText = $utf8Strict.GetString($rawBytes, $offset, $rawBytes.Length - $offset)
        $database = Get-DatabaseConfiguration -Text $configText
        if ($database.Missing.Count -gt 0) {
            $missingText = [string]::Join(', ', [string[]]$database.Missing.ToArray())
            throw (Get-DvMessage "以下数据库配置项未填写或仍是模板值：$missingText。检查模式不会提示或修改配置；运行 deploy_windows.cmd 补齐。" "Database settings are missing or still placeholders: $missingText. Check mode does not modify configuration; run deploy_windows.cmd to complete setup.")
        }
        Write-Output (Get-DvMessage "检查通过：常规部署包、数据库配置和 Java 17 均符合要求。配置文件：'$configPath'。应用未启动。" "Checks passed: package, database configuration and Java 17 are valid. Configuration: '$configPath'. The application was not started.")
        exit 0
    }

    $lockStream = Acquire-LauncherLock -Paths $paths
    try {
        if ($mode -eq 'restart') {
            Write-Host (Get-DvMessage '重启流程：正在停止应用，随后检查配置和 Java 17 并启动。' 'Restart: stopping the application before checking configuration and Java 17.')
            $stopResult = Invoke-Stop -Paths $paths
            if ($stopResult -ne 0) { throw (Get-DvMessage '无法确认应用已停止；为避免启动重复实例，本次不会启动新进程。' 'Cannot confirm that the application stopped; no duplicate process was started.') }
            $restartStopCompleted = $true
        }

        $record = Read-TrackingRecord -Paths $paths
        $verified = Get-VerifiedTrackedProcess -Record $record -PackageRoot $packageRoot
        if ($verified.State -eq 'running') {
            Write-Output (Get-DvMessage "应用已在运行，PID=$($record.Pid)。不会重复启动。" "Application already running, PID=$($record.Pid). No duplicate was started.")
            Write-Output (Get-DvMessage "日志：$($paths.Stdout)；错误日志：$($paths.Stderr)" "Log: $($paths.Stdout); error log: $($paths.Stderr)")
            exit 0
        }
        if ($verified.State -eq 'unverifiable' -or $verified.State -eq 'invalid') {
            throw (Get-DvMessage '现有进程记录无法验证。为避免启动重复实例或操作其他进程，请检查 run/application.json 后再试。' 'Cannot verify the process record. Check run/application.json before retrying.')
        }
        if ($verified.State -eq 'stale') {
            if (Test-Path -LiteralPath $paths.Metadata) { Remove-Item -LiteralPath $paths.Metadata -Force }
            if (Test-Path -LiteralPath $paths.Pid) { Remove-Item -LiteralPath $paths.Pid -Force }
        }

        if (-not (Test-ReadableFile -Path $nativeJar)) { throw (Get-DvMessage "应用 JAR 缺失或不可读：'$nativeJar'。" "Application JAR is missing or unreadable: '$nativeJar'.") }
        if (-not (Test-ReadableFile -Path $configPath)) { throw (Get-DvMessage "应用配置缺失或不可读：'$configPath'。" "Application configuration is missing or unreadable: '$configPath'.") }
        Write-Host (Get-DvMessage '正在检查 Java 17 和数据库配置……' 'Checking Java 17 and database configuration...')
        $javaPath = Resolve-Java17 -AllowInteractive:$true
        $rawBytes = [System.IO.File]::ReadAllBytes($configPath)
        $hasUtf8Bom = $rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF
        $utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
        $offset = if ($hasUtf8Bom) { 3 } else { 0 }
        $configText = $utf8Strict.GetString($rawBytes, $offset, $rawBytes.Length - $offset)
        $database = Get-DatabaseConfiguration -Text $configText

        if ([Console]::IsInputRedirected -and $database.Missing.Count -gt 0) {
            $missingText = [string]::Join(', ', [string[]]$database.Missing.ToArray())
            throw (Get-DvMessage "需要交互输入数据库配置（$missingText），但当前没有可用的终端输入。请在 Windows 终端中运行 deploy_windows.cmd。" "Database settings ($missingText) require interactive input. Run deploy_windows.cmd in a Windows terminal.")
        }

        if ($database.Missing.Count -gt 0) {
            Write-Output (Get-DvMessage '请补齐缺失的 MySQL 配置项；数据库名称无需包含主机或连接参数；密码输入时不会显示。' 'Complete the missing MySQL settings. Enter only the database name; password input is hidden.')
            $answers = @{}
            foreach ($path in $database.Paths) {
                if ($database.Missing.Contains($path)) { $answers[$path] = Read-InteractiveValue -Path $path -UrlConfiguration $database.Url }
            }
            Write-UpdatedConfiguration -ConfigPath $configPath -Database $database -Answers $answers -HasUtf8Bom $hasUtf8Bom -OriginalBytes $rawBytes
        }

        [void][System.IO.Directory]::CreateDirectory($paths.Directory)
        [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $paths.Stdout))
        [System.IO.File]::WriteAllText($paths.Stdin, '', [System.Text.UTF8Encoding]::new($false))
        [System.IO.File]::WriteAllText($paths.Stdout, '', [System.Text.UTF8Encoding]::new($false))
        [System.IO.File]::WriteAllText($paths.Stderr, '', [System.Text.UTF8Encoding]::new($false))
        $launchId = [Guid]::NewGuid().ToString('N')
        $argumentsLine = @(
            ('-Ddatavisool.deployment.launcher-id=' + $launchId),
            '-jar', ('"' + $nativeJar + '"'),
            ('--spring.config.location=' + '"' + $configPath + '"')
        ) -join ' '
        # On Windows, Start-Process creates the child with independent file
        # handles for stdin/stdout/stderr and a hidden console. Java therefore
        # keeps writing to logs after this launcher window exits.
        $ready = $false
        $pendingAdminPassword = $null
        while ($true) {
            [System.IO.File]::WriteAllText($paths.Stdout, '', [System.Text.UTF8Encoding]::new($false))
            [System.IO.File]::WriteAllText($paths.Stderr, '', [System.Text.UTF8Encoding]::new($false))
            Write-Host (Get-DvMessage "正在后台启动应用并等待就绪（最多 120 秒）；日志：$($paths.Stdout)" "Starting in the background and waiting for readiness (up to 120 seconds); log: $($paths.Stdout)")
            $originalAdminPassword = $env:DATAVISOOL_ADMIN_PASSWORD
            try {
                if ($null -ne $pendingAdminPassword) { $env:DATAVISOOL_ADMIN_PASSWORD = $pendingAdminPassword }
                $process = Start-Process -FilePath $javaPath -ArgumentList $argumentsLine -WorkingDirectory $packageRoot -WindowStyle Hidden -RedirectStandardInput $paths.Stdin -RedirectStandardOutput $paths.Stdout -RedirectStandardError $paths.Stderr -PassThru
            }
            finally {
                $env:DATAVISOOL_ADMIN_PASSWORD = $originalAdminPassword
                $pendingAdminPassword = $null
            }
            $newRecorded = $false
            $process.Refresh()
            if (-not $process.HasExited) {
                $launchRecord = [ordered]@{
                    Pid = [int]$process.Id
                    StartTimeUtcTicks = [Int64]$process.StartTime.ToUniversalTime().Ticks
                    LaunchId = $launchId
                    JavaPath = $javaPath
                    JarPath = $nativeJar
                    PackageRoot = $packageRoot
                    StartedAtUtc = [DateTime]::UtcNow.ToString('o')
                }
                try {
                    Write-AtomicTextFile -Path $paths.Metadata -Text (ConvertTo-Json -InputObject $launchRecord -Depth 3)
                    Write-AtomicTextFile -Path $paths.Pid -Text ([string]$process.Id + "`n")
                }
                catch {
                    $originalRecordError = $_.Exception.Message
                    $stopped = $false
                    try {
                        if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null }
                        $stopped = $process.HasExited
                    }
                    catch { }
                    if ($stopped) {
                        if (Test-Path -LiteralPath $paths.Metadata) { Remove-Item -LiteralPath $paths.Metadata -Force -ErrorAction SilentlyContinue }
                        if (Test-Path -LiteralPath $paths.Pid) { Remove-Item -LiteralPath $paths.Pid -Force -ErrorAction SilentlyContinue }
                        throw (Get-DvMessage "无法保存应用进程记录；本次新启动的 Java 进程已停止。错误：$originalRecordError" "Cannot save the process record; the newly started Java process was stopped. Error: $originalRecordError")
                    }
                    throw (Get-DvMessage "无法保存应用进程记录，且无法确认新启动的 Java 进程已停止（PID=$($process.Id)）。请查看日志并手动检查该 PID。错误：$originalRecordError" "Cannot save the process record or confirm Java stopped (PID=$($process.Id)). Check the logs and PID. Error: $originalRecordError")
                }
                $newRecorded = $true
            }
            $deadline = [DateTime]::UtcNow.AddSeconds(120)
            $retryForAdmin = $false
            while ([DateTime]::UtcNow -lt $deadline) {
                $process.Refresh()
                $startupLog = [System.IO.File]::ReadAllText($paths.Stdout) + [System.IO.File]::ReadAllText($paths.Stderr)
                if ($process.HasExited) {
                    if ($newRecorded) {
                        Remove-Item -LiteralPath $paths.Pid, $paths.Metadata -Force -ErrorAction SilentlyContinue
                    }
                    if ($startupLog -match 'DATAVISOOL_PORT_UNAVAILABLE port=([0-9]+)') {
                        throw (Get-DvMessage "端口 $($Matches[1]) 无法绑定，可能已被占用或监听地址不可用；请检查配置和日志。" "Port $($Matches[1]) cannot be bound; it may be occupied or the listen address unavailable. Check configuration and logs.")
                    }
                    if ($startupLog -match 'IllegalStateException:.*DATAVISOOL_ADMIN_PASSWORD') {
                        if ([Console]::IsInputRedirected) { throw (Get-DvMessage '首次初始化需要管理员密码；请在交互终端启动，或设置 DATAVISOOL_ADMIN_PASSWORD。' 'Initial setup requires an administrator password. Start interactively or set DATAVISOOL_ADMIN_PASSWORD.') }
                        $secure = Read-Host -Prompt (Get-DvMessage '首次初始化数据库，请设置管理员密码（至少 8 个字符、最多 72 字节，留空取消）' 'Initial database setup: enter an administrator password (at least 8 characters, at most 72 bytes; blank cancels)') -AsSecureString
                        $ptr = [IntPtr]::Zero
                        try {
                            $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
                            $pendingAdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
                        }
                        finally {
                            if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
                            if ($null -ne $secure) { $secure.Dispose() }
                        }
                        if ([string]::IsNullOrEmpty($pendingAdminPassword)) { throw (Get-DvMessage '输入已取消，未启动应用。' 'Input cancelled; the application was not started.') }
                        $retryForAdmin = $true
                        break
                    }
                    throw (Get-DvMessage "应用启动失败（退出码 $($process.ExitCode)）。请查看日志：'$($paths.Stdout)' 和 '$($paths.Stderr)'。" "Application startup failed (exit code $($process.ExitCode)). Check logs: '$($paths.Stdout)' and '$($paths.Stderr)'.")
                }
                if ($startupLog.Contains('Started DatavisoolServerApplication in ') -and $startupLog -match "Tomcat started on port ([0-9]+) \(http\) with context path '([^']*)'") {
                    $port = $Matches[1]
                    $context = $Matches[2]
                    if ($context -eq '/') { $context = '' }
                    try {
                        $health = Invoke-WebRequest -Uri "http://127.0.0.1:$port$context/api/security/getEncryptKey" -UseBasicParsing -TimeoutSec 2 -Proxy $null
                        $homepage = Invoke-WebRequest -Uri "http://127.0.0.1:$port$context/index.html" -UseBasicParsing -TimeoutSec 2 -Proxy $null
                        $process.Refresh()
                        if ([int]$health.StatusCode -eq 200 -and [int]$homepage.StatusCode -eq 200 -and -not $process.HasExited) { $ready = $true; break }
                    }
                    catch { }
                }
                Start-Sleep -Seconds 1
            }
            if ($retryForAdmin) { continue }
            break
        }
        if (-not $ready) { throw (Get-DvMessage "等待应用就绪超时；进程仍在运行，请查看日志或使用 --status / --stop。" "Timed out waiting for readiness. The process is still running; check logs or use --status / --stop.") }
        if ($mode -eq 'restart') { Write-Output (Get-DvMessage "应用已重启并就绪，PID=$($process.Id)。" "Application restarted and ready, PID=$($process.Id).") }
        else { Write-Output (Get-DvMessage "应用已就绪，PID=$($process.Id)。" "Application ready, PID=$($process.Id).") }
        Write-Output (Get-DvMessage "访问地址：http://localhost:$port$context/" "Address: http://localhost:$port$context/")
        Write-Output (Get-DvMessage "日志：$($paths.Stdout)；错误日志：$($paths.Stderr)" "Log: $($paths.Stdout); error log: $($paths.Stderr)")
        Write-Output (Get-DvMessage '使用 deploy_windows.cmd --status 查看进程，--stop 停止，--restart 重启。' 'Use deploy_windows.cmd --status to check, --stop to stop, and --restart to restart.')
    }
    finally { if ($null -ne $lockStream) { $lockStream.Dispose() } }
}
catch {
    if ($restartStopCompleted) {
        [System.Console]::Error.WriteLine((Get-DvMessage '重启未完成；停止步骤已完成。原因：{0}' 'Restart was not completed; the stop step completed. Reason: {0}'), $_.Exception.Message)
    }
    else { [System.Console]::Error.WriteLine((Get-DvMessage '部署失败：{0}' 'Deployment failed: {0}'), $_.Exception.Message) }
    exit 1
}
