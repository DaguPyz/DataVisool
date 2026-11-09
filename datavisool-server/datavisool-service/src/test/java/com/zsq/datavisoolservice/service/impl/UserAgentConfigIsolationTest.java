/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.controller.AiDrivenAgentController;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.UserAgentConfigMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentRuntimeSettingsService;
import org.apache.ibatis.mapping.Environment;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.Assert.*;

/** 真实迁移、Mapper 和数据库，验证个人配置的归属、持久化及并发写入。 */
public class UserAgentConfigIsolationTest {
    private JdbcTemplate jdbc;
    private UserAgentConfigServiceImpl configs;
    private AiAgentRuntimeSettingsService settings;
    private AiDrivenAgentController controller;
    private final ObjectMapper json = new ObjectMapper();

    @Before
    public void setUp() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(dataSource);
        // 旧全局配置有值，也不能成为新用户的个人配置。
        jdbc.execute("create table system_config (name varchar(255), `value` longtext)");
        jdbc.update("insert into system_config values ('ai_driven_runtime_settings', ?)",
                "{\"modelRequest\":{\"timeoutSeconds\":999}}");
        new ResourceDatabasePopulator(new ClassPathResource("migration/V2026.10.7.3__user_agent_config.sql")).execute(dataSource);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new SpringManagedTransactionFactory(), dataSource));
        configuration.addMapper(UserAgentConfigMapper.class);
        var session = new SqlSessionTemplate(new MybatisSqlSessionFactoryBuilder().build(configuration));
        configs = new UserAgentConfigServiceImpl();
        ReflectionTestUtils.setField(configs, "userAgentConfigMapper", session.getMapper(UserAgentConfigMapper.class));
        settings = new AiAgentRuntimeSettingsService();
        ReflectionTestUtils.setField(settings, "userAgentConfigService", configs);
        ReflectionTestUtils.setField(settings, "objectMapper", json);
        controller = new AiDrivenAgentController();
        ReflectionTestUtils.setField(controller, "runtimeSettingsService", settings);
        login(2L, "ROLE_USER");
    }

    @After
    public void tearDown() { SecurityContextHolder.clearContext(); }

    @Test
    public void usersAndAdminsSaveOnlyTheirOwnSettingsEvenWithForgedOwnerFields() throws Exception {
        var alice = controller.saveRuntimeSettings(json.readTree("""
                {"userId":3,"user_id":3,"schemaVersion":2,"modelRequest":{"timeoutSeconds":300},
                 "execution":{"callBudgetEnabled":true,"maxModelCalls":7}}
                """)).getData();
        login(3L, "ROLE_USER");
        assertEquals(AiAgentRuntimeSettingsService.RuntimeSettings.defaults(), controller.getRuntimeSettings().getData().settings());
        var bob = settings.save(json.readTree("{\"schemaVersion\":2,\"modelRequest\":{\"timeoutSeconds\":600}}"));
        login(1L, "ROLE_SYSTEM_ADMIN");
        assertEquals(120, settings.get().settings().modelRequest().timeoutSeconds());
        for (String role : List.of("ROLE_ADMIN", "ROLE_SYSTEM_ADMIN")) {
            login(1L, role);
            settings.save(json.readTree("{\"schemaVersion\":2,\"userId\":2,\"modelRequest\":{\"timeoutSeconds\":900}}"));
            assertEquals(alice, settings.load(2L));
            assertEquals(bob, settings.load(3L));
        }
        login(2L, "ROLE_USER");
        assertEquals(alice, settings.get().settings());
        assertEquals(3, rowCount());
    }

    @Test
    public void migrationRetainsUnownedGlobalSettingsWithoutAssigningThemToUsers() {
        assertEquals(AiAgentRuntimeSettingsService.RuntimeSettings.defaults(), settings.get().settings());
        assertEquals(0, rowCount());
        assertEquals("{\"modelRequest\":{\"timeoutSeconds\":999}}",
                jdbc.queryForObject("select `value` from system_config", String.class));
    }

    @Test
    public void tableSupportsMultipleKeysAndLongJsonValuesAndIdempotentUpdates() {
        String large = "{\"text\":\"" + "个人配置".repeat(4000) + "\"}";
        configs.saveConfig(2L, "editor.preferences", large);
        configs.saveConfig(2L, "other.preferences", "Alice");
        configs.saveConfig(3L, "editor.preferences", "Bob");
        configs.saveConfig(2L, "editor.preferences", large);
        assertEquals(large, configs.getConfig(2L, "editor.preferences"));
        assertEquals("Alice", configs.getConfig(2L, "other.preferences"));
        assertEquals("Bob", configs.getConfig(3L, "editor.preferences"));
        assertNull(configs.getConfig(3L, "other.preferences"));
        assertEquals(3, rowCount());
        configs.saveConfig(2L, "editor.preferences", "updated");
        assertEquals("updated", configs.getConfig(2L, "editor.preferences"));
        assertEquals(3, rowCount());
    }

    @Test
    public void concurrentFirstSavesKeepOneRowPerUserAndKey() throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(8);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> saves = new ArrayList<>();
        try {
            for (int i = 0; i < 24; i++) {
                long userId = 2 + i % 2;
                String value = userId + ":" + i;
                saves.add(workers.submit(() -> {
                    start.await();
                    configs.saveConfig(userId, "preferences", value);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> save : saves) save.get(10, TimeUnit.SECONDS);
            assertEquals(2, rowCount());
            assertTrue(configs.getConfig(2L, "preferences").startsWith("2:"));
            assertTrue(configs.getConfig(3L, "preferences").startsWith("3:"));
        } finally {
            workers.shutdownNow();
        }
    }

    @Test
    public void missingOrInvalidAuthenticationCannotReadOrSavePersonalSettings() throws Exception {
        SecurityContextHolder.clearContext();
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), assertThrows(AppException.class, settings::get).getCode());
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), assertThrows(AppException.class,
                () -> settings.save(json.createObjectNode())).getCode());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("anonymousUser", null, List.of()));
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), assertThrows(AppException.class, settings::get).getCode());
        assertEquals(0, rowCount());
    }

    @Test
    public void backgroundLoadsUseTheExplicitTaskOwnerWithoutRequestAuthentication() throws Exception {
        var alice = settings.save(json.readTree("{\"schemaVersion\":2,\"context\":{\"compactAtPercent\":75}}"));
        login(3L, "ROLE_USER");
        var bob = settings.save(json.readTree("{\"schemaVersion\":2,\"context\":{\"compactAtPercent\":85}}"));
        assertEquals(alice, settings.load(2L)); // 当前请求用户也不能改变后台读取的归属。
        SecurityContextHolder.clearContext();
        assertEquals(alice, settings.load(2L));
        assertEquals(bob, settings.load(3L));
    }

    @Test
    public void invalidStoredValuesFailWithoutDisablingBudgetsAndKeepOtherUsersValues() throws Exception {
        login(3L, "ROLE_USER");
        var bob = settings.save(json.readTree("{\"schemaVersion\":2,\"modelRequest\":{\"timeoutSeconds\":600}}"));
        for (String invalid : List.of("invalid JSON", "", "[]", "null", "{\"schemaVersion\":1}", "{}", "{\"schemaVersion\":3}",
                "{\"schemaVersion\":2,\"context\":{\"maxStateDigestTokens\":10}}")) {
            configs.saveConfig(2L, "ai_driven_runtime_settings", invalid);
            assertEquals(500, assertThrows(AppException.class, () -> settings.load(2L)).getCode());
            assertEquals(invalid, configs.getConfig(2L, "ai_driven_runtime_settings"));
        }
        configs.saveConfig(2L, "ai_driven_runtime_settings", "{\"schemaVersion\":1,\"execution\":{\"maxModelCalls\":7}}");
        AppException oldVersion = assertThrows(AppException.class, () -> settings.load(2L));
        assertTrue(oldVersion.getMsg().contains("仅支持版本 2"));
        assertEquals(bob, settings.load(3L));
        assertEquals(400, assertThrows(AppException.class, () -> settings.save(json.readTree(
                "{\"schemaVersion\":2,\"context\":{\"maxStateDigestTokens\":10}}"))).getCode());
        assertEquals(bob, settings.load(3L));
        assertEquals(2, rowCount());
    }

    @Test
    public void databaseFailuresAreNotReportedAsSuccessfulReadsOrSaves() {
        jdbc.execute("drop table user_agent_config");
        assertThrows(RuntimeException.class, settings::get);
        assertEquals(500, assertThrows(AppException.class, () -> settings.save(json.createObjectNode().put("schemaVersion", 2))).getCode());
    }

    private int rowCount() { return jdbc.queryForObject("select count(*) from user_agent_config", Integer.class); }

    private void login(Long id, String role) {
        User user = new User(); user.setId(id); user.setRoles(List.of(role)); user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }
}
