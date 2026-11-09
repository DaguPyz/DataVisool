/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.util.JsonFormatter;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentStagedArtifactTest {
    @Test void oldInlineCanvasArgumentsAreRejectedBeforeWritingOrDispatch(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, requests);
        for (String tool : List.of("create_canvas_components", "render_draft", "patch_canvas_components")) {
            var result = catalog.execute(call(tool, Map.of("components", List.of(Map.of("type", "BaseText")))), context("run"));
            assertEquals("rejected", result.status());
            assertEquals("artifact_reference_required", result.result().get("code"));
        }
        assertTrue(requests.isEmpty());
        assertEquals(0, workspace.workspaceRevision(1));
    }

    @Test void oldRepairMetadataIsRejectedWithoutChangingTheFile(@TempDir Path root) throws Exception {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, requests);
        var artifact = workspace.beginCanvasArtifact(1, "run", "create_canvas_components");
        String id = Path.of(artifact.path()).getFileName().toString().replace(".txt", ".json");
        Path metadata;
        try (var paths = java.nio.file.Files.walk(root)) {
            metadata = paths.filter(path -> path.getFileName().toString().equals(id)).findFirst().orElseThrow();
        }
        var old = JSON.parseObject(java.nio.file.Files.readString(metadata));
        old.remove("staged");
        old.put("field", "components");
        java.nio.file.Files.writeString(metadata, JSON.toJSONString(old));
        var result = catalog.execute(call("repair_artifact", Map.of("path", artifact.path(),
                "expectedRevision", artifact.workspaceRevision(), "edits", List.of(Map.of("oldText", "x", "newText", "y")))), context("run"));
        assertEquals("rejected", result.status());
        assertEquals("artifact_format_unsupported", result.result().get("code"));
        assertEquals("", workspace.readWorkspaceFile(1, artifact.path()).content());
        assertEquals(artifact.workspaceRevision(), workspace.workspaceRevision(1));
        assertTrue(requests.isEmpty());
    }
    private static final String COMPONENT = "{\"id\":\"card\",\"type\":\"BaseColorBlock\",\"x\":10,\"y\":20,\"width\":450,\"height\":350,\"useDefaultConfig\":true}";
    private static final String CONTENT = "{\n\"components\":[" + COMPONENT + "]\n}";

    @Test void chunksAndValidationNeverCreateUntilTheMatchingFileIsSubmitted(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, requests);
        var result = begin(catalog, "create_canvas_components");
        String path = result.result().get("path").toString();
        assertEquals("", workspace.readWorkspaceFile(1, path).content());
        result = write(catalog, result, "{\n\"components\":[");
        result = write(catalog, result, COMPONENT);
        result = write(catalog, result, "]\n}");
        assertEquals("writing", result.status());
        assertTrue(requests.isEmpty());
        assertEquals(JsonFormatter.format(CONTENT), workspace.readWorkspaceFile(1, path).content());
        result = validate(catalog, result);
        assertEquals("validated", result.status(), result.asJson());
        assertEquals(true, result.result().get("ready"));
        assertFalse(result.requiresFrontendEffect());
        assertTrue(requests.isEmpty());
        var reference = reference(result);
        assertFalse(JSON.toJSONString(reference).contains("components"));
        var submitted = catalog.execute(call("create_canvas_components", reference), context("run"));
        assertEquals("pending", submitted.status(), submitted.asJson());
        assertTrue(submitted.requiresFrontendEffect());
        assertEquals(1, requests.size());
        assertTrue(requests.get(0).get("components") instanceof List<?>);
        assertFalse(requests.get(0).containsKey("path"));
        assertEquals("card", ((Map<?, ?>) ((List<?>) requests.get(0).get("components")).get(0)).get("id"));
        // 服务恢复、请求重试及旧修订提交都只能复用原操作。
        var restored = catalog(new AiAgentWorkspaceService(root), requests);
        assertEquals("pending", restored.execute(call("create_canvas_components", reference), context("run")).status());
        assertEquals(1, requests.size());
    }

    @Test void syntaxAndSemanticRepairsBecomeReadyWithoutAutomaticallySubmitting(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, requests);
        var result = begin(catalog, "create_canvas_components");
        result = write(catalog, result, CONTENT.replace("\"width\":450", "\"width\":-1").substring(0, CONTENT.length() - 3));
        result = validate(catalog, result);
        assertEquals("repair_required", result.status());
        assertEquals("syntax", result.result().get("validationStage"));
        String path = result.result().get("path").toString();
        result = repair(catalog, result, "]", "]\n}");
        assertEquals("repair_required", result.status(), result.asJson());
        assertEquals("content", result.result().get("validationStage"));
        result = repair(catalog, result, "\"width\": -1", "\"width\":450");
        assertEquals("validated", result.status(), result.asJson());
        assertEquals(path, result.result().get("path"));
        assertTrue(requests.isEmpty());
        assertEquals("pending", catalog.execute(call("create_canvas_components", reference(result)), context("run")).status());
        assertEquals(1, requests.size());
    }

    @Test void unvalidatedChangedWrongRunAndWrongToolReferencesCannotCreate(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, requests);
        var result = write(catalog, begin(catalog, "create_canvas_components"), CONTENT);
        assertEquals("artifact_validation_required", catalog.execute(call("create_canvas_components", reference(result)), context("run")).result().get("code"));
        result = validate(catalog, result);
        assertEquals("rejected", catalog.execute(call("patch_canvas_components", reference(result)), context("run")).status());
        assertEquals("rejected", catalog.execute(call("create_canvas_components", reference(result)), context("other-run")).status());
        var checked = reference(result);
        var changed = write(catalog, result, "\n");
        assertEquals("workspace.revision_conflict", catalog.execute(call("create_canvas_components", checked), context("run")).result().get("code"));
        assertEquals("artifact_validation_required", catalog.execute(call("create_canvas_components", reference(changed)), context("run")).result().get("code"));
        changed = validate(catalog, changed);
        // 通用Workspace补丁修改文件也不能沿用之前的校验证据。
        workspace.applyWorkspacePatch(1, ((Number) changed.result().get("workspaceRevision")).longValue(),
                "*** Begin Patch\n*** Update File: " + changed.result().get("path") + "\n@@\n-      \"x\": 10,\n+      \"x\": 11,\n*** End Patch");
        var fresh = Map.<String, Object>of("path", changed.result().get("path"), "expectedRevision", workspace.workspaceRevision(1));
        assertEquals("artifact_validation_required", catalog.execute(call("create_canvas_components", fresh), context("run")).result().get("code"));
        assertTrue(requests.isEmpty());
    }

    @Test void logsRestoreChunksErrorsRepairsReadyAndSubmissionAsSeparatePhases(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, requests);
        try (var capture = new AiAgentTraceTestSupport()) {
            var result = begin(catalog, "create_canvas_components");
            String path = result.result().get("path").toString();
            result = write(catalog, result, "{\"components\":[");
            result = write(catalog, result, COMPONENT + ",]}");
            result = validate(catalog, result);
            assertEquals("repair_required", result.status());
            result = repair(catalog, result, ",\n  ]", "\n  ]");
            assertEquals("validated", result.status());
            assertTrue(requests.isEmpty());
            assertFalse(capture.records.stream().anyMatch(r -> r.getString("type").startsWith("artifact.frontend.")));
            var ready = capture.records.stream().filter(r -> "artifact.validated".equals(r.getString("type"))).findFirst().orElseThrow();
            var submitted = catalog.execute(call("create_canvas_components", reference(result)), context("run"));
            assertEquals("pending", submitted.status());
            var writes = capture.records.stream().filter(r -> "artifact.write.applied".equals(r.getString("type"))).toList();
            assertEquals("", writes.get(0).getJSONObject("payload").getString("beforeContent"));
            assertEquals(writes.get(0).getJSONObject("payload").getString("afterContent"), writes.get(1).getJSONObject("payload").getString("beforeContent"));
            assertEquals(JsonFormatter.format("{\"components\":[" + COMPONENT + "]}"), workspace.readWorkspaceFile(1, path).content());
            var submittedLog = capture.records.stream().filter(r -> "artifact.frontend.requested".equals(r.getString("type"))).findFirst().orElseThrow();
            assertEquals(ready.getJSONObject("payload").getString("contentSha256"), submittedLog.getJSONObject("payload").getString("contentSha256"));
            assertTrue(capture.records.indexOf(ready) < capture.records.indexOf(submittedLog));
            assertTrue(capture.records.stream().allMatch(r -> r.getJSONObject("payload").getString("requestId") != null));
            assertFalse(capture.records.stream().anyMatch(r -> r.toJSONString().contains(root.toString())));
        }
    }

    @Test void renderUsesTheFileOptionsAndNeverTreatsClearAsRender(@TempDir Path root) {
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = catalog(new AiAgentWorkspaceService(root), requests);
        var result = write(catalog, begin(catalog, "render_draft"),
                "{\"message\":\"预览说明\",\"interactive\":false,\"incremental\":true,\"components\":[" + COMPONENT + "]}");
        result = validate(catalog, result);
        assertEquals("validated", result.status());
        assertEquals("rejected", catalog.execute(call("render_draft", reference(result)), context("run")).status());
        var args = new java.util.LinkedHashMap<>(reference(result));
        args.put("action", "clear");
        assertEquals("rejected", catalog.execute(call("render_draft", args), context("run")).status());
        assertTrue(requests.isEmpty());
        args.put("action", "render");
        assertEquals("pending", catalog.execute(call("render_draft", args), context("run")).status());
        assertEquals("render", requests.get(0).get("action"));
        assertEquals("预览说明", requests.get(0).get("message"));
        assertEquals(false, requests.get(0).get("interactive"));
        assertEquals(true, requests.get(0).get("incremental"));
    }

    @Test void complexRenderUsesIndependentRegionFilesThenSubmitsOneDraftPreview(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            requests.add(new java.util.LinkedHashMap<>(request));
            int draftRevision = requests.size();
            return new AiAgentService.OperationView("render-op-" + draftRevision, type, "pending",
                    Map.of("draftId", "ai-draft-42", "revision", draftRevision, "layerCount", 1), revision, null, 0L);
        }, workspace);
        var firstComponent = new java.util.LinkedHashMap<>(JSON.parseObject(COMPONENT));
        firstComponent.put("id", "header-card");
        firstComponent.put("width", 420);
        firstComponent.put("height", 120);
        var secondComponent = new java.util.LinkedHashMap<>(JSON.parseObject(COMPONENT));
        secondComponent.put("id", "body-card");
        secondComponent.put("y", 180);
        secondComponent.put("width", 420);
        List<Map<String, Object>> layout = List.of(
                Map.of("id", "header", "x", 0, "y", 0, "width", 450, "height", 180),
                Map.of("id", "body", "x", 0, "y", 180, "width", 450, "height", 350));

        var firstContent = JSON.toJSONString(Map.of("components", List.of(firstComponent), "regionId", "header",
                "layout", layout, "incremental", false, "interactive", false));
        var firstFile = validate(catalog, write(catalog, begin(catalog, "render_draft"), firstContent));
        assertEquals("validated", firstFile.status(), firstFile.asJson());
        var firstArgs = new java.util.LinkedHashMap<>(reference(firstFile));firstArgs.put("action", "render");
        var firstRender = catalog.execute(call("render_draft", firstArgs), context("run"));
        assertEquals("pending", firstRender.status());
        Map<?, ?> firstDraft = (Map<?, ?>) firstRender.result().get("result");
        assertEquals("ai-draft-42", firstDraft.get("draftId"));
        assertEquals(1, firstDraft.get("revision"));

        var secondContent = JSON.toJSONString(Map.of("components", List.of(secondComponent), "regionId", "body",
                "draftId", firstDraft.get("draftId"), "incremental", true, "interactive", false));
        var secondFile = validate(catalog, write(catalog, begin(catalog, "render_draft"), secondContent));
        assertEquals("validated", secondFile.status(), secondFile.asJson());
        var secondArgs = new java.util.LinkedHashMap<>(reference(secondFile));secondArgs.put("action", "render");
        var secondRender = catalog.execute(call("render_draft", secondArgs), context("run"));
        assertEquals("pending", secondRender.status());
        Map<?, ?> finalDraft = (Map<?, ?>) secondRender.result().get("result");
        assertEquals(2, finalDraft.get("revision"));

        var beforePreview = workspace.listWorkspaceFiles(1, "").totalEntries();
        var preview = catalog.execute(call("render_draft", Map.of("action", "preview", "draftId", finalDraft.get("draftId"),
                "expectedDraftRevision", finalDraft.get("revision"))), context("run"));
        assertEquals("pending", preview.status());assertTrue(preview.requiresFrontendEffect());
        assertEquals(beforePreview, workspace.listWorkspaceFiles(1, "").totalEntries());
        assertEquals(3, requests.size());
        assertEquals("header", requests.get(0).get("regionId"));assertEquals(layout, requests.get(0).get("layout"));
        assertEquals(false, requests.get(0).get("incremental"));assertEquals(false, requests.get(0).get("interactive"));
        assertEquals("body", requests.get(1).get("regionId"));assertEquals("ai-draft-42", requests.get(1).get("draftId"));
        assertEquals(true, requests.get(1).get("incremental"));assertEquals(false, requests.get(1).get("interactive"));
        assertEquals("preview", requests.get(2).get("action"));assertEquals("ai-draft-42", requests.get(2).get("draftId"));
        assertEquals(2, requests.get(2).get("expectedDraftRevision"));
        assertFalse(requests.get(2).containsKey("components"));assertFalse(requests.get(2).containsKey("path"));
        assertEquals(2, workspace.listWorkspaceFiles(1, "").entries().stream().filter(entry -> "file".equals(entry.entryType())).count());
    }

    @Test void fileProgressResetsReadGuardWithoutClaimingCanvasSuccess(@TempDir Path root) {
        var catalog = catalog(new AiAgentWorkspaceService(root), new ArrayList<>());
        var guard = new AiAgentToolGuard(3, Map.of());
        var first = call("begin_canvas_artifact", Map.of("toolName", "create_canvas_components"));
        var result = guard.after(first, catalog.execute(first, context("run"))).result();
        assertEquals(true, ((Map<?, ?>) result.result().get("guard")).get("producedNewFact"));
        result = write(catalog, result, CONTENT);
        var check = call("validate_canvas_artifact", reference(result));
        var validated = guard.after(check, catalog.execute(check, context("run"))).result();
        assertEquals("validated", validated.status());
        assertEquals(true, ((Map<?, ?>) validated.result().get("guard")).get("producedNewFact"));
        assertFalse(validated.requiresFrontendEffect());
    }

    private AiAgentToolCatalog catalog(AiAgentWorkspaceService workspace, List<Map<String, Object>> requests) {
        return new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            requests.add(request);
            return new AiAgentService.OperationView(request.get("operationId").toString(), type, "pending", Map.of(), revision, null, 0L);
        }, workspace);
    }
    private AiAgentToolCatalog.ToolResult begin(AiAgentToolCatalog catalog, String name) {
        return catalog.execute(call("begin_canvas_artifact", Map.of("toolName", name)), context("run"));
    }
    private AiAgentToolCatalog.ToolResult write(AiAgentToolCatalog catalog, AiAgentToolCatalog.ToolResult previous, String content) {
        var args = new java.util.LinkedHashMap<>(reference(previous));
        args.put("content", content);
        return catalog.execute(call("write_canvas_artifact", args), context("run"));
    }
    private AiAgentToolCatalog.ToolResult validate(AiAgentToolCatalog catalog, AiAgentToolCatalog.ToolResult previous) {
        return catalog.execute(call("validate_canvas_artifact", reference(previous)), context("run"));
    }
    private AiAgentToolCatalog.ToolResult repair(AiAgentToolCatalog catalog, AiAgentToolCatalog.ToolResult previous, String oldText, String newText) {
        var args = new java.util.LinkedHashMap<>(reference(previous));
        args.put("edits", List.of(Map.of("oldText", oldText, "newText", newText)));
        return catalog.execute(call("repair_artifact", args), context("run"));
    }
    private Map<String, Object> reference(AiAgentToolCatalog.ToolResult previous) {
        return Map.of("path", previous.result().get("path"), "expectedRevision", previous.result().get("workspaceRevision"));
    }
    private ToolExecutionRequest call(String name, Map<String, Object> args) {
        return ToolExecutionRequest.builder().id(UUID.randomUUID().toString()).name(name).arguments(JSON.toJSONString(args)).build();
    }
    private AiAgentService.AgentExecutionContext context(String run) {
        return new AiAgentService.AgentExecutionContext("thread", "1", "turn", run, "1", "创建卡片",
                Map.of("canvasRevision", 42L), Map.of("mode", "none"), Map.of("revision", 42L), null, null, 0);
    }
}
