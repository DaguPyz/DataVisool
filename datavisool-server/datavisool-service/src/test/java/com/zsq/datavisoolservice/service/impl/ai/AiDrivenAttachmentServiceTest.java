/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.global.AppException;
import org.junit.Assert;
import org.junit.Test;

import java.util.Base64;

public class AiDrivenAttachmentServiceTest {

    @Test
    public void detectsRealPngMimeAndReadsHeaderDimensions() {
        byte[] png = new byte[24];
        byte[] signature = new byte[]{
                (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
        };
        System.arraycopy(signature, 0, png, 0, signature.length);
        writeBigEndian(png, 16, 640);
        writeBigEndian(png, 20, 360);
        AiDrivenAttachmentService service = new AiDrivenAttachmentService();

        Assert.assertEquals("image/png", service.detectImageMime(png));
        Assert.assertEquals(
                new AiDrivenAttachmentService.ImageSize(640, 360),
                service.readImageSize(png, "image/png")
        );
    }

    @Test
    public void rejectsMimeSpoofingAndOversizedDimensions() {
        AiDrivenAttachmentService service = new AiDrivenAttachmentService();
        String gifDataUrl = "data:image/png;base64,"
                + Base64.getEncoder().encodeToString("GIF89a".getBytes());
        AiDrivenAttachmentService.ParsedDataUrl parsed = service.parseImageDataUrl(gifDataUrl);

        Assert.assertEquals("image/gif", service.detectImageMime(parsed.bytes()));
        Assert.assertNotEquals(parsed.mimeType(), service.detectImageMime(parsed.bytes()));
        Assert.assertThrows(
                AppException.class,
                () -> service.validateImageSize(
                        new AiDrivenAttachmentService.ImageSize(20_000, 20_000)
                )
        );
    }

    private static void writeBigEndian(byte[] bytes, int offset, int value) {
        bytes[offset] = (byte) (value >>> 24);
        bytes[offset + 1] = (byte) (value >>> 16);
        bytes[offset + 2] = (byte) (value >>> 8);
        bytes[offset + 3] = (byte) value;
    }
}
