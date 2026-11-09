/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.mapper.AiModelMapper;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import com.zsq.datavisoolservice.util.JsonFormatter;
import dev.langchain4j.agent.tool.*;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.*;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.*;
import dev.langchain4j.model.output.TokenUsage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.Proxy;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentToolCatalog.ToolResult;
import static org.junit.jupiter.api.Assertions.*;

class AiAgentToolSchedulingRuntimeTest {
    @Test void debugTraceKeepsToolReturnWhenCancellationStopsHistoryUpdates() {
        var request = call("read_workspace_file", "{}");
        var reference = new java.util.concurrent.atomic.AtomicReference<Fixture>();
        var fixture = new Fixture(List.of(AiMessage.from(request)), call -> {
            reference.get().cancelRequested = true;
            return new ToolResult(call.id(), call.name(), "completed", Map.of("content", "last return"), false);
        });
        reference.set(fixture);
        try (var capture = new AiAgentTraceTestSupport()) {
            fixture.runtime.run("run", "1");
            var returned = capture.records.stream().filter(r -> "tool.returned".equals(r.getString("type"))).findFirst().orElseThrow();
            assertEquals("last return", returned.getJSONObject("payload").getJSONObject("result").getString("content"));
            assertFalse(capture.records.stream().anyMatch(r -> "tool.completed".equals(r.getString("type"))));
            assertEquals("segment.ended", capture.records.get(capture.records.size() - 1).getString("type"));
        }
    }

    @Test void debugTraceDistinguishesBrowserWaitFromDeferredCalls() {
        var create = call("create_canvas_components", "{}"); var later = call("patch_canvas_components", "{}");
        var fixture = new Fixture(List.of(AiMessage.from(List.of(create, later))), request ->
                new ToolResult(request.id(), request.name(), "pending", Map.of("operationId", "op"), true));
        try (var capture = new AiAgentTraceTestSupport()) {
            fixture.runtime.run("run", "1");
            var completed = capture.records.stream().filter(r -> "tool.completed".equals(r.getString("type"))).findFirst().orElseThrow();
            assertEquals(fixture.callId(create.name()), completed.getJSONObject("payload").getString("requestId"));
            assertTrue(completed.getJSONObject("payload").getBooleanValue("requiresFrontendEffect"));
            var deferred = capture.records.stream().filter(r -> "tool.deferred".equals(r.getString("type"))).findFirst().orElseThrow();
            assertEquals(fixture.callId(later.name()), deferred.getJSONObject("payload").getString("requestId"));
            assertTrue(capture.records.stream().anyMatch(r -> "segment.waiting".equals(r.getString("type"))));
            assertFalse(capture.records.stream().anyMatch(r -> "segment.completed".equals(r.getString("type"))));
        }
    }

    @Test void blankProviderIdIsAssignedBeforeCanvasExecutionAndSurvivesResume() {
        var create = ToolExecutionRequest.builder().id("").name("create_canvas_components").arguments("{}").build();
        var fixture = new Fixture(List.of(AiMessage.from(create), AiMessage.from("完成")), request ->
                new ToolResult(request.id(), request.name(), "pending",
                        Map.of("operationId", "op", "operationType", request.name(), "toolCallId", request.id()), true));
        fixture.runtime.run("run", "1");
        assertNull(fixture.failureCode, fixture.failureMessage);
        assertFalse(fixture.completed);
        String id = fixture.callId(create.name());
        assertFalse(id.isBlank());
        assertEquals(List.of(id), fixture.executed);
        assertEquals(id, fixture.waitingEffects.get(0).get("toolCallId"));

        fixture.receipts = List.of(new AiAgentService.OperationView("op", create.name(), "applied",
                Map.of("confirmed", true, "componentBindings", Map.of("chart", "actual-chart")), "1", "2", 123L));
        fixture.resumed = true;
        fixture.runtime.run("run", "1");
        assertTrue(fixture.completed, fixture.failureMessage);
        assertEquals(List.of(id), fixture.executed, "恢复时不能重新执行创建操作");
        assertEquals(id, fixture.callId(create.name()), "恢复时保留首次分配的 ID");
        var history = fixture.requests.get(1).messages();
        assertDoesNotThrow(() -> AiAgentContextHistory.normalize(history));
        var result = history.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        assertEquals(id, result.id());
        assertEquals(id, com.alibaba.fastjson2.JSON.parseObject(result.text()).getString("requestId"));
        assertEquals("applied", AiAgentContextHistory.facts(result.text()).get("status"));
        assertTrue(result.text().contains("actual-chart"));
    }

    @Test void restoredWorkWaitsForUnderlyingExclusiveCallToExit() throws Exception {
        String scope = UUID.randomUUID().toString();
        var started = new CountDownLatch(1); var release = new CountDownLatch(1);
        var waiting = new CountDownLatch(1); var nextExecuted = new AtomicInteger();
        var old = CompletableFuture.supplyAsync(() -> AiAgentToolScheduling.execute(scope, "apply_workspace_patch", () -> {
            started.countDown();
            try { release.await(3, TimeUnit.SECONDS); } catch (InterruptedException e) { throw new RuntimeException(e); }
            return "old";
        }));
        assertTrue(started.await(1, TimeUnit.SECONDS));
        var next = CompletableFuture.supplyAsync(() -> {
            waiting.countDown();
            return AiAgentToolScheduling.execute(scope, "read_workspace_file", () -> { nextExecuted.incrementAndGet(); return "next"; });
        });
        try {
            assertTrue(waiting.await(1, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> next.get(50, TimeUnit.MILLISECONDS));
            assertEquals(0, nextExecuted.get());
        } finally { release.countDown(); }
        assertEquals("old", old.get(1, TimeUnit.SECONDS));
        assertEquals("next", next.get(1, TimeUnit.SECONDS));
    }

    @Test void sharedFileReadsOverlapAndExclusiveCallsWaitForAllReads() {
        var first = call("read_workspace_file", "{\"path\":\"a\"}");
        var second = call("search_workspace_files", "{\"query\":\"b\"}");
        var write = call("apply_workspace_patch", "{}");
        var last = call("list_workspace_files", "{}");
        var bothReading = new CountDownLatch(2);
        var active = new AtomicInteger(); var maximum = new AtomicInteger();
        var order = new CopyOnWriteArrayList<String>();
        var fixture = new Fixture(List.of(AiMessage.from(List.of(first, second, write, last)), AiMessage.from("完成")), request -> {
            if (request.name().equals(first.name()) || request.name().equals(second.name())) {
                int count = active.incrementAndGet(); maximum.accumulateAndGet(count, Math::max);
                bothReading.countDown();
                try { assertTrue(bothReading.await(2, TimeUnit.SECONDS)); }
                catch (InterruptedException e) { throw new RuntimeException(e); }
                order.add(request.name()); active.decrementAndGet();
            } else {
                assertEquals(0, active.get());
                if (request.name().equals(write.name())) assertEquals(2, order.size());
                if (request.name().equals(last.name())) assertEquals("apply_workspace_patch", order.get(2));
                order.add(request.name());
            }
            return new ToolResult(request.id(), request.name(), request.name().equals(write.name()) ? "applied" : "completed",
                    Map.of("workspaceRevision", request.name().equals(first.name()) || request.name().equals(second.name()) ? 1 : 2,
                            "value", request.name()), false);
        });
        fixture.runtime.run("run", "1");
        assertTrue(fixture.completed, fixture.failureMessage);
        assertEquals(2, maximum.get()); assertEquals(4, order.size());
        var response = fixture.requests.get(1).messages().stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).toList();
        assertEquals(List.of(fixture.callId(first.name()), fixture.callId(second.name()), fixture.callId(write.name()), fixture.callId(last.name())),
                response.stream().map(ToolExecutionResultMessage::id).toList());
    }
    @Test void barrierDefersSiblingsWithoutChargingOrDispatchingThem() {
        var create = call("create_canvas_components", "{}");
        var patch = call("patch_canvas_components", "{}");
        var fixture = new Fixture(List.of(AiMessage.from(List.of(create, patch))), request ->
                new ToolResult(request.id(), request.name(), "pending", Map.of("operationId", "op"), true));
        fixture.limits.put("callBudgetEnabled", true);
        fixture.limits.put("maxToolCalls", 1); fixture.limits.put("maxWriteCalls", 1);
        fixture.runtime.run("run", "1");
        assertNull(fixture.failureCode, fixture.failureMessage);
        assertEquals(List.of(fixture.callId(create.name())), fixture.executed);
        assertEquals(1L, fixture.usage.get("toolCalls"));
        assertEquals(1L, fixture.usage.get("frontendInteractions"));
        assertEquals(1, fixture.waitingEffects.size());
        var messages = new JacksonChatMessageJsonCodec().messagesFromJson(fixture.checkpoint);
        var result = messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).filter(m -> m.id().equals(fixture.callId(patch.name()))).findFirst().orElseThrow();
        assertTrue(result.text().contains("tool_call_deferred"));
    }
    @Test void userInteractionStillDefersFollowingCalls() {
        for (String name : List.of("request_user_input", "request_component_selection")) {
            var first = call(name, "{}"); var later = call("read_workspace_file", "{}");
            var fixture = new Fixture(List.of(AiMessage.from(List.of(first, later))), request ->
                    new ToolResult(request.id(), request.name(), name.equals("request_user_input") ? "waiting_input" : "pending",
                            Map.of("operationId", "query"), !name.equals("request_user_input")));
            fixture.runtime.run("run", "1");
            assertNull(fixture.failureCode, fixture.failureMessage);
            assertEquals(List.of(fixture.callId(first.name())), fixture.executed);
            assertEquals(1L, fixture.usage.get("toolCalls"));
        }
    }
    @Test void independentBrowserReadsAreDispatchedTogetherBeforeWaitingAndWritesAreDeferred() {
        var snapshot = call("get_project_snapshot", "{}");
        var catalog = call("get_component_catalog", "{}");
        var create = call("create_canvas_components", "{}");
        var bothReading = new CountDownLatch(2);
        var fixture = new Fixture(List.of(AiMessage.from(List.of(snapshot, catalog, create))), request -> {
            bothReading.countDown();
            try { assertTrue(bothReading.await(2, TimeUnit.SECONDS), "两个浏览器读取应同时派发"); }
            catch (InterruptedException error) { throw new RuntimeException(error); }
            return new ToolResult(request.id(), request.name(), "pending", Map.of("operationId", request.id()), true);
        });
        fixture.runtime.run("run", "1");
        assertNull(fixture.failureCode, fixture.failureMessage);
        assertEquals(Set.of(fixture.callId(snapshot.name()), fixture.callId(catalog.name())), new HashSet<>(fixture.executed));
        assertEquals(2, fixture.waitingEffects.size());
        assertEquals(2L, fixture.usage.get("toolCalls"));
        assertEquals(2L, fixture.usage.get("frontendInteractions"));
        assertEquals(1, fixture.requests.size());
        var results = new JacksonChatMessageJsonCodec().messagesFromJson(fixture.checkpoint).stream()
                .filter(ToolExecutionResultMessage.class::isInstance).map(ToolExecutionResultMessage.class::cast).toList();
        assertEquals(List.of(fixture.callId(snapshot.name()), fixture.callId(catalog.name()), fixture.callId(create.name())),
                results.stream().map(ToolExecutionResultMessage::id).toList());
        assertFalse(results.get(0).text().contains("deferred"));
        assertFalse(results.get(1).text().contains("deferred"));
        assertTrue(results.get(2).text().contains("tool_call_deferred"));
    }
    @Test void browserAndWorkspaceReadsShareABatchWithoutDispatchingTheFollowingWrite() {
        var browser = call("inspect_current_page", "{}");
        var file = call("read_workspace_file", "{\"path\":\"a.txt\"}");
        var write = call("apply_workspace_patch", "{}");
        var fixture = new Fixture(List.of(AiMessage.from(List.of(browser, file, write))), request ->
                new ToolResult(request.id(), request.name(), request.name().equals(browser.name()) ? "pending" : "completed",
                        request.name().equals(browser.name()) ? Map.of("operationId", "browser") : Map.of("workspaceRevision", 1, "content", "a"),
                        request.name().equals(browser.name())));
        fixture.runtime.run("run", "1");
        assertNull(fixture.failureCode, fixture.failureMessage);
        assertEquals(Set.of(fixture.callId(browser.name()), fixture.callId(file.name())), new HashSet<>(fixture.executed));
        assertEquals(1, fixture.waitingEffects.size());
        assertEquals(1, fixture.requests.size());
    }
    @Test void independentReadBatchIsNotLimitedByTheSameReadRepeatLimit() {
        var calls = List.of(call("get_project_snapshot", "{}"), call("get_component_catalog", "{}"),
                call("get_current_canvas_selection", "{}"), call("get_current_canvas_revision", "{}"));
        var fixture = new Fixture(List.of(AiMessage.from(calls)), request ->
                new ToolResult(request.id(), request.name(), "pending", Map.of("operationId", request.id()), true));
        fixture.runtime.run("run", "1");
        assertNull(fixture.failureCode, fixture.failureMessage);
        assertEquals(4, fixture.executed.size());
        assertEquals(4, fixture.waitingEffects.size());
        assertEquals(4L, fixture.usage.get("toolCalls"));
        assertEquals(1, fixture.requests.size());
    }
    @Test void repeatedFailureStopsThirdDispatchAndEmitsStrategyNoticeAfterSecond() {
        var responses = new ArrayList<AiMessage>();
        for (int i = 0; i < 4; i++) responses.add(AiMessage.from(call("patch_canvas_components", "{\"componentIds\":[\"a\"]}")));
        var fixture = new Fixture(responses, request -> new ToolResult(request.id(), request.name(), "rejected",
                Map.of("code", "invalid_style", "path", "style.color", "message", UUID.randomUUID().toString()), false));
        fixture.runtime.run("run", "1");
        assertEquals("agent.tool.repeated_failure", fixture.failureCode);
        assertEquals(3, fixture.executed.size());
        assertEquals(1, fixture.events.stream().filter("agent.tool_call.strategy_required"::equals).count());
        assertTrue(fixture.usage.containsKey("_toolGuardState"));
    }
    @Test void configuredConsecutiveFailureLimitStopsAtTheThreshold() {
        var fixture = new Fixture(List.of(AiMessage.from(call("update_plan", "{}"))), request ->
                new ToolResult(request.id(), request.name(), "failed", Map.of("code", "validation"), false));
        fixture.failureLimit = 1;
        fixture.runtime.run("run", "1");
        assertEquals("agent.tool.consecutive_failure_limit", fixture.failureCode);
        assertEquals(1, fixture.executed.size());
        assertEquals(1L, fixture.usage.get("consecutiveFailures"));
    }
    @Test void artifactRepairsContinueBeyondThreeRoundsAndWaitForTheOriginalCanvasOperation(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var created = new AtomicInteger();
        var failureReceipts = new ArrayList<ArtifactFailureReceipt>();
        var catalog = new AiAgentToolCatalog(null, (context, type, payload, revision) -> {
            created.incrementAndGet();
            return new AiAgentService.OperationView(payload.get("operationId").toString(), type, "pending", Map.of(), revision, null, 0L);
        }, workspace) {
            @Override public ToolResult execute(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context) {
                return captureArtifactResult(request, context, super.execute(request, context));
            }
            @Override ToolResult executeWithRepairGuard(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                                         java.util.function.Consumer<ToolExecutionRequest> guard) {
                return captureArtifactResult(request, context, super.executeWithRepairGuard(request, context, guard));
            }
            private ToolResult captureArtifactResult(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                                    ToolResult result) {
                if ("repair_artifact".equals(request.name()) && "repair_required".equals(result.status())) {
                    String path = result.result().get("path").toString();
                    long projectId = Long.parseLong(context.projectId());
                    failureReceipts.add(new ArtifactFailureReceipt(result.result(), workspace.readWorkspaceFile(projectId, path).content()));
                }
                return result;
            }
        };
        String malformed = "{\"components\":[{\"id\":\"card\",\"type\":\"BaseColorBlock\",\"x\":10,\"y\":20,\"width\":450,\"height\":350,\"useDefaultConfig\":true]}";
        var context = new AiAgentService.AgentExecutionContext("thread", "10", "turn", "run", "1", "创建卡片",
                Map.of(), Map.of("mode", "none"), Map.of("revision", 1), null, null, 0);
        var initial = StagedToolTestSupport.validate(catalog, "create_canvas_components", malformed, context);
        assertEquals("repair_required", initial.status());
        var responses = new ArrayList<AiMessage>();
        long revision = ((Number) initial.result().get("workspaceRevision")).longValue();
        for (int i = 10; i < 14; i++) {
            String oldText = i == 13 ? "\"useDefaultConfig\": true\n    ]" : "\"x\": " + i + ",";
            String newText = i == 13 ? "\"useDefaultConfig\": true}\n    ]" : "\"x\": " + (i + 1) + ",";
            responses.add(AiMessage.from(call("repair_artifact", com.alibaba.fastjson2.JSON.toJSONString(Map.of(
                    "path", initial.result().get("path"), "expectedRevision", revision++,
                    "edits", List.of(Map.of("oldText", oldText, "newText", newText)))))));
        }
        responses.add(AiMessage.from(call("create_canvas_components", com.alibaba.fastjson2.JSON.toJSONString(Map.of(
                "path", initial.result().get("path"), "expectedRevision", revision + 1)))));
        var fixture = new Fixture(responses, request -> { throw new AssertionError("应执行真实文件修复工具"); });
        fixture.failureLimit = 1;
        ReflectionTestUtils.setField(fixture.runtime, "toolCatalog", catalog);
        fixture.runtime.run("run", "1");
        assertNull(fixture.failureCode, fixture.failureMessage);
        assertFalse(fixture.completed);
        assertEquals(1, created.get());
        assertEquals(5, fixture.requests.size());
        assertEquals(1, fixture.waitingEffects.size());
        assertEquals("create_canvas_components", fixture.waitingEffects.get(0).get("operationType"));
        assertEquals(0L, fixture.usage.getOrDefault("consecutiveFailures", 0L));
        assertEquals(3, failureReceipts.size(), "前三轮修复都应返回可定位到当前文件的失败回执");
        for (ArtifactFailureReceipt receipt : failureReceipts) {
            String fragment = receipt.result().get("errorContext").toString();
            assertFalse(fragment.isBlank());
            assertTrue(receipt.content().contains(fragment), "错误片段必须来自本轮校验的格式化文件");
            assertEquals(JsonFormatter.format(receipt.content()), receipt.content());
        }
    }
    private record ArtifactFailureReceipt(Map<String, Object> result, String content) {}
    @Test void timeoutStopsBeforeFollowingExclusiveTool() {
        var first = call("update_plan", "{}"); var later = call("apply_workspace_patch", "{}");
        var fixture = new Fixture(List.of(AiMessage.from(List.of(first, later))), request -> {
            try { new CountDownLatch(1).await(3, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
            return new ToolResult(request.id(), request.name(), "completed", Map.of(), false);
        });
        fixture.toolTimeout = 1;
        fixture.runtime.run("run", "1");
        assertEquals("agent.tool.timeout", fixture.failureCode);
        assertEquals(List.of(fixture.callId(first.name())), fixture.executed);
    }
    private static ToolExecutionRequest call(String name, String args) {
        return ToolExecutionRequest.builder().id(UUID.randomUUID().toString()).name(name).arguments(args).build();
    }
    private static final class Fixture extends AiAgentService {
        final AiAgentRuntime runtime = new AiAgentRuntime();
        final String turn = UUID.randomUUID().toString();
        final Map<String,Object> limits = new LinkedHashMap<>(AiAgentBudget.limits(AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution()));
        final List<String> executed = new CopyOnWriteArrayList<>();
        final List<String> events = new ArrayList<>();
        final List<ChatRequest> requests = new ArrayList<>();
        List<Map<String,Object>> waitingEffects = List.of();
        List<OperationView> receipts = List.of();
        Map<String,Object> usage = Map.of(); String checkpoint, failureCode, failureMessage;
        boolean completed, cancelRequested, resumed; long toolTimeout = 10, failureLimit = 25;
        Fixture(List<AiMessage> responses, Function<ToolExecutionRequest,ToolResult> execute) {
            var names = responses.stream().flatMap(m -> m.toolExecutionRequests() == null ? java.util.stream.Stream.empty()
                    : m.toolExecutionRequests().stream()).map(ToolExecutionRequest::name).distinct().toList();
            ReflectionTestUtils.setField(runtime, "agentService", this);
            ReflectionTestUtils.setField(runtime, "runtimeSettingsService", new AiAgentRuntimeSettingsService() {
                @Override public RuntimeSettings load(Long userId) {
                    assertEquals(Long.valueOf(1L), userId);
                    var defaults = RuntimeSettings.defaults();
                    var e = defaults.execution();
                    return new RuntimeSettings(defaults.modelRequest(), defaults.context(),
                            new Execution(false, false, false, e.maxModelCalls(), e.maxToolCalls(), e.maxWriteCalls(), e.maxTotalTokens(),
                                    e.maxDurationSeconds(), toolTimeout, e.frontendBatchTimeoutSeconds(), failureLimit,
                                    e.maxFrontendInteractions(), e.maxSameReadRepeats(), e.maxReadsWithoutBusinessProgress(), e.maxCompletionContinuations()));
                }
            });
            ReflectionTestUtils.setField(runtime, "toolCatalog", new AiAgentToolCatalog(null, null) {
                @Override public List<ToolSpecification> specifications() {
                    return names.stream().map(n -> ToolSpecification.builder().name(n).description(n).build()).toList();
                }
                @Override public ToolResult execute(ToolExecutionRequest request, AgentExecutionContext context) {
                    executed.add(request.id()); return execute.apply(request);
                }
                @Override String cacheVersion(ToolExecutionRequest request, AgentExecutionContext context) { return null; }
            });
            var model = new AiModelPO(); model.setId(1L); model.setUserId(1L); model.setEnabled(1); model.setName("test");
            ReflectionTestUtils.setField(runtime, "aiModelMapper", Proxy.newProxyInstance(AiModelMapper.class.getClassLoader(),
                    new Class<?>[]{AiModelMapper.class}, (p,m,args) -> m.getName().equals("selectById") ? model : null));
            ReflectionTestUtils.setField(runtime, "modelProviderFactory", new AiModelProviderFactory() {
                @Override public AiModelCapabilities capabilities(AiModelConfig config) { return null; }
                @Override public ChatModel createChatModel(AiModelConfig config) { return new ChatModel() {}; }
                @Override public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
                    return new StreamingChatModel() {
                        @Override public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                            int index = requests.size(); requests.add(request);
                            handler.onCompleteResponse(ChatResponse.builder().aiMessage(responses.get(index))
                                    .tokenUsage(new TokenUsage(100, 10)).build());
                        }
                    };
                }
            });
        }
        @Override public AgentExecutionContext executionContext(String run, String user) {
            return new AgentExecutionContext("thread", "10", turn, "run", "1", "目标",
                    Map.of("modelConfigId", "1", "executionLimits", limits, "executionUsage", usage), Map.of(), Map.of(),
                    resumed ? checkpoint : null, null, 0);
        }
        String callId(String name) {
            return new JacksonChatMessageJsonCodec().messagesFromJson(checkpoint).stream()
                    .filter(AiMessage.class::isInstance).map(AiMessage.class::cast).filter(AiMessage::hasToolExecutionRequests)
                    .flatMap(message -> message.toolExecutionRequests().stream()).filter(call -> name.equals(call.name()))
                    .map(ToolExecutionRequest::id).findFirst().orElseThrow();
        }
        @Override public boolean claimRun(AgentExecutionContext c, String w, long t) { return true; }
        @Override public boolean isCancelRequested(String id) { return cancelRequested; }
        @Override public void renewRunLease(AgentExecutionContext c, String w, long t) {}
        @Override public List<Map<String,Object>> inputAttachments(AgentExecutionContext c) { return List.of(); }
        @Override public List<ChatMessage> conversationContext(AgentExecutionContext c) { return List.of(); }
        @Override public List<OperationView> contextOperationReceipts(AgentExecutionContext c) { return receipts; }
        @Override public List<SteerMessage> steerMessagesAfter(AgentExecutionContext c, long v) { return List.of(); }
        @Override public void saveUsage(AgentExecutionContext c, Map<String,Object> u) { usage = new LinkedHashMap<>(u); }
        @Override public void saveCheckpoint(AgentExecutionContext c, String s, long r) { checkpoint = s; }
        @Override public void markSteersConsumed(AgentExecutionContext c, long v) {}
        @Override public ItemView appendItem(AgentExecutionContext c, String type, Map<String,Object> data) { return null; }
        @Override public ItemView appendAssistantMessage(AgentExecutionContext c, String text) { return null; }
        @Override public void appendEvent(String th, String tu, String ru, String type, Map<String,Object> p) { events.add(type); }
        @Override public void markWaitingForFrontendEffects(AgentExecutionContext c, List<Map<String,Object>> effects, long timeout) { waitingEffects = effects; }
        @Override public void markRunVerifying(AgentExecutionContext c) {}
        @Override public CompletionCheck checkCompletion(AgentExecutionContext c) { return new CompletionCheck(true, "完成"); }
        @Override public void markRunCompleted(AgentExecutionContext c) { completed = true; }
        @Override public void markRunFailed(AgentExecutionContext c, String code, String message) { failureCode = code; failureMessage = message; }
    }
}
