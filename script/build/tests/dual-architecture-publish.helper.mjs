/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../lib/common.mjs';
import { createDockerArtifactFixture } from './docker-artifacts.fixture.mjs';
import { prepareDockerArtifacts } from '../lib/docker-artifacts.mjs';

function snapshotFiles(root) {
  const snapshot = new Map();
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else snapshot.set(path.relative(root, absolute), fs.readFileSync(absolute));
    }
  };
  visit(root);
  return snapshot;
}

export function assertDualArchitecturePublish(t, {
  build,
  scriptDir,
  imageName,
  bundlePrefix,
  assetsDir,
}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-dual-architecture-publish-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, 'release packages');
  const artifacts = createDockerArtifactFixture(root);
  const prepared = prepareDockerArtifacts(artifacts);
  t.after(() => prepared.cleanup());
  const artifactDir = prepared.contextDir;
  const artifactSnapshot = snapshotFiles(artifactDir);
  const version = 'dual-publish-test';
  const calls = [];
  const execute = (command, args, options = {}) => {
    const call = { command, args: [...args], options };
    if (args[0] === 'buildx' && args[1] === 'build') {
      const context = args.at(-1);
      call.contextDir = context;
      call.contextFiles = fs.readdirSync(context).sort();
    }
    calls.push(call);
    if (command === 'tar') return run(command, args, { ...options, capture: true });
    assert.equal(command, 'docker');
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    if (args[0] === 'image' && args[1] === 'save') {
      const outputIndex = args.findIndex(arg => arg === '--output' || arg === '-o');
      const image = args.at(-1);
      fs.writeFileSync(args[outputIndex + 1], `saved-image=${image}\n`);
    }
    return '';
  };

  build(['--version', version, '--output-dir', outputDir, '--artifact-dir', artifactDir], { execute, scriptDir, log() {} });
  assert.deepEqual(snapshotFiles(artifactDir), artifactSnapshot, 'shared artifacts must remain unchanged by Docker builds');

  const targets = [
    { architecture: 'amd64', platform: 'linux/amd64' },
    { architecture: 'arm64', platform: 'linux/arm64' },
  ];
  const buildCalls = calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.equal(buildCalls.length, targets.length);
  assert.deepEqual(buildCalls.map(call => call.args[call.args.indexOf('--platform') + 1]), targets.map(target => target.platform));
  assert.equal(buildCalls[0].contextDir, buildCalls[1].contextDir,
    'both architecture builds must use one prepared Docker context');
  assert.deepEqual(buildCalls[0].contextFiles, imageName === 'datavisool-web'
    ? ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'component-docs', 'entrypoint.sh', 'healthcheck.sh', 'server.jar']
    : ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'application.yml', 'component-docs', 'patch-mysql-entrypoint.py', 'runtime.py', 'server.jar']);
  assert.equal(fs.existsSync(buildCalls[0].contextDir), false,
    'the temporary Docker context must be removed after both builds');
  const dockerfile = fs.readFileSync(path.join(scriptDir, 'Dockerfile'), 'utf8');
  assert.doesNotMatch(dockerfile, /^FROM\s+(?:node|maven):/im,
    'Docker must reuse the prebuilt application JAR instead of compiling sources in a build stage');
  assert.deepEqual(fs.readdirSync(outputDir).sort(), targets.map(({ platform }) =>
    `${bundlePrefix}-${version}-${platform.replace('/', '-')}.tar.gz`).sort());

  for (const target of targets) {
    const image = `${imageName}:${version}-${target.architecture}`;
    const archive = path.join(outputDir, `${bundlePrefix}-${version}-${target.platform.replace('/', '-')}.tar.gz`);
    const extractDir = path.join(root, `extract-${target.architecture}`);
    fs.mkdirSync(extractDir);
    run('tar', ['-xzf', archive, '-C', extractDir], { capture: true });
    const payload = path.join(extractDir, `${bundlePrefix}-${version}-${target.platform.replace('/', '-')}`);
    const deploymentDocPath = path.join(payload, '部署说明.md');
    assert.ok(fs.existsSync(deploymentDocPath), `${target.platform} archive must include deployment instructions at its root`);
    const deploymentDoc = fs.readFileSync(deploymentDocPath, 'utf8');
    const architectureLabel = target.architecture === 'amd64' ? 'x86_64（amd64）' : 'ARM64（arm64）';
    for (const expected of [version, target.platform, architectureLabel, image]) {
      assert.ok(deploymentDoc.includes(expected), `deployment instructions for ${target.platform} must include ${expected}`);
    }
    assert.ok(deploymentDoc.includes('./deploy_linux.sh'), 'deployment instructions must use the package-root one-click entry');
    assert.doesNotMatch(deploymentDoc, /deploy-app\.mjs|deploy-allinone\.mjs/,
      'deployment instructions must not direct users to the legacy Node.js managers');
    assert.doesNotMatch(deploymentDoc, /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/,
      'deployment instructions must not contain unresolved release placeholders; Docker Go templates are valid examples');
    assert.ok(!fs.existsSync(path.join(payload, 'README.md')), 'legacy README.md must not be bundled');
    assert.ok(!fs.existsSync(path.join(payload, 'README-allinone.md')), 'legacy README-allinone.md must not be bundled');
    if (imageName === 'datavisool-web') {
      assert.doesNotMatch(deploymentDoc, /datavisool-web-allinone|docker-allinone/i, 'the app-only package must not include all-in-one deployment content');
    } else if (imageName === 'datavisool-web-allinone') {
      assert.doesNotMatch(deploymentDoc, /datavisool-web-app|docker-app/i, 'the all-in-one package must not include app-only deployment content');
    }
    assert.equal(fs.readFileSync(path.join(payload, assetsDir, 'IMAGE'), 'utf8'), `${image}\n`);
    assert.equal(fs.readFileSync(path.join(payload, assetsDir, 'PLATFORM'), 'utf8'), `${target.platform}\n`);
    assert.equal(fs.readFileSync(path.join(payload, assetsDir, 'VERSION'), 'utf8'), `${version}\n`);
    assert.ok(fs.existsSync(path.join(payload, assetsDir, 'docker-compose.yml')));
    assert.ok(fs.existsSync(path.join(payload, assetsDir, '.env.example')));
    assert.deepEqual(fs.readFileSync(path.join(payload, assetsDir, '.env.example')),
      fs.readFileSync(path.join(scriptDir, '.env.example')),
      'the package must retain the deployment type\'s environment template');
    const packagedConfig = path.join(payload, 'config/application.yml');
    for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
      assert.deepEqual(fs.readFileSync(path.join(payload, name)), fs.readFileSync(path.join(scriptDir, '../../..', name)));
    }
    assert.ok(fs.existsSync(packagedConfig), 'each Docker package must include its application.yml');
    assert.deepEqual(fs.readFileSync(packagedConfig), fs.readFileSync(path.join(scriptDir, 'config/application.yml')),
      'the package must include its deployment type\'s application.yml template');
    assert.ok(!fs.existsSync(path.join(payload, assetsDir, 'config/application.yml')),
      'application.yml must only be packaged under the root config directory');
    assert.ok(!fs.existsSync(path.join(payload, 'lib')), 'runtime archive must not carry the legacy Node.js library');
    assert.ok(!fs.existsSync(path.join(payload, 'docker-app/deploy-app.mjs')));
    assert.ok(!fs.existsSync(path.join(payload, 'docker-allinone/deploy-allinone.mjs')));
    assert.ok(!fs.existsSync(path.join(payload, '.env')), 'credentials must not be included in the release archive');
    assert.equal(fs.readFileSync(path.join(payload, 'image.tar'), 'utf8'), `saved-image=${image}\n`);

    const launcherDir = path.join(scriptDir, '../launcher');
    const rootLaunchers = ['deploy_windows.cmd', 'deploy_windows.ps1', 'deploy_linux.sh', 'deploy_macos.command'];
    for (const name of rootLaunchers) {
      const source = fs.readFileSync(path.join(launcherDir, name), 'utf8').replace(/\r\n|\r|\n/g, '\n');
      const expected = name.endsWith('.cmd') || name.endsWith('.ps1') ? source.replace(/\n/g, '\r\n') : source;
      const packaged = path.join(payload, name);
      assert.deepEqual(fs.readFileSync(packaged), Buffer.from(expected, 'utf8'), `root launcher ${name} must use the shared launcher source`);
      if (process.platform !== 'win32') {
        const mode = name.endsWith('.sh') || name.endsWith('.command') ? 0o755 : 0o644;
        assert.equal(fs.statSync(packaged).mode & 0o777, mode, `root launcher ${name} mode`);
      }
    }

    const shellHelper = path.join(payload, assetsDir, 'launch.sh');
    const shellSource = fs.readFileSync(path.join(scriptDir, 'launch.sh'), 'utf8').replace(/\r\n|\r/g, '\n');
    assert.deepEqual(fs.readFileSync(shellHelper), Buffer.from(shellSource, 'utf8'));
    if (process.platform !== 'win32') assert.equal(fs.statSync(shellHelper).mode & 0o777, 0o755);
    assert.equal(shellSource.includes('\r'), false, 'POSIX helper must use LF line endings');

    const powershellHelper = path.join(payload, assetsDir, 'launch.ps1');
    const powershellSource = fs.readFileSync(path.join(scriptDir, 'launch.ps1'), 'utf8')
      .replace(/^\uFEFF/, '').replace(/\r\n|\r|\n/g, '\n');
    const expectedPowerShell = `\uFEFF${powershellSource.replace(/\n/g, '\r\n')}`;
    assert.deepEqual(fs.readFileSync(powershellHelper), Buffer.from(expectedPowerShell, 'utf8'));
    if (process.platform !== 'win32') assert.equal(fs.statSync(powershellHelper).mode & 0o777, 0o644);
    assert.ok(expectedPowerShell.startsWith('\uFEFF'), 'PowerShell helper must have a UTF-8 BOM');
    assert.equal(expectedPowerShell.replace(/\r\n/g, '').includes('\n'), false,
      'PowerShell helper must use CRLF line endings');
    assert.deepEqual(fs.readFileSync(path.join(payload, assetsDir, 'docker-compose.yml')),
      fs.readFileSync(path.join(scriptDir, 'docker-compose.yml')),
      'the package must retain its Compose definition');

    if (process.platform !== 'win32') {
      const rootLauncher = path.join(payload, 'deploy_linux.sh');
      const help = run('/bin/sh', [rootLauncher, '--help'], { capture: true });
      assert.match(help, new RegExp(imageName === 'datavisool-web' ? 'Docker app' : 'Docker allinone'));
      assert.match(help, /--check/);

      const fakeBin = path.join(root, `fake-docker-${target.architecture}`);
      fs.mkdirSync(fakeBin);
      const fakeDocker = path.join(fakeBin, 'docker');
      fs.writeFileSync(fakeDocker, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
      const beforeCheck = snapshotFiles(payload);
      assert.throws(() => run('/bin/sh', [rootLauncher, '--check'], {
        capture: true,
        env: {
          ...process.env,
          PATH: `${fakeBin}:/usr/bin:/bin`,
          DOCKER_HOST: 'unix:///var/run/docker.sock',
          DOCKER_CONTEXT: '',
        },
      }), /无法连接 Docker 引擎/, '--check must report that Docker is unavailable without starting a container');
      assert.deepEqual(snapshotFiles(payload), beforeCheck, '--check must not change packaged files');
      assert.equal(fs.existsSync(path.join(payload, '.env')), false, '--check must not create .env');
      assert.equal(fs.existsSync(path.join(payload, 'run')), false, '--check must not create run state');
      assert.equal(fs.existsSync(path.join(payload, '.datavisool-deployment')), false, '--check must not create deployment identity');
    }
  }
}
