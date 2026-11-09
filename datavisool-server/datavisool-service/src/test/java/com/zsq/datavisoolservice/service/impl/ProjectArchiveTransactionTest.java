/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.controller.ImportController;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.global.GlobalExceptionHandler;
import com.zsq.datavisoolservice.mapper.*;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ProjectImportParamDTO;
import com.zsq.datavisoolservice.model.po.ImagePO;
import com.zsq.datavisoolservice.model.po.FontPO;
import com.zsq.datavisoolservice.model.po.UserPO;
import com.zsq.datavisoolservice.service.*;
import org.apache.ibatis.mapping.Environment;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

class ProjectArchiveTransactionTest {
    @TempDir Path root;
    private String oldRoot, oldImagePath, oldFontPath, oldComponentPath, oldScriptPath;
    private JdbcTemplate jdbc;
    private ImportController controller;
    private ImageServiceImpl images;
    private AnnotationConfigApplicationContext context;
    private PlatformTransactionManager transactionManager;
    private final AtomicInteger insertedImages = new AtomicInteger();
    private final AtomicInteger insertedFonts = new AtomicInteger();
    private DynamicScriptMapper scripts;
    private UserMapper users;

    @Configuration
    @EnableTransactionManagement
    static class TransactionConfig { }

    @BeforeEach void setUp() {
        oldRoot = AppBaseConfig.ROOT_PATH; oldImagePath = AppBaseConfig.IMAGE_PATH; oldFontPath = AppBaseConfig.FONT_PATH;
        oldComponentPath = AppBaseConfig.REMOTE_COMPONENT_PATH; oldScriptPath = AppBaseConfig.DYNAMIC_SCRIPT_PATH;
        AppBaseConfig.ROOT_PATH = root.toString(); AppBaseConfig.IMAGE_PATH = "images"; AppBaseConfig.FONT_PATH = "fonts";
        AppBaseConfig.REMOTE_COMPONENT_PATH = "components"; AppBaseConfig.DYNAMIC_SCRIPT_PATH = "scripts";
        JdbcDataSource datasource = new JdbcDataSource();
        datasource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;NON_KEYWORDS=USER;IGNORECASE=TRUE;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(datasource);
        jdbc.execute("create table project (id bigint primary key, user_id bigint, deleted int default 0, data_json clob, pid bigint, update_time timestamp)");
        jdbc.execute("create table image (id bigint auto_increment primary key, url varchar(255), name varchar(255), user_id bigint, create_time timestamp, deleted int default 0, hash varchar(255))");
        jdbc.execute("create table font (id bigint auto_increment primary key, url varchar(255), name varchar(255), user_id bigint, create_time timestamp, update_time timestamp, deleted int default 0)");
        jdbc.execute("create table dynamic_script (id bigint auto_increment primary key, name varchar(255), url varchar(255), type varchar(32), project_id bigint null, user_id bigint, create_time timestamp, update_time timestamp, deleted int default 0)");
        jdbc.execute("create table user (id bigint primary key, deleted int default 0)");
        jdbc.update("insert into user (id, deleted) values (7, 0)");
        jdbc.update("insert into project (id, user_id, data_json) values (42, 7, ?)", "{\"name\":\"原项目\"}");

        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new SpringManagedTransactionFactory(), datasource));
        configuration.addMapper(ProjectMapper.class);
        configuration.addMapper(ImageMapper.class);
        configuration.addMapper(FontMapper.class);
        configuration.addMapper(DynamicScriptMapper.class);
        configuration.addMapper(UserMapper.class);
        SqlSessionTemplate session = new SqlSessionTemplate(new MybatisSqlSessionFactoryBuilder().build(configuration));
        ProjectMapper projects = session.getMapper(ProjectMapper.class);
        images = spy(new ImageServiceImpl());
        ReflectionTestUtils.setField(images, "imageMapper", session.getMapper(ImageMapper.class));
        doAnswer(invocation -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            ImagePO result = (ImagePO) invocation.callRealMethod();
            insertedImages.incrementAndGet();
            return result;
        }).when(images).createImage(any(ImagePO.class));
        FontServiceImpl fonts = spy(new FontServiceImpl());
        ReflectionTestUtils.setField(fonts, "fontMapper", session.getMapper(FontMapper.class));
        doAnswer(invocation -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            FontPO result = (FontPO) invocation.callRealMethod();
            insertedFonts.incrementAndGet();
            return result;
        }).when(fonts).createFont(any(FontPO.class));
        scripts = session.getMapper(DynamicScriptMapper.class);
        users = session.getMapper(UserMapper.class);
        RemoteComponentService components = mock(RemoteComponentService.class);
        ProjectArchiveCompatHelper helper = new ProjectArchiveCompatHelper(projects, users, fonts, images, components,
                scripts, mock(CommonApiMapper.class), mock(DatasourceMapper.class),
                mock(VideoMapper.class), mock(ThreeDModelMapper.class));
        ProjectServiceImpl target = new ProjectServiceImpl(projects, fonts, images, components, mock(DynamicScriptService.class), helper);
        context = new AnnotationConfigApplicationContext();
        context.register(TransactionConfig.class);
        transactionManager = new DataSourceTransactionManager(datasource);
        context.registerBean(PlatformTransactionManager.class, () -> transactionManager);
        context.registerBean(ProjectService.class, () -> target);
        context.refresh();
        ProjectService service = context.getBean(ProjectService.class);
        assertTrue(AopUtils.isAopProxy(service));
        controller = new ImportController(service);
        User user = new User(); user.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, "", List.of()));
    }

    @AfterEach void tearDown() {
        SecurityContextHolder.clearContext();
        if (context != null) context.close();
        AppBaseConfig.ROOT_PATH = oldRoot; AppBaseConfig.IMAGE_PATH = oldImagePath; AppBaseConfig.FONT_PATH = oldFontPath;
        AppBaseConfig.REMOTE_COMPONENT_PATH = oldComponentPath; AppBaseConfig.DYNAMIC_SCRIPT_PATH = oldScriptPath;
    }

    @Test void ambiguousImagesRollBackRecordsAndRemoveFiles() throws Exception {
        RuntimeException error = assertThrows(RuntimeException.class, () -> controller.importProject(importParam(true)));
        assertTrue(error.getMessage().contains("多个同名文件"));
        assertEquals(2, insertedImages.get());
        assertEquals(0, jdbc.queryForObject("select count(*) from image", Integer.class));
        assertEquals("{\"name\":\"原项目\"}", jdbc.queryForObject("select data_json from project where id=42", String.class));
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void validImageImportCommitsRecordAndProject() throws Exception {
        assertTrue(controller.importProject(importParam(false)).getData());
        assertEquals(1, insertedImages.get());
        assertEquals(1, jdbc.queryForObject("select count(*) from image", Integer.class));
        String url = jdbc.queryForObject("select url from image", String.class);
        assertArrayEquals(new byte[]{1}, Files.readAllBytes(root.resolve("images").resolve(url)));
        assertTrue(jdbc.queryForObject("select data_json from project where id=42", String.class).contains("images/" + url));
    }

    @Test void unsupportedComponentReturnsSpecificApiErrorAndRollsBackWholeImport() throws Exception {
        String component = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(I,U,V){return [I.AbstractDesignerDefinition,U.FetchUtil,V.LCGUI]}(LightChaserInterface,LightChaserUtil,LightChaserUI);";
        byte[] manifest = JSON.toJSONBytes(Map.of("format", "light-chaser-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of(
                        "fonts", List.of(Map.of("name", "Imported Font", "blob", "blobs/font.woff2")),
                        "components", List.of(Map.of("name", "销售图表", "blob", "blobs/chart.js")))));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : Map.of("manifest.json", manifest, "project/project.json", "{}".getBytes(),
                    "blobs/font.woff2", new byte[]{1, 2}, "blobs/chart.js", component.getBytes(java.nio.charset.StandardCharsets.UTF_8)).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        var result = mvc.perform(multipart("/api/import/importProject")
                .file(new MockMultipartFile("file", "test.zip", "application/zip", bytes.toByteArray()))
                .param("projectId", "42")).andReturn();
        assertEquals(200, result.getResponse().getStatus());
        var response = JSON.parseObject(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(AppStatusCode.INVALID_PARAM.code(), response.getIntValue("code"));
        assertTrue(response.getString("msg").contains("销售图表"));
        assertTrue(response.getString("msg").contains("chart.js"));
        assertTrue(response.getString("msg").contains("FetchUtil"));
        assertNull(response.get("data"));
        assertEquals(1, insertedFonts.get());
        assertEquals(0, jdbc.queryForObject("select count(*) from font", Integer.class));
        assertEquals("{\"name\":\"原项目\"}", jdbc.queryForObject("select data_json from project where id=42", String.class));
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(0, files.count()); }
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
    }

    @Test void unexpectedErrorsRemainGeneric() throws Exception {
        var response = new GlobalExceptionHandler().exceptionHandler(new RuntimeException("internal database details"));
        assertEquals(AppStatusCode.SYSTEM_ERR.code(), response.getCode());
        assertEquals(AppStatusCode.SYSTEM_ERR.message(), response.getMsg());
    }

    @Test void outerTransactionRollbackAfterSuccessfulImportRemovesFilesAndRecords() throws Exception {
        ProjectImportParamDTO input = importParam(false);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            assertTrue(assertDoesNotThrow(() -> controller.importProject(input)).getData());
            assertEquals(1, jdbc.queryForObject("select count(*) from image", Integer.class));
            String url = jdbc.queryForObject("select url from image", String.class);
            assertTrue(Files.exists(root.resolve("images").resolve(url)));
            status.setRollbackOnly();
        });
        assertEquals(1, insertedImages.get());
        assertEquals(0, jdbc.queryForObject("select count(*) from image", Integer.class));
        assertEquals("{\"name\":\"原项目\"}", jdbc.queryForObject("select data_json from project where id=42", String.class));
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void losingProjectWriteAccessBeforeSaveRollsBackImportedImage() throws Exception {
        doAnswer(invocation -> {
            ImagePO result = (ImagePO) invocation.callRealMethod();
            jdbc.update("update project set deleted=1 where id=42");
            return result;
        }).when(images).createImage(any(ImagePO.class));
        RuntimeException error = assertThrows(RuntimeException.class, () -> controller.importProject(importParam(false)));
        assertTrue(error.getMessage().contains("保存导入项目数据失败"), error.getMessage());
        assertEquals(0, jdbc.queryForObject("select count(*) from image", Integer.class));
        assertEquals(0, jdbc.queryForObject("select deleted from project where id=42", Integer.class));
        assertEquals("{\"name\":\"原项目\"}", jdbc.queryForObject("select data_json from project where id=42", String.class));
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void unauthenticatedAndOtherUsersCannotImportIntoProject() throws Exception {
        ProjectImportParamDTO input = importParam(false);
        SecurityContextHolder.clearContext();
        AppException anonymous = assertThrows(AppException.class, () -> controller.importProject(input));
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), anonymous.getCode());

        User other = new User(); other.setId(8L);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(other, "", List.of()));
        AppException forbidden = assertThrows(AppException.class, () -> controller.importProject(input));
        assertEquals(AppStatusCode.UNAUTHORIZED.code(), forbidden.getCode());
        assertEquals(0, insertedImages.get());
        assertEquals(0, jdbc.queryForObject("select count(*) from image", Integer.class));
        assertEquals("{\"name\":\"原项目\"}", jdbc.queryForObject("select data_json from project where id=42", String.class));
        assertFalse(Files.exists(root.resolve("images")));
    }

    @Test void conflictingFontIsRenamedAndRepeatedImportReusesIt() throws Exception {
        Files.createDirectories(root.resolve("fonts"));
        Files.write(root.resolve("fonts/existing.woff2"), new byte[]{9});
        jdbc.update("insert into font (name, url, user_id) values (?, ?, ?)", "Demo Font", "existing.woff2", 7);
        assertTrue(controller.importProject(fontImportParam("Demo Font", new byte[]{1, 2})).getData());
        String alias = jdbc.queryForObject("select name from font where user_id=7 and name <> 'Demo Font'", String.class);
        String url = jdbc.queryForObject("select url from font where user_id=7 and name=?", String.class, alias);
        assertTrue(alias.startsWith("DV_"));
        assertArrayEquals(new byte[]{1, 2}, Files.readAllBytes(root.resolve("fonts").resolve(url)));
        assertTrue(jdbc.queryForObject("select data_json from project where id=42", String.class).contains(alias));
        assertTrue(controller.importProject(fontImportParam("Demo Font", new byte[]{1, 2})).getData());
        assertEquals(2, jdbc.queryForObject("select count(*) from font where user_id=7", Integer.class));
        assertTrue(jdbc.queryForObject("select data_json from project where id=42", String.class).contains(alias));
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(2, files.count()); }
    }

    @Test void anotherUsersFontDoesNotCauseANameConflict() throws Exception {
        Files.createDirectories(root.resolve("fonts"));
        Files.write(root.resolve("fonts/foreign.woff2"), new byte[]{9});
        jdbc.update("insert into font (name, url, user_id) values (?, ?, ?)", "Shared Font", "foreign.woff2", 8);
        assertTrue(controller.importProject(fontImportParam("Shared Font", new byte[]{1, 2})).getData());
        assertEquals(1, jdbc.queryForObject("select count(*) from font where user_id=7 and name='Shared Font'", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from font where user_id=8 and name='Shared Font'", Integer.class));
        assertArrayEquals(new byte[]{9}, Files.readAllBytes(root.resolve("fonts/foreign.woff2")));
    }

    @Test void rollbackAfterFontConflictRemovesOnlyNewFontAndRestoresProject() throws Exception {
        Files.createDirectories(root.resolve("fonts"));
        Files.write(root.resolve("fonts/existing.woff2"), new byte[]{9});
        jdbc.update("insert into font (name, url, user_id) values (?, ?, ?)", "Demo Font", "existing.woff2", 7);
        ProjectImportParamDTO param = fontImportParam("Demo Font", new byte[]{1, 2});
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            assertTrue(assertDoesNotThrow(() -> controller.importProject(param)).getData());
            assertEquals(2, jdbc.queryForObject("select count(*) from font where user_id=7", Integer.class));
            status.setRollbackOnly();
        });
        assertEquals(1, jdbc.queryForObject("select count(*) from font where user_id=7", Integer.class));
        assertEquals("{\"name\":\"原项目\"}", jdbc.queryForObject("select data_json from project where id=42", String.class));
        assertArrayEquals(new byte[]{9}, Files.readAllBytes(root.resolve("fonts/existing.woff2")));
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(1, files.count()); }
    }

    @Test void rollbackAfterGlobalScriptReusePreservesExistingFileAndNewScriptRollbackRemovesOnlyNewFile() throws Exception {
        byte[] existingContent = "window.shared = true;".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Files.createDirectories(root.resolve("scripts"));
        Files.write(root.resolve("scripts/existing.js"), existingContent);
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                "shared.js", "existing.js", "LOCAL", 7L);

        ProjectImportParamDTO matching = scriptImportParam("shared.js", existingContent);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            assertTrue(assertDoesNotThrow(() -> controller.importProject(matching)).getData());
            assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and deleted=0", Integer.class));
            status.setRollbackOnly();
        });
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and deleted=0", Integer.class));
        assertArrayEquals(existingContent, Files.readAllBytes(root.resolve("scripts/existing.js")));
        try (var files = Files.list(root.resolve("scripts"))) { assertEquals(1, files.count()); }

        byte[] newContent = "window.fresh = true;".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ProjectImportParamDTO fresh = scriptImportParam("fresh.js", newContent);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            assertTrue(assertDoesNotThrow(() -> controller.importProject(fresh)).getData());
            assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and deleted=0", Integer.class));
            status.setRollbackOnly();
        });
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and deleted=0", Integer.class));
        assertArrayEquals(existingContent, Files.readAllBytes(root.resolve("scripts/existing.js")));
        try (var files = Files.list(root.resolve("scripts"))) { assertEquals(1, files.count()); }
    }

    @Test void concurrentSameUserGlobalScriptImportsSerializeAndReuseCommittedFile() throws Exception {
        byte[] content = "window.concurrent = true;".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ProjectImportParamDTO first = scriptImportParam("concurrent.js", content);
        ProjectImportParamDTO second = scriptImportParam("concurrent.js", content);
        CountDownLatch secondStarted = new CountDownLatch(1);
        AtomicReference<Throwable> secondFailure = new AtomicReference<>();
        Thread secondImport = new Thread(() -> {
            User secondUser = new User(); secondUser.setId(7L);
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(secondUser, "", List.of()));
            secondStarted.countDown();
            try {
                assertTrue(controller.importProject(second).getData());
            } catch (Throwable error) {
                secondFailure.set(error);
            } finally {
                SecurityContextHolder.clearContext();
            }
        }, "same-user-global-script-import");

        AtomicReference<Boolean> observedWait = new AtomicReference<>(false);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            UserPO locked = users.selectOne(new LambdaQueryWrapper<UserPO>()
                    .select(UserPO::getId).eq(UserPO::getId, 7L).eq(UserPO::getDeleted, 0).last("FOR UPDATE"));
            assertNotNull(locked);
            assertTrue(assertDoesNotThrow(() -> controller.importProject(first)).getData());
            secondImport.start();
            try {
                assertTrue(secondStarted.await(3, TimeUnit.SECONDS));
                observedWait.set(awaitThreadWaiting(secondImport, 3, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        });

        secondImport.join(5_000);
        assertFalse(secondImport.isAlive(), "second import should finish after first transaction commits");
        assertTrue(observedWait.get(), "second import should wait for the user-row lock");
        assertNull(secondFailure.get(), () -> String.valueOf(secondFailure.get()));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and deleted=0", Integer.class));
        String url = jdbc.queryForObject("select url from dynamic_script where user_id=7 and project_id is null and deleted=0", String.class);
        assertArrayEquals(content, Files.readAllBytes(root.resolve("scripts").resolve(url)));
        try (var files = Files.list(root.resolve("scripts"))) { assertEquals(1, files.count()); }
    }

    @Test void rollbackAndExistingDuplicateRemoteGlobalRecordsArePreserved() throws Exception {
        String name = "shared-remote";
        String url = "https://example.test/shared-remote.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name, url, "REMOTE", 7L);
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name, url, "REMOTE", 7L);

        ProjectImportParamDTO matching = remoteScriptImportParam(name, url, "GLOBAL");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            assertTrue(assertDoesNotThrow(() -> controller.importProject(matching)).getData());
            assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));
            status.setRollbackOnly();
        });
        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));

        ProjectImportParamDTO fresh = remoteScriptImportParam("fresh-remote", "https://example.test/fresh-remote.js", "GLOBAL");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            assertTrue(assertDoesNotThrow(() -> controller.importProject(fresh)).getData());
            assertEquals(3, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));
            status.setRollbackOnly();
        });
        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));
    }

    @Test void concurrentSameUserGlobalRemoteImportsSerializeAndReuseCommittedRow() throws Exception {
        String name = "concurrent-remote";
        String url = "https://example.test/concurrent-remote.js";
        ProjectImportParamDTO first = remoteScriptImportParam(name, url, "GLOBAL");
        ProjectImportParamDTO second = remoteScriptImportParam(name, url, "GLOBAL");
        CountDownLatch secondStarted = new CountDownLatch(1);
        AtomicReference<Throwable> secondFailure = new AtomicReference<>();
        Thread secondImport = new Thread(() -> {
            User secondUser = new User(); secondUser.setId(7L);
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(secondUser, "", List.of()));
            secondStarted.countDown();
            try {
                assertTrue(controller.importProject(second).getData());
            } catch (Throwable error) {
                secondFailure.set(error);
            } finally {
                SecurityContextHolder.clearContext();
            }
        }, "same-user-global-remote-script-import");

        AtomicReference<Boolean> observedWait = new AtomicReference<>(false);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            UserPO locked = users.selectOne(new LambdaQueryWrapper<UserPO>()
                    .select(UserPO::getId).eq(UserPO::getId, 7L).eq(UserPO::getDeleted, 0).last("FOR UPDATE"));
            assertNotNull(locked);
            assertTrue(assertDoesNotThrow(() -> controller.importProject(first)).getData());
            secondImport.start();
            try {
                assertTrue(secondStarted.await(3, TimeUnit.SECONDS));
                observedWait.set(awaitThreadWaiting(secondImport, 3, TimeUnit.SECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        });

        secondImport.join(5_000);
        assertFalse(secondImport.isAlive(), "second remote import should finish after first transaction commits");
        assertTrue(observedWait.get(), "second remote import should wait for the user-row lock");
        assertNull(secondFailure.get(), () -> String.valueOf(secondFailure.get()));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", Integer.class));
        assertEquals(name, jdbc.queryForObject("select name from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", String.class));
        assertEquals(url, jdbc.queryForObject("select url from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", String.class));
    }

    @Test void globalRemoteLookupSkipsCaseInsensitiveNearMatchAndFindsExactCandidateAfterIt() throws Exception {
        String name = "shared";
        String url = "https://example.test/script.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name.toUpperCase(java.util.Locale.ROOT), url.toUpperCase(java.util.Locale.ROOT), "REMOTE", 7L);
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name, url, "REMOTE", 7L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "GLOBAL")).getData());

        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", Integer.class));
        List<Map.Entry<String, String>> stored = jdbc.query(
                "select name, url from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0",
                (result, row) -> Map.entry(result.getString("name"), result.getString("url")));
        assertEquals(1, stored.stream().filter(row -> java.util.Objects.equals(row.getKey(), name)
                && java.util.Objects.equals(row.getValue(), url)).count());
    }

    @Test void otherUsersOnlyRemoteGlobalCandidateDoesNotPreventCurrentUserInsert() throws Exception {
        String name = "shared";
        String url = "https://example.test/other-user.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name, url, "REMOTE", 8L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "GLOBAL")).getData());

        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where type='REMOTE' and deleted=0", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=8 and project_id is null and type='REMOTE' and deleted=0", Integer.class));
    }

    @Test void projectOnlyRemoteCandidateDoesNotPreventGlobalInsert() throws Exception {
        String name = "shared";
        String url = "https://example.test/project-only.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, 42, ?, 0)",
                name, url, "REMOTE", 7L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "GLOBAL")).getData());

        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id=42 and type='REMOTE' and deleted=0", Integer.class));
    }

    @Test void deletedOnlyRemoteGlobalCandidateDoesNotPreventActiveInsert() throws Exception {
        String name = "shared";
        String url = "https://example.test/deleted-only.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 1)",
                name, url, "REMOTE", 7L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "GLOBAL")).getData());

        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE'", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=1", Integer.class));
    }

    @Test void caseInsensitiveNameOnlyCandidateDoesNotPreventExactGlobalInsert() throws Exception {
        String name = "shared";
        String url = "https://example.test/name-case-only.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name.toUpperCase(java.util.Locale.ROOT), url, "REMOTE", 7L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "GLOBAL")).getData());

        List<Map.Entry<String, String>> stored = jdbc.query(
                "select name, url from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0",
                (result, row) -> Map.entry(result.getString("name"), result.getString("url")));
        assertEquals(2, stored.size());
        assertEquals(1, stored.stream().filter(row -> java.util.Objects.equals(row.getKey(), name)
                && java.util.Objects.equals(row.getValue(), url)).count());
    }

    @Test void caseInsensitiveUrlOnlyCandidateDoesNotPreventExactGlobalInsert() throws Exception {
        String name = "shared";
        String url = "https://example.test/url-case-only.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name, url.toUpperCase(java.util.Locale.ROOT), "REMOTE", 7L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "GLOBAL")).getData());

        List<Map.Entry<String, String>> stored = jdbc.query(
                "select name, url from dynamic_script where user_id=7 and project_id is null and type='REMOTE' and deleted=0",
                (result, row) -> Map.entry(result.getString("name"), result.getString("url")));
        assertEquals(2, stored.size());
        assertEquals(1, stored.stream().filter(row -> java.util.Objects.equals(row.getKey(), name)
                && java.util.Objects.equals(row.getValue(), url)).count());
    }

    @Test void projectRemoteScriptStaysProjectScopedAndRetainsItsExistingReuseRule() throws Exception {
        String name = "project-script";
        String url = "https://example.test/project-script.js";
        jdbc.update("insert into dynamic_script (name, url, type, project_id, user_id, deleted) values (?, ?, ?, null, ?, 0)",
                name, url, "REMOTE", 7L);

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "PROJECT")).getData());
        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and project_id=42 and type='REMOTE' and deleted=0", Integer.class));

        assertTrue(controller.importProject(remoteScriptImportParam(name, url, "PROJECT")).getData());
        assertEquals(2, jdbc.queryForObject("select count(*) from dynamic_script where user_id=7 and type='REMOTE' and deleted=0", Integer.class));
    }

    private ProjectImportParamDTO scriptImportParam(String name, byte[] content) throws Exception {
        byte[] manifest = JSON.toJSONBytes(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("dynamicScripts", List.of(
                        Map.of("name", name, "type", "LOCAL", "scope", "GLOBAL", "blob", "blobs/script.js")))));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : Map.of("manifest.json", manifest, "project/project.json", "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    "blobs/script.js", content).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        ProjectImportParamDTO param = new ProjectImportParamDTO(); param.setProjectId(42L);
        param.setFile(new MockMultipartFile("file", "script.zip", "application/zip", bytes.toByteArray()));
        return param;
    }

    private ProjectImportParamDTO remoteScriptImportParam(String name, String url, String scope) throws Exception {
        byte[] manifest = JSON.toJSONBytes(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("dynamicScripts", List.of(
                        Map.of("name", name, "type", "REMOTE", "scope", scope, "url", url)))));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : Map.of("manifest.json", manifest,
                    "project/project.json", "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8)).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        ProjectImportParamDTO param = new ProjectImportParamDTO(); param.setProjectId(42L);
        param.setFile(new MockMultipartFile("file", "remote-script.zip", "application/zip", bytes.toByteArray()));
        return param;
    }

    private boolean awaitThreadWaiting(Thread thread, long timeout, TimeUnit unit) throws InterruptedException {
        long deadline = System.nanoTime() + unit.toNanos(timeout);
        while (System.nanoTime() < deadline) {
            Thread.State state = thread.getState();
            if (state == Thread.State.WAITING || state == Thread.State.TIMED_WAITING) return true;
            if (state == Thread.State.TERMINATED) return false;
            Thread.sleep(10);
        }
        return false;
    }

    private ProjectImportParamDTO fontImportParam(String name, byte[] content) throws Exception {
        String project = JSON.toJSONString(Map.of("themeManager", List.of(Map.of("fontFamily", name))));
        byte[] manifest = JSON.toJSONBytes(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("fonts", List.of(
                        Map.of("name", name, "blob", "blobs/font.woff2")))));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : Map.of("manifest.json", manifest, "project/project.json", project.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    "blobs/font.woff2", content).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        ProjectImportParamDTO param = new ProjectImportParamDTO(); param.setProjectId(42L);
        param.setFile(new MockMultipartFile("file", "test.zip", "application/zip", bytes.toByteArray()));
        return param;
    }

    private ProjectImportParamDTO importParam(boolean ambiguous) throws Exception {
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of("base", Map.of("type", "BaseImage"),
                "style", Map.of("localUrl", ambiguous ? "same.png" : "images/a/same.png")))));
        var images = ambiguous
                ? List.of(Map.of("original", "images/a/same.png", "blob", "blobs/a/same.png"),
                        Map.of("original", "images/b/same.png", "blob", "blobs/b/same.png"))
                : List.of(Map.of("original", "images/a/same.png", "blob", "blobs/a/same.png"));
        byte[] manifest = JSON.toJSONBytes(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("images", images)));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : Map.of("manifest.json", manifest, "project/project.json", project.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    "blobs/a/same.png", new byte[]{1}, "blobs/b/same.png", new byte[]{2}).entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry();
            }
        }
        ProjectImportParamDTO param = new ProjectImportParamDTO(); param.setProjectId(42L);
        param.setFile(new MockMultipartFile("file", "test.zip", "application/zip", bytes.toByteArray()));
        return param;
    }
}
