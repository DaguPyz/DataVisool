/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.core.migration;

import com.zsq.datavisoolservice.security.BCryptUtil;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;
import java.util.List;
import java.nio.charset.StandardCharsets;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class InitialAdminPasswordTest {
    private static final String PASSWORD = "initial-pass-示例";

    private DatabaseMigration migration(JdbcTemplate jdbc, String url, String initialPassword) {
        DatabaseMigration migration = new DatabaseMigration(jdbc);
        ReflectionTestUtils.setField(migration, "url", url);
        ReflectionTestUtils.setField(migration, "username", "sa");
        ReflectionTestUtils.setField(migration, "password", "");
        ReflectionTestUtils.setField(migration, "initialAdminPassword", initialPassword);
        return migration;
    }

    private JdbcTemplate database(String url) {
        JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(url, "sa", "")) {
            @Override
            public <T> List<T> queryForList(String sql, Class<T> elementType) {
                if ("SHOW TABLES".equals(sql)) {
                    return super.queryForList("SELECT table_name FROM information_schema.tables WHERE table_schema='public'", elementType);
                }
                return super.queryForList(sql, elementType);
            }
        };
        jdbc.execute("CREATE TABLE migration_history (id varchar(32) primary key, version varchar(128) not null, file_name varchar(255) not null, execute_user varchar(128) not null, execute_date timestamp not null, success tinyint not null)");
        return jdbc;
    }

    private String url() {
        return "jdbc:h2:mem:admin_" + UUID.randomUUID().toString().replace("-", "")
                + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=USER;DB_CLOSE_DELAY=-1";
    }

    private Migration baseline() {
        try {
            String sql = new ClassPathResource("migration/V2024.6.18.1__baseline.sql").getContentAsString(StandardCharsets.UTF_8)
                    .replace("not null on update CURRENT_TIMESTAMP", "not null");
            ByteArrayResource resource = new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)) {
                @Override public String getFilename() { return "V2024.6.18.1__baseline.sql"; }
            };
            return new Migration(resource, null);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void newDatabaseRequiresPasswordBeforeRunningBaseline() {
        String url = url();
        JdbcTemplate jdbc = database(url);
        DatabaseMigration migration = migration(jdbc, url, "");
        assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(migration, "doBaseLine", baseline()));
        assertEquals(0, jdbc.queryForObject("select count(*) from information_schema.tables where table_name = 'user'", Integer.class));
    }

    @Test
    void newDatabaseStoresHashOfProvidedPassword() {
        String url = url();
        JdbcTemplate jdbc = database(url);
        DatabaseMigration migration = migration(jdbc, url, PASSWORD);
        assertEquals(Boolean.TRUE, ReflectionTestUtils.invokeMethod(migration, "doBaseLine", baseline()));
        String hash = jdbc.queryForObject("select password from local_auth where user_id=1", String.class);
        assertNotEquals(PASSWORD, hash);
        assertTrue(BCryptUtil.checkPassword(PASSWORD, hash));
    }

    @Test
    void existingDatabaseDoesNotRequireOrResetPassword() {
        for (String configured : List.of("", PASSWORD)) {
            String url = url();
            JdbcTemplate jdbc = database(url);
            jdbc.execute("CREATE TABLE local_auth (user_id bigint, password varchar(255))");
            jdbc.update("INSERT INTO local_auth VALUES (1, ?)", "existing-hash");
            DatabaseMigration migration = migration(jdbc, url, configured);
            assertEquals(Boolean.TRUE, ReflectionTestUtils.invokeMethod(migration, "doBaseLine", baseline()));
            assertEquals("existing-hash", jdbc.queryForObject("select password from local_auth where user_id=1", String.class));
        }
    }

    @Test
    void passwordMustMeetUserPasswordLengthRules() {
        assertThrows(IllegalStateException.class, () -> DatabaseMigration.initialAdminPasswordHash("short"));
        assertThrows(IllegalStateException.class, () -> DatabaseMigration.initialAdminPasswordHash("界".repeat(25)));
        assertTrue(BCryptUtil.checkPassword(PASSWORD, DatabaseMigration.initialAdminPasswordHash(PASSWORD)));
    }

    @Test
    void supportsPasswordFromExternalConfigurationOrEnvironment() {
        ApplicationContextRunner context = new ApplicationContextRunner()
                .withBean(JdbcTemplate.class, () -> new JdbcTemplate(new DriverManagerDataSource(url(), "sa", "")))
                .withBean(DatabaseMigration.class)
                .withPropertyValues("spring.datasource.druid.url=jdbc:test", "spring.datasource.druid.username=test",
                        "spring.datasource.druid.password=test");
        context.withPropertyValues("datavisool.initial-admin-password=" + PASSWORD)
                .run(c -> assertEquals(PASSWORD, ReflectionTestUtils.getField(c.getBean(DatabaseMigration.class), "initialAdminPassword")));
        context.withPropertyValues("DATAVISOOL_ADMIN_PASSWORD=" + PASSWORD)
                .run(c -> assertEquals(PASSWORD, ReflectionTestUtils.getField(c.getBean(DatabaseMigration.class), "initialAdminPassword")));
    }
}
