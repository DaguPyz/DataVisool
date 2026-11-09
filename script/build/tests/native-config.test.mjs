/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCHER = path.join(BUILD_DIR, 'launcher', 'deploy_linux.sh');
const SKIP_SHELL_TESTS = process.platform === 'win32' || !fs.existsSync('/bin/sh');
const SYSTEM_PATH = '/usr/bin:/bin';

function shellTest(name, callback) {
  test(name, { skip: SKIP_SHELL_TESTS }, callback);
}

function completeConfig() {
  return [
    'spring:',
    '  datasource:',
    '    druid:',
    '      url: jdbc:mysql://db.internal:3306/lcp_server?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
    '      username: root',
    '      password: actual-secret',
    '  servlet:',
    '    multipart:',
    '      max-file-size: 50MB',
    '',
  ].join('\n');
}

function makePackage(t, config) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-config-'));
  const root = path.join(tempRoot, '常规部署 包');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  fs.copyFileSync(LAUNCHER, path.join(root, 'deploy_linux.sh'));
  fs.chmodSync(path.join(root, 'deploy_linux.sh'), 0o755);
  fs.mkdirSync(path.join(root, 'config'));
  fs.writeFileSync(path.join(root, 'server.jar'), 'fake jar');
  const configPath = path.join(root, 'config/application.yml');
  fs.writeFileSync(configPath, config);

  const javaHome = path.join(tempRoot, 'fake-java-home');
  fs.mkdirSync(path.join(javaHome, 'bin'), { recursive: true });
  const java = path.join(javaHome, 'bin/java');
  fs.writeFileSync(java, `#!/bin/sh
if [ "$1" = -version ]; then
  printf 'openjdk version "17.0.2" 2021-10-19\\n' >&2
  exit 0
fi
exit 19
`);
  fs.chmodSync(java, 0o755);
  return { root, configPath, javaHome };
}

function checkConfig(root, javaHome) {
  return spawnSync('/bin/sh', [path.join(root, 'deploy_linux.sh'), '--check'], {
    cwd: os.tmpdir(),
    env: { ...process.env, JAVA_HOME: javaHome, PATH: SYSTEM_PATH },
    encoding: 'utf8',
    timeout: 10000,
  });
}

function assertUnchangedAndNoBackup(root, configPath, original) {
  assert.deepEqual(fs.readFileSync(configPath), original, 'failed validation must not modify application.yml');
  assert.equal(fs.readdirSync(path.join(root, 'config')).some(name => name.includes('.bak.')), false);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
}

shellTest('preconfigured database values work when all comments have been removed', t => {
  const source = completeConfig();
  assert.doesNotMatch(source, /^\s*#/m);
  const { root, configPath, javaHome } = makePackage(t, source);
  const result = checkConfig(root, javaHome);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /检查通过/);
  assert.match(fs.readFileSync(configPath, 'utf8'), /^\s+username: root$/m);
  assert.deepEqual(fs.readFileSync(configPath, 'utf8'), source);
  assert.equal(fs.existsSync(path.join(root, 'run')), false);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
});

shellTest('the shipped template leaves all three database credentials blank and --check reports them without writing', t => {
  const source = fs.readFileSync(path.join(BUILD_DIR, 'native/application.yml'), 'utf8');
  assert.match(source, /url: jdbc:mysql:\/\/127\.0\.0\.1:3306\/\?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8/);
  assert.match(source, /^\s+username:\s*$/m);
  assert.match(source, /^\s+password:\s*$/m);
  const { root, configPath, javaHome } = makePackage(t, source);
  const result = checkConfig(root, javaHome);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /url（数据库名称）/);
  assert.match(output, /username/);
  assert.match(output, /password/);
  assertUnchangedAndNoBackup(root, configPath, Buffer.from(source));
});

shellTest('a missing database name is reported by --check without writing', t => {
  const source = [
    'spring:',
    '  datasource:',
    '    druid:',
    '      url: jdbc:mysql://db.internal:3306/?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
    '      username: root',
    '      password: actual-secret',
    '',
  ].join('\n');
  const { root, configPath, javaHome } = makePackage(t, source);
  const result = checkConfig(root, javaHome);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /数据库名称|数据库名|CHANGE_ME_DATABASE_NAME/i);
  assert.doesNotMatch(output, /username|password/i);
  assertUnchangedAndNoBackup(root, configPath, Buffer.from(source));

  const templateSource = completeConfig().replace(
    'jdbc:mysql://db.internal:3306/lcp_server?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
    'jdbc:mysql://127.0.0.1:3306/CHANGE_ME_DATABASE_NAME?serverTimezone=GMT%2B8&useUnicode=true&characterEncoding=utf-8',
  );
  fs.writeFileSync(configPath, templateSource);
  const template = checkConfig(root, javaHome);
  const templateOutput = `${template.stdout}\n${template.stderr}`;
  assert.notEqual(template.status, 0);
  assert.match(templateOutput, /数据库名称|数据库名|CHANGE_ME_DATABASE_NAME/i);
  assert.doesNotMatch(templateOutput, /username|password/i);
  assertUnchangedAndNoBackup(root, configPath, Buffer.from(templateSource));
});

shellTest('an empty or invalid URL and the old mysql-host placeholder fail with a repair hint', t => {
  const { root, configPath, javaHome } = makePackage(t, completeConfig());
  const base = completeConfig();
  const cases = [
    { source: base.replace(/^\s+url:.*$/m, '      url:'), reason: /(恢复|模板|URL|连接地址)/i },
    { source: base.replace('jdbc:mysql://db.internal:3306/', 'jdbc:mysql://mysql-host:3306/'), reason: /(恢复|模板|主机|mysql-host)/i },
    { source: base.replace('jdbc:mysql://db.internal:3306/', 'not-a-jdbc-url/'), reason: /(恢复|模板|URL|连接地址)/i },
  ];

  for (const { source, reason } of cases) {
    fs.writeFileSync(configPath, source);
    const result = checkConfig(root, javaHome);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /url|数据库|连接/i);
    assert.match(output, reason);
    assertUnchangedAndNoBackup(root, configPath, Buffer.from(source));
  }
});

shellTest('missing required lines and duplicate names fail clearly without changing config', t => {
  const base = completeConfig();
  const cases = [
    {
      source: base.replace(/^\s+url:.*\n/m, ''),
      key: /url/i,
      diagnostic: /(行|缺少|不存在|配置项)/,
    },
    {
      source: base.replace(/^\s+url:.*$/m, match => `${match}\n      url: jdbc:mysql://other:3306/second_db`),
      key: /url/i,
      diagnostic: /(重复|多次|只能出现一次|行)/,
    },
  ];

  for (const { source, key, diagnostic } of cases) {
    const { root, configPath, javaHome } = makePackage(t, source);
    const result = checkConfig(root, javaHome);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, key, 'the diagnostic should name the problematic database setting');
    assert.match(output, diagnostic, 'the diagnostic should explain that its line is missing or duplicated');
    assertUnchangedAndNoBackup(root, configPath, Buffer.from(source));
  }
});
