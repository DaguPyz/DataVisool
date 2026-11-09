/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {inflateRawSync} from 'node:zlib';
import {prepareDockerArtifacts, validatePreparedDockerArtifacts, validateReleaseJar} from '../lib/docker-artifacts.mjs';
import {createDockerArtifactFixture, createZipFixture} from './docker-artifacts.fixture.mjs';

const hashFile = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function zipEntries(filename) {
  const buffer = fs.readFileSync(filename);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xffff); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50
        && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
      eocd = offset;
      break;
    }
  }
  assert.notEqual(eocd, -1);
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  const centralOrder = [];
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : inflateRawSync(compressed);
    assert.equal(data.length, uncompressedSize);
    entries.set(name, {method, data, localOffset, compressedSize, uncompressedSize});
    centralOrder.push(name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const localOrder = [...entries.values()].sort((left, right) => left.localOffset - right.localOffset);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < localOrder.length; index++) {
    const entry = localOrder[index];
    const end = index + 1 < localOrder.length ? localOrder[index + 1].localOffset : centralOffset;
    entry.rawLocal = buffer.subarray(entry.localOffset, end);
  }
  entries.centralOrder = centralOrder;
  entries.localOrder = localOrder.map(entry => [...entries].find(([, value]) => value === entry)[0]);
  entries.comment = buffer.subarray(eocd + 22).toString('utf8');
  return entries;
}

function reorderCentralDirectory(buffer, names) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xffff); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50
        && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
      eocd = offset;
      break;
    }
  }
  assert.notEqual(eocd, -1);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  let cursor = centralOffset;
  const records = new Map();
  while (cursor < centralOffset + centralSize) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    records.set(name, buffer.subarray(cursor, end));
    cursor = end;
  }
  assert.deepEqual([...records.keys()].sort(), [...names].sort());
  return Buffer.concat([
    buffer.subarray(0, centralOffset),
    ...names.map(name => records.get(name)),
    buffer.subarray(eocd),
  ]);
}

function listFiles(root) {
  const files = [];
  const walk = (directory, relative = '') => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(child, childRelative);
      else files.push(childRelative);
    }
  };
  walk(root);
  return files.sort();
}

function withFixture(run, options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-artifacts-test-'));
  try {
    const fixture = createDockerArtifactFixture(root, options);
    return run(fixture, root);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

test('prepare filters configuration and runtime entries, copies only referenced docs, and preserves source artifacts', () => {
  withFixture(({jarPath, componentDocsDir}) => {
    const jarHash = hashFile(jarPath);
    const docsHash = hashFile(path.join(componentDocsDir, 'current.json'));
    fs.mkdirSync(path.join(componentDocsDir, 'remote'), {recursive: true});
    fs.writeFileSync(path.join(componentDocsDir, 'remote', 'runtime.json'), 'remote runtime data');
    fs.writeFileSync(path.join(componentDocsDir, 'unused.txt'), 'unreferenced');

    const prepared = prepareDockerArtifacts({jarPath, componentDocsDir});
    try {
      assert.equal(validatePreparedDockerArtifacts(prepared.contextDir), undefined);
      assert.deepEqual(fs.readdirSync(prepared.contextDir).sort(), ['component-docs', 'server.jar']);
      const docs = listFiles(path.join(prepared.contextDir, 'component-docs'));
      const version = JSON.parse(fs.readFileSync(path.join(componentDocsDir, 'current.json'), 'utf8')).corpusVersion;
      assert.deepEqual(docs, [
        `builtin/${version}/components/Fixture/Fixture.md`,
        `builtin/${version}/index.json`,
        'current.json',
      ]);
      assert.equal(docs.some(value => value.includes('/remote/') || value === 'remote'), false);
      assert.equal(docs.includes('unused.txt'), false);

      const entries = zipEntries(path.join(prepared.contextDir, 'server.jar'));
      for (const name of [
        'META-INF/MANIFEST.MF',
        'BOOT-INF/classes/webapp/index.html',
        'BOOT-INF/classes/example/fixture/Application.class',
      ]) assert.equal(entries.has(name), true, `保留 ${name}`);
      for (const name of [
        'BOOT-INF/classes/application.yml',
        'BOOT-INF/classes/logs/runtime.log',
        'BOOT-INF/classes/example/fixture/private.key',
        'BOOT-INF/classes/.env.production',
        'BOOT-INF/classes/.npmrc',
        'BOOT-INF/classes/license.zip',
        'BOOT-INF/classes/example/fixture/license.lic',
        'BOOT-INF/classes/example/fixture/private.pem',
        'BOOT-INF/classes/agent-project-workspaces/cache.json',
        'BOOT-INF/classes/ai-driven/workspaces/run.json',
        'BOOT-INF/classes/ai-driven/attachment-staging/upload.bin',
        'BOOT-INF/classes/component-docs/remote/runtime.json',
      ]) assert.equal(entries.has(name), false, `过滤 ${name}`);
      assert.equal(entries.get('BOOT-INF/lib/fixture-library.jar').method, 0);
      const sourceEntries = zipEntries(jarPath);
      assert.deepEqual(entries.get('BOOT-INF/lib/fixture-library.jar').data,
        sourceEntries.get('BOOT-INF/lib/fixture-library.jar').data);
      assert.equal(hashFile(jarPath), jarHash);
      assert.equal(hashFile(path.join(componentDocsDir, 'current.json')), docsHash);
    } finally {
      prepared.cleanup();
      prepared.cleanup();
    }
    assert.equal(fs.existsSync(prepared.contextDir), false);
  });
});

test('copies exactly current index document and fragment references', () => {
  withFixture(({jarPath, componentDocsDir}) => {
    const version = JSON.parse(fs.readFileSync(path.join(componentDocsDir, 'current.json'), 'utf8')).corpusVersion;
    const indexPath = path.join(componentDocsDir, 'builtin', version, 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const fragmentText = '{"color":"#336699"}';
    const fragment = Buffer.from(fragmentText);
    index.fragments['<g2plot-line>'] = {
      path: 'common/line.json',
      sha256: createHash('sha256').update(fragment).digest('hex'),
      bytes: fragment.length,
    };
    fs.writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
    fs.mkdirSync(path.join(componentDocsDir, 'builtin', version, 'common'), {recursive: true});
    fs.writeFileSync(path.join(componentDocsDir, 'builtin', version, 'common', 'line.json'), fragment);

    const prepared = prepareDockerArtifacts({jarPath, componentDocsDir});
    try {
      assert.equal(fs.readFileSync(path.join(prepared.contextDir, 'component-docs/builtin', version, 'common/line.json'), 'utf8'), fragmentText);
      validatePreparedDockerArtifacts(prepared.contextDir);
    } finally {
      prepared.cleanup();
    }
  }, {fragments: [{label: '<g2plot-line>', fileName: 'line.json', content: '{"color":"#336699"}'}]});
});

test('normalizes generated artifact permissions despite restrictive umask and private source files', t => {
  if (process.platform === 'win32') {
    t.skip('Windows does not expose POSIX mode bits');
    return;
  }
  withFixture(({jarPath, componentDocsDir}) => {
    const sourceDocsFiles = listFiles(componentDocsDir).map(file => path.join(componentDocsDir, ...file.split('/')));
    for (const file of sourceDocsFiles) fs.chmodSync(file, 0o600);
    const originalJarMode = fs.statSync(jarPath).mode & 0o777;
    const originalUmask = process.umask(0o077);
    let prepared;
    try {
      prepared = prepareDockerArtifacts({jarPath, componentDocsDir});
    } finally {
      process.umask(originalUmask);
    }

    try {
      const mode = pathname => fs.statSync(pathname).mode & 0o777;
      assert.equal(mode(prepared.contextDir), 0o755);
      assert.equal(mode(path.join(prepared.contextDir, 'server.jar')), 0o644);
      const walk = directory => {
        assert.equal(mode(directory), 0o755, `目录权限：${path.relative(prepared.contextDir, directory)}`);
        for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
          const child = path.join(directory, entry.name);
          if (entry.isDirectory()) walk(child);
          else assert.equal(mode(child), 0o644, `文件权限：${path.relative(prepared.contextDir, child)}`);
        }
      };
      walk(path.join(prepared.contextDir, 'component-docs'));
      assert.ok(sourceDocsFiles.every(file => (fs.statSync(file).mode & 0o777) === 0o600));
      assert.equal(fs.statSync(jarPath).mode & 0o777, originalJarMode);
    } finally {
      prepared.cleanup();
    }
  });
});

test('rewrites offsets while preserving DEFLATE data descriptors, local records, central order, and ZIP comment', () => {
  withFixture(({componentDocsDir}, root) => {
    const manifest = [
      'Manifest-Version: 1.0',
      'Main-Class: org.springframework.boot.loader.launch.JarLauncher',
      'Start-Class: example.fixture.Application',
      '',
    ].join('\r\n');
    const localNames = [
      'META-INF/MANIFEST.MF',
      'BOOT-INF/classes/example/fixture/Before.class',
      'BOOT-INF/classes/application-prod.yml',
      'BOOT-INF/classes/webapp/index.html',
      'BOOT-INF/lib/fixture-library.jar',
      'BOOT-INF/classes/example/fixture/After.class',
    ];
    const jarPath = path.join(root, 'ordered-server.jar');
    const initial = createZipFixture([
      {name: localNames[0], data: manifest},
      {name: localNames[1], data: Buffer.from('deflated class before'), method: 8, descriptor: true},
      {name: localNames[2], data: 'must be removed'},
      {name: localNames[3], data: '<html>kept front end</html>', method: 8, descriptor: true},
      {name: localNames[4], data: 'stored nested library'},
      {name: localNames[5], data: Buffer.from('deflated class after'), method: 8, descriptor: true},
    ], {comment: 'docker-artifact-zip-comment'});
    const centralNames = [localNames[5], localNames[3], localNames[0], localNames[2], localNames[4], localNames[1]];
    fs.writeFileSync(jarPath, reorderCentralDirectory(initial, centralNames));

    const source = zipEntries(jarPath);
    assert.notDeepEqual(source.localOrder, source.centralOrder);
    const prepared = prepareDockerArtifacts({jarPath, componentDocsDir});
    try {
      const output = zipEntries(path.join(prepared.contextDir, 'server.jar'));
      const keptNames = localNames.filter(name => name !== localNames[2]);
      assert.equal(source.comment, 'docker-artifact-zip-comment');
      assert.equal(output.comment, source.comment);
      assert.deepEqual(output.centralOrder, centralNames.filter(name => name !== localNames[2]));
      assert.deepEqual(output.localOrder, keptNames);
      for (const name of keptNames) {
        assert.deepEqual(output.get(name).rawLocal, source.get(name).rawLocal, `原样保留 local record：${name}`);
        assert.deepEqual(output.get(name).data, source.get(name).data, `原样保留解压内容：${name}`);
      }
      assert.equal(output.has(localNames[2]), false);
      assert.ok(output.get(localNames[3]).localOffset < source.get(localNames[3]).localOffset,
        '删除夹在中间的配置后，后续 local offset 已重写');
      validatePreparedDockerArtifacts(prepared.contextDir);
    } finally {
      prepared.cleanup();
    }
  });
});

test('validation rejects extra files, extra docs, and source configuration leaks', () => {
  withFixture(({jarPath, componentDocsDir}) => {
    const prepared = prepareDockerArtifacts({jarPath, componentDocsDir});
    try {
      fs.writeFileSync(path.join(prepared.contextDir, '.env'), 'secret');
      assert.throws(() => validatePreparedDockerArtifacts(prepared.contextDir), /顶层/);
      fs.rmSync(path.join(prepared.contextDir, '.env'));
      fs.writeFileSync(path.join(prepared.contextDir, 'component-docs/remote.json'), 'remote');
      assert.throws(() => validatePreparedDockerArtifacts(prepared.contextDir), /未引用文件/);
      fs.rmSync(path.join(prepared.contextDir, 'component-docs/remote.json'));

      const jarFile = path.join(prepared.contextDir, 'server.jar');
      const leaked = createZipFixture([
        ...[...zipEntries(jarFile)].map(([name, {data, method}]) => ({name, data, method})),
        {name: 'BOOT-INF/classes/application-prod.yml', data: 'must never ship'},
      ]);
      fs.writeFileSync(jarFile, leaked);
      assert.throws(() => validatePreparedDockerArtifacts(prepared.contextDir), /禁止的配置或运行数据/);
    } finally {
      prepared.cleanup();
    }
  });
});

test('rejects invalid ZIP paths, duplicate members, ZIP64, corruption, and compressed nested jars', () => {
  withFixture(({jarPath, componentDocsDir}, root) => {
    const original = fs.readFileSync(jarPath);
    const required = [
      {name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0\r\nMain-Class: org.springframework.boot.loader.launch.JarLauncher\r\nStart-Class: example.App\r\n\r\n'},
      {name: 'BOOT-INF/classes/webapp/index.html', data: '<html></html>'},
      {name: 'BOOT-INF/lib/library.jar', data: 'stored nested archive'},
    ];
    const rejects = bytes => {
      const invalidJar = path.join(root, 'invalid.jar');
      fs.writeFileSync(invalidJar, bytes);
      assert.throws(() => prepareDockerArtifacts({jarPath: invalidJar, componentDocsDir}), /Docker 构建产物无效/);
    };

    rejects(createZipFixture([...required, {name: '../escape', data: 'x'}]));
    rejects(createZipFixture([...required, {name: 'BOOT-INF/classes/webapp/index.html', data: 'duplicate'}]));
    rejects(createZipFixture([
      {...required[0], extra: Buffer.from([1, 0, 0, 0])}, ...required.slice(1),
    ]));
    const badCrc = Buffer.from(original);
    const eocd = badCrc.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const centralOffset = badCrc.readUInt32LE(eocd + 16);
    badCrc[centralOffset + 16] ^= 0xff;
    rejects(badCrc);

    rejects(createZipFixture([
      ...required.slice(0, 2),
      {...required[2], method: 8},
    ]));
  });
});

test('release validation accepts a regular Spring Boot JAR and rejects missing entry points', () => {
  withFixture(({jarPath, componentDocsDir}) => {
    assert.equal(validateReleaseJar(jarPath), undefined);
    const prepared = prepareDockerArtifacts({jarPath, componentDocsDir});
    prepared.cleanup();
    const entries = [...zipEntries(jarPath)].map(([name, {data, method}]) => ({name, data, method}));
    const manifestName = 'META-INF/MANIFEST.MF';
    const manifest = entries.find(entry => entry.name === manifestName).data.toString();
    for (const field of ['Main-Class', 'Start-Class']) {
      const invalid = manifest.replace(new RegExp(`^${field}:.*\\r?\\n`, 'm'), '');
      fs.writeFileSync(jarPath, createZipFixture(entries.map(entry => entry.name === manifestName ? {...entry, data: invalid} : entry)));
      assert.throws(() => validateReleaseJar(jarPath), new RegExp(field));
    }
  });
});

test('rejects component-docs hash mismatch and symbolic links', () => {
  withFixture(({jarPath, componentDocsDir}) => {
    const version = JSON.parse(fs.readFileSync(path.join(componentDocsDir, 'current.json'), 'utf8')).corpusVersion;
    const document = path.join(componentDocsDir, 'builtin', version, 'components/Fixture/Fixture.md');
    const original = fs.readFileSync(document, 'utf8');
    fs.writeFileSync(document, `${original}changed`);
    assert.throws(() => prepareDockerArtifacts({jarPath, componentDocsDir}), /不匹配/);
    fs.writeFileSync(document, original);

    const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docs-link-test-'));
    try {
      const linkDocs = path.join(linkRoot, 'component-docs');
      fs.cpSync(componentDocsDir, linkDocs, {recursive: true, dereference: true});
      const linkDoc = path.join(linkDocs, 'builtin', version, 'components/Fixture/Fixture.md');
      const saved = `${linkDoc}.saved`;
      fs.renameSync(linkDoc, saved);
      fs.symlinkSync(saved, linkDoc);
      assert.throws(() => prepareDockerArtifacts({jarPath, componentDocsDir: linkDocs}), /符号链接|真实文件/);
    } finally {
      fs.rmSync(linkRoot, {recursive: true, force: true});
    }
  });
});
