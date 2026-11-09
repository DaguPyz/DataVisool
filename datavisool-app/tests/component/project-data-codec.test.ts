/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it} from 'vitest';
import ProjectDataCodecUtil from '@/util/ProjectDataCodecUtil.ts';

describe('project data compression', () => {
    it('writes and reads the current DVZ1 format without decoding legacy local data', () => {
        const json = JSON.stringify({name: '测试项目', text: 'data '.repeat(300)});
        const compressed = ProjectDataCodecUtil.compressIfBeneficial(json, {minCompressBytes: 0});
        expect(compressed).toMatch(/^DVZ1:gzip:/);
        expect(ProjectDataCodecUtil.decompressIfNeeded(compressed)).toBe(json);
        const legacy = compressed.replace(/^DVZ1:/, 'LCPZ1:');
        expect(ProjectDataCodecUtil.isCompressed(legacy)).toBe(false);
        expect(ProjectDataCodecUtil.decompressIfNeeded(legacy)).toBe(legacy);
    });

    it('leaves invalid or uncompressed data unchanged in the tolerant decoder', () => {
        expect(ProjectDataCodecUtil.decompressIfNeeded('DVZ1:gzip:invalid')).toBe('DVZ1:gzip:invalid');
        expect(ProjectDataCodecUtil.decompressIfNeeded('{"name":"plain"}')).toBe('{"name":"plain"}');
    });
});
