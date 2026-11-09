/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

public class ProjectDataCodecUtil {
    private static final Logger log = LoggerFactory.getLogger(ProjectDataCodecUtil.class);

    private static final String TEXT_PREFIX = "DVZ1:gzip:";
    private static final long MAX_DECODED_BYTES = 128L * 1024 * 1024;
    private static final long MAX_ENCODED_CHARS = 256L * 1024 * 1024;

    public static String decode(String payload) {
        return decode(payload, MAX_DECODED_BYTES);
    }

    static String decode(String payload, long maxDecodedBytes) {
        if (payload == null) {
            return null;
        }

        if (payload.startsWith(TEXT_PREFIX)) {
            try {
                return decodeCompressed(payload, TEXT_PREFIX.length(), maxDecodedBytes);
            } catch (ProjectDataTooLargeException e) {
                throw e;
            } catch (Exception e) {
                log.error("ProjectDataCodecUtil: Decode failed, falling back to original payload. Error: {}", e.getMessage());
                return payload;
            }
        }

        return payload;
    }

    public static boolean isCompressed(String payload) {
        return payload != null && payload.startsWith(TEXT_PREFIX);
    }

    public static String encode(String data) {
        if (data == null) {
            return null;
        }

        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (GZIPOutputStream gzip = new GZIPOutputStream(bos)) {
                gzip.write(data.getBytes(StandardCharsets.UTF_8));
            }
            byte[] compressedBytes = bos.toByteArray();

            String base64Str = Base64.getEncoder().encodeToString(compressedBytes);
            return TEXT_PREFIX + base64Str;
        } catch (Exception e) {
            log.error("ProjectDataCodecUtil: Encode failed", e);
            return data;
        }
    }

    private static String decodeCompressed(String payload, int prefixLength, long maxDecodedBytes) throws Exception {
        if ((long) payload.length() - prefixLength > MAX_ENCODED_CHARS) {
            throw new ProjectDataTooLargeException();
        }
        byte[] compressedBytes = Base64.getDecoder().decode(payload.substring(prefixLength));
        return gunzipToString(compressedBytes, maxDecodedBytes);
    }

    private static String gunzipToString(byte[] compressedBytes, long maxDecodedBytes) throws Exception {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(compressedBytes);
             GZIPInputStream gzip = new GZIPInputStream(bis);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int len;
            while ((len = gzip.read(buffer)) != -1) {
                if (len > maxDecodedBytes - bos.size()) {
                    throw new ProjectDataTooLargeException();
                }
                bos.write(buffer, 0, len);
            }
            return bos.toString(StandardCharsets.UTF_8);
        }
    }

    private static final class ProjectDataTooLargeException extends IllegalArgumentException {
        private ProjectDataTooLargeException() {
            super("项目数据超过大小限制");
        }
    }
}

