/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.model.dto.EncryptKeyDTO;
import com.zsq.datavisoolservice.security.RsaKeyPair;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/security")
public class SecurityController {

    /**
     * 获取RSA公钥
     *
     * @return RSA公钥
     */
    @GetMapping("/getEncryptKey")
    public ApiResponse<EncryptKeyDTO> getEncryptKey() {
        RsaKeyPair keyPair = AppBaseConfig.SYSTEM_RSA_KEY_PAIR;
        EncryptKeyDTO dto = new EncryptKeyDTO(keyPair.getPublicKey(), keyPair.getGenerateTime());
        return ApiResponse.success(dto);
    }

}
