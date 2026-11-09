/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Date;
import java.util.UUID;

/**
 * @author yinzhenpu
 * @date 2025/2/23 17:28:45
 * @description Jwt工具类
 */
public class JwtUtils {
    private static final String SECRET_KEY = Jwts.SIG.HS256.key().build().toString();
    private static final long EXPIRATION_MS = 3600000 * 24; // 24小时

    private static final Logger log = LoggerFactory.getLogger(JwtUtils.class);

    // 生成令牌
    public static String generateToken(UserDetails user) {
        return Jwts.builder()
                .subject(user.getUsername())
                .id(UUID.randomUUID().toString())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + EXPIRATION_MS))
                .signWith(Keys.hmacShaKeyFor(SECRET_KEY.getBytes()))
                .compact();
    }

    // 解析令牌
    public static String extractUsername(String token) {
        return Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(SECRET_KEY.getBytes()))
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }

    /**
     * 验证JWT令牌有效性（需手动实现）
     *
     * @param token 令牌字符串
     * @return true=有效令牌，false=无效令牌
     */
    public static boolean validateToken(String token) {
        return parseValidClaims(token) != null;
    }

    public static Claims parseValidClaims(String token) {
        try {
            // 解析令牌结构
            Jws<Claims> claimsJws = Jwts.parser()
                    .verifyWith(Keys.hmacShaKeyFor(SECRET_KEY.getBytes())) // 验证签名
                    .build()
                    .parseSignedClaims(token);

            // 检查过期时间（已通过解析自动验证，此处可添加额外逻辑）
            Claims claims = claimsJws.getPayload();
            Date expiration = claims.getExpiration();
            return expiration != null && expiration.after(new Date()) ? claims : null;
        } catch (Exception ex) {
            log.error("JWT签名验证失败: {}", ex.getMessage());
            log.error("JWT签名验证失败", ex);
            return null;
        }
    }
}
