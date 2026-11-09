/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER_DIR = path.join(BUILD_DIR, 'launcher');
const ALLINONE_DIR = path.join(BUILD_DIR, 'docker-allinone');
const SKIP_SHELL_TESTS = process.platform === 'win32' || !fs.existsSync('/bin/sh');
const REAL_COMPOSE_VERSION = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 3000 });
const HAS_REAL_COMPOSE = REAL_COMPOSE_VERSION.status === 0;
const REAL_DOCKER_BIN = spawnSync('/bin/sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim();
const REAL_ENV_BIN = spawnSync('/bin/sh', ['-c', 'command -v env'], { encoding: 'utf8' }).stdout.trim();
let packageCounter = 0;
const HAS_PYTHON3 = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0;
const DOCKER_PTY_DRIVER = String.raw`
import os, pty, select, subprocess, sys, time
command = ['/bin/sh', sys.argv[1], *sys.argv[2:]]
prompts = [
    ('MySQL 数据库名称（直接回车取消）：'.encode(), os.environ.get('PTY_DB_NAME', '')),
    ('MySQL 用户名（直接回车取消）：'.encode(), os.environ.get('PTY_DB_USER', '')),
    ('MySQL 密码（直接回车取消）：'.encode(), os.environ.get('PTY_DB_PASSWORD', '')),
]
master, slave = pty.openpty()
proc = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
output = bytearray()
sent = set()
timed_out = False
deadline = time.monotonic() + float(os.environ.get('PTY_TIMEOUT', '20'))
try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(master, 4096)
            except OSError:
                chunk = b''
            if chunk:
                output.extend(chunk)
        pending = next((index for index, item in enumerate(prompts) if index not in sent and item[0] in output), None)
        if pending is not None:
            time.sleep(0.2)
            os.write(master, prompts[pending][1].encode() + b'\n')
            sent.add(pending)
        if proc.poll() is not None:
            ready, _, _ = select.select([master], [], [], 0.15)
            if ready:
                try:
                    output.extend(os.read(master, 4096))
                except OSError:
                    pass
            break
    else:
        timed_out = True
finally:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2)
    os.close(master)
sys.stdout.buffer.write(output)
sys.stdout.buffer.flush()
sys.exit(124 if timed_out else proc.returncode)
`;


function shellTest(name, optionsOrCallback, maybeCallback) {
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  test(name, { ...options, skip: SKIP_SHELL_TESTS || options.skip }, callback);
}

async function makeUnixSocketAliases(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-sockets-'));
  const sockets = [];
  const aliases = [];
  const servers = [];
  t.after(async () => {
    try {
      await Promise.all(servers.map(server => new Promise((resolve, reject) => {
        if (!server.listening) return resolve();
        server.close(error => error ? reject(error) : resolve());
      })));
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
  for (let index = 0; index < 2; index++) {
    const socketPath = path.join(tempRoot, `engine-${index}.sock`);
    const aliasPath = path.join(tempRoot, `engine-${index}-alias.sock`);
    const server = net.createServer();
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    fs.symlinkSync(socketPath, aliasPath);
    sockets.push(`unix://${socketPath}`);
    aliases.push(`unix://${aliasPath}`);
  }
  return { sockets, aliases };
}

function parseDockerMountCsv(mountSpec) {
  const fields = [];
  let index = 0;
  while (index <= mountSpec.length) {
    let value = '';
    if (mountSpec[index] === '"') {
      index += 1;
      let closed = false;
      while (index < mountSpec.length) {
        if (mountSpec[index] === '"') {
          if (mountSpec[index + 1] === '"') {
            value += '"';
            index += 2;
          } else {
            index += 1;
            closed = true;
            break;
          }
        } else value += mountSpec[index++];
      }
      if (!closed || (index < mountSpec.length && mountSpec[index] !== ',')) {
        throw new Error('invalid Docker mount CSV quoting');
      }
    } else {
      while (index < mountSpec.length && mountSpec[index] !== ',') {
        if (mountSpec[index] === '"') throw new Error('quote in unquoted Docker mount CSV field');
        value += mountSpec[index++];
      }
    }
    fields.push(value);
    if (index === mountSpec.length) break;
    if (mountSpec[index] !== ',') throw new Error('invalid Docker mount CSV separator');
    index += 1;
  }

  const parsed = {};
  for (const field of fields) {
    const equals = field.indexOf('=');
    const key = equals < 0 ? field : field.slice(0, equals);
    if (!key || Object.hasOwn(parsed, key)) throw new Error('invalid or duplicate Docker mount field');
    parsed[key] = equals < 0 ? true : field.slice(equals + 1);
  }
  return parsed;
}

function fakeDockerSource() {
  return String.raw`#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const statePath = process.env.FAKE_DOCKER_STATE;
const recordPath = process.env.FAKE_DOCKER_RECORD;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const allText = args.join(' ');
const after = (flag, fallback = '') => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : fallback;
};
const template = after('--format');
const envFile = after('--env-file');
const readDotenv = file => {
  const values = {};
  if (!file || !fs.existsSync(file)) return values;
  for (let line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('\uFEFF')) line = line.slice(1);
    line = line.replace(/^[ \t]*/, '').replace(/^export[ \t]+/, '');
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)[ \t]*=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replaceAll("''", "'");
    else if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value).replaceAll('$$', '$'); } catch { value = value.slice(1, -1).replaceAll('$$', '$'); }
    }
    values[match[1]] = value;
  }
  return values;
};
const dotenv = readDotenv(envFile);
const resolveDotenv = (key, seen = new Set()) => {
  if (process.env[key] !== undefined) return process.env[key];
  if (!(key in dotenv) || seen.has(key)) return '';
  seen.add(key);
  return dotenv[key].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => resolveDotenv(name, seen));
};
const effective = key => resolveDotenv(key);
const project = after('-p', effective('DATAVISOOL_PROJECT_NAME') || 'datavisool-b-default');
const projectDirectory = after('--project-directory', envFile ? path.dirname(envFile) : process.cwd());
const image = effective('DATAVISOOL_IMAGE') || 'datavisool-web-allinone:test-amd64';
const volumes = state.volumes || (state.volumes = {});
const containers = () => state.containers || [];
const findContainer = id => containers().find(item => item.id === id);
const labelValue = (item, name) => (item?.labels || {})[name] || '';
const stdout = value => { process.stdout.write(String(value)); };
const stderr = value => { process.stderr.write(String(value)); };
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const fail = (message, status = 1) => { if (message) stderr(message + '\n'); process.exit(status); };
${parseDockerMountCsv.toString()}
const managedEnv = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(DATAVISOOL_|DB_|APP_|MYSQL_|COMPOSE_)/.test(key)) managedEnv[key] = key === 'DB_PASSWORD' ? '[redacted]' : value;
}
const hasCustomPasswordEnv = Object.hasOwn(process.env, 'CUSTOM_PASSWORD');
const hasPathEnv = Object.hasOwn(process.env, 'PATH');
const hasBareOverrideEnv = Object.hasOwn(process.env, 'BARE_PARENT_VALUE');
const dbPasswordMatchesFixture = effective('DB_PASSWORD') === process.env.FAKE_EXPECTED_DB_PASSWORD;
const stdin = args.includes('-f') && args[args.indexOf('-f') + 1] === '-' ? fs.readFileSync(0, 'utf8') : '';
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
record.push({ args, cwd: process.cwd(), managedEnv, hasCustomPasswordEnv, hasPathEnv, hasBareOverrideEnv, dbPasswordMatchesFixture, envFile, project, projectDirectory, stdin });
fs.writeFileSync(recordPath, JSON.stringify(record));

const makeContainer = () => {
  let container = containers().find(item => labelValue(item, 'com.docker.compose.project') === project
    && labelValue(item, 'com.docker.compose.service') === 'app'
    && labelValue(item, 'com.docker.compose.project.working_dir') === projectDirectory);
  if (!container) {
    const dataSource = path.join(projectDirectory, 'data');
    container = {
      id: state.nextContainerId || 'b0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      image,
      imageId: state.imageId || 'sha256:' + 'a'.repeat(64),
      status: 'running',
      health: state.healthFailure ? 'unhealthy' : 'healthy',
      exitCode: 0,
      oomKilled: false,
      dataSource,
      appBind: effective('APP_BIND_ADDRESS') || '0.0.0.0', appPort: effective('APP_PORT') || '8080',
      mysqlBind: effective('MYSQL_BIND_ADDRESS') || '127.0.0.1', mysqlPort: effective('MYSQL_PORT') || '3306',
      configSource: path.join(projectDirectory, 'config/application.yml'),
      labels: {
        'com.docker.compose.project': project,
        'com.docker.compose.service': 'app',
        'com.docker.compose.project.working_dir': projectDirectory,
      },
    };
    state.containers.push(container);
  } else {
    container.status = 'running';
    container.health = state.healthFailure ? 'unhealthy' : 'healthy';
    container.image = image;
    container.appBind = effective('APP_BIND_ADDRESS') || '0.0.0.0'; container.appPort = effective('APP_PORT') || '8080';
    container.mysqlBind = effective('MYSQL_BIND_ADDRESS') || '127.0.0.1'; container.mysqlPort = effective('MYSQL_PORT') || '3306';
  }
  if (!fs.existsSync(container.dataSource)) fail('bind source directory missing');
  save();
  return container;
};

if (args[0] === 'context' && args[1] === 'inspect') {
  stdout(state.endpoint || 'unix:///var/run/docker.sock');
} else if (args[0] === 'info') {
  const format = after('--format');
  if (format.includes('OSType')) stdout(state.osType || 'linux');
  else if (format.includes('Architecture')) stdout(state.architecture || 'amd64');
  else if (format.includes('ServerVersion')) stdout('27.0.0');
  else stdout('');
} else if (args[0] === 'compose' && args[1] === 'version') {
  stdout('2.20.3');
} else if (args[0] === 'compose' && args.includes('config')) {
  if (args.includes('--environment')) {
    fail('unknown flag: --environment');
  } else if (args.includes('--format') && after('--format') === 'json' && stdin) {
    if (!args.includes('-p')) fail('project name must not be empty');
    const keys = ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'MYSQL_BIND_ADDRESS', 'MYSQL_PORT',
      'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS', 'TZ'];
    const environment = Object.fromEntries(keys.map(key => [key, effective(key).split('$').join('$$')]));
    stdout(JSON.stringify({ services: { app: { environment } } }));
  } else if (args.includes('--format') && after('--format') === 'json') {
    stdout(JSON.stringify({
      name: project,
      services: {
        app: {
          image,
          pull_policy: 'never',
          stop_grace_period: '2m0s',
          environment: {
            DATAVISOOL_MYSQL_HOST_PORT_ENABLED: '1',
            DB_NAME: effective('DB_NAME'), DB_USER: effective('DB_USER'), DB_PASSWORD: effective('DB_PASSWORD').split('$').join('$$'),
            JAVA_TOOL_OPTIONS: effective('JAVA_TOOL_OPTIONS') || '-XX:MaxRAMPercentage=50.0 -Duser.timezone=Asia/Shanghai',
            TZ: effective('TZ') || 'Asia/Shanghai',
          },
          ports: [
            { host_ip: effective('APP_BIND_ADDRESS') || '0.0.0.0', published: effective('APP_PORT') || '8080', target: 8080, protocol: 'tcp' },
            { host_ip: state.badMysqlBind || effective('MYSQL_BIND_ADDRESS') || '127.0.0.1', published: state.badMysqlPublished || effective('MYSQL_PORT') || '3306', target: state.badMysqlTarget || 3306, protocol: state.badMysqlProtocol || 'tcp' },
          ],
          volumes: [
            { type: 'bind', source: path.join(projectDirectory, 'data'), target: '/data', bind: { create_host_path: false } },
            { type: 'bind', source: path.join(projectDirectory, 'config/application.yml'), target: '/config/application.yml', read_only: true, bind: { create_host_path: false } },
          ],
          healthcheck: { test: ['CMD', 'true'], interval: '10s', timeout: '5s', retries: 30 },
        },
      },
    }));
  } else if (args.includes('--quiet')) {
    if (!effective('DATAVISOOL_IMAGE')) fail('DATAVISOOL_IMAGE is required');
  } else if (args.includes('--services')) stdout('app\n');
  else if (args.includes('--images')) stdout(image + '\n');
} else if (args[0] === 'image' && args[1] === 'inspect') {
  if (!state.imagePresent) fail('No such image');
  if (template.includes('.Os') && template.includes('.Architecture')) stdout(state.imagePlatform || 'linux/amd64');
  else if (template.includes('io.datavisool.mysql.base')) stdout(state.mysqlBase || 'mysql:8.4.11');
  else if (template.includes('io.datavisool.deployment')) stdout('allinone');
  else if (template.includes('.Id')) stdout(state.imageId || 'sha256:allinone-image-id');
  else stdout('{}');
} else if (args[0] === 'load') {
  if (state.loadFailure) fail('failed to load image');
  state.imagePresent = true;
  save();
  stdout('Loaded image: datavisool-web-allinone:test-amd64\n');
} else if (args[0] === 'volume' && args[1] === 'inspect') {
  const name = args.at(-1);
  const volume = volumes[name];
  if (!volume) fail('No such volume: ' + name);
  if (template.includes('.Name')) stdout(name);
  else {
    const label = template.match(/\.Labels\s+["']([^"']+)["']/)?.[1];
    stdout(label ? (volume.labels[label] || '') : JSON.stringify(volume));
  }
} else if (args[0] === 'volume' && args[1] === 'create') {
  if (state.dataCreateFailure) fail('volume create failed');
  const labels = {};
  for (let i = 2; i < args.length - 1; i++) if (args[i] === '--label') {
    const [key, ...rest] = args[++i].split('=');
    labels[key] = rest.join('=');
  }
  const name = args.at(-1);
  if (volumes[name]) fail('volume already exists: ' + name);
  volumes[name] = { labels, dataMarker: '' };
  save();
  stdout(name + '\n');
} else if (args[0] === 'ps') {
  const projectFilter = args.find(value => value.startsWith('label=com.docker.compose.project='))?.split('=').at(-1);
  const serviceFilter = args.find(value => value.startsWith('label=com.docker.compose.service='))?.split('=').at(-1);
  const listed = containers().filter(item => (!projectFilter || labelValue(item, 'com.docker.compose.project') === projectFilter)
    && (!serviceFilter || labelValue(item, 'com.docker.compose.service') === serviceFilter));
  stdout(listed.map(item => item.id).join('\n') + (listed.length ? '\n' : ''));
} else if (args[0] === 'inspect') {
  const id = args.at(-1);
  const container = findContainer(id);
  if (!container) fail('No such object: ' + id);
  const label = template.match(/(?:index\s+\.Config\.Labels\s+|\.Config\.Labels\s+)["'](com\.docker\.compose\.[^"']+)["']/)?.[1];
  if (label) stdout(labelValue(container, label));
  else if (template.includes('.Config.Image')) stdout(container.image);
  else if (template === '{{.Image}}') stdout(container.imageId || 'sha256:' + 'a'.repeat(64));
  else if (template.includes('.State.Status')) stdout(container.status);
  else if (template.includes('.State.Health')) stdout(container.health || 'none');
  else if (template.includes('.State.ExitCode')) stdout(String(container.exitCode ?? 0));
  else if (template.includes('.State.OOMKilled')) stdout(String(container.oomKilled ?? false));
  else if (template.includes('Destination "/data"')) stdout((container.dataType || 'bind') + '|' + container.dataSource + '|' + (container.dataRW ?? true));
  else if (template.includes('Destination "/config/application.yml"')) stdout('bind|' + container.configSource + '|false');
  else if (template.includes('.NetworkSettings.Ports') && template.includes('3306/tcp')) stdout(container.mysqlPort ? container.mysqlBind + ':' + container.mysqlPort + ' ' : '');
  else if (template.includes('.NetworkSettings.Ports')) stdout(container.appBind + ':' + container.appPort + ' ');
  else stdout(JSON.stringify(container));
} else if (args[0] === 'compose' && args.includes('up')) {
  const container = makeContainer();
  if (state.healthFailure) fail('container is unhealthy');
  stdout(container.id + '\n');
} else if (args[0] === 'stop') {
  const id = args.at(-1);
  const container = findContainer(id);
  if (!container) fail('No such container: ' + id);
  if (state.stopFailure) fail('stop request failed');
  container.status = 'exited';
  container.exitCode = state.stopExitCode ?? 0;
  container.oomKilled = state.stopOomKilled ?? false;
  save();
  stdout(id + '\n');
} else if (args[0] === 'logs') {
  stdout('fake all-in-one application log line\n');
} else if (args[0] === 'run') {
  let mount;
  try { mount = parseDockerMountCsv(after('--mount')); } catch (error) { fail(error.message); }
  const container = containers().at(-1);
  if (mount.type !== 'bind' || mount.source !== container?.dataSource || mount.target !== '/data' || mount.readonly !== true) {
    fail('clean-shutdown probe must use the exact readonly bind source and target');
  }
  if (!allText.includes('/data/config/clean-shutdown')) fail('unexpected one-off Docker run');
  if (state.cleanShutdown === false) fail('clean shutdown marker check failed');
  stdout('');
} else {
  fail('unsupported fake Docker invocation: ' + allText);
}
`;
}

function makePackage(t, {
  image = 'datavisool-web-allinone:test-amd64',
  imagePresent = false,
  packagePlatform = 'linux/amd64',
  architecture = 'amd64',
  healthFailure = false,
  withEnv = false,
  endpoint = 'unix:///var/run/docker.sock',
  withCredentials = true,
  rootName = '部署包 with spaces & 中文',
} = {}) {
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-launcher-')));
  const root = path.join(tempRoot, rootName);
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const name of ['deploy_linux.sh', 'deploy_macos.command']) {
    fs.copyFileSync(path.join(LAUNCHER_DIR, name), path.join(root, name));
    fs.chmodSync(path.join(root, name), 0o755);
  }
  const appDir = path.join(root, 'docker-allinone');
  fs.mkdirSync(appDir);
  for (const name of ['launch.sh', 'docker-compose.yml', '.env.example']) {
    fs.copyFileSync(path.join(ALLINONE_DIR, name), path.join(appDir, name));
    if (name === '.env.example' && withCredentials) {
      const values = fs.readFileSync(path.join(appDir, name), 'utf8')
        .replace(/^DB_NAME=.*$/m, 'DB_NAME=launch_db').replace(/^DB_USER=.*$/m, 'DB_USER=launch_user').replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=launch-test-password');
      fs.writeFileSync(path.join(appDir, name), values);
    }
  }
  fs.chmodSync(path.join(appDir, 'launch.sh'), 0o755);
  fs.writeFileSync(path.join(appDir, 'IMAGE'), `${image}\n`);
  fs.writeFileSync(path.join(appDir, 'PLATFORM'), `${packagePlatform}\n`);
  fs.writeFileSync(path.join(appDir, 'VERSION'), 'test\n');
  fs.mkdirSync(path.join(root, 'config'));
  fs.copyFileSync(path.join(ALLINONE_DIR, 'config/application.yml'), path.join(root, 'config/application.yml'));
  fs.writeFileSync(path.join(root, 'image.tar'), 'fake Docker archive');
  if (withEnv) {
    const initialEnv = fs.readFileSync(path.join(appDir, '.env.example'), 'utf8')
      .replace(/^DATAVISOOL_IMAGE=.*$/m, `DATAVISOOL_IMAGE=${image}`);
    fs.writeFileSync(path.join(root, '.env'), initialEnv);
  }

  const fakeBin = path.join(tempRoot, 'fake-bin');
  fs.mkdirSync(fakeBin);
  const dockerPath = path.join(fakeBin, 'docker');
  fs.writeFileSync(dockerPath, fakeDockerSource());
  fs.chmodSync(dockerPath, 0o755);
  const statePath = path.join(tempRoot, 'docker-state.json');
  const recordPath = path.join(tempRoot, 'docker-record.json');
  fs.writeFileSync(path.join(fakeBin, 'mkdir'), `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.FAKE_DOCKER_STATE, 'utf8'));
if (state.dataCreateFailure && args.some(arg => arg.endsWith('/data'))) process.exit(1);
const result = spawnSync('/bin/mkdir', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`);
  fs.chmodSync(path.join(fakeBin, 'mkdir'), 0o755);
  fs.writeFileSync(statePath, JSON.stringify({
    architecture,
    osType: 'linux',
    endpoint,
    imagePresent,
    imagePlatform: packagePlatform,
    healthFailure,
    dataCreateFailure: false,
    stopFailure: false,
    stopExitCode: 0,
    stopOomKilled: false,
    cleanShutdown: true,
    nextContainerId: 'b0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    containers: [],
    volumes: {},
  }));
  fs.writeFileSync(recordPath, '[]');
  const baseEnv = {
    DATAVISOOL_LANG: 'zh-CN',
    PATH: `${path.dirname(process.execPath)}:${fakeBin}:/usr/bin:/bin`,
    FAKE_DOCKER_STATE: statePath,
    FAKE_DOCKER_RECORD: recordPath,
  };
  const invoke = (args = [], extraEnv = {}, entry = 'deploy_linux.sh') => spawnSync('/bin/sh', [path.join(root, entry), ...args], {
    cwd: os.tmpdir(),
    env: { ...process.env, ...baseEnv, ...extraEnv, PATH: baseEnv.PATH },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  const invokePty = (values) => spawnSync('python3', ['-c', DOCKER_PTY_DRIVER, path.join(root, 'deploy_linux.sh')], {
    cwd: os.tmpdir(), env: { ...process.env, ...baseEnv, PTY_DB_NAME: values.database || '', PTY_DB_USER: values.user || '', PTY_DB_PASSWORD: values.password || '' },
    encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024,
  });
  const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const writeState = value => fs.writeFileSync(statePath, JSON.stringify(value));
  const calls = () => JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  const resetCalls = () => fs.writeFileSync(recordPath, '[]');
  return { root, appDir, image, invoke, invokePty, readState, writeState, calls, resetCalls };
}

function successfulStart(f) {
  const result = f.invoke();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

function productionProbeScript(shellPath, packageRoot, envSource) {
  const source = fs.readFileSync(shellPath, 'utf8');
  const dockerStart = source.indexOf('docker_cli() (');
  const dockerEnd = source.indexOf('\n)\nenv_file_has_reserved_docker_key', dockerStart);
  const probeStart = source.indexOf('probe_environment() {');
  const probeEnd = source.indexOf('\nget_value()', probeStart);
  assert.ok(dockerStart >= 0 && dockerEnd > dockerStart && probeStart >= 0 && probeEnd > probeStart,
    'launcher must keep the production Docker and environment probe functions available');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  return [
    `docker_bin=${quote(REAL_DOCKER_BIN)}`,
    `env_bin=${quote(REAL_ENV_BIN)}`,
    `package_root=${quote(packageRoot)}`,
    `env_source=${quote(envSource)}`,
    source.slice(dockerStart, dockerEnd + 2),
    source.slice(probeStart, probeEnd),
    'result=$(probe_environment) || exit 31',
    'printf "%s\\nparent-custom=%s\\nparent-path=%s\\n" "$result" "${CUSTOM_PASSWORD-}" "${PATH-}"',
  ].join('\n');
}

shellTest('real Docker Compose resolves a quoted allinone secret through config JSON without a daemon', {
  skip: !HAS_REAL_COMPOSE,
}, t => {
  const f = makePackage(t, { withEnv: true });
  const secret = `$cash and $pair=a 'single' "double" slash\\ 中文`;
  const envPath = path.join(f.root, '.env');
  const quotedSecret = `'${secret.replaceAll("'", "\\'")}'`;
  const dotenv = fs.readFileSync(envPath, 'utf8').replace(/^DB_PASSWORD=.*$/m,
    `DB_PASSWORD=${quotedSecret}`);
  fs.writeFileSync(envPath, dotenv);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DATAVISOOL_|DB_|APP_|MYSQL_|COMPOSE_)/.test(key)) delete env[key];
  const probeKeys = ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'MYSQL_BIND_ADDRESS', 'MYSQL_PORT',
    'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS', 'TZ'];
  const probeModel = `services:\n  app:\n    image: scratch\n    environment:\n${probeKeys.map(key => `      ${key}: "\${${key}-}"`).join('\n')}\n`;
  const probe = spawnSync('docker', [
    'compose', '--project-directory', f.root, '--env-file', envPath, '-f', '-', 'config', '--format', 'json',
  ], { input: probeModel, encoding: 'utf8', env, timeout: 10000 });
  assert.equal(probe.status, 0, probe.stderr);
  const resolvedProbe = JSON.parse(probe.stdout).services.app.environment;
  assert.equal(resolvedProbe.DB_PASSWORD, secret.split('$').join('$$'));
  assert.equal(resolvedProbe.DB_PASSWORD.split('$$').join('$'), secret);
});

shellTest('allinone startup filters host values named by .env through temporary save and later Compose calls', t => {
  const f = makePackage(t, { withEnv: true });
  const expectedPassword = 'dotenv-custom-password';
  const envPath = path.join(f.root, '.env');
  const dotenv = fs.readFileSync(envPath, 'utf8')
    .replace(/^DATAVISOOL_PROJECT_NAME=.*$/m, 'DATAVISOOL_PROJECT_NAME=')
    .replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=${CUSTOM_PASSWORD}')
    .replace(/\n$/, '\nPATH=/missing-from-dotenv\n');
  fs.writeFileSync(envPath, `\uFEFF  export CUSTOM_PASSWORD=${expectedPassword}\n${dotenv}BARE_PARENT_VALUE\n`);

  const result = f.invoke([], {
    CUSTOM_PASSWORD: 'host-custom-password',
    DB_PASSWORD: 'host-database-password',
    BARE_PARENT_VALUE: 'host-bare-value',
    FAKE_EXPECTED_DB_PASSWORD: expectedPassword,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(fs.readFileSync(envPath, 'utf8'), /^DATAVISOOL_PROJECT_NAME="?datavisool-b-[0-9]+"?$/m);
  const calls = f.calls();
  const probes = calls.filter(call => call.stdin && call.args.includes('config'));
  assert.ok(probes.length >= 2, 'the initial and temporary-file probes should both run');
  assert.ok(probes.every(call => call.project === 'datavisool-web-allinone-probe'));
  const configs = calls.filter(call => call.args[0] === 'compose' && call.args.includes('config'));
  assert.ok(configs.length > 0);
  assert.ok(configs.every(call => !call.hasCustomPasswordEnv && !call.hasPathEnv && !call.hasBareOverrideEnv),
    `Docker children must not inherit .env keys: ${JSON.stringify(configs.map(call => [call.hasCustomPasswordEnv, call.hasPathEnv, call.hasBareOverrideEnv, call.envFile]))}`);
  assert.ok(configs.every(call => call.dbPasswordMatchesFixture),
    'Compose must resolve DB_PASSWORD from .env even when the parent exports CUSTOM_PASSWORD');
  assert.ok(configs.some(call => call.envFile === envPath), 'the saved .env must be selected for later Compose calls');
});

shellTest('allinone startup rejects Docker connection or home variables in .env before invoking Docker', t => {
  const f = makePackage(t, { withEnv: true });
  fs.appendFileSync(path.join(f.root, '.env'), 'DOCKER_CONTEXT=untrusted-context\n');
  const result = f.invoke([], { DOCKER_CONTEXT: 'parent-context' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /不能声明 DOCKER_\*/);
  assert.equal(f.calls().length, 0, 'rejecting the setting must happen before any Docker command');
});

shellTest('Compose 2.20 JSON probing preserves quoted, escaped, Unicode and empty values', t => {
  const f = makePackage(t, { withEnv: true });
  const secret = `$cash $$pair=a=b 'single' "double" slash\\ 中文`;
  const user = 'operator_user';
  const quote = value => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').split('$').join('$$')}"`;
  const envPath = path.join(f.root, '.env');
  const dotenv = fs.readFileSync(envPath, 'utf8')
    .replace(/^DB_USER=.*$/m, `DB_USER=${quote(user)}`)
    .replace(/^DB_PASSWORD=.*$/m, () => `DB_PASSWORD=${quote(secret)}`)
    .replace(/^JAVA_TOOL_OPTIONS=.*$/m, 'JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=50.0\t-Duser.timezone=UTC')
    .replace(/^TZ=.*$/m, 'TZ=');
  fs.writeFileSync(envPath, dotenv);

  const result = f.invoke();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const probes = f.calls().filter(call => call.args.includes('config') && call.args.includes('-f') && call.args.includes('-'));
  assert.ok(probes.length >= 2, 'initial and post-save environment probes should use the JSON model');
  for (const probe of probes) {
    assert.ok(probe.args.includes('--format') && probe.args[probe.args.indexOf('--format') + 1] === 'json');
    assert.equal(probe.args.includes('--environment'), false);
    for (const key of ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'MYSQL_BIND_ADDRESS', 'MYSQL_PORT',
      'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS', 'TZ']) assert.ok(probe.stdin.includes(`${key}:`), key);
  }
  const persisted = fs.readFileSync(envPath, 'utf8');
  assert.ok(persisted.includes(`DB_USER=${quote(user)}`));
  assert.equal(f.invoke(['--check']).status, 0, 'the saved secret must still resolve on a later read');
  assert.ok(persisted.includes(`JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=50.0\t-Duser.timezone=UTC`));
  assert.match(persisted, /^TZ=$/m);
});

shellTest('the production allinone probe handles a Chinese-only directory, dotenv aliases, special values, and PATH safely', {
  skip: !HAS_REAL_COMPOSE,
}, t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-compose-allinone-probe-'));
  const packageRoot = path.join(tempRoot, '仅中文目录');
  fs.mkdirSync(packageRoot);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const marker = path.join(tempRoot, 'compose-probe-must-not-execute');
  const secret = `$(touch ${marker}) $cash and $pair=a 'single' "double" slash\\ 中文`;
  const quoted = `'${secret.replaceAll("'", "\\'")}'`;
  const envSource = path.join(packageRoot, '.env');
  fs.writeFileSync(envSource, `\uFEFF  export CUSTOM_PASSWORD=${quoted}\nDB_PASSWORD=\${CUSTOM_PASSWORD}\nPATH=/missing-from-dotenv\n`);
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (/^(DATAVISOOL_|DB_|APP_|MYSQL_|COMPOSE_)/.test(key)) delete environment[key];
  environment.CUSTOM_PASSWORD = 'host-custom-password';
  environment.DB_PASSWORD = 'host-database-password';
  const script = productionProbeScript(path.join(ALLINONE_DIR, 'launch.sh'), packageRoot, envSource);
  const result = spawnSync('/bin/sh', ['-c', script], {
    cwd: os.tmpdir(), env: environment, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(result.stdout.includes(`DB_PASSWORD=${secret}\n`), 'the real Compose probe should return the file value, not the host override');
  assert.ok(result.stdout.includes('parent-custom=host-custom-password'));
  assert.equal(fs.existsSync(marker), false, 'dotenv content must never execute as shell code');
});

shellTest('the root Linux launcher dispatches Docker allinone startup, imports the image, creates the persistent host data directory, and stores identity', t => {
  const f = makePackage(t);
  const result = successfulStart(f);
  const state = f.readState();
  const project = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim();
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  assert.match(result.stdout, /8080/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /数据库密码|DB_USER|DB_PASSWORD|请输入/);
  assert.match(project, /^datavisool-b-[a-f0-9]+$/);
  assert.notEqual(project, 'datavisool-web-allinone');
  assert.equal(fs.readFileSync(path.join(f.root, 'run/deployment.root'), 'utf8').trim(), fs.realpathSync(f.root));
  assert.equal(fs.readFileSync(path.join(f.root, 'run/docker.endpoint'), 'utf8').trim(), 'unix:///var/run/docker.sock');
  assert.equal(fs.readFileSync(path.join(f.root, 'run/mysql.base'), 'utf8').trim(), 'mysql:8.4.11');
  assert.equal(fs.readFileSync(path.join(f.root, '.datavisool-deployment'), 'utf8'), 'docker-allinone-launcher-v1\n');
  assert.equal(fs.readFileSync(path.join(f.root, 'run/container.id'), 'utf8').trim(), state.containers[0].id);
  assert.match(fs.readFileSync(path.join(f.root, '.env'), 'utf8'), new RegExp(`^DATAVISOOL_PROJECT_NAME="?${project}"?$`, 'm'));
  assert.equal(fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8'), `${path.join(f.root, 'data')}\n`);
  assert.equal(state.imagePresent, true);
  assert.equal(state.containers.length, 1);
  assert.equal(fs.existsSync(path.join(f.root, 'run/data.pending')), false);
  assert.ok(f.calls().some(call => call.args[0] === 'load' && call.args.includes(path.join(f.root, 'image.tar'))));
  const up = f.calls().find(call => call.args[0] === 'compose' && call.args.includes('up'));
  assert.equal(up.args[up.args.indexOf('--wait-timeout') + 1], '600');
});

shellTest('--check validates Docker allinone without creating .env, run state, volumes, or a container', t => {
  const f = makePackage(t, { withEnv: true });
  const envBefore = fs.readFileSync(path.join(f.root, '.env'));
  const before = fs.readFileSync(path.join(f.root, 'config/application.yml'));
  const result = f.invoke(['--check']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /检查|校验/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), envBefore);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'data')), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'config/application.yml')), before);
  assert.deepEqual(f.readState().volumes, {});
  assert.equal(f.readState().containers.length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')
    || (call.args[0] === 'volume' && call.args[1] === 'create')), false);
});

shellTest('--check reports missing first-run .env without creating any package state', t => {
  const f = makePackage(t);
  const result = f.invoke(['--check']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /缺少 \.env|首次初始化/);
  assert.equal(fs.existsSync(path.join(f.root, '.env')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.deepEqual(f.readState().volumes, {});
  assert.equal(f.readState().containers.length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')
    || (call.args[0] === 'volume' && call.args[1] === 'create')), false);
});

shellTest('startup preserves package environment settings and ignores parent process overrides', t => {
  const f = makePackage(t);
  const template = fs.readFileSync(path.join(f.appDir, '.env.example'), 'utf8')
    .replace('APP_PORT=8080', 'APP_PORT=18090')
    .replace('JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=50.0 -Duser.timezone=Asia/Shanghai', 'JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=61.0 -Duser.timezone=UTC')
    .replace('TZ=Asia/Shanghai', 'TZ=UTC');
  fs.writeFileSync(path.join(f.appDir, '.env.example'), template);
  const result = f.invoke([], {
    DATAVISOOL_IMAGE: 'wrong-parent-image',
    DATAVISOOL_PROJECT_NAME: 'wrong-parent-project',
    APP_PORT: '18001',
    MYSQL_BIND_ADDRESS: '0.0.0.0', MYSQL_PORT: '19999',
    COMPOSE_PROJECT_NAME: 'wrong-compose-project',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const envText = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
  assert.match(envText, /^APP_PORT=18090$/m);
  assert.match(envText, /^JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=61\.0 -Duser\.timezone=UTC$/m);
  assert.match(envText, /^TZ=UTC$/m);
  const dockerCalls = f.calls().filter(call => call.args[0] !== 'context');
  assert.ok(dockerCalls.length > 0);
  for (const call of dockerCalls) {
    assert.equal(call.managedEnv.DATAVISOOL_IMAGE, undefined);
    assert.equal(call.managedEnv.DATAVISOOL_PROJECT_NAME, undefined);
    assert.equal(call.managedEnv.APP_PORT, undefined);
    assert.equal(call.managedEnv.MYSQL_BIND_ADDRESS, undefined); assert.equal(call.managedEnv.MYSQL_PORT, undefined);
    assert.equal(call.managedEnv.COMPOSE_PROJECT_NAME, undefined);
  }
  const project = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim();
  assert.notEqual(project, 'wrong-parent-project');
  assert.equal(f.readState().containers[0].image, f.image);
  assert.ok(f.calls().some(call => call.args.includes('--wait-timeout') && call.args.includes('600')));
});

shellTest('a second start reuses the same host data directory and does not create another container', t => {
  const f = makePackage(t);
  successfulStart(f);
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  const firstState = f.readState();
  fs.writeFileSync(path.join(dataDir, 'test-marker'), 'database and resource data');
  f.writeState(firstState);
  f.resetCalls();
  successfulStart(f);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'database and resource data');
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);
});

shellTest('a missing .env restores the recorded project after stop without resetting host data, while explicit changes and --check stay safe', t => {
  const f = makePackage(t);
  successfulStart(f);
  const envPath = path.join(f.root, '.env');
  const project = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim();
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  let state = f.readState();
  const containerId = state.containers[0].id;
  fs.writeFileSync(path.join(dataDir, 'test-marker'), 'credential-fingerprint:kept; resource:license.zip');
  f.writeState(state);

  const stopped = f.invoke(['--stop']);
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  assert.equal(f.readState().containers[0].status, 'exited');
  fs.rmSync(envPath);

  const identityFiles = ['.datavisool-deployment', 'run/project.name', 'run/deployment.root', 'run/docker.endpoint',
    'run/data.path', 'run/mysql.base', 'run/container.id'];
  const identityBeforeCheck = identityFiles.map(file => fs.readFileSync(path.join(f.root, file)));
  f.resetCalls();
  const check = f.invoke(['--check']);
  assert.notEqual(check.status, 0);
  assert.match(`${check.stdout}\n${check.stderr}`, /缺少 \.env|首次初始化/);
  assert.equal(fs.existsSync(envPath), false);
  identityFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(path.join(f.root, file)), identityBeforeCheck[index]));
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'credential-fingerprint:kept; resource:license.zip');
  assert.equal(f.readState().containers[0].id, containerId);
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);
  assert.equal(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')), false);

  f.resetCalls();
  const recovered = successfulStart(f);
  state = f.readState();
  assert.equal(fs.readFileSync(envPath, 'utf8').match(/^DATAVISOOL_PROJECT_NAME=(.*)$/m)?.[1].replace(/^"|"$/g, ''), project);
  assert.equal(state.containers.length, 1);
  assert.equal(state.containers[0].id, containerId);
  assert.equal(state.containers[0].labels['com.docker.compose.project'], project);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'credential-fingerprint:kept; resource:license.zip');
  assert.equal(Object.keys(state.volumes).length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);
  assert.ok(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up') && call.project === project));
  assert.match(recovered.stdout, /8080/);

  const stoppedAgain = f.invoke(['--stop']);
  assert.equal(stoppedAgain.status, 0, `${stoppedAgain.stdout}\n${stoppedAgain.stderr}`);
  const changedEnv = fs.readFileSync(envPath, 'utf8').replace(/^DATAVISOOL_PROJECT_NAME=.*$/m, 'DATAVISOOL_PROJECT_NAME=' + project + '-other');
  fs.writeFileSync(envPath, changedEnv);
  f.resetCalls();
  const rejected = f.invoke();
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stdout}\n${rejected.stderr}`, /DATAVISOOL_PROJECT_NAME|项目名|项目名称/);
  assert.equal(fs.readFileSync(envPath, 'utf8'), changedEnv);
  assert.equal(f.readState().containers[0].id, containerId);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'credential-fingerprint:kept; resource:license.zip');
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);
  assert.equal(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')), false);
});

shellTest('recreating a removed container keeps its host data and refuses a missing recorded data directory', t => {
  const f = makePackage(t);
  successfulStart(f);
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  let state = f.readState();
  fs.writeFileSync(path.join(dataDir, 'test-marker'), 'database and resource data');
  state.containers = [];
  f.writeState(state);
  successfulStart(f);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'database and resource data');
  state = f.readState();
  state.containers = [];
  fs.rmSync(dataDir, { recursive: true });
  f.writeState(state);
  f.resetCalls();
  const missing = f.invoke();
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /卷|volume|丢失|不存在/);
  assert.equal(fs.existsSync(dataDir), false);
  assert.equal(f.readState().containers.length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);
});

shellTest('--check fails when a previously recorded host data directory is missing and never recreates it', t => {
  const f = makePackage(t);
  successfulStart(f);
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  const envBefore = fs.readFileSync(path.join(f.root, '.env'));
  const identityFiles = ['.datavisool-deployment', 'run/project.name', 'run/deployment.root', 'run/docker.endpoint',
    'run/data.path', 'run/mysql.base', 'run/container.id'];
  const before = new Map(identityFiles.map(name => [name, fs.readFileSync(path.join(f.root, name))]));
  const state = f.readState();
  fs.rmSync(dataDir, { recursive: true });
  f.writeState(state);
  f.resetCalls();

  const result = f.invoke(['--check']);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /数据目录丢失|已记录的宿主机数据目录丢失/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), envBefore);
  for (const name of identityFiles) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), before.get(name));
  assert.equal(fs.existsSync(path.join(f.root, 'run/data.pending')), false);
  assert.equal(fs.existsSync(dataDir), false);
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);
  assert.equal(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')), false);
});

shellTest('a failed first data directory creation leaves a pending record that can be safely resumed', t => {
  const f = makePackage(t);
  const state = f.readState();
  state.dataCreateFailure = true;
  f.writeState(state);
  const first = f.invoke();
  assert.notEqual(first.status, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'run/data.pending')), true);
  assert.equal(f.readState().containers.length, 0);
  const retryState = f.readState();
  retryState.dataCreateFailure = false;
  f.writeState(retryState);
  successfulStart(f);
  assert.equal(fs.existsSync(path.join(f.root, 'run/data.pending')), false);
  assert.equal(Object.keys(f.readState().volumes).length, 0);
  assert.equal(f.readState().containers.length, 1);
});

shellTest('a valid six-line first-creation intent accepts a socket alias while --check stays read-only', async t => {
  const { sockets, aliases } = await makeUnixSocketAliases(t);
  const f = makePackage(t, { endpoint: sockets[0] });
  const state = f.readState();
  state.dataCreateFailure = true;
  f.writeState(state);
  const first = f.invoke();
  assert.notEqual(first.status, 0);

  const runDir = path.join(f.root, 'run');
  const project = fs.readFileSync(path.join(runDir, 'project.name'), 'utf8').trim();
  const dataDir = fs.readFileSync(path.join(runDir, 'data.path'), 'utf8').trim();
  const pendingPath = path.join(runDir, 'data.pending');
  const intent = fs.readFileSync(pendingPath, 'utf8');
  assert.deepEqual(intent.trimEnd().split('\n'), [
    'docker-allinone-launcher-v1', project, fs.realpathSync(f.root), sockets[0], dataDir, 'mysql:8.4.11',
  ]);
  assert.equal(fs.existsSync(path.join(f.root, '.datavisool-deployment')), true);

  fs.unlinkSync(path.join(f.root, '.datavisool-deployment'));
  fs.unlinkSync(path.join(runDir, 'mysql.base'));
  const envBefore = fs.readFileSync(path.join(f.root, '.env'));
  const projectBefore = fs.readFileSync(path.join(runDir, 'project.name'));
  const pendingBefore = fs.readFileSync(pendingPath);
  const changedEndpointState = f.readState();
  changedEndpointState.endpoint = aliases[0];
  f.writeState(changedEndpointState);
  f.resetCalls();
  const check = f.invoke(['--check']);
  assert.notEqual(check.status, 0);
  assert.match(`${check.stdout}\n${check.stderr}`, /恢复|中断|pending|intent/i);
  assert.doesNotMatch(`${check.stdout}\n${check.stderr}`, /Docker 引擎已改变|Docker 地址/);
  assert.equal(fs.existsSync(path.join(f.root, '.datavisool-deployment')), false);
  assert.equal(fs.existsSync(path.join(runDir, 'mysql.base')), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), envBefore);
  assert.deepEqual(fs.readFileSync(path.join(runDir, 'project.name')), projectBefore);
  assert.deepEqual(fs.readFileSync(pendingPath), pendingBefore);
  assert.equal(f.calls().some(call => call.args[0] === 'volume' && call.args[1] === 'create'), false);

  const retryState = f.readState();
  retryState.dataCreateFailure = false;
  f.writeState(retryState);
  successfulStart(f);
  assert.equal(fs.readFileSync(path.join(f.root, '.datavisool-deployment'), 'utf8'), 'docker-allinone-launcher-v1\n');
  assert.equal(fs.readFileSync(path.join(runDir, 'project.name'), 'utf8'), projectBefore.toString());
  assert.equal(fs.readFileSync(path.join(runDir, 'mysql.base'), 'utf8'), 'mysql:8.4.11\n');
  assert.equal(fs.readFileSync(path.join(runDir, 'docker.endpoint'), 'utf8').trim(), aliases[0]);
  assert.equal(fs.existsSync(pendingPath), false);
  assert.equal(f.readState().containers.length, 1);
});

shellTest('status, stop, logs, and restart work without database settings; stop uses the Docker allinone grace period', t => {
  const f = makePackage(t, { rootName: '部署包, "带引号" with spaces & 中文' });
  successfulStart(f);
  const envPath = path.join(f.root, '.env');
  const envBefore = fs.readFileSync(envPath, 'utf8');
  fs.writeFileSync(envPath, envBefore.replace(/^DB_.*\n/gm, ''));
  f.resetCalls();
  const status = f.invoke(['--status']);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(`${status.stdout}\n${status.stderr}`, /running|healthy|运行|健康/i);
  assert.match(status.stdout, /宿主机数据目录/);
  const logs = f.invoke(['--logs']);
  assert.equal(logs.status, 0, `${logs.stdout}\n${logs.stderr}`);
  assert.match(`${logs.stdout}\n${logs.stderr}`, /fake all-in-one application log line/);
  const stopped = f.invoke(['--stop']);
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  assert.ok(f.calls().some(call => call.args[0] === 'stop' && call.args.includes('120')));
  const shutdownCheck = f.calls().find(call => call.args[0] === 'run');
  assert.ok(shutdownCheck, 'stopping a running Docker allinone container must verify its clean-shutdown marker');
  for (const flag of ['--rm', '--pull', 'never', '--network', 'none', '--read-only', '--mount', '--entrypoint', '/bin/sh', '-c']) {
    assert.ok(shutdownCheck.args.includes(flag), `clean-shutdown verifier must include ${flag}`);
  }
  const shutdownMount = parseDockerMountCsv(shutdownCheck.args[shutdownCheck.args.indexOf('--mount') + 1]);
  assert.deepEqual(shutdownMount, {
    type: 'bind', source: fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim(), target: '/data', readonly: true,
  });
  assert.ok(shutdownCheck.args.includes('sha256:' + 'a'.repeat(64)));
  assert.ok(shutdownCheck.args.at(-1).includes('/data/config/clean-shutdown'));
  fs.writeFileSync(envPath, envBefore);
  const restarted = f.invoke(['--restart']);
  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(Object.keys(f.readState().volumes).length, 0);
});

shellTest('restart does not create a new container after a failed, nonzero, OOM, or unclean stop', t => {
  for (const [field, value] of [
    ['stopFailure', true], ['stopExitCode', 137], ['stopOomKilled', true], ['cleanShutdown', false],
  ]) {
    const f = makePackage(t, field === 'cleanShutdown' ? { rootName: '部署包, "带引号" with spaces & 中文' } : {});
    successfulStart(f);
    const state = f.readState();
    state[field] = value;
    f.writeState(state);
    f.resetCalls();
    const result = f.invoke(['--restart']);
    assert.notEqual(result.status, 0, `${field}: ${result.stdout}\n${result.stderr}`);
    assert.equal(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')), false);
    if (field === 'cleanShutdown') {
      const shutdownCheck = f.calls().find(call => call.args[0] === 'run');
      assert.ok(shutdownCheck, 'unclean shutdown must still run the marker check');
      const shutdownMount = parseDockerMountCsv(shutdownCheck.args[shutdownCheck.args.indexOf('--mount') + 1]);
      assert.deepEqual(shutdownMount, {
        type: 'bind', source: fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim(), target: '/data', readonly: true,
      });
      assert.equal(f.readState().containers.length, 1, 'unsafe shutdown must retain the stopped container');
      assert.equal(f.readState().containers[0].status, 'exited');
      assert.equal(fs.existsSync(shutdownMount.source), true, 'unsafe shutdown must retain host data');
    }
  }
});

shellTest('health-check failure retains the Docker allinone container and host data directory for logs', t => {
  const f = makePackage(t, { healthFailure: true });
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.readState().containers[0].status, 'running');
  assert.equal(f.readState().containers[0].health, 'unhealthy');
  assert.equal(Object.keys(f.readState().volumes).length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'rm' || call.args.includes('down')), false);
  const logs = f.invoke(['--logs']);
  assert.equal(logs.status, 0, `${logs.stdout}\n${logs.stderr}`);
});

shellTest('wrong-directory containers are never stopped', t => {
  const f = makePackage(t);
  successfulStart(f);
  const state = f.readState();
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  state.containers[0].labels['com.docker.compose.project.working_dir'] = '/other/deployment';
  f.writeState(state);
  f.resetCalls();
  const result = f.invoke(['--stop']);
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'stop'), false);
  assert.equal(f.readState().containers[0].status, 'running');
});

shellTest('a recorded container with an unexpected mounted data directory is never stopped', t => {
  const f = makePackage(t);
  successfulStart(f);
  const state = f.readState();
  state.containers[0].dataSource = '/other/data';
  f.writeState(state);
  f.resetCalls();
  const result = f.invoke(['--stop']);
  assert.notEqual(result.status, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'stop'), false);
});

shellTest('first deployment uses host data even when a same-name Docker volume exists', t => {
  for (const existingData of [false, true]) {
    const f = makePackage(t, { withEnv: existingData });
    let project;
    if (existingData) {
      project = 'datavisool-fresh-instance';
      const envPath = path.join(f.root, '.env');
      fs.writeFileSync(envPath, fs.readFileSync(envPath, 'utf8')
        .replace(/^DATAVISOOL_PROJECT_NAME=.*$/m, `DATAVISOOL_PROJECT_NAME=${project}`));
    } else {
      const checksum = spawnSync('cksum', [], { input: fs.realpathSync(f.root), encoding: 'utf8' });
      assert.equal(checksum.status, 0, checksum.stderr);
      project = `datavisool-b-${checksum.stdout.split(/\s+/)[0]}`;
    }
    const dataDir = path.join(f.root, 'data');
    if (existingData) {
      fs.mkdirSync(dataDir);
      fs.writeFileSync(path.join(dataDir, 'keep-data'), 'existing host data');
    }
    const state = f.readState();
    state.volumes[`${project}_data`] = { labels: {}, dataMarker: 'untouched Docker volume' };
    f.writeState(state);

    const result = f.invoke([], {}, 'deploy_macos.command');
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim(), project);
    assert.equal(fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim(), dataDir);
    assert.ok(fs.statSync(dataDir).isDirectory());
    assert.equal(f.readState().containers[0].dataSource, dataDir);
    assert.deepEqual(f.readState().volumes, state.volumes);
    assert.equal(f.calls().some(call => call.args[0] === 'volume'), false);
    if (existingData) assert.equal(fs.readFileSync(path.join(dataDir, 'keep-data'), 'utf8'), 'existing host data');
  }
});

shellTest('unpublished volume records do not block first host data deployment', t => {
  for (const legacyFile of ['volume.name', 'volume.pending']) {
    const f = makePackage(t, { withEnv: true });
    fs.mkdirSync(path.join(f.root, 'run'));
    const recordPath = path.join(f.root, 'run', legacyFile);
    fs.writeFileSync(recordPath, 'old-project_data\n');
    successfulStart(f);
    assert.equal(f.readState().containers[0].dataSource, path.join(f.root, 'data'));
    assert.equal(fs.readFileSync(recordPath, 'utf8'), 'old-project_data\n');
    assert.equal(f.calls().some(call => call.args[0] === 'volume'), false);
  }
});

shellTest('a recorded container with a non-bind data mount is rejected before startup or stop', t => {
  const f = makePackage(t);
  successfulStart(f);
  const state = f.readState();
  state.containers[0].dataType = 'volume';
  f.writeState(state);
  for (const mode of [[], ['--check'], ['--restart']]) {
    f.resetCalls();
    const result = f.invoke(mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /实际挂载.*不一致/);
    assert.equal(f.calls().some(call => call.args.includes('up') || call.args[0] === 'stop'), false);
  }
});

shellTest('a symlink data directory is rejected before deployment state is created', t => {
  const f = makePackage(t, { withEnv: true });
  const unrelated = path.join(path.dirname(f.root), 'unrelated-data');
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, 'marker'), 'keep');
  fs.symlinkSync(unrelated, path.join(f.root, 'data'));
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /符号链接/);
  assert.equal(fs.readFileSync(path.join(unrelated, 'marker'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(f.root, 'run/data.path')), false);
  assert.equal(f.calls().some(call => call.args.includes('up')), false);
});

shellTest('moving stopped host data into a fresh package preserves files and creates a new deployment identity', t => {
  const original = makePackage(t);
  successfulStart(original);
  const originalData = path.join(original.root, 'data');
  fs.writeFileSync(path.join(originalData, 'marker'), 'database, credentials and resources');
  const stopped = original.invoke(['--stop']);
  assert.equal(stopped.status, 0, stopped.stderr);
  const moved = makePackage(t);
  fs.cpSync(originalData, path.join(moved.root, 'data'), { recursive: true });
  successfulStart(moved);
  assert.equal(fs.readFileSync(path.join(moved.root, 'data/marker'), 'utf8'), 'database, credentials and resources');
  assert.equal(fs.readFileSync(path.join(moved.root, 'run/data.path'), 'utf8').trim(), path.join(moved.root, 'data'));
  assert.notEqual(fs.readFileSync(path.join(moved.root, 'run/project.name'), 'utf8'),
    fs.readFileSync(path.join(original.root, 'run/project.name'), 'utf8'));
});

shellTest('legacy Node marker, upgrade, wrong architecture, and remote Docker context are rejected', t => {
  const legacy = makePackage(t);
  fs.writeFileSync(path.join(legacy.root, '.datavisool-deployment'), 'docker-allinone\n');
  const legacyResult = legacy.invoke();
  assert.notEqual(legacyResult.status, 0);
  assert.equal(fs.existsSync(path.join(legacy.root, '.env')), false);
  assert.equal(fs.existsSync(path.join(legacy.root, 'run')), false);

  const upgrade = makePackage(t);
  const upgradeResult = upgrade.invoke(['--upgrade']);
  assert.notEqual(upgradeResult.status, 0);
  assert.match(`${upgradeResult.stdout}\n${upgradeResult.stderr}`, /不支持|参数|upgrade/);
  assert.equal(upgrade.readState().containers.length, 0);

  const architecture = makePackage(t, { architecture: 'arm64' });
  const architectureResult = architecture.invoke(['--check']);
  assert.notEqual(architectureResult.status, 0);
  assert.match(`${architectureResult.stdout}\n${architectureResult.stderr}`, /架构|amd64|arm64/);
  assert.equal(architecture.readState().volumes ? Object.keys(architecture.readState().volumes).length : 0, 0);

  const remote = makePackage(t);
  const remoteState = remote.readState();
  remoteState.endpoint = 'tcp://docker.example.test:2376';
  remote.writeState(remoteState);
  const remoteResult = remote.invoke(['--check']);
  assert.notEqual(remoteResult.status, 0);
  assert.match(`${remoteResult.stdout}\n${remoteResult.stderr}`, /本机|远程|context|上下文/i);
});

shellTest('a symlink alias of the recorded local Docker socket keeps Docker allinone project and data on check, status, and restart', async t => {
  const { sockets, aliases } = await makeUnixSocketAliases(t);
  const f = makePackage(t, { endpoint: sockets[0] });
  successfulStart(f);

  const project = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim();
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  const containerId = f.readState().containers[0].id;
  let state = f.readState();
  fs.writeFileSync(path.join(dataDir, 'test-marker'), 'credential-fingerprint:kept; resource:license.zip');
  state.endpoint = aliases[0];
  f.writeState(state);

  const identityFiles = ['.datavisool-deployment', 'run/project.name', 'run/deployment.root', 'run/docker.endpoint',
    'run/data.path', 'run/mysql.base', 'run/container.id'];
  const identityBeforeReadOnlyActions = identityFiles.map(file => fs.readFileSync(path.join(f.root, file)));
  const envBeforeReadOnlyActions = fs.readFileSync(path.join(f.root, '.env'));

  f.resetCalls();
  const check = f.invoke(['--check']);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  const status = f.invoke(['--status']);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.ok(status.stdout.includes(dataDir));
  identityFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(path.join(f.root, file)), identityBeforeReadOnlyActions[index]));
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), envBeforeReadOnlyActions);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'credential-fingerprint:kept; resource:license.zip');
  assert.equal(f.calls().some(call => call.args[0] === 'load'
    || (call.args[0] === 'compose' && call.args.includes('up'))
    || call.args[0] === 'volume' && call.args[1] === 'create'
    || call.args[0] === 'stop'), false);

  f.resetCalls();
  const restarted = f.invoke(['--restart']);
  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  state = f.readState();
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim(), project);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim(), dataDir);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/docker.endpoint'), 'utf8').trim(), sockets[0]);
  assert.equal(state.containers.length, 1);
  assert.equal(state.containers[0].id, containerId);
  assert.equal(state.containers[0].labels['com.docker.compose.project'], project);
  assert.equal(Object.keys(state.volumes).length, 0);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'credential-fingerprint:kept; resource:license.zip');
});

shellTest('a different local Docker socket is rejected with both endpoints and without changing Docker allinone runtime state', async t => {
  const { sockets } = await makeUnixSocketAliases(t);
  const f = makePackage(t, { endpoint: sockets[0] });
  successfulStart(f);
  const dataDir = fs.readFileSync(path.join(f.root, 'run/data.path'), 'utf8').trim();
  const project = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim();
  const containerId = f.readState().containers[0].id;
  let state = f.readState();
  fs.writeFileSync(path.join(dataDir, 'test-marker'), 'credential-fingerprint:kept; resource:license.zip');
  state.endpoint = sockets[1];
  f.writeState(state);

  const identityFiles = ['.datavisool-deployment', 'run/project.name', 'run/deployment.root', 'run/docker.endpoint',
    'run/data.path', 'run/mysql.base', 'run/container.id'];
  const identityBefore = identityFiles.map(file => fs.readFileSync(path.join(f.root, file)));
  const envBefore = fs.readFileSync(path.join(f.root, '.env'));
  const dockerStateBefore = f.readState();
  for (const mode of ['--check', '--status', '--restart', '--stop']) {
    f.resetCalls();
    const result = f.invoke([mode]);
    assert.notEqual(result.status, 0, `${mode} unexpectedly accepted another Unix socket`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.ok(output.includes(sockets[0]), `${mode} error must include original endpoint: ${output}`);
    assert.ok(output.includes(sockets[1]), `${mode} error must include current endpoint: ${output}`);
    assert.equal(f.calls().some(call => call.args[0] === 'load'
      || call.args[0] === 'stop'
      || call.args[0] === 'volume'
      || (call.args[0] === 'compose' && call.args.includes('up'))), false, `${mode} performed a runtime mutation`);
    assert.deepEqual(f.readState(), dockerStateBefore);
    identityFiles.forEach((file, index) => assert.deepEqual(fs.readFileSync(path.join(f.root, file)), identityBefore[index]));
    assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), envBefore);
  }
  state = f.readState();
  assert.equal(state.containers.length, 1);
  assert.equal(state.containers[0].id, containerId);
  assert.equal(state.containers[0].labels['com.docker.compose.project'], project);
  assert.equal(fs.readFileSync(path.join(dataDir, 'test-marker'), 'utf8'), 'credential-fingerprint:kept; resource:license.zip');
  assert.equal(Object.keys(state.volumes).length, 0);
});


shellTest('Docker allinone release template leaves all three database fields empty and check never fills them', t => {
  const template = fs.readFileSync(path.join(ALLINONE_DIR, '.env.example'), 'utf8');
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) assert.match(template, new RegExp(`^${key}=$`, 'm'));
  const f = makePackage(t, { withEnv: true, withCredentials: false });
  const before = fs.readFileSync(path.join(f.root, '.env'));
  const result = f.invoke(['--check']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DB_NAME|必要数据库配置/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), before);
  assert.equal(fs.existsSync(path.join(f.root, 'data')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.equal(f.calls().some(call => call.args.includes('up')), false);
});

shellTest('legacy DB_NAME fallback is rejected regardless of supplied database settings', t => {
  for (const withCredentials of [true, false]) {
    const f = makePackage(t, { withEnv: true, withCredentials });
    const config = path.join(f.root, 'config/application.yml');
    fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replace('${DB_NAME}', '${DB_NAME:lcp_server}'));
    const result = f.invoke(['--check']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /数据库地址/);
    assert.equal(fs.existsSync(path.join(f.root, 'data')), false);
  }
});

shellTest('Docker allinone first start prompts for database, user and a hidden literal password and preserves them later', { skip: !HAS_PYTHON3 }, t => {
  const f = makePackage(t, { withCredentials: false });
  const marker = path.join(path.dirname(f.root), 'must-not-execute');
  const password = `$(touch ${marker}) $cash # spaces 'single' "double" trailing\\`;
  const result = f.invokePty({ database: 'user_selected_db', user: 'user_selected', password });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(!result.stdout.includes(password), 'password must not be echoed');
  assert.equal(fs.existsSync(marker), false);
  const text = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
  assert.match(text, /^DB_NAME="user_selected_db"$/m);
  assert.match(text, /^DB_USER="user_selected"$/m);
  const escaped = password.replaceAll('\\', '\\\\').replaceAll('"', '\\"').split('$').join('$$');
  assert.ok(text.includes(`DB_PASSWORD="${escaped}"`));
  successfulStart(f);
  assert.equal(fs.readFileSync(path.join(f.root, '.env'), 'utf8'), text);
});

shellTest('cancelling Docker allinone first database entry leaves configuration and database untouched', { skip: !HAS_PYTHON3 }, t => {
  const f = makePackage(t, { withEnv: true, withCredentials: false });
  const before = fs.readFileSync(path.join(f.root, '.env'));
  const result = f.invokePty({});
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /取消/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), before);
  assert.equal(fs.existsSync(path.join(f.root, 'data')), false);
  assert.equal(f.readState().containers.length, 0);
});


shellTest('Docker allinone publishes the configured MySQL host port and shows the usable database address', t => {
  const f = makePackage(t, { withEnv: true });
  const envPath = path.join(f.root, '.env');
  fs.writeFileSync(envPath, fs.readFileSync(envPath, 'utf8')
    .replace('MYSQL_PORT=3306', 'MYSQL_PORT=13306')
    .replace('MYSQL_BIND_ADDRESS=127.0.0.1', 'MYSQL_BIND_ADDRESS=0.0.0.0'));
  const result = successfulStart(f);
  assert.ok(result.stdout.includes('0.0.0.0:13306'));
  assert.equal(f.readState().containers[0].mysqlPort, '13306');
});

shellTest('an old Docker allinone container without the MySQL port must restart before mapping is reported as active', t => {
  const f = makePackage(t);
  successfulStart(f);
  const state = f.readState(); state.containers[0].mysqlPort = ''; f.writeState(state);
  f.resetCalls();
  const stale = f.invoke();
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /--restart|端口映射/);
  assert.equal(f.calls().some(call => call.args.includes('up')), false);
  const restart = f.invoke(['--restart']);
  assert.equal(restart.status, 0, restart.stderr);
  assert.equal(f.readState().containers[0].mysqlPort, '3306');
  assert.ok(restart.stdout.includes('127.0.0.1:3306'));
});

shellTest('invalid or conflicting MySQL host ports fail read-only checks', t => {
  for (const [key, value] of [['MYSQL_PORT','0'],['MYSQL_PORT','65536'],['MYSQL_PORT','abc'],['MYSQL_PORT','8080'],['MYSQL_BIND_ADDRESS','999.1.2.3'],['MYSQL_BIND_ADDRESS','localhost']]) {
    const f = makePackage(t, { withEnv: true });
    const envPath = path.join(f.root, '.env');
    fs.writeFileSync(envPath, fs.readFileSync(envPath, 'utf8').replace(new RegExp('^'+key+'=.*$', 'm'), key+'='+value));
    const before = fs.readFileSync(envPath);
    const result = f.invoke(['--check']);
    assert.notEqual(result.status, 0, key+'='+value);
    assert.match(result.stderr, /MYSQL_PORT|MYSQL_BIND_ADDRESS|冲突/);
    assert.deepEqual(fs.readFileSync(envPath), before);
    assert.equal(f.calls().some(call => call.args.includes('up')), false);
  }
});

shellTest('Compose cannot silently publish MySQL on a different address, port, or protocol', t => {
  for (const [key, value] of [['badMysqlBind','0.0.0.0'],['badMysqlPublished','13306'],['badMysqlTarget',3307],['badMysqlProtocol','udp']]) {
    const f = makePackage(t, { withEnv: true });
    const state = f.readState(); state[key]=value; f.writeState(state);
    const result = f.invoke(['--check']);
    assert.notEqual(result.status, 0, key);
    assert.equal(f.calls().some(call => call.args.includes('up')), false);
  }
});

shellTest('English Docker all-in-one startup preserves health checks and data', t => {
  const f = makePackage(t);
  const started = f.invoke([], { DATAVISOOL_LANG: 'en-US' });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.match(started.stdout, /health/i);
  const status = f.invoke(['--status'], { DATAVISOOL_LANG: 'en-US' });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, /running|healthy/i);
  const stopped = f.invoke(['--stop'], { DATAVISOOL_LANG: 'en-US' });
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  assert.equal(fs.existsSync(path.join(f.root, 'data')), true);
});
