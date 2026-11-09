/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { deploy } from '../docker-allinone/deploy-allinone.mjs';
import { build } from '../docker-allinone/build-allinone.mjs';
import { run, setEnv } from '../lib/common.mjs';
import { assertDualArchitecturePublish } from './dual-architecture-publish.helper.mjs';
import { createDockerArtifactFixture } from './docker-artifacts.fixture.mjs';
import { parseMysqlServerGreetingPacket } from './allinone-smoke.mjs';

const buildDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptDir = path.join(buildDir, 'docker-allinone');
const repoRoot = path.resolve(scriptDir, '../../..');
const hasTar = (() => { try { run('tar', ['--version'], { capture: true }); return true; } catch { return false; } })();
const hasDockerCompose = (() => { try { run('docker', ['compose', 'version'], { capture: true }); return true; } catch { return false; } })();

function artifactArgs(root) {
  const artifacts = createDockerArtifactFixture(root);
  return ['--jar', artifacts.jarPath, '--component-docs', artifacts.componentDocsDir];
}

function renderedConfig(image = 'datavisool-web-allinone:2026.10.0', configSource = './config/application.yml', dataSource = './data') {
  return {
    services: {
      app: {
        image,
        environment: {
          DB_NAME: 'deploy_db', DB_USER: 'deploy_user', DB_PASSWORD: 'deploy-test-password',
          DATAVISOOL_MYSQL_HOST_PORT_ENABLED: '1',
        },
        ports: [
          { target: 8080, published: '8080', host_ip: '0.0.0.0', protocol: 'tcp' },
          { target: 3306, published: '3306', host_ip: '127.0.0.1', protocol: 'tcp' },
        ],
        volumes: [
          { type: 'bind', source: dataSource, target: '/data' },
          { type: 'bind', source: configSource, target: '/config/application.yml', read_only: true },
        ],
      },
    },
    volumes: {},
  };
}

function envValue(file, name) {
  return fs.readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1];
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-deploy-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, '部署 all-in-one with spaces & symbols');
  const env = { ...process.env };
  for (const key of ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT',
    'JAVA_TOOL_OPTIONS', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME']) delete env[key];
  env.MYSQL_PORT = '1234';
  env.MYSQL_BIND_ADDRESS = '0.0.0.0';
  env.MYSQL_ROOT_PASSWORD = 'ambient-test-secret';
  const calls = [];
  const state = {
    config: renderedConfig(), failures: new Set(),
    imageLabels: { 'io.datavisool.deployment': 'allinone', 'io.datavisool.mysql.base': 'mysql:8.4.11' },
    labelsByImage: {}, container: null, backupTar: 'mock cold data archive',
  };
  const execute = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options: { ...options }, env: { ...options.env } });
    if (command === 'tar') {
      if (state.failures.has('archive') && args[0] === '-czf') throw new Error('archive failed');
      return run(command, args, { ...options, capture: true });
    }
    assert.equal(command, 'docker');
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    if (args[0] === 'image' && args[1] === 'inspect') {
      const image = args.at(-1);
      return JSON.stringify(state.labelsByImage[image] || state.imageLabels);
    }
    if (args[0] === 'inspect') return JSON.stringify(state.container);
    if (args[0] === 'image' && args[1] === 'save') {
      const outputIndex = args.findIndex(arg => arg === '--output' || arg === '-o');
      if (outputIndex !== -1) fs.writeFileSync(args[outputIndex + 1], args.slice(outputIndex + 2).join('\n'));
      return '';
    }
    if (args[0] === 'compose' && args.includes('config')) {
      if (args.includes('--format') && args[args.indexOf('--format') + 1] === 'json') return JSON.stringify(state.config);
      if (args.includes('--services')) return Object.keys(state.config.services).join('\n');
      return '';
    }
    if (args[0] === 'compose' && args.includes('ps') && args.includes('--quiet')) {
      return state.container ? 'mock-container-id' : '';
    }
    if (args[0] === 'compose' && args.includes('run')) {
      if (state.failures.has('backup')) throw new Error('cold backup helper failed');
      if (options.stdoutFd !== undefined) fs.writeSync(options.stdoutFd, state.backupTar);
      return '';
    }
    if (args[0] === 'compose' && args.includes('up') && state.failures.has('up')) throw new Error('start failed');
    return '';
  };
  const invoke = (command, ...args) => deploy([command, '--dir', dir, ...args], { execute, scriptDir, env, log() {} });
  invoke('init');
  state.config = renderedConfig(envValue(path.join(dir, '.env'), 'DATAVISOOL_IMAGE'), path.join(dir, 'config/application.yml'));
  return { root, dir, env, calls, state, execute, invoke };
}

function composeCalls(f, predicate) {
  return f.calls.filter(call => call.command === 'docker' && call.args[0] === 'compose' && predicate(call.args));
}

test('all-in-one init creates a marked standalone directory and repeated init preserves local settings', async t => {
  const f = fixture(t);
  const envFile = path.join(f.dir, '.env');
  const before = fs.readFileSync(envFile);
  const envText = before.toString('utf8');
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  assert.match(envText, new RegExp(`^DATAVISOOL_IMAGE=datavisool-web-allinone:${version}$`, 'm'));
  assert.match(envText, /^DATAVISOOL_IMAGE=datavisool-web-allinone:[A-Za-z0-9_.-]+$/m);
  assert.match(envText, /^DATAVISOOL_PROJECT_NAME=datavisool-web-allinone$/m);
  for (const name of ['APP_BIND_ADDRESS', 'APP_PORT', 'JAVA_TOOL_OPTIONS']) assert.match(envText, new RegExp(`^${name}=`, 'm'));
  for (const forbidden of ['MYSQL_IMAGE', 'APP_UID', 'APP_GID', 'MYSQL_ROOT_PASSWORD']) {
    assert.doesNotMatch(envText, new RegExp(`^${forbidden}=`, 'm'));
  }
  assert.equal(fs.readFileSync(path.join(f.dir, '.datavisool-deployment'), 'utf8'), 'docker-allinone\n');
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) assert.match(envText, new RegExp(`^${key}=$`, 'm'));
  assert.ok(fs.existsSync(path.join(f.dir, 'docker-compose.yml')));
  assert.match(fs.readFileSync(path.join(f.dir, 'docker-compose.yml'), 'utf8'), /source:\s*\.\/data\b/);
  assert.ok(fs.existsSync(path.join(f.dir, 'deploy.mjs')));
  assert.ok(fs.existsSync(path.join(f.dir, 'lib/common.mjs')));
  assert.ok(fs.statSync(path.join(f.dir, 'data')).isDirectory());
  assert.deepEqual(fs.readFileSync(path.join(f.dir, 'config/application.yml')),
    fs.readFileSync(path.join(scriptDir, 'config/application.yml')));
  for (const name of ['resource', 'logs']) assert.ok(!fs.existsSync(path.join(f.dir, name)));

  const customizedEnv = `${envText.trimEnd()}\nLOCAL_TEST_VALUE=preserve\n`;
  fs.writeFileSync(path.join(f.dir, '.env'), customizedEnv);
  const customizedConfig = 'customized-by-user: keep\n';
  fs.writeFileSync(path.join(f.dir, 'config/application.yml'), customizedConfig);
  f.invoke('init', '--image', 'datavisool-web-allinone:other');
  assert.equal(fs.readFileSync(envFile, 'utf8'), customizedEnv);
  assert.equal(fs.readFileSync(path.join(f.dir, 'config/application.yml'), 'utf8'), customizedConfig);
  assert.equal(fs.readFileSync(path.join(f.dir, '.datavisool-deployment'), 'utf8'), 'docker-allinone\n');
  assert.match(run(process.execPath, [path.join(f.dir, 'deploy.mjs'), '--help'], { capture: true }), /backup/);

  const installed = await import(pathToFileURL(path.join(f.dir, 'deploy.mjs')).href);
  const checkCalls = [];
  installed.deploy(['check'], { execute: (command, args) => {
    checkCalls.push(args);
    assert.equal(command, 'docker');
    if (args.includes('--format') && args.includes('json')) return JSON.stringify(f.state.config);
    return '';
  }, env: f.env, log() {} });
  assert.ok(checkCalls.some(args => args.includes('config')));

  const help = [];
  deploy(['--help'], { scriptDir, env: f.env, log: message => help.push(message) });
  assert.match(help.join('\n'), /\/usr\/app\/datavisool-web-allinone/);
});

test('all-in-one init refuses a missing data directory for an existing deployment and rejects data symlinks', {
  skip: process.platform === 'win32',
}, t => {
  const f = fixture(t);
  const dataDir = path.join(f.dir, 'data');
  fs.rmSync(dataDir, { recursive: true, force: true });
  assert.throws(() => f.invoke('init'), /已初始化.*data.*丢失|恢复原数据目录/u);
  assert.equal(fs.existsSync(dataDir), false);

  const target = path.join(f.root, 'external data target');
  fs.mkdirSync(target);
  fs.symlinkSync(target, dataDir, 'dir');
  assert.throws(() => f.invoke('init'), /data.*符号链接/u);
  fs.rmSync(dataDir);

  const freshDir = path.join(f.root, 'fresh symlink deployment');
  fs.mkdirSync(freshDir);
  fs.symlinkSync(target, path.join(freshDir, 'data'), 'dir');
  assert.throws(() => f.invoke('init', '--dir', freshDir), /data.*符号链接/u);
  assert.equal(fs.existsSync(path.join(freshDir, '.datavisool-deployment')), false);
});

test('installed all-in-one entry runs through a symlinked parent directory on POSIX', {
  skip: process.platform === 'win32',
}, t => {
  const f = fixture(t);
  const linkedParent = path.join(f.root, 'linked deployment parent');
  fs.symlinkSync(f.dir, linkedParent, 'dir');

  const help = run(process.execPath, [path.join(linkedParent, 'deploy.mjs'), '--help'], { capture: true });
  assert.match(help, /backup/);
  assert.match(help, /usr\/app\/datavisool-web-allinone/);
});

test('all-in-one init refuses legacy app-only and two-container directories', t => {
  const f = fixture(t);
  const legacy = path.join(f.root, 'legacy app deployment');
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, '.datavisool-deployment'), 'docker-stack\n');
  fs.writeFileSync(path.join(legacy, '.env'), 'DATAVISOOL_IMAGE=datavisool-web:old\n');
  fs.writeFileSync(path.join(legacy, 'docker-compose.yml'), 'services:\n  app:\n    image: datavisool-web:old\n');
  assert.throws(() => f.invoke('init', '--dir', legacy));
  assert.equal(fs.readFileSync(path.join(legacy, '.datavisool-deployment'), 'utf8'), 'docker-stack\n');
  assert.equal(fs.readFileSync(path.join(legacy, 'docker-compose.yml'), 'utf8'), 'services:\n  app:\n    image: datavisool-web:old\n');

  const appOnly = path.join(f.root, 'legacy app-only');
  fs.mkdirSync(appOnly);
  fs.writeFileSync(path.join(appOnly, '.env'), 'DATAVISOOL_IMAGE=datavisool-web:old\n');
  fs.writeFileSync(path.join(appOnly, 'docker-compose.yml'), 'services:\n  app:\n    image: datavisool-web:old\n');
  assert.throws(() => f.invoke('init', '--dir', appOnly));
});

test('all-in-one check requires a writable deployment data bind mount and read-only application config', t => {
  const f = fixture(t);
  f.invoke('check');
  for (const config of [
    { ...renderedConfig(), services: { ...renderedConfig().services, mysql: { image: 'mysql:8.4.11' } } },
    { services: { app: { image: 'datavisool-web-allinone:2026.10.0', volumes: [] } }, volumes: {} },
    { services: { app: { image: 'datavisool-web-allinone:2026.10.0', volumes: [
      { type: 'bind', source: './other-data', target: '/data' },
      { type: 'bind', source: path.join(f.dir, 'config/application.yml'), target: '/config/application.yml', read_only: true },
    ] } }, volumes: {} },
    { services: { app: { image: 'datavisool-web-allinone:2026.10.0', volumes: [
      { type: 'bind', source: './data', target: '/data', read_only: true },
      { type: 'bind', source: path.join(f.dir, 'config/application.yml'), target: '/config/application.yml', read_only: true },
    ] } }, volumes: {} },
    { ...renderedConfig(), services: { app: { ...renderedConfig().services.app, volumes: [
      renderedConfig().services.app.volumes[0],
      { ...renderedConfig().services.app.volumes[1], read_only: false },
    ] } } },
    { ...renderedConfig(), services: { app: { ...renderedConfig().services.app, volumes: [renderedConfig().services.app.volumes[0]] } } },
    { ...renderedConfig(), services: { app: { ...renderedConfig().services.app, ports: [] } } },
    { ...renderedConfig(), services: { app: { ...renderedConfig().services.app, ports: [
      ...renderedConfig().services.app.ports,
      { target: 9000, published: '9000', protocol: 'tcp' },
    ] } } },
    { ...renderedConfig(), services: { app: { ...renderedConfig().services.app, ports: [
      renderedConfig().services.app.ports[0],
      { ...renderedConfig().services.app.ports[1], published: '65536' },
    ] } } },
    { ...renderedConfig(), services: { app: { ...renderedConfig().services.app, environment: {
      ...renderedConfig().services.app.environment, DATAVISOOL_MYSQL_HOST_PORT_ENABLED: '0',
    } } } },
  ]) {
    f.state.config = config;
    assert.throws(() => f.invoke('check'));
  }
  f.state.config = {
    services: { app: { image: 'datavisool-web-allinone:2026.10.0', environment: renderedConfig().services.app.environment, volumes: [
      { type: 'volume', source: 'datavisool-web-allinone_data', target: '/data' },
      { type: 'bind', source: './config/application.yml', target: '/config/application.yml', read_only: true },
    ], ports: renderedConfig().services.app.ports } },
    volumes: { 'datavisool-web-allinone_data': { name: 'datavisool-web-allinone_data' } },
  };
  assert.throws(() => f.invoke('check'), /旧版 Docker 命名卷|迁移/iu);
});

test('all-in-one check accepts MYSQL_PORT 0 and strips ambient MYSQL_* values from Docker Compose', t => {
  const f = fixture(t);
  f.state.config = renderedConfig();
  f.state.config.services.app.ports[1].published = '0';
  f.invoke('check');
  const dockerCalls = f.calls.filter(call => call.command === 'docker');
  assert.ok(dockerCalls.length > 0);
  for (const call of dockerCalls) {
    assert.equal(Object.keys(call.env).some(key => key.toUpperCase().startsWith('MYSQL_')), false);
  }
});

test('all-in-one smoke recognizes a MySQL protocol greeting packet', () => {
  const payload = Buffer.concat([Buffer.from([0x0a]), Buffer.from('8.4.11\0')]);
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header[3] = 0;
  assert.equal(parseMysqlServerGreetingPacket(Buffer.concat([header, payload])), '8.4.11');
  const invalidPayload = Buffer.from([0x16, 0, 0]);
  const invalidHeader = Buffer.alloc(4);
  invalidHeader.writeUIntLE(invalidPayload.length, 0, 3);
  assert.throws(() => parseMysqlServerGreetingPacket(Buffer.concat([invalidHeader, invalidPayload])), /MySQL protocol greeting/);
});

test('all-in-one check and up refuse missing config while stop and status remain available', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.dir, 'config/application.yml'));
  for (const command of ['check', 'up']) {
    const callsBefore = f.calls.length;
    assert.throws(() => f.invoke(command), /application\.yml|配置文件/i);
    const callsAfter = f.calls.slice(callsBefore);
    assert.ok(!callsAfter.some(call => call.command === 'docker' && call.args[0] === 'image' && call.args[1] === 'inspect'));
    assert.ok(!callsAfter.some(call => call.command === 'docker' && call.args[0] === 'compose' && call.args.includes('up')));
  }
  f.invoke('stop');
  f.invoke('status');
  assert.ok(composeCalls(f, args => args.includes('stop')).length > 0);
  assert.ok(composeCalls(f, args => args.includes('ps')).length > 0);
});

test('all-in-one up inspects the single local image before waiting for its service', t => {
  const f = fixture(t);
  f.invoke('up');
  const inspections = f.calls.filter(call => call.command === 'docker' && call.args[0] === 'image' && call.args[1] === 'inspect');
  assert.equal(inspections.length, 1);
  assert.equal(inspections[0].args.at(-1), envValue(path.join(f.dir, '.env'), 'DATAVISOOL_IMAGE'));
  assert.ok(inspections[0].args.includes('--format'));
  assert.equal(inspections[0].args[inspections[0].args.indexOf('--format') + 1], '{{json .Config.Labels}}');
  const start = composeCalls(f, args => args.includes('up')).at(-1);
  assert.ok(start);
  assert.ok(start.args.includes('--wait'));
  assert.ok(start.args.includes('--detach'));
  assert.ok(f.calls.indexOf(inspections[0]) < f.calls.indexOf(start));
});

test('all-in-one up refuses images from another deployment type', t => {
  for (const imageLabels of [
    { 'io.datavisool.deployment': 'app-only', 'io.datavisool.mysql.base': 'mysql:8.4.11' },
  ]) {
    const f = fixture(t);
    f.state.imageLabels = imageLabels;
    assert.throws(() => f.invoke('up'));
    assert.equal(composeCalls(f, args => args.includes('up')).length, 0);
  }
});

test('all-in-one up refuses an existing running or stopped named-volume container before switching to data/', t => {
  for (const status of ['running', 'exited']) {
    const f = fixture(t);
    f.state.container = {
      Image: 'sha256:legacy',
      Config: { Image: 'datavisool-web-allinone:2026.9.0' },
      State: { Status: status, ExitCode: status === 'exited' ? 0 : undefined },
      Mounts: [{ Type: 'volume', Name: 'datavisool-web-allinone_data', Destination: '/data' }],
    };
    const before = fs.readFileSync(path.join(f.dir, '.env'));
    assert.throws(() => f.invoke('up'), /旧版 Docker 命名卷|迁移/iu);
    assert.deepEqual(fs.readFileSync(path.join(f.dir, '.env')), before);
    assert.equal(composeCalls(f, args => args.includes('up')).length, 0);
  }
});

test('all-in-one up and upgrade refuse an existing container unless /data is the writable deployment bind', t => {
  const f = fixture(t);
  const validMount = { Type: 'bind', Source: path.join(f.dir, 'data'), Destination: '/data', RW: true };
  for (const mounts of [
    [],
    [{ ...validMount, Source: path.join(f.root, 'other-data') }],
    [{ ...validMount, RW: false }],
    [validMount, { ...validMount }],
  ]) {
    f.state.container = {
      Image: 'sha256:existing',
      Config: { Image: 'datavisool-web-allinone:2026.9.0' },
      State: { Status: 'exited', ExitCode: 0 },
      Mounts: mounts,
    };
    for (const [command, args] of [['up', []], ['upgrade', ['--image', 'datavisool-web-allinone:2026.10.1']]]) {
      const callsBefore = composeCalls(f, callArgs => callArgs.includes('up')).length;
      assert.throws(() => f.invoke(command, ...args), /\/data.*bind|挂载.*data|空数据库/iu);
      assert.equal(composeCalls(f, callArgs => callArgs.includes('up')).length, callsBefore);
    }
  }
});

test('all-in-one upgrade refuses a different MySQL base before changing the deployment', t => {
  const f = fixture(t);
  f.state.container = {
    Image: 'sha256:existing',
    Config: { Image: 'datavisool-web-allinone:previous' },
    State: { Status: 'exited', ExitCode: 0 },
    Mounts: [{ Type: 'bind', Source: path.join(f.dir, 'data'), Destination: '/data', RW: true }],
  };
  f.state.labelsByImage['sha256:existing'] = { 'io.datavisool.deployment': 'allinone', 'io.datavisool.mysql.base': 'mysql:8.0.36' };
  f.state.labelsByImage['datavisool-web-allinone:2026.10.1'] = { 'io.datavisool.deployment': 'allinone', 'io.datavisool.mysql.base': 'mysql:8.4.11' };
  const before = fs.readFileSync(path.join(f.dir, '.env'));
  assert.throws(() => f.invoke('upgrade', '--image', 'datavisool-web-allinone:2026.10.1'), /MySQL|数据库/iu);
  assert.deepEqual(fs.readFileSync(path.join(f.dir, '.env')), before);
  assert.ok(!composeCalls(f, args => args.includes('up')).length);
  assert.ok(!fs.existsSync(path.join(f.dir, 'previous-image.txt')));
});

test('all-in-one stop stops the app container and down retains its data directory', t => {
  const f = fixture(t);
  f.invoke('stop');
  f.invoke('down');
  const stop = composeCalls(f, args => args.includes('stop')).at(-1);
  assert.ok(stop.args.slice(stop.args.indexOf('stop') + 1).every(service => service === 'app'));
  const down = composeCalls(f, args => args.includes('down')).at(-1);
  assert.ok(!down.args.includes('--volumes') && !down.args.includes('-v'));
});

test('all-in-one deployment does not expose the former MySQL image option', t => {
  const f = fixture(t);
  assert.throws(() => f.invoke('init', '--mysql-image', 'mysql:8.4.11'));
});

test('all-in-one smoke help shows its build test path', () => {
  const help = run(process.execPath, [path.join(buildDir, 'tests/allinone-smoke.mjs'), '--help'], { capture: true });
  assert.match(help, /node script\/build\/tests\/allinone-smoke\.mjs/);
});

test('all-in-one build resolves the project root and default version from the frontend manifest', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-build-defaults-')));
  try {
  const artifacts = artifactArgs(root);
  const calls = [];
  const execute = (command, args, options = {}) => {
    const call = { command, args: [...args], options };
    if (args[0] === 'buildx' && args[1] === 'build') {
      const context = args.at(-1);
      call.contextFiles = fs.readdirSync(context).sort();
      call.contextDir = context;
    }
    calls.push(call);
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    return '';
  };
  build(['--skip-export', ...artifacts], { execute, scriptDir, log() {} });

  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  const buildCall = calls.find(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.ok(buildCall);
  assert.equal(buildCall.args[buildCall.args.indexOf('--tag') + 1], `datavisool-web-allinone:${version}-amd64`);
  assert.ok(buildCall.args.includes(`APP_VERSION=${version}`));
  const context = buildCall.args.at(-1);
  assert.notEqual(context, repoRoot);
  assert.deepEqual(buildCall.contextFiles, ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'application.yml', 'component-docs', 'patch-mysql-entrypoint.py', 'runtime.py', 'server.jar']);
  assert.equal(fs.existsSync(context), false, 'temporary Docker context must be removed after the build');
  assert.equal(buildCall.args[buildCall.args.indexOf('--file') + 1], path.join(scriptDir, 'Dockerfile'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('all-in-one builder defaults to the native target JAR and component-docs', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-default-artifacts-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const customScriptDir = path.join(root, 'script/build/docker-allinone');
  const customRepoDir = path.resolve(customScriptDir, '../../..');
  fs.mkdirSync(path.join(customScriptDir, 'config'), { recursive: true });
  fs.mkdirSync(customRepoDir, { recursive: true });
  fs.writeFileSync(path.join(customRepoDir, 'package.json'), JSON.stringify({ version: 'fixture-version' }));
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) fs.copyFileSync(path.join(repoRoot, name), path.join(customRepoDir, name));
  for (const asset of ['Dockerfile', 'runtime.py', 'patch-mysql-entrypoint.py']) {
    fs.copyFileSync(path.join(scriptDir, asset), path.join(customScriptDir, asset));
  }
  fs.copyFileSync(path.join(scriptDir, 'config/application.yml'), path.join(customScriptDir, 'config/application.yml'));
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
  assert.deepEqual(contextFiles, ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'application.yml', 'component-docs', 'patch-mysql-entrypoint.py', 'runtime.py', 'server.jar']);
  assert.equal(fs.existsSync(context), false);
});

function stoppedContainer(dataDir) {
  return {
    Image: 'sha256:stopped-image',
    Config: { Image: 'datavisool-web-allinone:2026.9.0' },
    State: { Status: 'exited', ExitCode: 0 },
    Mounts: [{ Type: 'bind', Source: dataDir, Destination: '/data' }],
  };
}

test('all-in-one backup uses the stopped image and mounted data directory for a cold backup', { skip: !hasTar }, t => {
  const f = fixture(t);
  f.state.container = stoppedContainer(path.join(f.dir, 'data'));
  f.state.labelsByImage['sha256:stopped-image'] = { 'io.datavisool.deployment': 'allinone', 'io.datavisool.mysql.base': 'mysql:8.4.11' };
  const backupDir = path.join(f.root, 'backups');
  f.invoke('backup', '--backup-dir', backupDir);
  const backup = path.join(backupDir, fs.readdirSync(backupDir)[0]);
  assert.equal(fs.readFileSync(path.join(backup, 'data.tar.gz'), 'utf8'), f.state.backupTar);
  const configArchive = path.join(backup, 'config.tar.gz');
  assert.ok(fs.existsSync(configArchive));
  assert.match(run('tar', ['-tzf', configArchive], { capture: true }), /config\/application\.yml/);
  assert.equal(run('tar', ['-xOzf', configArchive, 'config/application.yml'], { capture: true }),
    fs.readFileSync(path.join(f.dir, 'config/application.yml'), 'utf8').trimEnd());
  assert.ok(fs.existsSync(path.join(backup, 'COMPLETE')));
  assert.match(fs.readFileSync(path.join(backup, 'image.txt'), 'utf8'), /reference=datavisool-web-allinone:2026\.9\.0/);
  assert.match(fs.readFileSync(path.join(backup, 'image.txt'), 'utf8'), /id=sha256:stopped-image/);
  const helper = composeCalls(f, args => args.includes('run')).at(-1);
  assert.ok(helper.args.includes('--rm') && helper.args.includes('--no-deps') && helper.args.includes('-T'));
  assert.equal(helper.args[helper.args.indexOf('--entrypoint') + 1], '/bin/sh');
  assert.match(helper.args.join(' '), /test -f \/data\/config\/clean-shutdown && test -d \/data\/mysql\/mysql && exec tar -czf - -C \/data mysql resource config/);
  assert.equal(helper.options.stdoutFd !== undefined, true);
  assert.equal(helper.env.DATAVISOOL_IMAGE, 'sha256:stopped-image');
  assert.ok(!f.calls.some(call => call.args[0] === 'compose' && call.args.includes('up')));
});

test('all-in-one cold backup failure never writes COMPLETE', { skip: !hasTar }, t => {
  const f = fixture(t);
  f.state.container = stoppedContainer(path.join(f.dir, 'data'));
  f.state.labelsByImage['sha256:stopped-image'] = { 'io.datavisool.deployment': 'allinone', 'io.datavisool.mysql.base': 'mysql:8.4.11' };
  f.state.failures.add('backup');
  assert.throws(() => f.invoke('backup', '--backup-dir', path.join(f.root, 'backups')));
  const backupDir = path.join(f.root, 'backups');
  for (const name of fs.readdirSync(backupDir)) assert.ok(!fs.existsSync(path.join(backupDir, name, 'COMPLETE')));
});

test('all-in-one backup refuses a stopped container whose /data mount is not this deployment data directory', t => {
  const f = fixture(t);
  f.state.container = {
    ...stoppedContainer(path.join(f.dir, 'data')),
    Mounts: [{ Type: 'bind', Source: path.join(f.root, 'other-data'), Destination: '/data' }],
  };
  assert.throws(() => f.invoke('backup', '--backup-dir', path.join(f.root, 'backups')), /bind|data|挂载/iu);
  assert.equal(f.calls.some(call => call.command === 'docker' && call.args[0] === 'image' && call.args[1] === 'inspect'), false);
});

test('all-in-one explicit arm64 build exports architecture metadata with the MySQL base argument', { skip: !hasTar }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-build-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const execute = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (command === 'tar') return run(command, args, { ...options, capture: true });
    assert.equal(command, 'docker');
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    if (args[0] === 'image' && args[1] === 'save') {
      const outputIndex = args.findIndex(arg => arg === '--output' || arg === '-o');
      if (outputIndex !== -1) fs.writeFileSync(args[outputIndex + 1], args.slice(outputIndex + 2).join('\n'));
    }
    return '';
  };
  const outputDir = path.join(root, 'release package');
  const artifacts = artifactArgs(root);
  const options = { execute, scriptDir, log() {} };
  build(['--version', '2026.10.0', '--platform', 'linux/arm64', '--output-dir', outputDir, ...artifacts], options);

  const buildCalls = calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.equal(buildCalls.length, 1);
  const buildArgs = buildCalls[0].args;
  assert.equal(buildArgs[buildArgs.indexOf('--platform') + 1], 'linux/arm64');
  assert.equal(buildArgs[buildArgs.indexOf('--tag') + 1], 'datavisool-web-allinone:2026.10.0-arm64');
  assert.ok(buildArgs.includes('--file'));
  assert.equal(buildArgs[buildArgs.indexOf('--file') + 1], path.join(scriptDir, 'Dockerfile'));
  assert.ok(buildArgs.includes('--build-arg'));
  const buildArgsList = buildArgs.flatMap((arg, index) => arg === '--build-arg' ? [buildArgs[index + 1]] : []);
  assert.ok(buildArgsList.includes('MYSQL_IMAGE=mysql:8.4.11'));
  assert.ok(!calls.some(call => call.args[0] === 'pull'));

  const save = calls.find(call => call.args[0] === 'image' && call.args[1] === 'save');
  assert.ok(save);
  const outputIndex = save.args.findIndex(arg => arg === '--output' || arg === '-o');
  assert.deepEqual(save.args.slice(outputIndex + 2), ['datavisool-web-allinone:2026.10.0-arm64']);

  const archiveName = 'datavisool-web-allinone-2026.10.0-linux-arm64.tar.gz';
  const archive = path.join(outputDir, archiveName);
  assert.ok(fs.existsSync(archive));
  const extract = path.join(root, 'extracted');
  fs.mkdirSync(extract);
  run('tar', ['-xzf', archive, '-C', extract]);
  const payload = path.join(extract, fs.readdirSync(extract)[0]);
  assert.deepEqual(fs.readFileSync(path.join(payload, 'config/application.yml')),
    fs.readFileSync(path.join(scriptDir, 'config/application.yml')));
  assert.ok(!fs.existsSync(path.join(payload, 'docker-allinone/config/application.yml')));
  assert.ok(!fs.existsSync(path.join(payload, 'docker-allinone/deploy-allinone.mjs')));
  assert.ok(!fs.existsSync(path.join(payload, 'lib')));
  assert.ok(fs.existsSync(path.join(payload, 'docker-allinone/docker-compose.yml')));
  assert.ok(fs.existsSync(path.join(payload, 'docker-allinone/.env.example')));
  assert.ok(fs.existsSync(path.join(payload, 'docker-allinone/IMAGE')));
  assert.equal(fs.readFileSync(path.join(payload, 'docker-allinone/IMAGE'), 'utf8'), 'datavisool-web-allinone:2026.10.0-arm64\n');
  assert.equal(fs.readFileSync(path.join(payload, 'docker-allinone/PLATFORM'), 'utf8'), 'linux/arm64\n');
  assert.ok(!fs.existsSync(path.join(payload, 'deploy-allinone.mjs')));
  assert.ok(fs.existsSync(path.join(payload, 'image.tar')));
  assert.match(fs.readFileSync(path.join(payload, 'image.tar'), 'utf8'), /^datavisool-web-allinone:2026\.10\.0-arm64$/m);

  const help = run('/bin/sh', [path.join(payload, 'deploy_linux.sh'), '--help'], { capture: true });
  assert.match(help, /Docker allinone/);

  const originalArchive = fs.readFileSync(archive);
  assert.throws(() => build(['--version', '2026.10.0', '--platform', 'linux/arm64', '--output-dir', outputDir, ...artifacts], options), /发布包已存在/);
  assert.deepEqual(fs.readFileSync(archive), originalArchive);
});

test('default all-in-one build loads both architecture tags and aliases the host architecture', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-dual-build-')));
  try {
  const artifacts = artifactArgs(root);
  const calls = [];
  const execute = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    return '';
  };
  build(['--skip-export', ...artifacts], { execute, scriptDir, log() {} });
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  const buildCalls = calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.equal(buildCalls.length, 2);
  assert.deepEqual(buildCalls.map(call => call.args[call.args.indexOf('--platform') + 1]), ['linux/amd64', 'linux/arm64']);
  assert.deepEqual(buildCalls.map(call => call.args[call.args.indexOf('--tag') + 1]), [
    `datavisool-web-allinone:${version}-amd64`, `datavisool-web-allinone:${version}-arm64`,
  ]);
  assert.ok(calls.some(call => call.args[0] === 'image' && call.args[1] === 'tag'
    && call.args.slice(-2).join(' ') === `datavisool-web-allinone:${version}-amd64 datavisool-web-allinone:${version}`)
    || buildCalls.some(call => call.args.some((arg, index) => arg === '--tag' && call.args[index + 1] === `datavisool-web-allinone:${version}`)));
  assert.equal(calls.filter(call => call.args[0] === 'info' && call.args.includes('{{.Architecture}}')).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('default all-in-one build exports both one-click architecture packages', { skip: !hasTar }, t => {
  assertDualArchitecturePublish(t, {
    build, scriptDir, imageName: 'datavisool-web-allinone', bundlePrefix: 'datavisool-web-allinone',
    assetsDir: 'docker-allinone',
  });
});

test('explicit amd64 all-in-one build only builds amd64 and keeps the unqualified version alias', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-amd64-build-')));
  try {
  const artifacts = artifactArgs(root);
  const calls = [];
  const execute = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'aarch64';
    return '';
  };
  build(['--skip-export', '--version', 'test-version', '--platform', 'linux/amd64', ...artifacts], { execute, scriptDir, log() {} });
  const buildCalls = calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build');
  assert.equal(buildCalls.length, 1);
  assert.equal(buildCalls[0].args[buildCalls[0].args.indexOf('--platform') + 1], 'linux/amd64');
  assert.equal(buildCalls[0].args[buildCalls[0].args.indexOf('--tag') + 1], 'datavisool-web-allinone:test-version-amd64');
  assert.ok(calls.some(call => call.args[0] === 'image' && call.args[1] === 'tag'
    && call.args.slice(-2).join(' ') === 'datavisool-web-allinone:test-version-amd64 datavisool-web-allinone:test-version')
    || buildCalls[0].args.some((arg, index) => arg === '--tag' && buildCalls[0].args[index + 1] === 'datavisool-web-allinone:test-version'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('default all-in-one build preflights both release archives before building', { skip: !hasTar }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-preflight-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, 'release');
  const artifacts = artifactArgs(root);
  fs.mkdirSync(outputDir);
  fs.writeFileSync(path.join(outputDir, 'datavisool-web-allinone-test-version-linux-arm64.tar.gz'), 'existing');
  const calls = [];
  const execute = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    return '';
  };
  assert.throws(() => build(['--version', 'test-version', '--output-dir', outputDir, ...artifacts], { execute, scriptDir, log() {} }), /发布包已存在/);
  assert.equal(calls.filter(call => call.args[0] === 'buildx' && call.args[1] === 'build').length, 0);
  assert.deepEqual(fs.readdirSync(outputDir), ['datavisool-web-allinone-test-version-linux-arm64.tar.gz']);
});

test('failed second default all-in-one architecture keeps only the completed amd64 package', { skip: !hasTar }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-build-second-failure-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, 'release');
  const artifacts = artifactArgs(root);
  const calls = [];
  const contexts = [];
  const execute = (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    if (args[0] === 'buildx' && args[1] === 'build') {
      contexts.push(args.at(-1));
      assert.deepEqual(fs.readdirSync(args.at(-1)).sort(), ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'application.yml', 'component-docs', 'patch-mysql-entrypoint.py', 'runtime.py', 'server.jar']);
      if (args[args.indexOf('--platform') + 1] === 'linux/arm64') throw new Error('arm64 build failed');
    }
    if (command === 'tar') return run(command, args, { ...options, capture: true });
    return '';
  };
  assert.throws(() => build(['--version', 'test-version', '--output-dir', outputDir, ...artifacts], { execute, scriptDir, log() {} }), /arm64 build failed/);
  assert.deepEqual(fs.readdirSync(outputDir), ['datavisool-web-allinone-test-version-linux-amd64.tar.gz']);
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0], contexts[1], 'both architectures share one temporary context');
  assert.equal(fs.existsSync(contexts[0]), false, 'context is removed when a later architecture fails');
});

test('all-in-one build export failure leaves no release archive', { skip: !hasTar }, t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-build-failure-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputDir = path.join(root, 'failed release');
  const artifacts = artifactArgs(root);
  const execute = (command, args) => {
    if (args[0] === 'image' && args[1] === 'save') throw new Error('image export failed');
    if (args[0] === 'info' && args.includes('{{.OSType}}')) return 'linux';
    if (args[0] === 'info' && args.includes('{{.Architecture}}')) return 'x86_64';
    return '';
  };
  assert.throws(() => build(['--version', '2026.10.0', '--platform', 'linux/arm64', '--output-dir', outputDir, ...artifacts],
    { execute, scriptDir, log() {} }), /image export failed/);
  assert.deepEqual(fs.readdirSync(outputDir), []);
});

test('all-in-one builder rejects a missing shared artifact directory before contacting Docker', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-missing-artifacts-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  assert.throws(() => build(['--skip-export', '--artifact-dir', path.join(root, 'missing')], {
    scriptDir, log() {}, execute: (command, args) => { calls.push({command, args}); return ''; },
  }), /artifact context|artifact|Docker 构建产物无效/i);
  assert.deepEqual(calls, [], 'a missing shared context must not fall back to default target outputs');
});

test('real Compose renders one all-in-one service with the deployment data directory bind-mounted writable', { skip: !hasDockerCompose }, t => {
  const f = fixture(t);
  const envFile = path.join(f.dir, '.env');
  fs.writeFileSync(envFile, fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
    .filter(line => !/^\s*(?:export\s+)?MYSQL_/i.test(line)).join('\n'));
  setEnv(path.join(f.dir, '.env'), { DB_NAME: 'deploy_db', DB_USER: 'deploy_user', DB_PASSWORD: 'deploy-test-password' });
  const execute = (command, args, options = {}) => run(command, args, { ...options, capture: true });
  deploy(['check', '--dir', f.dir], { execute, scriptDir, env: f.env, log() {} });
  const composeEnv = { ...f.env };
  for (const key of Object.keys(composeEnv)) if (key.toUpperCase().startsWith('MYSQL_')) delete composeEnv[key];
  const rendered = JSON.parse(run('docker', ['compose', '--project-directory', f.dir,
    '--env-file', path.join(f.dir, '.env'), '-f', path.join(f.dir, 'docker-compose.yml'),
    'config', '--format', 'json'], { capture: true, env: composeEnv }));
  assert.deepEqual(Object.keys(rendered.services), ['app']);
  assert.equal(rendered.services.app.image, envValue(path.join(f.dir, '.env'), 'DATAVISOOL_IMAGE'));
  assert.equal(rendered.services.app.environment.DATAVISOOL_MYSQL_HOST_PORT_ENABLED, '1');
  assert.deepEqual(rendered.services.app.ports.map(port => Number(port.target)).sort((a, b) => a - b), [3306, 8080]);
  const mysqlPort = rendered.services.app.ports.find(port => Number(port.target) === 3306);
  assert.equal(mysqlPort.host_ip, '127.0.0.1');
  assert.equal(String(mysqlPort.published), '3306', 'legacy .env without MYSQL_* keys should use Compose defaults');
  const dataMount = rendered.services.app.volumes.find(volume => volume.target === '/data');
  assert.equal(dataMount.type, 'bind');
  assert.equal(path.resolve(dataMount.source), path.join(f.dir, 'data'));
  assert.notEqual(dataMount.read_only, true);
  assert.equal(Object.keys(rendered.volumes || {}).length, 0);
  const applicationConfig = rendered.services.app.volumes.find(volume => volume.target === '/config/application.yml');
  assert.equal(applicationConfig.type, 'bind');
  assert.equal(applicationConfig.read_only, true);
  assert.equal(path.resolve(applicationConfig.source), path.join(f.dir, 'config/application.yml'));
  assert.equal(rendered.services.app.environment.DB_NAME, 'deploy_db');
  assert.equal(rendered.services.app.environment.DB_USER, 'deploy_user');
  assert.equal(rendered.services.app.environment.DB_PASSWORD, 'deploy-test-password');
  assert.ok(!Object.hasOwn(rendered.services.app.environment || {}, 'MYSQL_ROOT_PASSWORD'));
});


test('all-in-one check and up require all supplied database settings without generating defaults', t => {
  const f = fixture(t);
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    for (const value of ['', undefined]) {
      f.state.config = renderedConfig();
      f.state.config.services.app.environment[key] = value;
      for (const command of ['check', 'up']) assert.throws(() => f.invoke(command), new RegExp(key));
    }
  }
  assert.equal(composeCalls(f, args => args.includes('up')).length, 0);
});
