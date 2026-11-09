/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class ProjectDataCodecUtilTest {
    @Test void decodesPayloadProducedByDesktopTypescriptCodec() throws Exception {
        try (var input = getClass().getResourceAsStream("/fixtures/desktop-dvz1.txt")) {
            assertNotNull(input);
            String payload = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertEquals("{\"name\":\"synthetic\",\"values\":[\"alpha\",\"beta\"]}", ProjectDataCodecUtil.decode(payload));
        }
    }

    @Test void writesCurrentFormatAndLeavesLegacyPayloadsUntouched() {
        String json = "{\"name\":\"测试项目\"}";
        String encoded = ProjectDataCodecUtil.encode(json);
        assertTrue(encoded.startsWith("DVZ1:gzip:"));
        assertEquals(json, ProjectDataCodecUtil.decode(encoded));
        assertTrue(ProjectDataCodecUtil.isCompressed(encoded));
        String payload = encoded.substring("DVZ1:gzip:".length());
        String legacy = "LCPZ1:gzip:" + payload;
        assertFalse(ProjectDataCodecUtil.isCompressed(legacy));
        assertEquals(legacy, ProjectDataCodecUtil.decode(legacy));
        String binaryLegacy = "LCPZ\u0001\u0001" + payload;
        assertEquals(binaryLegacy, ProjectDataCodecUtil.decode(binaryLegacy));
        assertFalse(ProjectDataCodecUtil.isCompressed(json));
    }

    @Test void limitsDecompressedUtf8BytesForCurrentFormat() {
        String data = "项目abc";
        int byteLength = data.getBytes(StandardCharsets.UTF_8).length;
        String current = ProjectDataCodecUtil.encode(data);
        for (String payload : new String[]{current}) {
            assertEquals(data, ProjectDataCodecUtil.decode(payload, byteLength));
            IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                    () -> ProjectDataCodecUtil.decode(payload, byteLength - 1));
            assertEquals("项目数据超过大小限制", error.getMessage());
        }
    }

    @Test void malformedCompressedPayloadStillFallsBackToOriginal() {
        String payload = "DVZ1:gzip:not-base64";
        assertEquals(payload, ProjectDataCodecUtil.decode(payload, 10));
    }
}
