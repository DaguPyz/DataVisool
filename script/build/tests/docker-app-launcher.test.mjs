/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER_DIR = path.join(BUILD_DIR, 'launcher');
const DOCKER_APP_DIR = path.join(BUILD_DIR, 'docker-app');
const SKIP_SHELL_TESTS = process.platform === 'win32' || !fs.existsSync('/bin/sh');
const REAL_COMPOSE_VERSION = spawnSync('docker', ['compose', 'version', '--short'], {
  encoding: 'utf8', timeout: 3000,
});
const HAS_REAL_COMPOSE = REAL_COMPOSE_VERSION.status === 0;
const REAL_DOCKER_BIN = spawnSync('/bin/sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim();
const REAL_ENV_BIN = spawnSync('/bin/sh', ['-c', 'command -v env'], { encoding: 'utf8' }).stdout.trim();
const PYTHON3_PROBE = spawnSync('python3', ['-c', 'import os, sys; print(os.path.realpath(sys.executable))'], { encoding: 'utf8' });
const PYTHON3_BIN = PYTHON3_PROBE.status === 0 ? PYTHON3_PROBE.stdout.trim() : '';
let packageCounter = 0;

async function startUnixSocketFixture(t, socketPaths, { cleanupPaths = socketPaths, cleanupDirs = [] } = {}) {
  const serverSource = String.raw`import socket, sys, time
sockets = []
for path in sys.argv[1:]:
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(path)
    server.listen(1)
    sockets.append(server)
print('READY', flush=True)
while True:
    time.sleep(1)
`;
  const child = spawn(PYTHON3_BIN, ['-u', '-c', serverSource, ...socketPaths], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errorOutput = '';
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    for (const socketPath of cleanupPaths) {
      try { fs.unlinkSync(socketPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const directory of cleanupDirs) fs.rmdirSync(directory);
  });
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('READY')) resolve();
    });
    child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', code => {
      if (!output.includes('READY')) reject(new Error(`Unix socket fixture exited (${code}): ${errorOutput}`));
    });
  });
  let timeout;
  try {
    await Promise.race([
      ready,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Unix socket fixture did not start: ${errorOutput}`)), 5000); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function shellTest(name, optionsOrCallback, maybeCallback) {
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  test(name, { ...options, skip: SKIP_SHELL_TESTS || options.skip }, callback);
}

function extractTopLevelShellFunction(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^${escaped}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(match, `Could not extract ${name} from shell launcher.`);
  return match[0];
}

shellTest('shell lock cleanup keeps a complete owner across the reaper interleaving', t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-shell-lock-interleave-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const launcherPath of [
    path.join(DOCKER_APP_DIR, 'launch.sh'),
    path.join(BUILD_DIR, 'docker-allinone', 'launch.sh'),
  ]) {
    const source = fs.readFileSync(launcherPath, 'utf8');
    const functions = ['lock_tombstone_path', 'remove_lock_tombstone', 'release_lock', 'cleanup', 'acquire_lock']
      .map(name => extractTopLevelShellFunction(source, name)).join('\n');
    const script = `
set -eu
root=$1
run_dir=$root/run
lock_dir=$run_dir/.docker-launch.lock
lock_acquired=no
run_dir_created=no
terminal_state=
work_dir=
pending_work=
fail() { printf '%s\\n' "$1" >&2; exit 1; }
inject_competitor=no
${functions}

# Reproduce the old cleanup race with explicit barriers: cleanup removes owner,
# the contender creates reaper and reads the now-empty owner, cleanup cannot
# rmdir the nonempty lock, then the contender removes reaper. The empty lock
# makes a later acquire fail closed.
legacy_lock=$run_dir/legacy/.docker-launch.lock
/bin/mkdir -p "$legacy_lock"
printf '%s\\n' "$$" > "$legacy_lock/owner"
/bin/rm -f "$legacy_lock/owner"
/bin/mkdir "$legacy_lock/reaper"
legacy_contender_owner=$(cat "$legacy_lock/owner" 2>/dev/null || :)
[ -z "$legacy_contender_owner" ] || fail 'Legacy barrier did not observe the empty owner.'
if /bin/rmdir "$legacy_lock" 2>/dev/null; then fail 'Legacy lock unexpectedly disappeared while reaper existed.'; fi
/bin/rmdir "$legacy_lock/reaper"
[ -d "$legacy_lock" ] && [ ! -e "$legacy_lock/owner" ] || fail 'Legacy race did not leave the expected incomplete lock.'

# Run the launcher's actual lock functions. The mkdir wrapper is a deterministic
# contender barrier immediately after release_lock creates reaper and before it
# reads the owner. A competing reaper must fail while the valid PID remains.
mkdir() {
  if [ "$1" = "$lock_dir/reaper" ] && [ "$inject_competitor" = yes ]; then
    /bin/mkdir "$@"
    inject_competitor=no
    if /bin/mkdir "$lock_dir/reaper" 2>/dev/null; then fail 'Competing reaper unexpectedly acquired the gate.'; fi
    contender_owner=$(cat "$lock_dir/owner" 2>/dev/null || :)
    [ "$contender_owner" = "$$" ] || fail 'Owner disappeared before the reaper handoff.'
    contender_saw_owner=yes
    return 0
  fi
  /bin/mkdir "$@"
}
mkdir -p "$run_dir"
acquire_lock
[ "$(cat "$lock_dir/owner")" = "$$" ] || fail 'Initial lock owner was not recorded.'
inject_competitor=yes
contender_saw_owner=no
cleanup
[ "$contender_saw_owner" = yes ] || fail 'Contender barrier did not run.'
[ ! -e "$lock_dir" ] || fail 'Released lock remained after the interleaving.'
acquire_lock
[ "$(cat "$lock_dir/owner")" = "$$" ] || fail 'A later acquire could not record a complete owner.'
release_lock
`;
    const result = spawnSync('/bin/sh', ['-c', script, 'lock-test', path.join(tempRoot, path.basename(path.dirname(launcherPath)))], {
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, `${launcherPath}: ${result.stdout}\n${result.stderr}`);
  }
});

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

function envFile({
  project,
  image = 'datavisool-web:test-amd64',
  user = 'app_user',
  password = 'test-password',
  database = 'lcp_server',
  uid = process.getuid?.() ?? 10001,
  gid = process.getgid?.() ?? 10001,
} = {}) {
  return [
    `DATAVISOOL_IMAGE=${image}`,
    `DATAVISOOL_PROJECT_NAME=${project}`,
    'APP_BIND_ADDRESS=127.0.0.1',
    'APP_PORT=18080',
    `APP_UID=${uid}`,
    `APP_GID=${gid}`,
    'DB_HOST=mysql.internal',
    'DB_PORT=3306',
    `DB_NAME=${database}`,
    `DB_USER=${user}`,
    `DB_PASSWORD='${password.replaceAll("'", "''")}'`,
    'JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=75.0 -Duser.timezone=Asia/Shanghai',
    '',
  ].join('\n');
}

test('the Docker app release template leaves DB_NAME, DB_USER, and DB_PASSWORD blank and Compose requires each value', () => {
  const template = fs.readFileSync(path.join(DOCKER_APP_DIR, '.env.example'), 'utf8');
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) assert.match(template, new RegExp(`^${key}=$`, 'm'));
  const compose = fs.readFileSync(path.join(DOCKER_APP_DIR, 'docker-compose.yml'), 'utf8');
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) assert.match(compose, new RegExp(`${key}: \\\$\\{${key}:\\?`));
  assert.doesNotMatch(compose, /DB_NAME:\s*\$\{DB_NAME:-/);
  assert.doesNotMatch(fs.readFileSync(path.join(DOCKER_APP_DIR, 'config/application.yml'), 'utf8'), /\$\{DB_NAME:lcp_server\}/);
});

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
const project = after('-p', effective('DATAVISOOL_PROJECT_NAME') || 'datavisool-app-default');
const projectDirectory = after('--project-directory', envFile ? path.dirname(envFile) : process.cwd());
const stdout = value => { process.stdout.write(String(value)); };
const stderr = value => { process.stderr.write(String(value)); };
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const managedEnv = {};
for (const [key, value] of Object.entries(process.env)) {
  if (/^(DATAVISOOL_|DB_|APP_|COMPOSE_)/.test(key)) managedEnv[key] = key === 'DB_PASSWORD' ? '[redacted]' : value;
}
const hasCustomPasswordEnv = Object.hasOwn(process.env, 'CUSTOM_PASSWORD');
const hasPathEnv = Object.hasOwn(process.env, 'PATH');
const hasBareOverrideEnv = Object.hasOwn(process.env, 'BARE_PARENT_VALUE');
const dbPasswordMatchesFixture = effective('DB_PASSWORD') === process.env.FAKE_EXPECTED_DB_PASSWORD;
const stdin = args.includes('-f') && args[args.indexOf('-f') + 1] === '-' ? fs.readFileSync(0, 'utf8') : '';
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
record.push({ args, cwd: process.cwd(), managedEnv, hasCustomPasswordEnv, hasPathEnv, hasBareOverrideEnv, dbPasswordMatchesFixture, envFile, project, projectDirectory, stdin });
fs.writeFileSync(recordPath, JSON.stringify(record));
const fail = (message, status = 1) => { if (message) stderr(message + '\n'); process.exit(status); };
const containers = () => state.containers || [];
const findContainer = id => containers().find(item => item.id === id);
const labelValue = (container, name) => (container?.labels || {})[name] || '';
const addContainer = () => {
  let container = containers().find(item => item.labels['com.docker.compose.project'] === project
    && item.labels['com.docker.compose.service'] === 'app'
    && item.labels['com.docker.compose.project.working_dir'] === projectDirectory);
  if (!container) {
    container = {
      id: state.nextContainerId || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      image: effective('DATAVISOOL_IMAGE') || 'datavisool-web:test-amd64',
      status: 'running',
      health: state.healthFailure ? 'unhealthy' : 'healthy',
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
  }
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
} else if (args[0] === 'image' && args[1] === 'inspect') {
  if (!state.imagePresent) fail('No such image');
  if (template.includes('.Os') && template.includes('.Architecture')) stdout(state.imagePlatform || 'linux/amd64');
  else if (template.includes('.Id')) stdout(state.imageId || 'sha256:fake-image-id');
  else stdout('sha256:fake-image-id');
} else if (args[0] === 'load') {
  state.imagePresent = true;
  save();
  stdout('Loaded image: datavisool-web:test-amd64\n');
} else if (args[0] === 'compose' && args.includes('config')) {
  if (args.includes('--environment')) {
    fail('unknown flag: --environment');
  } else if (args.includes('--format') && after('--format') === 'json' && stdin) {
    if (!args.includes('-p')) fail('project name must not be empty');
    const keys = ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'APP_UID', 'APP_GID',
      'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS', 'TZ'];
    const environment = Object.fromEntries(keys.map(key => [key, effective(key).split('$').join('$$')]));
    stdout(JSON.stringify({ services: { app: { environment } } }));
  } else if (args.includes('--format') && after('--format') === 'json') {
    stdout(JSON.stringify({
      name: project,
      services: {
        app: {
          image: effective('DATAVISOOL_IMAGE') || 'datavisool-web:test-amd64',
          user: (effective('APP_UID') || '10001') + ':' + (effective('APP_GID') || '10001'),
          environment: {
            DATAVISOOL_RESOURCE_PATH_ROOT: '/usr/app/resource',
            DATAVISOOL_AI_STORAGE_PATH: '/usr/app/resource/ai-driven',
          },
          ports: [{ host_ip: effective('APP_BIND_ADDRESS') || '127.0.0.1', published: effective('APP_PORT') || '18080', target: 8080, protocol: 'tcp' }],
          volumes: [
            { type: 'bind', source: path.join(projectDirectory, 'config/application.yml'), target: '/config/application.yml', read_only: true, bind: { create_host_path: false } },
            { type: 'bind', source: path.join(projectDirectory, 'resource'), target: state.badResourceMount ? '/wrong/resource' : '/usr/app/resource', bind: { create_host_path: false } },
            { type: 'bind', source: path.join(projectDirectory, 'logs'), target: '/datavisool/server/logs', bind: { create_host_path: false } },
          ],
        },
      },
    }));
  } else if (args.includes('--services')) stdout('app\n');
  else if (args.includes('--images')) stdout((effective('DATAVISOOL_IMAGE') || 'datavisool-web:test-amd64') + '\n');
  else if (args.includes('--quiet')) {
    if (!effective('DB_USER') || !effective('DB_PASSWORD')) fail('DB_USER and DB_PASSWORD are required');
  }
} else if (args[0] === 'compose' && args.includes('up')) {
  const container = addContainer();
  if (state.healthFailure) fail('dependency failed to start: container is unhealthy');
  stdout(container.id + '\n');
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
  else if (template.includes('.State.Status')) stdout(container.status);
  else if (template.includes('.State.Health')) stdout(container.health || 'none');
  else if (template.includes('.NetworkSettings.Ports')) stdout('127.0.0.1:18080 ');
  else if (template.includes('.Id')) stdout(container.id);
  else stdout(JSON.stringify(container));
} else if (args[0] === 'stop') {
  const id = args.at(-1);
  const container = findContainer(id);
  if (!container) fail('No such container: ' + id);
  if (state.stopFailure) fail('stop request failed');
  container.status = 'exited';
  save();
  stdout(id + '\n');
} else if (args[0] === 'logs') {
  stdout('fake application log line\n');
} else {
  fail('unsupported fake Docker invocation: ' + allText);
}
`;
}

function makePackage(t, {
  withEnv = true,
  architecture = 'amd64',
  packagePlatform = 'linux/amd64',
  image = 'datavisool-web:test-amd64',
  imagePresent = false,
  healthFailure = false,
  fakeDocker = true,
} = {}) {
  const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-launcher-')));
  const root = path.join(tempRoot, '部署包 with spaces & 中文');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  for (const name of ['deploy_linux.sh', 'deploy_macos.command']) {
    fs.copyFileSync(path.join(LAUNCHER_DIR, name), path.join(root, name));
    fs.chmodSync(path.join(root, name), 0o755);
  }
  const appDir = path.join(root, 'docker-app');
  fs.mkdirSync(appDir);
  for (const name of ['launch.sh', 'docker-compose.yml', '.env.example']) {
    fs.copyFileSync(path.join(DOCKER_APP_DIR, name), path.join(appDir, name));
  }
  fs.chmodSync(path.join(appDir, 'launch.sh'), 0o755);
  const project = `datavisool-test-${process.pid}-${++packageCounter}`;
  fs.writeFileSync(path.join(appDir, 'IMAGE'), `${image}\n`);
  fs.writeFileSync(path.join(appDir, 'PLATFORM'), `${packagePlatform}\n`);
  fs.writeFileSync(path.join(root, '.datavisool-deployment'), 'docker-app-launcher-v1\n');
  fs.mkdirSync(path.join(root, 'config'));
  fs.copyFileSync(path.join(DOCKER_APP_DIR, 'config/application.yml'), path.join(root, 'config/application.yml'));
  fs.writeFileSync(path.join(root, 'image.tar'), 'fake Docker archive');
  if (withEnv) fs.writeFileSync(path.join(root, '.env'), envFile({ project, image }));
  fs.mkdirSync(path.join(root, 'resource'));
  fs.mkdirSync(path.join(root, 'logs'));
  fs.writeFileSync(path.join(root, 'resource/keep.txt'), 'resource data');
  fs.writeFileSync(path.join(root, 'logs/keep.log'), 'existing log');

  const fakeBin = path.join(tempRoot, 'fake-bin');
  fs.mkdirSync(fakeBin);
  const dockerPath = path.join(fakeBin, 'docker');
  fs.writeFileSync(dockerPath, fakeDockerSource());
  fs.chmodSync(dockerPath, 0o755);
  const statePath = path.join(tempRoot, 'docker-state.json');
  const recordPath = path.join(tempRoot, 'docker-record.json');
  fs.writeFileSync(statePath, JSON.stringify({
    architecture,
    osType: 'linux',
    endpoint: 'unix:///var/run/docker.sock',
    imagePresent,
    imagePlatform: packagePlatform,
    healthFailure,
    stopFailure: false,
    nextContainerId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    containers: [],
  }));
  fs.writeFileSync(recordPath, '[]');
  const baseEnv = {
    PATH: `${path.dirname(process.execPath)}:${fakeBin}:/usr/bin:/bin`,
    FAKE_DOCKER_STATE: statePath,
    FAKE_DOCKER_RECORD: recordPath,
  };
  const runnerEnv = { ...process.env, DATAVISOOL_LANG: 'zh-CN' };
  // This flag opts the separate BuildKit test in; it is not a deployment setting.
  delete runnerEnv.DATAVISOOL_TEST_DOCKER_CONTEXT;
  const invoke = (args = [], extraEnv = {}, entry = 'deploy_linux.sh') => spawnSync('/bin/sh', [path.join(root, entry), ...args], {
    cwd: os.tmpdir(),
    env: { ...runnerEnv, ...(fakeDocker ? baseEnv : {}), ...extraEnv, PATH: fakeDocker ? baseEnv.PATH : process.env.PATH },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  const invokePty = (args, answers, extraEnv = {}) => spawnSync(PYTHON3_BIN || 'python3', [
    '-c', DOCKER_PTY_DRIVER, path.join(root, 'deploy_linux.sh'), ...args,
  ], {
    cwd: os.tmpdir(),
    env: {
      ...runnerEnv, ...baseEnv, ...extraEnv, PATH: baseEnv.PATH,
      PTY_DB_NAME: answers.database ?? '',
      PTY_DB_USER: answers.user ?? '',
      PTY_DB_PASSWORD: answers.password ?? '',
    },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 25000,
    maxBuffer: 1024 * 1024,
  });
  const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const writeState = value => fs.writeFileSync(statePath, JSON.stringify(value));
  const calls = () => JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  const resetCalls = () => fs.writeFileSync(recordPath, '[]');
  return { root, appDir, project, invoke, invokePty, readState, writeState, calls, resetCalls };
}

function successfulStart(f) {
  const result = f.invoke();
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(f.readState().containers.length, 1);
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

shellTest('the root Linux launcher dispatches a complete Docker app package without Java or an interactive prompt', t => {
  const f = makePackage(t);
  const result = successfulStart(f);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Java 17|请输入|数据库密码/);
  assert.match(result.stdout, /18080/);
  assert.equal(fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8'), 'resource data');
  assert.equal(fs.readFileSync(path.join(f.root, 'logs/keep.log'), 'utf8'), 'existing log');
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim(), f.project);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/deployment.root'), 'utf8').trim(), fs.realpathSync(f.root));
  assert.match(fs.readFileSync(path.join(f.root, 'run/container.id'), 'utf8'), /^[0-9a-f]{64}\n$/);
  assert.equal(fs.readFileSync(path.join(f.root, '.datavisool-deployment'), 'utf8'), 'docker-app-launcher-v1\n');
});

shellTest('a prepared .env with blank app IDs uses the invoking user on first start', t => {
  const f = makePackage(t);
  const envPath = path.join(f.root, '.env');
  const source = fs.readFileSync(envPath, 'utf8')
    .replace(/^APP_UID=.*$/m, 'APP_UID=')
    .replace(/^APP_GID=.*$/m, 'APP_GID=');
  fs.writeFileSync(envPath, source);
  for (const name of ['resource', 'logs']) fs.rmSync(path.join(f.root, name), { recursive: true });
  const check = f.invoke(['--check']);
  assert.notEqual(check.status, 0);
  assert.match(`${check.stdout}\n${check.stderr}`, /APP_UID\/APP_GID/);
  assert.equal(fs.readFileSync(envPath, 'utf8'), source);

  successfulStart(f);
  const uid = process.getuid?.() === 0 ? 10001 : process.getuid();
  const gid = process.getuid?.() === 0 ? 10001 : process.getgid();
  const saved = fs.readFileSync(envPath, 'utf8');
  assert.match(saved, new RegExp(`^APP_UID="${uid}"$`, 'm'));
  assert.match(saved, new RegExp(`^APP_GID="${gid}"$`, 'm'));
  for (const name of ['resource', 'logs']) assert.ok(fs.statSync(path.join(f.root, name)).isDirectory());
});

shellTest('an existing deployment refuses blank app IDs without changing its data or configuration', t => {
  const f = makePackage(t);
  successfulStart(f);
  assert.equal(f.invoke(['--stop']).status, 0);
  const envPath = path.join(f.root, '.env');
  const source = fs.readFileSync(envPath, 'utf8').replace(/^APP_UID=.*$/m, 'APP_UID=');
  fs.writeFileSync(envPath, source);
  f.resetCalls();
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /已有部署.*APP_UID/);
  assert.equal(fs.readFileSync(envPath, 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8'), 'resource data');
  assert.equal(f.calls().some(call => call.args.includes('up')), false);
});

shellTest('app startup filters host values named by .env through temporary save and later Compose calls', t => {
  const f = makePackage(t);
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
  assert.match(fs.readFileSync(envPath, 'utf8'), /^DATAVISOOL_PROJECT_NAME="?datavisool-app-[0-9]+"?$/m);
  const calls = f.calls();
  const probes = calls.filter(call => call.stdin && call.args.includes('config'));
  assert.ok(probes.length >= 2, 'the initial and temporary-file probes should both run');
  assert.ok(probes.every(call => call.project === 'datavisool-env-probe'), 'the probe must not derive its project name from the Chinese deployment directory');
  const configs = calls.filter(call => call.args[0] === 'compose' && call.args.includes('config'));
  assert.ok(configs.length > 0);
  assert.ok(configs.every(call => !call.hasCustomPasswordEnv && !call.hasPathEnv && !call.hasBareOverrideEnv),
    `Docker children must not inherit .env keys: ${JSON.stringify(configs.map(call => [call.hasCustomPasswordEnv, call.hasPathEnv, call.hasBareOverrideEnv, call.envFile]))}`);
  assert.ok(configs.every(call => call.dbPasswordMatchesFixture),
    'Compose must resolve DB_PASSWORD from .env even when the parent exports CUSTOM_PASSWORD');
  assert.ok(configs.some(call => call.envFile === envPath), 'the saved .env must be selected for later Compose calls');
});

shellTest('app startup rejects Docker connection or home variables in .env before invoking Docker', t => {
  const f = makePackage(t);
  fs.appendFileSync(path.join(f.root, '.env'), 'DOCKER_CONTEXT=untrusted-context\n');
  const result = f.invoke([], { DOCKER_CONTEXT: 'parent-context' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /不能声明 DOCKER_\*/);
  assert.equal(f.calls().length, 0, 'rejecting the setting must happen before any Docker command');
});

shellTest('fresh Docker app startup prompts for database name, username, and password, then saves all three', {
  skip: !PYTHON3_BIN,
}, t => {
  const f = makePackage(t, { withEnv: false });
  const secret = 'first-deploy-secret-must-not-echo';
  const result = f.invokePty([], { database: 'first_db', user: 'first_user', password: secret });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const prompt of [/MySQL 数据库名称/, /MySQL 用户名/, /MySQL 密码/]) assert.match(result.stdout, prompt);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret));
  const saved = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
  assert.match(saved, /^DB_NAME="first_db"$/m);
  assert.match(saved, /^DB_USER="first_user"$/m);
  assert.match(saved, /^DB_PASSWORD="first-deploy-secret-must-not-echo"$/m);
});

shellTest('start protects an unchanged existing .env without creating a backup', t => {
  const f = makePackage(t);
  const envPath = path.join(f.root, '.env');
  const before = fs.readFileSync(envPath);
  fs.chmodSync(envPath, 0o644);

  successfulStart(f);

  assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
  assert.deepEqual(fs.readFileSync(envPath), before);
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.env.bak.')), false);
});

shellTest('a missing database value without a TTY leaves the package unchanged', t => {
  const f = makePackage(t, { withEnv: false });
  const before = fs.readFileSync(path.join(f.root, 'config/application.yml'));
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /DB_USER|DB_PASSWORD|数据库/);
  assert.equal(fs.existsSync(path.join(f.root, '.env')), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'config/application.yml')), before);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.equal(f.readState().containers.length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
});

shellTest('--check is read-only and does not load an image or start a container', t => {
  const f = makePackage(t);
  const envBefore = fs.readFileSync(path.join(f.root, '.env'));
  const configBefore = fs.readFileSync(path.join(f.root, 'config/application.yml'));
  const result = f.invoke(['--check']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /检查/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), envBefore);
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'config/application.yml')), configBefore);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.equal(fs.existsSync(path.join(f.root, '.env.bak')), false);
  assert.equal(f.readState().containers.length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
  assert.ok(f.calls().some(call => call.args.includes('--format') && call.args.includes('json')));
});

shellTest('--check rejects resource directories not writable by the configured app user without changing the package', t => {
  const f = makePackage(t);
  const uid = process.getuid?.() === 10001 ? 10002 : 10001;
  const gid = process.getgid?.() === 10001 ? 10002 : 10001;
  const envPath = path.join(f.root, '.env');
  const before = fs.readFileSync(envPath, 'utf8')
    .replace(/^APP_UID=.*$/m, `APP_UID=${uid}`)
    .replace(/^APP_GID=.*$/m, `APP_GID=${gid}`);
  fs.writeFileSync(envPath, before);
  for (const directory of ['resource', 'logs']) fs.chmodSync(path.join(f.root, directory), 0o755);

  const result = f.invoke(['--check']);

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /APP_UID\/APP_GID|不可写|权限/);
  assert.equal(fs.statSync(path.join(f.root, 'resource')).mode & 0o777, 0o755);
  assert.equal(fs.statSync(path.join(f.root, 'logs')).mode & 0o777, 0o755);
  assert.equal(fs.readFileSync(envPath, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
});

shellTest('--check rejects a Compose resource bind mount that escapes the persistent host resource directory', t => {
  const f = makePackage(t);
  const state = f.readState();
  state.badResourceMount = true;
  f.writeState(state);
  const result = f.invoke(['--check']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Compose|挂载|resource/);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
  assert.equal(f.readState().containers.length, 0);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
});

shellTest('the launcher reuses a matching local image and imports image.tar only when the tag is absent', t => {
  const local = makePackage(t, { imagePresent: true });
  successfulStart(local);
  assert.equal(local.calls().some(call => call.args[0] === 'load'), false);

  const missing = makePackage(t, { imagePresent: false });
  successfulStart(missing);
  const load = missing.calls().find(call => call.args[0] === 'load');
  assert.ok(load);
  assert.ok(load.args.includes('--input'));
  assert.ok(load.args.includes(path.join(missing.root, 'image.tar')));
});

shellTest('the launcher rejects a host architecture mismatch before importing or starting', t => {
  const f = makePackage(t, { architecture: 'arm64' });
  const result = f.invoke(['--check']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /架构|amd64|arm64/);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
});

shellTest('startup waits for health, honors --wait-timeout, and duplicate startup keeps one container', t => {
  const f = makePackage(t);
  successfulStart(f);
  const up = f.calls().find(call => call.args[0] === 'compose' && call.args.includes('up'));
  assert.ok(up);
  assert.ok(up.args.includes('--detach'));
  assert.ok(up.args.includes('--wait'));
  assert.ok(up.args.includes('--pull'));
  assert.equal(up.args[up.args.indexOf('--pull') + 1], 'never');
  assert.equal(up.args[up.args.indexOf('--wait-timeout') + 1], '300');

  const duplicate = f.invoke();
  assert.equal(duplicate.status, 0, `${duplicate.stdout}\n${duplicate.stderr}`);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8'), 'resource data');
  assert.equal(fs.readFileSync(path.join(f.root, 'logs/keep.log'), 'utf8'), 'existing log');

  const timed = makePackage(t);
  const custom = timed.invoke(['--wait-timeout', '17']);
  assert.equal(custom.status, 0, `${custom.stdout}\n${custom.stderr}`);
  const customUp = timed.calls().find(call => call.args[0] === 'compose' && call.args.includes('up'));
  assert.equal(customUp.args[customUp.args.indexOf('--wait-timeout') + 1], '17');

  const restarted = makePackage(t);
  successfulStart(restarted);
  const restart = restarted.invoke(['--restart', '--wait-timeout', '23']);
  assert.equal(restart.status, 0, `${restart.stdout}\n${restart.stderr}`);
  const restartUps = restarted.calls().filter(call => call.args[0] === 'compose' && call.args.includes('up'));
  assert.equal(restartUps.at(-1).args[restartUps.at(-1).args.indexOf('--wait-timeout') + 1], '23');
});

shellTest('health-check failure leaves the container available for inspection and logs', t => {
  const f = makePackage(t, { healthFailure: true });
  const result = f.invoke();
  assert.notEqual(result.status, 0);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.readState().containers[0].status, 'running');
  assert.equal(f.readState().containers[0].health, 'unhealthy');
  assert.equal(f.calls().some(call => call.args[0] === 'rm' || call.args.includes('down')), false);
  assert.match(`${result.stdout}\n${result.stderr}`, /logs|日志|健康/);
});

shellTest('status, stop, and logs do not require complete database credentials', t => {
  const f = makePackage(t);
  successfulStart(f);
  const dotenv = fs.readFileSync(path.join(f.root, '.env'), 'utf8')
    .replace(/^DB_USER=.*\n/m, 'DB_USER=\n')
    .replace(/^DB_PASSWORD=.*\n/m, 'DB_PASSWORD=\n');
  fs.writeFileSync(path.join(f.root, '.env'), dotenv);
  f.resetCalls();

  const status = f.invoke(['--status']);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, /running|healthy|运行|健康/i);
  assert.equal(f.calls().some(call => call.args.includes('config') && call.args.includes('--quiet')), false);

  const logs = f.invoke(['--logs']);
  assert.equal(logs.status, 0, `${logs.stdout}\n${logs.stderr}`);
  assert.match(`${logs.stdout}\n${logs.stderr}`, /fake application log line/);
  assert.equal(f.calls().some(call => call.args[0] === 'logs'), true);

  const stop = f.invoke(['--stop']);
  assert.equal(stop.status, 0, `${stop.stdout}\n${stop.stderr}`);
  assert.equal(f.readState().containers[0].status, 'exited');
  assert.ok(f.calls().some(call => call.args[0] === 'stop' && call.args.includes('60')));
});

shellTest('restarting without .env restores the recorded project and reuses the existing container and resource data', t => {
  const f = makePackage(t);
  successfulStart(f);
  const stop = f.invoke(['--stop']);
  assert.equal(stop.status, 0, `${stop.stdout}\n${stop.stderr}`);
  fs.writeFileSync(path.join(f.root, 'resource/restart-sentinel.txt'), 'keep this resource');

  fs.unlinkSync(path.join(f.root, '.env'));
  const templatePath = path.join(f.appDir, '.env.example');
  const template = fs.readFileSync(templatePath, 'utf8')
    .replace(/^DB_NAME=.*$/m, 'DB_NAME=restart_db')
    .replace(/^DB_USER=.*$/m, 'DB_USER=fixture_user')
    .replace(/^DB_PASSWORD=.*$/m, "DB_PASSWORD='fixture-password'");
  fs.writeFileSync(templatePath, template);
  f.resetCalls();

  f.invoke(['--check']);
  assert.equal(fs.existsSync(path.join(f.root, '.env')), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim(), f.project);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.readState().containers[0].status, 'exited');
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
  f.resetCalls();

  const restarted = f.invoke();

  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.readState().containers[0].status, 'running');
  assert.equal(f.readState().containers[0].labels['com.docker.compose.project'], f.project);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim(), f.project);
  assert.equal(fs.readFileSync(path.join(f.root, 'resource/restart-sentinel.txt'), 'utf8'), 'keep this resource');
  assert.equal(fs.readFileSync(path.join(f.root, '.env'), 'utf8').match(/^DATAVISOOL_PROJECT_NAME=.*$/m)?.[0], `DATAVISOOL_PROJECT_NAME="${f.project}"`);
  const up = f.calls().find(call => call.args[0] === 'compose' && call.args.includes('up'));
  assert.ok(up);
  assert.equal(up.project, f.project);
});

shellTest('a recreated .env prompts for the missing database name, user, and password while retaining the recorded project', {
  skip: !PYTHON3_BIN,
}, t => {
  const f = makePackage(t);
  successfulStart(f);
  assert.equal(f.invoke(['--stop']).status, 0);
  fs.unlinkSync(path.join(f.root, '.env'));
  const templatePath = path.join(f.appDir, '.env.example');
  const template = fs.readFileSync(templatePath, 'utf8')
    .replace(/^DB_NAME=.*$/m, 'DB_NAME=')
    .replace(/^DB_USER=.*$/m, 'DB_USER=')
    .replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=');
  fs.writeFileSync(templatePath, template);

  const secret = 'prompted-password-must-not-appear';
  const result = f.invokePty([], { database: 'prompted_db', user: 'prompted_user', password: secret });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MySQL 数据库名称/);
  assert.match(result.stdout, /MySQL 用户名/);
  assert.match(result.stdout, /MySQL 密码/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret));
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.readState().containers[0].labels['com.docker.compose.project'], f.project);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8').trim(), f.project);
  const recreatedEnv = fs.readFileSync(path.join(f.root, '.env'), 'utf8');
  assert.match(recreatedEnv, new RegExp(`^DATAVISOOL_PROJECT_NAME="${f.project}"$`, 'm'));
  assert.match(recreatedEnv, /^DB_NAME="prompted_db"$/m);
  assert.match(recreatedEnv, /^DB_USER="prompted_user"$/m);
  assert.match(recreatedEnv, /^DB_PASSWORD="prompted-password-must-not-appear"$/m);
});

shellTest('an actual change to DATAVISOOL_PROJECT_NAME in an existing .env is rejected without rewriting it or starting another container', t => {
  const f = makePackage(t);
  successfulStart(f);
  assert.equal(f.invoke(['--stop']).status, 0);
  const envPath = path.join(f.root, '.env');
  const changed = fs.readFileSync(envPath, 'utf8').replace(/^DATAVISOOL_PROJECT_NAME=.*$/m, 'DATAVISOOL_PROJECT_NAME=other-project');
  fs.writeFileSync(envPath, changed);
  const before = fs.readFileSync(envPath);
  f.resetCalls();

  const result = f.invoke();

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /DATAVISOOL_PROJECT_NAME 已改变/);
  assert.deepEqual(fs.readFileSync(envPath), before);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')), false);
});

shellTest('stale, recycled, and wrong-directory container IDs are never stopped', t => {
  const stale = makePackage(t);
  fs.mkdirSync(path.join(stale.root, 'run'));
  fs.writeFileSync(path.join(stale.root, 'run/project.name'), `${stale.project}\n`);
  fs.writeFileSync(path.join(stale.root, 'run/deployment.root'), `${fs.realpathSync(stale.root)}\n`);
  fs.writeFileSync(path.join(stale.root, 'run/docker.endpoint'), 'unix:///var/run/docker.sock\n');
  fs.writeFileSync(path.join(stale.root, 'run/container.id'), `${'f'.repeat(64)}\n`);
  const staleStop = stale.invoke(['--stop']);
  assert.equal(staleStop.status, 0, `${staleStop.stdout}\n${staleStop.stderr}`);
  assert.equal(stale.calls().some(call => call.args[0] === 'stop'), false);

  for (const [name, labels] of [
    ['recycled', {
      'com.docker.compose.project': 'unrelated-project',
      'com.docker.compose.service': 'app',
      'com.docker.compose.project.working_dir': stale.root,
    }],
    ['wrong-directory', {
      'com.docker.compose.project': stale.project,
      'com.docker.compose.service': 'app',
      'com.docker.compose.project.working_dir': path.join(os.tmpdir(), 'other-deployment'),
    }],
  ]) {
    const f = makePackage(t);
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    fs.mkdirSync(path.join(f.root, 'run'));
    fs.writeFileSync(path.join(f.root, 'run/project.name'), `${f.project}\n`);
    fs.writeFileSync(path.join(f.root, 'run/deployment.root'), `${fs.realpathSync(f.root)}\n`);
    fs.writeFileSync(path.join(f.root, 'run/docker.endpoint'), 'unix:///var/run/docker.sock\n');
    fs.writeFileSync(path.join(f.root, 'run/container.id'), `${id}\n`);
    const state = f.readState();
    state.containers.push({ id, image: 'datavisool-web:test-amd64', status: 'running', health: 'healthy', labels });
    f.writeState(state);
    const result = f.invoke(['--stop']);
    assert.equal(result.error, undefined, `${name}: ${result.stderr}`);
    assert.equal(f.readState().containers[0].status, 'running', name);
    assert.equal(f.calls().some(call => call.args[0] === 'stop'), false, name);
  }
});

shellTest('restart does not start another container when stopping the current one fails', t => {
  const f = makePackage(t);
  successfulStart(f);
  const beforeUps = f.calls().filter(call => call.args[0] === 'compose' && call.args.includes('up')).length;
  const state = f.readState();
  state.stopFailure = true;
  f.writeState(state);
  const restart = f.invoke(['--restart', '--wait-timeout', '9']);
  assert.notEqual(restart.status, 0);
  const after = f.calls();
  assert.equal(after.filter(call => call.args[0] === 'compose' && call.args.includes('up')).length, beforeUps);
  assert.equal(f.readState().containers[0].status, 'running');
});

shellTest('upgrade is explicitly rejected by the Docker app launcher', t => {
  const f = makePackage(t);
  const result = f.invoke(['--upgrade']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /upgrade|升级|不支持|参数/);
  assert.equal(f.calls().some(call => call.args[0] === 'load' || call.args.includes('up')), false);
  assert.equal(fs.existsSync(path.join(f.root, '.env.bak')), false);
});

shellTest('--wait-timeout is accepted only for start and restart', t => {
  for (const mode of ['--check', '--status', '--stop', '--logs']) {
    const f = makePackage(t);
    const result = f.invoke([mode, '--wait-timeout', '4']);
    assert.notEqual(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
    assert.equal(f.calls().some(call => call.args.includes('up')), false, mode);
    assert.equal(fs.existsSync(path.join(f.root, '.env.bak')), false, mode);
  }
});

shellTest('special database secrets stay literal and parent process variables cannot override package settings', t => {
  const f = makePackage(t);
  const marker = path.join(path.dirname(f.root), 'must-not-execute');
  const secret = `$(touch ${marker}) $cash $$pair=a=b # spaces 'single' "double" slash\\ 中文`;
  const quotedSecret = `"${secret.replaceAll('\\', '\\\\').replaceAll('"', '\\"').split('$').join('$$')}"`;
  const dotenv = envFile({ project: f.project, password: '' }).replace("DB_PASSWORD=''", () => `DB_PASSWORD=${quotedSecret}`)
    .replace(/^JAVA_TOOL_OPTIONS=.*$/m, 'JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=75.0\t-Duser.timezone=Asia/Shanghai');
  fs.writeFileSync(path.join(f.root, '.env'), dotenv);
  const result = f.invoke([], {
    DATAVISOOL_PROJECT_NAME: 'parent-project',
    DATAVISOOL_IMAGE: 'parent/image:latest',
    COMPOSE_PROJECT_NAME: 'parent-compose-project',
    APP_PORT: '29999',
    DB_HOST: 'parent-db.internal',
    DB_USER: 'parent-user',
    DB_PASSWORD: 'parent-secret',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(marker), false);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const up = f.calls().find(call => call.args[0] === 'compose' && call.args.includes('up'));
  assert.ok(up);
  assert.equal(up.project, f.project);
  assert.deepEqual(up.managedEnv, {});
  assert.ok(up.args.some((arg, index) => arg === '-p' && up.args[index + 1] === f.project));
  assert.ok(up.args.includes(path.join(f.root, '.env')));
});

shellTest('the macOS entry forwards Docker app package startup to the same helper', t => {
  const f = makePackage(t);
  const result = f.invoke([], {}, 'deploy_macos.command');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(f.readState().containers.length, 1);
  assert.ok(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')));
});

shellTest('the macOS Docker app launcher accepts a symlink alias for the same local Unix socket', {
  skip: !PYTHON3_BIN,
}, async t => {
  const f = makePackage(t);
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-sockets-'));
  const socketPath = path.join(socketDir, 'engine.sock');
  const aliasPath = path.join(socketDir, 'engine-alias.sock');
  await startUnixSocketFixture(t, [socketPath], {
    cleanupPaths: [socketPath, aliasPath],
    cleanupDirs: [socketDir],
  });
  fs.symlinkSync(socketPath, aliasPath);
  const recordedEndpoint = `unix://${socketPath}`;
  const aliasEndpoint = `unix://${aliasPath}`;
  const state = f.readState();
  state.endpoint = recordedEndpoint;
  f.writeState(state);

  const started = f.invoke([], {}, 'deploy_macos.command');
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.equal(f.readState().containers.length, 1);
  const projectBefore = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8');
  const resourceBefore = fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8');

  const stopped = f.invoke(['--stop'], {}, 'deploy_macos.command');
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  assert.equal(f.readState().containers[0].status, 'exited');

  const aliasedState = f.readState();
  aliasedState.endpoint = aliasEndpoint;
  f.writeState(aliasedState);
  const check = f.invoke(['--check'], {}, 'deploy_macos.command');
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  const status = f.invoke(['--status'], {}, 'deploy_macos.command');
  assert.equal(status.status, 3, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, /状态：exited/);
  const restarted = f.invoke(['--restart'], {}, 'deploy_macos.command');
  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8'), projectBefore);
  assert.equal(fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8'), resourceBefore);
  assert.equal(f.readState().containers.length, 1);
  assert.equal(f.readState().containers[0].status, 'running');
  assert.ok(f.calls().some(call => call.args[0] === 'compose' && call.args.includes('up')));
});

shellTest('the Docker app launcher reports and refuses a different local Unix socket without changing deployment data', {
  skip: !PYTHON3_BIN,
}, async t => {
  const f = makePackage(t);
  const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-sockets-'));
  const recordedPath = path.join(socketDir, 'engine-recorded.sock');
  const currentPath = path.join(socketDir, 'engine-current.sock');
  await startUnixSocketFixture(t, [recordedPath, currentPath], { cleanupDirs: [socketDir] });
  const recordedEndpoint = `unix://${recordedPath}`;
  const currentEndpoint = `unix://${currentPath}`;
  const initialState = f.readState();
  initialState.endpoint = recordedEndpoint;
  f.writeState(initialState);

  const started = f.invoke([], {}, 'deploy_macos.command');
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const projectBefore = fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8');
  const resourceBefore = fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8');
  const stopped = f.invoke(['--stop'], {}, 'deploy_macos.command');
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  const state = f.readState();
  state.endpoint = currentEndpoint;
  f.writeState(state);
  const beforeRejectedRestart = f.readState();
  f.resetCalls();

  const rejected = f.invoke(['--restart'], {}, 'deploy_macos.command');
  const output = `${rejected.stdout}\n${rejected.stderr}`;
  assert.notEqual(rejected.status, 0, output);
  assert.ok(output.includes(recordedEndpoint), `missing recorded endpoint in output: ${output}`);
  assert.ok(output.includes(currentEndpoint), `missing current endpoint in output: ${output}`);
  const calls = f.calls();
  assert.equal(calls.some(call => call.args[0] === 'load' || call.args.includes('up') || call.args[0] === 'stop'), false);
  assert.deepEqual(f.readState(), beforeRejectedRestart);
  assert.equal(fs.readFileSync(path.join(f.root, 'run/project.name'), 'utf8'), projectBefore);
  assert.equal(fs.readFileSync(path.join(f.root, 'resource/keep.txt'), 'utf8'), resourceBefore);
});

shellTest('the Docker app launcher refuses a remote Docker context', t => {
  const f = makePackage(t);
  const state = f.readState();
  state.endpoint = 'ssh://docker.example.com';
  f.writeState(state);
  const result = f.invoke(['--check']);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /本机|本地|remote|远程|Docker context/i);
  assert.equal(f.calls().some(call => call.args.includes('up') || call.args[0] === 'load'), false);
});

shellTest('real Docker Compose resolves a quoted shell-like secret without a Docker daemon', {
  skip: !HAS_REAL_COMPOSE,
}, t => {
  const f = makePackage(t);
  const marker = path.join(path.dirname(f.root), 'compose-secret-must-not-execute');
  const secret = `$(touch ${marker}) $cash and $pair=a 'single' "double" slash\\ 中文`;
  const quotedSecret = `'${secret.replaceAll("'", "\\'")}'`;
  const dotenv = envFile({ project: f.project, password: '' }).replace("DB_PASSWORD=''", `DB_PASSWORD=${quotedSecret}`);
  fs.writeFileSync(path.join(f.root, '.env'), dotenv);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DATAVISOOL_|DB_|APP_|COMPOSE_)/.test(key)) delete env[key];
  const probeKeys = ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT', 'APP_UID', 'APP_GID',
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JAVA_TOOL_OPTIONS', 'TZ'];
  const probeModel = `services:\n  app:\n    image: scratch\n    environment:\n${probeKeys.map(key => `      ${key}: "\${${key}-}"`).join('\n')}\n`;
  const probe = spawnSync('docker', [
    'compose', '--project-directory', f.root, '--env-file', path.join(f.root, '.env'), '-f', '-',
    'config', '--format', 'json',
  ], {
    input: probeModel, encoding: 'utf8', env, timeout: 10000,
  });
  assert.equal(probe.status, 0, 'Compose must parse the .env values');
  const resolvedProbe = JSON.parse(probe.stdout).services.app.environment;
  assert.equal(resolvedProbe.DB_PASSWORD, secret.split('$').join('$$'), 'Compose JSON should escape dollar signs');
  assert.equal(resolvedProbe.DB_PASSWORD.split('$$').join('$'), secret, 'one unescape restores the literal secret');
  const fullConfig = spawnSync('docker', [
    'compose', '--project-directory', f.root, '--env-file', path.join(f.root, '.env'), '-p', f.project,
    '-f', path.join(f.appDir, 'docker-compose.yml'), 'config', '--quiet',
  ], { encoding: 'utf8', env, timeout: 10000 });
  assert.equal(fullConfig.status, 0, 'Compose must validate the published Docker app package configuration');
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
});

shellTest('the production app probe handles a Chinese-only directory, dotenv aliases, special values, and PATH safely', {
  skip: !HAS_REAL_COMPOSE,
}, t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-compose-app-probe-'));
  const packageRoot = path.join(tempRoot, '仅中文目录');
  fs.mkdirSync(packageRoot);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const marker = path.join(tempRoot, 'compose-probe-must-not-execute');
  const secret = `$(touch ${marker}) $cash and $pair=a 'single' "double" slash\\ 中文`;
  const quoted = `'${secret.replaceAll("'", "\\'")}'`;
  const envSource = path.join(packageRoot, '.env');
  fs.writeFileSync(envSource, `\uFEFF  export CUSTOM_PASSWORD=${quoted}\nDB_PASSWORD=\${CUSTOM_PASSWORD}\nPATH=/missing-from-dotenv\n`);
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (/^(DATAVISOOL_|DB_|APP_|COMPOSE_)/.test(key)) delete environment[key];
  environment.CUSTOM_PASSWORD = 'host-custom-password';
  environment.DB_PASSWORD = 'host-database-password';
  const script = productionProbeScript(path.join(DOCKER_APP_DIR, 'launch.sh'), packageRoot, envSource);
  const result = spawnSync('/bin/sh', ['-c', script], {
    cwd: os.tmpdir(), env: environment, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(result.stdout.includes(`DB_PASSWORD=${secret}\n`), 'the real Compose probe should return the file value, not the host override');
  assert.ok(result.stdout.includes('parent-custom=host-custom-password'));
  assert.equal(fs.existsSync(marker), false, 'dotenv content must never execute as shell code');
});

shellTest('interactive password input safely persists dollar, quote, and trailing-backslash characters', {
  skip: !PYTHON3_BIN,
}, t => {
  const f = makePackage(t);
  fs.writeFileSync(path.join(f.root, '.env'), envFile({ project: f.project, password: '' }));
  const marker = path.join(path.dirname(f.root), 'password-must-not-execute');
  const secret = `$(touch ${marker}) $cash # spaces 'single' "double" trailing\\`;
  const result = f.invokePty([], { password: secret });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(fs.existsSync(marker), false);
  const passwordLine = fs.readFileSync(path.join(f.root, '.env'), 'utf8').split(/\r?\n/).find(line => line.startsWith('DB_PASSWORD='));
  const escaped = secret.replaceAll('\\', '\\\\').replaceAll('"', '\\"').split('$').join('$$');
  assert.equal(passwordLine, `DB_PASSWORD="${escaped}"`);
  const backups = fs.readdirSync(f.root).filter(name => name.startsWith('.env.bak.'));
  assert.equal(backups.length, 1);
  assert.match(fs.readFileSync(path.join(f.root, backups[0]), 'utf8'), /^DB_PASSWORD=''$/m);
  assert.equal(f.readState().containers.length, 1);
});

shellTest('cancelling the missing-password prompt keeps the original .env and creates no backup', {
  skip: !PYTHON3_BIN,
}, t => {
  const f = makePackage(t);
  fs.writeFileSync(path.join(f.root, '.env'), envFile({ project: f.project, password: '' }));
  const before = fs.readFileSync(path.join(f.root, '.env'));
  const result = f.invokePty([], {});
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /取消|未保存/);
  assert.deepEqual(fs.readFileSync(path.join(f.root, '.env')), before);
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith('.env.bak.')), false);
  assert.equal(f.readState().containers.length, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'run')), false);
});

shellTest('English Docker app startup preserves health checks and environment isolation', t => {
  const f = makePackage(t);
  const started = f.invoke([], { DATAVISOOL_LANG: 'en-US' });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  assert.match(started.stdout, /health/i);
  const status = f.invoke(['--status'], { DATAVISOOL_LANG: 'en-US' });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, /running|healthy/i);
  const stopped = f.invoke(['--stop'], { DATAVISOOL_LANG: 'en-US' });
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
});
