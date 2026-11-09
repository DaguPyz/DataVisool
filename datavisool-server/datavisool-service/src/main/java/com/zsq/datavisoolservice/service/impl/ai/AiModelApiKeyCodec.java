/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;
import java.util.Set;

public final class AiModelApiKeyCodec {
    private static final String ENCRYPTION_PREFIX = "enc:v1:";
    private static final String SECRET_FILE = "security/ai_model_api_key.key";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Object SECRET_LOCK = new Object();
    private static volatile byte[] secretCache;

    private AiModelApiKeyCodec() {
    }

    public static boolean isEncrypted(String value) {
        return value != null && value.trim().startsWith(ENCRYPTION_PREFIX);
    }

    public static String encrypt(String plainText) {
        String trimmed = plainText == null ? "" : plainText.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        if (trimmed.startsWith(ENCRYPTION_PREFIX)) {
            return trimmed;
        }

        byte[] secret = loadOrCreateSecret();
        byte[] iv = new byte[16];
        SECURE_RANDOM.nextBytes(iv);

        try {
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(secret, "AES"),
                    new IvParameterSpec(iv)
            );
            byte[] encrypted = cipher.doFinal(trimmed.getBytes(StandardCharsets.UTF_8));
            return ENCRYPTION_PREFIX
                   + Base64.getEncoder().encodeToString(iv)
                   + ":"
                   + Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new AppException(500, sanitizeMessage("aiModel.encryptApiKey: encrypt failed: " + e.getMessage()));
        }
    }

    public static String decrypt(String storedText) {
        String trimmed = storedText == null ? "" : storedText.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        if (!trimmed.startsWith(ENCRYPTION_PREFIX)) {
            return trimmed;
        }

        String payload = trimmed.substring(ENCRYPTION_PREFIX.length());
        int splitIndex = payload.indexOf(':');
        if (splitIndex <= 0 || splitIndex >= payload.length() - 1) {
            throw new AppException(500, "aiModel.decryptApiKey: invalid encrypted payload format");
        }

        String ivText = payload.substring(0, splitIndex);
        String cipherText = payload.substring(splitIndex + 1);
        byte[] secret = loadOrCreateSecret();

        try {
            byte[] iv = Base64.getDecoder().decode(ivText);
            byte[] cipherBytes = Base64.getDecoder().decode(cipherText);
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    new SecretKeySpec(secret, "AES"),
                    new IvParameterSpec(iv)
            );
            byte[] plainBytes = cipher.doFinal(cipherBytes);
            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new AppException(500, sanitizeMessage("aiModel.decryptApiKey: decrypt failed: " + e.getMessage()));
        }
    }

    private static byte[] loadOrCreateSecret() {
        byte[] cached = secretCache;
        if (cached != null) {
            return cached.clone();
        }

        synchronized (SECRET_LOCK) {
            if (secretCache != null) {
                return secretCache.clone();
            }

            Path path = Path.of(AppBaseConfig.getRootPath(), SECRET_FILE);
            Path parent = path.getParent();
            if (parent == null) {
                throw new AppException(500, "aiModel.secretKey: invalid secret key path");
            }

            try {
                Files.createDirectories(parent);
            } catch (IOException e) {
                throw new AppException(500, sanitizeMessage("aiModel.secretKey: create parent dir failed: " + e.getMessage()));
            }

            byte[] secret;
            try {
                if (Files.exists(path)) {
                    secret = Files.readAllBytes(path);
                } else {
                    secret = new byte[32];
                    SECURE_RANDOM.nextBytes(secret);
                    try {
                        Files.write(path, secret, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                    } catch (FileAlreadyExistsException ignored) {
                        secret = Files.readAllBytes(path);
                    }
                    try {
                        Set<PosixFilePermission> permissions = EnumSet.of(
                                PosixFilePermission.OWNER_READ,
                                PosixFilePermission.OWNER_WRITE
                        );
                        Files.setPosixFilePermissions(path, permissions);
                    } catch (UnsupportedOperationException | IOException ignored) {
                        // Some file systems do not support POSIX permissions. Ignore silently.
                    }
                }
            } catch (IOException e) {
                throw new AppException(500, sanitizeMessage("aiModel.secretKey: read/write secret key failed: " + e.getMessage()));
            }

            if (secret.length != 32) {
                throw new AppException(500, "aiModel.secretKey: invalid secret key length " + secret.length + ", expected 32");
            }

            secretCache = secret.clone();
            return secretCache.clone();
        }
    }

    private static String sanitizeMessage(String message) {
        if (message == null) {
            return "";
        }
        return message.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').trim();
    }
}
