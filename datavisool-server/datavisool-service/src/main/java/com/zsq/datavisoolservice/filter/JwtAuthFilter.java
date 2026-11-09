/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.filter;

import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.service.impl.JwtRevocationService;
import com.zsq.datavisoolservice.util.JwtUtils;
import com.zsq.datavisoolservice.util.ResponseUtil;
import jakarta.annotation.Nonnull;
import jakarta.annotation.Resource;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class JwtAuthFilter extends OncePerRequestFilter {

    @Resource
    private UserDetailsService userService;

    @Resource
    private JwtRevocationService revocationService;

    @Override
    protected void doFilterInternal(@Nonnull HttpServletRequest request, @Nonnull HttpServletResponse response, @Nonnull FilterChain chain) throws ServletException, IOException {
        User user = null;
        String token = parseToken(request);
        if (token != null) {
            var claims = JwtUtils.parseValidClaims(token);
            if (claims != null) {
                try {
                    if (!revocationService.isRevoked(token)) {
                        user = (User) userService.loadUserByUsername(claims.getSubject());
                    }
                } catch (DataAccessException e) {
                    logger.error("无法检查登录令牌的失效状态", e);
                    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                    response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getWriter().write(ResponseUtil.responseJson(503, "服务暂不可用，请稍后重试"));
                    return;
                }
            }
        }
        if (user != null) {
            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        chain.doFilter(request, response);
    }

    private String parseToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }

}
