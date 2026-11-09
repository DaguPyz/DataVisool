/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER_DIR = path.join(BUILD_DIR, 'launcher');
const SYSTEM_PATH = '/usr/bin:/bin';
const SKIP_SHELL_TESTS = process.platform === 'win32' || !fs.existsSync('/bin/sh');
const PYTHON3_PROBE = spawnSync('python3', ['-c', 'import os, sys; print(os.path.realpath(sys.executable))'], { encoding: 'utf8' });
const PYTHON3_BIN = PYTHON3_PROBE.status === 0 ? PYTHON3_PROBE.stdout.trim() : '';
const HAS_PYTHON3 = PYTHON3_BIN !== '';

function shellTest(name, optionsOrCallback, maybeCallback) {
  const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  test(name, { ...options, skip: SKIP_SHELL_TESTS || options.skip }, callback);
}

function makePackage(t, name = '常规 部署 包') {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-launcher-'));
  const root = path.join(tempRoot, `${name} 中文 空格`);
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, '.fake-tools'));
  fs.writeFileSync(path.join(root, '.fake-tools/curl'), '#!/bin/sh\nprintf "%s" "${FAKE_CURL_STATUS:-200}"\n');
  fs.chmodSync(path.join(root, '.fake-tools/curl'), 0o755);
  t.after(() => {
    cleanupStartedPackage(root);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
  fs.copyFileSync(path.join(LAUNCHER_DIR, 'deploy_linux.sh'), path.join(root, 'deploy_linux.sh'));
  fs.copyFileSync(path.join(LAUNCHER_DIR, 'deploy_macos.command'), path.join(root, 'deploy_macos.command'));
  fs.chmodSync(path.join(root, 'deploy_linux.sh'), 0o755);
  fs.chmodSync(path.join(root, 'deploy_macos.command'), 0o755);
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'server.jar'), 'fake jar');
  fs.writeFileSync(path.join(root, 'config/application.yml'), validConfig());
  return root;
}

function validConfig() {
  return [
    'spring:',
    '  datasource:',
    '    druid:',
    '      url: jdbc:mysql://db.internal:3306/lcp_server?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
    '      username: root',
    '      password: actual-secret',
    '',
  ].join('\n');
}

function incompleteConfig() {
  return [
    'spring:',
    '  datasource:',
    '    druid:',
    '      url: jdbc:mysql://127.0.0.1:3306/CHANGE_ME_DATABASE_NAME?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
    '      username: root',
    '      password: actual-secret',
    '  servlet:',
    '    multipart:',
    '      max-file-size: 50MB',
    'datavisool:',
    '  mode: PROD',
    '',
  ].join('\n');
}

function fakeJava(t, root, { version = '17.0.2', appStatus = '0', homeName = 'fake java home' } = {}) {
  const home = path.join(root, homeName);
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const java = path.join(bin, 'java');
  fs.writeFileSync(java, `#!/bin/sh
if [ "$1" = -version ]; then
  printf 'openjdk version "${version}" 2021-10-19\\n' >&2
  exit 0
fi
printf 'cwd=%s\\n' "$PWD" >> "$JAVA_RECORD"
for arg do printf 'arg=%s\\n' "$arg" >> "$JAVA_RECORD"; done
if ! read -r ignored; then printf 'stdin_closed=yes\\n' >> "$JAVA_RECORD"; fi
printf 'FAKE_APP_STARTED pid=%s\\n' "$$"
if [ "${'$'}FAKE_APP_MODE" = fail ]; then exit ${appStatus}; fi
if [ "${'$'}FAKE_APP_MODE" = late-fail ]; then sleep 3; printf 'synthetic startup failure\\n'; exit 1; fi
if [ "${'$'}FAKE_APP_MODE" = port-conflict ]; then printf 'java.lang.IllegalStateException: DATAVISOOL_PORT_UNAVAILABLE port=18080\\n'; exit 1; fi
if [ "${'$'}FAKE_APP_REQUIRE_ADMIN" = yes ] && [ -z "${'$'}DATAVISOOL_ADMIN_PASSWORD" ]; then
  printf 'java.lang.IllegalStateException: 首次初始化数据库需要设置管理员密码 DATAVISOOL_ADMIN_PASSWORD\\n'
  exit 1
fi
if [ -n "${'$'}FAKE_APP_START_DELAY" ]; then sleep "${'$'}FAKE_APP_START_DELAY"; fi
printf "Tomcat started on port %s (http) with context path '/'\\n" "${'$'}{FAKE_HTTP_PORT:-8080}"
printf 'Started DatavisoolServerApplication in 1 seconds\\n'
if [ "${'$'}FAKE_APP_MODE" = health-fail ]; then sleep 3; exit 1; fi
term_count=0
handle_term() {
  term_count=${'$'}((term_count + 1))
  if [ "${'$'}FAKE_APP_MODE" = ignore-first-term ] && [ "${'$'}term_count" -eq 1 ]; then return; fi
  printf 'FAKE_APP_STOPPED pid=%s\\n' "${'$'}${'$'}"
  exit 0
}
trap 'handle_term' TERM INT HUP
while :; do sleep 1; done
`);
  fs.chmodSync(java, 0o755);
  const record = path.join(root, 'java-args.txt');
  return { home, record };
}

function run(script, args, { cwd, env = {} } = {}) {
  return spawnSync('/bin/sh', [script, ...args], {
    cwd,
    env: { ...process.env, DATAVISOOL_LANG: 'zh-CN', ...env, PATH: `${path.dirname(script)}/.fake-tools:${env.PATH || SYSTEM_PATH}` },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 20000,
  });
}

const PYTHON_PTY_DRIVER = String.raw`
import os, pty, select, subprocess, sys, time

command = ['/bin/sh', sys.argv[1], *sys.argv[2:]]
database_name_prompt = b'MySQL ' + bytes.fromhex('e695b0e68daee5ba93e5908de7a7b0')
database_name_answers = __import__('json').loads(os.environ.get('PTY_DATABASE_NAME_ANSWERS', 'null'))
if database_name_answers is None:
    database_name_answers = [os.environ.get('PTY_DATABASE_NAME', '')]
database_name_sent = 0
username_prompt = b'MySQL ' + bytes.fromhex('e794a8e688b7e5908d')
username_sent = False
password_prompt = b'MySQL ' + bytes.fromhex('e5af86e7a081')
password_sent = False
admin_prompt = bytes.fromhex('e9a696e6aca1e5889de5a78be58c96e695b0e68daee5ba93efbc8ce8afb7e8aebee7bdaee7aea1e79086e59198e5af86e7a081')
admin_sent = False
jdk_prompt = bytes.fromhex('4a444b20313720e5ae89e8a385e79baee5bd95')
jdk_answers = __import__('json').loads(os.environ.get('PTY_JDK_ANSWERS', '[]'))
jdk_sent = 0
cancel_prompt = os.environ.get('PTY_CANCEL_PROMPT', '')
master, slave = pty.openpty()
proc = subprocess.Popen(command, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
output = bytearray()
sent = set()
deadline = time.monotonic() + float(os.environ.get('PTY_TIMEOUT', '25'))
timed_out = False

try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(master, 4096)
            except OSError:
                chunk = b''
            if not chunk:
                if proc.poll() is not None:
                    break
            else:
                output.extend(chunk)
        text = bytes(output)
        if cancel_prompt and cancel_prompt.encode() in text and not sent:
            os.write(master, b'\x04')
            sent.add(-1)
        jdk_occurrences = text.count(jdk_prompt)
        while jdk_sent < jdk_occurrences and jdk_sent < len(jdk_answers):
            os.write(master, jdk_answers[jdk_sent].encode() + b'\n')
            jdk_sent += 1
        prompt_count = text.count(database_name_prompt)
        while database_name_sent < prompt_count and database_name_sent < len(database_name_answers):
            os.write(master, database_name_answers[database_name_sent].encode() + b'\n')
            database_name_sent += 1
        if username_prompt in text and not username_sent:
            os.write(master, os.environ.get('PTY_USERNAME', '').encode() + b'\n')
            username_sent = True
        if password_prompt in text and not password_sent:
            os.write(master, os.environ.get('PTY_PASSWORD', '').encode() + b'\n')
            password_sent = True
        if (admin_prompt in text or b'Initial database setup: enter an administrator password' in text) and not admin_sent:
            os.write(master, os.environ.get('PTY_ADMIN_PASSWORD', '').encode() + b'\n')
            admin_sent = True
        if (os.environ.get('PTY_CANCEL_AFTER_DATABASE_ANSWERS') == '1'
                and prompt_count > len(database_name_answers) and -2 not in sent):
            os.write(master, b'\x04')
            sent.add(-2)
        if proc.poll() is not None:
            # Collect terminal output already buffered after the child exits.
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

function runPty(script, args, { cwd, env = {}, timeout = 30000 } = {}) {
  return spawnSync(PYTHON3_BIN || 'python3', ['-c', PYTHON_PTY_DRIVER, script, ...args], {
    cwd,
    env: { ...process.env, DATAVISOOL_LANG: 'zh-CN', ...env, PATH: `${path.dirname(script)}/.fake-tools:${env.PATH || SYSTEM_PATH}` },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout,
    maxBuffer: 1024 * 1024,
  });
}

function cleanupStartedPackage(root) {
  const pidFile = path.join(root, 'run/application.pid');
  const fakeJava = path.join(root, 'fake java home/bin/java');
  const candidates = new Set();
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 1) candidates.add(pid);
    run(path.join(root, 'deploy_linux.sh'), ['--stop'], { cwd: os.tmpdir() });
  }
  const logFile = path.join(root, 'logs/startup.log');
  if (fs.existsSync(logFile)) {
    const log = fs.readFileSync(logFile, 'utf8');
    for (const match of log.matchAll(/FAKE_APP_STARTED pid=(\d+)/g)) candidates.add(Number(match[1]));
  }
  for (const pid of candidates) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const command = spawnSync('ps', ['-ww', '-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
      if (command.status !== 0 || !command.stdout.includes(fakeJava) || !command.stdout.includes(`-jar ${root}/server.jar`)) break;
      const state = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' });
      if (state.status !== 0 || /Z/.test(state.stdout)) break;
      try { process.kill(pid, 'SIGTERM'); } catch { break; }
      spawnSync('/bin/sleep', ['1']);
    }
  }
}

shellTest('help and unknown arguments are handled before deployment detection', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-launcher-args-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync(path.join(LAUNCHER_DIR, 'deploy_linux.sh'), path.join(root, 'deploy_linux.sh'));

  const help = run(path.join(root, 'deploy_linux.sh'), ['--help'], { cwd: os.tmpdir() });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Java 17/);
  assert.match(help.stdout, /--restart/);
  const unknown = run(path.join(root, 'deploy_linux.sh'), ['--surprise'], { cwd: os.tmpdir() });
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /不支持的参数/);
});

shellTest('--check validates the package without prompting, starting, or creating run/log files', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(),
    env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /检查模式：未启动应用/);
  assert.equal(fs.existsSync(fake.record), false);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);

  fs.writeFileSync(path.join(root, 'config/application.yml'), incompleteConfig());
  const original = fs.readFileSync(path.join(root, 'config/application.yml'));
  const missing = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}\n${missing.stderr}`, /数据库名称|数据库名/);
  assert.doesNotMatch(`${missing.stdout}\n${missing.stderr}`, /MySQL 数据库名称/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'config/application.yml')), original);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
  assert.equal(fs.readdirSync(path.join(root, 'config')).some(name => name.includes('.bak.')), false);
});

shellTest('a missing database name without a TTY produces a clear error and does not mutate the config', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  fs.writeFileSync(path.join(root, 'config/application.yml'), incompleteConfig());
  const original = fs.readFileSync(path.join(root, 'config/application.yml'));
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /缺少必要数据库配置/);
  assert.match(`${result.stdout}\n${result.stderr}`, /请在交互终端运行脚本补齐/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'config/application.yml')), original);
  assert.equal(fs.readdirSync(path.join(root, 'config')).some(name => name.includes('.bak.')), false);
  assert.equal(fs.existsSync(fake.record), false);
});

shellTest('invalid Java is rejected before missing config can be changed', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root, { version: '21.0.1' });
  fs.writeFileSync(path.join(root, 'config/application.yml'), incompleteConfig());
  const original = fs.readFileSync(path.join(root, 'config/application.yml'));
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /需要 Java 17；检测到的版本为 21/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'config/application.yml')), original);
  assert.equal(fs.readdirSync(path.join(root, 'config')).some(name => name.includes('.bak.')), false);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
  assert.equal(fs.existsSync(fake.record), false);
});

shellTest('startup detaches a live process with package cwd, absolute JAR args, and no stdin', t => {
  const root = makePackage(t, '含 空格 和 中文');
  const fake = fakeJava(t, root);
  const startedAt = Date.now();
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(Date.now() - startedAt < 10000, 'launcher should return while the child stays alive');
  assert.match(result.stdout, /应用进程正在后台运行，PID：\d+/);
  assert.match(result.stdout, /可以关闭当前窗口/);
  const pid = Number(fs.readFileSync(path.join(root, 'run/application.pid'), 'utf8').trim());
  assert.ok(Number.isInteger(pid) && pid > 1);
  assert.ok(fs.existsSync(path.join(root, 'run/application.start')));
  assert.ok(fs.existsSync(path.join(root, 'logs/startup.log')));
  const lines = fs.readFileSync(fake.record, 'utf8').trim().split('\n');
  assert.equal(lines[0], `cwd=${fs.realpathSync(root)}`);
  assert.deepEqual(lines.slice(1), [
    'arg=-jar',
    `arg=${fs.realpathSync(path.join(root, 'server.jar'))}`,
    'arg=--spring.config.location=./config/application.yml',
    'stdin_closed=yes',
  ]);
  const log = fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8');
  assert.match(log, /FAKE_APP_STARTED/);
  assert.doesNotMatch(result.stdout, /FAKE_APP_STARTED/);

  const status = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, new RegExp(`PID：${pid}`));

  const duplicate = run(path.join(root, 'deploy_linux.sh'), [], { cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record } });
  assert.equal(duplicate.status, 0, `${duplicate.stdout}\n${duplicate.stderr}`);
  assert.match(duplicate.stdout, new RegExp(`PID：${pid}`));
  assert.equal(fs.readFileSync(fake.record, 'utf8').match(/^cwd=/gm)?.length, 1);
  assert.equal(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8').match(/FAKE_APP_STARTED/g)?.length, 1);

  const stopped = run(path.join(root, 'deploy_linux.sh'), ['--stop'], { cwd: os.tmpdir() });
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
  assert.match(stopped.stdout, /应用进程已停止/);
  assert.equal(fs.existsSync(path.join(root, 'run/application.pid')), false);
  assert.equal(fs.existsSync(path.join(root, 'run/application.start')), false);
  const afterStop = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(afterStop.status, 3);
});

shellTest('new database prompts for an administrator password without exposing or saving it', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const secret = 'Admin-密码-test-42';
  const originalConfig = fs.readFileSync(path.join(root, 'config/application.yml'), 'utf8');
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_REQUIRE_ADMIN: 'yes', PTY_ADMIN_PASSWORD: secret, DATAVISOOL_ADMIN_PASSWORD: '' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /请设置管理员密码/);
  assert.match(result.stdout, /应用已就绪，可访问/);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8'), new RegExp(secret));
  assert.equal(fs.readFileSync(path.join(root, 'config/application.yml'), 'utf8'), originalConfig);
});

shellTest('noninteractive first start reports the missing administrator password', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_REQUIRE_ADMIN: 'yes', DATAVISOOL_ADMIN_PASSWORD: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /首次初始化需要管理员密码/);
  assert.doesNotMatch(result.stdout, /应用已就绪/);
});

shellTest('port conflicts are shown before reporting startup success', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_MODE: 'port-conflict' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /端口 18080 无法绑定/);
  assert.doesNotMatch(result.stdout, /应用已就绪/);
});

shellTest('startup waits for the new process and does not accept stale readiness logs', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  fs.mkdirSync(path.join(root, 'logs'));
  fs.writeFileSync(path.join(root, 'logs/startup.log'), "Tomcat started on port 8080 (http) with context path '/'\nStarted DatavisoolServerApplication in 1 seconds\n");
  const startedAt = Date.now();
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_MODE: 'late-fail' },
  });
  assert.notEqual(result.status, 0);
  assert.ok(Date.now() - startedAt >= 2500);
  assert.doesNotMatch(result.stdout, /应用已就绪/);
  assert.match(result.stderr, /应用启动失败/);
});

shellTest('startup does not report readiness when the HTTP check fails', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_MODE: 'health-fail', FAKE_CURL_STATUS: '503' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /应用启动失败/);
  assert.doesNotMatch(result.stdout, /应用已就绪/);
});

shellTest('startup waits for both actual HTTP endpoints to respond', { skip: !fs.existsSync('/usr/bin/curl') }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const portFile = path.join(root, 'http-port');
  const requestsFile = path.join(root, 'http-requests');
  const program = `const http=require('http'),fs=require('fs'); const start=Date.now(); http.createServer((req,res)=>{fs.appendFileSync(process.env.REQUESTS,req.url+'\\n');res.statusCode=Date.now()-start<2500?503:200;res.end('ok');}).listen(0,'127.0.0.1',function(){fs.writeFileSync(process.env.PORT_FILE,String(this.address().port));});`;
  const server = spawn(process.execPath, ['-e', program], { env: { ...process.env, PORT_FILE: portFile, REQUESTS: requestsFile }, stdio: 'ignore' });
  t.after(() => server.kill());
  for (let i = 0; i < 50 && !fs.existsSync(portFile); i++) spawnSync('/bin/sleep', ['0.1']);
  assert.ok(fs.existsSync(portFile), 'HTTP fixture did not start');
  fs.writeFileSync(path.join(root, '.fake-tools/curl'), '#!/bin/sh\nexec /usr/bin/curl "$@"\n');
  const port = fs.readFileSync(portFile, 'utf8');
  const startedAt = Date.now();
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_HTTP_PORT: port },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(Date.now() - startedAt >= 1500, 'did not wait for the HTTP server to become ready');
  assert.match(result.stdout, new RegExp(`localhost:${port}/`));
  const requests = fs.readFileSync(requestsFile, 'utf8');
  assert.match(requests, /\/api\/security\/getEncryptKey/);
  assert.match(requests, /\/index\.html/);
});

shellTest('startup and status refuse to treat an unverifiable recorded process as stopped', t => {
  const psLookup = spawnSync('/bin/sh', ['-c', 'command -v ps'], { encoding: 'utf8' });
  if (psLookup.status !== 0) return t.skip('ps is not installed');
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const started = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const pidFile = path.join(root, 'run/application.pid');
  const originalPid = fs.readFileSync(pidFile, 'utf8');
  const bin = path.join(root, 'fake-bin');
  fs.mkdirSync(bin);
  const fakePs = path.join(bin, 'ps');
  fs.writeFileSync(fakePs, `#!/bin/sh\nif [ "$1" = -p ] && [ "$2" = "$UNVERIFIABLE_PID" ]; then exit 1; fi\nexec '${psLookup.stdout.trim().replace(/'/g, "'\\''")}' "$@"\n`);
  fs.chmodSync(fakePs, 0o755);
  const env = {
    JAVA_HOME: fake.home,
    JAVA_RECORD: fake.record,
    UNVERIFIABLE_PID: originalPid.trim(),
    PATH: `${bin}:${SYSTEM_PATH}`,
  };

  const status = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir(), env });
  assert.notEqual(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(`${status.stdout}\n${status.stderr}`, /无法验证已记录的应用进程/);

  const duplicate = run(path.join(root, 'deploy_linux.sh'), [], { cwd: os.tmpdir(), env });
  assert.notEqual(duplicate.status, 0, `${duplicate.stdout}\n${duplicate.stderr}`);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /无法验证已记录的应用进程/);
  assert.equal(fs.readFileSync(pidFile, 'utf8'), originalPid, 'an uncertain process record must not be overwritten');
  assert.equal(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8').match(/FAKE_APP_STARTED/g)?.length, 1,
    'the launcher must not create a second process when it cannot inspect the first');
});

shellTest('--restart stops the existing instance and starts a new PID', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const start = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(start.status, 0, `${start.stdout}\n${start.stderr}`);
  const oldPid = Number(fs.readFileSync(path.join(root, 'run/application.pid'), 'utf8').trim());

  const restarted = run(path.join(root, 'deploy_linux.sh'), ['--restart'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  const newPid = Number(fs.readFileSync(path.join(root, 'run/application.pid'), 'utf8').trim());
  assert.ok(Number.isInteger(newPid) && newPid > 1);
  assert.notEqual(newPid, oldPid, 'restart should register a new process');
  assert.match(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8'), new RegExp(`FAKE_APP_STOPPED pid=${oldPid}`));
  assert.equal(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8').match(/FAKE_APP_STARTED/g)?.length, 2);
  const oldState = spawnSync('ps', ['-p', String(oldPid), '-o', 'stat='], { encoding: 'utf8' });
  assert.ok(oldState.status !== 0 || /Z/.test(oldState.stdout), `old process is still active: ${oldState.stdout}`);
  const status = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, new RegExp(`PID：${newPid}`));
});

shellTest('--restart starts the app when no instance is running', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_linux.sh'), ['--restart'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /应用进程正在后台运行/);
  assert.equal(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8').match(/FAKE_APP_STARTED/g)?.length, 1);
  const status = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
});

shellTest('--restart does not start a second instance when stop times out and keeps the current PID record', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const env = { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_MODE: 'ignore-first-term' };
  const start = run(path.join(root, 'deploy_linux.sh'), [], { cwd: os.tmpdir(), env });
  assert.equal(start.status, 0, `${start.stdout}\n${start.stderr}`);
  const pidFile = path.join(root, 'run/application.pid');
  const startFile = path.join(root, 'run/application.start');
  const originalPid = fs.readFileSync(pidFile, 'utf8');
  const originalStart = fs.readFileSync(startFile, 'utf8');

  const restarted = run(path.join(root, 'deploy_linux.sh'), ['--restart'], { cwd: os.tmpdir(), env });
  assert.notEqual(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  assert.match(`${restarted.stdout}\n${restarted.stderr}`, /仍在退出中|停止.*超时|无法停止/);
  assert.equal(fs.readFileSync(pidFile, 'utf8'), originalPid);
  assert.equal(fs.readFileSync(startFile, 'utf8'), originalStart);
  assert.equal(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8').match(/FAKE_APP_STARTED/g)?.length, 1);
});

shellTest('interactive config repair changes only the database name and preserves host, port, query, and other values', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const originalConfig = incompleteConfig()
    .replace(
      'jdbc:mysql://127.0.0.1:3306/CHANGE_ME_DATABASE_NAME?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
      'jdbc:mysql://db.internal.example:13306/CHANGE_ME_DATABASE_NAME?serverTimezone=Asia%2FShanghai&useUnicode=true&characterEncoding=utf-8',
    )
    .replace('password: actual-secret', "password: 'p''a#ss:$HOME&\\tail'");
  fs.writeFileSync(path.join(root, 'config/application.yml'), originalConfig);
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: fake.home,
      JAVA_RECORD: fake.record,
      PTY_DATABASE_NAME: 'datavisool_server02',
      PTY_TIMEOUT: '30',
    },
    timeout: 35000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MySQL 数据库名称/);
  assert.doesNotMatch(result.stdout, /MySQL 用户名|MySQL 密码|MySQL JDBC/);
  assert.match(result.stdout, /应用进程正在后台运行/);

  const configPath = path.join(root, 'config/application.yml');
  const updated = fs.readFileSync(configPath, 'utf8');
  assert.match(updated, /url: '?jdbc:mysql:\/\/db\.internal\.example:13306\/datavisool_server02\?serverTimezone=Asia%2FShanghai&useUnicode=true&characterEncoding=utf-8'?/);
  assert.match(updated, /username: root/);
  assert.match(updated, /password: 'p''a#ss:\$HOME&\\tail'/);
  assert.match(updated, /max-file-size: 50MB/);
  assert.match(updated, /  mode: PROD/);
  const backups = fs.readdirSync(path.join(root, 'config')).filter(name => name.startsWith('application.yml.bak.'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(root, 'config', backups[0]), 'utf8'), originalConfig);

  const log = fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8');
  assert.match(log, /FAKE_APP_STARTED/);
  assert.doesNotMatch(result.stdout, /FAKE_APP_STARTED/);
  assert.doesNotMatch(log, /p'a#ss:\$HOME/);
});

shellTest('first startup asks for the blank database name, username, and password while retaining host and port', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const template = fs.readFileSync(path.join(BUILD_DIR, 'native/application.yml'), 'utf8');
  const configPath = path.join(root, 'config/application.yml');
  fs.writeFileSync(configPath, template);

  const secret = 'first-deploy-secret-must-not-echo';
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: fake.home,
      JAVA_RECORD: fake.record,
      PTY_DATABASE_NAME: 'first_db',
      PTY_USERNAME: 'first_user',
      PTY_PASSWORD: secret,
      PTY_TIMEOUT: '30',
    },
    timeout: 35000,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MySQL 数据库名称/);
  assert.match(result.stdout, /MySQL 用户名/);
  assert.match(result.stdout, /MySQL 密码/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(secret));
  const saved = fs.readFileSync(configPath, 'utf8');
  assert.match(saved, /url: 'jdbc:mysql:\/\/127\.0\.0\.1:3306\/first_db\?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8'/);
  assert.match(saved, /username: 'first_user'/);
  assert.match(saved, /password: 'first-deploy-secret-must-not-echo'/);
  assert.match(fs.readFileSync(path.join(root, 'config', fs.readdirSync(path.join(root, 'config')).find(name => name.startsWith('application.yml.bak.'))), 'utf8'), /username:\s*\n/);
});

shellTest('a URL without a query receives only the entered database name', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const original = incompleteConfig().replace(
    'jdbc:mysql://127.0.0.1:3306/CHANGE_ME_DATABASE_NAME?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
    'jdbc:mysql://db.internal.example:13306/',
  ).replace('password: actual-secret', 'password: CHANGE_ME_DATABASE_PASSWORD');
  fs.writeFileSync(path.join(root, 'config/application.yml'), original);
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: fake.home,
      JAVA_RECORD: fake.record,
      PTY_DATABASE_NAME: 'datavisool_server02',
      PTY_PASSWORD: "p'a#ss:$HOME&\\tail",
      FAKE_APP_MODE: 'fail',
    },
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MySQL 数据库名称/);
  assert.match(result.stdout, /MySQL 密码/);
  assert.doesNotMatch(result.stdout, /p'a#ss:\$HOME/);
  assert.match(fs.readFileSync(path.join(root, 'config/application.yml'), 'utf8'), /url: '?jdbc:mysql:\/\/db\.internal\.example:13306\/datavisool_server02'?$/m);
  assert.match(fs.readFileSync(path.join(root, 'config/application.yml'), 'utf8'), /password: 'p''a#ss:\$HOME&\\tail'/);
  assert.equal(fs.readdirSync(path.join(root, 'config')).filter(name => name.startsWith('application.yml.bak.')).length, 1);
  assert.equal(run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() }).status, 3);
});

shellTest('a full JDBC URL is rejected as a database name and cancellation leaves the template unchanged', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const configPath = path.join(root, 'config/application.yml');
  const original = incompleteConfig();
  fs.writeFileSync(configPath, original);
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: fake.home,
      JAVA_RECORD: fake.record,
      PTY_DATABASE_NAME_ANSWERS: JSON.stringify(['jdbc:mysql://other/db', 'CHANGE_ME_DATABASE_NAME']),
      PTY_CANCEL_AFTER_DATABASE_ANSWERS: '1',
    },
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MySQL 数据库名称/);
  assert.match(`${result.stdout}\n${result.stderr}`, /数据库名称|数据库名|只能包含|格式|无效/i);
  assert.deepEqual(fs.readFileSync(configPath, 'utf8'), original);
  assert.equal(fs.readdirSync(path.join(root, 'config')).some(name => name.startsWith('application.yml.bak.')), false);
  assert.equal(fs.existsSync(fake.record), false);
});

shellTest('interactive cancellation leaves the original config and backup set untouched', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const original = incompleteConfig();
  fs.writeFileSync(path.join(root, 'config/application.yml'), original);
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, PTY_CANCEL_PROMPT: 'MySQL 数据库名称' },
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /输入已取消，配置未保存/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'config/application.yml'), 'utf8'), original);
  assert.equal(fs.readdirSync(path.join(root, 'config')).some(name => name.startsWith('application.yml.bak.')), false);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
  assert.equal(fs.existsSync(fake.record), false);
});

shellTest('launch failures return an error and do not remain registered as running', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root, { appStatus: '19' });
  const result = run(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, FAKE_APP_MODE: 'fail' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /应用进程|后台|启动/);
  assert.match(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8'), /FAKE_APP_STARTED/);
  const status = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(status.status, 3, `${status.stdout}\n${status.stderr}`);
});

shellTest('--status and --stop refuse stale PIDs and a live unrelated recycled PID', t => {
  const root = makePackage(t);
  const runDir = path.join(root, 'run');
  fs.mkdirSync(runDir);
  const pidFile = path.join(runDir, 'application.pid');
  const startFile = path.join(runDir, 'application.start');

  fs.writeFileSync(pidFile, '2147483647\n');
  fs.writeFileSync(startFile, 'stale process time\n');
  const staleStatus = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(staleStatus.status, 3);
  const staleStop = run(path.join(root, 'deploy_linux.sh'), ['--stop'], { cwd: os.tmpdir() });
  assert.equal(staleStop.status, 0, `${staleStop.stdout}\n${staleStop.stderr}`);
  assert.match(staleStop.stdout, /无需停止/);
  assert.equal(fs.readFileSync(pidFile, 'utf8'), '2147483647\n');

  const processStart = spawnSync('ps', ['-p', String(process.pid), '-o', 'lstart='], {
    encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
  });
  assert.equal(processStart.status, 0, processStart.stderr);
  fs.writeFileSync(pidFile, `${process.pid}\n`);
  const exactStart = processStart.stdout.replace(/[\r\n]+$/, '');
  fs.writeFileSync(startFile, `${exactStart}\n`);
  const reusedStatus = run(path.join(root, 'deploy_linux.sh'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(reusedStatus.status, 3);
  const reusedStop = run(path.join(root, 'deploy_linux.sh'), ['--stop'], { cwd: os.tmpdir() });
  assert.equal(reusedStop.status, 0, `${reusedStop.stdout}\n${reusedStop.stderr}`);
  assert.match(reusedStop.stdout, /无需停止/);
  assert.equal(fs.readFileSync(pidFile, 'utf8'), `${process.pid}\n`);
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});

shellTest('a relative JAVA_HOME is resolved before changing to the package directory', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const callerDir = os.tmpdir();
  const relativeHome = path.relative(callerDir, fake.home);
  const result = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: callerDir,
    env: { JAVA_HOME: relativeHome, JAVA_RECORD: fake.record },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

shellTest('Java can be resolved from PATH when JAVA_HOME is unset', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const pathDir = path.join(root, 'path with spaces');
  fs.mkdirSync(pathDir);
  fs.symlinkSync(path.join(fake.home, 'bin/java'), path.join(pathDir, 'java'));
  fs.symlinkSync('/usr/bin/awk', path.join(pathDir, 'awk'));
  const result = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(),
    env: { JAVA_HOME: '', PATH: pathDir, JAVA_RECORD: fake.record },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

shellTest('non-Java-17 runtimes are rejected before the app starts', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root, { version: '21.0.1' });
  const result = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /需要 Java 17；检测到的版本为 21/);
  assert.equal(fs.existsSync(fake.record), false);
});

shellTest('invalid JAVA_HOME is reported instead of falling back to PATH', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(),
    env: { JAVA_HOME: path.join(root, 'missing-java-home'), PATH: `${fake.home}/bin:${SYSTEM_PATH}`, JAVA_RECORD: fake.record },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JAVA_HOME 已设置，但其中找不到可执行的 Java/);
  assert.equal(fs.existsSync(fake.record), false);
});

shellTest('missing Java produces an actionable Java 17 message', t => {
  const root = makePackage(t);
  const utilityPath = path.join(root, 'utilities');
  fs.mkdirSync(utilityPath);
  fs.symlinkSync('/usr/bin/awk', path.join(utilityPath, 'awk'));
  const result = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: '', PATH: utilityPath },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未找到 Java.*安装 Java 17/);
});

shellTest('startup retries Java home input and accepts a quoted JDK 17 path with spaces and Chinese characters', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root, { homeName: 'JDK 17 中文 路径' });
  const utilityPath = path.join(root, 'utilities');
  fs.mkdirSync(utilityPath);
  fs.symlinkSync('/usr/bin/awk', path.join(utilityPath, 'awk'));
  const missingHome = path.join(root, 'missing JDK');
  const answers = [path.join(root, 'also missing'), `"${fake.home}"`];
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: missingHome,
      JAVA_RECORD: fake.record,
      PATH: SYSTEM_PATH,
      PTY_JDK_ANSWERS: JSON.stringify(answers),
      PTY_TIMEOUT: '35',
    },
    timeout: 40000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok((result.stdout.match(/JDK 17 安装目录/g) || []).length >= 2, 'the same prompt should repeat after the invalid JDK path');
  assert.match(result.stdout, /应用进程正在后台运行/);
  assert.match(fs.readFileSync(fake.record, 'utf8'), new RegExp(`cwd=${fs.realpathSync(root)}`));
  assert.match(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8'), /FAKE_APP_STARTED/);

  const stopped = run(path.join(root, 'deploy_linux.sh'), ['--stop'], { cwd: os.tmpdir() });
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);

  // The entered JDK path is for this invocation only; a later check still sees no configured Java.
  const laterCheck = run(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: '', PATH: utilityPath },
  });
  assert.notEqual(laterCheck.status, 0);
  assert.match(laterCheck.stderr, /未找到 Java/);
  assert.doesNotMatch(`${laterCheck.stdout}\n${laterCheck.stderr}`, /JDK 17 安装目录/);
});

shellTest('a Java 21 JAVA_HOME can be replaced interactively with a quoted Java 17 home', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const wrong = fakeJava(t, root, { version: '21.0.1', homeName: 'JDK 21' });
  const good = fakeJava(t, root, { homeName: 'JDK 17 中文 路径' });
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: wrong.home,
      JAVA_RECORD: good.record,
      PTY_JDK_ANSWERS: JSON.stringify([`'${good.home}'`]),
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /需要 Java 17.*21/);
  assert.ok((result.stdout.match(/JDK 17 安装目录/g) || []).length >= 1);
  assert.match(result.stdout, /应用进程正在后台运行/);
  assert.match(fs.readFileSync(good.record, 'utf8'), new RegExp(`cwd=${fs.realpathSync(root)}`));
});

shellTest('EOF at the Java home prompt cancels without changing config or starting the app', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const configPath = path.join(root, 'config/application.yml');
  const original = fs.readFileSync(configPath);
  const utilityPath = path.join(root, 'utilities');
  fs.mkdirSync(utilityPath);
  fs.symlinkSync('/usr/bin/awk', path.join(utilityPath, 'awk'));

  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: '',
      PATH: utilityPath,
      JAVA_RECORD: fake.record,
      PTY_CANCEL_PROMPT: 'JDK 17 安装目录',
    },
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /JDK 17 安装目录/);
  assert.deepEqual(fs.readFileSync(configPath), original);
  assert.equal(fs.existsSync(fake.record), false);
  assert.equal(fs.existsSync(path.join(root, 'logs/startup.log')), false);
});

shellTest('--check never prompts for a Java home', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const utilityPath = path.join(root, 'utilities');
  fs.mkdirSync(utilityPath);
  fs.symlinkSync('/usr/bin/awk', path.join(utilityPath, 'awk'));
  const result = runPty(path.join(root, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(),
    env: {
      JAVA_HOME: '',
      PATH: utilityPath,
      PTY_CANCEL_PROMPT: 'JDK 17 安装目录',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /未找到 Java/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /JDK 17 安装目录/);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
});

shellTest('Docker all-in-one packages without their POSIX helper fail clearly and are not modified', t => {
  const root = makePackage(t);
  fs.unlinkSync(path.join(root, 'server.jar'));
  fs.mkdirSync(path.join(root, 'docker-allinone'));
  const result = run(path.join(root, 'deploy_linux.sh'), [], { cwd: os.tmpdir() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /docker-allinone\/launch\.sh|POSIX.*helper|启动脚本/);
  assert.equal(fs.existsSync(path.join(root, '.env')), false);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
});

shellTest('missing config and mixed package markers are rejected', t => {
  const missingConfigRoot = makePackage(t);
  const missingConfigJava = fakeJava(t, missingConfigRoot);
  fs.unlinkSync(path.join(missingConfigRoot, 'config/application.yml'));
  const missingConfig = run(path.join(missingConfigRoot, 'deploy_linux.sh'), ['--check'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: missingConfigJava.home, JAVA_RECORD: missingConfigJava.record },
  });
  assert.notEqual(missingConfig.status, 0);
  assert.match(missingConfig.stderr, /缺少可读取的 config\/application.yml/);
  assert.equal(fs.existsSync(missingConfigJava.record), false);

  const mixedRoot = makePackage(t);
  fs.mkdirSync(path.join(mixedRoot, 'docker-allinone'));
  const mixed = run(path.join(mixedRoot, 'deploy_linux.sh'), [], { cwd: os.tmpdir() });
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /同时包含常规部署和 Docker 产物标记/);
});

shellTest('deploy_macos.command forwards startup, restart, status, and stop to the Linux launcher', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const result = run(path.join(root, 'deploy_macos.command'), [], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const oldPid = Number(fs.readFileSync(path.join(root, 'run/application.pid'), 'utf8').trim());
  const restarted = run(path.join(root, 'deploy_macos.command'), ['--restart'], {
    cwd: os.tmpdir(), env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record },
  });
  assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
  const pid = Number(fs.readFileSync(path.join(root, 'run/application.pid'), 'utf8').trim());
  assert.notEqual(pid, oldPid);
  assert.match(fs.readFileSync(path.join(root, 'logs/startup.log'), 'utf8'), new RegExp(`FAKE_APP_STOPPED pid=${oldPid}`));
  const status = run(path.join(root, 'deploy_macos.command'), ['--status'], { cwd: os.tmpdir() });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(status.stdout, new RegExp(`PID：${pid}`));
  const stopped = run(path.join(root, 'deploy_macos.command'), ['--stop'], { cwd: os.tmpdir() });
  assert.equal(stopped.status, 0, `${stopped.stdout}\n${stopped.stderr}`);
});

shellTest('English messages preserve readiness, administrator and port-conflict checks', t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const env = { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, DATAVISOOL_LANG: 'en-US' };
  const check = run(path.join(root, 'deploy_linux.sh'), ['--check'], { env });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.match(check.stdout, /Check/);
  const conflict = run(path.join(root, 'deploy_linux.sh'), [], { env: { ...env, FAKE_APP_MODE: 'port-conflict' } });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /Port 18080 cannot be bound/);
  assert.doesNotMatch(conflict.stdout, /ready.*access/i);
  const password = run(path.join(root, 'deploy_linux.sh'), [], { env: { ...env, FAKE_APP_REQUIRE_ADMIN: 'yes', DATAVISOOL_ADMIN_PASSWORD: '' } });
  assert.notEqual(password.status, 0);
  assert.match(password.stderr, /administrator password/);
});


shellTest('English first-start administrator prompt accepts a hidden password', { skip: !HAS_PYTHON3 }, t => {
  const root = makePackage(t);
  const fake = fakeJava(t, root);
  const secret = 'Admin-test-42';
  const result = runPty(path.join(root, 'deploy_linux.sh'), [], {
    env: { JAVA_HOME: fake.home, JAVA_RECORD: fake.record, DATAVISOOL_LANG: 'en-US', FAKE_APP_REQUIRE_ADMIN: 'yes', PTY_ADMIN_PASSWORD: secret, DATAVISOOL_ADMIN_PASSWORD: '' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /enter an administrator password/);
  assert.match(result.stdout, /Application is ready/);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
});
