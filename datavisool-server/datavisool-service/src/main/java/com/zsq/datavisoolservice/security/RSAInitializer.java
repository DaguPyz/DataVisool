/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.security;

import com.zsq.datavisoolservice.config.AppBaseConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.security.KeyPair;
import java.util.Base64;

@Component
public class RSAInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RSAInitializer.class);

    @Override
    public void run(ApplicationArguments args) {
        try {
            KeyPair keyPair = HybridCryptoUtil.generateRsaKeyPair();
            String pub = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
            String pri = Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
            RsaKeyPair rsaKeyPair = new RsaKeyPair();
            rsaKeyPair.setPublicKey(pub);
            rsaKeyPair.setPrivateKey(pri);
            rsaKeyPair.setGenerateTime(System.currentTimeMillis());
            AppBaseConfig.SYSTEM_RSA_KEY_PAIR = rsaKeyPair;
        } catch (Exception e) {
            log.error("RSA生成密钥对失败", e);
        }
    }
}