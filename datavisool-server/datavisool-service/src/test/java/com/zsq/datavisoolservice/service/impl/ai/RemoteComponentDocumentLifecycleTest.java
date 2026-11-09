/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.mapper.*;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.RemoteComponentDTO;
import com.zsq.datavisoolservice.service.impl.RemoteComponentServiceImpl;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import static org.junit.jupiter.api.Assertions.*;

/** 使用真实 SQL 索引与文件，不依赖模型或外部数据库。 */
class RemoteComponentDocumentLifecycleTest {
    @TempDir Path root;
    SqlSession session;
    ComponentDocumentService documents;
    RemoteComponentServiceImpl components;
    String previousRoot, previousPath;
    long previousLimit;
    String source;
    @BeforeEach void setup() throws Exception {
        previousRoot = AppBaseConfig.ROOT_PATH; previousPath = AppBaseConfig.REMOTE_COMPONENT_PATH; previousLimit = AppBaseConfig.FILE_MAX_SIZE;
        AppBaseConfig.ROOT_PATH = root.toString(); AppBaseConfig.REMOTE_COMPONENT_PATH = "components"; AppBaseConfig.FILE_MAX_SIZE = 1024 * 1024;
        var data = new JdbcDataSource(); data.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        new JdbcTemplate(data).execute("create table remote_component (id bigint auto_increment primary key, component_name varchar(255), url varchar(1024), user_id bigint, deleted int default 0, create_time timestamp default current_timestamp, update_time timestamp default current_timestamp)");
        String schema = new ClassPathResource("migration/V2026.10.7.2__component_document.sql").getContentAsString(StandardCharsets.UTF_8)
                .replace("not null on update CURRENT_TIMESTAMP", "on update CURRENT_TIMESTAMP not null");
        new ResourceDatabasePopulator(new org.springframework.core.io.ByteArrayResource(schema.getBytes(StandardCharsets.UTF_8))).execute(data);
        var config = new MybatisConfiguration(); config.setMapUnderscoreToCamelCase(true);
        config.setEnvironment(new Environment("test", new JdbcTransactionFactory(), data));
        config.addMapper(RemoteComponentMapper.class); config.addMapper(RemoteComponentDocumentMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(config).openSession(true);
        documents = new ComponentDocumentService(root.resolve("docs").toString(), session.getMapper(RemoteComponentDocumentMapper.class), session.getMapper(RemoteComponentMapper.class));
        components = new RemoteComponentServiceImpl();
        ReflectionTestUtils.setField(components, "remoteComponentMapper", session.getMapper(RemoteComponentMapper.class));
        ReflectionTestUtils.setField(components, "componentDocuments", documents);
        source = Files.readString(Path.of("../../datavisool-app/src/comps/builtin/base-text/BaseText.md")).replace("BaseText", "RemoteText");
        login(7L);
    }
    @AfterEach void cleanup() {
        if (session != null) session.close(); SecurityContextHolder.clearContext();
        AppBaseConfig.ROOT_PATH = previousRoot; AppBaseConfig.REMOTE_COMPONENT_PATH = previousPath; AppBaseConfig.FILE_MAX_SIZE = previousLimit;
    }
    void login(Long id) {
        var user = new User(); user.setId(id);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, "", List.of()));
    }
    RemoteComponentDTO upload(String text, Long id) throws Exception {
        Map<String, String> files = Map.of("RemoteText.md", text, "entry.js", "// component code " + text.length(), "manifest.json",
                JSON.toJSONString(Map.of("componentType", "RemoteText", "componentVersion", "1.0", "documentFormatVersion", "component-document/v1", "codeEntry", "entry.js", "documentPath", "RemoteText.md")));
        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes)) {
            for (var file : files.entrySet()) {zip.putNextEntry(new ZipEntry(file.getKey())); zip.write(file.getValue().getBytes(StandardCharsets.UTF_8)); zip.closeEntry();}
        }
        var dto = new RemoteComponentDTO(); dto.setId(id); dto.setComponentFile(new MockMultipartFile("componentFile", "RemoteText.zip", "application/zip", bytes.toByteArray()));
        return dto;
    }
    Object read(Map<String, Object> descriptor, Long userId) {
        return documents.execute("resolve_component_specs", new LinkedHashMap<>(Map.of("componentTypes", List.of("RemoteText"), "intent", "create", "catalog", List.of(descriptor))), userId);
    }
    @Test void remoteIndexLimitCountsUtf8BytesForChineseMetadata() throws Exception {
        Path pkg = root.resolve("large-index"); Files.createDirectories(pkg);
        String description = (String) ComponentDocumentParser.firstJson(ComponentDocumentParser.section(source, "组件选择")).get("description");
        String content = source.replace(description, "中".repeat(6000));
        Files.writeString(pkg.resolve("RemoteText.md"), content);
        Files.writeString(pkg.resolve("entry.js"), "// remote component");
        Files.writeString(pkg.resolve("manifest.json"), JSON.toJSONString(Map.of("componentType", "RemoteText", "componentVersion", "1.0",
                "documentFormatVersion", "component-document/v1", "codeEntry", "entry.js", "documentPath", "RemoteText.md")));
        String index = JSON.toJSONString(documents.inspectPackage(pkg));
        assertTrue(index.length() < 16 * 1024);
        assertTrue(index.getBytes(StandardCharsets.UTF_8).length > 16 * 1024);
        var parent = new com.zsq.datavisoolservice.model.po.RemoteComponentPO(); parent.setId(1L); parent.setUserId(7L);
        var error = assertThrows(ComponentDocumentParser.DocumentException.class, () -> documents.registerPackage(pkg, "pkg/entry.js", parent));
        assertEquals("agent.component_specs.output_limit_exceeded", error.code);
        assertEquals(0, session.getMapper(RemoteComponentDocumentMapper.class).selectCount(null));
    }
    @Test void uploadReplaceFailureAndDeleteMaintainMatchingVersions() throws Exception {
        assertTrue(components.uploadComponent(upload(source, null)));
        var first = components.getAllRemoteComponent().get(0); var old = first.getDocumentInfo();
        assertNotNull(read(old, 7L));
        assertEquals("component-document/v1", old.get("documentFormatVersion"));
        var identity = new LinkedHashMap<>(old);
        identity.keySet().retainAll(Set.of("source", "componentType", "componentId", "componentVersion", "corpusVersion", "sha256", "documentFormatVersion"));
        var contract = documents.verifyDataContractResult(Map.of("componentIds", List.of("remote-layer")),
                Map.of("schemaVersion", "component-data-contract/v1", "sourceContract", Map.of("sourceType", "static", "branch", "staticData", "structure", Map.of()),
                        "components", List.of(Map.of("componentId", "remote-layer", "componentType", "RemoteText", "documentIdentity", identity,
                                "currentData", Map.of("valueExample", "标题"), "fieldMapping", Map.of()))), 7L);
        assertEquals(true, ((Map<?, ?>) ((List<?>) contract.get("components")).get(0)).get("supportsDataInput"));
        assertTrue(components.uploadComponent(upload(source + "\n更新文档\n", first.getId())));
        var current = components.getAllRemoteComponent().get(0);
        assertNotEquals(old.get("componentVersion"), current.getDocumentInfo().get("componentVersion"));
        assertNotNull(read(old, 7L)); assertNotNull(read(current.getDocumentInfo(), 7L));
        assertThrows(RuntimeException.class, () -> components.uploadComponent(upload(source.replace("RemoteText", "Wrong"), first.getId())));
        assertEquals(current.getUrl(), components.getAllRemoteComponent().get(0).getUrl());
        login(8L); assertTrue(components.getAllRemoteComponent().isEmpty());
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> read(old, 8L));
        login(7L); assertTrue(components.batchDelRemoteComponent(List.of(first.getId())));
        assertThrows(ComponentDocumentParser.DocumentException.class, () -> read(old, 7L));
        documents.cleanDeletedDocuments();
        assertFalse(Files.exists(documents.root().resolve("remote/7/" + first.getId() + "/" + old.get("componentVersion"))));
    }
    @Test void archiveImportRegistersDocumentsFromThePackagedFiles() throws Exception {
        assertTrue(components.uploadComponent(upload(source, null)));
        var first = components.getAllRemoteComponent().get(0);
        var imported = new com.zsq.datavisoolservice.model.po.RemoteComponentPO();
        imported.setUrl(first.getUrl().replaceFirst("^/components/", "")); imported.setComponentName("导入组件");
        assertNotNull(components.createRemoteComponent(imported));
        var list = components.getAllRemoteComponent(); assertEquals(2, list.size());
        assertTrue(list.stream().allMatch(item -> item.getDocumentInfo() != null));
        assertNotNull(read(list.get(1).getDocumentInfo(), 7L));
        assertTrue(components.batchDelRemoteComponent(List.of(first.getId())));
        assertTrue(documents.hasActivePackageReference(first.getUrl()));
        documents.cleanDeletedDocuments();
        assertNotNull(read(components.getAllRemoteComponent().get(0).getDocumentInfo(), 7L));
    }
}
