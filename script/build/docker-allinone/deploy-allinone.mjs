/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// Installed deploy.mjs keeps its shared library inside the deployment directory.
const IS_INSTALLED_ENTRY = path.basename(fileURLToPath(import.meta.url)) === 'deploy.mjs';
const { copyMissing, isWithin, main, parseArgs, requireDocker, run, setEnv,
  validateImage, writePrivate } = await import(
  IS_INSTALLED_ENTRY ? './lib/common.mjs' : '../lib/common.mjs');

const MARKER = '.datavisool-deployment';
const IDENTITY = 'docker-allinone\n';
const DATA_MIGRATION_MESSAGE = '检测到旧版 Docker 命名卷挂载 /data。为避免切换后启动空数据库，请先将旧卷中的 /data 数据迁移到部署目录 data/，再使用新的 bind 挂载配置启动。';
const HELP = `用法：node script/build/docker-allinone/deploy-allinone.mjs COMMAND [选项]
  init       初始化 Docker allinone 的单容器部署目录，不覆盖已有配置
  check      校验单容器与宿主机 data/ 挂载配置，不启动服务
  up         启动一个容器，自动初始化 MySQL 后启动应用
  upgrade    切换到本地 Docker allinone；应用与 MySQL 会一起重启，请先备份
  stop       停止整个容器，依次关闭应用和 MySQL
  down       删除容器与网络，保留全部持久化数据
  status     查看容器状态
  logs       跟踪最近 200 行日志
  backup     容器正常停止后，冷备数据库、凭据与应用资源
选项：
  --dir DIR              Windows 默认 %ProgramData%\\datavisool-web-allinone
                         Linux/macOS 默认 /usr/app/datavisool-web-allinone
  --image IMAGE:TAG      init/up/upgrade 使用的本地 Docker allinone
  --wait-timeout SECONDS 启动等待时间，默认 600 秒
  --backup-dir DIR       备份父目录，必须位于部署目录之外
首次启动前请在 .env 中填写 DB_NAME、DB_USER、DB_PASSWORD，MySQL 按这些值初始化。
部署目录内安装 deploy.mjs；后续可直接运行该入口。`;

function assertIdentity(dir) {
  const file = path.join(dir, MARKER);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== IDENTITY) {
    throw new Error('该目录不是 Docker allinone 的单容器部署目录；请用独立目录执行 init，不能混用 Docker app 或旧双容器方案');
  }
}

function canonicalDataDirectory(dataDir) {
  const stats = fs.lstatSync(dataDir);
  if (stats.isSymbolicLink()) throw new Error('宿主机 data/ 不能是符号链接；请恢复真实目录后再继续');
  if (!stats.isDirectory()) throw new Error('宿主机 data/ 路径不是目录；请恢复数据目录后再继续');
  return fs.realpathSync(dataDir);
}

function realPathOrNull(target) {
  try { return fs.realpathSync(target); } catch { return null; }
}

function numericPort(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value);
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port <= 65535 ? port : null;
}

function validatePortMappings(service) {
  const ports = Array.isArray(service.ports) ? service.ports : [];
  const appPorts = ports.filter(port => Number(port.target) === 8080);
  const mysqlPorts = ports.filter(port => Number(port.target) === 3306);
  if (ports.length !== 2 || appPorts.length !== 1 || mysqlPorts.length !== 1
    || ports.some(port => (port.protocol || 'tcp') !== 'tcp')) {
    throw new Error('Docker allinone 必须恰好映射容器 TCP 8080 和 TCP 3306，且不能添加其他端口映射');
  }
  if (numericPort(mysqlPorts[0].published) === null) {
    throw new Error('MYSQL_PORT 必须是 0–65535 之间的单个整数端口');
  }
  if (numericPort(appPorts[0].published) === null) {
    throw new Error('APP_PORT 必须是 0–65535 之间的单个整数端口');
  }
}

export function deploy(args, { execute = run, scriptDir = SCRIPT_DIR, log = console.log,
  env = process.env } = {}) {
  const [command = 'help', ...rest] = args;
  const defaultDir = process.platform === 'win32'
    ? path.win32.join(env.ProgramData || 'C:\\ProgramData', 'datavisool-web-allinone') : '/usr/app/datavisool-web-allinone';
  const options = parseArgs(rest, {
    dir: IS_INSTALLED_ENTRY ? scriptDir : defaultDir,
    image: '', 'wait-timeout': '600', 'backup-dir': '',
  });
  if (options.help || ['help', '-h', '--help'].includes(command)) { log(HELP); return; }
  if (!['init', 'check', 'up', 'upgrade', 'stop', 'down', 'status', 'logs', 'backup'].includes(command)) throw new Error(`未知命令：${command}`);
  if (!/^[1-9][0-9]*$/.test(options['wait-timeout'])) throw new Error('等待时间必须是正整数');
  if (options.image) validateImage(options.image);
  let dir = path.resolve(options.dir);
  if (command === 'init') {
    const assets = scriptDir;
    if (!fs.existsSync(path.join(assets, '.env.example'))) throw new Error('请从源码或发布包的 docker-allinone 目录运行 init');
    const imageFile = path.join(assets, 'IMAGE');
    const configSource = path.join(assets, fs.existsSync(imageFile) ? '../config/application.yml' : 'config/application.yml');
    if (!fs.existsSync(configSource) || !fs.statSync(configSource).isFile()) throw new Error(`缺少应用配置文件：${configSource}`);
    const manifest = path.join(scriptDir, '../../../package.json');
    const image = options.image || (fs.existsSync(imageFile) ? fs.readFileSync(imageFile, 'utf8').trim() : '')
      || (fs.existsSync(manifest) ? `datavisool-web-allinone:${JSON.parse(fs.readFileSync(manifest, 'utf8')).version}` : '');
    validateImage(image);
    if ([MARKER, '.env', 'docker-compose.yml', 'deploy.mjs'].some(name => fs.existsSync(path.join(dir, name)))) assertIdentity(dir);
    fs.mkdirSync(dir, { recursive: true });
    dir = fs.realpathSync(dir);
    const markerFile = path.join(dir, MARKER);
    const hasIdentity = fs.existsSync(markerFile);
    const dataDir = path.join(dir, 'data');
    try {
      canonicalDataDirectory(dataDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (hasIdentity) throw new Error('已初始化部署的 data/ 目录丢失；为避免创建空数据库，请先恢复原数据目录');
      fs.mkdirSync(dataDir);
      canonicalDataDirectory(dataDir);
    }
    if (!hasIdentity) writePrivate(markerFile, IDENTITY);
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    copyMissing(path.join(assets, 'docker-compose.yml'), path.join(dir, 'docker-compose.yml'), 0o644);
    copyMissing(configSource, path.join(dir, 'config/application.yml'), 0o644);
    const envFile = path.join(dir, '.env');
    if (!fs.existsSync(envFile)) {
      copyMissing(path.join(assets, '.env.example'), envFile, 0o600);
      setEnv(envFile, { DATAVISOOL_IMAGE: image });
    }
    copyMissing(path.join(scriptDir, 'deploy-allinone.mjs'), path.join(dir, 'deploy.mjs'), 0o644);
    copyMissing(path.join(scriptDir, '../lib/common.mjs'), path.join(dir, 'lib/common.mjs'), 0o644);
    log(`已初始化：${dir}（已有文件未覆盖）\n请先在 .env 中填写 DB_NAME、DB_USER、DB_PASSWORD，再执行 node "${path.join(dir, 'deploy.mjs')}" up。`);
    return;
  }

  if (!fs.existsSync(dir)) throw new Error('部署目录不存在，请先 init');
  dir = fs.realpathSync(dir);
  assertIdentity(dir);
  for (const file of ['.env', 'docker-compose.yml']) {
    if (!fs.existsSync(path.join(dir, file))) throw new Error(`缺少文件：${file}；请先 init`);
    if (!fs.statSync(path.join(dir, file)).isFile()) throw new Error(`文件路径不是普通文件：${file}`);
  }
  const childEnv = { ...env };
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) delete childEnv[key];
  for (const key of Object.keys(childEnv)) {
    if (key.toUpperCase().startsWith('MYSQL_')) delete childEnv[key];
  }
  execute('docker', ['compose', 'version'], { capture: true, env: childEnv });
  const compose = (parameters, settings = {}) => execute('docker', [
    'compose', '--project-directory', dir, '--env-file', path.join(dir, '.env'),
    '-f', path.join(dir, 'docker-compose.yml'), ...parameters,
  ], { ...settings, env: childEnv });
  const actions = { stop: ['stop', 'app'], down: ['down'], status: ['ps'], logs: ['logs', '--follow', '--tail', '200', 'app'] };
  if (actions[command]) { compose(actions[command]); return; }

  const needsApplicationConfig = ['check', 'up', 'upgrade', 'backup'].includes(command);
  const applicationConfig = path.join(dir, 'config/application.yml');
  if (needsApplicationConfig && (!fs.existsSync(applicationConfig) || !fs.statSync(applicationConfig).isFile())) {
    throw new Error('缺少应用配置文件：config/application.yml；请先 init 或恢复该文件');
  }
  const config = JSON.parse(compose(['config', '--format', 'json'], { capture: true }));
  if (Object.keys(config.services || {}).join(',') !== 'app') throw new Error('Docker allinone 只能包含一个 app 服务，MySQL 在该容器内部运行');
  const service = config.services.app;
  validateImage(service.image);
  const connection = service.environment || {};
  for (const key of ['DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (typeof connection[key] !== 'string' || !connection[key] || /[\r\n]/.test(connection[key])) {
      throw new Error(`请在 .env 中填写非空单行数据库配置 ${key}；首次数据库不会自动生成账号密码`);
    }
  }
  if (connection.DATAVISOOL_MYSQL_HOST_PORT_ENABLED !== '1') {
    throw new Error('Docker allinone 必须启用本机 MySQL 主机端口兼容设置 DATAVISOOL_MYSQL_HOST_PORT_ENABLED=1');
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(connection.DB_NAME)) throw new Error('数据库名称只允许 1–64 位字母、数字、下划线或短横线');
  if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(connection.DB_USER)) throw new Error('数据库用户名只允许 1–32 位字母、数字、下划线、点或短横线');
  validatePortMappings(service);
  const dataMounts = service.volumes?.filter(volume => volume.target === '/data') || [];
  const dataMount = dataMounts[0];
  if (dataMount?.type === 'volume') throw new Error(DATA_MIGRATION_MESSAGE);
  const dataDir = path.join(dir, 'data');
  let canonicalDataDir;
  try { canonicalDataDir = canonicalDataDirectory(dataDir); } catch { canonicalDataDir = null; }
  if (dataMounts.length !== 1 || dataMount?.type !== 'bind'
    || path.resolve(dir, dataMount.source || '') !== dataDir || dataMount.read_only === true
    || !canonicalDataDir) {
    throw new Error('Docker allinone 必须将部署目录 data/ 以可写 bind 挂载到 /data；请先 init 并检查 docker-compose.yml');
  }
  const applicationMount = service.volumes?.find(volume => volume.target === '/config/application.yml');
  if (needsApplicationConfig && (applicationMount?.type !== 'bind' || applicationMount.read_only !== true
    || path.resolve(dir, applicationMount.source || '') !== applicationConfig)) {
    throw new Error('Docker allinone 必须将部署目录中的 config/application.yml 以只读 bind 挂载到 /config/application.yml');
  }
  if (service.user && !['0', '0:0', 'root', 'root:root'].includes(service.user)) throw new Error('Docker allinone 由入口管理进程权限，请勿覆盖容器 user');
  if (command === 'check') { log('单容器配置校验通过；尚未启动容器。数据库会自动初始化。'); return; }
  requireDocker(execute, childEnv);
  const imageLabels = image => {
    const labels = JSON.parse(execute('docker', ['image', 'inspect', '--format', '{{json .Config.Labels}}', image], { capture: true, env: childEnv })) || {};
    if (labels['io.datavisool.deployment'] !== 'allinone' || !labels['io.datavisool.mysql.base']) throw new Error('指定镜像不是包含应用和 MySQL 的 Docker allinone');
    return labels;
  };
  const currentContainer = () => {
    const ids = compose(['ps', '--all', '--quiet', 'app'], { capture: true }).trim().split(/\s+/).filter(Boolean);
    if (ids.length > 1) throw new Error('发现多个 app 容器，请先核对部署目录和 Compose 项目名称');
    return ids.length ? JSON.parse(execute('docker', ['inspect', '--format', '{{json .}}', ids[0]], { capture: true, env: childEnv })) : null;
  };
  if (command === 'up' || command === 'upgrade') {
    if (command === 'upgrade' && !options.image) throw new Error('upgrade 必须指定 --image IMAGE:TAG');
    const image = options.image || service.image;
    const labels = imageLabels(image);
    const current = currentContainer();
    const currentDataMounts = current?.Mounts?.filter(mount => mount.Destination === '/data') || [];
    if (currentDataMounts.some(mount => mount.Type === 'volume')) {
      throw new Error(`${DATA_MIGRATION_MESSAGE}\n当前容器仍挂载命名卷；迁移完成前不会启动或切换到 data/。`);
    }
    const currentDataMount = currentDataMounts[0];
    if (current && (currentDataMounts.length !== 1 || currentDataMount?.Type !== 'bind'
      || currentDataMount.RW !== true || realPathOrNull(currentDataMount.Source) !== canonicalDataDir)) {
      throw new Error('当前容器的 /data 必须是指向此部署目录 data/ 的可写 bind；拒绝切换到其他目录或空数据库。');
    }
    const previous = current?.Config.Image || service.image;
    if (current || command === 'upgrade') {
      const previousLabels = imageLabels(current?.Image || service.image);
      if (labels['io.datavisool.mysql.base'] !== previousLabels['io.datavisool.mysql.base']) throw new Error('MySQL 基础版本不同，不自动升级或回退数据库；请先规划数据迁移');
    }
    if (command === 'upgrade') log('升级 Docker allinone 会重启应用和 MySQL，并执行应用数据库迁移，请确认已备份。');
    if (image !== service.image) {
      writePrivate(path.join(dir, 'previous-image.txt'), `${previous}\n`);
      setEnv(path.join(dir, '.env'), { DATAVISOOL_IMAGE: image });
    }
    childEnv.DATAVISOOL_IMAGE = image;
    try { compose(['up', '--detach', '--wait', '--wait-timeout', options['wait-timeout']]); }
    catch (error) { throw new Error(`容器未通过健康检查；保留容器和数据供 logs 排查，不自动回滚数据库。\n${error.message}`); }
    compose(['ps']);
    return;
  }
  if (!options['backup-dir']) throw new Error('backup 需要 --backup-dir');
  const current = currentContainer();
  if (!current || current.State?.Status !== 'exited' || current.State.ExitCode !== 0) throw new Error('请先正常 stop 容器再备份；未初始化、运行中或异常退出的容器不能冷备');
  const mounted = current.Mounts?.find(mount => mount.Destination === '/data');
  if (mounted?.Type !== 'bind' || path.resolve(mounted.Source || '') !== dataDir) throw new Error('当前部署目录 data/ 与已停止容器的 /data bind 挂载不一致，拒绝备份');
  const labels = imageLabels(current.Image);
  execute('tar', ['--version'], { capture: true });
  let backupDir = path.resolve(options['backup-dir']);
  if (isWithin(dir, backupDir)) throw new Error('备份目录不能位于部署目录内部');
  fs.mkdirSync(backupDir, { recursive: true });
  backupDir = fs.realpathSync(backupDir);
  if (isWithin(dir, backupDir)) throw new Error('备份目录不能位于部署目录内部');
  const backup = fs.mkdtempSync(path.join(backupDir, `datavisool-allinone-${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  if (process.platform !== 'win32') fs.chmodSync(backup, 0o700);
  childEnv.DATAVISOOL_IMAGE = current.Image;
  const archive = fs.openSync(path.join(backup, 'data.tar.gz'), 'wx', 0o600);
  try {
    // The helper starts tar, not the application or MySQL, against the stopped data directory.
    compose(['run', '--rm', '--no-deps', '-T', '--entrypoint', '/bin/sh', 'app', '-c',
      'test -f /data/config/clean-shutdown && test -d /data/mysql/mysql && exec tar -czf - -C /data mysql resource config'], { stdoutFd: archive });
  } catch (error) { throw new Error(`冷备失败；${backup} 没有 COMPLETE 标记，不可用于恢复。\n${error.message}`); }
  finally { fs.closeSync(archive); }
  execute('tar', ['-czf', path.join(backup, 'config.tar.gz'), '-C', dir, MARKER, '.env', 'docker-compose.yml', 'config']);
  writePrivate(path.join(backup, 'image.txt'), `reference=${current.Config.Image}\nid=${current.Image}\nmysql=${labels['io.datavisool.mysql.base']}\n`);
  writePrivate(path.join(backup, 'COMPLETE'), `created=${new Date().toISOString()}\n`);
  log(`备份完成：${backup}；应用与 MySQL 仍保持停止。请使用记录中的同版本镜像恢复。`);
}

main(import.meta.url, deploy);
