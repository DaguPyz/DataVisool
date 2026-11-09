/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCKER_ALLINONE_DIR = path.join(BUILD_DIR, 'docker-allinone');
const LAUNCH_PS1 = path.join(DOCKER_ALLINONE_DIR, 'launch.ps1');
const DISPATCHER_PS1 = path.join(BUILD_DIR, 'launcher', 'deploy_windows.ps1');

function resolvePowerShell() {
  const candidates = process.env.PWSH_BIN ? [process.env.PWSH_BIN] : ['pwsh', 'powershell.exe'];
  for (const executable of candidates) {
    const probe = spawnSync(executable, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
      encoding: 'utf8', timeout: 5000,
    });
    if (probe.status === 0) return executable;
  }
  return '';
}

const POWERSHELL_BIN = resolvePowerShell();
const COMPOSE_PROBE = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 5000 });
const HAS_COMPOSE = COMPOSE_PROBE.status === 0;

const POWERSHELL_SMOKE = String.raw`
param(
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][string] $AppDir,
    [Parameter(Mandatory = $true)][string] $FixtureRoot
)
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($SourcePath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'PowerShell parse failed.' }
if ($ast.Extent.Text -match 'StandardInputEncoding') { throw 'StandardInputEncoding is not supported by Windows PowerShell 5.1.' }
$script:DvLanguage = 'zh-CN'
$needed = @(
    'Get-DvMessage',
    'Get-CanonicalPath', 'Test-SamePath', 'Read-TextFile', 'Read-OneLine', 'Get-EnvDocument', 'ConvertTo-EnvValue',
    'Set-EnvDocumentValue', 'Test-EnvDocumentHasValue', 'Test-InteractiveInputAvailable', 'Get-RequiredDatabaseValues',
    'ConvertTo-ValidatedHostPort', 'ConvertTo-ValidatedHostAddress', 'Test-SameHostAddress', 'Get-HostPortSettings',
    'Write-AtomicTextFile', 'Set-PrivateEnvFileAcl', 'Get-GeneratedProjectName', 'Test-ProjectName', 'Update-ManagedEnvNames',
    'Get-ExpectedDataPath', 'Assert-DataDirectoryPath', 'Test-DockerBindPath', 'Get-IdentityPaths', 'Get-DataIntent',
    'New-DataIntentText', 'Get-RunState', 'ConvertTo-WindowsArgument', 'Invoke-DockerWithInput', 'Invoke-Docker',
    'Resolve-DockerExecutable',
    'Get-ComposeEnvironment', 'Get-ProjectName', 'Invoke-Compose', 'Get-ComposeConfig', 'Assert-ComposePortMappings', 'Assert-ComposeConfig',
    'Test-EnvAndPrepare', 'Assert-ExpectedEnvironment',
    'Get-ContainerHostPort', 'Test-ContainerPortMappings', 'Assert-ContainerPortMappings', 'Assert-RunningContainerPortMappings',
    'Assert-ContainerObject', 'Get-DatabaseStatusText', 'ConvertTo-DockerMountCsvField', 'Assert-CleanShutdownMarker', 'Assert-ModeMarker', 'Get-PackageImage', 'Get-Package', 'Get-ControlIdentity',
    'Ensure-DeploymentState', 'Ensure-DataDirectory'
)
$nodes = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $needed -contains $node.Name }, $true)
if ($nodes.Count -ne $needed.Count) { throw "Could not extract all helper functions ($($nodes.Count)/$($needed.Count))." }
. ([scriptblock]::Create(($nodes | ForEach-Object { $_.Extent.Text }) -join ([string][char]10)))
if ([Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    # macOS PowerShell lacks ACL cmdlets; File.Replace itself remains real.
    function Get-Acl { param([string] $LiteralPath) return $null }
    function Set-Acl { param([string] $LiteralPath, [object] $AclObject) }
}

function ConvertFrom-DockerMountCsv {
    param([Parameter(Mandatory = $true)][string] $Text)
    $fields = New-Object System.Collections.ArrayList
    $index = 0
    while ($index -le $Text.Length) {
        $builder = [System.Text.StringBuilder]::new()
        if ($index -lt $Text.Length -and $Text[$index] -eq '"') {
            $index += 1
            $closed = $false
            while ($index -lt $Text.Length) {
                if ($Text[$index] -eq '"') {
                    if ($index + 1 -lt $Text.Length -and $Text[$index + 1] -eq '"') {
                        [void]$builder.Append('"'); $index += 2
                    }
                    else { $index += 1; $closed = $true; break }
                }
                else { [void]$builder.Append($Text[$index]); $index += 1 }
            }
            if (-not $closed -or ($index -lt $Text.Length -and $Text[$index] -ne ',')) { throw 'Invalid Docker mount CSV quoting.' }
        }
        else {
            while ($index -lt $Text.Length -and $Text[$index] -ne ',') {
                if ($Text[$index] -eq '"') { throw 'Quote in unquoted Docker mount CSV field.' }
                [void]$builder.Append($Text[$index]); $index += 1
            }
        }
        [void]$fields.Add($builder.ToString())
        if ($index -eq $Text.Length) { break }
        if ($Text[$index] -ne ',') { throw 'Invalid Docker mount CSV separator.' }
        $index += 1
    }
    $parsed = @{}
    foreach ($field in $fields) {
        $equals = $field.IndexOf('=')
        if ($equals -lt 0) { $key = $field; $value = $true }
        else { $key = $field.Substring(0, $equals); $value = $field.Substring($equals + 1) }
        if ([string]::IsNullOrEmpty($key) -or $parsed.ContainsKey($key)) { throw 'Invalid or duplicate Docker mount field.' }
        $parsed[$key] = $value
    }
    return $parsed
}

$script:Root = $FixtureRoot
$script:AppDir = $AppDir
$script:RunDir = Join-Path $FixtureRoot 'run'
$script:EnvPath = Join-Path $FixtureRoot '.env'
$script:ComposePath = Join-Path $AppDir 'docker-compose.yml'
$script:ExpectedModePath = Join-Path $FixtureRoot '.datavisool-deployment'
$script:ModeMarker = 'docker-allinone-launcher-v1'
$script:LegacyNodeMarker = 'docker-allinone'
$script:ManagedEnvNames = @()
$script:DockerExecutable = 'docker'
if (-not [System.IO.Path]::IsPathRooted((Resolve-DockerExecutable))) { throw 'Docker CLI was not resolved to an absolute path before environment isolation.' }
$image = 'datavisool-web-allinone:probe-amd64'
$project = 'custom-project'
$mysqlBase = 'mysql:8.4.11'
$dataPath = Get-ExpectedDataPath
$special = 'p''a#ss:$HOME&\tail'
$java = '$' + '$abc' + '{HOME}$(cmd) trailing\'
$databaseName = 'fixture_db-1'
$databaseUser = 'fixture.user-1'
$databasePassword = $special + ':"$$ $$$ end\'
$lines = @(
    "DATAVISOOL_IMAGE=$image", "DATAVISOOL_PROJECT_NAME=$project", 'APP_BIND_ADDRESS=127.0.0.1', 'APP_PORT=18080',
    'MYSQL_BIND_ADDRESS=127.0.0.1', 'MYSQL_PORT=13306',
    ('JAVA_TOOL_OPTIONS=' + (ConvertTo-EnvValue $java)), 'TZ=UTC',
    ('DB_NAME=' + (ConvertTo-EnvValue $databaseName)), ('DB_USER=' + (ConvertTo-EnvValue $databaseUser)),
    ('DB_PASSWORD=' + (ConvertTo-EnvValue $databasePassword))
)
[void][System.IO.Directory]::CreateDirectory((Join-Path $FixtureRoot 'config'))
[void][System.IO.Directory]::CreateDirectory($dataPath)
[string]$sourceAppDir = $AppDir
[System.IO.File]::Copy((Join-Path $AppDir 'config/application.yml'), (Join-Path $FixtureRoot 'config/application.yml'), $true)
$AppDir = Join-Path $FixtureRoot 'docker-allinone'
[void][System.IO.Directory]::CreateDirectory($AppDir)
foreach ($asset in @('docker-compose.yml', '.env.example')) {
    [System.IO.File]::Copy((Join-Path $sourceAppDir $asset), (Join-Path $AppDir $asset), $true)
}
[System.IO.File]::WriteAllText((Join-Path $AppDir 'IMAGE'), ($image + [string][char]10), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $AppDir 'PLATFORM'), ('linux/amd64' + [string][char]10), [System.Text.UTF8Encoding]::new($false))
$script:AppDir = $AppDir
$script:ComposePath = Join-Path $AppDir 'docker-compose.yml'
[System.IO.File]::WriteAllText($script:EnvPath, ($lines -join ([string][char]10)) + [string][char]10, [System.Text.UTF8Encoding]::new($false))
$currentApplicationConfig = Read-TextFile (Join-Path $FixtureRoot 'config/application.yml')
$legacyApplicationConfig = $currentApplicationConfig.Replace('$' + '{DB_NAME}', '$' + '{DB_NAME:lcp_server}')
if ($legacyApplicationConfig -ceq $currentApplicationConfig) { throw 'Could not create a legacy database-name reference fixture.' }
try {
    [System.IO.File]::WriteAllText((Join-Path $FixtureRoot 'config/application.yml'), $legacyApplicationConfig, [System.Text.UTF8Encoding]::new($false))
    try { [void](Get-Package); throw 'Legacy reference was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'DB_NAME') { throw } }
}
finally { [System.IO.File]::WriteAllText((Join-Path $FixtureRoot 'config/application.yml'), $currentApplicationConfig, [System.Text.UTF8Encoding]::new($false)) }

try {
    foreach ($reservedName in @('DOCKER_HOST', 'DOCKER_CONFIG', 'DOCKER_CONTEXT', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH')) {
        $failure = $null
        try { Update-ManagedEnvNames -Text ($reservedName + '=sensitive-test-value') } catch { $failure = $_.Exception }
        if ($null -eq $failure -or $failure.Message -notmatch '必须在启动环境中设置' -or $failure.Message.Contains('sensitive-test-value')) {
            throw "Reserved .env variable '$reservedName' was not safely rejected."
        }
    }
    $lineFeed = [string][char]10
    $carriageReturnLineFeed = ([string][char]13) + $lineFeed
    $managedNameText = 'CUSTOM_PASSWORD=value-from-env-file' + $carriageReturnLineFeed + 'CUSTOM_BARE' + $lineFeed + 'CUSTOM_COMMENT # trailing comment' + $carriageReturnLineFeed + 'export CUSTOM_EXPORTED' + $carriageReturnLineFeed
    Update-ManagedEnvNames -Text $managedNameText
    foreach ($customName in @('CUSTOM_PASSWORD', 'CUSTOM_BARE', 'CUSTOM_COMMENT', 'CUSTOM_EXPORTED')) {
        if ($script:ManagedEnvNames -notcontains $customName) { throw "An ordinary custom .env key '$customName' was not retained for environment isolation." }
    }

    $env:APP_PORT = '19999'
    $env:DATAVISOOL_IMAGE = 'datavisool-web-allinone:parent-poison'
    $env:TZ = 'parent-zone'
    $env:MYSQL_BIND_ADDRESS = '0.0.0.0'
    $env:MYSQL_PORT = '19999'
    $env:JAVA_TOOL_OPTIONS = 'parent-poison'
    $originalRoot = $script:Root
    $script:Root = Join-Path $FixtureRoot '中文部署目录'
    [void][System.IO.Directory]::CreateDirectory($script:Root)
    try { $effective = Get-ComposeEnvironment -EnvFile $script:EnvPath }
    finally { $script:Root = $originalRoot }
    if ($effective['DATAVISOOL_IMAGE'] -cne $image -or $effective['DATAVISOOL_PROJECT_NAME'] -cne $project -or
        $effective['APP_PORT'] -cne '18080' -or $effective['MYSQL_BIND_ADDRESS'] -cne '127.0.0.1' -or $effective['MYSQL_PORT'] -cne '13306' -or
        $effective['TZ'] -cne 'UTC' -or $effective['JAVA_TOOL_OPTIONS'] -cne $java -or
        $effective['DB_NAME'] -cne $databaseName -or $effective['DB_USER'] -cne $databaseUser -or $effective['DB_PASSWORD'] -cne $databasePassword) {
        throw 'Compose-native env probe did not preserve values or isolate the parent environment.'
    }
    $defaultsEnvPath = Join-Path $FixtureRoot 'defaults.env'
    [System.IO.File]::WriteAllText($defaultsEnvPath, ([string]::Join([string][char]10, [string[]]@($lines | Where-Object { $_ -notmatch '^MYSQL_' })) + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    $defaultPorts = Get-ComposeEnvironment -EnvFile $defaultsEnvPath
    if ($defaultPorts['MYSQL_BIND_ADDRESS'] -cne '127.0.0.1' -or $defaultPorts['MYSQL_PORT'] -cne '3306') {
        throw 'Compose environment probe did not apply the documented MySQL host port defaults.'
    }
    $aliasEnvPath = Join-Path $FixtureRoot 'custom-alias.env'
    $aliasLines = @(
        "DATAVISOOL_IMAGE=$image", "DATAVISOOL_PROJECT_NAME=$project", 'CUSTOM_PASSWORD=value-from-env-file',
        ('DB_PASSWORD=' + '$' + '{CUSTOM_PASSWORD}'), "DB_NAME=$databaseName", "DB_USER=$databaseUser"
    )
    [System.IO.File]::WriteAllText($aliasEnvPath, ($aliasLines -join ([string][char]10)) + [string][char]10, [System.Text.UTF8Encoding]::new($false))
    $aliasDocument = Get-EnvDocument -Text (Read-TextFile $aliasEnvPath)
    if (-not $aliasDocument.Entries.ContainsKey('CUSTOM_PASSWORD')) { throw 'Get-EnvDocument did not retain an ordinary custom .env key.' }
    try {
        $duplicateLineFeed = [string][char]10
        $duplicateEnvText = 'CUSTOM_PASSWORD=first' + $duplicateLineFeed + 'CUSTOM_PASSWORD=second' + $duplicateLineFeed
        [void](Get-EnvDocument -Text $duplicateEnvText)
        throw 'Get-EnvDocument accepted a repeated custom .env key.'
    }
    catch { if ($_.Exception.Message -notmatch 'CUSTOM_PASSWORD.*出现多次') { throw } }
    try {
        Set-EnvDocumentValue -Document $aliasDocument -Key 'CUSTOM_PASSWORD' -Value 'must-not-be-written'
        throw 'Set-EnvDocumentValue accepted an unsupported custom key.'
    }
    catch { if ($_.Exception.Message -notmatch '不允许修改 .env 项') { throw } }

    $aliasOriginalRoot = $script:Root
    $aliasOriginalEnvPath = $script:EnvPath
    $script:Root = Join-Path $FixtureRoot '中文部署目录'
    $script:EnvPath = $aliasEnvPath
    $env:CUSTOM_PASSWORD = 'value-from-parent-environment'
    try {
        $aliasValues = Get-ComposeEnvironment -EnvFile $script:EnvPath
        if ($aliasValues['DB_PASSWORD'] -cne 'value-from-env-file') { throw 'A host variable overrode a custom variable declared in .env.' }
        $aliasPackage = [pscustomobject]@{ Image = $image }
        $preparedAlias = Test-EnvAndPrepare -Package $aliasPackage -ProjectName $project -Commit
        if ([string]$preparedAlias.Values['DB_PASSWORD'] -cne 'value-from-env-file' -or
            -not $preparedAlias.Text.Contains(('DB_PASSWORD=' + '$' + '{CUSTOM_PASSWORD}')) -or
            -not $preparedAlias.Text.Contains('CUSTOM_PASSWORD=value-from-env-file')) {
            throw 'Saving the prepared allinone .env did not preserve the custom password reference.'
        }
        $composeAlias = Get-ComposeConfig -ProjectName $project
        if ([string]$composeAlias.services.app.environment.DB_PASSWORD -cne 'value-from-env-file') {
            throw 'Compose expanded the allinone DB_PASSWORD from the host instead of the custom .env alias.'
        }
        $checkedAlias = Assert-ExpectedEnvironment -Package $aliasPackage -ProjectName $project
        if ([string]$checkedAlias['DB_PASSWORD'] -cne 'value-from-env-file') { throw 'Read-only allinone environment validation rejected the custom .env reference.' }
    }
    finally { $script:Root = $aliasOriginalRoot; $script:EnvPath = $aliasOriginalEnvPath }
    $portValues = @{ APP_BIND_ADDRESS = '127.0.0.1'; APP_PORT = '18080'; MYSQL_BIND_ADDRESS = '127.0.0.1'; MYSQL_PORT = '13306' }
    $validHostPorts = Get-HostPortSettings -Values $portValues
    if ($validHostPorts.AppPort -ne 18080 -or $validHostPorts.MysqlPort -ne 13306 -or $validHostPorts.MysqlAddress -cne '127.0.0.1') {
        throw 'Valid application and MySQL host port settings were not normalized.'
    }
    $samePortOnDistinctAddresses = Get-HostPortSettings -Values @{ APP_BIND_ADDRESS = '127.0.0.1'; APP_PORT = '18080'; MYSQL_BIND_ADDRESS = '192.0.2.10'; MYSQL_PORT = '18080' }
    if ($samePortOnDistinctAddresses.AppPort -ne $samePortOnDistinctAddresses.MysqlPort -or
        $samePortOnDistinctAddresses.AppAddress -cne '127.0.0.1' -or $samePortOnDistinctAddresses.MysqlAddress -cne '192.0.2.10') {
        throw 'The same host port on two distinct specific IPv4 addresses should be accepted.'
    }
    try {
        [void](Get-HostPortSettings -Values @{ APP_BIND_ADDRESS = '127.0.0.1'; APP_PORT = '65536'; MYSQL_BIND_ADDRESS = '127.0.0.1'; MYSQL_PORT = '13306' })
        throw 'An out-of-range host port was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'APP_PORT 必须是 1 到 65535') { throw } }
    try {
        [void](Get-HostPortSettings -Values @{ APP_BIND_ADDRESS = '127.0.0.1'; APP_PORT = '18080'; MYSQL_BIND_ADDRESS = '127.0.0.1'; MYSQL_PORT = '0' })
        throw 'A zero MySQL host port was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'MYSQL_PORT 必须是 1 到 65535') { throw } }
    foreach ($conflict in @(
        @{ AppAddress = '127.0.0.1'; MysqlAddress = '127.0.0.1' },
        @{ AppAddress = '127.0.0.1'; MysqlAddress = '0.0.0.0' },
        @{ AppAddress = '0.0.0.0'; MysqlAddress = '192.0.2.10' }
    )) {
        try {
            [void](Get-HostPortSettings -Values @{ APP_BIND_ADDRESS = $conflict.AppAddress; APP_PORT = '13306'; MYSQL_BIND_ADDRESS = $conflict.MysqlAddress; MYSQL_PORT = '13306' })
            throw 'Overlapping application and MySQL host addresses accepted the same port.'
        }
        catch { if ($_.Exception.Message -notmatch '相同或重叠的宿主机地址') { throw } }
    }
    try {
        [void](Get-HostPortSettings -Values @{ APP_BIND_ADDRESS = 'localhost'; APP_PORT = '18080'; MYSQL_BIND_ADDRESS = '127.0.0.1'; MYSQL_PORT = '13306' })
        throw 'A non-IP host binding address was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch '有效的 IPv4 地址') { throw } }
    $emptyDatabaseDocument = Get-EnvDocument -Text (('DB_NAME=' + [string][char]10 + 'DB_USER=' + [string][char]10 + 'DB_PASSWORD=' + [string][char]10))
    $emptyDatabaseValues = @{ DB_NAME = ''; DB_USER = ''; DB_PASSWORD = '' }
    try { [void](Get-RequiredDatabaseValues -Document $emptyDatabaseDocument -ComposeValues $emptyDatabaseValues -Interactive:$false); throw 'A database credential gap passed the read-only check.' }
    catch { if ($_.Exception.Message -notmatch '检查模式不会询问或修改文件') { throw } }

    $savedInputCheck = (Get-Command Test-InteractiveInputAvailable).ScriptBlock
    $savedReadHost = Get-Command Read-Host -CommandType Function -ErrorAction SilentlyContinue
    $script:PromptQueue = [System.Collections.Queue]::new()
    $script:PromptObservations = New-Object System.Collections.ArrayList
    [void]$script:PromptQueue.Enqueue('interactive_db')
    [void]$script:PromptQueue.Enqueue('interactive.user')
    [void]$script:PromptQueue.Enqueue('interactive-secret')
    Set-Item Function:\Test-InteractiveInputAvailable -Value { return $true }
    function Read-Host {
        param([string] $Prompt, [switch] $AsSecureString)
        [void]$script:PromptObservations.Add([pscustomobject]@{ Prompt = $Prompt; Secure = [bool]$AsSecureString })
        $next = [string]$script:PromptQueue.Dequeue()
        if ($AsSecureString) { return (ConvertTo-SecureString -String $next -AsPlainText -Force) }
        return $next
    }
    try {
        $interactiveDatabase = Get-RequiredDatabaseValues -Document $emptyDatabaseDocument -ComposeValues $emptyDatabaseValues -Interactive:$true
        if ($interactiveDatabase['DB_NAME'] -cne 'interactive_db' -or $interactiveDatabase['DB_USER'] -cne 'interactive.user' -or
            $interactiveDatabase['DB_PASSWORD'] -cne 'interactive-secret' -or $script:PromptObservations.Count -ne 3 -or
            -not $script:PromptObservations[2].Secure) {
            throw 'First-run database prompts did not collect the required values with a hidden password prompt.'
        }
        $alreadyConfigured = Get-RequiredDatabaseValues -Document (Get-EnvDocument -Text ($lines -join [string][char]10)) -ComposeValues @{
            DB_NAME = $databaseName; DB_USER = $databaseUser; DB_PASSWORD = $databasePassword
        } -Interactive:$true
        if ($alreadyConfigured['DB_PASSWORD'] -cne $databasePassword -or $script:PromptObservations.Count -ne 3) {
            throw 'Previously configured database credentials were prompted for again.'
        }
    }
    finally {
        Set-Item Function:\Test-InteractiveInputAvailable -Value $savedInputCheck
        if ($null -ne $savedReadHost) { Set-Item Function:\Read-Host -Value $savedReadHost.ScriptBlock }
        else { Remove-Item Function:\Read-Host -ErrorAction SilentlyContinue }
    }
    if ([Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) {
        $privateEnvPath = Join-Path $FixtureRoot 'private.env'
        $savedAclSetter = (Get-Command Set-PrivateEnvFileAcl).ScriptBlock
        $script:RealAclSetter = $savedAclSetter
        $script:AclTiming = New-Object System.Collections.ArrayList
        Set-Item Function:\Set-PrivateEnvFileAcl -Value {
            param([string] $Path)
            $leaf = [System.IO.Path]::GetFileName($Path)
            if ($leaf -match '\.tmp$' -or $leaf -match '\.bak\.') {
                if ((Get-Item -LiteralPath $Path).Length -ne 0) { throw 'Private temporary and backup files must receive their ACL before content is written.' }
                [void]$script:AclTiming.Add($leaf)
            }
            & $script:RealAclSetter -Path $Path
        }
        try {
            [void](Write-AtomicTextFile -Path $privateEnvPath -Text 'DB_PASSWORD=first-secret' -Private)
            $privateBackup = Write-AtomicTextFile -Path $privateEnvPath -Text 'DB_PASSWORD=second-secret' -BackupExisting -Private
            if ([string]::IsNullOrWhiteSpace($privateBackup) -or $script:AclTiming.Count -lt 3) { throw 'Private .env update did not create an ACL-protected backup and temporary file.' }
            $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
            $systemSid = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null).Value
            $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null).Value
            $expectedAclSids = @($currentUserSid, $systemSid, $administratorsSid) | Sort-Object -Unique
            foreach ($path in @($privateEnvPath, $privateBackup)) {
                $acl = Get-Acl -LiteralPath $path
                $actualAclSids = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique)
                if (-not $acl.AreAccessRulesProtected -or @($acl.Access | Where-Object { $_.IsInherited }).Count -gt 0) {
                    throw 'Private .env ACL must disable inherited access rules.'
                }
                if (@($acl.Access | Where-Object { $_.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or $_.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl }).Count -gt 0) {
                    throw 'Private .env ACL must grant only FullControl to its allowed principals.'
                }
                foreach ($sid in $expectedAclSids) {
                    if ($actualAclSids -notcontains $sid) { throw 'Private .env ACL omitted the current user, SYSTEM, or Administrators.' }
                }
                if (@($actualAclSids | Where-Object { $_ -notin $expectedAclSids }).Count -gt 0) { throw 'Private .env ACL retained an unexpected principal.' }
            }
        }
        finally { Set-Item Function:\Set-PrivateEnvFileAcl -Value $savedAclSetter }
    }
    if ((Get-ProjectName) -cne $project) { throw 'Custom project name was not preserved.' }
    [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath)
    $fakeComposeConfig = Get-ComposeConfig -ProjectName $project | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    $fakeComposeConfig.services.app.environment.DB_PASSWORD = $databasePassword.Replace('$', '$$')
    $script:FakeComposeConfig = $fakeComposeConfig
    $script:FakeComposeEnvironment = @{
        DB_NAME = $databaseName; DB_USER = $databaseUser; DB_PASSWORD = $databasePassword
        APP_BIND_ADDRESS = '127.0.0.1'; APP_PORT = '18080'; MYSQL_BIND_ADDRESS = '127.0.0.1'; MYSQL_PORT = '13306'
    }
    $savedComposeConfigCommand = (Get-Command Get-ComposeConfig).ScriptBlock
    $savedComposeEnvironmentCommand = (Get-Command Get-ComposeEnvironment).ScriptBlock
    Set-Item Function:\Get-ComposeConfig -Value { param([string] $ProjectName) return $script:FakeComposeConfig }
    Set-Item Function:\Get-ComposeEnvironment -Value { param([string] $EnvFile) return $script:FakeComposeEnvironment }
    try { [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath) }
    finally {
        Set-Item Function:\Get-ComposeConfig -Value $savedComposeConfigCommand
        Set-Item Function:\Get-ComposeEnvironment -Value $savedComposeEnvironmentCommand
    }

    $wrongMysqlPortConfig = Get-ComposeConfig -ProjectName $project | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    $mysqlConfigPort = @($wrongMysqlPortConfig.services.app.ports | Where-Object { [string]$_.target -ceq '3306' })
    if ($mysqlConfigPort.Count -ne 1) { throw 'Compose did not resolve exactly one MySQL port mapping.' }
    $mysqlConfigPort[0].published = '13307'
    $script:FakeComposeConfig = $wrongMysqlPortConfig
    Set-Item Function:\Get-ComposeConfig -Value { param([string] $ProjectName) return $script:FakeComposeConfig }
    Set-Item Function:\Get-ComposeEnvironment -Value { param([string] $EnvFile) return $script:FakeComposeEnvironment }
    try {
        [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath)
        throw 'Compose with a mismatched MySQL host port was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'MYSQL 宿主机映射') { throw } }
    finally {
        Set-Item Function:\Get-ComposeConfig -Value $savedComposeConfigCommand
        Set-Item Function:\Get-ComposeEnvironment -Value $savedComposeEnvironmentCommand
    }

    $wrongRuntimeFlagConfig = Get-ComposeConfig -ProjectName $project | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    $wrongRuntimeFlagConfig.services.app.environment.DATAVISOOL_MYSQL_HOST_PORT_ENABLED = '0'
    $script:FakeComposeConfig = $wrongRuntimeFlagConfig
    Set-Item Function:\Get-ComposeConfig -Value { param([string] $ProjectName) return $script:FakeComposeConfig }
    Set-Item Function:\Get-ComposeEnvironment -Value { param([string] $EnvFile) return $script:FakeComposeEnvironment }
    try {
        [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath)
        throw 'Compose with a disabled MySQL host-port compatibility flag was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'DATAVISOOL_MYSQL_HOST_PORT_ENABLED 固定为 1') { throw } }
    finally {
        Set-Item Function:\Get-ComposeConfig -Value $savedComposeConfigCommand
        Set-Item Function:\Get-ComposeEnvironment -Value $savedComposeEnvironmentCommand
    }

    $unsupportedEnvironmentConfig = Get-ComposeConfig -ProjectName $project | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    $unsupportedEnvironmentConfig.services.app.environment | Add-Member -NotePropertyName UNEXPECTED_OVERRIDE -NotePropertyValue 'not-allowed' -Force
    $script:FakeComposeConfig = $unsupportedEnvironmentConfig
    Set-Item Function:\Get-ComposeConfig -Value { param([string] $ProjectName) return $script:FakeComposeConfig }
    Set-Item Function:\Get-ComposeEnvironment -Value { param([string] $EnvFile) return $script:FakeComposeEnvironment }
    try {
        [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath)
        throw 'Compose with an unsupported app environment variable was accepted.'
    }
    catch { if ($_.Exception.Message -notmatch 'app.environment 包含 Docker allinone 不支持') { throw } }
    finally {
        Set-Item Function:\Get-ComposeConfig -Value $savedComposeConfigCommand
        Set-Item Function:\Get-ComposeEnvironment -Value $savedComposeEnvironmentCommand
    }

    $sourceCompose = Read-TextFile $script:ComposePath
    $wrongDatabaseCompose = $sourceCompose -replace '(?m)^(\s*DB_NAME:\s*).+$', '$1wrong_database_value'
    if ($wrongDatabaseCompose -ceq $sourceCompose) { throw 'Could not construct a mismatched DB_NAME Compose fixture.' }
    $wrongDatabasePath = Join-Path $FixtureRoot 'wrong-database-compose.yml'
    [System.IO.File]::WriteAllText($wrongDatabasePath, $wrongDatabaseCompose, [System.Text.UTF8Encoding]::new($false))
    $script:ComposePath = $wrongDatabasePath
    try {
        [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath)
        throw 'Compose with a mismatched DB_NAME was accepted.'
    }
    catch {
        if ($_.Exception.Message -notmatch 'Compose 中 DB_NAME 缺失或与包根目录 \.env 当前解析值不一致' -or
            $_.Exception.Message.Contains($databasePassword)) { throw }
    }
    finally { $script:ComposePath = Join-Path $AppDir 'docker-compose.yml' }

    $readOnlyCompose = $sourceCompose -replace 'target: /data\r?\n        bind:', ('target: /data' + [string][char]10 + '        read_only: true' + [string][char]10 + '        bind:')
    if ($readOnlyCompose -ceq $sourceCompose) { throw 'Could not construct a readonly data bind Compose fixture.' }
    $readOnlyPath = Join-Path $FixtureRoot 'readonly-compose.yml'
    [System.IO.File]::WriteAllText($readOnlyPath, $readOnlyCompose, [System.Text.UTF8Encoding]::new($false))
    $script:ComposePath = $readOnlyPath
    try { [void](Assert-ComposeConfig -ProjectName $project -ExpectedImage $image -ExpectedDataPath $dataPath); throw 'Compose readonly /data was accepted.' }
    catch { if ($_.Exception.Message -notmatch '可写 bind') { throw } }
    finally { $script:ComposePath = Join-Path $AppDir 'docker-compose.yml' }

    $readOnlyRoot = Join-Path $FixtureRoot 'readonly-check'
    [void][System.IO.Directory]::CreateDirectory($readOnlyRoot)
    $savedRoot = $script:Root
    try {
        $script:Root = $readOnlyRoot
        $uncreatedDataPath = Get-ExpectedDataPath
        [void](Assert-DataDirectoryPath -Path $uncreatedDataPath -AllowMissing)
        if (Test-Path -LiteralPath $uncreatedDataPath) { throw '--check path validation created data/.' }
    }
    finally { $script:Root = $savedRoot }

    $freshRoot = Join-Path $FixtureRoot 'fresh-bind-deployment'
    [void][System.IO.Directory]::CreateDirectory($freshRoot)
    $savedRoot = $script:Root
    $savedRunDir = $script:RunDir
    $savedEnvPath = $script:EnvPath
    $savedModePath = $script:ExpectedModePath
    $savedComposeEnvironment = (Get-Command Get-ComposeEnvironment).ScriptBlock
    try {
        $script:Root = $freshRoot
        $script:RunDir = Join-Path $freshRoot 'run'
        $script:EnvPath = Join-Path $freshRoot '.env'
        $script:ExpectedModePath = Join-Path $freshRoot '.datavisool-deployment'
        $freshDataPath = Get-ExpectedDataPath
        Set-Item Function:\Get-ComposeEnvironment -Value { param([string] $EnvFile) return @{ DATAVISOOL_PROJECT_NAME = 'datavisool-web-allinone' } }
        $freshProject = Get-ProjectName
        if ($freshProject -cne (Get-GeneratedProjectName)) { throw 'A fresh package with the default project name did not generate a new package project identity.' }
        [void][System.IO.Directory]::CreateDirectory((Join-Path $freshRoot 'run'))
        foreach ($volumeState in @('volume.name', 'volume.pending')) {
            # Old state files are unused; their value names the idle Docker volume for this project.
            [System.IO.File]::WriteAllText((Join-Path (Join-Path $freshRoot 'run') $volumeState), ($freshProject + '_data' + [string][char]10), [System.Text.UTF8Encoding]::new($false))
        }
        if ($null -ne (Get-RunState -AllowAbsent)) { throw 'Unused named-volume state files were treated as existing deployment state.' }
        [void](Ensure-DataDirectory -DataPath $freshDataPath)
        $copiedDbMarker = Join-Path $freshDataPath 'copied-db-marker'
        [System.IO.File]::WriteAllText($copiedDbMarker, 'copied database data', [System.Text.UTF8Encoding]::new($false))
        $freshState = Ensure-DeploymentState -ProjectName $freshProject -Endpoint 'npipe://./pipe/docker_engine' -DataPath $freshDataPath -MysqlBase $mysqlBase
        $savedDockerInvoker = (Get-Command Invoke-Docker).ScriptBlock
        $script:IdleDockerVolumeName = $freshProject + '_data'
        # The fake engine has this named volume, but no container that owns or mounts it.
        $script:IdleDockerVolumes = @{}
        $script:IdleDockerVolumes[$script:IdleDockerVolumeName] = $true
        $script:IdleDockerVolumeInspectCalls = 0
        try {
            Set-Item Function:\Invoke-Docker -Value {
                param([string[]] $DockerArgs, [switch] $Capture, [switch] $AllowFailure, [switch] $RedactFailure)
                if ($DockerArgs.Count -gt 0 -and $DockerArgs[0] -ceq 'ps') { return [pscustomobject]@{ ExitCode = 0; Text = '' } }
                if ($DockerArgs.Count -ge 3 -and $DockerArgs[0] -ceq 'volume' -and $DockerArgs[1] -ceq 'inspect') {
                    $script:IdleDockerVolumeInspectCalls++
                    if ($script:IdleDockerVolumes.ContainsKey($DockerArgs[-1])) { return [pscustomobject]@{ ExitCode = 0; Text = $DockerArgs[-1] } }
                }
                throw 'Unexpected fake Docker command during first data deployment.'
            }
            $freshIdentity = [pscustomobject]@{ Project = $freshProject; DataPath = $freshState.DataPath; Paths = $freshState.Paths }
            $freshContainers = @(Get-Containers -Identity $freshIdentity -ExpectedImage $image)
        }
        finally { Set-Item Function:\Invoke-Docker -Value $savedDockerInvoker }
        if ($freshState.DataPath -cne (Read-OneLine $freshState.Paths.Data) -or
            -not (Test-Path -LiteralPath $copiedDbMarker -PathType Leaf) -or
            -not (Test-Path -LiteralPath $freshDataPath -PathType Container) -or $freshContainers.Count -ne 0 -or
            -not $script:IdleDockerVolumes.ContainsKey($script:IdleDockerVolumeName) -or $script:IdleDockerVolumeInspectCalls -ne 0) {
            throw 'First data deployment did not create host data/, persist run/data.path, and ignore the idle same-name Docker volume.'
        }
    }
    finally {
        Set-Item Function:\Get-ComposeEnvironment -Value $savedComposeEnvironment
        $script:Root = $savedRoot; $script:RunDir = $savedRunDir; $script:EnvPath = $savedEnvPath; $script:ExpectedModePath = $savedModePath
    }

    $orphanMarkerRoot = Join-Path $FixtureRoot 'orphan-mode-marker'
    [void][System.IO.Directory]::CreateDirectory($orphanMarkerRoot)
    $savedRoot = $script:Root; $savedRunDir = $script:RunDir; $savedModePath = $script:ExpectedModePath
    try {
        $script:Root = $orphanMarkerRoot
        $script:RunDir = Join-Path $orphanMarkerRoot 'run'
        $script:ExpectedModePath = Join-Path $orphanMarkerRoot '.datavisool-deployment'
        [System.IO.File]::WriteAllText($script:ExpectedModePath, ('docker-allinone-launcher-v1' + [string][char]10), [System.Text.UTF8Encoding]::new($false))
        try { [void](Get-RunState -AllowAbsent); throw 'An orphaned Docker allinone mode marker was treated as a fresh deployment.' }
        catch { if ($_.Exception.Message -notmatch '身份记录缺失.*未创建数据目录或空数据库') { throw } }
        if (Test-Path -LiteralPath (Get-ExpectedDataPath)) { throw 'An orphaned mode marker caused empty data/ to be created.' }
    }
    finally { $script:Root = $savedRoot; $script:RunDir = $savedRunDir; $script:ExpectedModePath = $savedModePath }

    [void][System.IO.Directory]::CreateDirectory($script:RunDir)
    $savedStateFiles = @(
        @{ Name = 'project.name'; Value = $project }, @{ Name = 'deployment.root'; Value = $FixtureRoot },
        @{ Name = 'docker.endpoint'; Value = 'npipe://./pipe/docker_engine' }, @{ Name = 'data.path'; Value = $dataPath },
        @{ Name = 'mysql.base'; Value = $mysqlBase }
    )
    foreach ($record in $savedStateFiles) {
        [System.IO.File]::WriteAllText((Join-Path $script:RunDir $record.Name), ([string]$record.Value + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    }
    $state = Get-RunState
    if ($state.Project -cne $project -or -not (Test-SamePath $state.DataPath $dataPath)) { throw 'Saved deployment data path did not parse.' }
    [void](Write-AtomicTextFile -Path $state.Paths.Pending -Text (New-DataIntentText -Project $project -Endpoint $state.Endpoint -DataPath $dataPath -MysqlBase $mysqlBase))
    Remove-Item -LiteralPath $state.Paths.MysqlBase -Force
    try { [void](Get-RunState -AllowAbsent); throw 'Read-only identity inspection silently recovered partial run records.' }
    catch { if ($_.Exception.Message -notmatch '只读.*正常启动或重启') { throw } }
    if (Test-Path -LiteralPath $state.Paths.MysqlBase) { throw 'Read-only partial-state check wrote a missing core record.' }
    $state = Get-RunState -AllowAbsent -RecoverPending
    if ($state.MysqlBase -cne $mysqlBase -or -not $state.Pending) { throw 'Start recovery did not restore data.path identity or preserve data.pending.' }
    $state = Ensure-DeploymentState -ProjectName $project -Endpoint $state.Endpoint -DataPath $dataPath -MysqlBase $mysqlBase
    if ($state.Pending -or (Test-Path -LiteralPath $state.Paths.Pending)) { throw 'Completed data identity recovery left data.pending behind.' }

    Remove-Item -LiteralPath $dataPath -Recurse -Force
    try { [void](Get-RunState); throw 'A deployment with a missing recorded data/ directory was accepted.' }
    catch { if ($_.Exception.Message -notmatch '不存在.*恢复 data/') { throw } }
    if (Test-Path -LiteralPath $dataPath) { throw 'A missing recorded data/ directory was silently recreated.' }
    [void][System.IO.Directory]::CreateDirectory($dataPath)

    $identity = [pscustomobject]@{ Project = $project; DataPath = $dataPath }
    $labels = [pscustomobject]@{
        'com.docker.compose.project' = $project
        'com.docker.compose.service' = 'app'
        'com.docker.compose.project.working_dir' = $FixtureRoot
    }
    $mounts = @(
        [pscustomobject]@{ Type = 'bind'; Destination = '/data'; Name = ''; Source = $dataPath; RW = $true },
        [pscustomobject]@{ Type = 'bind'; Destination = '/config/application.yml'; Name = ''; Source = (Join-Path $FixtureRoot 'config/application.yml'); RW = $false }
    )
    $containerObject = [pscustomobject]@{
        Id = 'fake-container-id'
        Config = [pscustomobject]@{ Labels = $labels; Image = $image; Env = @('DATAVISOOL_MYSQL_HOST_PORT_ENABLED=1') }
        Mounts = $mounts
        State = [pscustomobject]@{ Status = 'running'; ExitCode = 0; OOMKilled = $false; Health = [pscustomobject]@{ Status = 'healthy' } }
        NetworkSettings = [pscustomobject]@{ Ports = [pscustomobject]@{
            '8080/tcp' = @([pscustomobject]@{ HostIp = '127.0.0.1'; HostPort = '18080' })
            '3306/tcp' = @([pscustomobject]@{ HostIp = '127.0.0.1'; HostPort = '13306' })
        } }
    }
    $validContainer = Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image
    if ($validContainer.State -cne 'running' -or $validContainer.Health -cne 'healthy' -or
        $validContainer.MysqlHostAddress -cne '127.0.0.1' -or $validContainer.MysqlHostPort -ne 13306) { throw 'Valid Docker allinone bind mount identity or MySQL host port mapping did not pass inspection.' }
    $expectedHostPorts = Get-HostPortSettings -Values @{ APP_BIND_ADDRESS = '127.0.0.1'; APP_PORT = '18080'; MYSQL_BIND_ADDRESS = '127.0.0.1'; MYSQL_PORT = '13306' }
    Assert-ContainerPortMappings -Container $validContainer -Expected $expectedHostPorts
    if ((Get-DatabaseStatusText -Container $validContainer) -cne '数据库宿主机地址=127.0.0.1:13306') {
        throw 'Status output did not report the actual MySQL host address.'
    }
    $containerObject.NetworkSettings.Ports.'3306/tcp' = @([pscustomobject]@{ HostIp = '127.0.0.1'; HostPort = '13307' })
    $changedMysqlPort = Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image
    if (Test-ContainerPortMappings -Container $changedMysqlPort -Expected $expectedHostPorts) { throw 'A running container with a mismatched MySQL host port was accepted.' }
    $containerObject.NetworkSettings.Ports.'3306/tcp' = @([pscustomobject]@{ HostIp = '127.0.0.1'; HostPort = '13306' })
    $containerObject.Config.Env = @()
    $missingRuntimeFlag = Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image
    if (Test-ContainerPortMappings -Container $missingRuntimeFlag -Expected $expectedHostPorts) { throw 'A running container without the fixed MySQL port compatibility flag was accepted.' }
    $containerObject.Config.Env = @('DATAVISOOL_MYSQL_HOST_PORT_ENABLED=1')
    $configPath = Join-Path $FixtureRoot 'config/application.yml'
    if ([Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) {
        $fixtureDrive = [System.IO.Path]::GetPathRoot($FixtureRoot).Substring(0, 1).ToLowerInvariant()
        $dataRelative = $dataPath.Substring([System.IO.Path]::GetPathRoot($dataPath).Length).Replace('\', '/')
        $configRelative = $configPath.Substring([System.IO.Path]::GetPathRoot($configPath).Length).Replace('\', '/')
        $containerObject.Mounts[0].Source = "/run/desktop/mnt/host/$fixtureDrive/$dataRelative"
        $containerObject.Mounts[1].Source = "/run/desktop/mnt/host/$fixtureDrive/$configRelative"
        [void](Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image)
        if (-not (Test-DockerBindPath $containerObject.Mounts[0].Source $dataPath) -or
            (Test-DockerBindPath "/run/desktop/mnt/host/z/$dataRelative" $dataPath)) {
            throw 'Docker Desktop bind path translation accepted an unrelated source or rejected the documented host-path form.'
        }
    }
    $containerObject.Mounts[0].Source = $dataPath
    $containerObject.Mounts[1].Source = $configPath
    $containerObject.NetworkSettings.Ports.'3306/tcp' = $null
    $legacyWithoutMysqlPort = Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image
    if ($legacyWithoutMysqlPort.MysqlPortCount -ne 0 -or (Test-ContainerPortMappings -Container $legacyWithoutMysqlPort -Expected $expectedHostPorts)) {
        throw 'A legacy running container without a MySQL host port mapping was incorrectly accepted as current.'
    }
    if ((Get-DatabaseStatusText -Container $legacyWithoutMysqlPort) -notmatch '数据库宿主机地址=未映射.*--restart') {
        throw 'Status did not explain how to enable a missing MySQL host port mapping.'
    }
    try { Assert-RunningContainerPortMappings -Container $legacyWithoutMysqlPort -Expected $expectedHostPorts; throw 'A legacy running container without MySQL mapping was reported as current.' }
    catch { if ($_.Exception.Message -notmatch '旧 Docker allinone 容器没有宿主机 MySQL 端口映射.*--restart') { throw } }
    $containerObject.NetworkSettings.Ports.'3306/tcp' = @([pscustomobject]@{ HostIp = '127.0.0.1'; HostPort = '13306' })
    $containerObject.Mounts[0].Source = Join-Path $FixtureRoot 'other-data'
    try { [void](Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image); throw 'A mismatched /data bind source was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'bind 挂载') { throw } }
    $containerObject.Mounts[0].Source = $dataPath
    $containerObject.Mounts[0].RW = $false
    try { [void](Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image); throw 'A readonly /data bind was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'bind 挂载') { throw } }
    $containerObject.Mounts[0].RW = $true
    $containerObject.Mounts[0].Type = 'volume'
    try { [void](Assert-ContainerObject -Container $containerObject -Identity $identity -ExpectedImage $image); throw 'A /data volume mount was accepted.' }
    catch { if ($_.Exception.Message -notmatch '/data bind 挂载必须指向') { throw } }

    $script:CleanProbeExitCode = 0
    $script:CleanProbeCalls = 0
    $script:LastCleanProbeArgs = @()
    $script:ExpectedProbeDataPath = Join-Path $FixtureRoot 'data, "quoted" path with spaces'
    function Invoke-Docker {
        param([string[]] $DockerArgs, [switch] $Capture, [switch] $AllowFailure, [switch] $RedactFailure)
        if ($DockerArgs.Count -ge 3 -and $DockerArgs[0] -ceq 'inspect' -and $DockerArgs[1] -ceq '--format' -and $DockerArgs[2] -ceq '{{.Image}}') {
            return [pscustomobject]@{ ExitCode = 0; Text = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }
        }
        if ($DockerArgs.Count -ge 2 -and $DockerArgs[0] -ceq 'run' -and $DockerArgs[1] -ceq '--rm') {
            $script:CleanProbeCalls++
            $script:LastCleanProbeArgs = [string[]]$DockerArgs
            $mountAt = [Array]::IndexOf($DockerArgs, '--mount')
            if ($mountAt -lt 0 -or $mountAt + 1 -ge $DockerArgs.Count) { throw 'Clean-shutdown probe omitted --mount.' }
            $mount = ConvertFrom-DockerMountCsv -Text $DockerArgs[$mountAt + 1]
            if ($mount['type'] -cne 'bind' -or $mount['source'] -cne $script:ExpectedProbeDataPath -or
                $mount['target'] -cne '/data' -or $mount['readonly'] -ne $true) {
                throw 'Clean-shutdown probe must use the exact readonly bind source and target.'
            }
            return [pscustomobject]@{ ExitCode = $script:CleanProbeExitCode; Text = '' }
        }
        throw 'Unexpected fake Docker command.'
    }
    $cleanContainer = [pscustomobject]@{ Id = 'fake-container-id' }
    $identity.DataPath = $script:ExpectedProbeDataPath
    Assert-CleanShutdownMarker -Container $cleanContainer -Identity $identity
    $probeText = $script:LastCleanProbeArgs -join ' '
    foreach ($requiredPart in @('--pull never', '--network none', '--read-only', '--entrypoint /bin/sh', 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'test -s /data/config/clean-shutdown && test ! -L /data/config/clean-shutdown')) {
        if ($probeText -notlike "*$requiredPart*") { throw "Clean-shutdown probe omitted required argument '$requiredPart'." }
    }
    $script:CleanProbeExitCode = 1
    try { Assert-CleanShutdownMarker -Container $cleanContainer -Identity $identity; throw 'A missing clean-shutdown marker was accepted.' }
    catch { if ($_.Exception.Message -notmatch '宿主机 data/ 已保留.*restart 不会继续') { throw } }
    if ($script:CleanProbeCalls -ne 2) { throw 'Clean-shutdown marker was not checked exactly once per stop validation.' }
    if (-not (Test-Path -LiteralPath $dataPath -PathType Container)) { throw 'An unclean shutdown removed or changed the host data directory.' }

    $minimalRoot = Join-Path $FixtureRoot 'control-identity'
    $minimalAppDir = Join-Path $minimalRoot 'docker-allinone'
    [void][System.IO.Directory]::CreateDirectory($minimalAppDir)
    [void][System.IO.Directory]::CreateDirectory((Join-Path $minimalRoot 'run'))
    $minimalDataPath = Join-Path $minimalRoot 'data'
    [void][System.IO.Directory]::CreateDirectory($minimalDataPath)
    [System.IO.File]::WriteAllText((Join-Path $minimalAppDir 'IMAGE'), ($image + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $minimalRoot '.datavisool-deployment'), ('docker-allinone-launcher-v1' + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    $minimalRecords = @(
        @{ Name = 'project.name'; Value = $project }, @{ Name = 'deployment.root'; Value = $minimalRoot },
        @{ Name = 'docker.endpoint'; Value = 'npipe://./pipe/docker_engine' }, @{ Name = 'data.path'; Value = $minimalDataPath },
        @{ Name = 'mysql.base'; Value = $mysqlBase }
    )
    foreach ($record in $minimalRecords) { [System.IO.File]::WriteAllText((Join-Path (Join-Path $minimalRoot 'run') $record.Name), ([string]$record.Value + [string][char]10), [System.Text.UTF8Encoding]::new($false)) }
    $savedPaths = @{ Root = $script:Root; AppDir = $script:AppDir; RunDir = $script:RunDir; EnvPath = $script:EnvPath; ComposePath = $script:ComposePath; ExpectedModePath = $script:ExpectedModePath }
    try {
        $script:Root = $minimalRoot; $script:AppDir = $minimalAppDir; $script:RunDir = Join-Path $minimalRoot 'run'
        $script:EnvPath = Join-Path $minimalRoot '.env'; $script:ComposePath = Join-Path $minimalAppDir 'docker-compose.yml'; $script:ExpectedModePath = Join-Path $minimalRoot '.datavisool-deployment'
        if ((Get-ControlIdentity).Image -cne $image) { throw 'Control identity depended on missing Compose or application config files.' }
    }
    finally {
        $script:Root = $savedPaths.Root; $script:AppDir = $savedPaths.AppDir; $script:RunDir = $savedPaths.RunDir
        $script:EnvPath = $savedPaths.EnvPath; $script:ComposePath = $savedPaths.ComposePath; $script:ExpectedModePath = $savedPaths.ExpectedModePath
    }
    [System.IO.File]::WriteAllText($script:ExpectedModePath, ('docker-allinone' + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    try { Assert-ModeMarker; throw 'The old Node deployment marker was accepted.' } catch { if ($_.Exception.Message -notmatch '旧 Node') { throw } }
    Write-Output 'Docker allinone PowerShell smoke passed: bind Compose config, first data deployment with an idle same-name volume, host port validation, run-state recovery, and clean-shutdown probe.'
}
finally {
    Remove-Item Env:APP_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:MYSQL_BIND_ADDRESS -ErrorAction SilentlyContinue
    Remove-Item Env:MYSQL_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:DATAVISOOL_IMAGE -ErrorAction SilentlyContinue
    Remove-Item Env:TZ -ErrorAction SilentlyContinue
    Remove-Item Env:JAVA_TOOL_OPTIONS -ErrorAction SilentlyContinue
    Remove-Item Env:CUSTOM_PASSWORD -ErrorAction SilentlyContinue
}
`;

test('Windows Docker allinone helper validates first-deploy data, host bind mounts, and MySQL ports', {
  skip: !POWERSHELL_BIN || !HAS_COMPOSE,
}, t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcp Docker allinone PowerShell '));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const smokeScript = path.join(tempRoot, 'helper-smoke.ps1');
  fs.writeFileSync(smokeScript, POWERSHELL_SMOKE, 'utf8');

  const help = spawnSync(POWERSHELL_BIN, ['-NoProfile', '-File', LAUNCH_PS1, '--help'], {
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(help.status, 0, `${help.stdout}\n${help.stderr}`);
  assert.match(`${help.stdout}\n${help.stderr}`, /默认 600 秒/);
  assert.match(`${help.stdout}\n${help.stderr}`, /120 秒/);
  const dispatcher = fs.readFileSync(DISPATCHER_PS1, 'utf8');
  const allInOneDispatch = dispatcher.indexOf('if ($dispatchAllInOne -and -not $dispatchNative -and -not $dispatchApp)');
  const appDispatch = dispatcher.indexOf('if ($dispatchApp -and -not $dispatchNative -and -not $dispatchAllInOne)');
  assert.ok(allInOneDispatch >= 0 && allInOneDispatch < appDispatch, 'Windows dispatcher must route Docker allinone before Docker app.');

  const smoke = spawnSync(POWERSHELL_BIN, [
    '-NoProfile', '-File', smokeScript, '-SourcePath', LAUNCH_PS1, '-AppDir', DOCKER_ALLINONE_DIR, '-FixtureRoot', tempRoot,
  ], { encoding: 'utf8', timeout: 60000 });
  assert.equal(smoke.status, 0, `${smoke.stdout}\n${smoke.stderr}`);
  assert.match(smoke.stdout, /Docker allinone PowerShell smoke passed/);
});
