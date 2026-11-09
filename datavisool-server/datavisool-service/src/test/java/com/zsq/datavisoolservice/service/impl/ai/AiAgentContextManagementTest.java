/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.service.UserAgentConfigService;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;
import java.lang.reflect.Proxy;

import static com.zsq.datavisoolservice.service.impl.ai.AiAgentContextHistory.*;
import static org.junit.jupiter.api.Assertions.*;

class AiAgentContextManagementTest {
    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }
    private final AiAgentRuntimeSettingsService.Context limits = new AiAgentRuntimeSettingsService.Context(
            4_096, 90, 512, 2_048, 512, 512);

    @Test void usesNinetyPercentOfModelWindowWithoutEarlierLocalBudgets() {
        assertEquals(5_529, manager(6_144L, 3_000L, List.of()).inputLimit());
        assertEquals(115_200, manager(128_000L, 4_096L, List.of()).inputLimit());
        var unknown = manager(null, null, List.of());
        assertEquals(32_000, unknown.capacity());
        assertEquals("fallback", unknown.capacitySource());
        assertEquals(28_800, unknown.inputLimit());
        assertNull(unknown.outputLimit(1_000));
        var legacyLimits = new AiAgentRuntimeSettingsService.Context(4_096, 50, 512, 2_048, 512, 512);
        assertEquals(115_200, new AiAgentContextManager(128_000L, 4_096L, legacyLimits, List.of()).inputLimit());
    }

    @Test void compactsOnlyAboveNinetyPercentAndBoundsOutputToRemainingSpace() {
        var manager = manager(10_000L, 3_000L, List.of());
        List<ChatMessage> source = base();
        manager.recordResponse(9_000, manager.estimate(source));
        assertEquals(9_000, manager.prepare(source).tokens());
        assertFalse(manager.prepare(source).requiresCompaction());
        source.add(AiMessage.from("新增消息"));
        assertTrue(manager.prepare(source).requiresCompaction());
        assertEquals(1_000, manager.outputLimit(9_000));
    }

    @Test void cumulativeCompactionUsesConfiguredPercentAtTheExactBoundary() {
        var configured = new AiAgentRuntimeSettingsService.Context(4_096, 75, 512, 2_048, 512, 512);
        var manager = new AiAgentContextManager(1_000_000L, 4_096L, configured, List.of());
        assertEquals(750_000, manager.compactionThresholdTokens());
        assertFalse(manager.cumulativeCompactionRequired(749_999));
        assertTrue(manager.cumulativeCompactionRequired(750_000));
        assertFalse(manager.prepare(base()).requiresCompaction());
        assertEquals(900_000, manager.inputLimit()); // 单次请求仍独立保留容量保护。
        assertEquals(28_800, manager(null, null, List.of()).compactionThresholdTokens());
    }

    @Test void modelCatalogUsesConcreteModelAndRejectsUnknownModelWindows() {
        assertEquals(1_050_000L, AiDrivenModelCatalog.contextWindowTokens("openai", "gpt-5.5"));
        assertNull(AiDrivenModelCatalog.contextWindowTokens("openai", "custom-model"));
        assertNull(AiDrivenModelCatalog.contextWindowTokens("custom", "gpt-5.5"));
    }

    @Test void includesUtf8AndToolSchemasInCapacityEstimate() {
        List<ChatMessage> messages = List.of(UserMessage.from("中文😀".repeat(200)));
        var tool = ToolSpecification.builder().name("large_schema").description("说明".repeat(20_000)).build();
        var small = manager(null, null, List.of());
        var large = manager(null, null, List.of(tool));
        assertTrue(small.estimate(messages) > 500);
        assertTrue(large.prepare(messages).requiresCompaction());
        assertTrue(large.estimate(messages) > small.estimate(messages) + 7_000);
    }

    @Test void correctsActualUsageByOnlyAddingNewMessageGrowth() {
        var manager = manager(null, null, List.of());
        List<ChatMessage> initial = List.of(UserMessage.from("目标"));
        long before = manager.estimate(initial);
        manager.recordResponse(28_500, before);
        List<ChatMessage> next = List.of(initial.get(0), AiMessage.from("继续".repeat(300)));
        assertEquals(28_500 + manager.estimate(next) - before, manager.prepare(next).tokens());
        assertTrue(manager.prepare(next).requiresCompaction());
    }

    @Test void normalizesMissingDuplicateAndOrphanResultsWithoutSplittingBatch() {
        var first = call("one", "read_workspace_file");
        var second = call("two", "inspect_current_page");
        var ai = AiMessage.builder().text("读取").thinking("签名上下文").toolExecutionRequests(List.of(first, second))
                .attributes(Map.of("signature", "keep-me")).build();
        List<ChatMessage> source = List.of(ToolExecutionResultMessage.from("orphan", "read", "{}"), ai,
                ToolExecutionResultMessage.from(first, "{}"), ToolExecutionResultMessage.from(first, "duplicate"));
        List<ChatMessage> normalized = normalize(source);
        assertSame(ai, normalized.get(0));
        assertEquals(3, normalized.size());
        assertTrue(((ToolExecutionResultMessage) normalized.get(2)).text().contains("tool_result_unavailable"));
        assertClosedPairs(normalized);
    }

    @Test void projectsRecentResultsFirstAndKeepsOriginalAuditContent() {
        List<ChatMessage> source = base();
        for (int i = 0; i < 20; i++) addTool(source, "read-" + i, "read_workspace_file",
                Map.of("path", "file-" + i, "content", "内容".repeat(2_000)));
        String audit = new JacksonChatMessageJsonCodec().messagesToJson(source);
        List<ChatMessage> projected = project(source, 512, 2_048, false);
        assertTrue(toolBytes(projected) <= 8_192);
        assertTrue(projected.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).allMatch(result -> bytes(result.text()) <= 2_048));
        assertEquals(audit, new JacksonChatMessageJsonCodec().messagesToJson(source));
        assertClosedPairs(projected);
    }

    @Test void constrainedProjectionKeepsStructuredErrorsAndEachFailureAssociation() {
        List<ChatMessage> source = base();
        Map<String, Object> first = Map.of("componentId", "card-left", "componentType", "BaseText", "path", "left",
                "fieldPath", "components[0].config.style.color", "actualValue", "#fff", "actualType", "string",
                "expected", "valid hex color", "recovery", "Use a supported color.");
        Map<String, Object> second = Map.of("componentId", "card-right", "componentType", "BaseColorBlock", "path", "right",
                "fieldPath", "components[1].width", "actualValue", -1, "actualType", "number",
                "expected", "positive number", "recovery", "Set width above zero.");
        addTool(source, "failed-write", "patch_canvas_components", Map.of("status", "failed", "code", "validation_failed",
                "message", "Two components failed validation", "errors", List.of(first, second), "guard", "x".repeat(12_000)));
        String audit = new JacksonChatMessageJsonCodec().messagesToJson(source);

        List<ChatMessage> projected = project(source, 512, 512, false);
        ToolExecutionResultMessage projectedResult = projected.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        Map<String, Object> payload = JSON.parseObject(projectedResult.text());
        List<?> diagnostics = (List<?>) payload.get("diagnostics");
        assertNotNull(diagnostics);
        Map<?, ?> diagnostic = (Map<?, ?>) diagnostics.get(0);
        assertEquals("validation_failed", diagnostic.get("code"));
        assertEquals("Two components failed validation", diagnostic.get("message"));
        List<?> errors = (List<?>) diagnostic.get("errors");
        assertEquals(2, errors.size());
        Map<?, ?> left = (Map<?, ?>) errors.get(0);
        Map<?, ?> right = (Map<?, ?>) errors.get(1);
        assertEquals("card-left", left.get("componentId"));
        assertEquals("left", left.get("path"));
        assertEquals("#fff", left.get("actualValue"));
        assertEquals("valid hex color", left.get("expected"));
        assertEquals("Use a supported color.", left.get("recovery"));
        assertEquals("card-right", right.get("componentId"));
        assertEquals("right", right.get("path"));
        assertEquals(-1, right.get("actualValue"));
        assertEquals("positive number", right.get("expected"));
        assertTrue(bytes(projectedResult.text()) <= bytesForTokens(512));
        assertEquals(audit, new JacksonChatMessageJsonCodec().messagesToJson(source));
    }

    @Test void constrainedProjectionRetainsArtifactVersionAndRecoveryLocation() {
        List<ChatMessage> source = base();
        Map<String, Object> feedback = new LinkedHashMap<>();
        feedback.putAll(Map.of("code", "invalid_payload", "fieldPath", "components[1].width", "actualValue", 0,
                "expected", "positive number", "path", "agent-repairs/file.json", "workspaceRevision", 9,
                "repairTool", "repair_artifact", "charOffset", 2400, "contextStartOffset", 2280));
        feedback.put("action", "write repair metadata");
        feedback.put("metadataPath", ".datavisool-agent-workspace/repairs/file.json");
        feedback.put("exceptionType", "java.nio.file.AccessDeniedException");
        feedback.put("guard", "x".repeat(9000));
        addTool(source, "repair", "render_draft", feedback);
        ToolExecutionResultMessage projected = project(source, 512, 512, false).stream()
                .filter(ToolExecutionResultMessage.class::isInstance).map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        Map<?, ?> diagnostic = (Map<?, ?>) JSON.parseObject(projected.text()).getJSONArray("diagnostics").get(0);
        for (String key : List.of("fieldPath", "actualValue", "expected", "path", "workspaceRevision", "repairTool", "charOffset", "contextStartOffset",
                "action", "metadataPath", "exceptionType"))
            assertEquals(feedback.get(key), diagnostic.get(key), key);
    }

    @Test void successfulWritesWithAnEmptyFailureListRemainOrdinaryResultsDuringProjection() {
        Map<String, Object> success = Map.of("status", "applied", "operationId", "op-1", "failed", List.of(), "applied", List.of("a"));
        assertFalse(facts(JSON.toJSONString(success)).containsKey("diagnostics"));
        assertEquals("op-1", facts(JSON.toJSONString(success)).get("operationId"));
    }

    @Test void constrainedProjectionRetainsDeletionVerificationAndCleanupFailures() {
        List<ChatMessage> source = base();
        Map<String, Object> cause = Map.of("code", "state_unavailable", "fieldPath", "layerConfigs",
                "actualValue", "unknown", "expected", "readable current configurations");
        Map<String, Object> failure = Map.of("componentId", "card-a", "code", "delete_state_unknown",
                "fieldPath", "layer.card-a", "actualValue", "unknown", "expectedValue", "absent",
                "cause", cause, "verificationError", cause);
        Map<String, Object> feedback = Map.of("status", "failed", "failed", List.of(failure),
                "deletedComponentIds", List.of("card-b"), "partial", true, "cleanupStateUnknown", true,
                "operationError", cause, "actualState", List.of(Map.of("componentId", "card-a", "state", "unknown")),
                "guard", "x".repeat(9000));
        addTool(source, "delete", "delete_canvas_components", feedback);
        ToolExecutionResultMessage projected = project(source, 512, 512, false).stream()
                .filter(ToolExecutionResultMessage.class::isInstance).map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        Map<?, ?> diagnostic = (Map<?, ?>) JSON.parseObject(projected.text()).getJSONArray("diagnostics").get(0);
        assertEquals(true, diagnostic.get("cleanupStateUnknown"));
        assertEquals(cause, diagnostic.get("operationError"));
        assertEquals(List.of("card-b"), diagnostic.get("deletedComponentIds"));
        assertEquals(feedback.get("actualState"), diagnostic.get("actualState"));
        Map<?, ?> item = (Map<?, ?>) ((List<?>) diagnostic.get("failed")).get(0);
        assertEquals(cause, item.get("verificationError"));
        assertEquals(cause, item.get("cause"));
    }

    @Test void constrainedProjectionPreservesExplicitNullActualValue() {
        List<ChatMessage> source = base();
        var call = call("null-actual", "patch_canvas_components");
        source.add(AiMessage.from(call));
        source.add(ToolExecutionResultMessage.from(call,
                "{\"code\":\"component_not_found\",\"message\":\"目标组件不存在\",\"componentId\":\"card-1\",\"fieldPath\":\"componentId\",\"actualValue\":null,\"actualType\":\"null\",\"expected\":\"当前画布存在此组件\",\"guard\":\"" + "x".repeat(9000) + "\"}"));

        List<ChatMessage> projected = project(source, 512, 512, false);
        ToolExecutionResultMessage projectedResult = projected.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        Map<String, Object> payload = JSON.parseObject(projectedResult.text());
        Map<?, ?> diagnostic = (Map<?, ?>) ((List<?>) payload.get("diagnostics")).get(0);
        assertTrue(diagnostic.containsKey("actualValue"));
        assertNull(diagnostic.get("actualValue"));
        assertEquals("null", diagnostic.get("actualType"));
    }

    @Test void failsExplicitlyWhenErrorDiagnosticsCannotFitAndNeverReplacesThemWithAReference() {
        List<ChatMessage> source = base();
        addTool(source, "tiny-budget-error", "patch_canvas_components", Map.of("code", "invalid_component",
                "message", "Width is invalid", "componentId", "card-1", "componentType", "BaseText",
                "path", "left", "fieldPath", "width", "actualValue", -1, "actualType", "number",
                "expected", "positive number", "recovery", "Set a positive width."));
        String audit = new JacksonChatMessageJsonCodec().messagesToJson(source);

        assertThrows(CapacityExceeded.class, () -> project(source, 8, 8, false));
        assertEquals(audit, new JacksonChatMessageJsonCodec().messagesToJson(source));
    }

    @Test void projectedPartialFailureRetainsExpectedValuesAndChangedPathsPerComponent() {
        List<ChatMessage> source = base();
        Map<String, Object> failedComponent = Map.of("componentId", "card-a", "componentType", "BaseText",
                "code", "style_patch_not_applied", "message", "样式未按请求生效", "fieldPath", "style.color",
                "expectedValue", "#ff0000", "actualValue", "#000000", "actualType", "string",
                "changedPaths", List.of(Map.of("fieldPath", "style.color", "expectedValue", "#ff0000", "currentValue", "#000000")));
        Map<String, Object> partial = Map.of("status", "failed", "code", "canvas_partial_failure",
                "message", "部分组件无法回滚", "partial", true, "failed", List.of(failedComponent),
                "rollbackFailedComponentIds", List.of("card-a"),
                "partiallyApplied", List.of(Map.of("componentId", "card-a", "componentType", "BaseText", "style", Map.of("color", "#000000"))),
                "guard", "x".repeat(12_000));
        addTool(source, "partial-style", "patch_canvas_components", partial);

        List<ChatMessage> projected = project(source, 512, 512, false);
        Map<String, Object> payload = JSON.parseObject(projected.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow().text());
        Map<?, ?> diagnostic = (Map<?, ?>) ((List<?>) payload.get("diagnostics")).get(0);
        assertEquals(true, diagnostic.get("partial"));
        assertEquals(List.of("card-a"), diagnostic.get("rollbackFailedComponentIds"));
        Map<?, ?> failed = (Map<?, ?>) ((List<?>) diagnostic.get("failed")).get(0);
        assertEquals("card-a", failed.get("componentId"));
        assertEquals("#ff0000", failed.get("expectedValue"));
        assertEquals("#000000", failed.get("actualValue"));
        Map<?, ?> changed = (Map<?, ?>) ((List<?>) failed.get("changedPaths")).get(0);
        assertEquals("style.color", changed.get("fieldPath"));
        assertEquals("#ff0000", changed.get("expectedValue"));
        assertEquals("#000000", changed.get("currentValue"));
        assertEquals("card-a", ((Map<?, ?>) ((List<?>) diagnostic.get("partiallyApplied")).get(0)).get("componentId"));
    }

    @Test void newestFullSpecsAreNeverTruncatedAndOversizedBatchFailsExplicitly() {
        List<ChatMessage> source = base();
        addTool(source, "spec", AiAgentComponentSpecs.TOOL_NAME, Map.of("configurable", "内容".repeat(20_000)));
        var projected = project(source, 512, 2_048, true);
        assertEquals(source.get(3), projected.get(3));
        assertThrows(CapacityExceeded.class, () -> manager(null, null, List.of()).compact(source, "摘要", Map.of()));
    }

    @Test void compactsToolChainWithoutAdditionalUserMessageAndPreservesSteering() {
        List<ChatMessage> source = base();
        source.add(UserMessage.from("用户在运行中追加要求：保留原有组件"));
        for (int i = 0; i < 25; i++) {
            source.add(AiMessage.from("冗长分析".repeat(600)));
            addTool(source, "read-" + i, "get_component_document", Map.of("section", "style", "text", "x".repeat(4_000)));
        }
        var manager = manager(null, null, List.of());
        assertTrue(manager.prepare(source).requiresCompaction());
        List<ChatMessage> compacted = manager.compact(source, "任务继续，已读取样式", Map.of("totalTokens", 4_000));
        assertTrue(manager.estimate(compacted) <= manager.inputLimit());
        assertTrue(compacted.contains(source.get(0)));
        assertFalse(compacted.contains(source.get(1))); // 历史要求随完成结果一起进入整体摘要，不能变回待办。
        assertTrue(compacted.contains(source.get(2)));
        assertTrue(compacted.contains(source.get(source.size() - 2)));
        assertClosedPairs(compacted);
    }

    @Test void carriesOperationReferencesAcrossRepeatedCompactionsAndClearsTerminalPendingState() {
        List<ChatMessage> source = base();
        addTool(source, "write", "patch_canvas_components", Map.of("operationId", "op-1", "status", "pending"));
        var manager = manager(null, null, List.of());
        List<ChatMessage> first = manager.compact(source, "等待写入", Map.of());
        List<ChatMessage> second = new ArrayList<>(first.stream()
                .filter(message -> !(message instanceof AiMessage) && !(message instanceof ToolExecutionResultMessage)).toList());
        addTool(second, "verify", "get_canvas_operation_status", Map.of("operationId", "op-1", "status", "applied", "resultRevision", 7));
        List<ChatMessage> third = manager.compact(second, "已完成写入", Map.of());
        Map<String, Object> digest = JSON.parseObject(stateDigest(third, 512));
        assertEquals(List.of("op-1"), digest.get("operationIds"));
        assertEquals(List.of(), digest.get("pendingOperationIds"));
        assertEquals(7, ((Map<?, ?>) digest.get("canvas")).get("resultRevision"));
        assertEquals(1, third.stream().filter(AiAgentContextHistory::isSummary).count());
    }

    @Test void digestCapturesPlanReadVersionsAndErrorsBeforeProjection() {
        List<ChatMessage> source = base();
        var plan = ToolExecutionRequest.builder().id("plan").name("update_plan")
                .arguments("{\"plan\":[{\"step\":\"修改组件\",\"status\":\"in_progress\"}]}").build();
        source.add(AiMessage.from(plan));
        source.add(ToolExecutionResultMessage.from(plan, "{\"status\":\"applied\"}"));
        addTool(source, "read", "get_component_data_contract", Map.of("corpusVersion", "v2", "sourceType", "static"));
        addTool(source, "write", "patch_canvas_components", Map.of("code", "conflict", "status", "failed",
                "operationId", "failed-op", "revision", 9, "large", "x".repeat(20_000)));
        var digest = JSON.parseObject(stateDigest(source, 512));
        assertNotNull(digest.get("latestPlan"));
        assertTrue(JSON.toJSONString(digest.get("documentAndWorkspaceReads")).contains("v2"));
        assertTrue(JSON.toJSONString(digest.get("latestStructuredError")).contains("conflict"));
        assertEquals(List.of(), digest.get("pendingOperationIds"));
    }

    @Test void digestKeepsAllOperationReferencesOrStopsRatherThanSilentlyDroppingThem() {
        List<ChatMessage> source = base();
        for (int i = 0; i < 30; i++) addTool(source, "write-" + i, "patch_canvas_components",
                Map.of("operationId", "op-" + i, "status", "pending", "message", "x".repeat(1_000)));
        var references = JSON.parseObject(stateDigest(source, 512));
        assertEquals(30, ((Collection<?>) references.get("operationIds")).size());
        assertThrows(CapacityExceeded.class, () -> stateDigest(source, 8));
    }

    @Test void summaryReceivesCompleteHistoryAndToolResultsWithoutLocalProjection() {
        List<ChatMessage> source = base();
        for (int i = 0; i < 8; i++) {
            source.add(AiMessage.from("已完成任务 " + i));
            addTool(source, "read-" + i, "get_component_document", Map.of("text", "x".repeat(3_400)));
        }
        var manager = manager(8_192L, null, List.of());
        assertTrue(manager.prepare(source).requiresCompaction());
        var request = manager.summaryRequest(source);
        assertTrue(request.maxOutputTokens() > 0 && request.maxOutputTokens() <= 512);
        assertTrue(manager.estimate(request.messages()) + request.maxOutputTokens() <= manager.capacity());
        assertTrue(request.messages().contains(source.get(1)));
        assertEquals(source.subList(1, source.size()), request.messages().subList(1, request.messages().size()));
        assertTrue(((SystemMessage) request.messages().get(0)).text().contains("不得把历史请求重新列为待办"));
        assertClosedPairs(request.messages());
    }

    @Test void oversizedRequirementsOrToolSchemasCannotBeSent() {
        var manager = manager(8_192L, null, List.of());
        List<ChatMessage> source = List.of(UserMessage.from("要求".repeat(20_000)));
        assertThrows(CapacityExceeded.class, () -> manager.summaryRequest(source));
        assertThrows(CapacityExceeded.class, () -> manager.compact(source, "摘要", Map.of()));
        var tool = ToolSpecification.builder().name("tool").description("x".repeat(150_000)).build();
        assertThrows(CapacityExceeded.class, () -> manager(null, null, List.of(tool)).compact(base(), "摘要", Map.of()));
    }

    @Test void multimodalRequirementsSurviveCompactionAndUtf8TruncationIsValid() {
        var image = UserMessage.from(TextContent.from("修改这个画布"), ImageContent.from("aGVsbG8=", "image/png"));
        List<ChatMessage> source = new ArrayList<>(List.of(SystemMessage.from("安全边界"), image));
        assertTrue(manager(null, null, List.of()).compact(source, "摘要", Map.of()).contains(image));
        assertEquals("中😀", truncate("中😀文", 7));
        assertEquals("中", truncate("中😀文", 6));
    }

    @Test void versionTwoSettingsPreserveValuesAndBudgetsAreValidated() throws Exception {
        User user = new User(); user.setId(1L); user.setRoles(List.of("ROLE_USER")); user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        var settingsService = new AiAgentRuntimeSettingsService();
        String storedV2 = "{\"schemaVersion\":2,\"context\":{\"maxToolResultTokens\":50000,\"compactAtPercent\":75},\"modelRequest\":{\"timeoutSeconds\":300}}";
        var config = (UserAgentConfigService) Proxy.newProxyInstance(UserAgentConfigService.class.getClassLoader(),
                new Class<?>[]{UserAgentConfigService.class}, (proxy, method, args) -> {
                    if (method.getName().equals("getConfig")) return storedV2;
                    if (method.getName().equals("saveConfig")) return null;
                    throw new UnsupportedOperationException(method.getName());
                });
        ReflectionTestUtils.setField(settingsService, "userAgentConfigService", config);
        ReflectionTestUtils.setField(settingsService, "objectMapper", new ObjectMapper());
        var stored = settingsService.load(1L);
        assertEquals(50_000, stored.context().maxToolHistoryTokens());
        assertEquals(4_096, stored.context().maxStateDigestTokens());
        assertEquals(75, stored.context().compactAtPercent());
        assertEquals(300, stored.modelRequest().timeoutSeconds());
        assertThrows(AppException.class, () -> settingsService.save(new ObjectMapper().readTree(
                "{\"schemaVersion\":2,\"context\":{\"maxToolHistoryTokens\":2048}}")));
        assertThrows(AppException.class, () -> settingsService.save(new ObjectMapper().readTree(
                "{\"schemaVersion\":2,\"context\":{\"maxStateDigestTokens\":10}}")));
    }

    @Test void asyncReceiptsRefreshCompleteResultsAndPendingReferencesAfterResume() {
        List<ChatMessage> source = base();
        addTool(source, "write", "patch_canvas_components", Map.of("operationId", "op-async", "status", "pending"));
        List<ChatMessage> compacted = manager(null, null, List.of()).compact(source, "等待画布", Map.of());
        var receipt = new AiAgentService.OperationView("op-async", "patch_canvas_components", "applied",
                Map.of("componentIds", List.of("component-1")), "4", "5", 123L);
        List<ChatMessage> refreshed = refreshReceipts(compacted, List.of(receipt), 512);
        var digest = JSON.parseObject(stateDigest(refreshed, 512));
        assertEquals(List.of(), digest.get("pendingOperationIds"));
        var result = refreshed.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        assertEquals("applied", facts(result.text()).get("status"));
        assertTrue(result.text().contains("component-1"));
        assertClosedPairs(refreshed);
        List<ChatMessage> digestOnly = compacted.stream()
                .filter(message -> !(message instanceof AiMessage) && !(message instanceof ToolExecutionResultMessage)).toList();
        assertEquals(List.of(), JSON.parseObject(stateDigest(refreshReceipts(digestOnly, List.of(receipt), 512), 512)).get("pendingOperationIds"));
    }

    @Test void draftReceiptKeepsDraftIdentityAndRevisionAcrossResumeAndCompaction() {
        List<ChatMessage> source = base();
        addTool(source, "region-render", "render_draft", Map.of("operationId", "draft-op", "status", "pending"));
        var receipt = new AiAgentService.OperationView("draft-op", "render_draft", "applied",
                Map.of("status", "draft-rendered", "draftId", "draft-1", "revision", 7,
                        "regionId", "hero", "layerCount", 4), null, null, 123L);

        List<ChatMessage> refreshed = refreshReceipts(source, List.of(receipt), 512);
        var result = refreshed.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        assertEquals("draft-1", facts(result.text()).get("draftId"));
        assertEquals(7, facts(result.text()).get("revision"));

        Map<String, Object> digest = JSON.parseObject(stateDigest(refreshed, 512));
        assertTrue(JSON.toJSONString(digest).contains("draft-1"));
        assertTrue(JSON.toJSONString(digest).contains("hero"));
    }

    @Test void successfulIconWriteKeepsHistoricalCompletionAndEveryMessageIntact() {
        List<ChatMessage> source = new ArrayList<>(List.of(SystemMessage.from("安全边界"),
                UserMessage.from("生成标题"), AiMessage.from("标题已生成"),
                UserMessage.from("生成一个图标"), AiMessage.from("准备创建图标")));
        addTool(source, "read", "resolve_component_specs", Map.of("specs", List.of()));
        addTool(source, "failed", "patch_canvas_components", Map.of("status", "failed", "code", "conflict"));
        addTool(source, "write", "patch_canvas_components", Map.of("operationId", "op", "status", "applied"));
        source.add(AiMessage.from("写入后仍需完成的下一步"));
        var manager = manager(null, null, List.of());
        var window = manager.prepare(source);
        assertEquals(source, window.messages());
        assertTrue(window.messages().contains(AiMessage.from("标题已生成")));
        assertClosedPairs(window.messages());
        assertFalse(window.requiresCompaction());
    }

    @Test void ordinaryRequestKeepsToolResultsBeyondLegacyIndividualAndTotalBudgets() {
        List<ChatMessage> source = base();
        for (int i = 0; i < 4; i++) addTool(source, "read-" + i, "read_workspace_file",
                Map.of("content", "完整内容".repeat(700), "path", "file-" + i));
        var window = manager(null, null, List.of()).prepare(source);
        assertTrue(toolBytes(source) > bytesForTokens(limits.maxToolHistoryTokens()));
        assertEquals(source, window.messages());
        assertFalse(window.requiresCompaction());
    }

    private AiAgentContextManager manager(Long window, Long output, List<ToolSpecification> tools) {
        return new AiAgentContextManager(window, output, limits, tools);
    }
    private static List<ChatMessage> base() {
        return new ArrayList<>(List.of(SystemMessage.from("安全边界"), UserMessage.from("保留现有组件并调整样式")));
    }
    private static ToolExecutionRequest call(String id, String name) {
        return ToolExecutionRequest.builder().id(id).name(name).arguments("{}").build();
    }
    private static void addTool(List<ChatMessage> source, String id, String name, Map<String, Object> result) {
        var call = call(id, name);
        source.add(AiMessage.from(call));
        source.add(ToolExecutionResultMessage.from(call, JSON.toJSONString(result)));
    }
    private static void assertClosedPairs(List<ChatMessage> source) {
        for (List<ChatMessage> group : groups(source)) {
            if (group.get(0) instanceof AiMessage ai && ai.hasToolExecutionRequests()) {
                assertEquals(ai.toolExecutionRequests().size() + 1, group.size());
                for (int i = 0; i < ai.toolExecutionRequests().size(); i++) {
                    assertEquals(ai.toolExecutionRequests().get(i).id(), ((ToolExecutionResultMessage) group.get(i + 1)).id());
                }
            } else assertFalse(group.get(0) instanceof ToolExecutionResultMessage);
        }
    }
}
