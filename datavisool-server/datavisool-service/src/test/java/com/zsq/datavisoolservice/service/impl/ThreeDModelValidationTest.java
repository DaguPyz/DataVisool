/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.ThreeDModelMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ThreeDModelDTO;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.Assert.*;

public class ThreeDModelValidationTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    private String oldRoot;
    private String oldPath;
    private long oldLimit;
    private SqlSession session;
    private JdbcTemplate jdbc;
    private ThreeDModelServiceImpl service;

    @Before
    public void setUp() throws Exception {
        oldRoot = AppBaseConfig.ROOT_PATH;
        oldPath = AppBaseConfig.MODEL_PATH;
        oldLimit = AppBaseConfig.MODEL_MAX_SIZE;
        AppBaseConfig.ROOT_PATH = temp.getRoot().getAbsolutePath();
        AppBaseConfig.MODEL_PATH = "models";
        AppBaseConfig.MODEL_MAX_SIZE = 10 * 1024 * 1024;
        User user = new User(); user.setId(7L); user.setRoles(List.of("ROLE_USER")); user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        new ResourceDatabasePopulator(new ClassPathResource("migration/V2026.1.8.2__model.sql")).execute(dataSource);
        jdbc = new JdbcTemplate(dataSource);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.H2));
        configuration.addInterceptor(interceptor);
        configuration.addMapper(ThreeDModelMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        service = new ThreeDModelServiceImpl(session.getMapper(ThreeDModelMapper.class));
    }

    @After
    public void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
        SecurityContextHolder.clearContext();
        if (session != null) session.close();
        AppBaseConfig.ROOT_PATH = oldRoot;
        AppBaseConfig.MODEL_PATH = oldPath;
        AppBaseConfig.MODEL_MAX_SIZE = oldLimit;
    }

    private byte[] glb(String json) {
        byte[] raw = json.getBytes(StandardCharsets.UTF_8);
        int padded = (raw.length + 3) & ~3;
        ByteBuffer out = ByteBuffer.allocate(20 + padded).order(ByteOrder.LITTLE_ENDIAN);
        out.putInt(0x46546c67).putInt(2).putInt(out.capacity()).putInt(padded).putInt(0x4e4f534a).put(raw);
        while (out.hasRemaining()) out.put((byte) ' ');
        return out.array();
    }

    private MockMultipartFile file(String name, byte[] bytes) {
        return new MockMultipartFile("files", name, "application/octet-stream", bytes);
    }

    @Test
    public void validGlbIsStoredAndInvalidHeadersAndJsonAreRejectedBeforeAnyWrite() throws Exception {
        byte[] valid = glb("{\"asset\":{\"version\":\"2.0\"}}");
        byte[] magic = valid.clone(); magic[0] = 0;
        byte[] version = valid.clone(); version[4] = 1;
        byte[] length = valid.clone(); length[8] = 0;
        byte[] chunkLength = valid.clone(); chunkLength[12] = (byte) 0xfc;
        for (byte[] invalid : List.of("not-a-glb".getBytes(StandardCharsets.UTF_8), magic, version, length, chunkLength,
                glb("{\"asset\":{\"version\":\"1.0\"}}"), glb("{\"asset\":{\"version\":\"2.0\"}"))) {
            assertEquals(AppStatusCode.INVALID_PARAM.code(), assertThrows(AppException.class,
                    () -> service.batchUpload(List.of(file("bad.glb", invalid)))).getCode());
        }
        assertEquals(Long.valueOf(0), jdbc.queryForObject("SELECT COUNT(*) FROM three_d_model", Long.class));
        ThreeDModelDTO result = service.batchUpload(List.of(file("valid.glb", valid))).get(0);
        assertNotNull(result.getId());
        assertArrayEquals(valid, Files.readAllBytes(Path.of(AppBaseConfig.getModelPath(), result.getUrl().substring(result.getUrl().lastIndexOf('/') + 1))));
    }

    @Test
    public void emptyOrInvalidFilesInBatchAreRejectedBeforeOtherFilesAreStored() throws Exception {
        MockMultipartFile validObj = file("valid.obj", "v 0 0 0\n".getBytes(StandardCharsets.UTF_8));
        for (MockMultipartFile invalid : List.of(file("empty.obj", new byte[0]), file("bad.glb", new byte[]{1,2,3}))) {
            assertThrows(AppException.class, () -> service.batchUpload(List.of(validObj, invalid)));
        }
        assertEquals(Long.valueOf(0), jdbc.queryForObject("SELECT COUNT(*) FROM three_d_model", Long.class));
        assertFalse(Files.exists(Path.of(AppBaseConfig.getModelPath())));
    }

    @Test
    public void compressedInvalidGlbIsRejectedAndExtractedDirectoryIsRemoved() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            zip.putNextEntry(new ZipEntry("scene/bad.glb")); zip.write(new byte[]{1,2,3}); zip.closeEntry();
        }
        assertThrows(AppException.class, () -> service.batchUpload(List.of(file("bad.zip", bytes.toByteArray()))));
        assertEquals(Long.valueOf(0), jdbc.queryForObject("SELECT COUNT(*) FROM three_d_model", Long.class));
        try (var files = Files.list(Path.of(AppBaseConfig.getModelPath()))) { assertEquals(0, files.count()); }
    }

    @Test
    public void replacementKeepsIdAndOldFileAndCleansNewFileOnRollback() throws Exception {
        Path directory = Path.of(AppBaseConfig.getModelPath()); Files.createDirectories(directory);
        Path oldFile = directory.resolve("old.obj"); byte[] oldBytes = "v 0 0 0\n".getBytes(StandardCharsets.UTF_8); Files.write(oldFile, oldBytes);
        jdbc.update("INSERT INTO three_d_model (id,name,url,user_id,is_compressed) VALUES (42,'old.obj','old.obj',7,0)");
        TransactionSynchronizationManager.initSynchronization();
        ThreeDModelDTO result = service.replaceModel(42L, List.of(file("new.glb", glb("{\"asset\":{\"version\":\"2.0\"}}"))));
        assertEquals(Long.valueOf(42), result.getId());
        Path replacement = directory.resolve(result.getUrl().substring(result.getUrl().lastIndexOf('/') + 1));
        assertTrue(Files.exists(replacement)); assertArrayEquals(oldBytes, Files.readAllBytes(oldFile));
        for (TransactionSynchronization callback : TransactionSynchronizationManager.getSynchronizations()) callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        assertFalse(Files.exists(replacement)); assertArrayEquals(oldBytes, Files.readAllBytes(oldFile));
        assertEquals(Long.valueOf(1), jdbc.queryForObject("SELECT COUNT(*) FROM three_d_model", Long.class));
    }

    @Test
    public void replacementRejectsUnownedIdAndMultipleFiles() {
        MockMultipartFile validObj = file("valid.obj", "v 0 0 0\n".getBytes(StandardCharsets.UTF_8));
        jdbc.update("INSERT INTO three_d_model (id,name,url,user_id,is_compressed) VALUES (42,'foreign.obj','foreign.obj',8,0)");
        assertEquals(AppStatusCode.NOT_FOUND.code(), assertThrows(AppException.class,
                () -> service.replaceModel(42L, List.of(validObj))).getCode());
        assertEquals(AppStatusCode.INVALID_PARAM.code(), assertThrows(AppException.class,
                () -> service.replaceModel(42L, Arrays.asList(validObj, validObj))).getCode());
        assertEquals(Long.valueOf(1), jdbc.queryForObject("SELECT COUNT(*) FROM three_d_model", Long.class));
        assertEquals("foreign.obj", jdbc.queryForObject("SELECT name FROM three_d_model WHERE id=42", String.class));
    }
}
