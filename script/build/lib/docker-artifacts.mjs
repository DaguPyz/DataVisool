/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const ZIP_DESCRIPTOR = 0x08074b50;
const ZIP_U32_MAX = 0xffffffff;
const MAX_ZIP_COMMENT = 0xffff;
const REQUIRED_MANIFEST = 'META-INF/MANIFEST.MF';
const REQUIRED_WEB_INDEX = 'BOOT-INF/classes/webapp/index.html';
const MANIFEST_MAIN = 'org.springframework.boot.loader.launch.JarLauncher';
const DOC_VERSION_RE = /^[a-f0-9]{64}$/;
const COMPONENT_TYPE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const FRAGMENT_FILE_RE = /^[A-Za-z0-9_-]{1,128}\.json$/;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(`Docker 构建产物无效：${message}`); };

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function readZipName(buffer, flags, name) {
  if (!name.length) fail('ZIP 成员名称为空');
  if (!(flags & 0x0800) && name.some(byte => byte > 0x7f)) {
    fail('不支持非 UTF-8 编码的 ZIP 成员名称');
  }
  let value;
  try {
    value = new TextDecoder('utf-8', {fatal: true}).decode(name);
  } catch {
    fail('ZIP 成员名称不是有效 UTF-8');
  }
  validateZipPath(value);
  return value;
}

function validateZipPath(value) {
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    fail(`ZIP 成员路径不安全：${JSON.stringify(value)}`);
  }
  const isDirectory = value.endsWith('/');
  const parts = value.split('/');
  if (isDirectory) parts.pop();
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..')) {
    fail(`ZIP 成员路径不安全：${JSON.stringify(value)}`);
  }
}

function validateExtraFields(buffer, start, length, description) {
  const end = start + length;
  if (end > buffer.length) fail(`ZIP ${description} extra field 越界`);
  for (let offset = start; offset < end;) {
    if (offset + 4 > end) fail(`ZIP ${description} extra field 格式错误`);
    const id = buffer.readUInt16LE(offset);
    const size = buffer.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end) fail(`ZIP ${description} extra field 长度错误`);
    if (id === 0x0001) fail('不支持 ZIP64 extra field');
    offset += size;
  }
}

function findEocd(buffer) {
  const first = Math.max(0, buffer.length - (22 + MAX_ZIP_COMMENT));
  for (let offset = buffer.length - 22; offset >= first; offset--) {
    if (buffer.readUInt32LE(offset) !== ZIP_EOCD) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  fail('ZIP End of Central Directory 缺失或包含尾随数据');
}

function parseZip(buffer, {collect = new Set()} = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) fail('JAR 不是有效 ZIP 文件');
  const eocdOffset = findEocd(buffer);
  const disk = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) fail('不支持多磁盘 ZIP');
  if (entryCount === 0xffff || centralSize === ZIP_U32_MAX || centralOffset === ZIP_U32_MAX) {
    fail('不支持 ZIP64');
  }
  if (centralOffset + centralSize !== eocdOffset) fail('ZIP 中央目录边界错误');

  const entries = [];
  const byName = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > eocdOffset || buffer.readUInt32LE(cursor) !== ZIP_CENTRAL) {
      fail('ZIP 中央目录记录损坏');
    }
    const madeBy = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const startDisk = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if ([compressedSize, uncompressedSize, localOffset].includes(ZIP_U32_MAX) || startDisk === 0xffff) {
      fail('不支持 ZIP64');
    }
    if (startDisk !== 0) fail('不支持多磁盘 ZIP 成员');
    if (flags & (0x0001 | 0x0040 | 0x2000)) fail('不支持加密 ZIP 成员');
    if (method !== 0 && method !== 8) fail(`不支持 ZIP 压缩方式 ${method}`);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > eocdOffset) fail('ZIP 中央目录记录越界');
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = readZipName(buffer, flags, nameBytes);
    validateExtraFields(buffer, cursor + 46 + nameLength, extraLength, 'central');
    if (byName.has(name)) fail(`ZIP 成员重复：${name}`);
    const hostSystem = madeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    if (hostSystem === 3 && (unixMode & 0xf000) === 0xa000) fail(`ZIP 成员是符号链接：${name}`);
    const entry = {
      name, flags, method, crc, compressedSize, uncompressedSize, localOffset,
      centralRecord: buffer.subarray(cursor, recordEnd),
      centralNameLength: nameLength,
      centralExtraLength: extraLength,
      centralCommentLength: commentLength,
      content: undefined,
    };
    byName.set(name, entry);
    entries.push(entry);
    cursor = recordEnd;
  }
  if (cursor !== centralOffset + centralSize) fail('ZIP 中央目录大小与记录不匹配');

  const localEntries = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  if (localEntries.length && localEntries[0].localOffset !== 0) fail('ZIP local records 含不支持的前缀');
  if (!localEntries.length && centralOffset !== 0) fail('空 ZIP 含不支持的 local record');
  for (let index = 0; index < localEntries.length; index++) {
    const entry = localEntries[index];
    const nextOffset = index + 1 < localEntries.length ? localEntries[index + 1].localOffset : centralOffset;
    if (index && entry.localOffset === localEntries[index - 1].localOffset) fail('ZIP 成员重复引用同一 local record');
    if (entry.localOffset + 30 > centralOffset || buffer.readUInt32LE(entry.localOffset) !== ZIP_LOCAL) {
      fail(`ZIP local header 损坏：${entry.name}`);
    }
    const localFlags = buffer.readUInt16LE(entry.localOffset + 6);
    const localMethod = buffer.readUInt16LE(entry.localOffset + 8);
    const localCrc = buffer.readUInt32LE(entry.localOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(entry.localOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(entry.localOffset + 22);
    const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const localNameStart = entry.localOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;
    if (dataStart > centralOffset || localFlags !== entry.flags || localMethod !== entry.method) {
      fail(`ZIP local header 与中央目录不一致：${entry.name}`);
    }
    const localName = readZipName(buffer, localFlags, buffer.subarray(localNameStart, localExtraStart));
    if (localName !== entry.name) fail(`ZIP local name 与中央目录不一致：${entry.name}`);
    validateExtraFields(buffer, localExtraStart, localExtraLength, 'local');
    if (entry.flags & 0x0008) {
      if (localCrc !== 0 && localCrc !== entry.crc
          || localCompressedSize !== 0 && localCompressedSize !== entry.compressedSize
          || localUncompressedSize !== 0 && localUncompressedSize !== entry.uncompressedSize) {
        fail(`ZIP data descriptor 前的 local size 不一致：${entry.name}`);
      }
    } else if (localCrc !== entry.crc || localCompressedSize !== entry.compressedSize
        || localUncompressedSize !== entry.uncompressedSize) {
      fail(`ZIP local size 与中央目录不一致：${entry.name}`);
    }
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > nextOffset || nextOffset > centralOffset) fail(`ZIP 压缩数据越界：${entry.name}`);
    if (entry.flags & 0x0008) {
      const descriptorLength = nextOffset - dataEnd;
      const descriptor = dataEnd + 4 <= nextOffset && buffer.readUInt32LE(dataEnd) === ZIP_DESCRIPTOR;
      const valueOffset = dataEnd + (descriptor ? 4 : 0);
      if (descriptorLength !== 12 + (descriptor ? 4 : 0)
          || buffer.readUInt32LE(valueOffset) !== entry.crc
          || buffer.readUInt32LE(valueOffset + 4) !== entry.compressedSize
          || buffer.readUInt32LE(valueOffset + 8) !== entry.uncompressedSize) {
        fail(`ZIP data descriptor 损坏：${entry.name}`);
      }
    } else if (dataEnd !== nextOffset) {
      fail(`ZIP local record 间存在不支持的间隙：${entry.name}`);
    }

    const compressed = buffer.subarray(dataStart, dataEnd);
    let content;
    try {
      content = entry.method === 0 ? compressed : inflateRawSync(compressed, {
        maxOutputLength: Math.max(entry.uncompressedSize, 1),
      });
    } catch (error) {
      fail(`ZIP 内容解压失败：${entry.name} (${error.message})`);
    }
    if (content.length !== entry.uncompressedSize || crc32(content) !== entry.crc) {
      fail(`ZIP CRC 或解压长度校验失败：${entry.name}`);
    }
    if (collect.has(entry.name)) entry.content = Buffer.from(content);
    entry.localStart = entry.localOffset;
    entry.localEnd = nextOffset;
    entry.dataStart = dataStart;
    entry.dataEnd = dataEnd;
  }
  if (localEntries.length && localEntries.at(-1).localEnd !== centralOffset) fail('ZIP local records 与中央目录之间存在间隙');
  return {entries, byName, localEntries, eocd: buffer.subarray(eocdOffset), centralOffset};
}

function jarEntryExcluded(name) {
  const parts = name.replace(/\/$/, '').split('/');
  const basename = parts.at(-1).toLowerCase();
  const lowerParts = parts.map(part => part.toLowerCase());
  if (lowerParts.some(part => ['.git', '.idea', '.ds_store', 'node_modules', 'target', 'dist', 'logs', 'agent-project-workspaces', 'attachment-staging'].includes(part))) return true;
  if (lowerParts.includes('ai-driven') && lowerParts.includes('workspaces')) return true;
  if (lowerParts.includes('component-docs') && lowerParts.includes('remote')) return true;
  if (basename === '.env' || basename.startsWith('.env.') || basename === '.npmrc') return true;
  if (basename === 'license.zip' || /\.log$|\.lic$|\.pem$|\.key$/i.test(basename)) return true;
  if (/^application.*\.(?:yml|yaml|properties)$/i.test(basename)) return true;
  return false;
}

function parseManifest(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true}).decode(buffer);
  } catch {
    fail('META-INF/MANIFEST.MF 不是有效 UTF-8');
  }
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const fields = new Map();
  for (const line of unfolded.split(/\r?\n/)) {
    if (!line) break; // Only the main section defines executable JAR attributes.
    const divider = line.indexOf(':');
    if (divider <= 0) continue;
    const key = line.slice(0, divider).trim().toLowerCase();
    if (!fields.has(key)) fields.set(key, line.slice(divider + 1).trim());
  }
  if (fields.get('main-class') !== MANIFEST_MAIN) fail('JAR manifest 缺少 Spring Boot JarLauncher Main-Class');
  if (!fields.get('start-class')) fail('JAR manifest 缺少 Start-Class');
  return fields;
}

function parseReleaseJar(source) {
  const parsed = parseZip(source, {collect: new Set([REQUIRED_MANIFEST, REQUIRED_WEB_INDEX])});
  const manifest = parsed.byName.get(REQUIRED_MANIFEST);
  const webIndex = parsed.byName.get(REQUIRED_WEB_INDEX);
  if (!manifest?.content?.length) fail(`缺少非空 JAR manifest：${REQUIRED_MANIFEST}`);
  parseManifest(manifest.content);
  if (!webIndex?.content?.length) fail(`缺少非空前端入口：${REQUIRED_WEB_INDEX}`);

  const storedLibraries = parsed.entries.filter(entry => entry.name.startsWith('BOOT-INF/lib/')
    && entry.name.endsWith('.jar') && !entry.name.endsWith('/'));
  if (!storedLibraries.length || storedLibraries.some(entry => entry.method !== 0 || entry.uncompressedSize === 0)) {
    fail('BOOT-INF/lib 必须包含非空且以 STORED 方式保存的 Spring Boot 嵌套 JAR');
  }
  return parsed;
}

/** Validate the JAR shared by native and Docker launchers, without filtering native configuration. */
export function validateReleaseJar(filename) {
  assertRealPath(filename, 'server.jar');
  parseReleaseJar(fs.readFileSync(filename));
}

function rewriteJar(source) {
  const parsed = parseReleaseJar(source);
  const kept = parsed.localEntries.filter(entry => !jarEntryExcluded(entry.name));
  for (const required of [REQUIRED_MANIFEST, REQUIRED_WEB_INDEX]) {
    if (!kept.some(entry => entry.name === required)) fail(`Docker 隔离规则移除了必需 JAR 成员：${required}`);
  }
  if (!kept.some(entry => entry.name.startsWith('BOOT-INF/lib/') && entry.name.endsWith('.jar'))) {
    fail('Docker 隔离规则移除了全部 Spring Boot 嵌套 JAR');
  }

  const localParts = [];
  const newOffsets = new Map();
  let localLength = 0;
  for (const entry of kept) {
    newOffsets.set(entry.name, localLength);
    const record = source.subarray(entry.localStart, entry.localEnd);
    localParts.push(record);
    localLength += record.length;
  }
  if (localLength > ZIP_U32_MAX) fail('Docker 专用 JAR 超过 ZIP32 容量上限');

  const centralParts = [];
  let centralLength = 0;
  for (const entry of parsed.entries) {
    if (jarEntryExcluded(entry.name)) continue;
    const record = Buffer.from(entry.centralRecord);
    record.writeUInt32LE(newOffsets.get(entry.name), 42);
    centralParts.push(record);
    centralLength += record.length;
  }
  if (kept.length > 0xffff || centralLength > ZIP_U32_MAX || localLength + centralLength > ZIP_U32_MAX) {
    fail('Docker 专用 JAR 超过 ZIP32 容量上限');
  }
  const eocd = Buffer.from(parsed.eocd);
  eocd.writeUInt16LE(kept.length, 8);
  eocd.writeUInt16LE(kept.length, 10);
  eocd.writeUInt32LE(centralLength, 12);
  eocd.writeUInt32LE(localLength, 16);
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function assertRealPath(pathname, description, {directory = false} = {}) {
  let stat;
  try {
    stat = fs.lstatSync(pathname);
  } catch {
    fail(`${description} 不存在：${pathname}`);
  }
  if (stat.isSymbolicLink()) fail(`${description} 不允许符号链接：${pathname}`);
  if (directory ? !stat.isDirectory() : !stat.isFile()) {
    fail(`${description} 必须是${directory ? '真实目录' : '普通文件'}：${pathname}`);
  }
  return stat;
}

function setArtifactMode(pathname, mode) {
  if (process.platform !== 'win32') fs.chmodSync(pathname, mode);
}

function ensureArtifactDirectory(root, relativeDirectory) {
  let current = root;
  if (!relativeDirectory || relativeDirectory === '.') {
    setArtifactMode(current, 0o755);
    return current;
  }
  for (const segment of relativeDirectory.split(path.sep)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fs.mkdirSync(current, {mode: 0o755});
    setArtifactMode(current, 0o755);
  }
  return current;
}

function safeReferencedFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.startsWith('/')) {
    fail(`组件文档路径无效：${JSON.stringify(relative)}`);
  }
  const segments = relative.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    fail(`组件文档路径无效：${JSON.stringify(relative)}`);
  }
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    assertRealPath(current, `组件文档${index === segments.length - 1 ? '文件' : '目录'}`, {
      directory: index !== segments.length - 1,
    });
  }
  const rootResolved = path.resolve(root);
  const fileResolved = path.resolve(current);
  if (!fileResolved.startsWith(`${rootResolved}${path.sep}`)) fail(`组件文档路径越界：${relative}`);
  return current;
}

function readJsonFile(filename, description) {
  let raw;
  try {
    raw = fs.readFileSync(filename);
    if (!raw.length) fail(`${description} 为空：${filename}`);
    return {raw, value: JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw))};
  } catch (error) {
    if (error.message.startsWith('Docker 构建产物无效：')) throw error;
    fail(`${description} 无法解析：${filename} (${error.message})`);
  }
}

function validateDocRecord(root, relative, record, description, {jsonObject = false} = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
      || !Number.isSafeInteger(record.bytes) || record.bytes <= 0
      || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    fail(`${description} 元数据无效：${relative}`);
  }
  const filename = safeReferencedFile(root, relative);
  const content = fs.readFileSync(filename);
  if (!content.length || content.length !== record.bytes || sha256(content) !== record.sha256) {
    fail(`${description} 内容与 index.json 不匹配：${relative}`);
  }
  if (jsonObject) {
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(content)); }
    catch (error) { fail(`${description} JSON 无效：${relative} (${error.message})`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${description} 必须是 JSON 对象：${relative}`);
  }
  return filename;
}

function inspectComponentDocs(root, {strictTree = false} = {}) {
  assertRealPath(root, 'component-docs', {directory: true});
  const currentPath = safeReferencedFile(root, 'current.json');
  const {value: current} = readJsonFile(currentPath, 'component-docs/current.json');
  if (!current || typeof current !== 'object' || Array.isArray(current)
      || typeof current.corpusVersion !== 'string' || !DOC_VERSION_RE.test(current.corpusVersion)) {
    fail('component-docs/current.json corpusVersion 无效');
  }
  const version = current.corpusVersion;
  const indexRelative = `builtin/${version}/index.json`;
  const indexPath = safeReferencedFile(root, indexRelative);
  const {value: index} = readJsonFile(indexPath, 'component-docs index.json');
  if (!index || typeof index !== 'object' || Array.isArray(index)
      || index.schemaVersion !== 'component-document-index/v1'
      || index.corpusVersion !== version || !Array.isArray(index.documents) || index.documents.length === 0
      || !index.fragments || typeof index.fragments !== 'object' || Array.isArray(index.fragments)) {
    fail('component-docs index.json 结构无效或没有文档');
  }

  const allowedFiles = new Set(['current.json', indexRelative]);
  const documentTypes = new Set();
  for (const document of index.documents) {
    const type = document?.componentType;
    if (typeof type !== 'string' || !COMPONENT_TYPE_RE.test(type) || documentTypes.has(type)) {
      fail('component-docs index 中 componentType 无效或重复');
    }
    documentTypes.add(type);
    const expectedPath = `components/${type}/${type}.md`;
    if (document.path !== expectedPath || document.corpusVersion !== version || document.source !== 'builtin') {
      fail(`组件文档引用路径或版本无效：${String(document.path)}`);
    }
    validateDocRecord(root, `builtin/${version}/${expectedPath}`, document, '组件文档');
    allowedFiles.add(`builtin/${version}/${expectedPath}`);
  }

  for (const [label, fragment] of Object.entries(index.fragments)) {
    if (!/^<g2plot-[a-z0-9-]+>$/.test(label) || !fragment || typeof fragment !== 'object' || Array.isArray(fragment)
        || typeof fragment.path !== 'string' || !FRAGMENT_FILE_RE.test(fragment.path.slice('common/'.length))
        || !fragment.path.startsWith('common/')) {
      fail(`组件公共片段引用无效：${label}`);
    }
    const relative = `builtin/${version}/${fragment.path}`;
    validateDocRecord(root, relative, fragment, '组件公共片段', {jsonObject: true});
    allowedFiles.add(relative);
  }

  if (strictTree) {
    const allowedDirs = new Set(['builtin']);
    for (const filename of allowedFiles) {
      const segments = filename.split('/');
      for (let index = 1; index < segments.length; index++) allowedDirs.add(segments.slice(0, index).join('/'));
    }
    const actualFiles = new Set();
    const walk = (directory, relative = '') => {
      for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        const child = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) fail(`component-docs 不允许符号链接：${childRelative}`);
        const stat = fs.lstatSync(child);
        if (stat.isDirectory()) {
          if (!allowedDirs.has(childRelative)) fail(`component-docs 含有未引用目录：${childRelative}`);
          walk(child, childRelative);
        } else if (stat.isFile()) {
          if (!allowedFiles.has(childRelative)) fail(`component-docs 含有未引用文件：${childRelative}`);
          actualFiles.add(childRelative);
        } else {
          fail(`component-docs 含有非普通文件：${childRelative}`);
        }
      }
    };
    walk(root);
    for (const filename of allowedFiles) {
      if (!actualFiles.has(filename)) fail(`component-docs 缺少引用文件：${filename}`);
    }
  }
  return {version, allowedFiles};
}

function validateJarFile(filename) {
  assertRealPath(filename, 'server.jar');
  const parsed = parseReleaseJar(fs.readFileSync(filename));
  const excluded = parsed.entries.find(entry => jarEntryExcluded(entry.name));
  if (excluded) fail(`Docker 专用 JAR 含有禁止的配置或运行数据：${excluded.name}`);
}

function validateDirectoryShape(contextDir) {
  assertRealPath(contextDir, 'Docker artifact context', {directory: true});
  const entries = fs.readdirSync(contextDir).sort();
  if (entries.length !== 2 || entries[0] !== 'component-docs' || entries[1] !== 'server.jar') {
    fail('Docker artifact context 顶层必须且只能包含 server.jar 与 component-docs');
  }
}

/**
 * Validate a prepared Docker context. It is intentionally read-only and accepts
 * only the filtered Spring Boot JAR plus the documents referenced by current.json.
 */
export function validatePreparedDockerArtifacts(contextDir) {
  const resolved = path.resolve(contextDir);
  validateDirectoryShape(resolved);
  validateJarFile(path.join(resolved, 'server.jar'));
  inspectComponentDocs(path.join(resolved, 'component-docs'), {strictTree: true});
}

// Both native and Docker releases need the current builtin corpus, without
// generated remote documents or files left over from earlier builds.
export function copyComponentDocs(sourceDirectory, targetDirectory) {
  const source = path.resolve(sourceDirectory);
  const target = path.resolve(targetDirectory);
  const docs = inspectComponentDocs(source);
  fs.mkdirSync(target, {mode: 0o755});
  setArtifactMode(target, 0o755);
  for (const relative of [...docs.allowedFiles].sort()) {
    const sourceFile = safeReferencedFile(source, relative);
    const targetFile = path.join(target, ...relative.split('/'));
    ensureArtifactDirectory(target, path.relative(target, path.dirname(targetFile)));
    fs.copyFileSync(sourceFile, targetFile, fs.constants.COPYFILE_EXCL);
    setArtifactMode(targetFile, 0o644);
  }
  inspectComponentDocs(target, {strictTree: true});
}

/**
 * Build an isolated Docker input context from an already-built backend JAR and
 * component documentation. The source artifacts are never modified.
 */
export function prepareDockerArtifacts({jarPath, componentDocsDir} = {}) {
  if (!jarPath || !componentDocsDir) fail('jarPath 与 componentDocsDir 都是必需参数');
  const sourceJarPath = path.resolve(jarPath);
  const sourceDocsPath = path.resolve(componentDocsDir);
  assertRealPath(sourceJarPath, '源 server.jar');
  assertRealPath(sourceDocsPath, '源 component-docs', {directory: true});
  const sourceJar = fs.readFileSync(sourceJarPath);
  const parsedJar = rewriteJar(sourceJar);

  const contextDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-artifacts-'));
  try {
    setArtifactMode(contextDir, 0o755);
    fs.writeFileSync(path.join(contextDir, 'server.jar'), parsedJar, {mode: 0o644, flag: 'wx'});
    setArtifactMode(path.join(contextDir, 'server.jar'), 0o644);
    copyComponentDocs(sourceDocsPath, path.join(contextDir, 'component-docs'));
    validatePreparedDockerArtifacts(contextDir);
  } catch (error) {
    fs.rmSync(contextDir, {recursive: true, force: true});
    throw error;
  }
  let cleaned = false;
  return {
    contextDir,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      fs.rmSync(contextDir, {recursive: true, force: true});
    },
  };
}
