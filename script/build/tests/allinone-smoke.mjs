/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { setEnv, writePrivate } from '../lib/common.mjs';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_DIR = path.join(BUILD_DIR, 'docker-allinone');
const SMOKE_HELP = `用法：node script/build/tests/allinone-smoke.mjs --image IMAGE:TAG [--report FILE]
在本机 Docker 上启动 Docker allinone 镜像，验证应用、数据库写入、正常停止备份和宿主机 data/ 恢复。
此脚本会创建并清理唯一 Compose 项目及临时宿主机数据目录；不会清理其他项目或容器。`;

function safeText(value) {
  return String(value)
    .replace(/(["']?)(?:root_password|app_password|MYSQL_ROOT_PASSWORD|MYSQL_PASSWORD|DB_PASSWORD)\1\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}]+)/gi, '[redacted credential]')
    .replace(/database\.json[^\n]*/gi, '[redacted credentials file reference]');
}

function persistReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  writePrivate(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function command(program, args, { timeoutMs = 30_000, stream = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (stream) process.stdout.write(safeText(chunk.toString('utf8')));
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
      if (stream) process.stderr.write(safeText(chunk.toString('utf8')));
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`${program} timed out after ${timeoutMs}ms`));
      if (code !== 0) {
        return reject(new Error(`${program} exited with ${code}\n${safeText(stderr.trim()).slice(-4000)}`));
      }
      resolve(stdout.trimEnd());
    });
  });
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJson(text, label) {
  try { return JSON.parse(text); }
  catch { throw new Error(`${label} did not return valid JSON`); }
}

async function requestOk(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  requireCondition(response.ok && body.length > 0, `${label} failed with HTTP ${response.status}`);
  return { status: response.status, bytes: Buffer.byteLength(body) };
}

export function readMysqlServerGreeting(port, { host = '127.0.0.1', timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let received = Buffer.alloc(0);
    let settled = false;
    const finish = (error, version) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(version);
    };
    const timer = setTimeout(() => finish(new Error('MySQL host TCP greeting timed out')), timeoutMs);
    socket.on('error', error => finish(new Error(`MySQL host TCP connection failed (${error.code || 'socket error'})`)));
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      if (received.length < 4) return;
      const payloadLength = received.readUIntLE(0, 3);
      if (payloadLength < 2) return finish(new Error('MySQL host TCP greeting packet is invalid'));
      if (received.length < payloadLength + 4) return;
      try { finish(null, parseMysqlServerGreetingPacket(received)); }
      catch (error) { finish(error); }
    });
  });
}

export function parseMysqlServerGreetingPacket(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 4) throw new Error('MySQL host TCP greeting packet is incomplete');
  const payloadLength = packet.readUIntLE(0, 3);
  if (payloadLength < 2 || packet.length < payloadLength + 4) throw new Error('MySQL host TCP greeting packet is invalid');
  const payload = packet.subarray(4, payloadLength + 4);
  const versionEnd = payload.indexOf(0, 1);
  if (payload[0] !== 0x0a || versionEnd < 0) throw new Error('Host port did not return a MySQL protocol greeting');
  const version = payload.subarray(1, versionEnd).toString('ascii');
  if (!version) throw new Error('MySQL host TCP greeting has an empty server version');
  return version;
}

function inspectPublishedPorts(portBindings) {
  const expectedKeys = ['3306/tcp', '8080/tcp'];
  requireCondition(portBindings && JSON.stringify(Object.keys(portBindings).sort()) === JSON.stringify(expectedKeys),
    `container must publish exactly 8080/tcp and 3306/tcp; observed ${JSON.stringify(portBindings)}`);
  const inspect = key => {
    const mappings = portBindings[key];
    requireCondition(Array.isArray(mappings) && mappings.length === 1,
      `container ${key} must have exactly one host mapping; observed ${JSON.stringify(mappings)}`);
    const mapping = mappings[0];
    const port = Number(mapping.HostPort);
    requireCondition(mapping.HostIp === '127.0.0.1' && Number.isInteger(port) && port >= 1 && port <= 65535,
      `container ${key} must use one valid localhost host port; observed ${JSON.stringify(mapping)}`);
    return { host: mapping.HostIp, port };
  };
  return { app: inspect('8080/tcp'), mysql: inspect('3306/tcp') };
}

function databaseProbe(mode, marker) {
  // Passwords are read and used inside the container, and only their combined hash leaves it.
  return String.raw`
import hashlib, json, os, pathlib, subprocess, sys
mode, marker = sys.argv[1], sys.argv[2]
try:
    credentials = json.loads(pathlib.Path('/data/config/database.json').read_text())
    password = credentials['app_password']
    root_password = credentials['root_password']
    database = credentials['database']
    user = credentials['user']
    env = {key: value for key, value in os.environ.items() if not key.startswith('MYSQL_')}
    env['MYSQL_PWD'] = password
    def query(sql):
        result = subprocess.run([
            'mysql', '--protocol=TCP', '--host=127.0.0.1', '--port=3306',
            '--user=' + user, '--database=' + database, '--batch', '--skip-column-names',
            '--execute=' + sql,
        ], env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
           stderr=subprocess.DEVNULL, text=True, timeout=30, check=False)
        if result.returncode != 0:
            raise RuntimeError('database probe query failed')
        return result.stdout.strip()
    migration_rows = int(query('SELECT COUNT(*) FROM migration_history'))
    if migration_rows < 1:
        raise RuntimeError('application migrations have not completed')
    if mode == 'seed':
        query('CREATE TABLE IF NOT EXISTS allinone_smoke_marker (id VARCHAR(64) PRIMARY KEY, value VARCHAR(64) NOT NULL)')
        query("INSERT IGNORE INTO allinone_smoke_marker (id,value) VALUES ('" + marker + "','persisted')")
        pathlib.Path('/data/resource/.allinone-smoke-marker').write_text(marker)
        os.chmod('/data/resource/.allinone-smoke-marker', 0o644)
    marker_rows = int(query("SELECT COUNT(*) FROM allinone_smoke_marker WHERE id='" + marker + "'"))
    resource_marker = pathlib.Path('/data/resource/.allinone-smoke-marker').read_text()
    root_env = dict(env)
    root_env['MYSQL_PWD'] = root_password
    root_query = subprocess.run([
        'mysql', '--protocol=TCP', '--host=127.0.0.1', '--port=3306',
        '--user=root', '--batch', '--skip-column-names', '--execute=SELECT 1',
    ], env=root_env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
       stderr=subprocess.DEVNULL, timeout=30, check=False)
    payload = {
        'credentials_sha256': hashlib.sha256((root_password + '\0' + password).encode()).hexdigest(),
        'migration_rows': migration_rows,
        'database_marker_rows': marker_rows,
        'resource_marker': resource_marker,
        'root_login_ok': root_query.returncode == 0,
    }
    print(json.dumps(payload, sort_keys=True))
except Exception as exc:
    print('database probe failed: ' + type(exc).__name__, file=sys.stderr)
    sys.exit(1)
`;
}

/**
 * Optional host-side authentication hook. It is called after each healthy start with
 * { host, port, database, user, password }; callback inputs and results are never reported.
 */
export async function runAllInOneSmoke(image, {
  reportPath, scriptDir = SCRIPT_DIR, env = process.env, hostDatabaseProbe,
} = {}) {
  if (!image || !/^[a-z0-9][a-z0-9./:_-]*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(image) || image.endsWith(':latest')) {
    throw new Error('请提供明确版本的 Docker allinone 镜像 IMAGE:TAG');
  }
  if (hostDatabaseProbe !== undefined && typeof hostDatabaseProbe !== 'function') {
    throw new Error('hostDatabaseProbe must be a function when provided');
  }
  const runId = randomUUID().replaceAll('-', '');
  const projectName = `datavisool-smoke-${runId.slice(0, 16)}`;
  const databaseName = `smoke_db_${runId.slice(0, 8)}`;
  const databaseUser = `smoke_user_${runId.slice(0, 8)}`;
  const databasePassword = `smoke-${runId.slice(0, 12)} $literal 'quote' "double" trailing\\`;
  const passwordDotenv = JSON.stringify(databasePassword).replaceAll('$', '$$$$');
  const expectedCredentialsHash = createHash('sha256').update(databasePassword + '\0' + databasePassword).digest('hex');
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-allinone-smoke-')));
  const projectDir = path.join(workspace, 'deployment');
  const dataDir = path.join(projectDir, 'data');
  const mysqlDataDir = path.join(dataDir, 'mysql');
  const resourceMarkerPath = path.join(dataDir, 'resource', '.allinone-smoke-marker');
  const backupDir = path.join(workspace, 'backups');
  const chosenReport = path.resolve(reportPath || path.join(process.cwd(), `allinone-smoke-${runId.slice(0, 12)}.json`));
  const reportRelative = path.relative(workspace, chosenReport);
  if (reportRelative === '' || (!reportRelative.startsWith(`..${path.sep}`) && reportRelative !== '..' && !path.isAbsolute(reportRelative))) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw new Error('--report must be outside the temporary smoke project directory');
  }
  const entry = path.join(projectDir, 'deploy.mjs');
  const composeFile = path.join(projectDir, 'docker-compose.yml');
  const envFile = path.join(projectDir, '.env');
  const report = {
    image, projectName, status: 'running', startedAt: new Date().toISOString(),
    steps: [], checks: {}, errors: [],
  };
  let deploymentInitialized = false;
  let cleanupSucceeded = false;
  let containerId = '';
  let failure = null;
  const smokeEnv = { ...env };
  for (const key of ['DATAVISOOL_IMAGE', 'DATAVISOOL_PROJECT_NAME', 'APP_BIND_ADDRESS', 'APP_PORT',
    'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete smokeEnv[key];
  for (const key of Object.keys(smokeEnv)) {
    if (key.toUpperCase().startsWith('MYSQL_')) delete smokeEnv[key];
  }
  smokeEnv.DATAVISOOL_PROJECT_NAME = projectName;
  smokeEnv.COMPOSE_PROJECT_NAME = projectName;
  const progress = (step, detail = '') => {
    report.steps.push({ step, detail, at: new Date().toISOString() });
    persistReport(report, chosenReport);
    process.stdout.write(`[allinone-smoke] ${step}${detail ? `: ${detail}` : ''}\n`);
  };
  const probeHostDatabase = async port => {
    if (!hostDatabaseProbe) return;
    try {
      await hostDatabaseProbe({
        host: '127.0.0.1', port, database: databaseName, user: databaseUser, password: databasePassword,
      });
    } catch {
      throw new Error('host-side MySQL authentication probe failed');
    }
  };
  const docker = async args => command('docker', args, { env: smokeEnv, timeoutMs: 60_000 });
  const composeArgs = args => ['compose', '--project-name', projectName, '--project-directory', projectDir,
    '--env-file', envFile, '-f', composeFile, ...args];
  const compose = async (args, options = {}) => command('docker', composeArgs(args), {
    env: smokeEnv, timeoutMs: options.timeoutMs || 60_000, stream: options.stream || false,
  });
  const deploy = async (subcommand, args = [], options = {}) => command(process.execPath,
    [entry, subcommand, '--dir', projectDir, ...args], {
      env: smokeEnv, timeoutMs: options.timeoutMs || 60_000, stream: options.stream || false,
    });
  const inspectContainerState = async id => parseJson(
    await docker(['inspect', '--format', '{{json .State}}', id]), 'container state inspection');
  const inspectContainerPublishedPorts = async id => inspectPublishedPorts(parseJson(
    await docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', id]), 'container port bindings inspection'));
  const inspectDataMount = async id => {
    const mounts = parseJson(await docker(['inspect', '--format', '{{json .Mounts}}', id]), 'container mounts inspection');
    const mount = mounts.find(item => item.Destination === '/data');
    const observed = mount ? {
      type: mount.Type,
      source: mount.Source,
      destination: mount.Destination,
      rw: mount.RW,
      expectedSource: dataDir,
    } : { type: null, source: null, destination: '/data', rw: null, expectedSource: dataDir };
    report.checks.dataMounts ||= [];
    report.checks.dataMounts.push(observed);
    requireCondition(mount?.Type === 'bind'
      && path.resolve(mount.Source || '') === path.resolve(dataDir)
      && mount.RW === true,
    `container /data must be a writable bind mount from the temporary deployment data directory; observed ${JSON.stringify(observed)}`);
    return mount;
  };

  try {
    const osType = await docker(['info', '--format', '{{.OSType}}']);
    requireCondition(osType.trim() === 'linux', 'Docker must use Linux containers');
    const labels = parseJson(await docker(['image', 'inspect', '--format', '{{json .Config.Labels}}', image]), 'image labels') || {};
    requireCondition(labels['io.datavisool.deployment'] === 'allinone', 'selected image is not a Docker allinone deployment');
    requireCondition(Boolean(labels['io.datavisool.mysql.base']), 'selected image has no MySQL base label');
    const imageVolumes = parseJson(await docker(['image', 'inspect', '--format', '{{json .Config.Volumes}}', image]), 'image volumes') || {};
    const exposedPorts = parseJson(await docker(['image', 'inspect', '--format', '{{json .Config.ExposedPorts}}', image]), 'image exposed ports') || {};
    requireCondition(JSON.stringify(Object.keys(imageVolumes).sort()) === JSON.stringify(['/data']), 'image must declare only /data as a volume');
    requireCondition(JSON.stringify(Object.keys(exposedPorts).sort()) === JSON.stringify(['8080/tcp']), 'image must expose only 8080/tcp');
    report.checks.imageLabels = { deployment: labels['io.datavisool.deployment'], mysqlBase: labels['io.datavisool.mysql.base'] };
    report.checks.imageVolumes = Object.keys(imageVolumes);
    report.checks.exposedPorts = Object.keys(exposedPorts);
    progress('image preflight', 'deployment label, MySQL base, /data volume, and 8080/tcp verified');

    deploymentInitialized = true;
    await command(process.execPath, [path.join(scriptDir, 'deploy-allinone.mjs'), 'init', '--dir', projectDir, '--image', image], {
      env: smokeEnv, timeoutMs: 60_000,
    });
    setEnv(envFile, {
      DATAVISOOL_IMAGE: image,
      DATAVISOOL_PROJECT_NAME: projectName,
      APP_BIND_ADDRESS: '127.0.0.1',
      APP_PORT: '0',
      MYSQL_BIND_ADDRESS: '127.0.0.1',
      MYSQL_PORT: '0',
      DB_NAME: databaseName, DB_USER: databaseUser, DB_PASSWORD: passwordDotenv,
    });
    await deploy('check');
    const rendered = parseJson(await compose(['config', '--format', 'json']), 'Compose configuration');
    const app = rendered.services?.app;
    requireCondition(app?.environment?.DB_NAME === databaseName && app?.environment?.DB_USER === databaseUser
      && app?.environment?.DB_PASSWORD?.replaceAll('$$', '$') === databasePassword, 'Compose did not preserve supplied database credentials');
    const configuredPorts = app?.ports || [];
    const configuredAppPorts = configuredPorts.filter(port => Number(port.target) === 8080);
    const configuredMysqlPorts = configuredPorts.filter(port => Number(port.target) === 3306);
    requireCondition(configuredPorts.length === 2 && configuredAppPorts.length === 1 && configuredMysqlPorts.length === 1,
      `Compose must map exactly TCP 8080 and 3306; observed ${JSON.stringify(configuredPorts)}`);
    requireCondition(configuredPorts.every(port => (port.protocol || 'tcp') === 'tcp')
      && String(configuredAppPorts[0].published) === '0' && configuredAppPorts[0].host_ip === '127.0.0.1'
      && String(configuredMysqlPorts[0].published) === '0' && configuredMysqlPorts[0].host_ip === '127.0.0.1',
    `Compose must map both ephemeral smoke ports to 127.0.0.1; observed ${JSON.stringify(configuredPorts)}`);
    requireCondition(app?.environment?.DATAVISOOL_MYSQL_HOST_PORT_ENABLED === '1',
      'Compose must enable DATAVISOOL_MYSQL_HOST_PORT_ENABLED=1 for the host MySQL compatibility account');
    const dataMount = app?.volumes?.find(volume => volume.target === '/data');
    requireCondition(Object.keys(rendered.services || {}).join(',') === 'app', 'Compose must define only app');
    requireCondition(dataMount?.type === 'bind'
      && path.resolve(dataMount.source || '') === path.resolve(dataDir)
      && dataMount.read_only !== true,
    'Compose must attach the writable deployment data directory at /data');
    report.checks.projectName = projectName;
    report.checks.dataDirectory = dataDir;
    report.checks.configuredHostPorts = { app: 0, mysql: 0, bindAddress: '127.0.0.1' };
    progress('init and check', 'temporary project and its host data directory are isolated');

    progress('first start', 'waiting for container health and application migration');
    await deploy('up', ['--wait-timeout', '600'], { timeoutMs: 660_000, stream: true });
    containerId = (await compose(['ps', '-q', 'app'])).trim().split(/\s+/)[0] || '';
    requireCondition(Boolean(containerId), 'Compose did not return the running app container');
    const health = await docker(['inspect', '--format', '{{.State.Health.Status}}', containerId]);
    requireCondition(health.trim() === 'healthy', `container health is ${health || 'unknown'}`);
    await inspectDataMount(containerId);
    const firstPublishedPorts = await inspectContainerPublishedPorts(containerId);
    report.checks.containerPortBindings ||= [];
    report.checks.containerPortBindings.push(firstPublishedPorts);
    const firstMysqlGreeting = await readMysqlServerGreeting(firstPublishedPorts.mysql.port);
    report.checks.mysqlHostTcp = { host: firstPublishedPorts.mysql.host, port: firstPublishedPorts.mysql.port, serverVersion: firstMysqlGreeting };
    await probeHostDatabase(firstPublishedPorts.mysql.port);
    requireCondition(fs.existsSync(mysqlDataDir) && fs.statSync(mysqlDataDir).isDirectory(),
      'host data/mysql directory was not populated by the container');
    const baseUrl = `http://${firstPublishedPorts.app.host}:${firstPublishedPorts.app.port}`;
    report.checks.publishedPort = firstPublishedPorts.app.port;
    const home = await requestOk(`${baseUrl}/`, 'home page');
    const publicKey = await requestOk(`${baseUrl}/api/security/getEncryptKey`, 'public key endpoint');
    report.checks.home = home;
    report.checks.publicKey = publicKey;
    const marker = runId.slice(0, 32);
    const firstProbe = parseJson(await docker(['exec', containerId, 'python3', '-c', databaseProbe('seed', marker), 'seed', marker]), 'database probe');
    requireCondition(firstProbe.migration_rows > 0, 'migration_history is empty');
    requireCondition(firstProbe.database_marker_rows === 1, 'smoke database marker was not written');
    requireCondition(firstProbe.resource_marker === marker, 'smoke resource marker was not written');
    requireCondition(fs.readFileSync(resourceMarkerPath, 'utf8') === marker,
      'smoke resource marker is not visible in the host data directory');
    requireCondition(firstProbe.credentials_sha256 === expectedCredentialsHash, 'database was not initialized with the supplied password');
    requireCondition(firstProbe.root_login_ok === true, 'root could not log in with the supplied password for troubleshooting');
    report.checks.initialDatabase = {
      migrationRows: firstProbe.migration_rows,
      markerRows: firstProbe.database_marker_rows,
      credentialsSha256: firstProbe.credentials_sha256,
    };
    progress('first start verified', 'health, home, public-key API, migration, and database/resource writes passed');

    await deploy('stop');
    const state = await inspectContainerState(containerId);
    requireCondition(state.Status === 'exited' && state.ExitCode === 0,
      `normal stop exited with status ${state.Status}, code ${state.ExitCode}`);
    report.checks.normalStop = { status: state.Status, exitCode: state.ExitCode };
    progress('normal stop', 'container exited with code 0');

    await deploy('backup', ['--backup-dir', backupDir], { timeoutMs: 120_000 });
    const backupNames = fs.readdirSync(backupDir);
    requireCondition(backupNames.length === 1, 'expected exactly one cold backup');
    const backupPath = path.join(backupDir, backupNames[0]);
    requireCondition(fs.existsSync(path.join(backupPath, 'COMPLETE'))
      && fs.existsSync(path.join(backupPath, 'data.tar.gz'))
      && fs.existsSync(path.join(backupPath, 'config.tar.gz')),
    'cold backup is incomplete; clean-shutdown marker or backup archive check failed');
    const dataArchiveEntries = await command('tar', ['-tzf', path.join(backupPath, 'data.tar.gz')]);
    requireCondition(dataArchiveEntries.includes('config/database.json')
      && dataArchiveEntries.includes('resource/.allinone-smoke-marker')
      && /mysql\//.test(dataArchiveEntries), 'cold data archive is missing database credentials or resource data');
    const configArchiveEntries = await command('tar', ['-tzf', path.join(backupPath, 'config.tar.gz')]);
    requireCondition(configArchiveEntries.includes('.env') && configArchiveEntries.includes('docker-compose.yml'),
      'cold configuration archive is missing deployment settings');
    report.checks.backup = { complete: true, files: ['data.tar.gz', 'config.tar.gz', 'image.txt', 'COMPLETE'] };
    progress('cold backup', 'normal-shutdown marker and complete data/config archives verified');

    await deploy('down');
    const remaining = (await compose(['ps', '--all', '-q', 'app'])).trim();
    requireCondition(!remaining, 'deploy down did not remove the container');
    requireCondition(fs.existsSync(mysqlDataDir) && fs.statSync(mysqlDataDir).isDirectory(),
      'host data/mysql directory did not survive compose down');
    requireCondition(fs.readFileSync(resourceMarkerPath, 'utf8') === marker,
      'host resource marker did not survive compose down');
    progress('down retained host data', 'container removed while deployment data files remain');

    progress('second start', 'restarting the same Compose project and host data directory');
    await deploy('up', ['--wait-timeout', '600'], { timeoutMs: 660_000, stream: true });
    containerId = (await compose(['ps', '-q', 'app'])).trim().split(/\s+/)[0] || '';
    requireCondition(Boolean(containerId), 'Compose did not return the restarted app container');
    const secondHealth = await docker(['inspect', '--format', '{{.State.Health.Status}}', containerId]);
    requireCondition(secondHealth.trim() === 'healthy', `restarted container health is ${secondHealth || 'unknown'}`);
    await inspectDataMount(containerId);
    const secondPublishedPorts = await inspectContainerPublishedPorts(containerId);
    report.checks.containerPortBindings.push(secondPublishedPorts);
    const secondMysqlGreeting = await readMysqlServerGreeting(secondPublishedPorts.mysql.port);
    report.checks.mysqlHostTcpAfterRestart = {
      host: secondPublishedPorts.mysql.host,
      port: secondPublishedPorts.mysql.port,
      serverVersion: secondMysqlGreeting,
    };
    await probeHostDatabase(secondPublishedPorts.mysql.port);
    requireCondition(fs.existsSync(mysqlDataDir) && fs.existsSync(resourceMarkerPath),
      'host database or resource data disappeared after restart');
    const secondProbe = parseJson(await docker(['exec', containerId, 'python3', '-c', databaseProbe('verify', marker), 'verify', marker]), 'restored database probe');
    requireCondition(secondProbe.credentials_sha256 === firstProbe.credentials_sha256, 'database credential hash changed across down/up');
    requireCondition(secondProbe.migration_rows === firstProbe.migration_rows, 'migration history changed across down/up');
    requireCondition(secondProbe.database_marker_rows === 1, 'database marker did not persist across down/up');
    requireCondition(secondProbe.resource_marker === marker, 'resource marker did not persist across down/up');
    report.checks.restoredDatabase = {
      migrationRows: secondProbe.migration_rows,
      markerRows: secondProbe.database_marker_rows,
      credentialsSha256: secondProbe.credentials_sha256,
      resourceMarkerPreserved: secondProbe.resource_marker === marker,
    };
    report.status = 'passed';
    progress('persistence verified', 'database marker, resource marker, migrations, and credential hash survived down/up');
  } catch (error) {
    failure = error;
    report.status = 'failed';
    const message = safeText(error?.stack || error?.message || error);
    report.errors.push(message);
    if (deploymentInitialized && fs.existsSync(composeFile)) {
      try {
        const logs = await compose(['logs', '--tail', '100', 'app']);
        const redacted = logs.split(/\r?\n/).filter(line => !/database\.json|root_password|app_password|credentials/i.test(line));
        const tail = redacted.slice(-100).join('\n');
        report.failureLogs = tail;
        if (tail) process.stderr.write(`[allinone-smoke] sanitized container logs (tail 100):\n${safeText(tail)}\n`);
      } catch (logsError) {
        report.errors.push(`could not collect container logs: ${safeText(logsError.message)}`);
      }
    }
    progress('failure', safeText(error?.message || error));
  } finally {
    if (deploymentInitialized && fs.existsSync(composeFile) && fs.existsSync(envFile)) {
      try {
        await compose(['down', '--remove-orphans'], { timeoutMs: 60_000 });
        report.cleanup = 'removed temporary Compose project; temporary host data will be deleted';
        cleanupSucceeded = true;
      } catch (cleanupError) {
        report.cleanup = `failed: ${safeText(cleanupError.message)}`;
        if (!failure) failure = cleanupError;
        report.errors.push(`cleanup failed: ${safeText(cleanupError.message)}`);
        report.status = 'failed';
      }
    } else {
      report.cleanup = 'no Compose project was created';
      cleanupSucceeded = true;
    }
    if (cleanupSucceeded) {
      try { fs.rmSync(workspace, { recursive: true, force: true }); }
      catch (cleanupError) {
        if (!failure) failure = cleanupError;
        report.errors.push(`temporary directory cleanup failed: ${safeText(cleanupError.message)}`);
        report.status = 'failed';
      }
    } else {
      report.cleanupWorkspace = workspace;
    }
    report.finishedAt = new Date().toISOString();
    report.reportPath = chosenReport;
    try { persistReport(report, chosenReport); }
    catch (reportError) {
      if (!failure) failure = reportError;
      report.status = 'failed';
      process.stderr.write(`[allinone-smoke] could not persist report: ${safeText(reportError.message)}\n`);
    }
  }
  if (failure) throw new Error(`All-in-one smoke test failed. Report: ${chosenReport}\n${safeText(failure.message || failure)}`);
  process.stdout.write(`[allinone-smoke] PASS; report: ${chosenReport}\n`);
  return report;
}

function parseCli(args) {
  const options = { image: '', report: '' };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--help' || args[index] === '-h') return { help: true };
    const key = args[index] === '--image' ? 'image' : args[index] === '--report' ? 'report' : '';
    if (!key) throw new Error(`未知参数：${args[index]}`);
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${args[index]} 缺少参数`);
    options[key] = args[++index];
  }
  if (!options.image) throw new Error('必须指定 --image IMAGE:TAG');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCli(process.argv.slice(2));
    if (options.help) process.stdout.write(`${SMOKE_HELP}\n`);
    else await runAllInOneSmoke(options.image, { reportPath: options.report || undefined });
  } catch (error) {
    process.stderr.write(`[allinone-smoke] ERROR: ${safeText(error.message || error)}\n`);
    process.exitCode = 1;
  }
}
