/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildAll } from '../build-all.mjs';
import { writeArtifactFixture } from './docker-artifacts.fixture.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-build-all-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const localScriptDir = path.join(root, 'script', 'build');
  const localRepoRoot = path.resolve(localScriptDir, '../..');
  const version = '9.8.7-test';
  fs.mkdirSync(path.join(localScriptDir, 'native'), { recursive: true });
  fs.mkdirSync(path.join(localScriptDir, 'docker-app'), { recursive: true });
  fs.mkdirSync(path.join(localScriptDir, 'docker-allinone'), { recursive: true });
  fs.mkdirSync(localRepoRoot, { recursive: true });
  fs.mkdirSync(path.join(localRepoRoot, 'datavisool-server', 'datavisool-service', 'target'), { recursive: true });
  fs.writeFileSync(path.join(localRepoRoot, 'package.json'), JSON.stringify({ version }));

  const env = {
    ...process.env,
    DEPLOY_SKIP_BUILD: 'true',
    DEPLOY_DRY_RUN: 'true',
  };
  const calls = [];
  const behavior = { failAt: '', omitArtifactAt: '', omitJar: false, invalidDocs: false };
  const artifactSnapshots = [];
  const execute = (command, args, options = {}) => {
    const call = { command, args: [...args], options: { ...options, env: { ...options.env } } };
    calls.push(call);

    const script = args[0];
    const step = script === path.join(localScriptDir, 'native', 'deploy.js') ? 'native'
      : script === path.join(localScriptDir, 'docker-app', 'build-app.mjs') ? 'docker-app'
        : script === path.join(localScriptDir, 'docker-allinone', 'build-allinone.mjs') ? 'docker-allinone' : '';
    if (step.startsWith('docker-')) {
      const preparedDir = args[args.indexOf('--artifact-dir') + 1];
      artifactSnapshots.push({ step, directory: preparedDir, files: snapshotFiles(preparedDir) });
    }
    if (behavior.failAt === step) throw new Error(`${step} failed`);
    if (!step || behavior.omitArtifactAt === step) return '';

    if (step === 'native') {
      const inputs = writeArtifactFixture(root, {
        jarPath: path.join(localRepoRoot, 'datavisool-server/datavisool-service/target/server.jar'),
        componentDocsDir: path.join(localRepoRoot, 'datavisool-server/datavisool-service/target/component-docs'),
      });
      if (behavior.omitJar) fs.rmSync(inputs.jarPath);
      if (behavior.invalidDocs) fs.writeFileSync(path.join(inputs.componentDocsDir, 'current.json'), '{}');
    }

    for (const artifact of expectedArtifacts(localScriptDir, version)[step]) {
      fs.mkdirSync(path.dirname(artifact), { recursive: true });
      fs.writeFileSync(artifact, `${step} test artifact\n`);
    }
    return '';
  };

  return { root, localScriptDir, localRepoRoot, version, env, calls, behavior, artifactSnapshots, execute };
}

function expectedArtifacts(scriptDir, version) {
  const platforms = ['linux-amd64', 'linux-arm64'];
  return {
    native: [path.join(scriptDir, 'release', `datavisool-web-v${version}-release.zip`)],
    'docker-app': platforms.map(platform => path.join(scriptDir, 'release', `datavisool-web-app-${version}-${platform}.tar.gz`)),
    'docker-allinone': platforms.map(platform => path.join(scriptDir, 'release', `datavisool-web-allinone-${version}-${platform}.tar.gz`)),
  };
}

function runFixture(f, args = []) {
  return buildAll(args, { execute: f.execute, scriptDir: f.localScriptDir, env: f.env, log() {} });
}

function snapshotFiles(root) {
  const result = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) visit(absolute);
      else result.push([relative, fs.readFileSync(absolute)]);
    }
  };
  visit(root);
  return result;
}

test('runs native, app image, and all-in-one image builds in order with fixed full-build flags', t => {
  const f = fixture(t);
  runFixture(f, ['--target-jdk', '/opt/jdk 17', '--maven-home', '/opt/maven home', '--mvn-command', 'mvn-custom']);

  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.calls.map(call => path.basename(call.args[0])), ['deploy.js', 'build-app.mjs', 'build-allinone.mjs']);
  assert.ok(f.calls.every(call => call.command === process.execPath));
  assert.ok(f.calls.every(call => call.options.cwd === f.localRepoRoot));

  const [native, app, allinone] = f.calls;
  assert.deepEqual(native.args.slice(1), [
    '--skip-build=false', '--dry-run=false',
    '--local-jar', path.join(f.localRepoRoot, 'datavisool-server', 'datavisool-service', 'target', 'server.jar'),
    '--output-dir', path.join(f.localScriptDir, 'release'),
    '--target-jdk', '/opt/jdk 17', '--maven-home', '/opt/maven home', '--mvn-command', 'mvn-custom',
  ]);
  assert.equal(native.options.env.DEPLOY_SKIP_BUILD, 'true');
  assert.equal(native.options.env.DEPLOY_DRY_RUN, 'true');

  for (const call of [app, allinone]) {
    assert.deepEqual(call.args.slice(1, 4), ['--version', f.version, '--artifact-dir']);
    assert.ok(!call.args.includes('--platform'));
    assert.ok(!call.args.includes('--skip-export'));
    assert.ok(!call.args.includes('--no-cache'));
  }
  assert.equal(f.artifactSnapshots.length, 2);
  assert.equal(f.artifactSnapshots[0].directory, f.artifactSnapshots[1].directory,
    'both Docker builds must receive the same prepared outputs');
  assert.deepEqual(f.artifactSnapshots[0].files, f.artifactSnapshots[1].files);
  assert.equal(fs.existsSync(f.artifactSnapshots[0].directory), false, 'shared temporary artifacts must be cleaned');

  for (const outputs of Object.values(expectedArtifacts(f.localScriptDir, f.version))) {
    for (const artifact of outputs) assert.ok(fs.statSync(artifact).size > 0, `${artifact} should be non-empty`);
  }
});

test('--no-cache reaches both Docker builds and does not alter native arguments', t => {
  const f = fixture(t);
  runFixture(f, ['--no-cache']);
  assert.ok(!f.calls[0].args.includes('--no-cache'));
  assert.ok(f.calls[1].args.includes('--no-cache'));
  assert.ok(f.calls[2].args.includes('--no-cache'));
});

test('stops immediately when a build command fails and never reports later outputs', t => {
  const f = fixture(t);
  f.behavior.failAt = 'docker-app';
  assert.throws(() => runFixture(f), /docker-app failed/);
  assert.deepEqual(f.calls.map(call => path.basename(call.args[0])), ['deploy.js', 'build-app.mjs']);
  assert.equal(fs.existsSync(expectedArtifacts(f.localScriptDir, f.version)['docker-allinone'][0]), false);
  assert.equal(fs.existsSync(f.artifactSnapshots[0].directory), false, 'failed builds must clean shared artifacts');
});

test('a missing native JAR stops before either Docker build without using stale output', t => {
  const f = fixture(t);
  f.behavior.omitJar = true;
  assert.throws(() => runFixture(f), /JAR|Jar|jar/);
  assert.equal(f.calls.length, 1);
  assert.equal(fs.existsSync(expectedArtifacts(f.localScriptDir, f.version).native[0]), true);
});

test('incomplete component docs stop before Docker and preserve the native package', t => {
  const f = fixture(t);
  f.behavior.invalidDocs = true;
  assert.throws(() => runFixture(f), /corpusVersion|组件|文档|current/);
  assert.equal(f.calls.length, 1);
  assert.equal(fs.existsSync(expectedArtifacts(f.localScriptDir, f.version).native[0]), true);
});

test('stops when a successful child omitted an expected artifact', t => {
  const f = fixture(t);
  f.behavior.omitArtifactAt = 'docker-app';
  assert.throws(() => runFixture(f), /datavisool-web-app-9\.8\.7-test-linux-amd64\.tar\.gz/);
  assert.deepEqual(f.calls.map(call => path.basename(call.args[0])), ['deploy.js', 'build-app.mjs']);
});

test('rejects existing output before starting any build', t => {
  const f = fixture(t);
  const existing = expectedArtifacts(f.localScriptDir, f.version)['docker-allinone'][1];
  fs.mkdirSync(path.dirname(existing), { recursive: true });
  fs.writeFileSync(existing, 'previous package');

  assert.throws(() => runFixture(f), /已存在|覆盖/);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'previous package');
});

test('rejects an existing native ZIP before starting any build', t => {
  const f = fixture(t);
  const existing = expectedArtifacts(f.localScriptDir, f.version).native[0];
  fs.mkdirSync(path.dirname(existing), { recursive: true });
  fs.writeFileSync(existing, 'previous native package');

  assert.throws(() => runFixture(f), /已存在|覆盖/);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'previous native package');
});

test('dry run prints a plan without execution, filesystem writes, or output collision checks', t => {
  const f = fixture(t);
  const existing = expectedArtifacts(f.localScriptDir, f.version)['docker-app'][0];
  fs.mkdirSync(path.dirname(existing), { recursive: true });
  fs.writeFileSync(existing, 'existing package');
  const logs = [];
  const before = snapshotFiles(f.root);

  buildAll(['--dry-run'], {
    execute: f.execute,
    scriptDir: f.localScriptDir,
    env: f.env,
    log: message => logs.push(message),
  });

  assert.equal(f.calls.length, 0);
  assert.match(logs.join('\n'), /native|常规|docker-app|docker-allinone/i);
  assert.match(logs.join('\n'), /--artifact-dir/);
  assert.deepEqual(snapshotFiles(f.root), before);
});

test('--help displays usage and performs no build', t => {
  const f = fixture(t);
  const logs = [];
  buildAll(['--help'], { execute: f.execute, scriptDir: f.localScriptDir, env: f.env, log: message => logs.push(message) });
  assert.equal(f.calls.length, 0);
  assert.match(logs.join('\n'), /--dry-run/);
  assert.deepEqual(fs.readdirSync(path.join(f.localScriptDir, 'native')), []);
  assert.equal(fs.existsSync(path.join(f.localScriptDir, 'release')), false);
});
