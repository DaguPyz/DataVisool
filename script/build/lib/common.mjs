/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Pass arguments directly to native executables. Never execute a shell or source .env.
export function run(command, args = [], options = {}) {
  const executable = process.platform === 'win32' && !path.extname(command) ? `${command}.exe` : command;
  const result = spawnSync(executable, args, {
    shell: false, windowsHide: true, cwd: options.cwd, env: options.env ?? process.env,
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: options.stdoutFd !== undefined ? ['ignore', options.stdoutFd, 'inherit']
      : options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw new Error(`无法运行 ${command}：${result.error.message}。请确认已安装并加入 PATH。`);
  if (result.status !== 0) {
    throw new Error(`${command} 执行失败（${result.status ?? result.signal}）${result.stderr ? `\n${result.stderr.trim()}` : ''}`);
  }
  return result.stdout?.trimEnd() ?? '';
}

export function parseArgs(args, defaults, booleanOptions = []) {
  const options = { ...defaults };
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    const key = argument.startsWith('--') ? argument.slice(2) : '';
    if (!Object.hasOwn(defaults, key)) throw new Error(`未知参数：${argument}`);
    if (booleanOptions.includes(key)) options[key] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${argument} 缺少参数`);
      options[key] = args[++i];
    }
  }
  return options;
}

export function validateImage(image) {
  if (!/^[a-z0-9][a-z0-9./:_-]*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(image) || image.endsWith(':latest')) {
    throw new Error('请提供明确版本的 IMAGE:TAG，不使用 latest');
  }
}

export function writePrivate(file, text) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function setEnv(file, values) {
  const pending = new Map(Object.entries(values));
  const seen = new Set();
  const lines = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const output = [];
  for (const line of lines) {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!pending.has(key)) output.push(line);
    else if (!seen.has(key)) { output.push(`${key}=${pending.get(key)}`); seen.add(key); }
  }
  for (const [key, value] of pending) if (!seen.has(key)) output.push(`${key}=${value}`);
  writePrivate(file, `${output.join('\n').replace(/\n*$/, '')}\n`);
}

export function copyMissing(source, destination, mode) {
  if (fs.existsSync(destination)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Create with the intended mode, without a transient publicly readable credential file.
  fs.writeFileSync(destination, fs.readFileSync(source), { flag: 'wx', mode });
}

export function defaultDeployDir(platform = process.platform, env = process.env) {
  return platform === 'win32' ? path.win32.join(env.ProgramData || 'C:\\ProgramData', 'datavisool-web-app')
    : '/usr/app/datavisool-web-app';
}

export function containerOwner(platform = process.platform) {
  if (platform === 'win32' || process.getuid() === 0) return { uid: 10001, gid: 10001 };
  return { uid: process.getuid(), gid: process.getgid() };
}

export function isWithin(parent, child, pathApi = path) {
  const relative = pathApi.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative));
}

export function requireDocker(execute = run, env = process.env) {
  const type = execute('docker', ['info', '--format', '{{.OSType}}'], { capture: true, env });
  if (type.trim() !== 'linux') throw new Error('需要 Linux 容器引擎；Windows 请将 Docker Desktop 切换到 Linux containers。');
}

export function dockerPlatform(execute = run) {
  const architecture = execute('docker', ['info', '--format', '{{.Architecture}}'], { capture: true }).trim();
  const platforms = { amd64: 'linux/amd64', x86_64: 'linux/amd64', arm64: 'linux/arm64', aarch64: 'linux/arm64' };
  if (!Object.hasOwn(platforms, architecture)) throw new Error(`不支持的 Docker 引擎架构：${architecture}`);
  return platforms[architecture];
}

export function main(url, action) {
  if (!process.argv[1] || fs.realpathSync(process.argv[1]) !== fs.realpathSync(fileURLToPath(url))) return;
  try {
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('需要 Node.js 20 或更新版本');
    action(process.argv.slice(2));
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
