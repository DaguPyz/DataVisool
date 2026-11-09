/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

const hash = value => createHash('sha256').update(value).digest('hex');

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** Create a small ZIP fixture. Entries can request DEFLATE and signed descriptors. */
export function createZipFixture(entries, {comment = ''} = {}) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const item of entries) {
    const name = Buffer.from(item.name, 'utf8');
    const content = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data ?? '');
    const method = item.method ?? 0;
    const compressed = method === 0 ? content : method === 8 ? deflateRawSync(content) : Buffer.from(content);
    const extra = item.extra ? Buffer.from(item.extra) : Buffer.alloc(0);
    const flags = 0x0800 | (item.descriptor ? 0x0008 : 0);
    const crc = crc32(content);
    const local = Buffer.alloc(30 + name.length + extra.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(item.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(item.descriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(item.descriptor ? 0 : content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    name.copy(local, 30);
    extra.copy(local, 30 + name.length);
    const descriptor = item.descriptor ? Buffer.from([
      0x50, 0x4b, 0x07, 0x08,
      crc & 0xff, crc >>> 8 & 0xff, crc >>> 16 & 0xff, crc >>> 24 & 0xff,
      compressed.length & 0xff, compressed.length >>> 8 & 0xff,
      compressed.length >>> 16 & 0xff, compressed.length >>> 24 & 0xff,
      content.length & 0xff, content.length >>> 8 & 0xff,
      content.length >>> 16 & 0xff, content.length >>> 24 & 0xff,
    ]) : Buffer.alloc(0);
    localParts.push(local, compressed, descriptor);

    const central = Buffer.alloc(46 + name.length + extra.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    extra.copy(central, 46 + name.length);
    centralParts.push(central);
    localOffset += local.length + compressed.length + descriptor.length;
  }
  const central = Buffer.concat(centralParts);
  const commentBuffer = Buffer.from(comment, 'utf8');
  const eocd = Buffer.alloc(22 + commentBuffer.length);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(commentBuffer.length, 20);
  commentBuffer.copy(eocd, 22);
  return Buffer.concat([...localParts, central, eocd]);
}

/** Create source artifacts matching the current Spring Boot and component-docs layout. */
export function createDockerArtifactFixture(root, {
  jarPath: jarPathOverride,
  componentDocsDir: componentDocsDirOverride,
  includeApplicationConfig = true,
  docContent = '# Fixture component\n\nA small non-empty component document.\n',
  fragments = [],
  extraJarEntries = [],
  extraDocs = [],
} = {}) {
  fs.mkdirSync(root, {recursive: true});
  const jarPath = jarPathOverride ?? path.join(root, 'server.jar');
  const componentDocsDir = componentDocsDirOverride ?? path.join(root, 'component-docs');
  fs.mkdirSync(path.dirname(jarPath), {recursive: true});
  fs.mkdirSync(componentDocsDir, {recursive: true});

  const mainClass = 'org.springframework.boot.loader.launch.JarLauncher';
  const startClass = 'example.fixture.Application';
  const manifest = [
    'Manifest-Version: 1.0',
    `Main-Class: ${mainClass}`,
    `Start-Class: ${startClass}`,
    'Spring-Boot-Version: 3.2.5',
    'Spring-Boot-Classes: BOOT-INF/classes/',
    'Spring-Boot-Lib: BOOT-INF/lib/',
    '',
  ].join('\r\n');
  const nestedJar = createZipFixture([{name: 'META-INF/MANIFEST.MF', data: 'Manifest-Version: 1.0\r\n\r\n'}]);
  const jarEntries = [
    {name: 'META-INF/MANIFEST.MF', data: manifest},
    {name: 'BOOT-INF/classes/webapp/index.html', data: '<!doctype html><title>Fixture</title>'},
    {name: 'BOOT-INF/lib/fixture-library.jar', data: nestedJar, method: 0},
    {name: 'BOOT-INF/classes/example/fixture/Application.class', data: 'fixture-application-bytecode'},
    {name: 'BOOT-INF/classes/application.yml', data: 'secret: must be filtered'},
    {name: 'BOOT-INF/classes/logs/runtime.log', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/example/fixture/private.key', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/.env.production', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/.npmrc', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/license.zip', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/example/fixture/license.lic', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/example/fixture/private.pem', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/agent-project-workspaces/cache.json', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/ai-driven/workspaces/run.json', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/ai-driven/attachment-staging/upload.bin', data: 'must be filtered'},
    {name: 'BOOT-INF/classes/component-docs/remote/runtime.json', data: 'must be filtered'},
    ...extraJarEntries,
  ].filter(entry => includeApplicationConfig || entry.name !== 'BOOT-INF/classes/application.yml');
  fs.writeFileSync(jarPath, createZipFixture(jarEntries));

  const documentContent = Buffer.from(docContent, 'utf8');
  const version = hash('docker-artifacts-fixture/v1');
  const documentPath = 'components/Fixture/Fixture.md';
  const fragmentRecords = {};
  for (const fragment of fragments) {
    const content = Buffer.isBuffer(fragment.content) ? fragment.content : Buffer.from(fragment.content, 'utf8');
    fragmentRecords[fragment.label] = {
      path: `common/${fragment.fileName}`,
      sha256: hash(content),
      bytes: content.length,
    };
  }
  const index = {
    schemaVersion: 'component-document-index/v1',
    corpusVersion: version,
    documents: [{
      componentType: 'Fixture',
      path: documentPath,
      source: 'builtin',
      corpusVersion: version,
      sha256: hash(documentContent),
      bytes: documentContent.length,
    }],
    fragments: fragmentRecords,
  };
  fs.writeFileSync(path.join(componentDocsDir, 'current.json'), `${JSON.stringify({corpusVersion: version})}\n`);
  const builtinDir = path.join(componentDocsDir, 'builtin', version);
  fs.mkdirSync(builtinDir, {recursive: true});
  fs.writeFileSync(path.join(builtinDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  const documentFile = path.join(builtinDir, ...documentPath.split('/'));
  fs.mkdirSync(path.dirname(documentFile), {recursive: true});
  fs.writeFileSync(documentFile, documentContent);
  for (const fragment of fragments) {
    const file = path.join(builtinDir, 'common', fragment.fileName);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, fragment.content);
  }
  for (const extra of extraDocs) {
    const file = path.join(componentDocsDir, extra.path);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, extra.content ?? 'unreferenced fixture content');
  }
  return {jarPath, componentDocsDir};
}

export const writeArtifactFixture = createDockerArtifactFixture;
