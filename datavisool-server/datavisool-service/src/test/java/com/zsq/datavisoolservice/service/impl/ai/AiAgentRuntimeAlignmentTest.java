/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.service.UserAgentConfigService;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.model.anthropic.AnthropicTokenUsage;
import dev.langchain4j.model.openai.OpenAiTokenUsage;
import dev.langchain4j.model.output.TokenUsage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.Proxy;
import java.util.*;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentToolCatalog.ToolResult;
import static org.junit.jupiter.api.Assertions.*;

class AiAgentRuntimeAlignmentTest {
    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }
    @Test void versionTwoKeepsIndependentBudgetSwitchesAndRejectsOtherVersions() throws Exception {
        var fresh = AiAgentRuntimeSettingsService.RuntimeSettings.defaults();
        assertFalse(fresh.execution().tokenBudgetEnabled()); assertFalse(fresh.execution().callBudgetEnabled());
        assertFalse(fresh.execution().durationBudgetEnabled());
        var service = settings();
        var mapper = new ObjectMapper();
        var modern = service.save(mapper.readTree("""
                {"schemaVersion":2,"execution":{"maxTotalTokens":50000,"maxModelCalls":6,
                 "tokenBudgetEnabled":true,"durationBudgetEnabled":false}}
                """));
        assertEquals(2, modern.schemaVersion());
        assertEquals(50000, modern.execution().maxTotalTokens()); assertEquals(6, modern.execution().maxModelCalls());
        assertTrue(modern.execution().tokenBudgetEnabled()); assertFalse(modern.execution().callBudgetEnabled());
        assertFalse(modern.execution().durationBudgetEnabled());
        assertEquals(modern, service.save(mapper.valueToTree(modern)));
        var previousV2 = service.save(mapper.readTree("""
                {"schemaVersion":2,"legacyBudgetsPreserved":true,
                 "execution":{"tokenBudgetEnabled":true,"callBudgetEnabled":false,"maxModelCalls":7}}
                """));
        assertTrue(previousV2.execution().tokenBudgetEnabled());
        assertFalse(previousV2.execution().callBudgetEnabled());
        assertEquals(7, previousV2.execution().maxModelCalls());
        assertFalse(mapper.valueToTree(previousV2).has("legacyBudgetsPreserved"));
        for (String json : List.of("{\"schemaVersion\":1}", "{}", "{\"schemaVersion\":3}",
                "{\"schemaVersion\":4294967298}")) {
            AppException error = assertThrows(AppException.class, () -> service.save(mapper.readTree(json)));
            assertEquals(400, error.getCode()); assertTrue(error.getMsg().contains("仅支持版本 2"));
        }
        assertThrows(AppException.class, () -> service.save(mapper.readTree("{\"schemaVersion\":2,\"execution\":{\"tokenBudgetEnabled\":1}}")));
    }
    @Test void taskTimeoutRelationshipOnlyAppliesWhenDurationBudgetIsEnabled() throws Exception {
        var service = settings();
        assertDoesNotThrow(() -> service.save(new ObjectMapper().readTree("""
                {"schemaVersion":2,"execution":{"maxDurationSeconds":60,"maxToolDurationSeconds":600}}
                """)));
        assertThrows(AppException.class, () -> service.save(new ObjectMapper().readTree("""
                {"schemaVersion":2,"execution":{"durationBudgetEnabled":true,"maxDurationSeconds":60,"maxToolDurationSeconds":600}}
                """)));
    }
    @Test void disabledBudgetsStillAccumulateUsageAndExposeNullRemainingValues() {
        var limits = AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution());
        var budget = new AiAgentBudget(limits, Map.of("modelCalls", 9999L, "toolCalls", 9999L, "elapsedMs", 999999999L));
        budget.reserveModelCall(); budget.checkToolBatch(10, 10, 10); budget.recordTool(true, true);
        budget.addTokens(20000000, 500); budget.checkTokens(); budget.checkTime();
        assertEquals(10000L, budget.snapshot().get("modelCalls"));
        assertEquals(10000L, budget.snapshot().get("toolCalls"));
        assertNull(budget.snapshot().get("remainingTotalTokens"));
        assertNull(budget.snapshot().get("remainingDurationMs"));
        assertNull(budget.snapshot().get("remainingModelCalls"));
    }
    @Test void eachBudgetCanBeEnabledIndependentlyAndMissingFlagsAreRejected() {
        var limits = new LinkedHashMap<>(AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution()));
        limits.put("tokenBudgetEnabled", true);
        var token = new AiAgentBudget(limits, Map.of("totalTokens", 2000000));
        assertThrows(AiAgentBudget.Exhausted.class, token::checkTokens);
        assertDoesNotThrow(() -> token.checkToolBatch(10000, 10000, 10000));
        limits.put("tokenBudgetEnabled", false); limits.put("callBudgetEnabled", true); limits.put("maxModelCalls", 1);
        var calls = new AiAgentBudget(limits, Map.of("modelCalls", 1));
        assertThrows(AiAgentBudget.Exhausted.class, calls::reserveModelCall);
        limits.put("callBudgetEnabled", false); limits.put("durationBudgetEnabled", true);
        assertThrows(AiAgentBudget.Exhausted.class, new AiAgentBudget(limits, Map.of("elapsedMs", 999999999))::checkTime);
        limits.remove("callBudgetEnabled");
        assertThrows(AppException.class, new AiAgentBudget(limits, Map.of("modelCalls", 1))::reserveModelCall);
    }
    @Test void cacheTelemetryUsesProviderSemanticsAndDoesNotInventUnknownValues() {
        var budget = new AiAgentBudget(AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution()), Map.of());
        var openai = OpenAiTokenUsage.builder().inputTokenCount(100).outputTokenCount(20).totalTokenCount(120)
                .inputTokensDetails(OpenAiTokenUsage.InputTokensDetails.builder().cachedTokens(60).build()).build();
        assertEquals(100, budget.addUsage(openai, 1, 1));
        var anthropic = AnthropicTokenUsage.builder().inputTokenCount(10).outputTokenCount(5)
                .cacheReadInputTokens(80).cacheCreationInputTokens(30).build();
        assertEquals(120, budget.addUsage(anthropic, 1, 1));
        assertEquals(110L, budget.snapshot().get("inputTokens"));
        assertEquals(140L, budget.snapshot().get("cachedInputTokens"));
        assertEquals(30L, budget.snapshot().get("cacheCreationInputTokens"));
        assertEquals(220L, budget.snapshot().get("contextInputTokens"));
        assertEquals(245L, budget.snapshot().get("totalTokens"));
        budget.context(120, 200000, "model_catalog"); budget.compacted(180000, 120);
        assertEquals(1L, budget.snapshot().get("compactionCount"));
        var unknown = new AiAgentBudget(AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution()), Map.of());
        unknown.addUsage(new TokenUsage(10, 5), 1, 1);
        assertFalse(unknown.snapshot().containsKey("cachedInputTokens"));
        unknown.metadata("_toolGuardState", Map.of("cache", "private result"));
        assertFalse(unknown.snapshot().containsKey("_toolGuardState"));
        assertTrue(unknown.persistedSnapshot().containsKey("_toolGuardState"));
    }
    @Test void compactionBaselineIncludesSummaryUsageAndSurvivesUsageRestore() {
        var budget = new AiAgentBudget(AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution()), Map.of());
        budget.addTokens(700_000, 20_000);
        budget.addUsage(new TokenUsage(12_000, 750), 1, 1); // summary request is billed before the baseline is recorded
        long totalAfterSummary = 732_750L;

        budget.compacted(900_000, 8_000);
        assertEquals(totalAfterSummary, AiAgentBudget.number(budget.snapshot(), "totalTokens")); // task-wide usage remains cumulative
        assertEquals(0L, budget.tokensSinceCompaction());
        assertEquals(totalAfterSummary, AiAgentBudget.number(budget.persistedSnapshot(), "_compactionTokenBaseline"));
        assertFalse(budget.snapshot().containsKey("_compactionTokenBaseline"));

        Map<String, Object> restoredUsage = JSON.parseObject(JSON.toJSONString(budget.persistedSnapshot()), Map.class);
        var restored = new AiAgentBudget(AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution()), restoredUsage);
        assertEquals(totalAfterSummary, AiAgentBudget.number(restored.snapshot(), "totalTokens"));
        assertEquals(0L, restored.tokensSinceCompaction());
        restored.addTokens(899_999, 0);
        assertEquals(899_999L, restored.tokensSinceCompaction());
        restored.addTokens(1, 0);
        assertEquals(900_000L, restored.tokensSinceCompaction());
    }
    @Test void legacyUsageWithoutCompactionBaselineCountsPriorTotalAsSinceCompaction() {
        var restored = new AiAgentBudget(Map.of(), Map.of(
                "inputTokens", 900L, "outputTokens", 100L, "totalTokens", 1_000L));
        assertEquals(1_000L, restored.tokensSinceCompaction());
        assertFalse(restored.persistedSnapshot().containsKey("_compactionTokenBaseline"));
    }
    @Test void sameFailureCannotBeResetBySuccessChangedMessageOrArrayIndex() {
        var policy = new AiAgentToolFailurePolicy(Map.of());
        var call = call("patch_canvas_components", "{\"patches\":[{\"componentId\":\"a\"}]}");
        var first = policy.after(call, failed(call, "invalid_style", "/patches/0/style/color", "first"));
        assertFalse(first.strategyRequired()); assertNull(first.stop());
        policy.after(call, result(call, Map.of("revision", 2)));
        var second = policy.after(call, failed(call, "invalid_style", "patches[9].style.color", "changed"));
        assertTrue(second.strategyRequired()); assertNull(second.stop());
        var restored = new AiAgentToolFailurePolicy(JSON.parseObject(JSON.toJSONString(policy.snapshot()), Map.class));
        var third = restored.after(call, failed(call, "invalid_style", "/patches/3/style/color", "changed again"));
        assertEquals("agent.tool.repeated_failure", third.stop().code);
    }
    @Test void differentFieldsAndTargetsHaveSeparateFailureCounts() {
        var policy = new AiAgentToolFailurePolicy(Map.of());
        var a = call("patch_canvas_components", "{\"componentIds\":[\"a\"]}");
        var b = call("patch_canvas_components", "{\"componentIds\":[\"b\"]}");
        policy.after(a, failed(a, "validation", "style.color", "x"));
        assertFalse(policy.after(a, failed(a, "validation", "style.width", "x")).strategyRequired());
        assertFalse(policy.after(b, failed(b, "validation", "style.color", "x")).strategyRequired());
    }
    @Test void permissionDenialFreezesActionAcrossRestoreUntilHumanAuthorizationChanges() {
        var policy = new AiAgentToolFailurePolicy(Map.of());
        var a = call("patch_canvas_components", "{\"componentIds\":[\"a\"],\"stylePatch\":{\"color\":\"red\"}}");
        policy.authorizationRevision(3);
        policy.after(a, failed(a, "permission_denied", "", "denied"));
        var restored = new AiAgentToolFailurePolicy(JSON.parseObject(JSON.toJSONString(policy.snapshot()), Map.class));
        restored.authorizationRevision(3);
        var changed = call("patch_canvas_components", "{\"componentIds\":[\"a\"],\"stylePatch\":{\"color\":\"blue\"}}");
        assertThrows(AiAgentToolFailurePolicy.Stop.class, () -> restored.before(changed));
        var b = call("patch_canvas_components", "{\"componentIds\":[\"b\"]}");
        assertNotNull(restored.after(b, failed(b, "permission_denied", "", "denied other target")).stop());
        restored.authorizationRevision(4);
        assertDoesNotThrow(() -> restored.before(changed));
        assertNull(restored.after(changed, failed(changed, "permission_denied", "", "denied under new authorization")).stop());
    }
    @Test void infrastructureErrorsStopImmediately() {
        var policy = new AiAgentToolFailurePolicy(Map.of());
        var call = call("read_workspace_file", "{}");
        assertNotNull(policy.after(call, new ToolResult(call.id(), call.name(), "failed",
                Map.of("code", "timeout", "retryable", false), false)).stop());
    }
    @Test void allRegisteredReadsAreParallelAndBarrierSiblingsAreExcluded() {
        assertTrue(AiAgentToolScheduling.parallel("read_workspace_file"));
        for (var tool : new AiAgentToolCatalog(null, null).specifications()) {
            if (AiAgentToolCatalog.readOnly(tool.name())) assertTrue(AiAgentToolScheduling.parallel(tool.name()));
        }
        assertTrue(AiAgentToolScheduling.parallel("get_component_catalog"));
        assertFalse(AiAgentToolScheduling.parallel("apply_workspace_patch"));
        assertFalse(AiAgentToolScheduling.parallel("request_user_input"));
        assertFalse(AiAgentToolScheduling.parallel("unknown_tool"));
        var batch = List.of(call("list_workspace_files", "{}"), call("update_plan", "{}"),
                call("patch_canvas_components", "{}"), call("read_workspace_file", "{}"));
        assertEquals(3, AiAgentToolScheduling.admittedEnd(batch));
        assertEquals(1, AiAgentToolScheduling.groupEnd(batch, 0, 3));
        assertEquals(2, AiAgentToolScheduling.admittedEnd(List.of(call("inspect_current_page", "{}"), batch.get(0))));
        assertEquals(2, AiAgentToolScheduling.groupEnd(List.of(call("inspect_current_page", "{}"), batch.get(0)), 0, 2));
    }
    @Test void allowingParallelBrowserReadsDoesNotCacheRealtimeCanvasOrSpecs() {
        for (String name : List.of("get_project_snapshot", "get_component_snapshots", "resolve_component_specs")) {
            var guard = new AiAgentToolProgressGuard(3, Map.of());
            var call = call(name, "{}");
            assertNull(guard.before(call, null));
            guard.after(call, result(call, Map.of("revision", "canvas-revision", "corpusVersion", "docs-v1", "value", "fresh")));
            assertNull(guard.before(call, "canvas-revision"));
        }
    }
    @Test void fileCacheRequiresMatchingRevisionAndStopsRepeatedNonProgressReads() {
        var guard = new AiAgentToolProgressGuard(3, Map.of());
        var call = call("read_workspace_file", "{\"path\":\"a.txt\",\"startLine\":1}");
        assertNull(guard.before(call, "1"));
        guard.after(call, result(call, Map.of("workspaceRevision", 1, "content", "a")));
        var reordered = call("read_workspace_file", "{\"startLine\":1,\"path\":\"a.txt\"}");
        assertNotNull(guard.before(reordered, "1"));
        assertNull(guard.before(reordered, "2"));
        guard.after(reordered, result(call, Map.of("workspaceRevision", 2, "content", "b")));
        var restored = new AiAgentToolProgressGuard(3, JSON.parseObject(JSON.toJSONString(guard.snapshot()), Map.class));
        for (int i = 0; i < 3; i++) {
            var cached = restored.before(reordered, "2");
            assertNotNull(cached);
            restored.after(reordered, cached);
        }
        assertThrows(AiAgentToolFailurePolicy.Stop.class, () -> restored.before(reordered, "2"));
    }
    @Test void specsAreNeverCachedAndRegroupedFactsDoNotResetIdleGuard() {
        var guard = new AiAgentToolProgressGuard(3, Map.of());
        var call = call("resolve_component_specs", "{\"componentTypes\":[\"Text\"],\"intent\":\"create\"}");
        var spec = Map.of("componentType", "Text", "configurable", Map.of("style", 1), "example", Map.of("config", 1));
        var body = Map.<String,Object>of("corpusVersion", "v1", "specs", List.of(spec));
        guard.before(call, null);
        assertTrue(newFact(guard.after(call, result(call, body))));
        for (int i = 0; i < 3; i++) {
            assertNull(guard.before(call, "v1"));
            assertFalse(newFact(guard.after(call, result(call, body))));
        }
        assertThrows(AiAgentToolFailurePolicy.Stop.class, () -> guard.before(call, null));
    }
    @Test void canvasGroupingEmptyPagesAndPlanUpdatesDoNotCreateBusinessProgress() {
        var guard = new AiAgentToolProgressGuard(3, Map.of());
        for (String id : List.of("a", "b")) {
            var read = call("inspect_current_page", "{\"componentIds\":[\"" + id + "\"]}");
            guard.before(read, null);
            assertTrue(newFact(guard.after(read, result(read, Map.of("revision", 1, "components", List.of(Map.of("id", id)))))));
        }
        var regroup = call("inspect_current_page", "{}");
        guard.before(regroup, null);
        assertFalse(newFact(guard.after(regroup, result(regroup, Map.of("revision", 1, "components", List.of(Map.of("id", "b"), Map.of("id", "a")))))));
        var plan = call("update_plan", "{\"steps\":[1]}");
        guard.before(plan, null); guard.after(plan, result(plan, Map.of("plan", 1)));
        guard.before(regroup, null);
        assertFalse(newFact(guard.after(regroup, result(regroup, Map.of("revision", 2, "components", List.of(), "offset", 99)))));
        guard.before(regroup, null);
        assertFalse(newFact(guard.after(regroup, result(regroup, Map.of("revision", 2, "components", List.of(), "offset", 99)))));
        assertThrows(AiAgentToolFailurePolicy.Stop.class, () -> guard.before(call("get_current_canvas_revision", "{}"), null));
    }
    @Test void asynchronousAppliedWriteInvalidatesReadCacheAndReceiptsAreConsumedOnce() {
        var guard = new AiAgentToolGuard(3, Map.of());
        var read = call("read_workspace_file", "{}");
        guard.before(read, "1"); guard.after(read, result(read, Map.of("workspaceRevision", 1, "content", "old")));
        var write = call("patch_canvas_components", "{\"componentIds\":[\"a\"]}");
        guard.before(write, null); guard.after(write, new ToolResult(write.id(), write.name(), "pending", Map.of("operationId", "op"), true));
        var restored = new AiAgentToolGuard(3, JSON.parseObject(JSON.toJSONString(guard.snapshot()), Map.class));
        var receipts = List.of(new AiAgentService.OperationView("op", write.name(), "applied", Map.of("componentIds", List.of("a")), "1", "2", 1L));
        assertEquals(1, restored.receipts(receipts).size()); assertTrue(restored.receipts(receipts).isEmpty());
        assertNull(restored.before(read, "1"));
    }
    @Test void asyncFailureCountSurvivesResumeAndIsNotReplayed() {
        var guard = new AiAgentToolGuard(3, Map.of());
        var write = call("patch_canvas_components", "{\"componentIds\":[\"a\"]}");
        for (int i = 1; i <= 3; i++) {
            guard.before(write, null);
            guard.after(write, new ToolResult(write.id(), write.name(), "pending", Map.of("operationId", "op" + i), true));
            guard = new AiAgentToolGuard(3, JSON.parseObject(JSON.toJSONString(guard.snapshot()), Map.class));
            var receipts = List.of(new AiAgentService.OperationView("op" + i, write.name(), "failed", Map.of("code", "conflict"), "1", null, 1L));
            var outcome = guard.receipts(receipts).get(0);
            assertEquals(i == 2, outcome.strategyRequired());
            assertEquals(i == 3, outcome.stop() != null);
            assertTrue(guard.receipts(receipts).isEmpty());
        }
    }
    private static boolean newFact(ToolResult result) { return Boolean.TRUE.equals(AiAgentToolProgressGuard.map(result.result().get("guard")).get("producedNewFact")); }
    private static ToolExecutionRequest call(String name, String args) {
        return ToolExecutionRequest.builder().id(UUID.randomUUID().toString()).name(name).arguments(args).build();
    }
    private static ToolResult result(ToolExecutionRequest call, Map<String, Object> body) { return new ToolResult(call.id(), call.name(), "completed", body, false); }
    private static ToolResult failed(ToolExecutionRequest call, String code, String path, String message) {
        return new ToolResult(call.id(), call.name(), "failed", Map.of("code", code, "fieldPath", path, "message", message), false);
    }
    private static AiAgentRuntimeSettingsService settings() {
        User user = new User(); user.setId(1L); user.setRoles(List.of("ROLE_USER")); user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        var service = new AiAgentRuntimeSettingsService();
        var config = (UserAgentConfigService) Proxy.newProxyInstance(UserAgentConfigService.class.getClassLoader(), new Class<?>[]{UserAgentConfigService.class},
                (proxy, method, args) -> null);
        ReflectionTestUtils.setField(service, "userAgentConfigService", config);
        ReflectionTestUtils.setField(service, "objectMapper", new ObjectMapper());
        return service;
    }
}
