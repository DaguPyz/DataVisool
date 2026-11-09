/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export type ProjectDataCompressionAlgo = "gzip";

export interface IProjectDataCodecOptions {
    minCompressBytes?: number;
    gzipLevel?: number;
}

const MAGIC = "DVZ1";
const DEFAULT_MIN_COMPRESS_BYTES = 1024;
const DEFAULT_GZIP_LEVEL = 6;

const buildHeader = (algo: ProjectDataCompressionAlgo) => `${MAGIC}:${algo}:`;

const bytesToBase64 = (bytes: Uint8Array): string => {
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        let chunkBinary = "";
        for (let j = 0; j < chunk.length; j++) {
            chunkBinary += String.fromCharCode(chunk[j]);
        }
        binary += chunkBinary;
    }
    return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

export default class ProjectDataCodecUtil {
    public static isCompressed(payload: string) {
        return typeof payload === "string" && payload.startsWith(`${MAGIC}:`);
    }

    /**
     * 压缩项目数据，如果压缩后的大小小于原始大小，则返回压缩后的字符串，否则返回原始字符串
     * @param json 项目数据的JSON字符串
     * @param options 压缩选项
     * @returns 压缩后的字符串或原始字符串
     */
    public static compressIfBeneficial(json: string, options?: IProjectDataCodecOptions) {
        const minCompressBytes = options?.minCompressBytes ?? DEFAULT_MIN_COMPRESS_BYTES;
        if (!json || json.length < minCompressBytes) return json;

        const algo: ProjectDataCompressionAlgo = "gzip";
        const gzipLevel = options?.gzipLevel ?? DEFAULT_GZIP_LEVEL;
        const header = buildHeader(algo);

        try {
            const inputBytes = strToU8(json);
            const level = Math.min(9, Math.max(0, gzipLevel)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
            const compressedBytes = gzipSync(inputBytes, { level });
            const base64 = bytesToBase64(compressedBytes);
            const encoded = header + base64;
            return encoded.length < json.length ? encoded : json;
        } catch {
            return json;
        }
    }

    /**
     * 解压项目数据，如果是压缩后的字符串，则返回解压后的JSON字符串，否则返回原始字符串
     * @param payload 项目数据的字符串表示
     * @returns 解压后的JSON字符串或原始字符串
     */
    public static decompressIfNeeded(payload: string) {
        if (!ProjectDataCodecUtil.isCompressed(payload)) return payload;

        try {
            const parts = payload.split(":");
            if (parts.length < 3) return payload;

            const algo = parts[1] as ProjectDataCompressionAlgo;
            const base64 = parts.slice(2).join(":");
            if (!base64) return payload;

            const compressedBytes = base64ToBytes(base64);
            if (algo === "gzip") {
                const jsonBytes = gunzipSync(compressedBytes);
                return strFromU8(jsonBytes);
            }

            return payload;
        } catch {
            return payload;
        }
    }

    /**
     * 压缩项目数据，返回压缩后的字符串
     * @param json 项目数据的JSON字符串
     * @param options 压缩选项
     * @returns 压缩后的字符串
     */
    public static compress(json: string, options?: IProjectDataCodecOptions) {
        const algo: ProjectDataCompressionAlgo = "gzip";
        const gzipLevel = options?.gzipLevel ?? DEFAULT_GZIP_LEVEL;
        const header = buildHeader(algo);

        const inputBytes = strToU8(json);
        const level = Math.min(9, Math.max(0, gzipLevel)) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
        const compressedBytes = gzipSync(inputBytes, { level });
        const base64 = bytesToBase64(compressedBytes);
        return header + base64;
    }

    /**
     * 解压项目数据，返回解压后的JSON字符串
     * @param payload 项目数据的字符串表示
     * @returns 解压后的JSON字符串
     */
    public static decompress(payload: string) {
        if (!ProjectDataCodecUtil.isCompressed(payload)) return payload;

        const parts = payload.split(":");
        if (parts.length < 3) return payload;

        const algo = parts[1] as ProjectDataCompressionAlgo;
        const base64 = parts.slice(2).join(":");
        if (!base64) return payload;

        const compressedBytes = base64ToBytes(base64);
        if (algo === "gzip") {
            const jsonBytes = gunzipSync(compressedBytes);
            return strFromU8(jsonBytes);
        }

        return payload;
    }
}
