/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Service
public class JwtRevocationService {
    private final JdbcTemplate jdbcTemplate;

    public JwtRevocationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean isRevoked(String token) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from auth_revoked_token where token_hash = ?", Integer.class, hash(token));
        return count != null && count > 0;
    }

    public void revoke(String token, long expiresAt) {
        try {
            jdbcTemplate.update("insert into auth_revoked_token (token_hash, expires_at) values (?, ?)",
                    hash(token), expiresAt);
        } catch (DuplicateKeyException ignored) {
            // 同一令牌重复退出时仍视为成功。
        }
    }

    @Scheduled(initialDelay = 3600000, fixedDelay = 3600000)
    public void removeExpired() {
        jdbcTemplate.update("delete from auth_revoked_token where expires_at <= ?", System.currentTimeMillis());
    }

    private static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
