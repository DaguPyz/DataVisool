/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.zsq.datavisoolservice.controller.AiModelController;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.AiModelMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.AiModelDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunRequestDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentRuntime;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentService;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenTaskService;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.*;

/** 使用真实 Mapper 和 SQL 验证多用户隔离，避免仅验证模拟的查询结果。 */
public class AiModelUserIsolationTest {
    private SqlSession session;
    private JdbcTemplate jdbc;
    private AiModelMapper mapper;
    private AiModelServiceImpl service;

    @Before
    public void setUp() throws IOException {
        JdbcDataSource dataSource = createDatabase(true);
        jdbc = new JdbcTemplate(dataSource);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.H2));
        configuration.addInterceptor(interceptor);
        configuration.addMapper(AiModelMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        mapper = session.getMapper(AiModelMapper.class);
        service = new AiModelServiceImpl();
        ReflectionTestUtils.setField(service, "aiModelMapper", mapper);
        login(2L, "ROLE_USER");
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
        if (session != null) session.close();
    }

    @Test
    public void listsAndSearchOnlyReturnCurrentUsersModelsIncludingForAdmins() {
        Long alice = service.addAiModel(model("Alice", false));
        assertEquals(Long.valueOf(2), mapper.selectById(alice).getUserId());
        login(3L, "ROLE_USER");
        Long bob = service.addAiModel(model("Bob", false));
        login(2L, "ROLE_USER");

        PageParamDTO page = new PageParamDTO();
        page.setCurrent(1L);
        page.setSize(10L);
        assertEquals(1, service.getAiModelPageList(page).getTotal());
        assertEquals(alice, service.getAiModelPageList(page).getRecords().get(0).getId());
        assertEquals(List.of(alice), service.getAiModelList().stream().map(item -> item.getId()).toList());
        page.setSearchValue("Bob");
        assertTrue(service.getAiModelPageList(page).getRecords().isEmpty());
        page.setSearchValue("openai");
        assertEquals(1, service.getAiModelPageList(page).getTotal());

        login(1L, "ROLE_SYSTEM_ADMIN");
        assertEquals(List.of(1L), service.getAiModelList().stream().map(item -> item.getId()).toList());
        assertEquals(Long.valueOf(3), mapper.selectById(bob).getUserId());
    }

    @Test
    public void changingDefaultsAndDeletingMixedIdsDoNotModifyOtherUsersModels() {
        Long first = service.addAiModel(model("Alice first", true));
        login(3L, "ROLE_USER");
        Long bob = service.addAiModel(model("Bob default", true));
        login(2L, "ROLE_USER");
        Long second = service.addAiModel(model("Alice second", true));
        assertEquals(Integer.valueOf(0), mapper.selectById(first).getIsDefault());
        assertEquals(Integer.valueOf(1), mapper.selectById(bob).getIsDefault());
        assertEquals(Integer.valueOf(1), mapper.selectById(1L).getIsDefault());

        AiModelDTO updated = model("Alice updated", true);
        updated.setId(first);
        assertTrue(service.updateAiModel(updated));
        assertEquals(Integer.valueOf(0), mapper.selectById(second).getIsDefault());
        assertEquals(Integer.valueOf(1), mapper.selectById(bob).getIsDefault());
        assertTrue(service.batchDelAiModel(List.of(first, bob, 1L)));
        assertNull(mapper.selectById(first));
        assertNotNull(mapper.selectById(bob));
        assertNotNull(mapper.selectById(1L));
        assertFalse(service.batchDelAiModel(List.of(bob, 1L)));
    }

    @Test
    public void clearApiKeyPersistsNullAndDoesNotAffectOtherUsers() {
        Long own = service.addAiModel(model("Own key", false));
        login(3L, "ROLE_USER");
        Long other = service.addAiModel(model("Other key", false));
        jdbc.update("update ai_model set api_key = 'synthetic-key' where id in (?, ?)", own, other);
        session.clearCache();
        login(2L, "ROLE_USER");
        AiModelDTO update = model("Own key", false);
        update.setId(own);
        update.setClearApiKey(1);
        assertTrue(service.updateAiModel(update));
        session.clearCache();
        assertNull(mapper.selectById(own).getApiKey());
        assertEquals("synthetic-key", mapper.selectById(other).getApiKey());
    }

    @Test
    public void invalidBaseUrlsCannotCreateOrModifyModels() {
        Long own = service.addAiModel(model("Original", false));
        for (String url : List.of("not-a-url", "ftp://example.test/v1", "https://", "http://localhost:99999/v1")) {
            AiModelDTO request = model("Modified", false);
            request.setBaseUrl(url);
            assertThrows(AppException.class, () -> service.addAiModel(request));
            request.setId(own);
            assertThrows(AppException.class, () -> service.updateAiModel(request));
            assertEquals("Original", mapper.selectById(own).getName());
        }
        AiModelDTO local = model("Local", false);
        local.setBaseUrl("http://localhost:11434/v1");
        assertNotNull(service.addAiModel(local));
    }

    @Test
    public void usersAndAdminsCannotUpdateOrInvokeAnotherUsersModel() {
        Long alice = service.addAiModel(model("Alice", false));
        for (String role : List.of("ROLE_USER", "ROLE_ADMIN", "ROLE_SYSTEM_ADMIN")) {
            login(3L, role);
            AiModelDTO updated = model("stolen", true);
            updated.setId(alice);
            assertEquals(404, assertThrows(AppException.class, () -> service.updateAiModel(updated)).getCode());
            assertEquals(404, assertThrows(AppException.class, () -> service.run(runRequest(alice))).getCode());
            assertEquals("Alice", mapper.selectById(alice).getName());
        }
        login(2L, "ROLE_USER");
        jdbc.update("update ai_model set enabled = 0 where id = ?", alice);
        session.clearCache();
        assertEquals(400, assertThrows(AppException.class, () -> service.run(runRequest(alice))).getCode());
    }

    @Test
    public void taskSubmissionRejectsForeignModelsBeforeCreatingTaskOrReadingAttachments() {
        AiDrivenTaskService tasks = new AiDrivenTaskService();
        ReflectionTestUtils.setField(tasks, "aiModelMapper", mapper);
        AiDrivenTaskService.TaskSubmitRequest request = new AiDrivenTaskService.TaskSubmitRequest(
                "ai-driven-task/v1", "request", "session", "project",
                new AiDrivenTaskService.ModelSelection("1", "gpt-4o", "openai"),
                "生成页面", null, List.of(), Map.of(), Map.of(), Map.of()
        );
        assertEquals(404, assertThrows(AppException.class, () -> tasks.submit(request)).getCode());
    }

    @Test
    public void agentUsesOnlyOwnersDefaultAndRejectsForeignMissingOrDisabledExplicitModels() {
        Long alice = service.addAiModel(model("Alice default", true));
        AiAgentRuntime runtime = new AiAgentRuntime();
        ReflectionTestUtils.setField(runtime, "aiModelMapper", mapper);
        AiModelConfig config = ReflectionTestUtils.invokeMethod(runtime, "resolveModel", context(Map.of()));
        assertEquals("Alice default", config.modelName());
        for (String foreignOrMissing : List.of("1", "99999")) {
            assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(
                    runtime, "resolveModel", context(Map.of("modelConfigId", foreignOrMissing))));
        }
        jdbc.update("update ai_model set enabled = 0 where id = ?", alice);
        session.clearCache();
        assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(
                runtime, "resolveModel", context(Map.of("modelConfigId", String.valueOf(alice)))));
        assertThrows(IllegalStateException.class, () -> ReflectionTestUtils.invokeMethod(
                runtime, "resolveModel", context(Map.of())));
    }

    @Test
    public void controllerAllowsOrdinaryUsersToManageModelsAndRejectsUnsupportedRoles() {
        try (AnnotationConfigApplicationContext application = new AnnotationConfigApplicationContext()) {
            application.register(MethodSecurityConfiguration.class);
            application.getBeanFactory().registerSingleton("aiModelService", service);
            application.registerBean(AiModelController.class);
            application.refresh();
            AiModelController controller = application.getBean(AiModelController.class);
            AiModelDTO request = model("Alice via controller", false);
            controller.createAiModel(request);
            assertEquals(1, service.getAiModelList().size());
            controller.getAiModelPageList(new PageParamDTO());
            request.setId(service.getAiModelList().get(0).getId());
            controller.updateAiModel(request);
            controller.batchDelAiModel(List.of(request.getId()));
            assertTrue(service.getAiModelList().isEmpty());
            login(2L, "ROLE_GUEST");
            assertThrows(AccessDeniedException.class, () -> controller.createAiModel(request));
        }
    }

    @Test
    public void migrationKeepsLegacyModelsWithOriginalAdminAndLeavesUnassignableRecordsPrivate() throws IOException {
        assertEquals(Long.valueOf(1), mapper.selectById(1L).getUserId());
        JdbcTemplate withoutAdmin = new JdbcTemplate(createDatabase(false));
        assertNull(withoutAdmin.queryForObject("select user_id from ai_model where id = 1", Long.class));
        assertEquals("Legacy", withoutAdmin.queryForObject("select name from ai_model where id = 1", String.class));
        jdbc.update("update ai_model set user_id = null where id = 1");
        session.clearCache();
        for (long userId : List.of(1L, 2L)) {
            login(userId, "ROLE_SYSTEM_ADMIN");
            assertTrue(service.getAiModelList().isEmpty());
            assertEquals(404, assertThrows(AppException.class, () -> service.run(runRequest(1L))).getCode());
        }
    }

    private JdbcDataSource createDatabase(boolean originalAdminExists) throws IOException {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=USER");
        JdbcTemplate database = new JdbcTemplate(dataSource);
        database.execute("create table `user` (id bigint primary key, deleted int default 0)");
        database.execute("create table auth_user_role (user_id bigint, role_id bigint, deleted int default 0)");
        database.execute("create table auth_role (id bigint primary key, name varchar(50), deleted int default 0)");
        if (originalAdminExists) {
            database.update("insert into `user` (id) values (1)");
            database.update("insert into auth_role (id, name) values (1, 'ROLE_SYSTEM_ADMIN')");
            database.update("insert into auth_user_role (user_id, role_id) values (1, 1)");
        }
        // H2 要求 ON UPDATE 位于 NOT NULL 前；仅适配旧建表脚本的语法，新增迁移原样执行。
        String originalSchema = new ClassPathResource("migration/V2026.4.11.1__ai_model.sql")
                .getContentAsString(StandardCharsets.UTF_8)
                .replace("not null on update CURRENT_TIMESTAMP", "on update CURRENT_TIMESTAMP not null");
        new ResourceDatabasePopulator(
                new ByteArrayResource(originalSchema.getBytes(StandardCharsets.UTF_8)),
                new ClassPathResource("migration/V2026.8.2.1__ai_model_drop_model_name.sql")
        ).execute(dataSource);
        database.update("insert into ai_model (id, name, provider, is_default) values (1, 'Legacy', 'openai', 1)");
        new ResourceDatabasePopulator(new ClassPathResource("migration/V2026.10.6.1__ai_model_user.sql"))
                .execute(dataSource);
        return dataSource;
    }

    private void login(Long userId, String role) {
        User user = new User();
        user.setId(userId);
        user.setRoles(List.of(role));
        user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    private AiModelDTO model(String name, boolean isDefault) {
        AiModelDTO dto = new AiModelDTO();
        dto.setName(name);
        dto.setProvider("openai");
        dto.setIsDefault(isDefault ? 1 : 0);
        return dto;
    }

    private AiModelRunRequestDTO runRequest(Long id) {
        AiModelRunRequestDTO dto = new AiModelRunRequestDTO();
        dto.setModelId(String.valueOf(id));
        dto.setRuntimeModelId("gpt-4o");
        dto.setPrompt("Hello");
        return dto;
    }

    private AiAgentService.AgentExecutionContext context(Map<String, Object> values) {
        return new AiAgentService.AgentExecutionContext(
                "thread", "project", "turn", "run", "2", "Hello", values,
                Map.of(), Map.of(), null, null, 0);
    }

    @Configuration
    @EnableMethodSecurity
    static class MethodSecurityConfiguration {}
}
