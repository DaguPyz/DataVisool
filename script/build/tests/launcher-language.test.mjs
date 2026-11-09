// Licensed under the DataVisool License. See the LICENSE file distributed with this software.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const build = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launcher = path.join(build, 'launcher', 'deploy_linux.sh');
const helpers = ['docker-app', 'docker-allinone'].map(name => path.join(build, name, 'launch.sh'));
const hasShell = fs.existsSync('/bin/sh');
const powershellScripts = [path.join(build, 'launcher', 'deploy_windows.ps1'), ...['docker-app', 'docker-allinone'].map(name => path.join(build, name, 'launch.ps1'))];

function run(script, args, locale = {}) {
  const env = { ...process.env, LANG: 'C', LC_ALL: '', LC_MESSAGES: '', ...locale };
  delete env.DATAVISOOL_LANG;
  if (Object.hasOwn(locale, 'DATAVISOOL_LANG')) env.DATAVISOOL_LANG = locale.DATAVISOOL_LANG;
  return spawnSync('/bin/sh', [script, ...args], { env, encoding: 'utf8' });
}

for (const script of [launcher, ...helpers]) {
  test(`${path.relative(build, script)} selects language for help and errors`, { skip: !hasShell }, () => {
    let result = run(script, ['--help'], { DATAVISOOL_LANG: 'en-US', LANG: 'zh_CN.UTF-8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.doesNotMatch(result.stdout, /用法/);
    result = run(script, ['--invalid'], { DATAVISOOL_LANG: 'en-US' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Error:.*Unsupported/);
    result = run(script, ['--help'], { DATAVISOOL_LANG: 'zh-CN', LANG: 'en_US.UTF-8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /用法/);
    result = run(script, ['--help'], { LANG: 'en_US.UTF-8' });
    assert.match(result.stdout, /Usage:/);
    result = run(script, ['--help'], { DATAVISOOL_LANG: 'fr-FR', LANG: 'en_US.UTF-8' });
    assert.match(result.stdout, /用法/);
  });
}

test('root launcher forwards the selected language to each Docker helper', { skip: !hasShell }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-language-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.copyFileSync(launcher, path.join(root, 'deploy_linux.sh'));
  for (const name of ['docker-app', 'docker-allinone']) {
    const target = path.join(root, name);
    fs.mkdirSync(target);
    fs.copyFileSync(path.join(build, name, 'launch.sh'), path.join(target, 'launch.sh'));
    const result = run(path.join(root, 'deploy_linux.sh'), ['--help'], { DATAVISOOL_LANG: 'en-US' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, name === 'docker-app' ? /Docker app/ : /Docker all-in-one/);
    fs.rmSync(target, { recursive: true });
  }
});

const candidates = process.env.PWSH_BIN ? [process.env.PWSH_BIN] : ['pwsh', 'powershell.exe'];
const pwsh = candidates.find(command => spawnSync(command, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0);
for (const script of powershellScripts) {
  test(`${path.relative(build, script)} Windows help and argument errors are bilingual`, { skip: !pwsh ? 'PowerShell is not installed' : false }, () => {
    for (const [language, expected] of [['en-US', /Usage:/], ['zh-CN', /用法/], ['fr-FR', /用法/]]) {
      const result = spawnSync(pwsh, ['-NoProfile', '-File', script, '--help'], { env: { ...process.env, DATAVISOOL_LANG: language }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, expected);
    }
    const result = spawnSync(pwsh, ['-NoProfile', '-File', script, '--invalid'], { env: { ...process.env, DATAVISOOL_LANG: 'en-US' }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported/);
  });
}
