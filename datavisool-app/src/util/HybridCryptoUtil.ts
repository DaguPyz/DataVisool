/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import JSEncrypt from "jsencrypt";
import CryptoJS from "crypto-js";
import FetchUtil from "./FetchUtil.ts";

export interface EncryptResult {
    encryptedData: string;   // AES 加密后的数据 (Base64)
    encryptedAesKey: string; // RSA 加密后的 AES key
    iv: string;              // AES IV (Base64)
}

/**
 * 双向混合加密工具
 */
export class HybridCryptoUtil {

    private static SERVER_PUBLIC_KEY: string | null = null;
    private static serverEncryptor: JSEncrypt | null = null;
    private static clientEncryptor: JSEncrypt | null = null;

    /** 初始化客户端 RSA 密钥对 */
    public static initClientKeyPair() {
        if (!this.clientEncryptor) {
            this.clientEncryptor = new JSEncrypt({default_key_size: '2048'});
            this.clientEncryptor.getKey(); // 生成 key pair
        }
    }

    /** 获取客户端公钥 (发送给后端) */
    public static getClientPublicKey(): string {
        this.initClientKeyPair();
        return this.clientEncryptor!.getPublicKeyB64().replace(/\s+/g, '');
    }

    /** 获取服务器公钥 (请求加密使用) */
    private static async getServerPublicKey(): Promise<string> {
        if (this.SERVER_PUBLIC_KEY) {
            return this.SERVER_PUBLIC_KEY;
        } else {
            const response = await FetchUtil.get<any>("/api/security/getEncryptKey")
            if (response === null) {
                console.error('安全策略初始化失败');
                return '';
            }
            const newKey = response.key;
            this.SERVER_PUBLIC_KEY = newKey;
            return newKey;
        }
    }

    /** 生成随机 AES key (Base64, 32 字节 = 256bit) */
    private static generateAesKey(): string {
        return CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.random(32));
    }

    /** 生成随机 IV (Base64, 16 字节) */
    private static generateIv(): CryptoJS.lib.WordArray {
        return CryptoJS.lib.WordArray.random(16);
    }

    /** AES-CBC 加密 */
    private static aesEncrypt(plainText: string, base64Key: string, iv: CryptoJS.lib.WordArray): string {
        const key = CryptoJS.enc.Base64.parse(base64Key);
        const encrypted = CryptoJS.AES.encrypt(plainText, key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    }

    /** AES-CBC 解密 */
    private static aesDecrypt(base64Data: string, base64Key: string, base64Iv: string): string {
        const key = CryptoJS.enc.Base64.parse(base64Key);
        const iv = CryptoJS.enc.Base64.parse(base64Iv);
        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Base64.parse(base64Data)
        });
        const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
            iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        const result = decrypted.toString(CryptoJS.enc.Utf8);
        if (!result) throw new Error("AES 解密失败: Malformed UTF-8 data");
        return result;
    }

    /** RSA 公钥加密 AES key */
    private static rsaEncrypt(base64AesKey: string, publicKey: string): string {
        if (!this.serverEncryptor) this.serverEncryptor = new JSEncrypt();
        this.serverEncryptor.setPublicKey(publicKey);
        const encrypted = this.serverEncryptor.encrypt(base64AesKey);
        if (!encrypted) throw new Error("RSA 公钥加密 AES key 失败");
        return encrypted;
    }

    /** RSA 私钥解密 AES key */
    private static rsaDecrypt(encryptedAesKey: string): string {
        if (!this.clientEncryptor) throw new Error("客户端加密器未初始化");
        const decrypted = this.clientEncryptor.decrypt(encryptedAesKey);
        if (!decrypted) throw new Error("RSA 私钥解密 AES key 失败");
        return decrypted; // Base64 AES key
    }

    /** 加密请求数据 */
    public static async encryptRequest(plainText: string): Promise<EncryptResult> {
        const aesKey = this.generateAesKey();
        const iv = this.generateIv();
        const serverPublicKey = await this.getServerPublicKey();

        const encryptedData = this.aesEncrypt(plainText, aesKey, iv);
        const encryptedAesKey = this.rsaEncrypt(aesKey, serverPublicKey);

        return {
            encryptedData,
            encryptedAesKey,
            iv: CryptoJS.enc.Base64.stringify(iv)
        };
    }

    /** 解密响应数据 (后端使用前端公钥加密 AES key) */
    public static decryptResponse(encryptedObj: EncryptResult): string {
        const aesKey = this.rsaDecrypt(encryptedObj.encryptedAesKey); // Base64 AES key
        return this.aesDecrypt(encryptedObj.encryptedData, aesKey, encryptedObj.iv);
    }
}
