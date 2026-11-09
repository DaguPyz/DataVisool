/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.zsq.datavisoolservice.security.ManifestSecretCodecUtil;
import org.junit.Assert;
import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class ManifestSecretCodecUtilTest {

    @Test
    public void encryptWithPassphraseV1RoundTripsPlaintext() {
        byte[] plaintext = "secret-json".getBytes(StandardCharsets.UTF_8);
        String payload = ManifestSecretCodecUtil.encryptWithPassphraseV1(plaintext, "test-passphrase");

        Assert.assertTrue(payload.startsWith(ManifestSecretCodecUtil.ENCRYPTED_FIELD_PREFIX_V1));
        Assert.assertEquals(
                "secret-json",
                new String(ManifestSecretCodecUtil.decryptWithPassphraseV1(payload, "test-passphrase"), StandardCharsets.UTF_8)
        );
    }

    @Test
    public void decryptWithPassphraseV1ParsesEnvelopeFields() {
        String envelopeJson =
                "{\"alg\":\"A256GCM\",\"kdf\":\"Argon2id\",\"salt\":\"AAAAAAAAAAAAAAAAAAAAAA==\",\"nonce\":\"AAAAAAAAAAAAAAAA\",\"ciphertext\":\"AAAAAAAAAAAAAAAAAAAAAA==\"}";
        String payload = "enc:v1:" + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(envelopeJson.getBytes(StandardCharsets.UTF_8));

        try {
            ManifestSecretCodecUtil.decryptWithPassphraseV1(payload, "test-passphrase");
            Assert.fail("expected decrypt to fail");
        } catch (ManifestSecretCodecUtil.ManifestSecretCodecException e) {
            Assert.assertEquals(ManifestSecretCodecUtil.ErrorCode.AES_DECRYPT, e.getErrorCode());
        }
    }

    @Test
    public void decryptEnvelopeJsonWithPassphraseV1RoundTripsPlaintext() {
        byte[] plaintext = "package-zip-bytes".getBytes(StandardCharsets.UTF_8);
        String payload = ManifestSecretCodecUtil.encryptWithPassphraseV1(plaintext, "test-passphrase");
        byte[] envelopeBytes = Base64.getUrlDecoder()
                .decode(payload.substring(ManifestSecretCodecUtil.ENCRYPTED_FIELD_PREFIX_V1.length()));

        Assert.assertEquals(
                "package-zip-bytes",
                new String(ManifestSecretCodecUtil.decryptEnvelopeJsonWithPassphraseV1(
                        new String(envelopeBytes, StandardCharsets.UTF_8),
                        "test-passphrase"
                ), StandardCharsets.UTF_8)
        );
    }

    @Test
    public void encryptEnvelopeJsonWithPassphraseV1ReturnsRawEnvelopeJson() {
        String envelopeJson = ManifestSecretCodecUtil.encryptEnvelopeJsonWithPassphraseV1(
                "package-zip-bytes".getBytes(StandardCharsets.UTF_8),
                "test-passphrase"
        );

        Assert.assertFalse(envelopeJson.startsWith(ManifestSecretCodecUtil.ENCRYPTED_FIELD_PREFIX_V1));
        Assert.assertTrue(envelopeJson.contains("\"alg\":\"A256GCM\""));
        Assert.assertEquals(
                "package-zip-bytes",
                new String(ManifestSecretCodecUtil.decryptEnvelopeJsonWithPassphraseV1(envelopeJson, "test-passphrase"), StandardCharsets.UTF_8)
        );
    }

    @Test
    public void encryptFileToEnvelopeJsonWithPassphraseV1RoundTripsThroughFiles() throws Exception {
        Path input = Files.createTempFile("manifest-codec-input", ".zip");
        Path encrypted = Files.createTempFile("manifest-codec-payload", ".enc");
        Path decrypted = Files.createTempFile("manifest-codec-output", ".zip");
        try {
            Files.writeString(input, "package-zip-bytes", StandardCharsets.UTF_8);

            ManifestSecretCodecUtil.encryptFileToEnvelopeJsonWithPassphraseV1(input, encrypted, "test-passphrase");
            ManifestSecretCodecUtil.decryptEnvelopeJsonFileWithPassphraseV1(encrypted, decrypted, "test-passphrase");

            Assert.assertTrue(Files.readString(encrypted, StandardCharsets.UTF_8).contains("\"ciphertext\":\""));
            Assert.assertEquals("package-zip-bytes", Files.readString(decrypted, StandardCharsets.UTF_8));
        } finally {
            Files.deleteIfExists(input);
            Files.deleteIfExists(encrypted);
            Files.deleteIfExists(decrypted);
        }
    }

    @Test
    public void fileDecryptionRejectsWrongPassphraseAndPreservesExistingOutput() throws Exception {
        Path encrypted = Files.createTempFile("manifest-codec-wrong-password", ".enc");
        Path output = Files.createTempFile("manifest-codec-existing-output", ".zip");
        try {
            Files.writeString(encrypted, ManifestSecretCodecUtil.encryptEnvelopeJsonWithPassphraseV1(
                    "package-zip-bytes".getBytes(StandardCharsets.UTF_8), "correct-passphrase"));
            Files.writeString(output, "existing-output");
            var error = Assert.assertThrows(ManifestSecretCodecUtil.ManifestSecretCodecException.class,
                    () -> ManifestSecretCodecUtil.decryptEnvelopeJsonFileWithPassphraseV1(encrypted, output, "wrong-passphrase"));
            Assert.assertEquals(ManifestSecretCodecUtil.ErrorCode.AES_DECRYPT, error.getErrorCode());
            Assert.assertEquals("existing-output", Files.readString(output));
        } finally {
            Files.deleteIfExists(encrypted);
            Files.deleteIfExists(output);
        }
    }

    @Test
    public void fileDecryptionRejectsTamperedCiphertextAndPreservesExistingOutput() throws Exception {
        Path encrypted = Files.createTempFile("manifest-codec-tampered", ".enc");
        Path output = Files.createTempFile("manifest-codec-existing-output", ".zip");
        try {
            JSONObject envelope = JSON.parseObject(ManifestSecretCodecUtil.encryptEnvelopeJsonWithPassphraseV1(
                    "package-zip-bytes".getBytes(StandardCharsets.UTF_8), "test-passphrase"));
            byte[] ciphertext = Base64.getDecoder().decode(envelope.getString("ciphertext"));
            ciphertext[ciphertext.length - 1] ^= 1;
            envelope.put("ciphertext", Base64.getEncoder().encodeToString(ciphertext));
            Files.writeString(encrypted, JSON.toJSONString(envelope));
            Files.writeString(output, "existing-output");
            var error = Assert.assertThrows(ManifestSecretCodecUtil.ManifestSecretCodecException.class,
                    () -> ManifestSecretCodecUtil.decryptEnvelopeJsonFileWithPassphraseV1(encrypted, output, "test-passphrase"));
            Assert.assertEquals(ManifestSecretCodecUtil.ErrorCode.AES_DECRYPT, error.getErrorCode());
            Assert.assertEquals("existing-output", Files.readString(output));
        } finally {
            Files.deleteIfExists(encrypted);
            Files.deleteIfExists(output);
        }
    }

    @Test
    public void decryptEnvelopeJsonFileWithPassphraseV1DoesNotDependOnFieldOrder() throws Exception {
        Path encrypted = Files.createTempFile("manifest-codec-reordered-payload", ".enc");
        Path decrypted = Files.createTempFile("manifest-codec-reordered-output", ".zip");
        try {
            String envelopeJson = ManifestSecretCodecUtil.encryptEnvelopeJsonWithPassphraseV1(
                    "package-zip-bytes".getBytes(StandardCharsets.UTF_8),
                    "test-passphrase"
            );
            JSONObject envelope = JSON.parseObject(envelopeJson);
            String reorderedEnvelopeJson = "{"
                    + "\"ciphertext\":\"" + envelope.getString("ciphertext") + "\","
                    + "\"nonce\":\"" + envelope.getString("nonce") + "\","
                    + "\"salt\":\"" + envelope.getString("salt") + "\","
                    + "\"kdf\":\"" + envelope.getString("kdf") + "\","
                    + "\"alg\":\"" + envelope.getString("alg") + "\""
                    + "}";
            Files.writeString(encrypted, reorderedEnvelopeJson, StandardCharsets.UTF_8);

            ManifestSecretCodecUtil.decryptEnvelopeJsonFileWithPassphraseV1(encrypted, decrypted, "test-passphrase");

            Assert.assertEquals("package-zip-bytes", Files.readString(decrypted, StandardCharsets.UTF_8));
        } finally {
            Files.deleteIfExists(encrypted);
            Files.deleteIfExists(decrypted);
        }
    }
}
