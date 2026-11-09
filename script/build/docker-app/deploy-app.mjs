/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// Installed deploy.mjs keeps its shared library inside the deployment directory.
const IS_INSTALLED_ENTRY = path.basename(fileURLToPath(import.meta.url)) === 'deploy.mjs';
const { containerOwner, copyMissing, defaultDeployDir, isWithin, main, parseArgs,
  requireDocker, run, setEnv, validateImage, writePrivate } = await import(
  IS_INSTALLED_ENTRY ? './lib/common.mjs' : '../lib/common.mjs');

const HELP = `用法：node script/build/docker-app/deploy-app.mjs COMMAND [选项]
  init       初始化目录与模板；已有文件不覆盖，不连接数据库
  check      校验 Compose 配置和宿主机挂载目录
  up         启动应用并等待健康检查通过
  upgrade    切换到 --image 指定的本地镜像；请先备份
  stop       停止应用，保留容器及数据
  down       删除应用容器与 Compose 网络，保留全部宿主机数据
  status     查看容器状态
  logs       跟踪最近 200 行日志
  backup     应用停止后，备份宿主机数据库、配置和资源
选项：
  --dir DIR              部署目录，Windows 默认 %ProgramData%\\datavisool-web-app
                         Linux/macOS 默认 /usr/app/datavisool-web-app
  --image IMAGE:TAG      init/upgrade 使用的镜像；up 可指定镜像
  --wait-timeout SECONDS 启动等待时间，默认 300 秒
  --backup-dir DIR       备份输出父目录，必须位于部署目录之外
  --mysql-config FILE    宿主机 MySQL 客户端配置文件
  --database NAME        备份数据库名，须与 DB_NAME 保持一致
部署目录内会安装 deploy.mjs；随后执行 node /部署目录/deploy.mjs status。
Windows 使用 Linux 容器，无需 Bash、Git Bash 或 WSL 终端。`;

export function deploy(args, { execute = run, scriptDir = SCRIPT_DIR, log = console.log,
  env = process.env } = {}) {
  const [command = 'help', ...rest] = args;
  const options = parseArgs(rest, {
    dir: IS_INSTALLED_ENTRY ? scriptDir : defaultDeployDir(),
    image: '', 'wait-timeout': '300', 'backup-dir': '', 'mysql-config': '', database: '',
  });
  if (options.help || ['help', '-h', '--help'].includes(command)) { log(HELP); return; }
  if (!['init', 'check', 'up', 'upgrade', 'stop', 'down', 'status', 'logs', 'backup'].includes(command)) {
    throw new Error(`未知命令：${command}`);
  }
  if (!/^[1-9][0-9]*$/.test(options['wait-timeout'])) throw new Error('等待时间必须是正整数');
  if (options.image) validateImage(options.image);
  let dir = path.resolve(options.dir);
  const assets = scriptDir;
  if (command === 'init') {
    if (!fs.existsSync(path.join(assets, '.env.example'))) throw new Error('请从源码或发布包的 docker-app 目录运行 init');
    const configSource = path.join(assets, fs.existsSync(path.join(assets, 'IMAGE')) ? '../config/application.yml' : 'config/application.yml');
    if (!fs.existsSync(configSource) || !fs.statSync(configSource).isFile()) throw new Error(`缺少应用配置文件：${configSource}`);
    let image = options.image;
    if (!image && fs.existsSync(path.join(assets, 'IMAGE'))) image = fs.readFileSync(path.join(assets, 'IMAGE'), 'utf8').trim();
    if (!image && fs.existsSync(path.join(scriptDir, '../../../package.json'))) {
      image = `datavisool-web:${JSON.parse(fs.readFileSync(path.join(scriptDir, '../../../package.json'), 'utf8')).version}`;
    }
    validateImage(image);
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    dir = fs.realpathSync(dir);
    const { uid, gid } = containerOwner();
    for (const name of ['resource', 'logs']) {
      const directory = path.join(dir, name);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
        if (process.platform !== 'win32' && process.getuid() === 0) fs.chownSync(directory, uid, gid);
      }
    }
    copyMissing(path.join(assets, 'docker-compose.yml'), path.join(dir, 'docker-compose.yml'), 0o644);
    copyMissing(configSource, path.join(dir, 'config/application.yml'), 0o644);
    const envFile = path.join(dir, '.env');
    if (!fs.existsSync(envFile)) {
      copyMissing(path.join(assets, '.env.example'), envFile, 0o600);
      setEnv(envFile, { DATAVISOOL_IMAGE: image, APP_UID: uid, APP_GID: gid });
    }
    copyMissing(path.join(scriptDir, 'deploy-app.mjs'), path.join(dir, 'deploy.mjs'), 0o644);
    copyMissing(path.join(scriptDir, '../lib/common.mjs'), path.join(dir, 'lib/common.mjs'), 0o644);
    log(`已初始化：${dir}（已有文件未覆盖）\n下一步：编辑 .env 的数据库信息，再执行 node "${path.join(dir, 'deploy.mjs')}" check / up。`);
    return;
  }

  if (!fs.existsSync(dir)) throw new Error('部署目录不存在，请先 init');
  dir = fs.realpathSync(dir);
  for (const file of ['.env', 'docker-compose.yml', 'config/application.yml']) {
    if (!fs.existsSync(path.join(dir, file))) throw new Error(`缺少文件：${path.join(dir, file)}；请先 init`);
  }
  const childEnv = { ...env };
  execute('docker', ['compose', 'version'], { capture: true, env: childEnv });
  const compose = (parameters, capture = false) => execute('docker', [
    'compose', '--project-directory', dir, '--env-file', path.join(dir, '.env'),
    '-f', path.join(dir, 'docker-compose.yml'), ...parameters,
  ], { capture, env: childEnv });
  const validate = () => {
    for (const name of ['resource', 'logs']) {
      if (!fs.existsSync(path.join(dir, name)) || !fs.statSync(path.join(dir, name)).isDirectory()) throw new Error(`缺少宿主机目录：${name}`);
    }
    compose(['config', '--quiet']);
    if (compose(['config', '--services'], true).trim() !== 'app') throw new Error('方案一只能包含 app 服务');
  };
  if (command === 'check') {
    validate();
    log('配置校验通过；尚未连接数据库或启动容器。启动时会检查容器内目录权限。');
    return;
  }
  requireDocker(execute, childEnv);
  if (command === 'up' || command === 'upgrade') {
    validate();
    const previous = compose(['config', '--images'], true).trim();
    if (command === 'upgrade') {
      if (!options.image) throw new Error('upgrade 必须指定 --image IMAGE:TAG');
      log('升级会执行应用内数据库迁移，请确认已备份数据库和 resource 目录。');
    }
    const image = options.image || previous;
    validateImage(image);
    execute('docker', ['image', 'inspect', image], { capture: true, env: childEnv });
    if (image !== previous) {
      writePrivate(path.join(dir, 'previous-image.txt'), `${previous}\n`);
      setEnv(path.join(dir, '.env'), { DATAVISOOL_IMAGE: image });
    }
    childEnv.DATAVISOOL_IMAGE = image;
    try { compose(['up', '--detach', '--wait', '--wait-timeout', options['wait-timeout']]); }
    catch (error) { throw new Error(`应用未通过健康检查；保留容器供 logs 排查，数据库不会自动回滚。\n${error.message}`); }
    compose(['ps']);
    return;
  }
  const actions = { stop: ['stop'], down: ['down'], status: ['ps'], logs: ['logs', '--follow', '--tail', '200', 'app'] };
  if (actions[command]) { compose(actions[command]); return; }

  validate();
  if (!options['backup-dir'] || !options['mysql-config'] || !options.database) throw new Error('backup 需要 --backup-dir、--mysql-config、--database');
  if (!/^[A-Za-z0-9_]+$/.test(options.database)) throw new Error('数据库名只能包含字母、数字和下划线');
  const mysqlConfig = path.resolve(options['mysql-config']);
  if (!fs.existsSync(mysqlConfig)) throw new Error('MySQL 客户端配置文件不存在');
  if (compose(['ps', '--status', 'running', '--quiet', 'app'], true).trim()) throw new Error('请先 stop 应用，再备份数据库与资源，以保持两者一致');
  execute('tar', ['--version'], { capture: true });
  execute('mysqldump', ['--version'], { capture: true });
  let backupDir = path.resolve(options['backup-dir']);
  if (isWithin(dir, backupDir)) throw new Error('备份目录不能位于部署目录内部');
  fs.mkdirSync(backupDir, { recursive: true });
  backupDir = fs.realpathSync(backupDir);
  if (isWithin(dir, backupDir)) throw new Error('备份目录不能位于部署目录内部');
  const backup = fs.mkdtempSync(path.join(backupDir, `datavisool-${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  if (process.platform !== 'win32') fs.chmodSync(backup, 0o700);
  log(`开始备份：${backup}`);
  const sql = fs.openSync(path.join(backup, 'database.sql'), 'wx', 0o600);
  try {
    execute('mysqldump', [`--defaults-extra-file=${mysqlConfig}`, '--single-transaction', '--routines',
      '--triggers', '--events', '--hex-blob', '--no-tablespaces', '--databases', options.database], { stdoutFd: sql, env: childEnv });
  } catch (error) { throw new Error(`数据库备份失败；${backup} 为不完整备份，没有 COMPLETE 标记。\n${error.message}`); }
  finally { fs.closeSync(sql); }
  execute('tar', ['-czf', path.join(backup, 'files.tar.gz'), '-C', dir, '.env', 'docker-compose.yml', 'config', 'resource']);
  writePrivate(path.join(backup, 'image.txt'), `${compose(['config', '--images'], true)}\n`);
  writePrivate(path.join(backup, 'COMPLETE'), `database=${options.database}\ncreated=${new Date().toISOString()}\n`);
  log(`备份完成：${backup}；应用仍保持停止状态。`);
}

main(import.meta.url, deploy);
