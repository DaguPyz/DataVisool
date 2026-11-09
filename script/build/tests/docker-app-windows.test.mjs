/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCKER_APP_DIR = path.join(BUILD_DIR, 'docker-app');
const LAUNCH_PS1 = path.join(DOCKER_APP_DIR, 'launch.ps1');
const NATIVE_DISPATCHER_PS1 = path.join(BUILD_DIR, 'launcher', 'deploy_windows.ps1');

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
    'Get-CanonicalPath', 'Test-SamePath', 'Read-TextFile', 'Get-EnvDocument', 'ConvertTo-EnvValue',
    'Set-EnvDocumentValue', 'Test-EnvDocumentHasValue', 'Update-ManagedEnvNames', 'Get-GeneratedProjectName',
    'Test-ProjectName', 'Get-IdentityPaths', 'Read-OneLine', 'ConvertTo-WindowsArgument',
    'Resolve-DockerExecutable', 'Write-AtomicTextFile', 'Set-PrivateEnvFileAcl',
    'Invoke-DockerWithInput', 'Invoke-Docker', 'Get-ComposeEnvironment', 'Assert-DatabaseConfigReferences',
    'Get-ProjectName', 'Get-RequiredDatabaseValues', 'New-PreparedEnv'
)
$nodes = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $needed -contains $node.Name }, $true)
if ($nodes.Count -ne $needed.Count) { throw "Could not extract all helper functions ($($nodes.Count)/$($needed.Count))." }
. ([scriptblock]::Create(($nodes | ForEach-Object { $_.Extent.Text }) -join ([string][char]10)))
if ([Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    # macOS PowerShell has no ACL cmdlets; exercise the actual File.Replace path.
    function Get-Acl { param([string] $LiteralPath) return $null }
    function Set-Acl { param([string] $LiteralPath, [object] $AclObject) }
}

$script:Root = $FixtureRoot
$script:AppDir = $AppDir
$script:EnvPath = Join-Path $FixtureRoot '.env'
$script:RunDir = Join-Path $FixtureRoot 'run'
$script:ManagedEnvNames = @()
$script:DockerExecutable = 'docker'
$script:PromptCancelled = $false
$ErrorActionPreference = 'Stop'
$atomicReplacePath = Join-Path $FixtureRoot 'atomic-replace.probe'
[System.IO.File]::WriteAllText($atomicReplacePath, 'before', [System.Text.UTF8Encoding]::new($false))
[void](Write-AtomicTextFile -Path $atomicReplacePath -Text 'after')
if ([System.IO.File]::ReadAllText($atomicReplacePath) -cne 'after') { throw 'Atomic file replacement did not replace the existing file.' }
if (-not [System.IO.Path]::IsPathRooted((Resolve-DockerExecutable))) { throw 'Docker CLI was not resolved to an absolute path before environment isolation.' }
$expectedImage = 'datavisool-web:windows-probe'
$expectedProject = 'custom-project'
$specialValues = @('p''a#ss:$HOME&\tail', 'trailing\', 'one"x', '$$abc$' + '{HOME}$(cmd)')

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

    $templatePath = Join-Path $AppDir '.env.example'
    $templateText = [System.IO.File]::ReadAllText($templatePath)
    foreach ($key in @('DB_NAME', 'DB_USER', 'DB_PASSWORD')) {
        if ($templateText -notmatch ('(?m)^' + [regex]::Escape($key) + '=$')) { throw "The Docker app template must leave $key blank." }
    }
    $originalRoot = $script:Root
    $script:Root = Join-Path $FixtureRoot '中文部署目录'
    [void][System.IO.Directory]::CreateDirectory($script:Root)
    try { $templateValues = Get-ComposeEnvironment -EnvFile $templatePath }
    finally { $script:Root = $originalRoot }
    foreach ($key in @('DB_NAME', 'DB_USER', 'DB_PASSWORD')) {
        if (-not [string]::IsNullOrEmpty([string]$templateValues[$key])) { throw "The Docker app Compose defaults filled in $key." }
    }
    try { [void](Get-RequiredDatabaseValues -Document (Get-EnvDocument -Text $templateText) -ComposeValues $templateValues -Interactive:$false); throw 'Blank first-deployment credentials were accepted.' }
    catch { if ($_.Exception.Message -notmatch 'DB_NAME, DB_USER, DB_PASSWORD') { throw } }

    $applicationConfig = [System.IO.File]::ReadAllText((Join-Path $AppDir 'config/application.yml'))
    $databaseNameVariable = '$' + '{DB_NAME}'
    $legacyDatabaseNameVariable = '$' + '{DB_NAME:lcp_server}'
    $legacyDatabaseName = $applicationConfig.Replace($databaseNameVariable, $legacyDatabaseNameVariable)
    try { Assert-DatabaseConfigReferences -ApplicationConfig $legacyDatabaseName; throw 'Legacy reference was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'DB_NAME') { throw } }
    $databaseUserVariable = '$' + '{DB_USER}'
    try { Assert-DatabaseConfigReferences -ApplicationConfig ($applicationConfig.Replace($databaseUserVariable, '')); throw 'A missing required DB_USER reference was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'DB_USER') { throw } }

    foreach ($password in $specialValues) {
        $lines = @(
            "DATAVISOOL_IMAGE=$expectedImage", "DATAVISOOL_PROJECT_NAME=$expectedProject", 'APP_UID=10001', 'APP_GID=10001',
            'APP_PORT=18080', 'APP_BIND_ADDRESS=127.0.0.1', 'export DB_HOST=mysql.internal', 'DB_PORT=3307',
            'DB_NAME=custom_db', 'DB_USER=probe_user', ('DB_PASSWORD=' + (ConvertTo-EnvValue $password)),
            'JAVA_TOOL_OPTIONS=-Dprobe=true'
        )
        [System.IO.File]::WriteAllText($script:EnvPath, ($lines -join ([string][char]10)) + [string][char]10, [System.Text.UTF8Encoding]::new($false))
        $env:DATAVISOOL_IMAGE = 'datavisool-web:parent-poison'
        $env:DB_PASSWORD = 'parent-password'
        $env:COMPOSE_PROJECT_NAME = 'parent-project'
        $effective = Get-ComposeEnvironment -EnvFile $script:EnvPath
        if ($effective['DB_PASSWORD'] -cne $password -or $effective['DATAVISOOL_IMAGE'] -cne $expectedImage -or
            $effective['DATAVISOOL_PROJECT_NAME'] -cne $expectedProject -or $effective['DB_HOST'] -cne 'mysql.internal') {
            throw 'Compose parser did not preserve special values, export syntax, or .env precedence.'
        }
        if ((Get-ProjectName) -cne $expectedProject) { throw 'A custom .env project name was not preserved.' }
        $prepared = New-PreparedEnv -Image $expectedImage -ProjectName $expectedProject -Interactive:$false
        if ($prepared.Text -cne ([System.IO.File]::ReadAllText($script:EnvPath))) { throw 'A complete .env was unexpectedly rewritten.' }
    }

    $aliasEnvPath = Join-Path $FixtureRoot 'custom-alias.env'
    $aliasLines = @(
        "DATAVISOOL_IMAGE=$expectedImage", "DATAVISOOL_PROJECT_NAME=$expectedProject", 'CUSTOM_PASSWORD=value-from-env-file',
        ('DB_PASSWORD=' + '$' + '{CUSTOM_PASSWORD}'), 'DB_NAME=custom_db', 'DB_USER=probe_user'
    )
    [System.IO.File]::WriteAllText($aliasEnvPath, ($aliasLines -join ([string][char]10)) + [string][char]10, [System.Text.UTF8Encoding]::new($false))
    $env:CUSTOM_PASSWORD = 'value-from-parent-environment'
    $aliasValues = Get-ComposeEnvironment -EnvFile $aliasEnvPath
    if ($aliasValues['DB_PASSWORD'] -cne 'value-from-env-file') { throw 'A host variable overrode a custom variable declared in .env.' }

    $nativeError = Invoke-Docker -DockerArgs @('compose', '--not-a-real-option') -Capture -AllowFailure -RedactFailure
    if ($nativeError.ExitCode -eq 0 -or $ErrorActionPreference -cne 'Stop') { throw 'Native stderr handling did not preserve the PowerShell error preference.' }

    [void][System.IO.Directory]::CreateDirectory($script:RunDir)
    [System.IO.File]::WriteAllText((Join-Path $script:RunDir 'project.name'), ($expectedProject + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $script:RunDir 'deployment.root'), ($FixtureRoot + [string][char]10), [System.Text.UTF8Encoding]::new($false))
    if ((Get-ProjectName) -cne $expectedProject) { throw 'Saved project identity did not take precedence.' }
    [System.IO.File]::WriteAllText($script:EnvPath, (([System.IO.File]::ReadAllText($script:EnvPath) -replace 'DATAVISOOL_PROJECT_NAME=custom-project', 'DATAVISOOL_PROJECT_NAME=other-project')), [System.Text.UTF8Encoding]::new($false))
    try { [void](Get-ProjectName); throw 'A changed .env project identity was accepted.' } catch { if ($_.Exception.Message -notmatch '不一致') { throw } }
    [void][System.IO.File]::Delete((Join-Path $script:RunDir 'project.name'))
    [void][System.IO.File]::Delete((Join-Path $script:RunDir 'deployment.root'))

    $missingImageLines = @(
        "DATAVISOOL_PROJECT_NAME=$expectedProject", 'APP_UID=10001', 'APP_GID=10001', 'APP_PORT=18080', 'APP_BIND_ADDRESS=127.0.0.1',
        'DB_HOST=mysql.internal', 'DB_PORT=3307', 'DB_NAME=custom_db', 'DB_USER=probe_user', ('DB_PASSWORD=' + (ConvertTo-EnvValue 'known-probe-password'))
    )
    [System.IO.File]::WriteAllText($script:EnvPath, ($missingImageLines -join ([string][char]10)) + [string][char]10, [System.Text.UTF8Encoding]::new($false))
    $prepared = New-PreparedEnv -Image $expectedImage -ProjectName $expectedProject -Interactive:$false
    if ($prepared.Text -notmatch '(?m)^DATAVISOOL_IMAGE=datavisool-web:windows-probe$') { throw 'Missing DATAVISOOL_IMAGE was not supplemented.' }
    if ($prepared.Text -notmatch '(?m)^DB_HOST=mysql\.internal$') { throw 'Existing DB_HOST was overwritten.' }

    $missingDbLines = @(
        "DATAVISOOL_IMAGE=$expectedImage", "DATAVISOOL_PROJECT_NAME=$expectedProject", 'APP_UID=10001', 'APP_GID=10001',
        'APP_PORT=18080', 'APP_BIND_ADDRESS=127.0.0.1', 'DB_HOST=host.internal', 'DB_PORT=3307', 'DB_USER=probe_user',
        ('DB_PASSWORD=' + (ConvertTo-EnvValue 'known-probe-password'))
    )
    [System.IO.File]::WriteAllText($script:EnvPath, ($missingDbLines -join ([string][char]10)) + [string][char]10, [System.Text.UTF8Encoding]::new($false))
    $before = [System.IO.File]::ReadAllText($script:EnvPath)
    try { [void](New-PreparedEnv -Image $expectedImage -ProjectName $expectedProject -Interactive:$false); throw 'A missing database name was silently accepted.' }
    catch { if ($_.Exception.Message -notmatch 'DB_NAME') { throw } }
    if ([System.IO.File]::ReadAllText($script:EnvPath) -cne $before) { throw 'Read-only validation changed the incomplete .env.' }

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
            if ([string]::IsNullOrWhiteSpace($privateBackup) -or $script:AclTiming.Count -lt 3) { throw 'Private .env update did not create ACL-protected backup and temporary files.' }
            if ([System.IO.File]::ReadAllText($privateBackup) -cne 'DB_PASSWORD=first-secret') { throw 'Private .env backup does not contain the previous value.' }
            $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
            $systemSid = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null).Value
            $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new([System.Security.Principal.WellKnownSidType]::BuiltinAdministratorsSid, $null).Value
            $expectedAclSids = @($currentUserSid, $systemSid, $administratorsSid) | Sort-Object -Unique
            foreach ($path in @($privateEnvPath, $privateBackup)) {
                $acl = Get-Acl -LiteralPath $path
                if (-not $acl.AreAccessRulesProtected) { throw 'Private .env ACL still inherits from its parent directory.' }
                $actualAclSids = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique)
                foreach ($sid in $expectedAclSids) { if ($actualAclSids -notcontains $sid) { throw 'Private .env ACL omitted the current user, SYSTEM, or Administrators.' } }
                if (@($actualAclSids | Where-Object { $_ -notin $expectedAclSids }).Count -gt 0) { throw 'Private .env ACL retained an unexpected principal.' }
            }
        }
        finally { Set-Item Function:\Set-PrivateEnvFileAcl -Value $savedAclSetter }
    }
    Write-Output 'PowerShell helper smoke passed: parser/help prerequisites, PS5.1-safe UTF-8 stdin, Unicode-root Compose probing, dotenv aliases, special values, custom project identity, parent-env isolation, private ACLs, preservation, and read-only validation.'
}
finally {
    Remove-Item Env:DATAVISOOL_IMAGE -ErrorAction SilentlyContinue
    Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:COMPOSE_PROJECT_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:CUSTOM_PASSWORD -ErrorAction SilentlyContinue
}
`;

test('Windows Docker app helper parses, shows help, and uses Compose-native env handling', {
  skip: !POWERSHELL_BIN || !HAS_COMPOSE,
}, t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcp Docker app PowerShell '));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const smokeScript = path.join(tempRoot, 'helper-smoke.ps1');
  fs.writeFileSync(smokeScript, POWERSHELL_SMOKE, 'utf8');

  const help = spawnSync(POWERSHELL_BIN, ['-NoProfile', '-File', LAUNCH_PS1, '--help'], {
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(help.status, 0, `${help.stdout}\n${help.stderr}`);
  assert.match(`${help.stdout}\n${help.stderr}`, /Docker app/);

  const smoke = spawnSync(POWERSHELL_BIN, [
    '-NoProfile', '-File', smokeScript, '-SourcePath', LAUNCH_PS1, '-AppDir', DOCKER_APP_DIR, '-FixtureRoot', tempRoot,
  ], { encoding: 'utf8', timeout: 60000 });
  assert.equal(smoke.status, 0, `${smoke.stdout}\n${smoke.stderr}`);
  assert.match(smoke.stdout, /PowerShell helper smoke passed/);
});

test('PowerShell launchers replace existing files with a true null backup path', { skip: !POWERSHELL_BIN }, t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcp PowerShell replace '));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const dispatcherSource = fs.readFileSync(NATIVE_DISPATCHER_PS1, 'utf8');
  assert.doesNotMatch(dispatcherSource, /\[System\.IO\.File\]::Replace\([^\r\n]*,\s*\$null\s*\)/);
  assert.match(dispatcherSource, /\[System\.IO\.File\]::Replace\([^\r\n]*\[System\.Management\.Automation\.Language\.NullString\]::Value/);
  const smokeScript = path.join(tempRoot, 'replace-smoke.ps1');
  fs.writeFileSync(smokeScript, String.raw`
param([string] $SourcePath, [string] $FixtureRoot)
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($SourcePath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw 'PowerShell parse failed.' }
$script:DvLanguage = 'zh-CN'
$needed = @('Get-DvMessage', 'Test-ConfigPlaceholder', 'Test-ConfigValueMissing', 'Get-JdbcUrlConfiguration', 'Get-DatabaseConfiguration', 'Set-ConfigLineValue', 'Write-UpdatedConfiguration', 'Write-AtomicTextFile')
$nodes = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $needed -contains $node.Name }, $true)
if ($nodes.Count -ne $needed.Count) { throw 'Could not extract native dispatcher helpers.' }
. ([scriptblock]::Create(($nodes | ForEach-Object { $_.Extent.Text }) -join ([string][char]10)))
if ([Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    function Get-Acl { param([string] $LiteralPath) return $null }
    function Set-Acl { param([string] $LiteralPath, [object] $AclObject) }
}
$directPath = Join-Path $FixtureRoot 'direct-replace.txt'
[System.IO.File]::WriteAllText($directPath, 'before', [System.Text.UTF8Encoding]::new($false))
[void](Write-AtomicTextFile -Path $directPath -Text 'after')
if ([System.IO.File]::ReadAllText($directPath) -cne 'after') { throw 'Native atomic replacement did not replace the existing file.' }
$configPath = Join-Path $FixtureRoot 'application.yml'
$original = 'spring:' + [string][char]10 + '  datasource:' + [string][char]10 + '    url: jdbc:mysql://127.0.0.1:3306/' + [string][char]10 + '    username: CHANGE_ME_DATABASE_USERNAME' + [string][char]10 + '    password: CHANGE_ME_DATABASE_PASSWORD' + [string][char]10
[System.IO.File]::WriteAllText($configPath, $original, [System.Text.UTF8Encoding]::new($false))
$database = Get-DatabaseConfiguration -Text $original
$answers = @{ url = 'jdbc:mysql://127.0.0.1:3306/probe_db'; username = 'probe_user'; password = 'probe_secret' }
$originalBytes = [System.IO.File]::ReadAllBytes($configPath)
[void](Write-UpdatedConfiguration -ConfigPath $configPath -Database $database -Answers $answers -HasUtf8Bom:$false -OriginalBytes $originalBytes)
$updated = [System.IO.File]::ReadAllText($configPath)
if ($updated -notmatch 'probe_db' -or $updated -notmatch 'probe_user' -or $updated -notmatch 'probe_secret') { throw 'Native config replacement lost prompted values.' }
$backups = @(Get-ChildItem -LiteralPath $FixtureRoot -Filter 'application.yml.bak.*' -File)
if ($backups.Count -ne 1 -or [System.IO.File]::ReadAllText($backups[0].FullName) -cne $original) { throw 'Native config replacement did not retain its original backup.' }
Write-Output 'Native PowerShell replacement smoke passed.'
`, 'utf8');
  const result = spawnSync(POWERSHELL_BIN, ['-NoProfile', '-File', smokeScript, '-SourcePath', NATIVE_DISPATCHER_PS1, '-FixtureRoot', tempRoot], {
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Native PowerShell replacement smoke passed/);
});
