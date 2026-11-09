/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareDockerArtifacts } from '../lib/docker-artifacts.mjs';
import { createDockerBuildContext } from '../lib/docker-build-context.mjs';
import { writeArtifactFixture } from './docker-artifacts.fixture.mjs';

const buildDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Opt in on a host with Docker/BuildKit. No base image pull or container is needed.
test('BuildKit receives every allinone COPY source after applying its dockerignore', {
  skip: process.env.DATAVISOOL_TEST_DOCKER_CONTEXT !== '1',
}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-ignore-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prepared = prepareDockerArtifacts(writeArtifactFixture(root));
  t.after(() => prepared.cleanup());
  const variantDir = path.join(buildDir, 'docker-allinone');
  const context = createDockerBuildContext({ artifactDir: prepared.contextDir, assets: {
    'LICENSE': path.join(buildDir, '../../LICENSE'),
    'THIRD_PARTY_NOTICES.txt': path.join(buildDir, '../../THIRD_PARTY_NOTICES.txt'),
    'runtime.py': path.join(variantDir, 'runtime.py'),
    'patch-mysql-entrypoint.py': path.join(variantDir, 'patch-mysql-entrypoint.py'),
    'application.yml': path.join(variantDir, 'config/application.yml'),
  } });
  t.after(() => context.cleanup());
  const copyInstructions = fs.readFileSync(path.join(variantDir, 'Dockerfile'), 'utf8')
    .split('\n').filter(line => /^COPY\s+(?!--from=)/.test(line));
  assert.ok(copyInstructions.length > 0);
  const dockerfile = path.join(root, 'Dockerfile');
  fs.writeFileSync(dockerfile, `FROM scratch\n${copyInstructions.join('\n')}\n`);
  fs.copyFileSync(path.join(variantDir, 'Dockerfile.dockerignore'), `${dockerfile}.dockerignore`);
  const outputDir = path.join(root, 'output');
  const result = spawnSync('docker', ['buildx', 'build', '--file', dockerfile,
    '--output', `type=local,dest=${outputDir}`, context.contextDir], {
    encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(result.status, 0, result.error?.message || `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(fs.readFileSync(path.join(outputDir, 'tmp/patch-mysql-entrypoint.py')),
    fs.readFileSync(path.join(variantDir, 'patch-mysql-entrypoint.py')));
  assert.deepEqual(fs.readFileSync(path.join(outputDir, 'datavisool/server/server.jar')),
    fs.readFileSync(path.join(prepared.contextDir, 'server.jar')));
});

test('variant context stays separate and readable by the non-root image user under a restrictive umask', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-readable-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = writeArtifactFixture(root);
  const prepared = prepareDockerArtifacts(fixture);
  t.after(() => prepared.cleanup());
  const originalJar = fs.readFileSync(path.join(prepared.contextDir, 'server.jar'));
  const asset = path.join(root, 'runtime.py');
  const patchAsset = path.join(root, 'patch-mysql-entrypoint.py');
  fs.writeFileSync(asset, '# runtime fixture\n', { mode: 0o600 });
  fs.writeFileSync(patchAsset, '# patch fixture\n', { mode: 0o600 });

  let context;
  const previousMask = process.umask(0o077);
  try {
    context = createDockerBuildContext({ artifactDir: prepared.contextDir, assets: {
      'runtime.py': asset,
      'patch-mysql-entrypoint.py': patchAsset,
    } });
  } finally {
    process.umask(previousMask);
  }
  try {
    assert.notEqual(context.contextDir, prepared.contextDir);
    assert.deepEqual(fs.readdirSync(context.contextDir).sort(), ['component-docs', 'patch-mysql-entrypoint.py', 'runtime.py', 'server.jar']);
    assert.deepEqual(fs.readdirSync(prepared.contextDir).sort(), ['component-docs', 'server.jar']);
    assert.deepEqual(fs.readFileSync(path.join(prepared.contextDir, 'server.jar')), originalJar);
    assert.deepEqual(fs.readFileSync(path.join(context.contextDir, 'server.jar')), originalJar);
    if (process.platform !== 'win32') {
      const check = filename => {
        const stat = fs.statSync(filename);
        assert.equal(stat.mode & 0o777, stat.isDirectory() ? 0o755 : 0o644, filename);
        if (stat.isDirectory()) for (const name of fs.readdirSync(filename)) check(path.join(filename, name));
      };
      check(path.join(context.contextDir, 'server.jar'));
      check(path.join(context.contextDir, 'runtime.py'));
      check(path.join(context.contextDir, 'patch-mysql-entrypoint.py'));
      check(path.join(context.contextDir, 'component-docs'));
      assert.equal(fs.statSync(asset).mode & 0o777, 0o600, 'source permissions must stay unchanged');
      assert.equal(fs.statSync(patchAsset).mode & 0o777, 0o600, 'patch source permissions must stay unchanged');
    }
  } finally {
    context.cleanup();
  }
  assert.equal(fs.existsSync(context.contextDir), false);
  assert.equal(fs.existsSync(prepared.contextDir), true, 'variant cleanup must retain shared artifacts');
});
