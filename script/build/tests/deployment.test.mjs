/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { deploy } from '../docker-app/deploy-app.mjs';
import { build } from '../docker-app/build-app.mjs';
import { containerOwner, defaultDeployDir, isWithin, run, setEnv } from '../lib/common.mjs';
import { assertDualArchitecturePublish } from './dual-architecture-publish.helper.mjs';
import { createDockerArtifactFixture } from './docker-artifacts.fixture.mjs';

const buildDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptDir = path.join(buildDir, 'docker-app');
const repoRoot = path.resolve(scriptDir, '../../..');
const hasDocker = (() => { try { run('docker', ['compose', 'version'], { capture: true }); return true; } catch { return false; } })();
const hasTar = (() => { try { run('tar', ['--version'], { capture: true }); return true; } catch { return false; } })();

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-deployment-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '部署 with spaces & symbols');
  const artifacts = createDockerArtifactFixture(root);
  const buildArgs = ['--jar', artifacts.jarPath, '--component-docs', artifacts.componentDocsDir];
  const env = { ...process.env };
  for (const key of ['DATAVISOOL_IMAGE', 'DB_USER', 'DB_PASSWORD', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME']) delete env[key];
  const calls = [];
  const failure = { up: false, dump: false, archive: false, running: false };
  const execute = (command, args, options = {}) => {
    const call = { command, args, env: { ...options.env } };
    if (args[0] === 'buildx' && args[1] === 'build') {
      const context = args.at(-1);
      call.contextFiles = fs.readdirSync(context).sort();
      call.contextDir = context;
    }
    calls.push(call);
    if (command === 'tar') {
      if (failure.archive && args[0] === '-czf') throw new Error('archive failed');
      return run(command, args, { ...options, capture: true });
    }
    if (command === 'mysqldump') {
      if (args[0] === '--version') return 'test';
      if (failure.dump) throw new Error('dump failed');
      fs.writeSync(options.stdoutFd, 'CREATE TABLE example (id int);\n');
      return '';
    }
    assert.equal(command, 'docker');
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    if (args[0] === 'image' && args[1] === 'save') {
      fs.writeFileSync(args[args.indexOf('--output') + 1], 'mock-image');
    }
    if (args.includes('config')) {
      if (args.includes('--services')) return 'app';
      if (args.includes('--images')) return options.env.DATAVISOOL_IMAGE || fs.readFileSync(path.join(dir, '.env'), 'utf8').match(/^DATAVISOOL_IMAGE=(.*)$/m)[1];
    }
    if (args.includes('up') && failure.up) throw new Error('health timeout');
    if (args.includes('ps') && args.includes('--quiet') && failure.running) return 'running-app';
    return '';
  };
  const invoke = (command, ...args) => deploy([command, '--dir', dir, ...args], { execute, env, log() {} });
  invoke('init');
  const credentials = password => setEnv(path.join(dir, '.env'), { DB_NAME: 'lcp_server', DB_USER: 'lcp_test', DB_PASSWORD: password ?? "'test-password'" });
  const backupArgs = () => {
    const client = path.join(root, 'mysql config.cnf');
    fs.writeFileSync(client, '[client]\nuser=backup\npassword=secret\n');
    return ['--backup-dir', path.join(root, 'backups'), '--mysql-config', client, '--database', 'lcp_server'];
  };
  return { root, dir, env, calls, failure, execute, invoke, credentials, backupArgs, buildArgs };
}

test('init preserves existing config, credentials and resources; installed entry runs independently', async t => {
  const f = fixture(t);
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  assert.match(fs.readFileSync(path.join(f.dir, '.env'), 'utf8'), new RegExp(`^DATAVISOOL_IMAGE=datavisool-web:${version}$`, 'm'));
  assert.deepEqual(fs.readFileSync(path.join(f.dir, 'config/application.yml')),
    fs.readFileSync(path.join(scriptDir, 'config/application.yml')),
    'source init must continue to use the app-only source config template');
  f.credentials();
  fs.writeFileSync(path.join(f.dir, 'config/application.yml'), 'custom: retained\n');
  fs.writeFileSync(path.join(f.dir, 'resource/keep.txt'), 'data');
  const before = fs.readFileSync(path.join(f.dir, '.env'));
  f.invoke('init', '--image', 'datavisool-web:other');
  assert.deepEqual(fs.readFileSync(path.join(f.dir, '.env')), before);
  assert.equal(fs.readFileSync(path.join(f.dir, 'config/application.yml'), 'utf8'), 'custom: retained\n');
  assert.equal(fs.readFileSync(path.join(f.dir, 'resource/keep.txt'), 'utf8'), 'data');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(f.dir, '.env')).mode & 0o777, 0o600);
  const installed = await import(pathToFileURL(path.join(f.dir, 'deploy.mjs')).href);
  const checkCalls = [];
  installed.deploy(['check'], { execute: (command, args) => {
    checkCalls.push(args);
    assert.equal(command, 'docker');
    if (args.includes('--services')) return 'app';
    return '';
  }, log() {} });
  assert.ok(checkCalls.some(args => args.includes('--services')));
  const help = [];
  deploy(['--help'], { scriptDir, env: f.env, log: message => help.push(message) });
  assert.match(help.join('\n'), /\/usr\/app\/datavisool-web-app/);
});

test('real Compose rejects missing database credentials', { skip: !hasDocker }, t => {
  const f = fixture(t);
  assert.throws(() => deploy(['check', '--dir', f.dir], {
    env: f.env, log() {}, execute: (cmd, args, opts) => run(cmd, args, { ...opts, capture: true }),
  }), /DB_NAME|DB_USER/);
});

test('real Compose keeps literal credentials, single app, and full-width host paths', { skip: !hasDocker }, t => {
  const f = fixture(t);
  Object.assign(f.env, {
    DATAVISOOL_RESOURCE_PATH_ROOT: '/parent/override/resource',
    DATAVISOOL_AI_STORAGE_PATH: '/parent/override/ai-driven',
  });
  const marker = path.join(f.root, 'must-not-exist');
  const secret = `$(touch ${marker}) $money # spaces`;
  f.credentials(`'${secret}'`);
  const compose = ['compose', '--env-file', path.join(f.dir, '.env'), '-f', path.join(f.dir, 'docker-compose.yml'), 'config'];
  const rendered = JSON.parse(run('docker', [...compose, '--format', 'json'], { capture: true, env: f.env }));
  // Compose escapes dollar signs when serializing a reusable config.
  assert.equal(rendered.services.app.environment.DB_PASSWORD.replaceAll('$$', '$'), secret);
  assert.deepEqual({
    DATAVISOOL_RESOURCE_PATH_ROOT: rendered.services.app.environment.DATAVISOOL_RESOURCE_PATH_ROOT,
    DATAVISOOL_AI_STORAGE_PATH: rendered.services.app.environment.DATAVISOOL_AI_STORAGE_PATH,
  }, {
    DATAVISOOL_RESOURCE_PATH_ROOT: '/usr/app/resource',
    DATAVISOOL_AI_STORAGE_PATH: '/usr/app/resource/ai-driven',
  });
  assert.deepEqual(Object.keys(rendered.services), ['app']);
  assert.equal(fs.existsSync(marker), false);
  const mounts = Object.fromEntries(rendered.services.app.volumes.map(v => [v.target, v]));
  assert.equal(path.normalize(mounts['/usr/app/resource'].source), path.join(f.dir, 'resource'));
  assert.equal(mounts['/config/application.yml'].read_only, true);
  assert.equal(mounts['/usr/app/resource'].bind?.create_host_path ?? false, false);
});

test('upgrade explicit image wins over inherited environment without mutating the parent', t => {
  const f = fixture(t);
  f.env.DATAVISOOL_IMAGE = 'datavisool-web:old';
  f.invoke('upgrade', '--image', 'datavisool-web:2026.9.1');
  const up = f.calls.find(c => c.args.includes('up'));
  assert.equal(up.env.DATAVISOOL_IMAGE, 'datavisool-web:2026.9.1');
  assert.ok(up.args.includes('--wait'));
  assert.equal(f.env.DATAVISOOL_IMAGE, 'datavisool-web:old');
  assert.equal(fs.readFileSync(path.join(f.dir, 'previous-image.txt'), 'utf8'), 'datavisool-web:old\n');
  assert.match(fs.readFileSync(path.join(f.dir, '.env'), 'utf8'), /DATAVISOOL_IMAGE=datavisool-web:2026.9.1/);
});

test('failed upgrade keeps desired version and data, without destructive rollback', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, 'resource/model-key'), 'keep');
  f.failure.up = true;
  assert.throws(() => f.invoke('upgrade', '--image', 'datavisool-web:2026.9.1'), /数据库不会自动回滚/);
  assert.equal(fs.readFileSync(path.join(f.dir, 'resource/model-key'), 'utf8'), 'keep');
  assert.match(fs.readFileSync(path.join(f.dir, '.env'), 'utf8'), /2026.9.1/);
  assert.ok(!f.calls.some(c => c.args.includes('down')));
});

test('backup refuses running app and nested paths before creating backup data', { skip: !hasTar }, t => {
  const f = fixture(t);
  f.failure.running = true;
  assert.throws(() => f.invoke('backup', ...f.backupArgs()), /先 stop/);
  f.failure.running = false;
  const args = f.backupArgs();
  args[1] = path.join(f.dir, 'resource/backups');
  assert.throws(() => f.invoke('backup', ...args), /不能位于部署目录内部/);
  assert.equal(fs.existsSync(args[1]), false);
});

for (const failure of ['dump', 'archive']) {
  test(`backup ${failure} failure never marks the backup COMPLETE`, { skip: !hasTar }, t => {
    const f = fixture(t);
    f.failure[failure] = true;
    assert.throws(() => f.invoke('backup', ...f.backupArgs()));
    const backups = path.join(f.root, 'backups');
    for (const directory of fs.readdirSync(backups)) assert.equal(fs.existsSync(path.join(backups, directory, 'COMPLETE')), false);
  });
}

test('backup includes database, full resource root and protected configuration', { skip: !hasTar }, t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.dir, 'resource/security'));
  fs.writeFileSync(path.join(f.dir, 'resource/security/ai_model_api_key.key'), 'test-key');
  f.invoke('backup', ...f.backupArgs());
  const backup = path.join(f.root, 'backups', fs.readdirSync(path.join(f.root, 'backups'))[0]);
  assert.equal(fs.existsSync(path.join(backup, 'COMPLETE')), true);
  assert.match(fs.readFileSync(path.join(backup, 'database.sql'), 'utf8'), /CREATE TABLE/);
  const entries = run('tar', ['-tzf', path.join(backup, 'files.tar.gz')], { capture: true });
  assert.match(entries, /resource\/security\/ai_model_api_key.key/);
  assert.match(entries, /\.env/);
  const dump = f.calls.find(c => c.command === 'mysqldump' && c.args[0] !== '--version');
  assert.match(dump.args[0], /^--defaults-extra-file=/);
  assert.ok(!dump.args.some(arg => arg.includes('secret')));
});

test('down preserves host data and invalid images never reach Docker', t => {
  const f = fixture(t);
  f.invoke('down');
  assert.ok(!f.calls.find(c => c.args.includes('down')).args.includes('--volumes'));
  assert.ok(fs.existsSync(path.join(f.dir, 'resource')));
  for (const image of ['image:latest', 'image:$(touch anything)']) assert.throws(() => f.invoke('upgrade', '--image', image), /IMAGE:TAG/);
});

test('Windows paths and container ownership do not require POSIX identity or shell tools', () => {
  assert.equal(defaultDeployDir('win32', { ProgramData: 'D:\\Program Data' }), 'D:\\Program Data\\datavisool-web-app');
  assert.deepEqual(containerOwner('win32'), { uid: 10001, gid: 10001 });
  assert.ok(isWithin('C:\\app', 'c:\\APP\\resource', path.win32));
  assert.ok(!isWithin('C:\\app', 'C:\\app-backups', path.win32));
  assert.ok(!isWithin('C:\\app', 'D:\\backups', path.win32));
});

test('native invocation passes spaces, Unicode and shell metacharacters as literal arguments', () => {
  const value = 'C:\\中文 directory\\file & echo $(literal) %PATH%';
  const output = run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value], { capture: true });
  assert.equal(output, value);
});

test('Windows container engine is rejected before build', t => {
  const f = fixture(t);
  assert.throws(() => build(['--skip-export', ...f.buildArgs], {
    execute: (cmd, args) => args[0] === 'info' ? 'windows' : f.execute(cmd, args), log() {},
  }), /Linux 容器/);
});

test('Docker app builder rejects missing or invalid artifacts before contacting Docker', t => {
  const f = fixture(t);
  const missingJar = path.join(f.root, 'missing.jar');
  assert.throws(() => build(['--skip-export', '--jar', missingJar, '--component-docs', f.buildArgs[3]], {
    execute: f.execute, log() {},
  }), /JAR|jar/);
  assert.equal(f.calls.length, 0, 'invalid input must fail before Docker is invoked');

  const invalidJar = path.join(f.root, 'invalid.jar');
  fs.writeFileSync(invalidJar, 'not a jar');
  assert.throws(() => build(['--skip-export', '--jar', invalidJar, '--component-docs', f.buildArgs[3]], {
    execute: f.execute, log() {},
  }), /JAR|jar/);
  assert.equal(f.calls.length, 0);

  assert.throws(() => build(['--skip-export', '--artifact-dir', f.root, ...f.buildArgs], {
    execute: f.execute, log() {},
  }), /不能与/);
  assert.equal(f.calls.length, 0);

  assert.throws(() => build(['--skip-export', '--artifact-dir', path.join(f.root, 'missing-artifacts')], {
    execute: f.execute, log() {},
  }), /artifact context|artifact|Docker 构建产物无效/i);
  assert.equal(f.calls.length, 0, 'a missing shared context must not fall back to default target outputs');
});

test('Docker app builder removes its temporary context after a build failure', t => {
  const f = fixture(t);
  let context;
  assert.throws(() => build(['--skip-export', ...f.buildArgs], {
    log() {},
    execute: (command, args, options) => {
      if (args[0] === 'buildx' && args[1] === 'build') {
        context = args.at(-1);
        assert.deepEqual(fs.readdirSync(context).sort(), ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'component-docs', 'entrypoint.sh', 'healthcheck.sh', 'server.jar']);
        throw new Error('simulated Docker failure');
      }
      return f.execute(command, args, options);
    },
  }), /simulated Docker failure/);
  assert.ok(context);
  assert.equal(fs.existsSync(context), false);
});

test('Docker app builder defaults to the native target JAR and component-docs', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-app-default-artifacts-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const customScriptDir = path.join(root, 'script/build/docker-app');
  const customRepoDir = path.resolve(customScriptDir, '../../..');
  fs.mkdirSync(customScriptDir, { recursive: true });
  fs.mkdirSync(customRepoDir, { recursive: true });
  fs.writeFileSync(path.join(customRepoDir, 'package.json'), JSON.stringify({ version: 'fixture-version' }));
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) fs.copyFileSync(path.join(repoRoot, name), path.join(customRepoDir, name));
  for (const asset of ['Dockerfile', 'entrypoint.sh', 'healthcheck.sh']) {
    fs.copyFileSync(path.join(scriptDir, asset), path.join(customScriptDir, asset));
  }
  const targetDir = path.join(customRepoDir, 'datavisool-server/datavisool-service/target');
  createDockerArtifactFixture(root, {
    jarPath: path.join(targetDir, 'server.jar'),
    componentDocsDir: path.join(targetDir, 'component-docs'),
  });

  let context;
  let contextFiles;
  const execute = (command, args) => {
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    if (args[0] === 'buildx' && args[1] === 'build') {
      context = args.at(-1);
      contextFiles = fs.readdirSync(context).sort();
    }
    return '';
  };
  build(['--skip-export', '--platform', 'linux/amd64'], { execute, scriptDir: customScriptDir, log() {} });
  assert.deepEqual(contextFiles, ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'component-docs', 'entrypoint.sh', 'healthcheck.sh', 'server.jar']);
  assert.equal(fs.existsSync(context), false);
});

test('build exports the explicitly selected architecture with architecture metadata and refuses overwrite', { skip: !hasTar }, t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release 输出');
  build(['--output-dir', output, '--platform', 'linux/arm64', ...f.buildArgs], { execute: f.execute, log() {} });
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  const archive = path.join(output, `datavisool-web-app-${version}-linux-arm64.tar.gz`);
  assert.ok(fs.existsSync(archive));
  const buildCall = f.calls.find(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.ok(buildCall);
  assert.equal(buildCall.args[buildCall.args.indexOf('--tag') + 1], `datavisool-web:${version}-arm64`);
  assert.ok(buildCall.args.includes(`APP_VERSION=${version}`));
  const context = buildCall.args.at(-1);
  assert.notEqual(context, repoRoot);
  assert.deepEqual(buildCall.contextFiles, ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'component-docs', 'entrypoint.sh', 'healthcheck.sh', 'server.jar']);
  assert.equal(fs.existsSync(context), false, 'temporary Docker context must be removed after the build');
  assert.equal(buildCall.args[buildCall.args.indexOf('--file') + 1], path.join(scriptDir, 'Dockerfile'));
  run('tar', ['-xzf', archive, '-C', output]);
  const bundle = path.join(output, `datavisool-web-app-${version}-linux-arm64`);
  assert.equal(fs.readFileSync(path.join(bundle, 'image.tar'), 'utf8'), 'mock-image');
  assert.ok(!fs.existsSync(path.join(bundle, '.env')), 'database credentials must not be included in the release archive');
  assert.deepEqual(fs.readFileSync(path.join(bundle, 'config/application.yml')),
    fs.readFileSync(path.join(scriptDir, 'config/application.yml')));
  assert.ok(!fs.existsSync(path.join(bundle, 'docker-app/config/application.yml')));
  assert.ok(fs.existsSync(path.join(bundle, 'docker-app/docker-compose.yml')));
  assert.ok(fs.existsSync(path.join(bundle, 'docker-app/.env.example')));
  const packagedEnvExample = fs.readFileSync(path.join(bundle, 'docker-app/.env.example'), 'utf8');
  assert.match(packagedEnvExample, /double quotes/i);
  assert.match(packagedEnvExample, /single-quoted/i);
  assert.match(packagedEnvExample, /Never source/i);
  assert.ok(!fs.existsSync(path.join(bundle, 'docker-app/deploy-app.mjs')));
  assert.ok(!fs.existsSync(path.join(bundle, 'lib')));
  assert.ok(fs.existsSync(path.join(bundle, 'docker-app/launch.sh')));
  assert.ok(fs.existsSync(path.join(bundle, 'docker-app/launch.ps1')));
  assert.ok(fs.existsSync(path.join(bundle, 'docker-app/IMAGE')));
  assert.equal(fs.readFileSync(path.join(bundle, 'docker-app/IMAGE'), 'utf8'), `datavisool-web:${version}-arm64\n`);
  assert.equal(fs.readFileSync(path.join(bundle, 'docker-app/PLATFORM'), 'utf8'), 'linux/arm64\n');
  const shellHelper = path.join(bundle, 'docker-app/launch.sh');
  const shellText = fs.readFileSync(shellHelper, 'utf8');
  assert.doesNotMatch(shellText, /\r/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(shellHelper).mode & 0o777, 0o755);
  const powershellHelper = fs.readFileSync(path.join(bundle, 'docker-app/launch.ps1'));
  assert.equal(powershellHelper.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.match(powershellHelper.toString('utf8'), /\r\n/);
  assert.doesNotMatch(powershellHelper.toString('utf8').replace(/\r\n/g, ''), /\n/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(bundle, 'docker-app/launch.ps1')).mode & 0o777, 0o644);

  const rootLaunchers = [
    ['deploy_linux.sh', 0o755, false],
    ['deploy_macos.command', 0o755, false],
    ['deploy_windows.cmd', 0o644, true],
    ['deploy_windows.ps1', 0o644, true],
  ];
  for (const [name, mode, windows] of rootLaunchers) {
    const packaged = path.join(bundle, name);
    const source = fs.readFileSync(path.join(buildDir, 'launcher', name), 'utf8');
    const actual = fs.readFileSync(packaged, 'utf8');
    assert.equal(actual, windows ? source.replace(/\r\n|\r|\n/g, '\n').replace(/\n/g, '\r\n') : source.replace(/\r\n|\r|\n/g, '\n'));
    if (process.platform !== 'win32') assert.equal(fs.statSync(packaged).mode & 0o777, mode);
    if (windows) assert.doesNotMatch(actual.replace(/\r\n/g, ''), /\n/);
    else assert.doesNotMatch(actual, /\r/);
  }
  const packagedPowerShell = fs.readFileSync(path.join(bundle, 'deploy_windows.ps1'));
  assert.equal(packagedPowerShell.subarray(0, 3).toString('hex'), 'efbbbf');
  const help = run('/bin/sh', [path.join(bundle, 'deploy_linux.sh'), '--help'], { capture: true });
  assert.match(help, /Docker app/);
  const fakeDockerDir = path.join(f.root, 'fake-docker-bin');
  fs.mkdirSync(fakeDockerDir);
  fs.writeFileSync(path.join(fakeDockerDir, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.throws(() => run('/bin/sh', [path.join(bundle, 'deploy_linux.sh'), '--check'], {
    capture: true,
    env: { ...process.env, PATH: `${fakeDockerDir}:/usr/bin:/bin`, DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONTEXT: '' },
  }), /无法连接 Docker 引擎/);
  assert.throws(() => build(['--output-dir', output, '--platform', 'linux/arm64', ...f.buildArgs], { execute: f.execute, log() {} }), /发布包已存在/);
});

test('default app build loads both architecture tags and aliases the host architecture', t => {
  const f = fixture(t);
  build(['--skip-export', ...f.buildArgs], { execute: f.execute, log() {} });
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  const buildCalls = f.calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.equal(buildCalls.length, 2);
  assert.deepEqual(buildCalls.map(call => call.args[call.args.indexOf('--platform') + 1]), ['linux/amd64', 'linux/arm64']);
  assert.deepEqual(buildCalls.map(call => call.args[call.args.indexOf('--tag') + 1]), [
    `datavisool-web:${version}-amd64`, `datavisool-web:${version}-arm64`,
  ]);
  assert.ok(f.calls.some(call => call.args[0] === 'image' && call.args[1] === 'tag'
    && call.args.slice(-2).join(' ') === `datavisool-web:${version}-amd64 datavisool-web:${version}`)
    || buildCalls.some(call => call.args.some((arg, index) => arg === '--tag' && call.args[index + 1] === `datavisool-web:${version}`)));
  assert.equal(f.calls.filter(call => call.args[0] === 'info' && call.args.includes('{{.Architecture}}')).length, 1);
});

test('default app build exports both one-click architecture packages', { skip: !hasTar }, t => {
  assertDualArchitecturePublish(t, {
    build, scriptDir, imageName: 'datavisool-web', bundlePrefix: 'datavisool-web-app', assetsDir: 'docker-app',
  });
});

test('explicit amd64 app build only builds amd64 and keeps the unqualified version alias', t => {
  const f = fixture(t);
  build(['--skip-export', '--version', 'test-version', '--platform', 'linux/amd64', ...f.buildArgs], { execute: f.execute, log() {} });
  const buildCalls = f.calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.equal(buildCalls.length, 1);
  assert.equal(buildCalls[0].args[buildCalls[0].args.indexOf('--platform') + 1], 'linux/amd64');
  assert.equal(buildCalls[0].args[buildCalls[0].args.indexOf('--tag') + 1], 'datavisool-web:test-version-amd64');
  assert.ok(f.calls.some(call => call.args[0] === 'image' && call.args[1] === 'tag'
    && call.args.slice(-2).join(' ') === 'datavisool-web:test-version-amd64 datavisool-web:test-version')
    || buildCalls[0].args.some((arg, index) => arg === '--tag' && buildCalls[0].args[index + 1] === 'datavisool-web:test-version'));
});

test('default app build preflights both release archives before building', { skip: !hasTar }, t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release');
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'datavisool-web-app-test-version-linux-arm64.tar.gz'), 'existing');
  assert.throws(() => build(['--version', 'test-version', '--output-dir', output, ...f.buildArgs], { execute: f.execute, log() {} }), /发布包已存在/);
  assert.equal(f.calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build').length, 0);
  assert.deepEqual(fs.readdirSync(output), ['datavisool-web-app-test-version-linux-arm64.tar.gz']);
});

test('failed second default app architecture keeps only the completed amd64 package', { skip: !hasTar }, t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release');
  assert.throws(() => build(['--version', 'test-version', '--output-dir', output, ...f.buildArgs], {
    log() {}, execute: (command, args, options) => {
      if (args[0] === 'buildx' && args[1] === 'build' && args[args.indexOf('--platform') + 1] === 'linux/arm64') {
        throw new Error('arm64 build failed');
      }
      return f.execute(command, args, options);
    },
  }), /arm64 build failed/);
  assert.deepEqual(fs.readdirSync(output), ['datavisool-web-app-test-version-linux-amd64.tar.gz']);
});

test('failed image export leaves no successful release package', { skip: !hasTar }, t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release');
  assert.throws(() => build(['--output-dir', output, ...f.buildArgs], { log() {}, execute: (cmd, args, options) => {
    if (args[0] === 'image' && args[1] === 'save') throw new Error('export failed');
    return f.execute(cmd, args, options);
  } }), /export failed/);
  assert.deepEqual(fs.readdirSync(output), []);
});

test('app archive is complete as soon as its final filename becomes visible', async t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release');
  const archive = path.join(output, 'datavisool-web-app-atomic-test-linux-arm64.tar.gz');
  // A sparse payload keeps the visibility check cheap without running Docker.
  const archiveSize = 256 * 1024 * 1024;
  const signature = 'complete-release';
  const sampleOffsets = [0, archiveSize / 2, archiveSize - signature.length];
  const observer = new Worker(`
    const fs = require('node:fs');
    const { parentPort, workerData } = require('node:worker_threads');
    const wait = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 15000;
    parentPort.postMessage('ready');
    for (;;) {
      try {
        const size = fs.statSync(workerData.archive).size;
        const fd = fs.openSync(workerData.archive, 'r');
        let samples;
        try {
          samples = workerData.sampleOffsets.map(offset => {
            const buffer = Buffer.alloc(workerData.signature.length);
            fs.readSync(fd, buffer, 0, buffer.length, offset);
            return buffer.toString();
          });
        } finally { fs.closeSync(fd); }
        parentPort.postMessage({ size, samples });
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (Date.now() >= deadline) throw new Error('release archive never appeared');
      Atomics.wait(wait, 0, 0, 1);
    }
  `, { eval: true, workerData: { archive, sampleOffsets, signature } });
  try {
    await once(observer, 'message');
    const firstVisibleArchive = once(observer, 'message');
    build(['--version', 'atomic-test', '--platform', 'linux/arm64', '--output-dir', output, ...f.buildArgs], {
      log() {},
      execute(command, args, options) {
        if (command === 'tar' && args[0] === '-czf') {
          const fd = fs.openSync(args[1], 'wx');
          try {
            fs.ftruncateSync(fd, archiveSize);
            for (const offset of sampleOffsets) fs.writeSync(fd, signature, offset);
          }
          finally { fs.closeSync(fd); }
          return '';
        }
        return f.execute(command, args, options);
      },
    });
    assert.deepEqual((await firstVisibleArchive)[0], {
      size: archiveSize, samples: sampleOffsets.map(() => signature),
    },
      'observers must never see a partial release that an interrupted publisher could leave behind');
    assert.deepEqual(fs.readdirSync(output), [path.basename(archive)]);
  } finally {
    await observer.terminate();
  }
});

test('failed app compression leaves no final archive and permits a successful retry', { skip: !hasTar }, t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release');
  const args = ['--version', 'retry-test', '--platform', 'linux/arm64', '--output-dir', output, ...f.buildArgs];
  assert.throws(() => build(args, {
    log() {},
    execute(command, parameters, options) {
      if (command === 'tar' && parameters[0] === '-czf') {
        fs.writeFileSync(parameters[1], 'incomplete archive');
        throw new Error('compression interrupted');
      }
      return f.execute(command, parameters, options);
    },
  }), /compression interrupted/);
  assert.deepEqual(fs.readdirSync(output), []);
  build(args, { execute: f.execute, log() {} });
  const archive = path.join(output, 'datavisool-web-app-retry-test-linux-arm64.tar.gz');
  assert.match(run('tar', ['-tzf', archive], { capture: true }), /docker-app\/IMAGE/);
});

test('app publication preserves an archive created by a concurrent publisher', { skip: !hasTar }, t => {
  const f = fixture(t);
  const output = path.join(f.root, 'release');
  const archive = path.join(output, 'datavisool-web-app-race-test-linux-arm64.tar.gz');
  const winningArchive = 'archive from the other publisher';
  assert.throws(() => build([
    '--version', 'race-test', '--platform', 'linux/arm64', '--output-dir', output, ...f.buildArgs,
  ], {
    log() {},
    execute(command, args, options) {
      const result = f.execute(command, args, options);
      if (command === 'tar' && args[0] === '-czf') fs.writeFileSync(archive, winningArchive, { flag: 'wx' });
      return result;
    },
  }), /EEXIST|已存在/);
  assert.equal(fs.readFileSync(archive, 'utf8'), winningArchive);
  assert.deepEqual(fs.readdirSync(output), [path.basename(archive)]);
});
