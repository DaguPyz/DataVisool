/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.EncryptResultDTO;
import com.zsq.datavisoolservice.model.dto.LoginDTO;
import com.zsq.datavisoolservice.model.dto.LoginInfoDTO;
import com.zsq.datavisoolservice.security.HybridCryptoUtil;
import com.zsq.datavisoolservice.service.impl.AuthService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/api/authenticate")
public class AuthenticateController {

    @Resource
    private AuthService authService;

    @PostMapping("/login")
    public ApiResponse<LoginInfoDTO> login(@RequestBody LoginDTO loginDTO) {
        EncryptResultDTO password = loginDTO.getPassword();
        String decryptPwd = HybridCryptoUtil.decrypt(password);
        return ApiResponse.success(authService.authenticate(loginDTO.getUsername(), decryptPwd));
    }

}
