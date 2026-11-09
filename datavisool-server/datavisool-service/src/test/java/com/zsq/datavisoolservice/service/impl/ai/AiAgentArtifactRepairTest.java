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

import static org.junit.jupiter.api.Assertions.*;

class AiAgentArtifactRepairTest {
    private static final String COMPONENT = """
            {"id":"card","type":"BaseColorBlock","x":10,"y":20,"width":450,"height":350,"useDefaultConfig":true}
            """.trim();

    @Test void validFirstOutputIsSavedBeforeValidationAndFrontendSubmission(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var received = new ArrayList<Map<String, Object>>();
        String content = "{\"components\":[" + COMPONENT + "]}";
        String expected = """
                {
                  "components": [
                    {
                      "id": "card",
                      "type": "BaseColorBlock",
                      "x": 10,
                      "y": 20,
                      "width": 450,
                      "height": 350,
                      "useDefaultConfig": true
                    }
                  ]
                }
                """.stripTrailing();
        assertEquals(expected, JsonFormatter.format(content));
        var catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            var files = workspace.listWorkspaceFiles(1, "agent-repairs").entries();
            assertEquals(1, files.size());
            assertEquals(expected, workspace.readWorkspaceFile(1, files.get(0).path()).content());
            received.add(request);
            return new AiAgentService.OperationView(request.get("operationId").toString(), type, "pending", Map.of(), revision, null, 0L);
        }, workspace);
        var result = runStaged(catalog, call("create_canvas_components", content), context("1", "run"));
        assertEquals("pending", result.status());
        assertEquals(1, received.size());
        assertTrue(workspace.workspaceRevision(1) >= 3);
        assertEquals(expected, workspace.readWorkspaceFile(1, result.result().get("path").toString()).content());
    }

    @Test void missingBraceIsSavedExactlyAndTinyPatchAutomaticallyResumesOriginalOperation(@TempDir Path root) {
        for (String name : List.of("create_canvas_components", "render_draft")) {
            var workspace = new AiAgentWorkspaceService(root.resolve(name));
            var received = new ArrayList<Map<String, Object>>();
            var catalog = catalog(workspace, received);
            String malformed = "{\"message\":\"原来的预览说明\",\"components\":[" + COMPONENT.substring(0, COMPONENT.length() - 1) + "]}";
            var initial = runStaged(catalog, call(name, malformed), context("1", "run"));
            assertEquals("repair_required", initial.status());
            assertFalse(initial.requiresFrontendEffect());
            assertTrue(received.isEmpty());
            String path = initial.result().get("path").toString();
            String stored = workspace.readWorkspaceFile(1, path).content();
            assertEquals(JsonFormatter.format(malformed), stored);
            assertTrue(stored.contains("\"useDefaultConfig\": true\n    ]"));
            assertTrue(initial.result().get("error").toString().contains("expected '}'"));
            assertTrue(stored.contains(initial.result().get("errorContext").toString()));
            var result = runStaged(catalog, repair(initial, "\"useDefaultConfig\": true\n    ]", "\"useDefaultConfig\": true}\n    ]"), context("1", "run"));
            assertEquals("pending", result.status(), result.asJson());
            assertTrue(result.requiresFrontendEffect());
            assertEquals(name, result.toolName());
            assertEquals(1, received.size());
            assertEquals("原来的预览说明", received.get(0).get("message"));
            assertEquals("card", ((Map<?, ?>) ((List<?>) received.get(0).get("components")).get(0)).get("id"));
            // 服务重建后重复调用只返回原回执，不能重复创建。
            var restored = catalog(new AiAgentWorkspaceService(root.resolve(name)), received);
            assertEquals("pending", runStaged(restored, repair(initial, "\"useDefaultConfig\": true\n    ]", "\"useDefaultConfig\": true}\n    ]"), context("1", "run")).status());
            assertEquals(1, received.size());
        }
    }

    @Test void malformedOuterArgumentsAndComponentPatchesUseTheSameRepairPath(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var received = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, received);
        String args = "{\"components\":[" + COMPONENT + "]";
        var first = runStaged(catalog, call("create_canvas_components", args), context("1", "run"));
        assertEquals("repair_required", first.status());
        assertEquals(JsonFormatter.format(args), workspace.readWorkspaceFile(1, first.result().get("path").toString()).content());
        assertEquals("pending", runStaged(catalog, repair(first, "\n  ]", "\n  ]\n}"), context("1", "run")).status());
        String patch = "{\"patches\":[{\"componentId\":\"card\",\"componentType\":\"BaseColorBlock\",\"stylePatch\":{\"style\":{\"background\":\"#fff\"}}}]";
        var service = new AiAgentService() {
            @Override com.zsq.datavisoolservice.model.po.AiAgentOperationPO findOperation(String id) { return null; }
            @Override public Map<String, Object> latestFrontendReadResult(AgentExecutionContext context) { return Map.of(); }
        };
        var patchCatalog = new AiAgentToolCatalog(service, (context, type, request, revision) -> {
            throw new AssertionError("修改组件不能绕过必要快照校验");
        }, workspace);
        var brokenPatch = runStaged(patchCatalog, call("patch_canvas_components", patch), context("1", "run"));
        assertEquals("repair_required", brokenPatch.status());
        // 修复后的修改仍需读取原组件快照，不能绕过正常校验。
        var repairedPatch = runStaged(patchCatalog, repair(brokenPatch, "\n  ]", "\n  ]\n}"), context("1", "run"));
        assertEquals("rejected", repairedPatch.status());
        assertEquals(1, received.size());
    }

    @Test void repeatedIncompleteRepairsKeepTheSameFileAndDoNotTriggerThreeFailureStop(@TempDir Path root) {
        var received = new ArrayList<Map<String, Object>>();
        var workspace = new AiAgentWorkspaceService(root);
        var catalog = catalog(workspace, received);
        var guard = new AiAgentToolGuard(3, Map.of());
        String malformed = "{\"components\":[" + COMPONENT.substring(0, COMPONENT.length() - 1) + "]}";
        var firstCall = call("create_canvas_components", malformed);
        var result = runStaged(catalog, firstCall, context("1", "run"));
        assertNull(guard.after(firstCall, result).stop());
        String path = result.result().get("path").toString();
        for (int i = 10; i < 14; i++) {
            String before = workspace.readWorkspaceFile(1, path).content();
            assertEquals(JsonFormatter.format(before), before);
            assertTrue(before.contains(result.result().get("errorContext").toString()));
            var edit = repair(result, "\"x\": " + i + ",", "\"x\": " + (i + 1) + ",");
            result = runStaged(catalog, edit, context("1", "run"));
            assertEquals("repair_required", result.status(), result.asJson());
            assertEquals(path, result.result().get("path"));
            String after = workspace.readWorkspaceFile(1, path).content();
            assertEquals(JsonFormatter.format(after), after);
            assertTrue(after.contains(result.result().get("errorContext").toString()));
            var outcome = guard.after(edit, result);
            assertNull(outcome.stop());
            assertFalse(outcome.result().result().containsKey("failureCount"));
            assertTrue(((Map<?, ?>) outcome.result().result().get("guard")).get("producedNewFact").equals(true));
            guard = new AiAgentToolGuard(3, JSON.parseObject(JSON.toJSONString(guard.snapshot()), Map.class));
        }
        assertTrue(received.isEmpty());
        assertEquals("pending", runStaged(catalog, repair(result, "\"useDefaultConfig\": true\n    ]", "\"useDefaultConfig\": true}\n    ]"), context("1", "run")).status());
        assertEquals(1, received.size());
        assertEquals(14, ((Number) ((Map<?, ?>) ((List<?>) received.get(0).get("components")).get(0)).get("x")).intValue());
        assertTrue(AiAgentToolScheduling.barrier("repair_artifact"));
        assertTrue(AiAgentRuntime.isWriteTool("repair_artifact"));
    }

    @Test void revisionConflictAndBadPatchPreserveOriginalAndAllowCorrectedRetry(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var catalog = catalog(workspace, new ArrayList<>());
        var initial = runStaged(catalog, call("create_canvas_components", "{\"components\":[" + COMPONENT + ",]}"), context("1", "run"));
        String path = initial.result().get("path").toString();
        String original = workspace.readWorkspaceFile(1, path).content();
        long revision = workspace.workspaceRevision(1);
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class, () -> workspace.patchRepairArtifact(1, "run", path, revision,
                List.of(new AiAgentWorkspaceService.RepairEdit("\"x\": 10,", "\"x\": 11,"),
                        new AiAgentWorkspaceService.RepairEdit("not present", "replacement"))));
        assertEquals(revision, workspace.workspaceRevision(1));
        assertEquals(original, workspace.readWorkspaceFile(1, path).content());
        var missing = runStaged(catalog, repair(initial, "not present", "replacement"), context("1", "run"));
        assertEquals("rejected", missing.status());
        assertEquals(true, missing.result().get("retryable"));
        assertEquals(original, workspace.readWorkspaceFile(1, path).content());
        workspace.applyWorkspacePatch(1, workspace.workspaceRevision(1), "*** Begin Patch\n*** Add File: unrelated.txt\n+other\n*** End Patch");
        var stale = runStaged(catalog, repair(initial, ",\n  ]", "\n  ]"), context("1", "run"));
        assertEquals("workspace.revision_conflict", stale.result().get("code"));
        assertEquals(original, workspace.readWorkspaceFile(1, path).content());
        var fresh = new AiAgentToolCatalog.ToolResult("read", "read_workspace_file", "completed",
                Map.of("path", path, "workspaceRevision", workspace.workspaceRevision(1)), false);
        assertEquals("pending", runStaged(catalog, repair(fresh, ",\n  ]", "\n  ]"), context("1", "run")).status());
    }

    @Test void repairedArtifactCannotCrossProjectsRunsOrBypassValidationAndAuthorization(@TempDir Path root) {
        var received = new ArrayList<Map<String, Object>>();
        var catalog = catalog(new AiAgentWorkspaceService(root), received);
        String invalid = "{\"components\":[{\"id\":\"card\",\"type\":\"BaseColorBlock\",\"x\":0,\"y\":0,\"width\":1,\"height\":1,]}";
        var first = runStaged(catalog, call("create_canvas_components", invalid), context("1", "run"));
        assertEquals("rejected", runStaged(catalog, repair(first, ",\n    ]\n  }", "}\n    ]\n  }"), context("2", "run")).status());
        assertEquals("rejected", runStaged(catalog, repair(first, ",\n    ]\n  }", "}\n    ]\n  }"), context("1", "other-run")).status());
        var semantic = runStaged(catalog, repair(first, ",\n    ]\n  }", "}\n    ]\n  }"), context("1", "run"));
        assertEquals("repair_required", semantic.status());
        assertEquals("invalid_create_component", semantic.result().get("code"));
        assertTrue(received.isEmpty());
        var initial = runStaged(catalog, call("create_canvas_components", "{\"components\":[" + COMPONENT + ",]}"), context("1", "run"));
        var guard = new AiAgentToolGuard(3, Map.of());
        guard.after(call("create_canvas_components", "{}"), new AiAgentToolCatalog.ToolResult("denied", "create_canvas_components", "rejected",
                Map.of("code", "permission_denied"), false));
        assertThrows(AiAgentToolFailurePolicy.Stop.class, () -> catalog.executeWithRepairGuard(
                repair(initial, ",\n  ]", "\n  ]"), context("1", "run"), guard::beforeResume));
        assertTrue(received.isEmpty());
    }

    @Test void syntaxReceiptContainsOnlyABoundedErrorFragment(@TempDir Path root) {
        String huge = "{\"components\":[" + COMPONENT.substring(0, COMPONENT.length() - 1) + ",\"name\":\"" + "字".repeat(10000) + "\"]}";
        var catalog = catalog(new AiAgentWorkspaceService(root), new ArrayList<>());
        var result = runStaged(catalog, call("create_canvas_components", huge), context("1", "run"));
        assertEquals("repair_required", result.status());
        assertTrue(result.result().get("errorContext").toString().length() <= 240);
        assertTrue(result.asJson().length() < 1200);
        assertFalse(result.asJson().contains(root.toString()));
    }

    @Test void loggedGaugeEndingNeedsOnlyOneExtraBrace(@TempDir Path root) {
        String gauge = "[{\"id\":\"gauge\",\"type\":\"AntdGauge\",\"x\":164,\"y\":230,\"width\":200,\"height\":180,\"config\":{\"style\":{\"statistic\":false},\"data\":{\"sourceType\":\"static\",\"staticData\":{\"value\":0.92}}}]";
        var received = new ArrayList<Map<String, Object>>();
        var catalog = catalog(new AiAgentWorkspaceService(root), received);
        var initial = runStaged(catalog, call("create_canvas_components", JSON.toJSONString(Map.of("components", gauge))), context("1", "run"));
        var corrected = runStaged(catalog, repair(initial, "0.92}}}]", "0.92}}}}]"), context("1", "run"));
        assertEquals("pending", corrected.status(), corrected.asJson());
        Map<?, ?> component = (Map<?, ?>) ((List<?>) received.get(0).get("components")).get(0);
        Map<?, ?> data = (Map<?, ?>) ((Map<?, ?>) component.get("config")).get("data");
        assertEquals("static", data.get("sourceType"));
        assertEquals(0.92, ((Number) ((Map<?, ?>) data.get("staticData")).get("value")).doubleValue());
    }

    @Test void semanticErrorsKeepRepairingTheSameFileUntilAllValidationPasses(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var received = new ArrayList<Map<String, Object>>();
        var catalog = catalog(workspace, received);
        var guard = new AiAgentToolGuard(3, Map.of());
        var first = call("create_canvas_components", "{\"components\":[" + COMPONENT.replace("\"width\":450", "\"width\":-1") + "]}");
        var result = runStaged(catalog, first, context("1", "run"));
        assertEquals("repair_required", result.status());
        assertEquals("content", result.result().get("validationStage"));
        String path = result.result().get("path").toString();
        assertNull(guard.after(first, result).stop());
        for (int i = 10; i < 14; i++) {
            var patch = repair(result, "\"x\": " + i + ",", "\"x\": " + (i + 1) + ",");
            result = runStaged(catalog, patch, context("1", "run"));
            assertEquals("repair_required", result.status());
            assertEquals(path, result.result().get("path"));
            String after = workspace.readWorkspaceFile(1, path).content();
            assertEquals(JsonFormatter.format(after), after);
            assertNull(guard.after(patch, result).stop());
        }
        assertTrue(received.isEmpty());
        result = runStaged(catalog, repair(result, "\"width\": -1", "\"width\": 450"), context("1", "run"));
        assertEquals("pending", result.status());
        assertEquals(path, result.result().get("path"));
        assertEquals(1, workspace.listWorkspaceFiles(1, "agent-repairs").entries().size());
        assertEquals(1, received.size());
    }

    @Test void realDebugLogRecordsStorageReadValidationAndEveryPatchInOrder(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var catalog = catalog(workspace, new ArrayList<>());
        String invalid = "{\n\"components\":[" + COMPONENT.replace("\"width\":450", "\"width\":-1") + "]";
        try (var capture = new AiAgentTraceTestSupport()) {
            var result = runStaged(catalog, call("create_canvas_components", invalid), context("1", "run"));
            String path = result.result().get("path").toString();
            String initiallyStored = workspace.readWorkspaceFile(1, path).content();
            assertEquals(JsonFormatter.format(invalid), initiallyStored);
            result = runStaged(catalog, repair(result, "\n  ]", "\n  ]\n}"), context("1", "run"));
            assertEquals("repair_required", result.status());
            assertEquals("content", result.result().get("validationStage"));
            String syntaxRepaired = workspace.readWorkspaceFile(1, path).content();
            result = runStaged(catalog, repair(result, "\"width\": -1", "\"width\": 450"), context("1", "run"));
            assertEquals("pending", result.status());
            var types = capture.records.stream().map(r -> r.getString("type")).toList();
            assertTrue(types.containsAll(List.of("artifact.stored", "artifact.write.applied", "artifact.validation.failed",
                    "artifact.repair.required", "artifact.patch.applied", "artifact.validated", "artifact.frontend.submitted")));
            assertTrue(types.indexOf("artifact.stored") < types.indexOf("artifact.validation.failed"));
            assertTrue(types.indexOf("artifact.validated") < types.indexOf("artifact.frontend.submitted"));
            String stored = workspace.readWorkspaceFile(1, path).content();
            String finalExpected = JsonFormatter.format(syntaxRepaired.replace("\"width\": -1", "\"width\": 450"));
            assertEquals(finalExpected, stored);
            var firstWrite = capture.records.stream().filter(r -> "artifact.write.applied".equals(r.getString("type"))).findFirst().orElseThrow();
            assertEquals(initiallyStored, firstWrite.getJSONObject("payload").getString("afterContent"));
            var patches = capture.records.stream().filter(r -> "artifact.patch.applied".equals(r.getString("type"))).toList();
            assertEquals(initiallyStored, patches.get(0).getJSONObject("payload").getString("beforeContent"));
            assertEquals(syntaxRepaired, patches.get(0).getJSONObject("payload").getString("afterContent"));
            assertEquals(workspace.readWorkspaceFile(1, path).content(), patches.get(1).getJSONObject("payload").getString("afterContent"));
            assertTrue(capture.records.stream().allMatch(r -> r.getJSONObject("payload").getString("requestId") != null));
            assertFalse(capture.records.stream().anyMatch(r -> r.toJSONString().contains(root.toString())));
        }
    }

    @Test void successfulFirstOutputIsAlsoFullyVisibleInDebugLog(@TempDir Path root) {
        var catalog = catalog(new AiAgentWorkspaceService(root), new ArrayList<>());
        try (var capture = new AiAgentTraceTestSupport()) {
            assertEquals("pending", runStaged(catalog, call("create_canvas_components", "{\"components\":[" + COMPONENT + "]}"), context("1", "run")).status());
            var types = capture.records.stream().map(r -> r.getString("type")).toList();
            assertTrue(types.containsAll(List.of("artifact.stored", "artifact.write.applied", "artifact.validated", "artifact.frontend.submitted")));
            assertTrue(types.indexOf("artifact.validated") < types.indexOf("artifact.frontend.submitted"));
        }
    }

    @Test void directLegacyArtifactArgumentsAreRejected(@TempDir Path root) {
        var received = new ArrayList<Map<String, Object>>();
        var tool = catalog(new AiAgentWorkspaceService(root), received);
        var result = tool.execute(call("create_canvas_components", "{\"components\":[" + COMPONENT + "]}"), context("1", "run"));
        assertEquals("rejected", result.status());
        assertEquals("artifact_reference_required", result.result().get("code"));
        assertTrue(received.isEmpty());
    }

    // Drive the staged public protocol while testing the shared validation and repair behavior.
    private AiAgentToolCatalog.ToolResult runStaged(AiAgentToolCatalog tool, ToolExecutionRequest request,
                                                    AiAgentService.AgentExecutionContext ctx) {
        AiAgentToolCatalog.ToolResult result;
        if (List.of("create_canvas_components", "render_draft", "patch_canvas_components").contains(request.name())) {
            result = tool.execute(call("begin_canvas_artifact", JSON.toJSONString(Map.of("toolName", request.name()))), ctx);
            String content = request.arguments();
            for (int offset = 0; offset < content.length(); offset += 1000) {
                String chunk = content.substring(offset, Math.min(content.length(), offset + 1000));
                result = tool.execute(call("write_canvas_artifact", JSON.toJSONString(Map.of(
                        "path", result.result().get("path"), "expectedRevision", result.result().get("workspaceRevision"),
                        "content", chunk))), ctx);
            }
            result = tool.execute(call("validate_canvas_artifact", JSON.toJSONString(Map.of(
                    "path", result.result().get("path"), "expectedRevision", result.result().get("workspaceRevision")))), ctx);
        } else {
            result = tool.execute(request, ctx);
        }
        if ("validated".equals(result.status())) {
            String toolName = result.result().get("toolName").toString();
            Map<String, Object> args = new java.util.LinkedHashMap<>();
            args.put("path", result.result().get("path"));
            args.put("expectedRevision", result.result().get("workspaceRevision"));
            if ("render_draft".equals(toolName)) args.put("action", "render");
            result = tool.execute(call(toolName, JSON.toJSONString(args)), ctx);
        }
        return result;
    }

    private AiAgentToolCatalog catalog(AiAgentWorkspaceService workspace, List<Map<String, Object>> received) {
        return new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            received.add(request);
            return new AiAgentService.OperationView(request.get("operationId").toString(), type, "pending", Map.of(), revision, null, 0L);
        }, workspace);
    }
    private ToolExecutionRequest repair(AiAgentToolCatalog.ToolResult previous, String oldText, String newText) {
        return call("repair_artifact", JSON.toJSONString(Map.of("path", previous.result().get("path"),
                "expectedRevision", previous.result().get("workspaceRevision"), "edits", List.of(Map.of("oldText", oldText, "newText", newText)))));
    }
    private ToolExecutionRequest call(String name, String args) {
        return ToolExecutionRequest.builder().id(java.util.UUID.randomUUID().toString()).name(name).arguments(args).build();
    }
    private AiAgentService.AgentExecutionContext context(String project, String run) {
        return new AiAgentService.AgentExecutionContext("thread", project, "turn", run, "1", "创建卡片",
                Map.of("canvasRevision", 42L), Map.of("mode", "none"), Map.of("revision", 42L), null, null, 0);
    }
}
