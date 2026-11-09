/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
'use strict';

const fs = require('node:fs');

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const CENTRAL_DIRECTORY_DIGITAL_SIGNATURE = 0x05054b50;
const ZIP16_SENTINEL = 0xffff;
const ZIP32_SENTINEL = 0xffffffff;
const MAX_EOCD_COMMENT = 0xffff;

function fail(message) {
    throw new Error(`Windows ZIP 元数据修复失败：${message}`);
}

function readExact(fd, length, position, fileSize) {
    if (!Number.isSafeInteger(length) || length < 0
        || !Number.isSafeInteger(position) || position < 0
        || position + length > fileSize) {
        fail('ZIP 记录越过文件边界');
    }

    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
        const read = fs.readSync(fd, buffer, offset, length - offset, position + offset);
        if (read === 0) fail('ZIP 文件意外结束');
        offset += read;
    }
    return buffer;
}

function toSafeNumber(value, description) {
    if (typeof value === 'bigint') {
        if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${description} 超出可安全处理范围`);
        return Number(value);
    }
    if (!Number.isSafeInteger(value) || value < 0) fail(`${description} 无效`);
    return value;
}

function parseZip64Directory(fd, eocdOffset, eocd, fileSize) {
    if (eocdOffset < 20) fail('ZIP64 locator 缺失');
    const locatorOffset = eocdOffset - 20;
    const locator = readExact(fd, 20, locatorOffset, fileSize);
    if (locator.readUInt32LE(0) !== ZIP64_LOCATOR_SIGNATURE) fail('ZIP64 locator 缺失');
    if (locator.readUInt32LE(4) !== 0 || locator.readUInt32LE(16) !== 1) fail('不支持多卷 ZIP64');

    const zip64Offset = toSafeNumber(locator.readBigUInt64LE(8), 'ZIP64 EOCD 偏移');
    const header = readExact(fd, 56, zip64Offset, fileSize);
    if (header.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) fail('ZIP64 EOCD 损坏');
    const recordSize = toSafeNumber(header.readBigUInt64LE(4), 'ZIP64 EOCD 长度');
    if (recordSize < 44 || zip64Offset + 12 + recordSize !== locatorOffset) fail('ZIP64 EOCD 长度或边界无效');

    const diskNumber = header.readUInt32LE(16);
    const centralDisk = header.readUInt32LE(20);
    const entriesOnDisk = toSafeNumber(header.readBigUInt64LE(24), 'ZIP64 分卷条目数');
    const entryCount = toSafeNumber(header.readBigUInt64LE(32), 'ZIP64 条目数');
    const centralSize = toSafeNumber(header.readBigUInt64LE(40), 'ZIP64 中央目录长度');
    const declaredCentralOffset = toSafeNumber(header.readBigUInt64LE(48), 'ZIP64 中央目录偏移');
    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) fail('不支持多卷 ZIP64');

    const classicDisk = eocd.readUInt16LE(4);
    const classicCentralDisk = eocd.readUInt16LE(6);
    if (classicDisk !== 0 || classicCentralDisk !== 0) fail('不支持多卷 ZIP');
    const classicEntriesOnDisk = eocd.readUInt16LE(8);
    const classicEntryCount = eocd.readUInt16LE(10);
    const classicCentralSize = eocd.readUInt32LE(12);
    const classicCentralOffset = eocd.readUInt32LE(16);
    if (classicEntriesOnDisk !== ZIP16_SENTINEL && classicEntriesOnDisk !== entriesOnDisk) fail('ZIP 与 ZIP64 条目数不一致');
    if (classicEntryCount !== ZIP16_SENTINEL && classicEntryCount !== entryCount) fail('ZIP 与 ZIP64 条目数不一致');
    if (classicCentralSize !== ZIP32_SENTINEL && classicCentralSize !== centralSize) fail('ZIP 与 ZIP64 中央目录长度不一致');
    if (classicCentralOffset !== ZIP32_SENTINEL && classicCentralOffset !== declaredCentralOffset) fail('ZIP 与 ZIP64 中央目录偏移不一致');

    return {entryCount, centralSize, declaredCentralOffset, directoryBoundary: zip64Offset};
}

function parseClassicDirectory(eocdOffset, eocd) {
    const diskNumber = eocd.readUInt16LE(4);
    const centralDisk = eocd.readUInt16LE(6);
    const entriesOnDisk = eocd.readUInt16LE(8);
    const entryCount = eocd.readUInt16LE(10);
    const centralSize = eocd.readUInt32LE(12);
    const declaredCentralOffset = eocd.readUInt32LE(16);
    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) fail('不支持多卷 ZIP');
    if ([entriesOnDisk, entryCount].includes(ZIP16_SENTINEL)
        || [centralSize, declaredCentralOffset].includes(ZIP32_SENTINEL)) {
        fail('ZIP64 元数据缺失');
    }
    return {entryCount, centralSize, declaredCentralOffset, directoryBoundary: eocdOffset};
}

function parseCandidate(fd, eocdOffset, fileSize) {
    const eocd = readExact(fd, 22, eocdOffset, fileSize);
    if (eocd.readUInt32LE(0) !== EOCD_SIGNATURE) fail('EOCD 签名无效');
    const commentLength = eocd.readUInt16LE(20);
    if (eocdOffset + 22 + commentLength > fileSize) fail('EOCD 注释越过文件边界');

    const needsZip64 = eocd.readUInt16LE(8) === ZIP16_SENTINEL
        || eocd.readUInt16LE(10) === ZIP16_SENTINEL
        || eocd.readUInt32LE(12) === ZIP32_SENTINEL
        || eocd.readUInt32LE(16) === ZIP32_SENTINEL;
    let directory;
    if (needsZip64 || (eocdOffset >= 20
        && readExact(fd, 4, eocdOffset - 20, fileSize).readUInt32LE(0) === ZIP64_LOCATOR_SIGNATURE)) {
        directory = parseZip64Directory(fd, eocdOffset, eocd, fileSize);
    } else {
        directory = parseClassicDirectory(eocdOffset, eocd);
    }

    const {entryCount, centralSize, declaredCentralOffset, directoryBoundary} = directory;
    if (eocdOffset + 22 + commentLength !== fileSize) fail('ZIP 注释后存在尾随数据');
    if (centralSize > directoryBoundary) fail('中央目录长度越过 ZIP 结尾');
    const centralOffset = directoryBoundary - centralSize;
    if (centralOffset < declaredCentralOffset) fail('中央目录偏移与长度不一致');
    const centralEnd = centralOffset + centralSize;
    if (!Number.isSafeInteger(centralEnd) || centralEnd !== directoryBoundary) fail('中央目录边界无效');
    if (entryCount > Math.floor(centralSize / 46)) fail('中央目录条目数越过目录边界');

    const hostByteOffsets = [];
    let cursor = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
        const header = readExact(fd, 46, cursor, fileSize);
        if (header.readUInt32LE(0) !== CENTRAL_DIRECTORY_SIGNATURE) fail(`中央目录第 ${index + 1} 条记录损坏`);
        if (header.readUInt16LE(34) !== 0) fail('不支持多卷 ZIP 成员');
        const nameLength = header.readUInt16LE(28);
        const extraLength = header.readUInt16LE(30);
        const commentLength = header.readUInt16LE(32);
        const recordLength = 46 + nameLength + extraLength + commentLength;
        if (cursor + recordLength > centralEnd) fail(`中央目录第 ${index + 1} 条记录越界`);
        hostByteOffsets.push(cursor + 5);
        cursor += recordLength;
    }

    if (cursor < centralEnd) {
        const remaining = centralEnd - cursor;
        if (remaining < 6) fail('中央目录尾部数据损坏');
        const signature = readExact(fd, 6, cursor, fileSize);
        const digitalSignatureLength = signature.readUInt16LE(4);
        if (signature.readUInt32LE(0) !== CENTRAL_DIRECTORY_DIGITAL_SIGNATURE
            || cursor + 6 + digitalSignatureLength !== centralEnd) {
            fail('中央目录包含无法识别的尾部数据');
        }
    } else if (cursor !== centralEnd) {
        fail('中央目录记录长度不匹配');
    }

    return hostByteOffsets;
}

function findCentralDirectoryHostBytes(fd, fileSize) {
    const tailLength = Math.min(fileSize, 22 + MAX_EOCD_COMMENT);
    if (tailLength < 22) fail('ZIP EOCD 缺失');
    const tailOffset = fileSize - tailLength;
    const tail = readExact(fd, tailLength, tailOffset, fileSize);
    let lastError;

    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
        if (tail.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
        const commentLength = tail.readUInt16LE(offset + 20);
        if (offset + 22 + commentLength !== tail.length) continue;
        try {
            return parseCandidate(fd, tailOffset + offset, fileSize);
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) throw lastError;
    fail('ZIP EOCD 缺失或注释无效');
}

function patchZipUnixCreator(zipPath) {
    const fd = fs.openSync(zipPath, 'r+');
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) fail('目标不是普通文件');
        const offsets = findCentralDirectoryHostBytes(fd, stat.size);
        const unixCreator = Buffer.from([3]);
        for (const offset of offsets) {
            const current = readExact(fd, 1, offset, stat.size);
            if (current[0] !== unixCreator[0]) fs.writeSync(fd, unixCreator, 0, 1, offset);
        }
        fs.fsyncSync(fd);
    } catch (error) {
        if (error.message.startsWith('Windows ZIP 元数据修复失败：')) throw error;
        fail(error.message);
    } finally {
        fs.closeSync(fd);
    }
}

module.exports = {patchZipUnixCreator};
