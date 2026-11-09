/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import org.junit.Assert;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ProjectArchiveCompatHelperManifestSerializationTest {

    @Test
    public void serializeManifestJsonDoesNotEmitRefForSharedEmptyLists() {
        List<Map<String, Object>> sharedEmptyList = List.of();

        LinkedHashMap<String, Object> commonDatasource = new LinkedHashMap<>();
        commonDatasource.put("commonApis", sharedEmptyList);
        commonDatasource.put("databases", sharedEmptyList);

        LinkedHashMap<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("commonDatasource", commonDatasource);

        String json = ProjectArchiveCompatHelper.serializeManifestJson(manifest);

        Assert.assertFalse(json.contains("\"$ref\""));
        Assert.assertTrue(json.contains("\"commonApis\":[]"));
        Assert.assertTrue(json.contains("\"databases\":[]"));
    }

    @Test
    public void resolveManifestImportModeAcceptsLegacySingleProjectVersion() {
        JSONObject manifest = singleProjectManifest(1);

        ProjectArchiveCompatHelper.ManifestImportMode mode =
                ProjectArchiveCompatHelper.resolveManifestImportMode(manifest);

        Assert.assertEquals(ProjectArchiveCompatHelper.ManifestImportMode.SINGLE_PROJECT, mode);
    }

    @Test
    public void resolveManifestImportModeAcceptsCurrentSingleGraphAndEncryptedFormats() {
        JSONObject single = singleProjectManifest(2);
        single.put("format", "datavisool-project");
        Assert.assertEquals(ProjectArchiveCompatHelper.ManifestImportMode.SINGLE_PROJECT,
                ProjectArchiveCompatHelper.resolveManifestImportMode(single));

        JSONObject graph = singleProjectManifest(3);
        graph.put("format", "datavisool-project");
        JSONObject node = new JSONObject();
        node.put("sourceProjectId", "1"); node.put("dataPath", "projects/1.json"); node.put("isEntry", true);
        JSONArray projects = new JSONArray(); projects.add(node); graph.put("projects", projects);
        Assert.assertEquals(ProjectArchiveCompatHelper.ManifestImportMode.PROJECT_GRAPH,
                ProjectArchiveCompatHelper.resolveManifestImportMode(graph));

        JSONObject encrypted = singleProjectManifest(4);
        encrypted.put("format", "datavisool-project"); encrypted.put("encrypted", true);
        JSONObject encryption = new JSONObject(); encryption.put("mode", "package");
        encrypted.put("encryption", encryption);
        Assert.assertEquals(ProjectArchiveCompatHelper.ManifestImportMode.ENCRYPTED_PACKAGE,
                ProjectArchiveCompatHelper.resolveManifestImportMode(encrypted));
    }

    @Test
    public void resolveManifestImportModeRejectsUnknownFormat() {
        JSONObject manifest = singleProjectManifest(2);
        manifest.put("format", "unknown-project");
        Assert.assertThrows(RuntimeException.class, () -> ProjectArchiveCompatHelper.resolveManifestImportMode(manifest));
    }

    @Test
    public void resolveManifestImportModeRejectsFuturePlainSingleProjectVersion() {
        JSONObject manifest = singleProjectManifest(4);

        RuntimeException ex = Assert.assertThrows(RuntimeException.class,
                () -> ProjectArchiveCompatHelper.resolveManifestImportMode(manifest));

        Assert.assertTrue(ex.getMessage().contains("导出包版本过新"));
    }

    @Test
    public void resolveManifestImportModeUsesProjectsArrayForProjectGraph() {
        JSONObject manifest = singleProjectManifest(3);
        JSONObject project = new JSONObject();
        project.put("sourceProjectId", "1");
        project.put("dataPath", "projects/1/project.json");
        project.put("isEntry", true);
        JSONArray projects = new JSONArray();
        projects.add(project);
        manifest.put("projects", projects);

        ProjectArchiveCompatHelper.ManifestImportMode mode =
                ProjectArchiveCompatHelper.resolveManifestImportMode(manifest);

        Assert.assertEquals(ProjectArchiveCompatHelper.ManifestImportMode.PROJECT_GRAPH, mode);
    }

    @Test
    public void resolveManifestImportModeRejectsFuturePlainProjectGraphVersion() {
        JSONObject manifest = singleProjectManifest(4);
        JSONObject project = new JSONObject();
        project.put("sourceProjectId", "1");
        project.put("dataPath", "projects/1/project.json");
        project.put("isEntry", true);
        JSONArray projects = new JSONArray();
        projects.add(project);
        manifest.put("projects", projects);

        RuntimeException ex = Assert.assertThrows(RuntimeException.class,
                () -> ProjectArchiveCompatHelper.resolveManifestImportMode(manifest));

        Assert.assertTrue(ex.getMessage().contains("导出包版本过新"));
    }

    @Test
    public void resolveManifestImportModeRejectsInvalidVersion() {
        JSONObject manifest = singleProjectManifest(0);

        RuntimeException ex = Assert.assertThrows(RuntimeException.class,
                () -> ProjectArchiveCompatHelper.resolveManifestImportMode(manifest));

        Assert.assertTrue(ex.getMessage().contains("导出包版本不受支持"));
    }

    @Test
    public void resolveManifestImportModeUsesEncryptedPackageMode() {
        JSONObject manifest = singleProjectManifest(4);
        JSONObject encryption = new JSONObject();
        encryption.put("algorithm", "passphrase-v1");
        encryption.put("mode", "package");
        encryption.put("payloadPath", "payload.enc");
        manifest.put("encrypted", true);
        manifest.put("encryption", encryption);

        ProjectArchiveCompatHelper.ManifestImportMode mode =
                ProjectArchiveCompatHelper.resolveManifestImportMode(manifest);

        Assert.assertEquals(ProjectArchiveCompatHelper.ManifestImportMode.ENCRYPTED_PACKAGE, mode);
    }

    @Test
    public void buildEncryptedPackageManifestMatchesDesktopPackageShape() {
        byte[] payload = "encrypted-payload".getBytes(StandardCharsets.UTF_8);

        LinkedHashMap<String, Object> manifest = ProjectArchiveCompatHelper.buildEncryptedPackageManifest(
                "payload.enc",
                payload,
                1779024317800L,
                "light-chaser-web"
        );

        String json = ProjectArchiveCompatHelper.serializeManifestJson(manifest);
        JSONObject object = JSON.parseObject(json);
        JSONObject encryption = object.getJSONObject("encryption");
        JSONObject payloadObject = object.getJSONObject("payload");

        Assert.assertTrue(object.getBooleanValue("encrypted"));
        Assert.assertEquals("datavisool-project", object.getString("format"));
        Assert.assertEquals(Integer.valueOf(4), object.getInteger("formatVersion"));
        Assert.assertEquals("light-chaser-web", object.getString("generator"));
        Assert.assertEquals(Long.valueOf(1779024317800L), object.getLong("generatedAtMs"));
        Assert.assertEquals("passphrase-v1", encryption.getString("algorithm"));
        Assert.assertEquals("package", encryption.getString("mode"));
        Assert.assertEquals("payload.enc", encryption.getString("payloadPath"));
        Assert.assertEquals("payload.enc", payloadObject.getString("path"));
        Assert.assertEquals(Integer.valueOf(payload.length), payloadObject.getInteger("size"));
        Assert.assertEquals(
                "6e42a7af7c34c60bc27ca06b1928a4d1327160c8e5349c4ac5f2ebf0a7edf4f2",
                payloadObject.getString("sha256")
        );
    }

    @Test
    public void requirePackageEncryptionRejectsPlainCommonDatasourceExport() {
        List<List<Map<String, Object>>> cases = List.of(
                List.of(Map.of("id", "api-1")),
                List.of(Map.of("id", "database-1"))
        );

        for (int i = 0; i < cases.size(); i++) {
            List<Map<String, Object>> commonApiRefs = i == 0 ? cases.get(i) : List.of();
            List<Map<String, Object>> databaseRefs = i == 1 ? cases.get(i) : List.of();

            AppException ex = Assert.assertThrows(
                    AppException.class,
                    () -> ProjectArchiveCompatHelper.requirePackageEncryptionForCommonDatasource(
                            false,
                            commonApiRefs,
                            databaseRefs
                    )
            );

            Assert.assertEquals(AppStatusCode.INVALID_PARAM.code(), ex.getCode());
            Assert.assertEquals("导出包含公共 API 或数据库时必须启用整包加密", ex.getMsg());
        }
    }

    @Test
    public void requirePackageEncryptionAllowsSafeExportModes() {
        ProjectArchiveCompatHelper.requirePackageEncryptionForCommonDatasource(
                true,
                List.of(Map.of("id", "api-1")),
                List.of(Map.of("id", "database-1"))
        );
        ProjectArchiveCompatHelper.requirePackageEncryptionForCommonDatasource(
                false,
                List.of(),
                List.of()
        );
    }

    @Test
    public void shouldEncryptPackageAcceptsOnlySupportedModes() {
        Assert.assertFalse(ProjectArchiveCompatHelper.shouldEncryptPackage(null, ""));
        Assert.assertFalse(ProjectArchiveCompatHelper.shouldEncryptPackage("plain", ""));
        Assert.assertTrue(ProjectArchiveCompatHelper.shouldEncryptPackage("passphrase-v1", "export-secret"));

        AppException unsupportedMode = Assert.assertThrows(
                AppException.class,
                () -> ProjectArchiveCompatHelper.shouldEncryptPackage("field-level", "export-secret")
        );
        Assert.assertEquals(AppStatusCode.INVALID_PARAM.code(), unsupportedMode.getCode());
        Assert.assertTrue(unsupportedMode.getMsg().contains("不支持的项目包加密模式"));

        AppException missingPassphrase = Assert.assertThrows(
                AppException.class,
                () -> ProjectArchiveCompatHelper.shouldEncryptPackage("passphrase-v1", "")
        );
        Assert.assertEquals(AppStatusCode.INVALID_PARAM.code(), missingPassphrase.getCode());
        Assert.assertEquals("缺少导出口令", missingPassphrase.getMsg());
    }

    @Test
    public void verifyEncryptedPayloadManifestAcceptsMatchingPayload() throws Exception {
        byte[] payload = "encrypted-payload".getBytes(StandardCharsets.UTF_8);
        JSONObject manifest = JSON.parseObject(ProjectArchiveCompatHelper.serializeManifestJson(
                ProjectArchiveCompatHelper.buildEncryptedPackageManifest("payload.enc", payload, 1779024317800L, "light-chaser-web")
        ));
        Path payloadFile = Files.createTempFile("lcp-payload-matching", ".enc");
        try {
            Files.write(payloadFile, payload);

            ProjectArchiveCompatHelper.verifyEncryptedPayloadManifest(manifest, payloadFile);
        } finally {
            Files.deleteIfExists(payloadFile);
        }
    }

    @Test
    public void verifyEncryptedPayloadManifestRejectsSizeMismatch() throws Exception {
        JSONObject manifest = JSON.parseObject(ProjectArchiveCompatHelper.serializeManifestJson(
                ProjectArchiveCompatHelper.buildEncryptedPackageManifest(
                        "payload.enc",
                        "encrypted-payload".getBytes(StandardCharsets.UTF_8),
                        1779024317800L,
                        "light-chaser-web"
                )
        ));
        Path payloadFile = Files.createTempFile("lcp-payload-size-mismatch", ".enc");
        try {
            Files.write(payloadFile, "short".getBytes(StandardCharsets.UTF_8));

            RuntimeException ex = Assert.assertThrows(RuntimeException.class,
                    () -> ProjectArchiveCompatHelper.verifyEncryptedPayloadManifest(manifest, payloadFile));

            Assert.assertTrue(ex.getMessage().contains("加密 payload 大小校验失败"));
        } finally {
            Files.deleteIfExists(payloadFile);
        }
    }

    @Test
    public void verifyEncryptedPayloadManifestRejectsShaMismatch() throws Exception {
        JSONObject manifest = JSON.parseObject(ProjectArchiveCompatHelper.serializeManifestJson(
                ProjectArchiveCompatHelper.buildEncryptedPackageManifest(
                        "payload.enc",
                        "encrypted-payload-a".getBytes(StandardCharsets.UTF_8),
                        1779024317800L,
                        "light-chaser-web"
                )
        ));
        Path payloadFile = Files.createTempFile("lcp-payload-sha-mismatch", ".enc");
        try {
            Files.write(payloadFile, "encrypted-payload-b".getBytes(StandardCharsets.UTF_8));

            RuntimeException ex = Assert.assertThrows(RuntimeException.class,
                    () -> ProjectArchiveCompatHelper.verifyEncryptedPayloadManifest(manifest, payloadFile));

            Assert.assertTrue(ex.getMessage().contains("加密 payload 校验失败"));
        } finally {
            Files.deleteIfExists(payloadFile);
        }
    }

    private JSONObject singleProjectManifest(int formatVersion) {
        JSONObject project = new JSONObject();
        project.put("id", "1");
        project.put("name", "demo");
        project.put("dataPath", "project/project.json");

        JSONObject manifest = new JSONObject();
        manifest.put("format", "light-chaser-project");
        manifest.put("formatVersion", formatVersion);
        manifest.put("project", project);
        manifest.put("projects", new JSONArray());
        manifest.put("assets", new JSONObject());
        return manifest;
    }
}
