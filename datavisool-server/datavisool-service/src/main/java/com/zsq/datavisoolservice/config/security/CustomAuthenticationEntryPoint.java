/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config.security;

import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.util.ResponseUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AccountExpiredException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * @author yinzhenpu
 * @date 2025/2/24 18:11:40
 * @description 处理认证未通过的请求
 */
@Component
public class CustomAuthenticationEntryPoint implements AuthenticationEntryPoint {
    @Override
    public void commence(HttpServletRequest request,
                         HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        // 设置响应头
        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(getErrorMsg(authException));
    }

    private static String getErrorMsg(AuthenticationException authException) {
        String errorMsg;
        if (authException instanceof BadCredentialsException) {
            errorMsg = ResponseUtil.responseJson(AppStatusCode.PWD_ERR.code(), "用户名或密码错误");
        } else if (authException instanceof UsernameNotFoundException) {
            errorMsg = ResponseUtil.responseJson(AppStatusCode.USER_NOT_EXIST.code(), "用户不存在");
        } else if (authException instanceof AccountExpiredException) {
            errorMsg = ResponseUtil.responseJson(AppStatusCode.ACCOUNT_EXPIRED.code(), "账户已过期");
        } else if (authException instanceof LockedException) {
            errorMsg = ResponseUtil.responseJson(AppStatusCode.UNAUTHORIZED.code(), "账户被锁定");
        } else {
            errorMsg = ResponseUtil.responseJson(AppStatusCode.UN_LOGGED_IN.code(), "用户未登录，请先登录");
        }
        return errorMsg;
    }
}