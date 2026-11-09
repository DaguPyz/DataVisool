/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createDockerArtifactFixture } from './docker-artifacts.fixture.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { patchZipUnixCreator } = require('../lib/zip-unix-platform.cjs');

const SCRIPT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

function launcherSourceBytes(name) {
  const content = fs.readFileSync(path.join(SCRIPT_DIR, 'launcher', name));
  const normalized = content.toString('utf8').replace(/\r\n|\r|\n/g, '\n');
  return Buffer.from(name.endsWith('.cmd') || name.endsWith('.ps1')
    ? normalized.replace(/\n/g, '\r\n') : normalized);
}

function zipEntries(buffer) {
  const endOfCentralDirectory = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(endOfCentralDirectory, -1, 'ZIP central directory should exist');
  let entryCount = buffer.readUInt16LE(endOfCentralDirectory + 10);
  let centralSize = buffer.readUInt32LE(endOfCentralDirectory + 12);
  let declaredCentralOffset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  let centralBoundary = endOfCentralDirectory;
  if (entryCount === 0xffff || centralSize === 0xffffffff || declaredCentralOffset === 0xffffffff) {
    const zip64Offset = Number(buffer.readBigUInt64LE(endOfCentralDirectory - 12));
    assert.equal(buffer.readUInt32LE(zip64Offset), 0x06064b50, 'ZIP64 end record should be valid');
    entryCount = Number(buffer.readBigUInt64LE(zip64Offset + 32));
    centralSize = Number(buffer.readBigUInt64LE(zip64Offset + 40));
    declaredCentralOffset = Number(buffer.readBigUInt64LE(zip64Offset + 48));
    centralBoundary = zip64Offset;
  }
  const centralOffset = centralBoundary - centralSize;
  const archivePrefixLength = centralOffset - declaredCentralOffset;
  let offset = centralOffset;
  const entries = new Map();
  const modes = new Map();
  const creators = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'central directory entry should be valid');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42) + archivePrefixLength;
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    assert.equal(buffer.readUInt32LE(localHeaderOffset), 0x04034b50, 'local ZIP header should be valid');
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const content = compressionMethod === 0 ? compressed
      : compressionMethod === 8 ? inflateRawSync(compressed)
        : assert.fail(`unsupported ZIP compression method: ${compressionMethod}`);
    assert.equal(content.length, uncompressedSize, `${name} should have the expected size`);
    entries.set(name, content);
    modes.set(name, (externalAttributes >>> 16) & 0o777);
    creators.set(name, buffer.readUInt8(offset + 5));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {entries, modes, creators};
}

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries, {
  creatorPlatform = 0,
  comment = Buffer.alloc(0),
  centralTrailer = Buffer.alloc(0),
  prefix = Buffer.alloc(0),
  zip64 = false,
} = {}) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const {name, content, mode = 0o644} of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const contentBytes = Buffer.from(content);
    const checksum = crc32(contentBytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBytes.length, 18);
    localHeader.writeUInt32LE(contentBytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((creatorPlatform << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBytes.length, 20);
    centralHeader.writeUInt32LE(contentBytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE((((0o100000 | mode) << 16) >>> 0), 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + contentBytes.length;
  }

  const centralDirectory = Buffer.concat([...centralParts, centralTrailer]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(comment.length, 20);
  const archivePrefix = Buffer.concat([prefix, ...localParts, centralDirectory]);

  if (!zip64) {
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirectory.length, 12);
    eocd.writeUInt32LE(localOffset, 16);
    return Buffer.concat([archivePrefix, eocd, comment]);
  }

  const zip64Offset = archivePrefix.length;
  const zip64Eocd = Buffer.alloc(56);
  zip64Eocd.writeUInt32LE(0x06064b50, 0);
  zip64Eocd.writeBigUInt64LE(44n, 4);
  zip64Eocd.writeUInt16LE(45, 12);
  zip64Eocd.writeUInt16LE(45, 14);
  zip64Eocd.writeBigUInt64LE(BigInt(entries.length), 24);
  zip64Eocd.writeBigUInt64LE(BigInt(entries.length), 32);
  zip64Eocd.writeBigUInt64LE(BigInt(centralDirectory.length), 40);
  zip64Eocd.writeBigUInt64LE(BigInt(localOffset), 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(zip64Offset), 8);
  locator.writeUInt32LE(1, 16);

  eocd.writeUInt16LE(0xffff, 8);
  eocd.writeUInt16LE(0xffff, 10);
  eocd.writeUInt32LE(0xffffffff, 12);
  eocd.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([archivePrefix, zip64Eocd, locator, eocd, comment]);
}

function createNativeArtifactFixture(root, {jarPath = path.join(root, 'server.jar'), componentDocsDir = path.join(path.dirname(jarPath), 'component-docs')} = {}) {
  const fixture = createDockerArtifactFixture(root, {
    jarPath,
    componentDocsDir,
    fragments: [{
      label: '<g2plot-fixture>',
      fileName: 'contract.json',
      content: '{"schema":"fixture-contract"}\n',
    }],
    extraDocs: [
      {path: 'remote/runtime.json', content: '{"remote":true}\n'},
      {path: 'builtin/old-version/components/Old/Old.md', content: '# Old component\n'},
    ],
  });
  const current = JSON.parse(fs.readFileSync(path.join(fixture.componentDocsDir, 'current.json'), 'utf8'));
  const indexPath = path.join(fixture.componentDocsDir, 'builtin', current.corpusVersion, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const unreferencedPath = path.join(
    fixture.componentDocsDir,
    'builtin', current.corpusVersion,
    'components', 'Unused', 'Unused.md',
  );
  fs.mkdirSync(path.dirname(unreferencedPath), {recursive: true});
  fs.writeFileSync(unreferencedPath, '# Unreferenced component\n');

  return { ...fixture, corpusVersion: current.corpusVersion, indexPath, index };
}

function expectedComponentDocsEntries(componentDocsDir, corpusVersion, index) {
  const relativePaths = new Set([
    'current.json',
    `builtin/${corpusVersion}/index.json`,
    ...index.documents.filter(document => document.source === 'builtin')
      .map(document => `builtin/${corpusVersion}/${document.path}`),
    ...Object.values(index.fragments).map(fragment => `builtin/${corpusVersion}/${fragment.path}`),
  ]);
  return [...relativePaths].map(relativePath => [
    `component-docs/${relativePath}`,
    fs.readFileSync(path.join(componentDocsDir, ...relativePath.split('/'))),
  ]);
}

function findPythonCommand() {
  const candidates = process.platform === 'win32' ? ['python3.exe', 'python.exe'] : ['python3', 'python'];
  for (const command of candidates) {
    const lookup = process.platform === 'win32'
      ? spawnSync('where.exe', [command], {encoding: 'utf8'})
      : spawnSync('/bin/sh', ['-c', `command -v ${command}`], {encoding: 'utf8'});
    if (lookup.status !== 0) continue;
    const executable = lookup.stdout.trim().split(/\r?\n/)[0];
    const probe = spawnSync(executable, ['-c', 'import zipfile'], {encoding: 'utf8'});
    if (probe.status === 0) return {command: command.replace(/\.exe$/i, ''), executable};
  }
  return null;
}

function componentDocArchivePaths(corpusVersion, index) {
  return [
    'component-docs/current.json',
    `component-docs/builtin/${corpusVersion}/index.json`,
    ...index.documents.filter(document => document.source === 'builtin')
      .map(document => `component-docs/builtin/${corpusVersion}/${document.path}`),
    ...Object.values(index.fragments).map(fragment => `component-docs/builtin/${corpusVersion}/${fragment.path}`),
  ];
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function nativeDeployArgs(fixture, outputDir) {
  return [
    path.join(SCRIPT_DIR, 'native/deploy.js'),
    '--skip-build', '--dry-run=false',
    '--local-jar', fixture.jarPath, '--component-docs', fixture.componentDocsDir, '--output-dir', outputDir,
  ];
}

test('native build produces a local package without invoking remote commands', {skip: process.platform === 'win32'}, t => {
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-local-only-')));
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const fixture = createNativeArtifactFixture(path.join(tempDir, 'fixture'));
  const bin = path.join(tempDir, 'bin');
  const mavenLog = path.join(tempDir, 'maven-args.txt');
  const remoteLog = path.join(tempDir, 'remote-invoked.txt');
  const outputDir = path.join(tempDir, 'release');
  fs.mkdirSync(bin);
  const fakeMaven = path.join(bin, 'mvn');
  fs.writeFileSync(fakeMaven, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$MAVEN_ARGS_RECORD"\n');
  fs.chmodSync(fakeMaven, 0o755);
  for (const name of ['ssh', 'scp']) {
    const commandPath = path.join(bin, name);
    fs.writeFileSync(commandPath, '#!/bin/sh\nprintf invoked >> "$REMOTE_COMMAND_RECORD"\nexit 99\n');
    fs.chmodSync(commandPath, 0o755);
  }

  const result = spawnSync(process.execPath, [
    path.join(SCRIPT_DIR, 'native/deploy.js'), '--dry-run=false', '--mvn-command', fakeMaven,
    '--local-jar', fixture.jarPath, '--component-docs', fixture.componentDocsDir, '--output-dir', outputDir,
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
      MAVEN_ARGS_RECORD: mavenLog,
      REMOTE_COMMAND_RECORD: remoteLog,
      DEPLOY_SKIP_BUILD: 'false',
      DEPLOY_SKIP_UPLOAD: 'false',
      DEPLOY_SERVER_HOST: 'obsolete-host.example',
      DEPLOY_DIR: '/obsolete-deploy-dir',
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(fs.readFileSync(mavenLog, 'utf8').trim().split('\n'), [
    '-pl', 'datavisool-service', '-am', 'clean', 'package', '-DskipTests',
  ]);
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
  const zipPath = path.join(outputDir, `datavisool-web-v${version}-release.zip`);
  const {entries} = zipEntries(fs.readFileSync(zipPath));
  assert.deepEqual(entries.get('server.jar'), fs.readFileSync(fixture.jarPath));
  assert.ok(entries.has('component-docs/current.json'));
  assert.equal(fs.existsSync(remoteLog), false, 'neither ssh nor scp may be invoked');
  assert.doesNotMatch(result.stdout, /obsolete-host\.example|obsolete-deploy-dir/);
});

test('native build rejects removed remote deployment options', () => {
  for (const option of [
    '--server-user', '--server-host', '--server-port', '--deploy-dir', '--app-root',
    '--remote-jar', '--upload-name', '--identity-file', '--restart-command',
    '--interactive-ssh', '--ssh-batch-mode', '--skip-upload', '--skip-restart',
  ]) {
    const result = spawnSync(process.execPath, [path.join(SCRIPT_DIR, 'native/deploy.js'), option], {
      cwd: REPO_ROOT, encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, `${option} should no longer be accepted`);
    assert.ok(result.stderr.includes(`未知参数: ${option}`), result.stderr);
  }
});

test('native Python package contains referenced component docs and refuses to overwrite it', t => {
  const python = findPythonCommand();
  if (!python) return t.skip('Python with zipfile is not installed');
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-package-')));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const jarPath = path.join(tempDir, 'artifacts', 'fake-server.jar');
  const componentDocsDir = path.join(tempDir, 'separate-component-docs');
  const fixture = createNativeArtifactFixture(path.join(tempDir, 'fixture'), {jarPath, componentDocsDir});
  const outputDir = path.join(tempDir, 'release');
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
  const zipPath = path.join(outputDir, `datavisool-web-v${version}-release.zip`);
  fs.mkdirSync(outputDir);
  const legacyStagingDir = path.join(outputDir, `datavisool-web-v${version}-release`);
  fs.mkdirSync(legacyStagingDir);
  fs.writeFileSync(path.join(legacyStagingDir, 'keep-me.txt'), 'user data\n');

  const args = [
    path.join(SCRIPT_DIR, 'native/deploy.js'),
    '--skip-build', '--dry-run=false',
    '--local-jar', jarPath, '--component-docs', componentDocsDir, '--output-dir', outputDir,
  ];
  const env = { ...process.env };
  delete env.DEPLOY_DRY_RUN;

  const firstRun = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(firstRun.status, 0, `${firstRun.stdout}\n${firstRun.stderr}`);
  assert.equal(fs.readFileSync(path.join(legacyStagingDir, 'keep-me.txt'), 'utf8'), 'user data\n',
    'a pre-existing directory with the legacy staging name must remain untouched');
  assert.ok(fs.statSync(zipPath).size > 0);
  const {entries, modes, creators} = zipEntries(fs.readFileSync(zipPath));
  assert.deepEqual(entries.get('server.jar'), fs.readFileSync(fixture.jarPath),
    'the release should contain the validated source JAR');
  const launcherFiles = ['deploy_windows.ps1', 'deploy_windows.cmd', 'deploy_linux.sh', 'deploy_macos.command'];
  const componentDocs = expectedComponentDocsEntries(componentDocsDir, fixture.corpusVersion, fixture.index);
  assert.deepEqual([...entries.keys()].sort(), [
    'server.jar', '部署说明.md', 'config/application.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', ...launcherFiles,
    ...componentDocs.map(([archivePath]) => archivePath),
  ].sort());
  assert.equal(entries.size, 9 + componentDocs.length,
    'the native archive contains the JAR, config, deployment docs, launchers, and referenced component docs');
  assert.equal(entries.has('deploy_config.awk'), false);
  assert.equal(entries.has('component-docs/remote/runtime.json'), false);
  assert.equal(entries.has('component-docs/builtin/old-version/components/Old/Old.md'), false);
  assert.equal(entries.has(`component-docs/builtin/${fixture.corpusVersion}/components/Unused/Unused.md`), false);
  for (const [archivePath, content] of componentDocs) {
    assert.deepEqual(entries.get(archivePath), content, `${archivePath} should match its source document`);
  }
  assert.deepEqual(entries.get('config/application.yml'), fs.readFileSync(path.join(SCRIPT_DIR, 'native/application.yml')));
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
    assert.deepEqual(entries.get(name), fs.readFileSync(path.join(REPO_ROOT, name)));
  }
  for (const name of launcherFiles) {
    assert.deepEqual(entries.get(name), launcherSourceBytes(name),
      `${name} should match its launcher source`);
  }
  for (const name of launcherFiles) {
    assert.equal(creators.get(name), 3, `${name} should identify Unix mode attributes to extractors`);
  }
  for (const name of ['deploy_windows.cmd', 'deploy_windows.ps1']) {
    const windowsLauncher = entries.get(name).toString('utf8');
    assert.match(windowsLauncher, /\r\n/, `${name} should use CRLF line endings`);
    assert.doesNotMatch(windowsLauncher.replace(/\r\n/g, ''), /\n/, `${name} should not contain lone LF`);
  }
  for (const name of ['deploy_linux.sh', 'deploy_macos.command']) {
    const shellLauncher = entries.get(name).toString('utf8');
    assert.ok(shellLauncher.includes('\n'), `${name} should have LF line endings`);
    assert.doesNotMatch(shellLauncher, /\r/, `${name} should not contain CR line endings`);
  }
  if (process.platform !== 'win32') {
    assert.equal(modes.get('deploy_windows.ps1'), 0o644);
    assert.equal(modes.get('deploy_windows.cmd'), 0o644);
    assert.equal(modes.get('deploy_linux.sh'), 0o755);
    assert.equal(modes.get('deploy_macos.command'), 0o755);
  }

  const originalZip = fs.readFileSync(zipPath);
  const secondRun = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.notEqual(secondRun.status, 0, 'existing release ZIP should stop the deployment script');
  assert.match(`${secondRun.stdout}\n${secondRun.stderr}`, /已存在/);
  assert.deepEqual(fs.readFileSync(zipPath), originalZip, 'existing release ZIP must remain untouched');
});

test('Windows ZIP metadata repair preserves executable bits and accepts ZIP64 archives', t => {
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-zip-metadata-')));
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const archivePath = path.join(tempDir, 'windows-created.zip');
  const comment = Buffer.from('archive comment');
  const digitalSignature = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x05, 3, 0]), Buffer.from('sig')]);
  const archive = createStoredZip([
    {name: 'deploy_linux.sh', content: '#!/bin/sh\nexit 0\n', mode: 0o755},
    {name: 'deploy_macos.command', content: '#!/bin/sh\nexit 0\n', mode: 0o755},
    {name: 'deploy_windows.cmd', content: '@echo off\r\n', mode: 0o644},
    {name: 'component-docs/current.json', content: '{"version":"fixture"}\n', mode: 0o644},
  ], {comment, centralTrailer: digitalSignature, prefix: Buffer.from('self-extracting-prefix'), zip64: true});
  fs.writeFileSync(archivePath, archive);

  patchZipUnixCreator(archivePath);

  const repaired = fs.readFileSync(archivePath);
  const {entries, modes, creators} = zipEntries(repaired);
  assert.deepEqual([...creators.values()], [3, 3, 3, 3]);
  assert.equal(modes.get('deploy_linux.sh'), 0o755);
  assert.equal(modes.get('deploy_macos.command'), 0o755);
  assert.equal(modes.get('deploy_windows.cmd'), 0o644);
  assert.equal(modes.get('component-docs/current.json'), 0o644);
  assert.equal(entries.get('deploy_linux.sh').toString(), '#!/bin/sh\nexit 0\n');
  assert.equal(repaired.subarray(-comment.length).toString(), comment.toString(), 'ZIP comments remain intact');

  if (process.platform !== 'win32') {
    const unzip = spawnSync('/bin/sh', ['-c', 'command -v unzip'], {encoding: 'utf8'});
    if (unzip.status !== 0) return;
    const extractionArchivePath = path.join(tempDir, 'extractable.zip');
    fs.writeFileSync(extractionArchivePath, createStoredZip([
      {name: 'deploy_linux.sh', content: '#!/bin/sh\nexit 0\n', mode: 0o755},
    ]));
    patchZipUnixCreator(extractionArchivePath);
    const extractedDir = path.join(tempDir, 'extracted');
    const extraction = spawnSync(unzip.stdout.trim(), ['-qq', extractionArchivePath, '-d', extractedDir], {encoding: 'utf8'});
    assert.equal(extraction.status, 0, `${extraction.stdout}\n${extraction.stderr}`);
    assert.equal(fs.statSync(path.join(extractedDir, 'deploy_linux.sh')).mode & 0o777, 0o755,
      'a Unix extractor should restore the launcher executable bit');
  }
});

test('Windows ZIP metadata repair validates all entries before changing the archive', t => {
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-zip-invalid-')));
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const archivePath = path.join(tempDir, 'damaged.zip');
  const archive = createStoredZip([
    {name: 'first.sh', content: '#!/bin/sh\n', mode: 0o755},
    {name: 'second.sh', content: '#!/bin/sh\n', mode: 0o755},
  ]);
  const endOfCentralDirectory = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectory + 16);
  const firstNameLength = archive.readUInt16LE(centralDirectoryOffset + 28);
  archive.writeUInt32LE(0, centralDirectoryOffset + 46 + firstNameLength);
  fs.writeFileSync(archivePath, archive);
  const original = fs.readFileSync(archivePath);

  assert.throws(() => patchZipUnixCreator(archivePath), /中央目录第 2 条记录损坏/);
  assert.deepEqual(fs.readFileSync(archivePath), original,
    'an invalid ZIP must remain unchanged and cannot be published as repaired');
});

test('native ZIP fallback preserves launchers and executable permissions without Python', {
  skip: process.platform === 'win32',
}, t => {
  const zipCommand = spawnSync('/bin/sh', ['-c', 'command -v zip'], { encoding: 'utf8' });
  if (zipCommand.status !== 0) return t.skip('zip is not installed');
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-zip-fallback-')));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const bin = path.join(tempDir, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(zipCommand.stdout.trim(), path.join(bin, 'zip'));
  const artifactDir = path.join(tempDir, 'artifacts');
  const fixture = createNativeArtifactFixture(artifactDir);
  const output = path.join(tempDir, 'release with spaces');
  const result = spawnSync(process.execPath, [
    path.join(SCRIPT_DIR, 'native/deploy.js'),
    '--skip-build', '--dry-run=false',
    '--local-jar', fixture.jarPath, '--output-dir', output,
  ], { cwd: REPO_ROOT, env: { ...process.env, PATH: bin }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const archive = fs.readdirSync(output).find(name => name.endsWith('.zip'));
  const { entries, modes } = zipEntries(fs.readFileSync(path.join(output, archive)));
  assert.deepEqual(entries.get('server.jar'), fs.readFileSync(fixture.jarPath));
  const componentDocs = expectedComponentDocsEntries(fixture.componentDocsDir, fixture.corpusVersion, fixture.index);
  assert.deepEqual([...entries.keys()].filter(name => name.startsWith('component-docs/') && !name.endsWith('/')).sort(),
    componentDocArchivePaths(fixture.corpusVersion, fixture.index).sort());
  for (const [archivePath, content] of componentDocs) {
    assert.deepEqual(entries.get(archivePath), content, `${archivePath} should match its source document`);
  }
  assert.equal(entries.has('component-docs/remote/runtime.json'), false);
  assert.equal(entries.has('component-docs/builtin/old-version/components/Old/Old.md'), false);
  assert.equal(entries.has(`component-docs/builtin/${fixture.corpusVersion}/components/Unused/Unused.md`), false);
  assert.deepEqual(entries.get('config/application.yml'), fs.readFileSync(path.join(SCRIPT_DIR, 'native/application.yml')));
  const packagedConfig = entries.get('config/application.yml').toString('utf8');
  assert.match(packagedConfig, /jdbc:mysql:\/\/127\.0\.0\.1:3306\/\?serverTimezone=/);
  assert.match(packagedConfig, /^\s+username:\s*$/m);
  assert.match(packagedConfig, /^\s+password:\s*$/m);
  assert.match(entries.get('部署说明.md').toString('utf8'), /数据库名、用户名和密码均留空。首次启动会依次询问这三项/);
  for (const name of ['deploy_windows.cmd', 'deploy_windows.ps1', 'deploy_linux.sh', 'deploy_macos.command']) {
    assert.deepEqual(entries.get(name), launcherSourceBytes(name));
    assert.equal(modes.get(name), name === 'deploy_linux.sh' || name === 'deploy_macos.command' ? 0o755 : 0o644);
  }
});

test('native packaging fails without creating a ZIP when component docs are missing or damaged', t => {
  const cases = [
    {
      name: 'missing referenced component document',
      errorPattern: /组件文档文件 不存在：.*components[\\/]Fixture[\\/]Fixture\.md/,
      damage: fixture => fs.rmSync(path.join(
        fixture.componentDocsDir, 'builtin', fixture.corpusVersion, ...fixture.index.documents[0].path.split('/'),
      )),
    },
    {
      name: 'damaged referenced component document',
      errorPattern: /组件文档 内容与 index\.json 不匹配：builtin[\\/]\S+?[\\/]components[\\/]Fixture[\\/]Fixture\.md/,
      damage: fixture => fs.writeFileSync(path.join(
        fixture.componentDocsDir, 'builtin', fixture.corpusVersion, ...fixture.index.documents[0].path.split('/'),
      ), '# content no longer matches the index checksum\n'),
    },
    {
      name: 'damaged current-version index',
      errorPattern: /component-docs index\.json 无法解析：/,
      damage: fixture => fs.writeFileSync(fixture.indexPath, '{invalid json\n'),
    },
  ];
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;

  for (const [index, scenario] of cases.entries()) {
    const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `datavisool-native-package-invalid-${index}-`)));
    t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
    const fixture = createNativeArtifactFixture(path.join(tempDir, 'artifacts'));
    scenario.damage(fixture);
    const outputDir = path.join(tempDir, 'release');
    const result = spawnSync(process.execPath, [
      path.join(SCRIPT_DIR, 'native/deploy.js'),
      '--skip-build', '--dry-run=false',
      '--local-jar', fixture.jarPath, '--output-dir', outputDir,
    ], {cwd: REPO_ROOT, env: {...process.env, DEPLOY_DRY_RUN: 'false'}, encoding: 'utf8'});

    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, `${scenario.name} should stop packaging: ${output}`);
    assert.match(output, scenario.errorPattern, `${scenario.name} should fail for the damaged artifact itself`);
    assert.equal(fs.existsSync(path.join(outputDir, `datavisool-web-v${version}-release.zip`)), false,
      `${scenario.name} must not leave a ZIP archive`);
  }
});

test('native Maven invocation cleans before packaging and leaves legacy staging data untouched on failure', {skip: process.platform === 'win32'}, t => {
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-maven-failure-')));
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const fixture = createNativeArtifactFixture(path.join(tempDir, 'artifacts'));
  const outputDir = path.join(tempDir, 'release');
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
  const legacyStagingDir = path.join(outputDir, `datavisool-web-v${version}-release`);
  fs.mkdirSync(legacyStagingDir, {recursive: true});
  fs.writeFileSync(path.join(legacyStagingDir, 'keep-me.txt'), 'pre-existing user data\n');
  const bin = path.join(tempDir, 'bin');
  fs.mkdirSync(bin);
  const fakeMaven = path.join(bin, 'mvn');
  const mavenArgsPath = path.join(tempDir, 'maven-args.txt');
  fs.writeFileSync(fakeMaven, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$MAVEN_ARGS_RECORD"\nexit 23\n');
  fs.chmodSync(fakeMaven, 0o755);

  const result = spawnSync(process.execPath, [
    path.join(SCRIPT_DIR, 'native/deploy.js'),
    '--dry-run=false', '--mvn-command', 'mvn', '--maven-home', tempDir,
    '--local-jar', fixture.jarPath, '--output-dir', outputDir,
  ], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
      MAVEN_ARGS_RECORD: mavenArgsPath,
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /构建单服务产物 失败，退出码 23/);
  assert.deepEqual(fs.readFileSync(mavenArgsPath, 'utf8').trim().split('\n'), [
    '-pl', 'datavisool-service', '-am', 'clean', 'package', '-DskipTests',
  ], 'Maven must clean the reactor before packaging to remove stale copied web resources');
  assert.equal(fs.readFileSync(path.join(legacyStagingDir, 'keep-me.txt'), 'utf8'), 'pre-existing user data\n');
  assert.deepEqual(fs.readdirSync(outputDir), [`datavisool-web-v${version}-release`],
    'the failed run should clean only its unique workspace');
});

test('failed archiver leaves no partial final ZIP and a later run can retry', {skip: process.platform === 'win32'}, t => {
  const python = findPythonCommand();
  if (!python) return t.skip('Python is not installed');
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-archive-retry-')));
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const fixture = createNativeArtifactFixture(path.join(tempDir, 'artifacts'));
  const outputDir = path.join(tempDir, 'release');
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
  const zipPath = path.join(outputDir, `datavisool-web-v${version}-release.zip`);
  const bin = path.join(tempDir, 'bin');
  fs.mkdirSync(bin);
  const helper = path.join(tempDir, 'fail-archiver.py');
  fs.writeFileSync(helper, [
    'import json, pathlib, re, sys',
    'source = sys.argv[2]',
    'match = re.search(r"^zip_path = pathlib\\.Path\\((.*)\\)$", source, re.MULTILINE)',
    'assert match, "could not locate temporary archive path"',
    'pathlib.Path(json.loads(match.group(1))).write_bytes(b"partial archive")',
    'raise SystemExit(23)',
  ].join('\n'));
  const fakePython = path.join(bin, 'python3');
  fs.writeFileSync(fakePython, `#!/bin/sh\nexec ${shellQuote(python.executable)} ${shellQuote(helper)} "$@"\n`);
  fs.chmodSync(fakePython, 0o755);

  const failedRun = spawnSync(process.execPath, nativeDeployArgs(fixture, outputDir), {
    cwd: REPO_ROOT,
    env: {...process.env, PATH: bin},
    encoding: 'utf8',
  });
  assert.notEqual(failedRun.status, 0, `${failedRun.stdout}\n${failedRun.stderr}`);
  assert.match(`${failedRun.stdout}\n${failedRun.stderr}`, /生成标准 ZIP 发布包 失败，退出码 23/);
  assert.equal(fs.existsSync(zipPath), false, 'a partial archive must never appear at the final path');
  assert.deepEqual(fs.readdirSync(outputDir), [], 'the failed run should remove its partial temporary ZIP');

  const retry = spawnSync(process.execPath, nativeDeployArgs(fixture, outputDir), {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(retry.status, 0, `${retry.stdout}\n${retry.stderr}`);
  assert.ok(fs.statSync(zipPath).size > 0, 'a clean retry should publish a complete ZIP');
  const {entries} = zipEntries(fs.readFileSync(zipPath));
  assert.deepEqual(entries.get('server.jar'), fs.readFileSync(fixture.jarPath));
  assert.ok(entries.has('component-docs/current.json'), 'the retry should preserve component docs in the package');
});

test('concurrent ZIP publication does not overwrite the winning archive', {skip: process.platform === 'win32'}, t => {
  const python = findPythonCommand();
  if (!python) return t.skip('Python is not installed');
  const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-native-publish-race-')));
  t.after(() => fs.rmSync(tempDir, {recursive: true, force: true}));
  const fixture = createNativeArtifactFixture(path.join(tempDir, 'artifacts'));
  const outputDir = path.join(tempDir, 'release');
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
  const zipPath = path.join(outputDir, `datavisool-web-v${version}-release.zip`);
  const bin = path.join(tempDir, 'bin');
  fs.mkdirSync(bin);
  const winnerContents = 'published by the competing process\n';
  const fakePython = path.join(bin, 'python3');
  fs.writeFileSync(fakePython, [
    '#!/bin/sh',
    `${shellQuote(python.executable)} "$@"`,
    'status=$?',
    'if [ "$status" -ne 0 ]; then exit "$status"; fi',
    `printf '%s' ${shellQuote(winnerContents)} > ${shellQuote(zipPath)}`,
    'exit 0',
    '',
  ].join('\n'));
  fs.chmodSync(fakePython, 0o755);

  const result = spawnSync(process.execPath, nativeDeployArgs(fixture, outputDir), {
    cwd: REPO_ROOT,
    env: {...process.env, PATH: bin},
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /发布 ZIP 已存在，为避免覆盖/);
  assert.equal(fs.readFileSync(zipPath, 'utf8'), winnerContents,
    'the losing publisher must preserve the archive created after its initial existence check');
  assert.deepEqual(fs.readdirSync(outputDir), [path.basename(zipPath)],
    'the losing run should clean its temporary files');
});
