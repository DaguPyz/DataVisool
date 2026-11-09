/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.constants.DataBaseEnum;
import com.zsq.datavisoolservice.constants.ScriptEnum;
import com.zsq.datavisoolservice.mapper.*;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ProjectImportParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectDependencyParamDTO;
import com.zsq.datavisoolservice.model.dto.ExportProjectNodeDTO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.model.po.ImagePO;
import com.zsq.datavisoolservice.model.po.VideoPO;
import com.zsq.datavisoolservice.model.po.FontPO;
import com.zsq.datavisoolservice.model.po.CommonApiPO;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import com.zsq.datavisoolservice.model.po.ThreeDModelPO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import com.zsq.datavisoolservice.security.ManifestSecretCodecUtil;
import com.zsq.datavisoolservice.util.ProjectDataCodecUtil;
import com.zsq.datavisoolservice.service.FontService;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.service.RemoteComponentService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProjectArchiveComponentConversionTest {
    private static final String OLD_COMPONENT = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(I,U,V){return [I.AbstractDesignerDefinition,U.ObjectUtil.merge({},{}),V.LCGUI]}(LightChaserInterface,LightChaserUtil,LightChaserUI);";
    @TempDir Path root;
    private String oldRoot, oldComponentPath, oldImagePath, oldVideoPath, oldFontPath, oldScriptPath, oldModelPath;
    private ProjectArchiveCompatHelper helper;
    private RemoteComponentService componentService;
    private FontService fontService;
    private ImageService imageService;
    private ProjectMapper projects;
    private CommonApiMapper commonApis;
    private DatasourceMapper databases;
    private ThreeDModelMapper models;
    private VideoMapper videos;
    private DynamicScriptMapper scripts;
    private ProjectImportParamDTO lastImportParam;

    @BeforeEach void setUp() {
        oldRoot = AppBaseConfig.ROOT_PATH; oldComponentPath = AppBaseConfig.REMOTE_COMPONENT_PATH;
        oldImagePath = AppBaseConfig.IMAGE_PATH; oldVideoPath = AppBaseConfig.VIDEO_PATH; oldFontPath = AppBaseConfig.FONT_PATH; oldScriptPath = AppBaseConfig.DYNAMIC_SCRIPT_PATH; oldModelPath = AppBaseConfig.MODEL_PATH;
        AppBaseConfig.ROOT_PATH = root.toString(); AppBaseConfig.REMOTE_COMPONENT_PATH = "components";
        AppBaseConfig.IMAGE_PATH = "images"; AppBaseConfig.VIDEO_PATH = "videos"; AppBaseConfig.FONT_PATH = "fonts"; AppBaseConfig.DYNAMIC_SCRIPT_PATH = "scripts"; AppBaseConfig.MODEL_PATH = "models";
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), ProjectPO.class);
        projects = mock(ProjectMapper.class); when(projects.selectCount(any())).thenReturn(1L);
        when(projects.update(isNull(), any())).thenReturn(1);
        componentService = mock(RemoteComponentService.class);
        when(componentService.createRemoteComponent(any(RemoteComponentPO.class))).thenAnswer(invocation -> invocation.getArgument(0));
        fontService = mock(FontService.class);
        when(fontService.createFont(any(FontPO.class))).thenAnswer(invocation -> invocation.getArgument(0));
        imageService = mock(ImageService.class);
        when(imageService.createImage(any(ImagePO.class))).thenAnswer(invocation -> invocation.getArgument(0));
        commonApis = mock(CommonApiMapper.class);
        databases = mock(DatasourceMapper.class);
        models = mock(ThreeDModelMapper.class);
        videos = mock(VideoMapper.class);
        scripts = mock(DynamicScriptMapper.class);
        when(models.insert(any(ThreeDModelPO.class))).thenReturn(1);
        when(videos.insert(any(VideoPO.class))).thenReturn(1);
        when(scripts.insert(any(DynamicScriptPO.class))).thenReturn(1);
        helper = new ProjectArchiveCompatHelper(projects, mock(UserMapper.class), fontService, imageService, componentService,
                scripts, commonApis, databases, videos, models);
        User user = new User(); user.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, "", List.of()));
    }

    @AfterEach void tearDown() {
        SecurityContextHolder.clearContext(); AppBaseConfig.ROOT_PATH = oldRoot; AppBaseConfig.REMOTE_COMPONENT_PATH = oldComponentPath;
        AppBaseConfig.IMAGE_PATH = oldImagePath; AppBaseConfig.VIDEO_PATH = oldVideoPath; AppBaseConfig.FONT_PATH = oldFontPath; AppBaseConfig.DYNAMIC_SCRIPT_PATH = oldScriptPath; AppBaseConfig.MODEL_PATH = oldModelPath;
    }

    @Test void convertsComponentInManifestArchive() throws Exception {
        importArchive(manifestArchive("component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        assertConverted(savedComponent());
    }

    @Test void importsMinifiedLegacyWebBundleFromProjectArchiveWithoutExecutingIt() throws Exception {
        // The real project ZIP stores this shape as a raw JavaScript blob: one minified IIFE
        // receives React, ReactDOM, and the three legacy globals as positional arguments.
        String bundledComponent = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(M,Ft,Ct,Ks,el){"
                + "var config=Ks.ObjectUtil.merge({},{});"
                + "function Widget(){return M.createElement(el.LCGUI,{schema:config})}"
                + "return new Ct.AbstractDesignerDefinition(Widget);"
                + "}(React,ReactDOM,LightChaserInterface,LightChaserUtil,LightChaserUI);";
        importArchive(manifestArchive("component.js", bundledComponent.getBytes(StandardCharsets.UTF_8)));

        String converted = savedComponent();
        assertConverted(converted);
        assertTrue(converted.contains("Ks.ObjectUtil.merge"));
        assertTrue(converted.contains("el.DatavisoolGUI"));
        assertTrue(converted.contains("Ct.AbstractDesignerDefinition"));
        assertTrue(converted.contains("(React,ReactDOM,DataVisoolSDK,DataVisoolSDK,DataVisoolUI)"));
        assertTrue(converted.contains("M.createElement"));
    }

    @Test void convertsCommentedClassAttributeSelectorInInlineComponentCssDuringImport() throws Exception {
        String component = "const styleEl=document.createElement('style');" +
                "styleEl.textContent=\"[ /*x*/ class/*y*/ ~='lcp-button']{color:red}\";";
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate(component));
        importArchive(manifestArchive("component.js", component.getBytes(StandardCharsets.UTF_8)));
        assertTrue(savedComponent().contains("[ /*x*/ class/*y*/ ~='datavisool-button']{color:red}"));
    }

    @Test void convertsEscapedClassAttributeNameInStaticInlineStyleDuringImport() throws Exception {
        // Java `\\\\` emits the JS `\\`; JS then evaluates it to the CSS escape `\\63`.
        String component = "const styleEl=document.createElement('style');" +
                "styleEl.textContent=\"[\\\\63 lass~=lcp-button]{color:red}\";";
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate(component));
        importArchive(manifestArchive("component.js", component.getBytes(StandardCharsets.UTF_8)));
        assertTrue(savedComponent().contains("styleEl.textContent=\"[class~=datavisool-button]{color:red}\";"));
    }

    @Test void rejectsCommentedUnknownOrDynamicInlineCssDuringImport() throws Exception {
        String unknownSelector = "const styleEl=document.createElement('style');" +
                "styleEl.textContent=\"[ /*x*/ class/*y*/ *='lcp-']{color:red}\";";
        RuntimeException unknown = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.js", unknownSelector.getBytes(StandardCharsets.UTF_8))));
        assertTrue(unknown.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }

        String dynamic = "const styleEl=document.createElement('style');" +
                "styleEl.textContent=`[ /*x*/ class/*y*/ ~='lcp-button']{color:${color}}`;";
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate(dynamic));
        RuntimeException dynamicError = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.js", dynamic.getBytes(StandardCharsets.UTF_8))));
        assertTrue(dynamicError.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }

        String unresolvedReference = "const css=\"[cl/*x*/ass~='lcp-button']{color:red}\";";
        RuntimeException unresolved = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.js", unresolvedReference.getBytes(StandardCharsets.UTF_8))));
        assertTrue(unresolved.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
    }

    @Test void rejectsLegacyClassAttributeSelectorWithCommentInsideClassNameDuringImport() throws Exception {
        String component = "const styleEl=document.createElement('style');" +
                "styleEl.textContent=\"[cl/*x*/ass~='lcp-button']{color:red}\";";
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate(component));
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.js", component.getBytes(StandardCharsets.UTF_8))));
        assertTrue(error.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
    }

    @Test void rejectsObfuscatedInlineClassAttributeNameDuringImportButPreservesOrdinaryJs() throws Exception {
        String[] hiddenSelectors = {
                "[cl/*x*/\\61 ss~='lcp-button']{color:red}",
                "[\\63 l/*x*/ass~='lcp-button']{color:red}"
        };
        for (String css : hiddenSelectors) {
            String component = "const styleEl=document.createElement('style');styleEl.textContent=\"" + css.replace("\\", "\\\\") + "\";";
            assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate(component));
            RuntimeException error = assertThrows(RuntimeException.class,
                    () -> importArchive(manifestArchive("component.js", component.getBytes(StandardCharsets.UTF_8))));
            assertTrue(error.getMessage().contains("Example"));
            try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
        }
        verify(componentService, never()).createRemoteComponent(any());

        String ordinaryJs = "const message='[\\63 l/*x*/ass]';";
        assertFalse(LegacyUiStyleConverter.containsLegacyStyleCandidate(ordinaryJs));
        importArchive(manifestArchive("component.js", ordinaryJs.getBytes(StandardCharsets.UTF_8)));
        assertEquals(ordinaryJs, savedComponent());
    }

    @Test void preservesOrdinaryTextWithCommentSeparatedClassWordDuringImport() throws Exception {
        String component = "const message='class/* split */ text mentions lcp-button';";
        assertFalse(LegacyUiStyleConverter.containsLegacyStyleCandidate(component));
        importArchive(manifestArchive("component.js", component.getBytes(StandardCharsets.UTF_8)));
        assertEquals(component, savedComponent());
    }

    @Test void exportsAndImportsCurrentPlainAndEncryptedProjectArchives() throws Exception {
        for (boolean encrypted : List.of(false, true)) {
            ProjectDependencyParamDTO export = new ProjectDependencyParamDTO();
            export.setId(42L); export.setName("Example"); export.setProjectJson("{\"name\":\"Example\"}");
            if (encrypted) { export.setSecretMode("passphrase-v1"); export.setSecretPassphrase("test-passphrase"); }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            var body = helper.exportProject(export).getBody();
            assertNotNull(body);
            body.writeTo(output);
            byte[] archive = output.toByteArray();
            var manifest = archiveManifest(archive);
            assertEquals("datavisool-project", manifest.getString("format"));
            assertEquals(encrypted ? 4 : 2, manifest.getIntValue("formatVersion"));
            if (encrypted) {
                RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive, "wrong-passphrase"));
                assertTrue(error.getMessage().contains("口令"));
                verify(projects, times(1)).update(isNull(), any());
            }
            importArchive(archive, encrypted ? "test-passphrase" : null);
        }
        verify(projects, times(2)).update(isNull(), any());
    }

    @Test void exportsAndImportsSameNamedComponentAndDynamicScriptIndependently() throws Exception {
        Files.createDirectories(root.resolve("components"));
        Files.createDirectories(root.resolve("scripts"));
        byte[] component = OLD_COMPONENT.getBytes(StandardCharsets.UTF_8);
        byte[] script = "var syntheticLibrary = 123;".getBytes(StandardCharsets.UTF_8);
        Files.write(root.resolve("components/shared.js"), component);
        Files.write(root.resolve("scripts/shared.js"), script);
        RemoteComponentPO componentRow = new RemoteComponentPO();
        componentRow.setUrl("shared.js"); componentRow.setComponentName("Component");
        when(componentService.getRemoteComponents(any())).thenReturn(List.of(componentRow));
        DynamicScriptPO scriptRow = new DynamicScriptPO();
        scriptRow.setUrl("shared.js"); scriptRow.setName("Script"); scriptRow.setType(ScriptEnum.LOCAL); scriptRow.setProjectId(42L);
        when(scripts.selectList(any())).thenReturn(List.of(scriptRow));

        ProjectDependencyParamDTO export = new ProjectDependencyParamDTO();
        export.setId(42L); export.setName("Example"); export.setProjectJson("{}"); export.setComponents(List.of("shared.js"));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        var body = helper.exportProject(export).getBody(); assertNotNull(body); body.writeTo(output);
        byte[] archive = output.toByteArray();
        var assets = archiveManifest(archive).getJSONObject("assets");
        String componentBlob = assets.getJSONArray("components").getJSONObject(0).getString("blob");
        String scriptBlob = assets.getJSONArray("dynamicScripts").getJSONObject(0).getString("blob");
        assertNotEquals(componentBlob, scriptBlob);
        assertArrayEquals(component, zipEntry(archive, componentBlob));
        assertArrayEquals(script, zipEntry(archive, scriptBlob));

        importArchive(archive);
        assertConverted(savedComponent());
        var importedScript = ArgumentCaptor.forClass(DynamicScriptPO.class);
        verify(scripts).insert(importedScript.capture());
        assertArrayEquals(script, Files.readAllBytes(root.resolve("scripts").resolve(importedScript.getValue().getUrl())));
    }

    @Test void exportsAndReimportsImageReferencedByNestedStaticData() throws Exception {
        Files.createDirectories(root.resolve("images"));
        byte[] imageBytes = new byte[]{4, 5, 6};
        Files.write(root.resolve("images/source.png"), imageBytes);
        ImagePO source = new ImagePO(); source.setUrl("source.png"); source.setName("Example image");
        when(imageService.getImages(any())).thenReturn(List.of(source));
        String url = "/static/images/source.png?v=1";
        String project = JSON.toJSONString(Map.of("layerManager", Map.of("elemConfigs", Map.of("image",
                Map.of("base", Map.of("id", "image", "type", "BaseImage"), "data", Map.of("sourceType", "static",
                        "staticData", Map.of("value", Map.of("data", Map.of("url", url))), "value", url))))));
        ProjectDependencyParamDTO export = new ProjectDependencyParamDTO();
        export.setId(42L); export.setName("Example"); export.setProjectJson(project); export.setImages(List.of("source.png"));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        var body = helper.exportProject(export).getBody(); assertNotNull(body); body.writeTo(output);
        byte[] archive = output.toByteArray();
        String blob = archiveManifest(archive).getJSONObject("assets").getJSONArray("images").getJSONObject(0).getString("blob");
        assertArrayEquals(imageBytes, zipEntry(archive, blob));
        importArchive(archive);
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        String rewritten = "images/" + image.getValue().getUrl() + "?v=1";
        assertArrayEquals(imageBytes, Files.readAllBytes(root.resolve("images").resolve(image.getValue().getUrl())));
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("elemConfigs")).findFirst().orElseThrow();
        var data = JSON.parseObject(saved).getJSONObject("layerManager").getJSONObject("elemConfigs")
                .getJSONObject("image").getJSONObject("data");
        assertEquals(rewritten, data.getString("value"));
        assertEquals(rewritten, data.getJSONObject("staticData").getJSONObject("value").getJSONObject("data").getString("url"));
    }

    @Test void exportsAndImportsAFontReferencedByFamilyName() throws Exception {
        Files.createDirectories(root.resolve("fonts"));
        byte[] fontBytes = new byte[]{1, 2, 3, 4};
        Files.write(root.resolve("fonts/demo.woff2"), fontBytes);
        FontPO font = new FontPO(); font.setName("Demo Font"); font.setUrl("demo.woff2");
        when(fontService.getFontsByNames(List.of("Demo Font"))).thenReturn(List.of(font));
        String project = JSON.toJSONString(Map.of("layerManager", Map.of("elemConfigs", Map.of("text",
                Map.of("base", Map.of("type", "BaseText"), "style", Map.of("fontFamily", "\"Demo Font\", sans-serif"))))));
        ProjectDependencyParamDTO export = new ProjectDependencyParamDTO();
        export.setId(42L); export.setName("Example"); export.setProjectJson(project); export.setFonts(List.of("Demo Font"));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        var body = helper.exportProject(export).getBody(); assertNotNull(body); body.writeTo(output);
        byte[] archive = output.toByteArray();
        String blob = archiveManifest(archive).getJSONObject("assets").getJSONArray("fonts").getJSONObject(0).getString("blob");
        assertArrayEquals(fontBytes, zipEntry(archive, blob));
        importArchive(archive);
        verify(fontService, never()).createFont(any());
        assertArrayEquals(fontBytes, Files.readAllBytes(root.resolve("fonts/demo.woff2")));
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(1, files.count()); }
    }

    @Test void renamesConflictingImportedFontAndUpdatesProjectFontFamilies() throws Exception {
        Files.createDirectories(root.resolve("fonts"));
        Files.write(root.resolve("fonts/existing.woff2"), new byte[]{9});
        FontPO existing = new FontPO(); existing.setName("Demo Font"); existing.setUrl("existing.woff2");
        when(fontService.getFontsByNames(List.of("Demo Font"))).thenReturn(List.of(existing));
        String project = JSON.toJSONString(Map.of("layerManager", Map.of("elemConfigs", Map.of("text", Map.of(
                "base", Map.of("type", "BaseText"),
                "style", Map.of("fontFamily", "\"Demo Font\", sans-serif"),
                "data", Map.of("sourceType", "static", "staticData", Map.of("value", Map.of("fontFamily", "Demo Font"))))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("fonts", List.of(
                        Map.of("name", "Demo Font", "blob", "blobs/imported.woff2")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8), "blobs/imported.woff2", new byte[]{1, 2})));
        var font = ArgumentCaptor.forClass(FontPO.class);
        verify(fontService).createFont(font.capture());
        String alias = font.getValue().getName();
        assertTrue(alias.startsWith("DV_"));
        assertArrayEquals(new byte[]{9}, Files.readAllBytes(root.resolve("fonts/existing.woff2")));
        assertArrayEquals(new byte[]{1, 2}, Files.readAllBytes(root.resolve("fonts").resolve(font.getValue().getUrl())));
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("elemConfigs")).findFirst().orElseThrow();
        var text = JSON.parseObject(saved).getJSONObject("layerManager").getJSONObject("elemConfigs").getJSONObject("text");
        assertEquals("\"" + alias + "\", sans-serif", text.getJSONObject("style").getString("fontFamily"));
        assertEquals("Demo Font", text.getJSONObject("data").getJSONObject("staticData").getJSONObject("value").getString("fontFamily"));
    }

    @Test void rejectsDifferentFontsWithTheSameNameInsideOneArchive() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("fonts", List.of(
                        Map.of("name", "Demo Font", "blob", "blobs/a.woff2"),
                        Map.of("name", "Demo Font", "blob", "blobs/b.woff2")))));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                "manifest.json", manifest.getBytes(StandardCharsets.UTF_8), "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                "blobs/a.woff2", new byte[]{1}, "blobs/b.woff2", new byte[]{2}))));
        assertTrue(error.getMessage().contains("同名字体"));
        verify(projects, never()).update(isNull(), any());
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(0, files.count()); }
    }

    @Test void importsIdenticalSameNameFontsOnlyOnce() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("fonts", List.of(
                        Map.of("name", "Demo Font", "blob", "blobs/a.woff2"),
                        Map.of("name", "Demo Font", "blob", "blobs/b.woff2")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                "blobs/a.woff2", new byte[]{1}, "blobs/b.woff2", new byte[]{1})));
        verify(fontService, times(1)).createFont(any());
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(1, files.count()); }
    }

    @Test void failedFontRecordCreationDoesNotLeaveImportedFontFile() throws Exception {
        when(fontService.createFont(any(FontPO.class))).thenReturn(null);
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("fonts", List.of(
                        Map.of("name", "Demo Font", "blob", "blobs/a.woff2")))));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                "manifest.json", manifest.getBytes(StandardCharsets.UTF_8), "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                "blobs/a.woff2", new byte[]{1}))));
        assertTrue(error.getMessage().contains("导入字体记录失败"));
        verify(projects, never()).update(isNull(), any());
        try (var files = Files.list(root.resolve("fonts"))) { assertEquals(0, files.count()); }
    }

    @Test void renamesConflictingFontWhenImportingLegacyArchive() throws Exception {
        Files.createDirectories(root.resolve("fonts"));
        Files.write(root.resolve("fonts/existing.woff2"), new byte[]{9});
        FontPO existing = new FontPO(); existing.setName("Demo Font"); existing.setUrl("existing.woff2");
        when(fontService.getFontsByNames(List.of("Demo Font"))).thenReturn(List.of(existing));
        String project = JSON.toJSONString(Map.of("themeManager", List.of(Map.of("fontFamily", "Demo Font"))));
        byte[] dependencies = JSON.toJSONBytes(Map.of("projectJson", project,
                "fonts", List.of(Map.of("name", "Demo Font", "value", "old.woff2"))));
        importArchive(zip(Map.of("project.lc", dependencies, "fonts/old.woff2", new byte[]{1, 2})));
        var font = ArgumentCaptor.forClass(FontPO.class);
        verify(fontService).createFont(font.capture());
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("themeManager")).findFirst().orElseThrow();
        assertEquals(font.getValue().getName(), JSON.parseObject(saved).getJSONArray("themeManager")
                .getJSONObject(0).getString("fontFamily"));
        assertNotEquals("Demo Font", font.getValue().getName());
    }

    @Test void exportsAndImportsCurrentProjectGraph() throws Exception {
        doAnswer(invocation -> {
            ProjectPO subproject = invocation.getArgument(0);
            subproject.setId(99L);
            return 1;
        }).when(projects).insert(any(ProjectPO.class));
        ExportProjectNodeDTO entry = new ExportProjectNodeDTO();
        entry.setSourceProjectId("42"); entry.setName("Example"); entry.setIsEntry(true); entry.setProjectJson("{}");
        ExportProjectNodeDTO child = new ExportProjectNodeDTO();
        child.setSourceProjectId("43"); child.setSourcePid("42"); child.setName("Child"); child.setProjectJson("{}");
        ProjectDependencyParamDTO export = new ProjectDependencyParamDTO();
        export.setId(42L); export.setName("Example"); export.setProjectJson("{}"); export.setProjects(List.of(entry, child));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        var body = helper.exportProject(export).getBody();
        assertNotNull(body);
        body.writeTo(output);
        var manifest = archiveManifest(output.toByteArray());
        assertEquals("datavisool-project", manifest.getString("format"));
        assertEquals(3, manifest.getIntValue("formatVersion"));
        assertEquals(2, manifest.getJSONArray("projects").size());
        importArchive(output.toByteArray());
        verify(projects).insert(any(ProjectPO.class));
        verify(projects, times(3)).update(isNull(), any());
    }

    @Test void convertsComponentInsideNestedPackage() throws Exception {
        byte[] nested = zip(Map.of("index.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        importArchive(manifestArchive("component.zip", nested));
        assertConverted(savedComponent());
    }

    @Test void convertsComponentInLegacyArchiveWithoutManifest() throws Exception {
        byte[] legacy = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "components/component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        importArchive(legacy);
        assertConverted(savedComponent());
    }

    @Test void rejectsUnsupportedComponentInLegacyArchiveWithItsRecordedName() throws Exception {
        String data = "{\"projectJson\":\"{}\",\"components\":[{\"name\":\"旧销售图表\",\"value\":\"component.js\"}]}";
        byte[] legacy = zip(Map.of("project.lc", data.getBytes(StandardCharsets.UTF_8),
                "components/component.js", OLD_COMPONENT.replace("U.ObjectUtil.merge", "U.FetchUtil").getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(legacy));
        assertTrue(error.getMessage().contains("旧销售图表"));
        assertTrue(error.getMessage().contains("FetchUtil"));
        verify(projects, never()).update(isNull(), any());
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
    }

    @Test void legacyScanDoesNotDecompressUnusedArchiveEntries() throws Exception {
        byte[] archive = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "unrelated.bin", new byte[128 * 1024], "images/photo.png", new byte[]{1, 2, 3}));
        corruptDeflateStream(archive, "unrelated.bin");
        importArchive(archive);
        verify(projects).update(isNull(), any());
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        assertArrayEquals(new byte[]{1, 2, 3}, Files.readAllBytes(root.resolve("images").resolve(image.getValue().getUrl())));
    }

    @Test void legacyImportRejectsCorruptUsedAssetAndCleansUp() throws Exception {
        byte[] archive = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "images/photo.png", new byte[1024]));
        corruptDeflateStream(archive, "images/photo.png");
        assertThrows(RuntimeException.class, () -> importArchive(archive));
        verify(imageService, never()).createImage(any(ImagePO.class));
        verify(projects, never()).update(isNull(), any());
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void legacyImportChecksUsedAssetCrcBeforeCreatingRecord() throws Exception {
        byte[] archive = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "images/photo.png", new byte[]{1, 2, 3}));
        corruptCentralCrc(archive, "images/photo.png");
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("旧项目包文件校验失败"));
        verify(imageService, never()).createImage(any(ImagePO.class));
        verify(projects, never()).update(isNull(), any());
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void legacyArchiveDistinguishesImageAndComponentWithOverlappingNames() throws Exception {
        byte[] image = new byte[]{1, 2, 3, 4};
        byte[] legacy = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "images/widget.png", image,
                "misc/notimages/ignored.png", new byte[]{9},
                "components/widget.png.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        importArchive(legacy);
        assertConverted(savedComponent());
        var captured = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(captured.capture());
        assertArrayEquals(image, Files.readAllBytes(root.resolve("images").resolve(captured.getValue().getUrl())));
    }

    @Test void legacyArchiveUpdatesImageReferenceToImportedFile() throws Exception {
        String externalUrl = "https://cdn.example.test/static/images/widget.png";
        String protocolRelativeUrl = "//cdn.example.test/assets/widget.png";
        String project = JSON.toJSONString(Map.of("layers", List.of(
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", "/static/images/widget.png")),
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", externalUrl)),
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", protocolRelativeUrl)),
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", "http://asset.localhost/%2Fstatic%2Fimages%2Fwidget.png")))));
        String dependencies = JSON.toJSONString(Map.of("projectJson", project));
        byte[] legacy = zip(Map.of("project.lc", dependencies.getBytes(StandardCharsets.UTF_8),
                "images/widget.png", new byte[]{1, 2, 3}));
        importArchive(legacy);

        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String savedProject = wrapper.getParamNameValuePairs().values().stream()
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("BaseImage")).findFirst().orElseThrow();
        assertEquals("images/" + image.getValue().getUrl(), JSON.parseObject(savedProject)
                .getJSONArray("layers").getJSONObject(0).getJSONObject("style").getString("localUrl"));
        assertEquals(externalUrl, JSON.parseObject(savedProject)
                .getJSONArray("layers").getJSONObject(1).getJSONObject("style").getString("localUrl"));
        assertEquals(protocolRelativeUrl, JSON.parseObject(savedProject)
                .getJSONArray("layers").getJSONObject(2).getJSONObject("style").getString("localUrl"));
        assertEquals("images/" + image.getValue().getUrl(), JSON.parseObject(savedProject)
                .getJSONArray("layers").getJSONObject(3).getJSONObject("style").getString("localUrl"));
    }

    @Test void importsDesktopImageUrlsWithPlusSignsAndPreservesQueryAndFragment() throws Exception {
        String external = "https://example.test/static/images/chart+one.png?v=1#view";
        List<String> urls = List.of(
                "asset://localhost/%2Ftmp%2Fstatic%2Fimages%2Fchart+one.png?v=1#view",
                "http://asset.localhost/%2Ftmp%2Fstatic%2Fimages%2Fchart%2Bone.png?cache=2",
                "http://asset.localhost/%2Fanother%2Fstatic%2Fimages%2Fchart+one.png?raw=1",
                "/static/images/chart+one.png#preview",
                external,
                "asset://localhost/%2Ftmp%2Fstatic%2Fimages%2Fmissing.png?v=3");
        String project = JSON.toJSONString(Map.of("layers", urls.stream().map(url ->
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", url))).toList()));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "assets", Map.of("images", List.of(Map.of("blob", "blobs/chart+one.png", "original", urls.get(0))))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8),
                "blobs/chart+one.png", new byte[]{1, 2, 3})));
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        String target = "images/" + image.getValue().getUrl();
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream()
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("layers")).findFirst().orElseThrow();
        var layers = JSON.parseObject(saved).getJSONArray("layers");
        assertEquals(target + "?v=1#view", layers.getJSONObject(0).getJSONObject("style").getString("localUrl"));
        assertEquals(target + "?cache=2", layers.getJSONObject(1).getJSONObject("style").getString("localUrl"));
        assertEquals(target + "?raw=1", layers.getJSONObject(2).getJSONObject("style").getString("localUrl"));
        assertEquals(target + "#preview", layers.getJSONObject(3).getJSONObject("style").getString("localUrl"));
        assertEquals(external, layers.getJSONObject(4).getJSONObject("style").getString("localUrl"));
        assertEquals(urls.get(5), layers.getJSONObject(5).getJSONObject("style").getString("localUrl"));
    }

    @Test void importsDesktopVideoUrlUsingOriginalBlobName() throws Exception {
        String original = "asset://localhost/%2Fother%2Fstatic%2Fvideos%2Fclip%2Bone.mp4";
        String projectUrl = "http://asset.localhost/%2Ftmp%2Fstatic%2Fvideos%2Fclip+one.mp4?v=1#t=3";
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of("base", Map.of("type", "BaseVideo"),
                "style", Map.of("src", projectUrl)))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "assets", Map.of("videos", List.of(Map.of("blob", "blobs/clip+one.mp4", "original", original)))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8),
                "blobs/clip+one.mp4", new byte[]{1, 2, 3})));
        var video = ArgumentCaptor.forClass(VideoPO.class);
        verify(videos).insert(video.capture());
        String storedUrl = video.getValue().getUrl();
        assertArrayEquals(new byte[]{1, 2, 3}, Files.readAllBytes(root.resolve("videos").resolve(storedUrl)));
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream()
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("layers")).findFirst().orElseThrow();
        assertEquals("videos/" + storedUrl + "?v=1#t=3", JSON.parseObject(saved)
                .getJSONArray("layers").getJSONObject(0).getJSONObject("style").getString("src"));
    }

    @Test void rewritesVideoPostersAndReportsMissingLocalPosters() throws Exception {
        String local = "asset://localhost/%2Ftmp%2Fstatic%2Fimages%2Fposter.png?v=1";
        String external = "https://example.test/static/images/poster.png";
        String project = JSON.toJSONString(Map.of("layers", List.of(
                Map.of("base", Map.of("type", "BaseVideo", "id", "first"), "style", Map.of("poster", local)),
                Map.of("base", Map.of("type", "BaseVideo", "id", "second"), "style", Map.of("poster", external)),
                Map.of("base", Map.of("type", "BaseVideo", "id", "third"), "style", Map.of("poster", "/static/images/missing.png")))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("images", List.of(
                        Map.of("blob", "blobs/poster.png", "original", local)))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8), "blobs/poster.png", new byte[]{1, 2, 3})));
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("layers")).findFirst().orElseThrow();
        var layers = JSON.parseObject(saved).getJSONArray("layers");
        assertEquals("images/" + image.getValue().getUrl() + "?v=1", layers.getJSONObject(0).getJSONObject("style").getString("poster"));
        assertEquals(external, layers.getJSONObject(1).getJSONObject("style").getString("poster"));
        assertEquals("/static/images/missing.png", layers.getJSONObject(2).getJSONObject("style").getString("poster"));
        assertTrue(lastImportParam.getImportNotice().contains("BaseVideo（third）.style.poster"));
    }

    @Test void rewritesOnlyStaticImageDataSourcesThatReferToImportedImages() throws Exception {
        String local = "asset://localhost/%2Ftmp%2Fstatic%2Fimages%2Fdata.png";
        String external = "https://cdn.example.test/static/images/data.png";
        String blob = "blob:https://example.test/data.png";
        String project = JSON.toJSONString(Map.of("layers", List.of(
                Map.of("base", Map.of("type", "BaseImage"), "data", Map.of("sourceType", "static",
                        "value", local, "staticData", Map.of("value", local))),
                Map.of("base", Map.of("type", "BaseImage"), "data", Map.of("sourceType", "static",
                        "value", Map.of("data", Map.of("url", local), "note", local),
                        "staticData", Map.of("value", Map.of("data", Map.of("url", local), "note", local)))),
                Map.of("base", Map.of("type", "BaseImage"), "data", Map.of("sourceType", "api", "value", local)),
                Map.of("base", Map.of("type", "BaseImage"), "data", Map.of("sourceType", "static",
                        "value", external, "staticData", Map.of("value", blob))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("images", List.of(
                        Map.of("blob", "blobs/data.png", "original", "data.png")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8), "blobs/data.png", new byte[]{1, 2, 3})));
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        String target = "images/" + image.getValue().getUrl();
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("layers")).findFirst().orElseThrow();
        var layers = JSON.parseObject(saved).getJSONArray("layers");
        var first = layers.getJSONObject(0).getJSONObject("data");
        assertEquals(target, first.getString("value"));
        assertEquals(target, first.getJSONObject("staticData").getString("value"));
        var nested = layers.getJSONObject(1).getJSONObject("data");
        for (var value : List.of(nested.getJSONObject("value"), nested.getJSONObject("staticData").getJSONObject("value"))) {
            assertEquals(target, value.getJSONObject("data").getString("url"));
            assertEquals(local, value.getString("note"));
        }
        assertEquals(local, layers.getJSONObject(2).getJSONObject("data").getString("value"));
        assertEquals(external, layers.getJSONObject(3).getJSONObject("data").getString("value"));
        assertEquals(blob, layers.getJSONObject(3).getJSONObject("data").getJSONObject("staticData").getString("value"));
    }

    @Test void rewritesPackagedOnlineImageStyleButKeepsExternalAddress() throws Exception {
        String local = "static/images/online.png?v=1";
        String external = "https://example.test/static/images/online.png";
        String project = JSON.toJSONString(Map.of("layers", List.of(
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("type", "online", "onLineUrl", local)),
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("type", "online", "onLineUrl", external)))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("images", List.of(
                        Map.of("blob", "blobs/online.png", "original", "online.png")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8), "blobs/online.png", new byte[]{1, 2, 3})));
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("layers")).findFirst().orElseThrow();
        var layers = JSON.parseObject(saved).getJSONArray("layers");
        assertEquals("images/" + image.getValue().getUrl() + "?v=1", layers.getJSONObject(0).getJSONObject("style").getString("onLineUrl"));
        assertEquals(external, layers.getJSONObject(1).getJSONObject("style").getString("onLineUrl"));
    }

    @Test void reportsUnmappedLocalAssetsWithTheirComponentLocations() throws Exception {
        String project = JSON.toJSONString(Map.of("layers", List.of(
                Map.of("base", Map.of("type", "BaseImage", "name", "Logo"), "style", Map.of("localUrl", "/static/images/missing.png"),
                        "data", Map.of("sourceType", "static", "staticData", Map.of("value", Map.of("url", "file:///tmp/missing.png")))),
                Map.of("base", Map.of("type", "BaseVideo", "id", "video-1"), "style", Map.of("src", "asset://localhost/%2Fold%2Fstatic%2Fvideos%2Fmissing.mp4")),
                Map.of("base", Map.of("type", "ThreeModel", "id", "model-1"), "style", Map.of("source", Map.of("url", "models/old/scene.glb"))),
                Map.of("base", Map.of("type", "BaseImage", "name", "External"), "style", Map.of("localUrl", "https://example.test/image.png"),
                        "data", Map.of("sourceType", "static", "staticData", Map.of("value", "data:image/png;base64,AA=="))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json")));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8))));
        String notice = lastImportParam.getImportNotice();
        assertNotNull(notice);
        assertTrue(notice.contains("4 处本地资源"));
        assertTrue(notice.contains("BaseImage（Logo）.style.localUrl"));
        assertTrue(notice.contains("BaseImage（Logo）.data.staticData.value.url"));
        assertTrue(notice.contains("BaseVideo（video-1）.style.src"));
        assertTrue(notice.contains("ThreeModel（model-1）.style.source.url"));
        assertFalse(notice.contains("External"));
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("layers")).findFirst().orElseThrow();
        assertEquals("/static/images/missing.png", JSON.parseObject(saved).getJSONArray("layers").getJSONObject(0)
                .getJSONObject("style").getString("localUrl"));
    }

    @Test void reportsMissingAssetLocationsSeparatelyForEachImportedProject() throws Exception {
        doAnswer(invocation -> { ProjectPO child = invocation.getArgument(0); child.setId(99L); return 1; })
                .when(projects).insert(any(ProjectPO.class));
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of("base", Map.of("type", "BaseImage", "id", "logo"),
                "style", Map.of("localUrl", "/static/images/missing.png")))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 3,
                "projects", List.of(Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true),
                        Map.of("sourceProjectId", "2", "sourcePid", "1", "dataPath", "projects/two.json", "isEntry", false))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "projects/one.json", project.getBytes(StandardCharsets.UTF_8), "projects/two.json", project.getBytes(StandardCharsets.UTF_8))));
        String notice = lastImportParam.getImportNotice();
        assertNotNull(notice);
        assertTrue(notice.contains("2 处本地资源"));
        assertTrue(notice.contains("项目 42：BaseImage（logo）.style.localUrl"));
        assertTrue(notice.contains("项目 99：BaseImage（logo）.style.localUrl"));
    }

    @Test void legacyImagesWithSameFileNameUseTheirFullPaths() throws Exception {
        String project = JSON.toJSONString(Map.of("layers", List.of(
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", "/static/images/a/shared.png")),
                Map.of("base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", "/static/images/b/shared.png")))));
        importArchive(zip(Map.of("project.lc", JSON.toJSONBytes(Map.of("projectJson", project)),
                "images/a/shared.png", new byte[]{1}, "images/b/shared.png", new byte[]{2})));
        var images = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService, times(2)).createImage(images.capture());
        Map<Byte, String> byContent = new LinkedHashMap<>();
        for (ImagePO image : images.getAllValues()) {
            byte[] content = Files.readAllBytes(root.resolve("images").resolve(image.getUrl()));
            byContent.put(content[0], "images/" + image.getUrl());
        }
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("BaseImage")).findFirst().orElseThrow();
        var layers = JSON.parseObject(saved).getJSONArray("layers");
        assertEquals(byContent.get((byte) 1), layers.getJSONObject(0).getJSONObject("style").getString("localUrl"));
        assertEquals(byContent.get((byte) 2), layers.getJSONObject(1).getJSONObject("style").getString("localUrl"));
    }

    @Test void refusesAmbiguousImageFileNameAndCleansUpImportedFiles() throws Exception {
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of("base", Map.of("type", "BaseImage"),
                "style", Map.of("localUrl", "shared.png")))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("images", List.of(
                        Map.of("original", "images/a/shared.png", "blob", "blobs/a/shared.png"),
                        Map.of("original", "images/b/shared.png", "blob", "blobs/b/shared.png")))));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8),
                "blobs/a/shared.png", new byte[]{1}, "blobs/b/shared.png", new byte[]{2}))));
        assertTrue(error.getMessage().contains("多个同名文件"));
        verify(projects, never()).update(any(), any());
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void explicitImageReferenceTakesPriorityOverAnotherFilesSameName() throws Exception {
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of("base", Map.of("type", "BaseImage"),
                "style", Map.of("localUrl", "shared.png")))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("images", List.of(
                        Map.of("original", "shared.png", "blob", "blobs/a/shared.png"),
                        Map.of("original", "images/b/shared.png", "blob", "blobs/b/shared.png")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8),
                "blobs/a/shared.png", new byte[]{1}, "blobs/b/shared.png", new byte[]{2})));
        var images = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService, times(2)).createImage(images.capture());
        String expected = images.getAllValues().stream().filter(image -> {
            try { return Files.readAllBytes(root.resolve("images").resolve(image.getUrl()))[0] == 1; }
            catch (Exception e) { throw new RuntimeException(e); }
        }).findFirst().orElseThrow().getUrl();
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                .map(String.class::cast).filter(value -> value.contains("BaseImage")).findFirst().orElseThrow();
        assertEquals("images/" + expected, JSON.parseObject(saved).getJSONArray("layers").getJSONObject(0)
                .getJSONObject("style").getString("localUrl"));
    }

    @Test void legacyArchiveRejectsMissingOrInvalidProjectDataBeforeImportingAssets() throws Exception {
        for (String dependencies : List.of("{}", "{\"projectJson\":\"\"}", "{\"projectJson\":\"null\"}", "{\"projectJson\":\"[]\"}")) {
            byte[] legacy = zip(Map.of("project.lc", dependencies.getBytes(StandardCharsets.UTF_8),
                    "images/widget.png", new byte[]{1, 2, 3}));
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(legacy));
            assertTrue(error.getMessage().contains("项目数据"), dependencies + ": " + error.getMessage());
        }
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
        assertFalse(Files.exists(root.resolve("images")));
    }

    @Test void legacyArchiveRejectsMultipleProjectDataFilesBeforeImportingAssets() throws Exception {
        byte[] project = "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8);
        byte[] legacy = zip(Map.of("first.lc", project, "second.lc", project,
                "images/widget.png", new byte[]{1, 2, 3}));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(legacy));
        assertTrue(error.getMessage().contains("多个 .lc"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
        assertFalse(Files.exists(root.resolve("images")));
    }

    @Test void manifestArchiveRejectsEmptyOrInvalidProjectDataWithoutUpdatingProject() throws Exception {
        String manifest = "{\"format\":\"light-chaser-project\",\"formatVersion\":2,\"project\":{\"dataPath\":\"project/project.json\"},\"assets\":{\"images\":[{\"blob\":\"blobs/widget.png\"}]}}";
        for (String project : List.of("", "null", "[]")) {
            byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "project/project.json", project.getBytes(StandardCharsets.UTF_8), "blobs/widget.png", new byte[]{1, 2, 3}));
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
            assertTrue(error.getMessage().contains("项目数据"), project + ": " + error.getMessage());
        }
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
        assertFalse(Files.exists(root.resolve("images")));
    }

    @Test void importsBothLegacyCompressedProjectFormats() throws Exception {
        String encoded = ProjectDataCodecUtil.encode("{\"name\":\"压缩项目\"}");
        String compressed = encoded.substring("DVZ1:gzip:".length());
        String legacyText = "LCPZ1:gzip:" + compressed;
        String legacyEncoded = "LCPZ\u0001\u0001" + compressed;
        String manifest = "{\"format\":\"light-chaser-project\",\"formatVersion\":2,\"project\":{\"dataPath\":\"project/project.json\"}}";
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", legacyText.getBytes(StandardCharsets.UTF_8))));
        String dependencies = JSON.toJSONString(Map.of("projectJson", legacyEncoded));
        importArchive(zip(Map.of("project.lc", dependencies.getBytes(StandardCharsets.UTF_8))));
        var updates = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects, times(2)).update(isNull(), updates.capture());
        for (LambdaUpdateWrapper<?> update : updates.getAllValues()) {
            assertTrue(update.getParamNameValuePairs().values().stream().anyMatch(value ->
                    value instanceof String && ((String) value).contains("压缩项目")));
        }
    }

    @Test void importsCurrentCompressedProjectDataInBothPackageShapes() throws Exception {
        String encoded = ProjectDataCodecUtil.encode("{\"name\":\"新版压缩项目\"}");
        assertTrue(encoded.startsWith("DVZ1:gzip:"));
        String manifest = "{\"format\":\"datavisool-project\",\"formatVersion\":2,\"project\":{\"dataPath\":\"project/project.json\"}}";
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", encoded.getBytes(StandardCharsets.UTF_8))));
        importArchive(zip(Map.of("project.lc", JSON.toJSONBytes(Map.of("projectJson", encoded)))));
        var updates = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects, times(2)).update(isNull(), updates.capture());
        for (LambdaUpdateWrapper<?> update : updates.getAllValues()) {
            assertTrue(update.getParamNameValuePairs().values().stream().anyMatch(value ->
                    value instanceof String && ((String) value).contains("新版压缩项目")));
        }
    }

    @Test void rejectsInvalidOrUnsupportedCompressedProjectDataBeforeImportingAssets() throws Exception {
        String manifest = "{\"format\":\"light-chaser-project\",\"formatVersion\":2,\"project\":{\"dataPath\":\"project/project.json\"},\"assets\":{\"images\":[{\"blob\":\"blobs/widget.png\"}]}}";
        for (String data : List.of("LCPZ1:gzip:bad", "LCPZ2:gzip:abc", "LCPZ\u0002\u0001abc", "DVZ1:gzip:bad", "DVZ2:gzip:abc")) {
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                    "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "project/project.json", data.getBytes(StandardCharsets.UTF_8), "blobs/widget.png", new byte[]{1}))));
            assertTrue(error.getMessage().contains("项目数据"));
        }
        verifyNoInteractions(imageService, componentService);
        verify(projects, never()).update(any(), any());
    }

    @Test void projectGraphValidatesEveryProjectBeforeImportingAssetsOrCreatingSubprojects() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "light-chaser-project", "formatVersion", 3,
                "projects", List.of(
                        Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true),
                        Map.of("sourceProjectId", "2", "sourcePid", "1", "dataPath", "projects/two.json", "isEntry", false)),
                "assets", Map.of("components", List.of(Map.of("blob", "blobs/component.js")))));
        byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "projects/one.json", "{}".getBytes(StandardCharsets.UTF_8),
                "projects/two.json", "null".getBytes(StandardCharsets.UTF_8),
                "blobs/component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("项目数据"));
        verify(projects, never()).insert(any(ProjectPO.class));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
        assertFalse(Files.exists(root.resolve("components")));
    }

    @Test void projectGraphStillImportsValidProjectsAndComponents() throws Exception {
        doAnswer(invocation -> {
            ProjectPO subproject = invocation.getArgument(0);
            subproject.setId(99L);
            return 1;
        }).when(projects).insert(any(ProjectPO.class));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 3,
                "projects", List.of(
                        Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true),
                        Map.of("sourceProjectId", "2", "sourcePid", "1", "dataPath", "projects/two.json", "isEntry", false)),
                "assets", Map.of("components", List.of(Map.of("blob", "blobs/component.js")))));
        byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "projects/one.json", ProjectDataCodecUtil.encode(screenReferenceProject("root", "2")).getBytes(StandardCharsets.UTF_8),
                "projects/two.json", "{\"name\":\"child\"}".getBytes(StandardCharsets.UTF_8),
                "blobs/component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        importArchive(archive);
        verify(projects).insert(any(ProjectPO.class));
        var updates = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects, times(3)).update(isNull(), updates.capture());
        Map<String, String> references = new LinkedHashMap<>();
        updates.getAllValues().stream().map(value -> (LambdaUpdateWrapper<?>) value)
                .flatMap(value -> value.getParamNameValuePairs().values().stream())
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("ScreenReference")).map(JSON::parseObject)
                .forEach(project -> references.put(project.getString("name"), project.getJSONArray("layers")
                        .getJSONObject(0).getJSONObject("style").getString("screenId")));
        assertEquals(Map.of("root", "99"), references);
        assertConverted(savedComponent());
    }

    @Test void projectGraphRejectsCyclesBeforeWritingAnything() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 3,
                "projects", List.of(
                        Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true),
                        Map.of("sourceProjectId", "2", "sourcePid", "1", "dataPath", "projects/two.json")),
                "assets", Map.of("images", List.of(Map.of("blob", "blobs/widget.png")))));
        for (boolean selfReference : List.of(true, false)) {
            String first = screenReferenceProject("root", selfReference ? "1" : "2");
            String second = selfReference ? "{}" : screenReferenceProject("child", "1");
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                    "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "projects/one.json", first.getBytes(StandardCharsets.UTF_8),
                    "projects/two.json", second.getBytes(StandardCharsets.UTF_8), "blobs/widget.png", new byte[]{1}))));
            assertTrue(error.getMessage().contains("引用存在循环"));
        }
        verifyNoInteractions(imageService, componentService, commonApis, databases, scripts);
        verify(projects, never()).insert(any(ProjectPO.class));
        verify(projects, never()).update(any(), any());
    }

    @Test void clearsUnmappedScreenReferencesFromSingleProjectPackages() throws Exception {
        String project = screenReferenceProject("root", "old-project-id");
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("id", "old-project-id", "dataPath", "project/project.json")));
        for (boolean legacy : List.of(false, true)) {
            byte[] archive = legacy
                    ? zip(Map.of("project.lc", JSON.toJSONBytes(Map.of("projectJson", project))))
                    : zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                            "project/project.json", project.getBytes(StandardCharsets.UTF_8)));
            importArchive(archive);
            assertTrue(lastImportParam.getImportNotice().contains("1 处大屏引用"));
        }
        var updates = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects, times(2)).update(isNull(), updates.capture());
        for (LambdaUpdateWrapper<?> update : updates.getAllValues()) {
            String saved = update.getParamNameValuePairs().values().stream().filter(String.class::isInstance)
                    .map(String.class::cast).filter(value -> value.contains("ScreenReference")).findFirst().orElseThrow();
            assertEquals("", JSON.parseObject(saved).getJSONArray("layers").getJSONObject(0)
                    .getJSONObject("style").getString("screenId"));
        }
    }

    @Test void reportsBothMissingScreenAndDatasourceReferences() throws Exception {
        var project = JSON.parseObject(screenReferenceProject("root", "old-screen"));
        project.put("layerManager", Map.of("elemConfigs", Map.of("api", Map.of("data", Map.of(
                "sourceType", "commonApi", "commonApi", Map.of("commonApiId", "old-api"))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json")));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", JSON.toJSONBytes(project))));
        assertTrue(lastImportParam.getImportNotice().contains("1 处公共 API"));
        assertTrue(lastImportParam.getImportNotice().contains("1 处大屏引用"));
    }

    @Test void projectGraphRejectsMissingReferencedProjectBeforeImportingAssets() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 3,
                "projects", List.of(
                        Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true),
                        Map.of("sourceProjectId", "2", "sourcePid", "1", "dataPath", "projects/two.json", "isEntry", false)),
                "assets", Map.of("components", List.of(Map.of("blob", "blobs/component.js")))));
        byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "projects/one.json", screenReferenceProject("root", "404").getBytes(StandardCharsets.UTF_8),
                "projects/two.json", "{}".getBytes(StandardCharsets.UTF_8),
                "blobs/component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("项目引用缺失"));
        verify(projects, never()).insert(any(ProjectPO.class));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
        assertFalse(Files.exists(root.resolve("components")));
    }

    @Test void projectGraphRejectsScriptForUnknownProjectBeforeWritingAssets() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 3,
                "projects", List.of(Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true)),
                "assets", Map.of("images", List.of(Map.of("blob", "blobs/widget.png")),
                        "dynamicScripts", List.of(Map.of("type", "REMOTE", "scope", "PROJECT",
                                "ownerSourceProjectId", "404", "url", "https://example.invalid/script.js")))));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "projects/one.json", "{}".getBytes(StandardCharsets.UTF_8), "blobs/widget.png", new byte[]{1}))));
        assertTrue(error.getMessage().contains("项目脚本所属项目不存在"));
        verifyNoInteractions(scripts, imageService, componentService, commonApis, databases);
        verify(projects, never()).insert(any(ProjectPO.class));
        verify(projects, never()).update(any(), any());
    }

    @Test void projectGraphAssignsScriptsToMappedProjectOrGlobalScope() throws Exception {
        doAnswer(invocation -> { ProjectPO child = invocation.getArgument(0); child.setId(99L); return 1; })
                .when(projects).insert(any(ProjectPO.class));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 3,
                "projects", List.of(
                        Map.of("sourceProjectId", "1", "dataPath", "projects/one.json", "isEntry", true),
                        Map.of("sourceProjectId", "2", "sourcePid", "1", "dataPath", "projects/two.json")),
                "assets", Map.of("dynamicScripts", List.of(
                        Map.of("name", "root", "type", "REMOTE", "scope", "PROJECT", "ownerSourceProjectId", "1", "url", "https://example.invalid/root.js"),
                        Map.of("name", "child", "type", "REMOTE", "scope", "PROJECT", "ownerSourceProjectId", "2", "url", "https://example.invalid/child.js"),
                        Map.of("name", "legacy", "type", "REMOTE", "scope", "PROJECT", "url", "https://example.invalid/legacy.js"),
                        Map.of("name", "global", "type", "REMOTE", "scope", "GLOBAL", "url", "https://example.invalid/global.js")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "projects/one.json", "{}".getBytes(StandardCharsets.UTF_8),
                "projects/two.json", "{}".getBytes(StandardCharsets.UTF_8))));
        var inserted = ArgumentCaptor.forClass(DynamicScriptPO.class);
        verify(scripts, times(4)).insert(inserted.capture());
        Map<String, Long> owners = new LinkedHashMap<>();
        for (DynamicScriptPO script : inserted.getAllValues()) owners.put(script.getName(), script.getProjectId());
        assertEquals(42L, owners.get("root")); assertEquals(99L, owners.get("child"));
        assertEquals(42L, owners.get("legacy")); assertTrue(owners.containsKey("global")); assertNull(owners.get("global"));
    }

    @Test void rejectsUnknownScriptScopeBeforeImportingAssets() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of(
                        "images", List.of(Map.of("blob", "blobs/widget.png")),
                        "dynamicScripts", List.of(Map.of("type", "REMOTE", "scope", "PROJCET", "url", "https://example.invalid/script.js")))));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8), "blobs/widget.png", new byte[]{1}))));
        assertTrue(error.getMessage().contains("不支持的脚本作用范围"));
        verifyNoInteractions(scripts, imageService, componentService, commonApis, databases);
        verify(projects, never()).update(any(), any());
    }

    @Test void importsDesktopPostgresqlAndRemapsDatasourceReferences() throws Exception {
        doAnswer(invocation -> { CommonApiPO api = invocation.getArgument(0); api.setId(101L); return 1; })
                .when(commonApis).insert(any(CommonApiPO.class));
        doAnswer(invocation -> { CommonDatabasePO database = invocation.getArgument(0); database.setId(202L); return 1; })
                .when(databases).insert(any(CommonDatabasePO.class));
        String project = JSON.toJSONString(Map.of("layerManager", Map.of("elemConfigs", Map.of(
                "api", Map.of("data", Map.of("sourceType", "commonApi", "commonApi", Map.of("commonApiId", "old-api", "refKey", "api-key"))),
                "db", Map.of("data", Map.of("sourceType", "database", "database", Map.of("targetDb", "old-db", "refKey", "db-key")))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "commonDatasource", Map.of(
                        "commonApis", List.of(Map.of("originId", "old-api", "refKey", "api-key", "name", "API", "url", "https://example.test", "method", "GET")),
                        "databases", List.of(Map.of("originId", "old-db", "refKey", "db-key", "name", "Database", "type", "PostgreSQL")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8))));

        var database = ArgumentCaptor.forClass(CommonDatabasePO.class);
        verify(databases).insert(database.capture());
        assertEquals(DataBaseEnum.PostgresSQL, database.getValue().getType());
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream()
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("elemConfigs")).findFirst().orElseThrow();
        var elements = JSON.parseObject(saved).getJSONObject("layerManager").getJSONObject("elemConfigs");
        assertEquals("101", elements.getJSONObject("api").getJSONObject("data").getJSONObject("commonApi").getString("commonApiId"));
        assertEquals("202", elements.getJSONObject("db").getJSONObject("data").getJSONObject("database").getString("targetDb"));
        assertNull(lastImportParam.getImportNotice());
    }

    @Test void repairsKnownLegacyChartTypesOnlyWhenLayerConfirmsTheCorrectType() throws Exception {
        String project = JSON.toJSONString(Map.of("layerManager", Map.of(
                "layerConfigs", Map.of(
                        "rose", Map.of("type", "AntdGroupRose"),
                        "cloud", Map.of("type", "AntdWordCloud"),
                        "other", Map.of("type", "AntdBaseRose"),
                        "custom", Map.of("type", "CustomWidget")),
                "elemConfigs", Map.of(
                        "rose", Map.of("base", Map.of("type", "AntdBaseRose", "name", "我的玫瑰图")),
                        "cloud", Map.of("base", Map.of("type", "AntdBaseWordCloud")),
                        "other", Map.of("base", Map.of("type", "AntdBaseRose")),
                        "custom", Map.of("base", Map.of("type", "AntdBaseWordCloud")),
                        "orphan", Map.of("base", Map.of("type", "AntdBaseWordCloud"))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json")));
        for (boolean legacy : List.of(false, true)) {
            clearInvocations(projects);
            byte[] archive = legacy
                    ? zip(Map.of("project.lc", JSON.toJSONBytes(Map.of("projectJson", project))))
                    : zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                            "project/project.json", project.getBytes(StandardCharsets.UTF_8)));
            importArchive(archive);
            var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
            verify(projects).update(isNull(), update.capture());
            LambdaUpdateWrapper<?> wrapper = update.getValue();
            String saved = wrapper.getParamNameValuePairs().values().stream()
                    .filter(String.class::isInstance).map(String.class::cast)
                    .filter(value -> value.contains("elemConfigs")).findFirst().orElseThrow();
            var elements = JSON.parseObject(saved).getJSONObject("layerManager").getJSONObject("elemConfigs");
            assertEquals("AntdGroupRose", elements.getJSONObject("rose").getJSONObject("base").getString("type"));
            assertEquals("我的玫瑰图", elements.getJSONObject("rose").getJSONObject("base").getString("name"));
            assertEquals("AntdWordCloud", elements.getJSONObject("cloud").getJSONObject("base").getString("type"));
            assertEquals("AntdBaseRose", elements.getJSONObject("other").getJSONObject("base").getString("type"));
            assertEquals("AntdBaseWordCloud", elements.getJSONObject("custom").getJSONObject("base").getString("type"));
            assertEquals("AntdBaseWordCloud", elements.getJSONObject("orphan").getJSONObject("base").getString("type"));
        }
    }

    @Test void convertsLegacyDataGapAndTableOptionsWithoutChangingUserValues() throws Exception {
        String project = """
                {"layerManager":{"elemConfigs":{
                  "loop":{"base":{"type":"LoopContainer"},"style":{"gap":12,"horizontalGap":3},
                    "data":{"sourceType":"static","staticData":[1,2]}},
                  "table":{"base":{"type":"LcBaseTable"},"style":{"body":{
                    "autoScroll":"true","speed":"5","pauseSeconds":"0.3"}}},
                  "current":{"base":{"type":"LcBaseTable"},"style":{"body":{
                    "enableCarousel":false,"autoScroll":true,"carouselSpeed":8,"speed":"5"}}},
                  "payload":{"data":{"sourceType":"static","staticData":{"value":{
                    "sourceType":"static","staticData":[9],"base":{"type":"LoopContainer"},"style":{"gap":7}}}}}
                }}}
                """;
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json")));
        for (boolean legacy : List.of(false, true)) {
            clearInvocations(projects);
            byte[] archive = legacy
                    ? zip(Map.of("project.lc", JSON.toJSONBytes(Map.of("projectJson", project))))
                    : zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                            "project/project.json", project.getBytes(StandardCharsets.UTF_8)));
            importArchive(archive);
            var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
            verify(projects).update(isNull(), update.capture());
            LambdaUpdateWrapper<?> wrapper = update.getValue();
            String saved = wrapper.getParamNameValuePairs().values().stream()
                    .filter(String.class::isInstance).map(String.class::cast)
                    .filter(value -> value.contains("elemConfigs")).findFirst().orElseThrow();
            var elements = JSON.parseObject(saved).getJSONObject("layerManager").getJSONObject("elemConfigs");
            var loop = elements.getJSONObject("loop");
            assertEquals(3, loop.getJSONObject("style").getIntValue("horizontalGap"));
            assertEquals(12, loop.getJSONObject("style").getIntValue("verticalGap"), loop.toJSONString());
            assertFalse(loop.getJSONObject("style").containsKey("gap"));
            assertEquals(List.of(1, 2), loop.getJSONObject("data").getJSONObject("staticData").getJSONArray("value"));
            var table = elements.getJSONObject("table").getJSONObject("style").getJSONObject("body");
            assertTrue(table.getBooleanValue("enableCarousel"));
            assertEquals(5, table.getIntValue("carouselSpeed"));
            assertEquals(0.3, table.getDoubleValue("carouselPauseSeconds"));
            assertFalse(table.containsKey("autoScroll"));
            assertFalse(table.containsKey("speed"));
            var current = elements.getJSONObject("current").getJSONObject("style").getJSONObject("body");
            assertFalse(current.getBooleanValue("enableCarousel"));
            assertEquals(8, current.getIntValue("carouselSpeed"));
            var dataValue = elements.getJSONObject("payload").getJSONObject("data").getJSONObject("staticData").getJSONObject("value");
            assertEquals(List.of(9), dataValue.getJSONArray("staticData"));
            assertEquals(7, dataValue.getJSONObject("style").getIntValue("gap"));
            assertFalse(dataValue.getJSONObject("style").containsKey("horizontalGap"));
        }
    }

    @Test void clearsUnmappedDatasourceReferencesAndReportsThemForLegacyAndManifestPackages() throws Exception {
        String project = JSON.toJSONString(Map.of("layerManager", Map.of("elemConfigs", Map.of(
                "api", Map.of("data", Map.of("sourceType", "commonApi", "commonApi", Map.of("commonApiId", "42", "refKey", "missing-api"))),
                "db", Map.of("data", Map.of("sourceType", "database", "database", Map.of("targetDb", "42", "refKey", "missing-db")))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json")));
        for (boolean legacy : List.of(false, true)) {
            byte[] archive = legacy
                    ? zip(Map.of("project.lc", JSON.toJSONBytes(Map.of("projectJson", project))))
                    : zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                            "project/project.json", project.getBytes(StandardCharsets.UTF_8)));
            importArchive(archive);
            assertTrue(lastImportParam.getImportNotice().contains("1 处公共 API 和 1 处数据库"));
        }
        var updates = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects, times(2)).update(isNull(), updates.capture());
        for (LambdaUpdateWrapper<?> update : updates.getAllValues()) {
            String saved = update.getParamNameValuePairs().values().stream()
                    .filter(String.class::isInstance).map(String.class::cast)
                    .filter(value -> value.contains("elemConfigs")).findFirst().orElseThrow();
            var configs = JSON.parseObject(saved).getJSONObject("layerManager").getJSONObject("elemConfigs");
            var api = configs.getJSONObject("api").getJSONObject("data").getJSONObject("commonApi");
            var db = configs.getJSONObject("db").getJSONObject("data").getJSONObject("database");
            assertEquals("", api.getString("commonApiId")); assertFalse(api.containsKey("refKey"));
            assertEquals("", db.getString("targetDb")); assertFalse(db.containsKey("refKey"));
        }
    }

    @Test void clearsUnmappedGlobalVariableAndGisReferences() throws Exception {
        Map<String, Object> api = Map.of("sourceType", "commonApi", "commonApi", Map.of("refKey", "missing-api"));
        Map<String, Object> db = Map.of("sourceType", "database", "database", Map.of("targetDb", "123"));
        String project = JSON.toJSONString(Map.of(
                "globalVariableManager", Map.of("globalVariables", Map.of("var", Map.of("triggerSource", api))),
                "layerManager", Map.of("elemConfigs", Map.of("map", Map.of("sources", List.of(
                        Map.of("sourceType", "geojson", "dataMode", "dataConfig", "dataConfig", db)))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json")));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8))));
        assertTrue(lastImportParam.getImportNotice().contains("1 处公共 API 和 1 处数据库"));
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String saved = wrapper.getParamNameValuePairs().values().stream()
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("globalVariableManager")).findFirst().orElseThrow();
        var data = JSON.parseObject(saved);
        var trigger = data.getJSONObject("globalVariableManager").getJSONObject("globalVariables")
                .getJSONObject("var").getJSONObject("triggerSource").getJSONObject("commonApi");
        var config = data.getJSONObject("layerManager").getJSONObject("elemConfigs").getJSONObject("map")
                .getJSONArray("sources").getJSONObject(0).getJSONObject("dataConfig").getJSONObject("database");
        assertEquals("", trigger.getString("commonApiId")); assertFalse(trigger.containsKey("refKey"));
        assertEquals("", config.getString("targetDb"));
    }

    @Test void rejectsConflictingDatasourceIdentifiersBeforeAnyDatasourceIsImported() throws Exception {
        for (String type : List.of("commonApis", "databases")) {
            for (boolean duplicateOrigin : List.of(true, false)) {
                Object first = Map.of("originId", "old-1", "refKey", "key-1", "name", "first");
                Object second = duplicateOrigin
                        ? Map.of("originId", "old-1", "refKey", "key-2", "name", "second")
                        : Map.of("originId", "old-2", "refKey", "key-1", "name", "second");
                Map<String, Object> definitions = new LinkedHashMap<>();
                if ("databases".equals(type)) definitions.put("commonApis", List.of(Map.of("originId", "api-1")));
                definitions.put(type, List.of(first, second));
                String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                        "project", Map.of("dataPath", "project/project.json"), "commonDatasource", definitions));
                RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                        "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                        "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)))));
                assertTrue(error.getMessage().contains("存在冲突"));
            }
        }
        verifyNoInteractions(commonApis, databases, imageService, componentService);
        verify(projects, never()).update(any(), any());
    }

    @Test void identicalDuplicateDatasourceDefinitionIsImportedOnce() throws Exception {
        doAnswer(invocation -> { CommonApiPO api = invocation.getArgument(0); api.setId(101L); return 1; })
                .when(commonApis).insert(any(CommonApiPO.class));
        Object definition = Map.of("originId", "old-1", "refKey", "key-1", "url", "https://example.invalid");
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "commonDatasource", Map.of("commonApis", List.of(definition, definition))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8))));
        verify(commonApis, times(1)).insert(any(CommonApiPO.class));
        verify(projects).update(isNull(), any());
    }

    @Test void normalizesSupportedImportedDatabaseTypeNames() throws Exception {
        doAnswer(invocation -> { CommonDatabasePO database = invocation.getArgument(0); database.setId(202L); return 1; })
                .when(databases).insert(any(CommonDatabasePO.class));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "commonDatasource", Map.of("databases", List.of(
                        Map.of("originId", "1", "type", "mysql"),
                        Map.of("originId", "2", "type", " postgresql "),
                        Map.of("originId", "3", "type", "POSTGRESSQL"),
                        Map.of("originId", "4", "type", "sqlserver"),
                        Map.of("originId", "5", "type", "oracle"),
                        Map.of("originId", "6", "type", "mssql")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8))));
        var captured = ArgumentCaptor.forClass(CommonDatabasePO.class);
        verify(databases, times(6)).insert(captured.capture());
        assertEquals(List.of(DataBaseEnum.MySQL, DataBaseEnum.PostgresSQL, DataBaseEnum.PostgresSQL,
                        DataBaseEnum.SQLServer, DataBaseEnum.ORACLE, DataBaseEnum.SQLServer),
                captured.getAllValues().stream().map(CommonDatabasePO::getType).toList());
    }

    @Test void rejectsUnsupportedImportedDatabaseType() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "commonDatasource", Map.of("databases", List.of(Map.of("originId", "1", "type", "SQLite")))));
        byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("不支持的数据库类型: SQLite"));
        verify(databases, never()).insert(any(CommonDatabasePO.class));
        verify(projects, never()).update(any(), any());
    }

    private static String screenReferenceProject(String name, String screenId) {
        return JSON.toJSONString(Map.of("name", name, "layers", List.of(Map.of(
                "base", Map.of("type", "ScreenReference"), "style", Map.of("screenId", screenId)))));
    }

    @Test void importsDesktopWriterV2SyntheticArchive() throws Exception {
        verifyDesktopWriterImport(2);
    }

    @Test void importsDesktopWriterV3SyntheticArchive() throws Exception {
        verifyDesktopWriterImport(3);
    }

    @Test void rejectsChangedProjectContentBeforeImportingAnyResources() throws Exception {
        byte[] archive = desktopWriterFixture(2);
        byte[] project = zipEntry(archive, "project/project.json");
        byte[] changed = new String(project, StandardCharsets.UTF_8).replace("BaseImage", "FakeImage").getBytes(StandardCharsets.UTF_8);
        assertEquals(project.length, changed.length);
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(replaceZipEntry(archive, "project/project.json", changed)));
        assertTrue(error.getMessage().contains("哈希校验失败"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
        assertFalse(Files.exists(root.resolve("images")));
        assertFalse(Files.exists(root.resolve("components")));
    }

    @Test void rejectsIncorrectDeclaredFileSizeBeforeImportingAnyResources() throws Exception {
        byte[] archive = desktopWriterFixture(2);
        var manifest = archiveManifest(archive);
        var file = manifest.getJSONArray("files").getJSONObject(0);
        file.put("size", file.getLongValue("size") + 1);
        byte[] changed = JSON.toJSONBytes(manifest);
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(replaceZipEntry(archive, "manifest.json", changed)));
        assertTrue(error.getMessage().contains("大小校验失败"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
    }

    @Test void rejectsMissingListedFileBeforeImportingAnyResources() throws Exception {
        byte[] archive = desktopWriterFixture(2);
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(replaceZipEntry(archive, "blobs/widget.png", null)));
        assertTrue(error.getMessage().contains("缺少文件"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
    }

    @Test void rejectsDuplicateArchivePathsInLegacyAndManifestPackages() throws Exception {
        byte[] duplicate = zip(Map.of("same--file", new byte[]{1}, "other-file", new byte[]{2},
                "project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8)));
        byte[] from = "other-file".getBytes(StandardCharsets.UTF_8);
        byte[] to = "same--file".getBytes(StandardCharsets.UTF_8);
        int replacements = 0;
        for (int i = 0; i <= duplicate.length - from.length; i++) {
            if (java.util.Arrays.equals(duplicate, i, i + from.length, from, 0, from.length)) {
                System.arraycopy(to, 0, duplicate, i, to.length);
                replacements++;
            }
        }
        assertEquals(2, replacements); // Local header and central directory.
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(duplicate));
        assertTrue(error.getMessage().contains("重复路径"));

        byte[] aliases = zip(Map.of("manifest.json", "{}".getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                "/project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
        error = assertThrows(RuntimeException.class, () -> importArchive(aliases));
        assertTrue(error.getMessage().contains("重复路径"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
    }

    @Test void rejectsDuplicatePathsInDecryptedPackage() throws Exception {
        byte[] inner = zip(Map.of("manifest.json", "{}".getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                "/project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
        Path innerFile = root.resolve("inner.zip"), encrypted = root.resolve("payload.enc");
        Files.write(innerFile, inner);
        ManifestSecretCodecUtil.encryptFileToEnvelopeJsonWithPassphraseV1(innerFile, encrypted, "test-passphrase");
        byte[] payload = Files.readAllBytes(encrypted);
        byte[] manifest = JSON.toJSONBytes(ProjectArchiveCompatHelper.buildEncryptedPackageManifest(
                "payload.enc", payload, 0L, "test"));
        byte[] archive = zip(Map.of("manifest.json", manifest, "payload.enc", payload));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive, "test-passphrase"));
        assertTrue(error.getMessage().contains("重复路径"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService);
    }

    @Test void rejectsMissingReferencedAssetBeforeImportingAnyResources() throws Exception {
        for (String type : List.of("images", "fonts", "videos", "dynamicScripts", "models")) {
            Object missing = "models".equals(type)
                    ? Map.of("files", List.of(Map.of("path", "model.glb", "blob", "blobs/missing.glb")))
                    : Map.of("blob", "blobs/missing.glb");
            String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                    "project", Map.of("dataPath", "project/project.json"),
                    "assets", Map.of("components", List.of(Map.of("blob", "blobs/component.js")),
                            type, List.of(missing))));
            byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                    "blobs/component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
            assertTrue(error.getMessage().contains("缺少文件"), type);
        }
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, componentService, commonApis, databases);
        assertFalse(Files.exists(root.resolve("components")));
    }

    @Test void remoteScriptDoesNotRequireBlobInArchive() throws Exception {
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("dynamicScripts",
                        List.of(Map.of("type", "REMOTE", "url", "https://example.invalid/script.js", "blob", "blobs/not-local.js")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8))));
        verify(projects).update(any(), any());
    }

    @Test void rejectsMissingResourcePathsAndEmptyEntriesBeforeImporting() throws Exception {
        for (String type : List.of("images", "fonts", "videos", "components", "dynamicScripts")) {
            for (Object item : List.of(Map.of("name", "missing"), Map.of("blob", "  "))) {
                String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                        "project", Map.of("dataPath", "project/project.json"), "assets", Map.of(type, List.of(item))));
                byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                        "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
                RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
                assertTrue(error.getMessage().contains("缺少文件路径"), type);
                assertTrue(error.getMessage().contains("assets." + type + "[0]"), type);
            }
        }
        for (String type : List.of("images", "fonts", "videos", "components", "dynamicScripts", "models")) {
            String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                    "project", Map.of("dataPath", "project/project.json"),
                    "assets", Map.of(type, java.util.Collections.singletonList(null))));
            byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
            assertTrue(error.getMessage().contains("条目为空"), type);
            assertTrue(error.getMessage().contains("assets." + type + "[0]"), type);
        }
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("dynamicScripts",
                        List.of(Map.of("type", "REMOTE", "url", " ")))));
        byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("远程脚本缺少地址"));
        verify(projects, never()).update(any(), any());
        verifyNoInteractions(imageService, fontService, componentService, commonApis, databases);
    }

    @Test void rejectsModelMissingEntryOrWithDuplicateTargetBeforeImportingOtherAssets() throws Exception {
        for (boolean duplicate : List.of(false, true)) {
            List<?> files = duplicate
                    ? List.of(Map.of("path", "scene.glb", "blob", "models/a.glb"),
                            Map.of("path", "./scene.glb", "blob", "models/b.glb"))
                    : List.of(Map.of("path", "other.glb", "blob", "models/a.glb"));
            String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                    "project", Map.of("dataPath", "project/project.json"), "assets", Map.of(
                            "components", List.of(Map.of("blob", "blobs/component.js")),
                            "models", List.of(Map.of("packageId", "old", "entry", "scene.glb", "files", files)))));
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(zip(Map.of(
                    "manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "project/project.json", "{}".getBytes(StandardCharsets.UTF_8),
                    "blobs/component.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8),
                    "models/a.glb", new byte[]{1}, "models/b.glb", new byte[]{2}))));
            assertTrue(error.getMessage().contains(duplicate ? "模型文件路径重复" : "模型入口文件不在文件清单"));
        }
        verifyNoInteractions(models, imageService, componentService);
        verify(projects, never()).update(any(), any());
        assertFalse(Files.exists(root.resolve("components")));
    }

    @Test void importsModelFileAndRewritesProjectReference() throws Exception {
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of("base", Map.of("type", "ThreeModel"),
                "style", Map.of("source", Map.of("url", "old/scene.glb"))))));
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "assets", Map.of("models", List.of(
                        Map.of("packageId", "old", "entry", "scene.glb", "original", "old/scene.glb",
                                "files", List.of(Map.of("path", "scene.glb", "blob", "models/scene.glb")))))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8), "models/scene.glb", new byte[]{1, 2})));
        var model = ArgumentCaptor.forClass(ThreeDModelPO.class);
        verify(models).insert(model.capture());
        String storedUrl = model.getValue().getUrl();
        assertArrayEquals(new byte[]{1, 2}, Files.readAllBytes(root.resolve("models").resolve(storedUrl)));
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        assertTrue(update.getValue().getParamNameValuePairs().values().stream()
                .anyMatch(value -> value instanceof String && ((String) value).contains(storedUrl)));
    }

    private void verifyDesktopWriterImport(int version) throws Exception {
        doAnswer(invocation -> {
            ProjectPO node = invocation.getArgument(0);
            node.setId(99L);
            return 1;
        }).when(projects).insert(any(ProjectPO.class));
        importArchive(desktopWriterFixture(version));
        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        assertArrayEquals("synthetic-image".getBytes(StandardCharsets.UTF_8),
                Files.readAllBytes(root.resolve("images").resolve(image.getValue().getUrl())));
        assertTrue(savedComponent().contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
        var updates = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects, times(version == 2 ? 1 : 3)).update(isNull(), updates.capture());
        String project = updates.getAllValues().stream().map(value -> (LambdaUpdateWrapper<?>) value)
                .flatMap(value -> value.getParamNameValuePairs().values().stream())
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("BaseImage")).findFirst().orElseThrow();
        assertEquals("images/" + image.getValue().getUrl(), JSON.parseObject(project)
                .getJSONArray("layers").getJSONObject(0).getJSONObject("style").getString("localUrl"));
        if (version == 3) verify(projects).insert(any(ProjectPO.class));
    }

    private byte[] desktopWriterFixture(int version) throws Exception {
        try (var input = getClass().getResourceAsStream("/fixtures/desktop-writer-v" + version + ".zip")) {
            assertNotNull(input);
            return input.readAllBytes();
        }
    }

    private static byte[] zipEntry(byte[] archive, String path) throws Exception {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                if (path.equals(entry.getName())) return zip.readAllBytes();
            }
        }
        throw new IllegalArgumentException("missing fixture entry " + path);
    }

    private static byte[] replaceZipEntry(byte[] archive, String path, byte[] replacement) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        boolean found = false;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                byte[] content = zip.readAllBytes();
                if (path.equals(entry.getName())) {
                    found = true;
                    if (replacement != null) entries.put(entry.getName(), replacement);
                } else entries.put(entry.getName(), content);
            }
        }
        assertTrue(found);
        return zip(entries);
    }

    @Test void manifestRewritesAnExplicitlyMappedExternalAsset() throws Exception {
        String original = "https://cdn.example.test/assets/widget.png";
        String project = JSON.toJSONString(Map.of("layers", List.of(Map.of(
                "base", Map.of("type", "BaseImage"), "style", Map.of("localUrl", original)))));
        String manifest = JSON.toJSONString(Map.of("format", "light-chaser-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"),
                "assets", Map.of("images", List.of(Map.of("original", original, "blob", "blobs/widget.png")))));
        importArchive(zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", project.getBytes(StandardCharsets.UTF_8), "blobs/widget.png", new byte[]{1, 2, 3})));

        var image = ArgumentCaptor.forClass(ImagePO.class);
        verify(imageService).createImage(image.capture());
        var update = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(projects).update(isNull(), update.capture());
        LambdaUpdateWrapper<?> wrapper = update.getValue();
        String savedProject = wrapper.getParamNameValuePairs().values().stream()
                .filter(String.class::isInstance).map(String.class::cast)
                .filter(value -> value.contains("BaseImage")).findFirst().orElseThrow();
        assertEquals("images/" + image.getValue().getUrl(), JSON.parseObject(savedProject)
                .getJSONArray("layers").getJSONObject(0).getJSONObject("style").getString("localUrl"));
    }

    @Test void rejectsUnsupportedComponentAndCleansImportedFile() throws Exception {
        String unsafe = OLD_COMPONENT.replace("U.ObjectUtil.merge", "U.FetchUtil");
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(manifestArchive("component.js", unsafe.getBytes(StandardCharsets.UTF_8))));
        assertTrue(error.getMessage().contains("FetchUtil"));
        assertTrue(error.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
    }

    @Test void failedImageRecordCreationCleansFileAndRejectsImport() throws Exception {
        when(imageService.createImage(any(ImagePO.class))).thenReturn(null);
        byte[] archive = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "images/image.png", new byte[]{1}));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("导入图片记录失败"));
        verify(projects, never()).update(isNull(), any());
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void failedComponentRecordCreationCleansFileOrPackageAndRejectsImport() throws Exception {
        when(componentService.createRemoteComponent(any(RemoteComponentPO.class))).thenReturn(null);
        for (boolean nested : List.of(false, true)) {
            byte[] component = nested ? zip(Map.of("index.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)))
                    : OLD_COMPONENT.getBytes(StandardCharsets.UTF_8);
            RuntimeException error = assertThrows(RuntimeException.class,
                    () -> importArchive(manifestArchive(nested ? "component.zip" : "component.js", component)));
            assertTrue(error.getMessage().contains("导入组件记录失败"));
            try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
        }
        verify(projects, never()).update(isNull(), any());
    }

    @Test void failedProjectUpdateRejectsImportAndCleansCreatedFiles() throws Exception {
        when(projects.update(isNull(), any())).thenReturn(0);
        byte[] archive = zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8),
                "images/image.png", new byte[]{1}));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("保存导入项目数据失败"));
        try (var files = Files.list(root.resolve("images"))) { assertEquals(0, files.count()); }
    }

    @Test void unchangedProjectDataIsAcceptedWhenDatabaseReportsZeroChangedRows() throws Exception {
        when(projects.update(isNull(), any())).thenReturn(0);
        ProjectPO existing = new ProjectPO(); existing.setDataJson("{}");
        when(projects.selectOne(any())).thenReturn(existing);
        importArchive(zip(Map.of("project.lc", "{\"projectJson\":\"{}\"}".getBytes(StandardCharsets.UTF_8))));
        verify(projects).update(isNull(), any());
    }

    @Test void failedVideoModelAndScriptWritesCleanTheirFiles() throws Exception {
        when(videos.insert(any(VideoPO.class))).thenReturn(0);
        when(models.insert(any(ThreeDModelPO.class))).thenReturn(0);
        when(scripts.insert(any(DynamicScriptPO.class))).thenReturn(0);
        List<Map<String, Object>> assetSets = List.of(
                Map.of("videos", List.of(Map.of("blob", "blobs/video.mp4"))),
                Map.of("models", List.of(Map.of("packageId", "old", "entry", "scene.glb", "files", List.of(
                        Map.of("path", "scene.glb", "blob", "blobs/scene.glb"))))),
                Map.of("dynamicScripts", List.of(Map.of("type", "LOCAL", "blob", "blobs/script.js"))));
        List<String> blobs = List.of("blobs/video.mp4", "blobs/scene.glb", "blobs/script.js");
        List<String> errors = List.of("导入视频记录失败", "导入模型记录失败", "导入动态脚本记录失败");
        List<String> directories = List.of("videos", "models", "scripts");
        for (int i = 0; i < assetSets.size(); i++) {
            String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                    "project", Map.of("dataPath", "project/project.json"), "assets", assetSets.get(i)));
            byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                    "project/project.json", "{}".getBytes(StandardCharsets.UTF_8), blobs.get(i), new byte[]{1}));
            RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
            assertTrue(error.getMessage().contains(errors.get(i)));
            try (var files = Files.list(root.resolve(directories.get(i)))) { assertEquals(0, files.count()); }
        }
        verify(projects, never()).update(isNull(), any());
    }

    @Test void datasourceInsertWithoutIdDoesNotProduceASuccessfulImport() throws Exception {
        when(commonApis.insert(any(CommonApiPO.class))).thenReturn(1);
        String manifest = JSON.toJSONString(Map.of("format", "datavisool-project", "formatVersion", 2,
                "project", Map.of("dataPath", "project/project.json"), "commonDatasource", Map.of(
                        "commonApis", List.of(Map.of("originId", "old-api", "name", "Example", "url", "https://example.invalid")))));
        byte[] archive = zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8),
                "project/project.json", "{}".getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(archive));
        assertTrue(error.getMessage().contains("导入公共 API 记录失败"));
        verify(projects, never()).update(isNull(), any());
    }

    @Test void convertsKnownUiStylesInLegacyPackage() throws Exception {
        byte[] nested = zip(Map.of("index.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8),
                "style.css", ".lcp-button,[class~='lcp-button'],[/*x*/class/*y*/~='lcp-button'],[class~=lcp-butto\\6e],[\\63 lass~=lcp-button] { color: var(--lcp-ui-primary) }".getBytes(StandardCharsets.UTF_8)));
        importArchive(manifestArchive("component.zip", nested));
        var captured = ArgumentCaptor.forClass(RemoteComponentPO.class); verify(componentService).createRemoteComponent(captured.capture());
        Path entry = root.resolve("components").resolve(captured.getValue().getUrl());
        assertConverted(Files.readString(entry));
        assertEquals(".datavisool-button,[class~='datavisool-button'],[/*x*/class/*y*/~='datavisool-button'],[class~=datavisool-button],[class~=datavisool-button] { color: var(--datavisool-ui-primary) }", Files.readString(entry.getParent().resolve("style.css")));
    }

    @Test void importsLegacyCliComponentWithStylesAndImageTogether() throws Exception {
        byte[] component;
        try (var input = getClass().getResourceAsStream("/fixtures/legacy-cli-component.js")) {
            assertNotNull(input);
            component = input.readAllBytes();
        }
        byte[] image = "<svg xmlns='http://www.w3.org/2000/svg'></svg>".getBytes(StandardCharsets.UTF_8);
        byte[] nested = zip(Map.of("chart.js", component,
                "assets/chart.css", ".lcp-button { color: var(--lcp-ui-primary) }".getBytes(StandardCharsets.UTF_8),
                "assets/icon.svg", image));
        importArchive(manifestArchive("component.zip", nested));
        var captured = ArgumentCaptor.forClass(RemoteComponentPO.class);
        verify(componentService).createRemoteComponent(captured.capture());
        Path entry = root.resolve("components").resolve(captured.getValue().getUrl());
        String converted = Files.readString(entry);
        assertTrue(converted.contains("globalThis.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__"));
        assertTrue(converted.contains("assets/chart.css"));
        assertTrue(converted.contains("assets/icon.svg"));
        assertEquals(".datavisool-button { color: var(--datavisool-ui-primary) }", Files.readString(entry.getParent().resolve("assets/chart.css")));
        assertArrayEquals(image, Files.readAllBytes(entry.getParent().resolve("assets/icon.svg")));
    }

    @Test void usesOriginalEntryWhenComponentPackageHasSeveralScripts() throws Exception {
        byte[] nested = zip(Map.of("helper.js", "var helper = 1;".getBytes(StandardCharsets.UTF_8),
                "chart.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        importArchive(manifestArchive("component.zip", nested, "static/components/old/chart.js"));
        var captured = ArgumentCaptor.forClass(RemoteComponentPO.class);
        verify(componentService).createRemoteComponent(captured.capture());
        assertTrue(captured.getValue().getUrl().endsWith("/chart.js"));
        assertConverted(Files.readString(root.resolve("components").resolve(captured.getValue().getUrl())));
    }

    @Test void rejectsAmbiguousComponentEntryInsteadOfChoosingByZipOrder() throws Exception {
        byte[] nested = zip(Map.of("helper.js", "var helper = 1;".getBytes(StandardCharsets.UTF_8),
                "chart.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.zip", nested)));
        assertTrue(error.getMessage().contains("多个可能的入口"));
        assertTrue(error.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
    }

    @Test void rejectsInvalidComponentArchiveWithItsNameAndReason() throws Exception {
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.zip", new byte[]{1, 2, 3})));
        assertTrue(error.getMessage().contains("Example"));
        assertTrue(error.getMessage().contains("组件压缩包格式无效"));
        verify(componentService, never()).createRemoteComponent(any());
    }

    @Test void rejectsUnsafeAndDuplicatePathsInsideComponentPackages() throws Exception {
        for (String unsafe : List.of("../outside.js", "/outside.js", "C:/outside.js", "assets/../../outside.js")) {
            byte[] nested = zip(Map.of("index.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8),
                    unsafe, "var x = 1;".getBytes(StandardCharsets.UTF_8)));
            RuntimeException error = assertThrows(RuntimeException.class,
                    () -> importArchive(manifestArchive("component.zip", nested)));
            assertTrue(error.getMessage().contains("组件压缩包路径不合法"), unsafe);
        }
        byte[] duplicate = zip(Map.of("index.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8),
                "assets/icon.svg", new byte[]{1}, "assets/./icon.svg", new byte[]{2}));
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> importArchive(manifestArchive("component.zip", duplicate)));
        assertTrue(error.getMessage().contains("组件压缩包包含重复路径"));
        verify(componentService, never()).createRemoteComponent(any());
        assertFalse(Files.exists(root.resolve("outside.js")));
        Path componentRoot = root.resolve("components");
        if (Files.exists(componentRoot)) {
            try (var files = Files.list(componentRoot)) { assertEquals(0, files.count()); }
        }
    }

    @Test void rejectsLegacyPackageWithUncertainUiStyles() throws Exception {
        byte[] nested = zip(Map.of("index.js", OLD_COMPONENT.getBytes(StandardCharsets.UTF_8),
                "style.css", "[class*='lcp-'] { color: red }".getBytes(StandardCharsets.UTF_8)));
        RuntimeException error = assertThrows(RuntimeException.class, () -> importArchive(manifestArchive("component.zip", nested)));
        assertTrue(error.getMessage().contains("style.css"));
        assertTrue(error.getMessage().contains("旧 UI 样式"));
        assertTrue(error.getMessage().contains("Example"));
        verify(componentService, never()).createRemoteComponent(any());
        try (var files = Files.list(root.resolve("components"))) { assertEquals(0, files.count()); }
    }

    @Test void doesNotInterpretCurrentComponentStylesAsLegacy() throws Exception {
        byte[] nested = zip(Map.of("index.js", "var __DATAVISOOL_REMOTE_COMPONENT_TEMP__ = {};".getBytes(StandardCharsets.UTF_8),
                "style.css", ".lcp-button { color: red }".getBytes(StandardCharsets.UTF_8)));
        importArchive(manifestArchive("component.zip", nested));
        assertTrue(savedComponent().contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
    }

    private byte[] manifestArchive(String name, byte[] component) throws Exception {
        return manifestArchive(name, component, null);
    }

    private byte[] manifestArchive(String name, byte[] component, String original) throws Exception {
        String originalField = original == null ? "" : ",\"original\":\"" + original + "\"";
        String manifest = "{\"format\":\"light-chaser-project\",\"formatVersion\":2,\"project\":{\"dataPath\":\"project/project.json\"},\"assets\":{\"components\":[{\"blob\":\"blobs/" + name + "\",\"name\":\"Example\"" + originalField + "}]}}";
        return zip(Map.of("manifest.json", manifest.getBytes(StandardCharsets.UTF_8), "project/project.json", "{}".getBytes(StandardCharsets.UTF_8), "blobs/" + name, component));
    }

    private static byte[] zip(Map<String, byte[]> entries) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (var entry : entries.entrySet()) { zip.putNextEntry(new ZipEntry(entry.getKey())); zip.write(entry.getValue()); zip.closeEntry(); }
        }
        return bytes.toByteArray();
    }

    private static void corruptDeflateStream(byte[] archive, String entryName) {
        byte[] expected = entryName.getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i + 30 + expected.length < archive.length; i++) {
            if (archive[i] != 0x50 || archive[i + 1] != 0x4b || archive[i + 2] != 0x03 || archive[i + 3] != 0x04) continue;
            int nameLength = (archive[i + 26] & 255) | ((archive[i + 27] & 255) << 8);
            int extraLength = (archive[i + 28] & 255) | ((archive[i + 29] & 255) << 8);
            if (nameLength == expected.length && java.util.Arrays.equals(archive, i + 30, i + 30 + nameLength, expected, 0, expected.length)) {
                archive[i + 30 + nameLength + extraLength] = 0x06; // Reserved DEFLATE block type.
                return;
            }
        }
        fail("找不到压缩包条目: " + entryName);
    }

    private static void corruptCentralCrc(byte[] archive, String entryName) {
        byte[] expected = entryName.getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i + 46 + expected.length < archive.length; i++) {
            if (archive[i] != 0x50 || archive[i + 1] != 0x4b || archive[i + 2] != 0x01 || archive[i + 3] != 0x02) continue;
            int nameLength = (archive[i + 28] & 255) | ((archive[i + 29] & 255) << 8);
            if (nameLength == expected.length && java.util.Arrays.equals(archive, i + 46, i + 46 + nameLength, expected, 0, expected.length)) {
                archive[i + 16] ^= 1;
                return;
            }
        }
        fail("找不到压缩包目录条目: " + entryName);
    }

    private void importArchive(byte[] bytes) throws Exception {
        importArchive(bytes, null);
    }

    private void importArchive(byte[] bytes, String passphrase) throws Exception {
        ProjectImportParamDTO dto = new ProjectImportParamDTO(); dto.setProjectId(42L);
        dto.setImportNotice("stale client value");
        dto.setSecretPassphrase(passphrase);
        dto.setFile(new MockMultipartFile("file", "test.zip", "application/zip", bytes));
        assertTrue(helper.importProject(dto));
        lastImportParam = dto;
    }

    private static com.alibaba.fastjson2.JSONObject archiveManifest(byte[] bytes) throws Exception {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                if ("manifest.json".equals(entry.getName())) return JSON.parseObject(new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        throw new IllegalStateException("manifest.json missing");
    }

    private String savedComponent() throws Exception {
        var captured = ArgumentCaptor.forClass(RemoteComponentPO.class); verify(componentService).createRemoteComponent(captured.capture());
        return Files.readString(root.resolve("components").resolve(captured.getValue().getUrl()));
    }

    private static void assertConverted(String component) {
        assertTrue(component.contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
        assertTrue(component.contains("DataVisoolSDK")); assertTrue(component.contains("DatavisoolGUI"));
        assertFalse(component.contains("LightChaser"));
    }
}
