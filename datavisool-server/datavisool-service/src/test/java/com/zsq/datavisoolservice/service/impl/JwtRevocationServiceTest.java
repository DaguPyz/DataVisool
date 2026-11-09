/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.util.JwtUtils;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

class JwtRevocationServiceTest {
    @Test
    void recordsOnlyDigestAndCleansExpiredRecords() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:revocations;DB_CLOSE_DELAY=-1");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("create table auth_revoked_token (token_hash char(64) primary key, expires_at bigint not null)");
        JwtRevocationService service = new JwtRevocationService(jdbc);
        User user = new User();
        user.setUsername("test-user");
        String first = JwtUtils.generateToken(user);
        String second = JwtUtils.generateToken(user);
        assertNotEquals(first, second);
        long expiration = JwtUtils.parseValidClaims(first).getExpiration().getTime();
        service.revoke(first, expiration);
        service.revoke(first, expiration);
        assertTrue(service.isRevoked(first));
        assertFalse(service.isRevoked(second));
        String stored = jdbc.queryForObject("select token_hash from auth_revoked_token", String.class);
        assertNotEquals(first, stored);
        assertEquals(64, stored.length());
        jdbc.update("insert into auth_revoked_token (token_hash, expires_at) values (?, ?)", "expired", 0);
        service.removeExpired();
        assertEquals(1, jdbc.queryForObject("select count(*) from auth_revoked_token", Integer.class));
        assertTrue(service.isRevoked(first));
    }
}
