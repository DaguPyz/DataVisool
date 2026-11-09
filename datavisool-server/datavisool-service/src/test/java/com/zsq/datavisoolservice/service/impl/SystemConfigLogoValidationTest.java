/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.*;

public class SystemConfigLogoValidationTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private String root;
    private String logo;
    private long limit;
    private SystemConfigServiceImpl service;

    @Before public void setUp() {
        root = AppBaseConfig.ROOT_PATH;
        logo = AppBaseConfig.LOGO_PATH;
        limit = AppBaseConfig.IMAGE_MAX_SIZE;
        AppBaseConfig.ROOT_PATH = temp.getRoot().getAbsolutePath();
        AppBaseConfig.LOGO_PATH = "logo";
        AppBaseConfig.IMAGE_MAX_SIZE = 1024 * 1024;
        service = new SystemConfigServiceImpl(null, null);
    }

    @After public void tearDown() {
        AppBaseConfig.ROOT_PATH = root;
        AppBaseConfig.LOGO_PATH = logo;
        AppBaseConfig.IMAGE_MAX_SIZE = limit;
    }

    private byte[] image(String format) throws Exception {
        BufferedImage input = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(input, format, output));
        return output.toByteArray();
    }

    private MockMultipartFile file(String type, byte[] bytes) {
        return new MockMultipartFile("file", "logo", type, bytes);
    }

    @Test public void supportedImagesCanReplaceBrandFiles() throws Exception {
        for (String format : new String[]{"png", "jpeg", "gif", "bmp"}) {
            byte[] bytes = image(format);
            assertTrue(service.updateMainLogo(file("image/" + format, bytes)));
            assertArrayEquals(bytes, Files.readAllBytes(Path.of(AppBaseConfig.getLogoPath(), "main-logo.png")));
            assertTrue(service.updateLogo(file("image/" + format, bytes)));
            assertArrayEquals(bytes, Files.readAllBytes(Path.of(AppBaseConfig.getLogoPath(), "logo.png")));
        }
    }

    @Test public void invalidImagesDoNotReplaceExistingFileOrLeaveTempFiles() throws Exception {
        byte[] original = image("png");
        assertTrue(service.updateLogo(file("image/png", original)));
        byte[] broken = "not a PNG".getBytes(StandardCharsets.UTF_8);
        assertThrows(AppException.class, () -> service.updateLogo(file("image/png", broken)));
        assertThrows(AppException.class, () -> service.updateLogo(file("text/plain", original)));
        assertThrows(AppException.class, () -> service.updateLogo(file("image/png", new byte[0])));
        assertArrayEquals(original, Files.readAllBytes(Path.of(AppBaseConfig.getLogoPath(), "logo.png")));
        try (var files = Files.list(Path.of(AppBaseConfig.getLogoPath()))) {
            assertEquals(1, files.count());
        }
    }

    @Test public void oversizeFileIsRejectedBeforeReplacingOriginal() throws Exception {
        byte[] original = image("png");
        assertTrue(service.updateMainLogo(file("image/png", original)));
        AppBaseConfig.IMAGE_MAX_SIZE = original.length - 1;
        assertThrows(AppException.class, () -> service.updateMainLogo(file("image/png", original)));
        assertArrayEquals(original, Files.readAllBytes(Path.of(AppBaseConfig.getLogoPath(), "main-logo.png")));
    }
}
