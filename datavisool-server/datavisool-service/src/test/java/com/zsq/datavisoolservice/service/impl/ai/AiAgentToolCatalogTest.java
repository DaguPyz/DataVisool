/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAgentToolCatalogTest {
    @Test
    void browserReadsNeverUseWorkspaceRevisionForCacheLookup(@TempDir Path root) {
        var catalog = new AiAgentToolCatalog(null, null, new AiAgentWorkspaceService(root));
        for (String name : List.of("get_project_snapshot", "get_component_catalog", "resolve_component_specs")) {
            var request = ToolExecutionRequest.builder().id(name).name(name).arguments("{}").build();
            assertEquals(null, catalog.cacheVersion(request, context()));
        }
    }
    @Test
    void rejectsTheLoggedIdAndTypeSnapshotMistakesBeforeDispatch() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            throw new AssertionError("非法参数不能创建前端等待操作");
        });
        for (String field : List.of("id", "type")) {
            var result = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("logged-" + field)
                    .name("get_component_snapshots")
                    .arguments(JSON.toJSONString(Map.of("componentIds", List.of("title"), "fields", List.of(field))))
                    .build(), context());
            assertEquals("rejected", result.status());
            assertEquals(AiAgentToolDefinitions.SNAPSHOT_FIELDS, result.result().get("allowedFields"));
            assertTrue(result.result().get("message").toString().contains("id/type/name 自动返回"));
            assertTrue(!result.requiresFrontendEffect());
        }
    }

    @Test
    void allAdvertisedSnapshotFieldsAndFullPageModeReachTheBrowser() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        for (String name : List.of("get_component_snapshots", "inspect_current_page")) {
            var result = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id(name).name(name)
                    .arguments(JSON.toJSONString(Map.of("allPage", true, "fields", AiAgentToolDefinitions.SNAPSHOT_FIELDS)))
                    .build(), context());
            assertEquals("pending", result.status());
            assertTrue(result.requiresFrontendEffect());
        }
    }

    @Test
    void invalidQuestionsCannotLeaveTheRunWaitingForInput() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, null);
        var invalidOptions = Map.of("id", "style", "header", "风格", "question", "选择风格", "options",
                List.of(Map.of("label", "蓝色"), Map.of("label", "红色")));
        for (Object payload : List.of(Map.of("prompt", "选择风格"), Map.of("questions", List.of(invalidOptions)))) {
            var result = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("question").name("request_user_input")
                    .arguments(JSON.toJSONString(payload)).build(), context());
            assertEquals("rejected", result.status());
            assertEquals("invalid_payload", result.result().get("code"));
        }
    }

    @Test
    void structuredQuestionsEnterWaitingStateWithTheDeclaredPayload() {
        List<Map<String, Object>> received = new java.util.ArrayList<>();
        AiAgentService service = new AiAgentService() {
            @Override public void markWaitingForInput(AgentExecutionContext context, Map<String, Object> prompt) {
                received.add(prompt);
            }
        };
        var question = Map.of("id", "style", "header", "风格", "question", "选择风格", "options",
                List.of(Map.of("label", "蓝色", "description", "科技风"), Map.of("label", "灰色", "description", "简洁风")));
        var result = new AiAgentToolCatalog(service, null).execute(ToolExecutionRequest.builder().id("question")
                .name("request_user_input").arguments(JSON.toJSONString(Map.of("questions", List.of(question))))
                .build(), context());
        assertEquals("waiting_input", result.status());
        assertEquals(List.of(question), received.get(0).get("questions"));
    }

    @Test
    void exposesOnlyRegisteredCanvasTools() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, null);

        List<String> names = catalog.specifications().stream().map(specification -> specification.name()).toList();

        assertTrue(names.contains("get_project_snapshot"));
        assertTrue(names.contains("patch_canvas_components"));
        assertTrue(!names.contains("apply_component_patch"));
        assertTrue(!names.contains("apply_component_style_patch"));
        assertTrue(names.contains("create_canvas_components"));
        assertTrue(names.containsAll(List.of(
                "list_workspace_files", "search_workspace_files", "read_workspace_file",
                "apply_workspace_patch", "move_workspace_path", "delete_workspace_path"
        )));
        assertTrue(names.contains("request_user_input"));
        assertTrue(names.contains("get_component_catalog"));
        assertTrue(!names.contains("search_available_components"));
        assertEquals(names.size(), names.stream().distinct().count());
    }

    @Test
    void rejectsEmptyCreateComponentsBeforeFrontendExecution() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-create-empty")
                .name("create_canvas_components")
                .arguments("{\"components\":[]}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("rejected", result.status());
        assertEquals("invalid_payload", result.result().get("code"));
        assertTrue(!result.requiresFrontendEffect());
    }

    @Test
    void normalizesStringComponentsForCreateAndDraftBeforeFrontendDispatch() {
        List<?> components = JSON.parseObject(configuredColumnCreateArguments()).getJSONArray("components");
        List<Map<String, Object>> received = new java.util.ArrayList<>();
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            received.add(request);
            return stubGateway().request(context, type, request, revision);
        });
        for (String name : List.of("create_canvas_components", "render_draft")) {
            for (Object input : List.of(components, "\n " + JSON.toJSONString(components) + " \n")) {
                var result = validatePayloadOrExecute(catalog, componentsRequest(name, input), context());

                assertEquals("pending", result.status());
                assertTrue(result.requiresFrontendEffect());
                assertEquals(components, received.get(received.size() - 1).get("components"));
            }
        }
        assertEquals(4, received.size());
    }

    @Test
    void reportsInnerJsonLocationAndReasonWhenStringComponentsCannotBeParsed() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            throw new AssertionError("转换失败不能创建前端等待操作");
        });
        // 与日志相同：第一个组件少了闭合括号，下一项被误认为对象字段。
        String missingBrace = "[{\"id\":\"gauge\",\"config\":{\"data\":{\"value\":0.92}}, {\"id\":\"value\"}]";
        for (String name : List.of("create_canvas_components", "render_draft")) {
            var result = validatePayloadOrExecute(catalog, componentsRequest(name, missingBrace), context());

            assertEquals("rejected", result.status());
            assertEquals("invalid_payload", result.result().get("code"));
            String message = result.result().get("message").toString();
            assertTrue(message.contains("components 字符串转换为数组失败"));
            assertTrue(message.contains("第 1 行"));
            assertTrue(message.contains("字符偏移"));
            assertTrue(message.contains("double-quote"));
            assertTrue(!result.requiresFrontendEffect());
        }
    }

    @Test
    void rejectsBlankOrTrailingJsonInStringComponents() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            throw new AssertionError("非法 JSON 不能下发前端");
        });
        for (String input : List.of("", " ", "[] {}", "[{\"id\":\"background\",}]")) {
            var result = validatePayloadOrExecute(catalog, componentsRequest("create_canvas_components", input), context());

            assertEquals("rejected", result.status());
            assertEquals("invalid_payload", result.result().get("code"));
            assertTrue(result.result().get("message").toString().contains("JSON 格式错误"));
            assertTrue(!result.requiresFrontendEffect());
        }
    }

    @Test
    void rejectsStringComponentsThatDecodeToNonArraysOrEmptyArrays() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            throw new AssertionError("非数组或空数组不能下发前端");
        });
        for (String name : List.of("create_canvas_components", "render_draft")) {
            for (String input : List.of("{}", "null", "1", "\"[]\"", "[]")) {
                var result = validatePayloadOrExecute(catalog, componentsRequest(name, input), context());

                assertEquals("rejected", result.status());
                assertEquals("invalid_payload", result.result().get("code"));
                assertTrue(result.result().get("message").toString().contains(
                        "[]".equals(input) ? "数组不能为空" : "解析结果不是 JSON 数组"));
                assertTrue(!result.requiresFrontendEffect());
            }
        }
    }

    @Test
    void convertedCreateComponentsStillRequireValidComponentFields() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            throw new AssertionError("转换成功不能绕过组件字段校验");
        });
        String missingConfig = "[{\"id\":\"title\",\"type\":\"BaseText\",\"x\":0,\"y\":0,\"width\":100,\"height\":30}]";
        var result = validatePayloadOrExecute(catalog, componentsRequest("create_canvas_components", missingConfig), context());

        assertEquals("rejected", result.status());
        assertEquals("invalid_create_component", result.result().get("code"));
        assertTrue(result.result().get("message").toString().contains("config"));
        assertTrue(!result.requiresFrontendEffect());
    }

    @Test
    void draftClearRejectsUnusedComponents() {
        var result = new AiAgentToolCatalog(null, stubGateway()).execute(ToolExecutionRequest.builder()
                .id("draft-clear").name("render_draft")
                .arguments(JSON.toJSONString(Map.of("action", "clear", "components", "invalid json")))
                .build(), context());

        assertEquals("rejected", result.status());
        assertFalse(result.requiresFrontendEffect());
    }

    @Test
    void malformedLegacyRenderArgumentsAreRejectedWithoutCreatingAFile(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var catalog = new AiAgentToolCatalog(null, stubGateway(), workspace);
        var result = catalog.execute(ToolExecutionRequest.builder().id("legacy-malformed-render").name("render_draft")
                .arguments("{\"action\":\"render\",\"components\":[").build(), context("1"));

        assertEquals("rejected", result.status());
        assertEquals("artifact_reference_required", result.result().get("code"));
        assertEquals(0, workspace.workspaceRevision(1));
    }

    @Test
    void previewSubmitsOnlyDraftIdentityWithoutCreatingAnArtifactOrValidatingComponents(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root.resolve("workspace"));
        int before = workspace.listWorkspaceFiles(1, "").totalEntries();
        List<Map<String, Object>> forwarded = new java.util.ArrayList<>();
        ComponentDocumentService documents = new ComponentDocumentService(root.resolve("documents").toString(), null, null) {
            @Override public List<Map<String, Object>> validateWrite(String operation, Map<String, Object> payload,
                                                                      List<Map<String, Object>> evidence,
                                                                      List<Map<String, Object>> dataEvidence, Long userId) {
                throw new AssertionError("总预览不得校验组件文档");
            }
        };
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, operationType, request, revision) -> {
            forwarded.add(new LinkedHashMap<>(request));
            return new AiAgentService.OperationView("preview-operation", operationType, "pending", Map.of(), revision, null, 0L);
        }, workspace, documents);
        var args = new LinkedHashMap<String, Object>();
        args.put("action", "preview");args.put("draftId", "ai-draft-123-abcd");args.put("expectedDraftRevision", 4);
        var result = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("preview").name("render_draft")
                .arguments(JSON.toJSONString(args)).build(), context("1"));

        assertEquals("pending", result.status());assertTrue(result.requiresFrontendEffect());
        assertEquals("preview", forwarded.get(0).get("action"));
        assertEquals("ai-draft-123-abcd", forwarded.get(0).get("draftId"));
        assertEquals(4, forwarded.get(0).get("expectedDraftRevision"));
        assertFalse(forwarded.get(0).containsKey("components"));assertFalse(forwarded.get(0).containsKey("path"));
        assertEquals(before, workspace.listWorkspaceFiles(1, "").totalEntries());

        for (String forbidden : List.of("components", "path")) {
            var invalid = new LinkedHashMap<>(args);invalid.put(forbidden, forbidden.equals("components") ? List.of(Map.of()) : "agent-artifacts/draft.json");
            var rejected = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("preview-invalid-" + forbidden).name("render_draft")
                    .arguments(JSON.toJSONString(invalid)).build(), context("1"));
            assertEquals("rejected", rejected.status(), forbidden);
            assertEquals("invalid_payload", rejected.result().get("code"), forbidden);
        }
        var invalidRevision = new LinkedHashMap<>(args);invalidRevision.put("expectedDraftRevision", "4");
        assertEquals("rejected", validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("preview-invalid-revision").name("render_draft")
                .arguments(JSON.toJSONString(invalidRevision)).build(), context("1")).status());
        var directAccept = new LinkedHashMap<>(args);directAccept.put("action", "accept");
        var rejectedAccept = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("preview-accept").name("render_draft")
                .arguments(JSON.toJSONString(directAccept)).build(), context("1"));
        assertEquals("rejected", rejectedAccept.status());
        assertEquals("artifact_reference_required", rejectedAccept.result().get("code"));
        assertEquals(1, forwarded.size());
    }

    @Test
    void rejectsInvalidRegionRenderMetadataBeforeFrontendDispatch() {
        List<Map<String, Object>> forwarded = new java.util.ArrayList<>();
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, (context, operationType, request, revision) -> {
            forwarded.add(request);
            return stubGateway().request(context, operationType, request, revision);
        });
        Map<String, Object> component = Map.of("id", "card", "type", "BaseColorBlock", "x", 0, "y", 0,
                "width", 100, "height", 50, "useDefaultConfig", true);
        List<Map<String, Object>> validLayout = List.of(Map.of("id", "header", "x", 0, "y", 0, "width", 100, "height", 50),
                Map.of("id", "body", "x", 0, "y", 50, "width", 100, "height", 100));
        List<Map<String, Object>> invalid = new java.util.ArrayList<>();
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "header", "layout", List.of(
                validLayout.get(0), Map.of("id", "header", "x", 0, "y", 50, "width", 100, "height", 100)), "incremental", false, "interactive", false)));
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "missing", "layout", validLayout, "incremental", false, "interactive", false)));
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "header", "layout", List.of(
                Map.of("id", "header", "x", -1, "y", 0, "width", 100, "height", 50)), "incremental", false, "interactive", false)));
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "header", "layout", validLayout, "incremental", false, "interactive", true)));
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "body", "incremental", true, "interactive", false)));
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "body", "draftId", "draft-1", "layout", validLayout, "incremental", true, "interactive", false)));
        invalid.add(new LinkedHashMap<>(Map.of("components", List.of(component), "regionId", "body", "draftId", "draft-1", "incremental", true, "interactive", true)));

        for (int index = 0; index < invalid.size(); index++) {
            var result = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("invalid-region-" + index).name("render_draft")
                    .arguments(JSON.toJSONString(invalid.get(index))).build(), context());
            assertEquals("rejected", result.status(), "case " + index + ": " + result.asJson());
            assertEquals("invalid_payload", result.result().get("code"));
        }
        assertTrue(forwarded.isEmpty());

        Map<String, Object> bodyComponent = Map.of("id", "body-card", "type", "BaseColorBlock", "x", 0, "y", 50,
                "width", 100, "height", 50, "useDefaultConfig", true);
        var validNextRegion = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("valid-next-region").name("render_draft")
                .arguments(JSON.toJSONString(Map.of("components", List.of(bodyComponent), "regionId", "body", "draftId", "draft-1",
                        "incremental", true, "interactive", false))).build(), context());
        assertEquals("pending", validNextRegion.status());
        assertEquals(1, forwarded.size());
        assertEquals("body", forwarded.get(0).get("regionId"));

        Map<String, Object> outOfBounds = Map.of("id", "too-tall", "type", "BaseColorBlock", "x", 0, "y", 0,
                "width", 100, "height", 51, "useDefaultConfig", true);
        var rejectedBounds = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder().id("invalid-region-bounds").name("render_draft")
                .arguments(JSON.toJSONString(Map.of("components", List.of(outOfBounds), "regionId", "header", "layout", validLayout,
                        "incremental", false, "interactive", false))).build(), context());
        assertEquals("rejected", rejectedBounds.status());
        assertEquals("invalid_create_component", rejectedBounds.result().get("code"));
        assertTrue(String.valueOf(rejectedBounds.result().get("message")).contains("超出 regionId"));
        assertEquals(1, forwarded.size());
    }

    private ToolExecutionRequest componentsRequest(String name, Object components) {
        return ToolExecutionRequest.builder().id("components-test").name(name)
                .arguments(JSON.toJSONString(Map.of("components", components))).build();
    }

    @Test
    void reportsJacksonLocationForInvalidToolArguments() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-invalid-json")
                .name("create_canvas_components")
                .arguments("{\"components\":[}")
                .build();

        com.zsq.datavisoolservice.global.AppException error = assertThrows(
                com.zsq.datavisoolservice.global.AppException.class,
                () -> validatePayloadOrExecute(catalog, request, context())
        );

        assertEquals(400, error.getCode());
        assertTrue(error.getMsg().contains("工具参数 JSON 格式错误"));
        assertTrue(error.getMsg().contains("第 1 行"));
        assertTrue(error.getMsg().contains("字符偏移"));
        assertTrue(error.getMsg().contains("Unexpected close marker"));
    }

    @Test
    void exposesOnlyTheValidatedFileReferenceForCreation() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, null);

        String schema = catalog.specifications().stream()
                .filter(specification -> "create_canvas_components".equals(specification.name()))
                .findFirst()
                .orElseThrow()
                .toJson();

        assertTrue(schema.contains("\"path\""));
        assertTrue(schema.contains("\"expectedRevision\""));
        assertFalse(schema.contains("\"components\""));
        assertFalse(schema.contains("\"config\""));
    }

    @Test
    void rejectsCreateWithoutExplicitConfigIntentBeforeFrontendExecution() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-create-missing-config")
                .name("create_canvas_components")
                .arguments("{\"components\":[{\"id\":\"title\",\"type\":\"BaseText\",\"x\":0,\"y\":0,\"width\":100,\"height\":30}]}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("rejected", result.status());
        assertEquals("invalid_create_component", result.result().get("code"));
        assertTrue(String.valueOf(result.result().get("message")).contains("config"));
        assertTrue(!result.requiresFrontendEffect());
    }

    @Test
    void rejectsTopLevelStyleAndDataForCreateBeforeFrontendExecution() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-create-flat-config")
                .name("create_canvas_components")
                .arguments("{\"components\":[{\"id\":\"title\",\"type\":\"BaseText\",\"x\":0,\"y\":0,\"width\":100,\"height\":30,\"style\":{\"color\":\"#fff\"}}]}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("rejected", result.status());
        assertEquals("invalid_create_component", result.result().get("code"));
        assertEquals("components[0].style", result.result().get("fieldPath"));
        assertEquals(Map.of("color", "#fff"), result.result().get("actualValue"));
        assertTrue(((java.util.Collection<?>) ((Map<?, ?>) result.result().get("expected")).get("allowedFields")).contains("config"));
        assertTrue(!result.requiresFrontendEffect());
    }

    @Test
    void acceptsConfiguredChartCreateWithDataAndFieldMapping() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-create-column")
                .name("create_canvas_components")
                .arguments(configuredColumnCreateArguments())
                .build();

        var result = validatePayloadOrExecute(catalog, request, context("project-1", "增加柱状图，数据自己模拟"));

        assertEquals("pending", result.status());
        assertTrue(result.requiresFrontendEffect());
    }

    @Test
    void acceptsExplicitDefaultConfigForNonDataComponent() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-create-default-color-block")
                .name("create_canvas_components")
                .arguments("{\"components\":[{\"id\":\"background\",\"type\":\"BaseColorBlock\",\"x\":0,\"y\":0,\"width\":600,\"height\":450,\"useDefaultConfig\":true}]}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("pending", result.status());
        assertTrue(result.requiresFrontendEffect());
    }

    @Test
    void rejectsPatchOutsideTaskStartSelection() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-patch-outside-selection")
                .name("patch_canvas_components")
                .arguments("{\"patches\":[{\"componentId\":\"component-2\",\"dataPatch\":{\"sourceType\":\"static\",\"staticData\":{\"value\":[]}}}]}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, contextWithSelection("component-1"));

        assertEquals("rejected", result.status());
        assertEquals("target_out_of_scope", result.result().get("code"));
        assertTrue(!result.requiresFrontendEffect());
    }

    @Test
    void acceptsDisplayPlanWithoutCompletionRequirements() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(stubAgentService(), null);
        var request = ToolExecutionRequest.builder().id("optional-plan").name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"读取页面\",\"status\":\"in_progress\"}]}").build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("appended", result.status());
        assertTrue(!result.result().containsKey("completionRequirements"));
        var schema = catalog.specifications().stream().filter(tool -> "update_plan".equals(tool.name()))
                .findFirst().orElseThrow().parameters();
        assertEquals(List.of("plan"), schema.required());
    }

    @Test
    void normalizesPlanToStepsAndKeepsCompletionRequirements() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(stubAgentService(), null);
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-plan")
                .name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"创建组件\",\"status\":\"in_progress\"}],"
                        + "\"completionRequirements\":{\"requiredCanvasEffects\":[\"createComponents\"]}}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("appended", result.status());
        assertEquals(result.result().get("plan"), result.result().get("steps"));
        assertEquals(List.of("createComponents"),
                ((Map<?, ?>) result.result().get("completionRequirements")).get("requiredCanvasEffects"));
    }

    @Test
    void rejectsMultipleInProgressPlanSteps() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(stubAgentService(), null);
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-plan-multiple-progress")
                .name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"第一步\",\"status\":\"in_progress\"},"
                        + "{\"step\":\"第二步\",\"status\":\"in_progress\"}],"
                        + "\"completionRequirements\":{\"requiredCanvasEffects\":[]}}")
                .build();

        assertThrows(com.zsq.datavisoolservice.global.AppException.class, () -> validatePayloadOrExecute(catalog, request, context()));
    }

    @Test
    void rejectsPlanStepWithoutStatus() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(stubAgentService(), null);
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-plan-missing-status")
                .name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"修改组件样式\"}],"
                        + "\"completionRequirements\":{\"requiredCanvasEffects\":[\"patchComponents\"]}}")
                .build();

        com.zsq.datavisoolservice.global.AppException error = assertThrows(
                com.zsq.datavisoolservice.global.AppException.class,
                () -> validatePayloadOrExecute(catalog, request, context())
        );

        assertEquals("plan[0].status 不合法", error.getMsg());
        assertEquals("plan[0].status", ((AiAgentErrorFeedback.Failure) error).result().get("fieldPath"));
    }

    @Test
    void rejectsUnsupportedCompletionEffect() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(stubAgentService(), null);
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-plan-invalid-effect")
                .name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"普通问答\",\"status\":\"completed\"}],"
                        + "\"completionRequirements\":{\"requiredCanvasEffects\":[\"replaceComponents\"]}}")
                .build();

        assertThrows(com.zsq.datavisoolservice.global.AppException.class, () -> validatePayloadOrExecute(catalog, request, context()));
    }

    @Test
    void rejectsToolScopeCrossingAnotherRun() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-1")
                .name("get_current_canvas_revision")
                .arguments("{\"projectId\":\"other-project\"}")
                .build();
        AiAgentService.AgentExecutionContext context = context();

        assertThrows(com.zsq.datavisoolservice.global.AppException.class, () -> validatePayloadOrExecute(catalog, request, context));
    }

    @Test
    void routesRevisionReadThroughFrontendGateway() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-1")
                .name("get_current_canvas_revision")
                .arguments("{}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("pending", result.status());
        assertEquals("frontend-get_current_canvas_revision", result.result().get("operationId"));
        assertTrue(result.requiresFrontendEffect());
    }

    @Test
    void rejectsFlatStylePayloadBeforeFrontendExecution() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-1")
                .name("patch_canvas_components")
                .arguments("{\"payloadJson\":\"{\\\"componentId\\\":\\\"component-1\\\",\\\"style\\\":{\\\"color\\\":\\\"#FF6B35\\\"}}\"}")
                .build();

        var result = validatePayloadOrExecute(catalog, request, context());

        assertEquals("rejected", result.status());
        assertEquals("invalid_payload", result.result().get("code"));
        assertTrue(!result.requiresFrontendEffect());
    }

    @Test
    void dataShortcutAllowsCreateComponents() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-data-create")
                .name("create_canvas_components")
                .arguments(configuredColumnCreateArguments())
                .build();

        var result = validatePayloadOrExecute(catalog, request, contextWithShortcut("data", "给组件模拟10条测试数据"));

        assertEquals("pending", result.status());
        assertTrue(result.requiresFrontendEffect());
    }

    @Test
    void allowsCreateWhenRequirementIncludesMockData() {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(null, stubGateway());
        ToolExecutionRequest request = ToolExecutionRequest.builder()
                .id("tool-create-with-mock-data")
                .name("create_canvas_components")
                .arguments(configuredColumnCreateArguments())
                .build();

        var result = validatePayloadOrExecute(catalog, request, context("project-1", "增加柱状图，数据自己模拟"));

        assertEquals("pending", result.status());
        assertTrue(result.requiresFrontendEffect());
    }

    private String configuredColumnCreateArguments() {
        return "{\"components\":[{\"id\":\"monthly-sales\",\"type\":\"AntdBaseColumn\",\"name\":\"月度销量\",\"x\":0,\"y\":0,\"width\":600,\"height\":450,\"config\":{\"data\":{\"sourceType\":\"static\",\"staticData\":{\"value\":[{\"name\":\"1月\",\"value\":100}]}},\"style\":{\"xField\":\"name\",\"yField\":\"value\"}}}]}";
    }

    @Test
    void appliesAndReadsProjectWorkspaceWithoutFrontendEffect(@TempDir Path storageRoot) {
        AiAgentToolCatalog catalog = new AiAgentToolCatalog(
                stubAgentService(), null, new AiAgentWorkspaceService(storageRoot));
        ToolExecutionRequest apply = ToolExecutionRequest.builder()
                .id("workspace-apply")
                .name("apply_workspace_patch")
                .arguments(JSON.toJSONString(Map.of(
                        "expectedRevision", 0,
                        "patch", "*** Begin Patch\n*** Add File: notes.txt\n+hello agent\n*** End Patch"
                )))
                .build();

        var applied = validatePayloadOrExecute(catalog, apply, context("1"));
        var read = validatePayloadOrExecute(catalog, ToolExecutionRequest.builder()
                .id("workspace-read")
                .name("read_workspace_file")
                .arguments("{\"path\":\"notes.txt\"}")
                .build(), context("1"));

        assertEquals("applied", applied.status());
        assertEquals(1L, ((Number) applied.result().get("workspaceRevision")).longValue());
        assertTrue(!applied.requiresFrontendEffect());
        assertEquals("completed", read.status());
        assertEquals("hello agent", ((Map<?, ?>) read.result().get("excerpt")).get("content"));
    }

    // Canvas create/patch/render payloads are validated after a staged file is loaded.
    private AiAgentToolCatalog.ToolResult validatePayloadOrExecute(AiAgentToolCatalog catalog, ToolExecutionRequest request,
                                                                    AiAgentService.AgentExecutionContext context) {
        if (List.of("create_canvas_components", "patch_canvas_components", "render_draft").contains(request.name())) {
            Map<String, Object> args = org.springframework.test.util.ReflectionTestUtils.invokeMethod(catalog, "parseArguments", request.arguments());
            Object action = args.get("action");
            if (!args.containsKey("path") && !List.of("preview", "clear", "accept").contains(action == null ? "" : action)) {
                java.util.function.Consumer<Map<String, Object>> callback = ignored -> {};
                return org.springframework.test.util.ReflectionTestUtils.invokeMethod(catalog, "executeParsed", request, context,
                        new LinkedHashMap<>(args), callback);
            }
        }
        return catalog.execute(request, context);
    }

    private AiAgentService stubAgentService() {
        return new AiAgentService() {
            @Override
            public AiAgentService.ItemView appendItem(AiAgentService.AgentExecutionContext context,
                                                       String type, Map<String, Object> payload) {
                return null;
            }

            @Override
            public void appendEvent(String threadId, String turnId, String runId,
                                     String type, Map<String, Object> payload) {
                // 计划标准化测试不需要持久化事件。
            }

            @Override
            public List<String> declareCompletionRequirements(AiAgentService.AgentExecutionContext context,
                                                               List<String> requestedEffects) {
                return requestedEffects == null ? List.of() : requestedEffects;
            }
        };
    }

    private FrontendEffectGateway stubGateway() {
        return (context, operationType, request, baseRevision) ->
                new AiAgentService.OperationView(
                        "frontend-" + operationType,
                        operationType,
                        "pending",
                        Map.of(),
                        baseRevision,
                        null,
                        0L
                );
    }

    private AiAgentService.AgentExecutionContext context() {
        return context("project-1");
    }

    private AiAgentService.AgentExecutionContext context(String projectId) {
        return context(projectId, "hello");
    }

    private AiAgentService.AgentExecutionContext context(String projectId, String inputText) {
        Map<String, Object> canvas = new LinkedHashMap<>();
        canvas.put("revision", 42L);
        return new AiAgentService.AgentExecutionContext(
                "thread-1", projectId, "turn-1", "run-1", "user-1", inputText,
                Map.of("canvasRevision", 42L), Map.of("mode", "none"), canvas,
                null, null, 0
        );
    }

    private AiAgentService.AgentExecutionContext contextWithSelection(String... targetIds) {
        Map<String, Object> canvas = new LinkedHashMap<>();
        canvas.put("revision", 42L);
        Map<String, Object> selection = new LinkedHashMap<>();
        selection.put("mode", "single");
        selection.put("targetIds", List.of(targetIds));
        selection.put("components", List.of());
        return new AiAgentService.AgentExecutionContext(
                "thread-1", "project-1", "turn-1", "run-1", "user-1", "更新数据",
                Map.of("canvasRevision", 42L), selection, canvas,
                null, null, 0
        );
    }

    private AiAgentService.AgentExecutionContext contextWithShortcut(String command, String inputText) {
        Map<String, Object> canvas = new LinkedHashMap<>();
        canvas.put("revision", 42L);
        return new AiAgentService.AgentExecutionContext(
                "thread-1", "project-1", "turn-1", "run-1", "user-1", inputText,
                Map.of("canvasRevision", 42L, "shortcut", Map.of("command", command)), Map.of("mode", "none"), canvas,
                null, null, 0
        );
    }
}
