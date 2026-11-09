/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.LoginInfoDTO;
import com.zsq.datavisoolservice.util.JwtUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * @author yinzhenpu
 * @date 2025/2/23 18:25:24
 * @description 授权服务
 */
@Log4j2
@Service
@RequiredArgsConstructor
public class AuthService {
    private final AuthenticationManager authenticationManager;

    public LoginInfoDTO authenticate(String username, String password) {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(username, password);
        // 执行Spring Security认证
        Authentication authentication = authenticationManager.authenticate(authenticationToken);

        // 生成JWT令牌
        User user = (User) authentication.getPrincipal();
        String token = JwtUtils.generateToken(user);
        LoginInfoDTO userDTO = new LoginInfoDTO();
        BeanUtils.copyProperties(user, userDTO);
        userDTO.setToken(token);
        List<String> roles = user.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .toList();
        userDTO.setRoles(roles);
        return userDTO;
    }
}
