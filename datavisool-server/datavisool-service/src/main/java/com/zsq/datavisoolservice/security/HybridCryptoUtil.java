/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.security;

import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.model.dto.EncryptResultDTO;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * 混合加密工具类：RSA + AES
 * 使用方式：
 * - encrypt(明文, RSA公钥Base64)
 * - decrypt(密文JSON, RSA私钥Base64)
 */
public class HybridCryptoUtil {

    // 生成 RSA 密钥对
    public static KeyPair generateRsaKeyPair() throws Exception {
        KeyPairGenerator keyPairGen = KeyPairGenerator.getInstance("RSA");
        keyPairGen.initialize(2048);
        return keyPairGen.generateKeyPair();
    }

    private static String rsaEncrypt(byte[] data, PublicKey publicKey) throws Exception {
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, publicKey);
        return Base64.getEncoder().encodeToString(cipher.doFinal(data));
    }

    private static byte[] rsaDecrypt(String base64Data, PrivateKey privateKey) throws Exception {
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.DECRYPT_MODE, privateKey);
        return cipher.doFinal(Base64.getDecoder().decode(base64Data));
    }

    private static String aesEncrypt(String plainText, SecretKey secretKey, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, new IvParameterSpec(iv));
        byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(encrypted);
    }

    private static String aesDecrypt(String base64CipherText, SecretKey secretKey, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, secretKey, new IvParameterSpec(iv));
        byte[] decrypted = cipher.doFinal(Base64.getDecoder().decode(base64CipherText));
        return new String(decrypted, StandardCharsets.UTF_8);
    }

    private static PublicKey getPublicKeyFromBase64(String base64PublicKey) throws Exception {
        byte[] keyBytes = Base64.getDecoder().decode(base64PublicKey);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(keyBytes);
        return KeyFactory.getInstance("RSA").generatePublic(keySpec);
    }

    private static PrivateKey getPrivateKeyFromBase64(String base64PrivateKey) throws Exception {
        byte[] keyBytes = Base64.getDecoder().decode(base64PrivateKey);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(keyBytes);
        return KeyFactory.getInstance("RSA").generatePrivate(keySpec);
    }

    private static SecretKey getAesKeyFromBase64(String base64Key) {
        byte[] decodedKey = Base64.getDecoder().decode(base64Key);
        return new SecretKeySpec(decodedKey, "AES");
    }

    public static EncryptResultDTO encrypt(String plainText, String base64PublicKey) throws Exception {
        // 生成 AES Key
        KeyGenerator keyGen = KeyGenerator.getInstance("AES");
        keyGen.init(256);
        SecretKey aesKey = keyGen.generateKey();

        // 生成 IV
        byte[] iv = new byte[16];
        SecureRandom random = new SecureRandom();
        random.nextBytes(iv);

        // AES 加密数据
        String encryptedData = aesEncrypt(plainText, aesKey, iv);

        // RSA 加密 AES Key（直接 Base64）
        PublicKey publicKey = getPublicKeyFromBase64(base64PublicKey);
        String base64AesKey = Base64.getEncoder().encodeToString(aesKey.getEncoded());
        String encryptedAesKey = rsaEncrypt(base64AesKey.getBytes(StandardCharsets.UTF_8), publicKey);

        EncryptResultDTO result = new EncryptResultDTO();
        result.encryptedData = encryptedData;
        result.encryptedAesKey = encryptedAesKey;
        result.iv = Base64.getEncoder().encodeToString(iv);
        return result;
    }

    public static String decrypt(EncryptResultDTO encrypted, String base64PrivateKey) throws Exception {
        PrivateKey privateKey = getPrivateKeyFromBase64(base64PrivateKey);

        // RSA 解密 AES Key
        byte[] decryptedAesKeyBytes = rsaDecrypt(encrypted.encryptedAesKey, privateKey);
        String base64AesKey = new String(decryptedAesKeyBytes, StandardCharsets.UTF_8);
        SecretKey aesKey = getAesKeyFromBase64(base64AesKey);

        // AES 解密数据
        return aesDecrypt(encrypted.encryptedData, aesKey, Base64.getDecoder().decode(encrypted.iv));
    }

    /**
     * 加密，RSA公钥直接读取系统内的公钥
     *
     * @param plainText 明文
     * @return 密文
     */
    public static EncryptResultDTO encrypt(String plainText) throws Exception {
        String publicKey = AppBaseConfig.SYSTEM_RSA_KEY_PAIR.getPublicKey();
        return encrypt(plainText, publicKey);
    }

    /**
     * 解密，RSA私钥直接读取系统内的私钥
     *
     * @param encrypted 密文
     * @return 明文
     */
    public static String decrypt(EncryptResultDTO encrypted) {
        String privateKey = AppBaseConfig.SYSTEM_RSA_KEY_PAIR.getPrivateKey();
        try {
            return decrypt(encrypted, privateKey);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}