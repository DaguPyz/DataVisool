/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.constants.ScriptEnum;
import com.zsq.datavisoolservice.mapper.*;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ProjectImportParamDTO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.service.FontService;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.service.RemoteComponentService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProjectArchiveGlobalScriptReuseTest {
    @TempDir Path root;
    private String oldRoot;
    private String oldScriptPath;
    private DynamicScriptMapper scripts;
    private ProjectArchiveCompatHelper helper;
    private final List<DynamicScriptPO> rows = new ArrayList<>();
    private final AtomicLong ids = new AtomicLong(1);

    @BeforeEach void setUp() {
        oldRoot = AppBaseConfig.ROOT_PATH;
        oldScriptPath = AppBaseConfig.DYNAMIC_SCRIPT_PATH;
        AppBaseConfig.ROOT_PATH = root.toString();
        AppBaseConfig.DYNAMIC_SCRIPT_PATH = "scripts";
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), ProjectPO.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), DynamicScriptPO.class);

        ProjectMapper projects = mock(ProjectMapper.class);
        when(projects.selectCount(any())).thenReturn(1L);
        when(projects.update(isNull(), any())).thenReturn(1);
        scripts = mock(DynamicScriptMapper.class);
        when(scripts.selectList(any())).thenAnswer(invocation -> new ArrayList<>(rows));
        when(scripts.insert(any(DynamicScriptPO.class))).thenAnswer(invocation -> {
            DynamicScriptPO row = invocation.getArgument(0);
            row.setId(ids.getAndIncrement());
            if (row.getDeleted() == null) row.setDeleted(0);
            rows.add(row);
            return 1;
        });
        helper = new ProjectArchiveCompatHelper(projects, mock(UserMapper.class), mock(FontService.class), mock(ImageService.class),
                mock(RemoteComponentService.class), scripts, mock(CommonApiMapper.class), mock(DatasourceMapper.class),
                mock(VideoMapper.class), mock(ThreeDModelMapper.class));
        User user = new User(); user.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, "", List.of()));
    }

    @AfterEach void tearDown() {
        SecurityContextHolder.clearContext();
        AppBaseConfig.ROOT_PATH = oldRoot;
        AppBaseConfig.DYNAMIC_SCRIPT_PATH = oldScriptPath;
    }

    @Test void reusesSameUserGlobalScriptWithSameNameAndContentWithinAndAcrossImports() throws Exception {
        byte[] content = "window.sharedFlag = true;".getBytes(StandardCharsets.UTF_8);
        byte[] archive = manifestArchive(List.of(new ScriptInput("shared.js", content),
                new ScriptInput("shared.js", content), new ScriptInput("shared.js", content)));

        importArchive(archive);
        importArchive(archive);

        assertEquals(1, rows.size());
        DynamicScriptPO saved = rows.get(0);
        assertEquals(7L, saved.getUserId());
        assertNull(saved.getProjectId());
        assertEquals(ScriptEnum.LOCAL, saved.getType());
        assertEquals("shared.js", saved.getName());
        assertArrayEquals(content, Files.readAllBytes(root.resolve("scripts").resolve(saved.getUrl())));
        try (var files = Files.list(root.resolve("scripts"))) {
            assertEquals(1, files.count(), "duplicate temporary files must be removed");
        }
    }

    @Test void preservesSameNameDifferentContentAndDifferentNameSameContent() throws Exception {
        byte[] first = "window.value = 1;".getBytes(StandardCharsets.UTF_8);
        byte[] second = "window.value = 2;".getBytes(StandardCharsets.UTF_8);
        byte[] archive = manifestArchive(List.of(new ScriptInput("shared.js", first),
                new ScriptInput("shared.js", second), new ScriptInput("another.js", first)));

        importArchive(archive);
        importArchive(archive);

        assertEquals(3, rows.size());
        assertEquals(3, rows.stream().map(DynamicScriptPO::getUrl).distinct().count());
        assertEquals(2, rows.stream().filter(row -> "shared.js".equals(row.getName())).count());
        assertEquals(1, rows.stream().filter(row -> "another.js".equals(row.getName())).count());
        assertTrue(rows.stream().anyMatch(row -> "shared.js".equals(row.getName()) &&
                bytesAt(row).equals(java.util.Arrays.toString(first))));
        assertTrue(rows.stream().anyMatch(row -> "shared.js".equals(row.getName()) &&
                bytesAt(row).equals(java.util.Arrays.toString(second))));
        assertTrue(rows.stream().anyMatch(row -> "another.js".equals(row.getName()) &&
                bytesAt(row).equals(java.util.Arrays.toString(first))));
        try (var files = Files.list(root.resolve("scripts"))) { assertEquals(3, files.count()); }
    }

    @Test void doesNotReuseDifferentUsersProjectScriptsDeletedRowsOrUnsafePaths() throws Exception {
        Files.createDirectories(root.resolve("scripts/nested"));
        Path outside = root.resolve("outside.js");
        byte[] content = "window.keep = 'original';".getBytes(StandardCharsets.UTF_8);
        Files.write(outside, content);
        Files.write(root.resolve("scripts/nested/inside.js"), content);
        try {
            Files.createSymbolicLink(root.resolve("scripts/link"), root);
        } catch (UnsupportedOperationException | java.io.IOException | SecurityException e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(false, "symbolic links are unavailable: " + e.getMessage());
        }

        rows.add(row(8L, null, "same.js", "nested/inside.js", 0));
        rows.add(row(7L, 42L, "same.js", "nested/inside.js", 0));
        rows.add(row(7L, null, "same.js", "nested/inside.js", 1));
        rows.add(row(7L, null, "same.js", "missing.js", 0));
        rows.add(row(7L, null, "same.js", "../outside.js", 0));
        rows.add(row(7L, null, "same.js", "link/outside.js", 0));

        importArchive(manifestArchive(List.of(new ScriptInput("same.js", content))));

        assertEquals(7, rows.size());
        DynamicScriptPO imported = rows.get(rows.size() - 1);
        assertEquals(7L, imported.getUserId());
        assertNull(imported.getProjectId());
        assertNotEquals("../outside.js", imported.getUrl());
        assertNotEquals("link/outside.js", imported.getUrl());
        assertArrayEquals(content, Files.readAllBytes(outside));
        assertArrayEquals(content, Files.readAllBytes(root.resolve("scripts/nested/inside.js")));
    }

    @Test void legacyNoManifestScriptsRemainProjectScopedAndAreNotGlobalReuseCandidates() throws Exception {
        byte[] content = "window.legacy = true;".getBytes(StandardCharsets.UTF_8);
        DynamicScriptPO global = row(7L, null, "legacy.js", "existing.js", 0);
        rows.add(global);
        Files.createDirectories(root.resolve("scripts"));
        Files.write(root.resolve("scripts/existing.js"), content);

        importArchive(legacyArchive("legacy.js", content));

        assertEquals(2, rows.size());
        DynamicScriptPO imported = rows.get(1);
        assertEquals(7L, imported.getUserId());
        assertEquals(42L, imported.getProjectId());
        assertEquals("legacy.js", imported.getName());
        assertNotEquals(global.getUrl(), imported.getUrl());
        assertArrayEquals(content, Files.readAllBytes(root.resolve("scripts").resolve(imported.getUrl())));
        assertArrayEquals(content, Files.readAllBytes(root.resolve("scripts/existing.js")));
    }

    @Test void reusesSameUserGlobalRemoteScriptForExactNameAndUrlInOrderAndAcrossImports() throws Exception {
        String url = "https://example.test/shared.js?v=1";
        byte[] archive = remoteManifestArchive(List.of(new RemoteScriptInput("shared", url, "GLOBAL"),
                new RemoteScriptInput("shared", url, "GLOBAL"), new RemoteScriptInput("shared", url, "GLOBAL")));

        importArchive(archive);
        importArchive(archive);

        assertEquals(1, rows.size());
        DynamicScriptPO saved = rows.get(0);
        assertEquals(7L, saved.getUserId());
        assertNull(saved.getProjectId());
        assertEquals(ScriptEnum.REMOTE, saved.getType());
        assertEquals("shared", saved.getName());
        assertEquals(url, saved.getUrl());
        verify(scripts, times(1)).insert(any(DynamicScriptPO.class));
    }

    @Test void globalRemoteReuseRequiresExactNameUrlAndUserAndKeepsExistingDuplicates() throws Exception {
        String url = "https://example.test/shared.js";
        rows.add(remoteRow(7L, null, "shared", url.toUpperCase(java.util.Locale.ROOT), 0));
        rows.add(remoteRow(8L, null, "shared", url, 0));
        rows.add(remoteRow(7L, 42L, "shared", url, 0));
        rows.add(remoteRow(7L, null, "shared", url, 1));
        rows.add(remoteRow(7L, null, "shared", url, 0));
        rows.add(remoteRow(7L, null, "shared", url, 0));
        List<RemoteScriptInput> imports = List.of(
                new RemoteScriptInput("shared", url, "GLOBAL"),
                new RemoteScriptInput("shared", "https://example.test/SHARED.js", "GLOBAL"),
                new RemoteScriptInput("SHARED", url, "GLOBAL"),
                new RemoteScriptInput("different-name", url, "GLOBAL"),
                new RemoteScriptInput("shared", url + "?new=1", "GLOBAL"));
        byte[] archive = remoteManifestArchive(imports);

        importArchive(archive);
        importArchive(archive);

        assertEquals(10, rows.size(), "two exact pre-existing duplicates remain; only four distinct new tuples are inserted");
        assertEquals(2, rows.stream().filter(row -> row.getUserId() == 7L && row.getProjectId() == null
                && row.getDeleted() == 0 && "shared".equals(row.getName()) && url.equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getUserId() == 8L && row.getProjectId() == null
                && "shared".equals(row.getName()) && url.equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getUserId() == 7L && row.getProjectId() != null
                && "shared".equals(row.getName()) && url.equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getDeleted() == 1 && "shared".equals(row.getName())
                && url.equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getUserId() == 7L && row.getProjectId() == null
                && row.getDeleted() == 0 && "shared".equals(row.getName())
                && "https://example.test/SHARED.js".equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getUserId() == 7L && row.getProjectId() == null
                && row.getDeleted() == 0 && "SHARED".equals(row.getName()) && url.equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getUserId() == 7L && row.getProjectId() == null
                && row.getDeleted() == 0 && "different-name".equals(row.getName()) && url.equals(row.getUrl())).count());
        assertEquals(1, rows.stream().filter(row -> row.getUserId() == 7L && row.getProjectId() == null
                && row.getDeleted() == 0 && "shared".equals(row.getName()) && (url + "?new=1").equals(row.getUrl())).count());
    }

    @Test void projectScopedRemoteImportUsesProjectLookupAndNeverTheGlobalRecord() throws Exception {
        String url = "https://example.test/project.js";
        DynamicScriptPO global = remoteRow(7L, null, "project-script", url, 0);
        DynamicScriptPO project = remoteRow(7L, 42L, "project-script", url, 0);
        rows.add(global);
        rows.add(project);
        when(scripts.selectOne(any())).thenReturn(project);

        importArchive(remoteManifestArchive(List.of(new RemoteScriptInput("project-script", url, "PROJECT"))));

        assertEquals(2, rows.size());
        verify(scripts).selectOne(any());
        verify(scripts, never()).selectList(any());
        assertNull(global.getProjectId());
        assertEquals(42L, project.getProjectId());
    }

    private DynamicScriptPO row(Long userId, Long projectId, String name, String url, Integer deleted) {
        DynamicScriptPO row = new DynamicScriptPO();
        row.setId(ids.getAndIncrement());
        row.setUserId(userId);
        row.setProjectId(projectId);
        row.setType(ScriptEnum.LOCAL);
        row.setName(name);
        row.setUrl(url);
        row.setDeleted(deleted);
        return row;
    }

    private DynamicScriptPO remoteRow(Long userId, Long projectId, String name, String url, Integer deleted) {
        DynamicScriptPO row = row(userId, projectId, name, url, deleted);
        row.setType(ScriptEnum.REMOTE);
        return row;
    }

    private String bytesAt(DynamicScriptPO row) {
        try {
            return java.util.Arrays.toString(Files.readAllBytes(root.resolve("scripts").resolve(row.getUrl())));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private void importArchive(byte[] archive) throws Exception {
        ProjectImportParamDTO param = new ProjectImportParamDTO();
        param.setProjectId(42L);
        param.setFile(new MockMultipartFile("file", "project.zip", "application/zip", archive));
        assertTrue(helper.importProject(param));
    }

    private byte[] manifestArchive(List<ScriptInput> inputs) throws Exception {
        List<Map<String, Object>> refs = new ArrayList<>();
        Map<String, byte[]> entries = new LinkedHashMap<>();
        for (int i = 0; i < inputs.size(); i++) {
            ScriptInput input = inputs.get(i);
            String blob = "blobs/script-" + i + ".js";
            refs.add(Map.of("name", input.name(), "type", "LOCAL", "scope", "GLOBAL", "blob", blob));
            entries.put(blob, input.content());
        }
        entries.put("manifest.json", JSON.toJSONBytes(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("dynamicScripts", refs))));
        entries.put("project/project.json", "{}".getBytes(StandardCharsets.UTF_8));
        return zip(entries);
    }

    private byte[] remoteManifestArchive(List<RemoteScriptInput> inputs) throws Exception {
        List<Map<String, Object>> refs = inputs.stream().map(input -> Map.<String, Object>of(
                "name", input.name(), "type", "REMOTE", "scope", input.scope(), "url", input.url())).toList();
        return zip(Map.of("manifest.json", JSON.toJSONBytes(Map.of("format", "datavisool-project", "formatVersion", 2,
                        "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("dynamicScripts", refs))),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
    }

    private byte[] legacyArchive(String name, byte[] content) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("project.lc", JSON.toJSONBytes(Map.of("projectJson", "{}", "dynamicScripts",
                List.of(Map.of("name", name, "value", name)))));
        entries.put("scripts/" + name, content);
        return zip(entries);
    }

    private static byte[] zip(Map<String, byte[]> entries) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private record ScriptInput(String name, byte[] content) { }
    private record RemoteScriptInput(String name, String url, String scope) { }
}
