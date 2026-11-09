/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.security;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.fasterxml.jackson.core.Base64Variants;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import lombok.Getter;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;

import javax.crypto.Cipher;
import javax.crypto.CipherOutputStream;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

public final class ManifestSecretCodecUtil {
    public static final String ENCRYPTED_FIELD_PREFIX_V1 = "enc:v1:";
    private static final String ENCRYPTED_ENVELOPE_ALG_A256_GCM = "A256GCM";
    private static final String ENCRYPTED_ENVELOPE_KDF_ARGON2_ID = "Argon2id";
    private static final int ARGON2ID_DEFAULT_KEY_LEN = 32;
    private static final int ARGON2ID_DEFAULT_M_COST_KIB = 19_456;
    private static final int ARGON2ID_DEFAULT_T_COST = 2;
    private static final int ARGON2ID_DEFAULT_P_COST = 1;
    private static final int AES_256_GCM_NONCE_LEN = 12;
    private static final int AES_256_GCM_TAG_LEN_BITS = 128;
    private static final int STREAM_COPY_BUFFER_SIZE = 64 * 1024;
    private static final JsonFactory JSON_FACTORY = new JsonFactory();
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private ManifestSecretCodecUtil() {
    }

    public static byte[] decryptWithPassphraseV1(String input, String passphrase) {
        String payload = normalizeText(input);
        String normalizedPassphrase = normalizeText(passphrase);
        if (!payload.startsWith(ENCRYPTED_FIELD_PREFIX_V1)) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_PREFIX, "invalid encrypted field prefix");
        }
        byte[] envelopeBytes;
        try {
            envelopeBytes = Base64.getUrlDecoder().decode(payload.substring(ENCRYPTED_FIELD_PREFIX_V1.length()));
        } catch (IllegalArgumentException e) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload", e);
        }

        JSONObject envelopeObject;
        try {
            envelopeObject = JSON.parseObject(new String(envelopeBytes, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json", e);
        }
        if (envelopeObject == null) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json");
        }
        EncryptedEnvelopeV1 envelope = new EncryptedEnvelopeV1();
        envelope.alg = envelopeObject.getString("alg");
        envelope.kdf = envelopeObject.getString("kdf");
        envelope.salt = envelopeObject.getString("salt");
        envelope.nonce = envelopeObject.getString("nonce");
        envelope.ciphertext = envelopeObject.getString("ciphertext");
        return decryptEnvelopeV1(envelope, normalizedPassphrase);
    }

    public static byte[] decryptEnvelopeJsonWithPassphraseV1(String input, String passphrase) {
        JSONObject envelopeObject;
        try {
            envelopeObject = JSON.parseObject(normalizeText(input));
        } catch (Exception e) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json", e);
        }
        if (envelopeObject == null) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json");
        }
        EncryptedEnvelopeV1 envelope = new EncryptedEnvelopeV1();
        envelope.alg = envelopeObject.getString("alg");
        envelope.kdf = envelopeObject.getString("kdf");
        envelope.salt = envelopeObject.getString("salt");
        envelope.nonce = envelopeObject.getString("nonce");
        envelope.ciphertext = envelopeObject.getString("ciphertext");
        return decryptEnvelopeV1(envelope, normalizeText(passphrase));
    }

    public static void decryptEnvelopeJsonFileWithPassphraseV1(Path input, Path output, String passphrase) {
        Path ciphertextFile = null;
        try {
            ciphertextFile = Files.createTempFile("datavisool-envelope-ciphertext-", ".bin");
            try (InputStream inputStream = Files.newInputStream(input);
                 JsonParser parser = JSON_FACTORY.createParser(inputStream)) {
                EncryptedEnvelopeV1 envelope = new EncryptedEnvelopeV1();
                if (parser.nextToken() != JsonToken.START_OBJECT) {
                    throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json");
                }

                boolean ciphertextFound = false;
                while (parser.nextToken() != JsonToken.END_OBJECT) {
                    if (parser.currentToken() != JsonToken.FIELD_NAME) {
                        throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json");
                    }
                    String fieldName = parser.currentName();
                    JsonToken valueToken = parser.nextToken();
                    if ("alg".equals(fieldName)) {
                        envelope.alg = parser.getValueAsString();
                    } else if ("kdf".equals(fieldName)) {
                        envelope.kdf = parser.getValueAsString();
                    } else if ("salt".equals(fieldName)) {
                        envelope.salt = parser.getValueAsString();
                    } else if ("nonce".equals(fieldName)) {
                        envelope.nonce = parser.getValueAsString();
                    } else if ("ciphertext".equals(fieldName)) {
                        if (valueToken != JsonToken.VALUE_STRING) {
                            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
                        }
                        if (ciphertextFound) {
                            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_JSON, "invalid encrypted envelope json");
                        }
                        try (OutputStream ciphertextOut = Files.newOutputStream(ciphertextFile)) {
                            parser.readBinaryValue(Base64Variants.MIME_NO_LINEFEEDS, ciphertextOut);
                        }
                        ciphertextFound = true;
                    } else {
                        parser.skipChildren();
                    }
                }

                if (!ciphertextFound) {
                    throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
                }
                decryptCiphertextFile(envelope, normalizeText(passphrase), ciphertextFile, output);
            }
        } catch (ManifestSecretCodecException e) {
            throw e;
        } catch (IOException e) {
            throw new ManifestSecretCodecException(ErrorCode.ENVELOPE_IO, "encrypted envelope io failed", e);
        } finally {
            if (ciphertextFile != null) {
                try {
                    Files.deleteIfExists(ciphertextFile);
                } catch (IOException ignored) {
                    // Best-effort cleanup for import temp files.
                }
            }
        }
    }

    public static String encryptWithPassphraseV1(byte[] input, String passphrase) {
        String envelopeJson = encryptEnvelopeJsonWithPassphraseV1(input, passphrase);
        byte[] envelopeBytes = envelopeJson.getBytes(StandardCharsets.UTF_8);
        return ENCRYPTED_FIELD_PREFIX_V1 + Base64.getUrlEncoder().withoutPadding().encodeToString(envelopeBytes);
    }

    public static String encryptEnvelopeJsonWithPassphraseV1(byte[] input, String passphrase) {
        byte[] salt = new byte[16];
        byte[] nonce = new byte[AES_256_GCM_NONCE_LEN];
        SECURE_RANDOM.nextBytes(salt);
        SECURE_RANDOM.nextBytes(nonce);
        byte[] key = deriveArgon2idKey(normalizeText(passphrase), salt, ARGON2ID_DEFAULT_KEY_LEN);

        byte[] ciphertext;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(AES_256_GCM_TAG_LEN_BITS, nonce));
            ciphertext = cipher.doFinal(input == null ? new byte[0] : input);
        } catch (Exception e) {
            throw new ManifestSecretCodecException(ErrorCode.AES_ENCRYPT, "aes encrypt failed", e);
        }

        JSONObject envelope = new JSONObject();
        envelope.put("alg", ENCRYPTED_ENVELOPE_ALG_A256_GCM);
        envelope.put("kdf", ENCRYPTED_ENVELOPE_KDF_ARGON2_ID);
        envelope.put("salt", Base64.getEncoder().encodeToString(salt));
        envelope.put("nonce", Base64.getEncoder().encodeToString(nonce));
        envelope.put("ciphertext", Base64.getEncoder().encodeToString(ciphertext));
        return JSON.toJSONString(envelope);
    }

    public static void encryptFileToEnvelopeJsonWithPassphraseV1(Path input, Path output, String passphrase) {
        byte[] salt = new byte[16];
        byte[] nonce = new byte[AES_256_GCM_NONCE_LEN];
        SECURE_RANDOM.nextBytes(salt);
        SECURE_RANDOM.nextBytes(nonce);
        byte[] key = deriveArgon2idKey(normalizeText(passphrase), salt, ARGON2ID_DEFAULT_KEY_LEN);

        try (OutputStream out = Files.newOutputStream(output)) {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(AES_256_GCM_TAG_LEN_BITS, nonce));

            writeAscii(out, "{\"alg\":\"");
            writeAscii(out, ENCRYPTED_ENVELOPE_ALG_A256_GCM);
            writeAscii(out, "\",\"kdf\":\"");
            writeAscii(out, ENCRYPTED_ENVELOPE_KDF_ARGON2_ID);
            writeAscii(out, "\",\"salt\":\"");
            writeAscii(out, Base64.getEncoder().encodeToString(salt));
            writeAscii(out, "\",\"nonce\":\"");
            writeAscii(out, Base64.getEncoder().encodeToString(nonce));
            writeAscii(out, "\",\"ciphertext\":\"");

            OutputStream base64Out = Base64.getEncoder().wrap(new NonClosingOutputStream(out));
            try (InputStream in = Files.newInputStream(input);
                 CipherOutputStream cipherOut = new CipherOutputStream(base64Out, cipher)) {
                copy(in, cipherOut);
            }

            writeAscii(out, "\"}");
        } catch (ManifestSecretCodecException e) {
            throw e;
        } catch (Exception e) {
            throw new ManifestSecretCodecException(ErrorCode.AES_ENCRYPT, "aes encrypt failed", e);
        }
    }

    private static byte[] decryptEnvelopeV1(EncryptedEnvelopeV1 envelope, String passphrase) {
        if (!ENCRYPTED_ENVELOPE_ALG_A256_GCM.equals(normalizeText(envelope.alg))) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_ALGORITHM, "invalid encrypted envelope algorithm");
        }
        if (!ENCRYPTED_ENVELOPE_KDF_ARGON2_ID.equals(normalizeText(envelope.kdf))) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_KDF, "invalid encrypted envelope kdf");
        }

        byte[] salt = decodeBase64(envelope.salt, ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
        byte[] nonce = decodeBase64(envelope.nonce, ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
        if (nonce.length != AES_256_GCM_NONCE_LEN) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_NONCE, "invalid encrypted envelope nonce");
        }
        byte[] ciphertext = decodeBase64(envelope.ciphertext, ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
        byte[] key = deriveArgon2idKey(passphrase, salt, ARGON2ID_DEFAULT_KEY_LEN);

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(AES_256_GCM_TAG_LEN_BITS, nonce));
            return cipher.doFinal(ciphertext);
        } catch (ManifestSecretCodecException e) {
            throw e;
        } catch (Exception e) {
            throw new ManifestSecretCodecException(ErrorCode.AES_DECRYPT, "aes decrypt failed", e);
        }
    }

    private static void decryptCiphertextFile(EncryptedEnvelopeV1 envelope, String passphrase, Path ciphertextFile, Path output) {
        validateEnvelopeHeader(envelope);
        byte[] salt = decodeBase64(envelope.salt, ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
        byte[] nonce = decodeBase64(envelope.nonce, ErrorCode.INVALID_ENCRYPTED_ENVELOPE_PAYLOAD, "invalid encrypted envelope payload");
        if (nonce.length != AES_256_GCM_NONCE_LEN) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_NONCE, "invalid encrypted envelope nonce");
        }
        byte[] key = deriveArgon2idKey(passphrase, salt, ARGON2ID_DEFAULT_KEY_LEN);

        Path plaintextTemp = null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(AES_256_GCM_TAG_LEN_BITS, nonce));
            Path outputPath = output.toAbsolutePath();
            plaintextTemp = Files.createTempFile(outputPath.getParent(), "datavisool-decrypt-", ".tmp");
            try (InputStream ciphertextIn = Files.newInputStream(ciphertextFile);
                 OutputStream fileOut = Files.newOutputStream(plaintextTemp)) {
                byte[] buffer = new byte[STREAM_COPY_BUFFER_SIZE];
                int read;
                while ((read = ciphertextIn.read(buffer)) != -1) {
                    byte[] decrypted = cipher.update(buffer, 0, read);
                    if (decrypted != null) fileOut.write(decrypted);
                }
                byte[] finalBytes = cipher.doFinal();
                if (finalBytes != null) fileOut.write(finalBytes);
            }
            Files.move(plaintextTemp, outputPath, StandardCopyOption.REPLACE_EXISTING);
        } catch (GeneralSecurityException e) {
            throw new ManifestSecretCodecException(ErrorCode.AES_DECRYPT, "aes decrypt failed", e);
        } catch (IOException e) {
            throw new ManifestSecretCodecException(ErrorCode.ENVELOPE_IO, "encrypted envelope io failed", e);
        } finally {
            if (plaintextTemp != null) {
                try {
                    Files.deleteIfExists(plaintextTemp);
                } catch (IOException ignored) {
                    // Best-effort cleanup of unverified plaintext.
                }
            }
        }
    }

    private static void validateEnvelopeHeader(EncryptedEnvelopeV1 envelope) {
        if (!ENCRYPTED_ENVELOPE_ALG_A256_GCM.equals(normalizeText(envelope.alg))) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_ALGORITHM, "invalid encrypted envelope algorithm");
        }
        if (!ENCRYPTED_ENVELOPE_KDF_ARGON2_ID.equals(normalizeText(envelope.kdf))) {
            throw new ManifestSecretCodecException(ErrorCode.INVALID_ENCRYPTED_ENVELOPE_KDF, "invalid encrypted envelope kdf");
        }
    }

    private static byte[] deriveArgon2idKey(String passphrase, byte[] salt, int keyLength) {
        try {
            Argon2Parameters parameters = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                    .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                    .withIterations(ARGON2ID_DEFAULT_T_COST)
                    .withMemoryAsKB(ARGON2ID_DEFAULT_M_COST_KIB)
                    .withParallelism(ARGON2ID_DEFAULT_P_COST)
                    .withSalt(salt)
                    .build();
            Argon2BytesGenerator generator = new Argon2BytesGenerator();
            generator.init(parameters);
            byte[] key = new byte[keyLength];
            generator.generateBytes(passphrase.getBytes(StandardCharsets.UTF_8), key);
            return key;
        } catch (ManifestSecretCodecException e) {
            throw e;
        } catch (IllegalArgumentException e) {
            throw new ManifestSecretCodecException(ErrorCode.ARGON2_PARAMS, "argon2 parameter invalid", e);
        } catch (Exception e) {
            throw new ManifestSecretCodecException(ErrorCode.ARGON2_KEY_DERIVE, "argon2 key derivation failed", e);
        }
    }

    private static byte[] decodeBase64(String value, ErrorCode errorCode, String message) {
        try {
            return Base64.getDecoder().decode(normalizeText(value));
        } catch (IllegalArgumentException e) {
            throw new ManifestSecretCodecException(errorCode, message, e);
        }
    }

    private static String normalizeText(String text) {
        return text == null ? "" : text.trim();
    }

    private static void writeAscii(OutputStream out, String value) throws IOException {
        out.write(value.getBytes(StandardCharsets.US_ASCII));
    }

    private static long copy(InputStream inputStream, OutputStream outputStream) throws IOException {
        byte[] buffer = new byte[STREAM_COPY_BUFFER_SIZE];
        long copied = 0L;
        int read;
        while ((read = inputStream.read(buffer)) != -1) {
            outputStream.write(buffer, 0, read);
            copied += read;
        }
        return copied;
    }

    private static final class NonClosingOutputStream extends FilterOutputStream {
        private NonClosingOutputStream(OutputStream out) {
            super(out);
        }

        @Override
        public void close() throws IOException {
            flush();
        }
    }

    private static final class EncryptedEnvelopeV1 {
        private String alg;
        private String kdf;
        private String salt;
        private String nonce;
        private String ciphertext;
    }

    @Getter
    public enum ErrorCode {
        INVALID_ENCRYPTED_PREFIX,
        INVALID_ENCRYPTED_ENVELOPE_PAYLOAD,
        INVALID_ENCRYPTED_ENVELOPE_JSON,
        INVALID_ENCRYPTED_ENVELOPE_ALGORITHM,
        INVALID_ENCRYPTED_ENVELOPE_KDF,
        INVALID_ENCRYPTED_ENVELOPE_NONCE,
        ARGON2_PARAMS,
        ARGON2_KEY_DERIVE,
        AES_ENCRYPT,
        AES_DECRYPT,
        ENVELOPE_IO
    }

    public static class ManifestSecretCodecException extends RuntimeException {
        @Getter
        private final ErrorCode errorCode;

        public ManifestSecretCodecException(ErrorCode errorCode, String message) {
            super(message);
            this.errorCode = errorCode;
        }

        public ManifestSecretCodecException(ErrorCode errorCode, String message, Throwable cause) {
            super(message, cause);
            this.errorCode = errorCode;
        }
    }
}
