/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.mapper.AiModelMapper;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.TokenUsage;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.Proxy;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** 验证完整历史保留、整体摘要、压缩失败及恢复时的派发与记账。 */
class AiAgentContextRuntimeTest {
    @Test void rejectsOldCheckpointBeforeModelDispatch() {
        var fixture = new Fixture(List.of(UserMessage.from("旧请求")), "custom", "custom-model", 512L, false);
        fixture.runtime.run("run", "1");
        assertFalse(fixture.completed);
        assertEquals("AGENT_RUNTIME_ERROR", fixture.failureCode);
        assertTrue(fixture.mainRequests.isEmpty());
    }

    @Test void blankConfigurationDispatchesTheSelectedModelBudget() {
        var messages = List.<ChatMessage>of(UserMessage.from("创建标题"));
        var mimo = new Fixture(messages, "mimo", "mimo-v2.6-flash", null);
        mimo.runtime.run("run", "1");
        assertTrue(mimo.completed);
        assertEquals(131_072, mimo.mainRequests.get(0).maxOutputTokens());
        var pro = new Fixture(messages, "mimo", "mimo-v2.6-pro", null);
        pro.runtime.run("run", "1");
        assertTrue(pro.completed);
        assertEquals(131_072, pro.mainRequests.get(0).maxOutputTokens());
        var custom = new Fixture(messages, "custom", "custom-model", null);
        custom.runtime.run("run", "1");
        assertTrue(custom.completed);
        assertNull(custom.mainRequests.get(0).maxOutputTokens());
        var manual = new Fixture(messages, "mimo", "mimo-v2.6-pro", 1_234L);
        manual.runtime.run("run", "1");
        assertTrue(manual.completed);
        assertEquals(1_234, manual.mainRequests.get(0).maxOutputTokens());
    }

    @Test void resumesCurrentCheckpointWithUpdatedPromptAndCatalogFromRealReceipt() {
        var fixture = new Fixture(List.of(SystemMessage.from("你是画布编辑 Agent。只能使用已提供的工具访问当前项目。\n每个任务开始时必须先调用 update_plan"),
                UserMessage.from("创建标题")));
        fixture.receipts = List.of(new AiAgentService.OperationView("catalog-op", "get_component_catalog", "applied",
                Map.of("catalogVersion", "v1", "components", List.of(Map.of("componentType", "BaseText", "componentName", "文本"))),
                null, null, 1L));
        fixture.runtime.run("run", "1");
        assertTrue(fixture.completed);
        var messages = fixture.mainRequests.get(0).messages();
        var system = messages.stream().filter(SystemMessage.class::isInstance).map(SystemMessage.class::cast).findFirst().orElseThrow();
        assertTrue(system.text().contains("可调用 update_plan"));
        assertFalse(system.text().contains("每个任务开始时必须先调用"));
        assertTrue(new JacksonChatMessageJsonCodec().messagesToJson(messages).contains("BaseText"));
    }

    @Test void mainRequestKeepsEveryCatalogEntryAfterResumeAndCompaction() {
        var call = ToolExecutionRequest.builder().id("catalog").name("get_component_catalog").arguments("{}").build();
        var entries = java.util.stream.IntStream.range(0, 51).mapToObj(i ->
                Map.of("componentType", "Type" + i, "componentName", "组件" + i)).toList();
        var fixture = new Fixture(List.of(SystemMessage.from("画布编辑"), UserMessage.from("创建标题"), AiMessage.from(call),
                ToolExecutionResultMessage.from(call, com.alibaba.fastjson2.JSON.toJSONString(
                        Map.of("catalogVersion", "v1", "components", entries))), AiMessage.from("旧分析".repeat(6_300))));
        try (var capture = new AiAgentTraceTestSupport()) {
            fixture.runtime.run("run", "1");
            assertTrue(fixture.completed);
            assertEquals(1, fixture.summaryRequests.size());
            var request = fixture.mainRequests.get(0);
            var result = request.messages().stream().filter(ToolExecutionResultMessage.class::isInstance)
                    .map(ToolExecutionResultMessage.class::cast).filter(message -> "get_component_catalog".equals(message.toolName()))
                    .findFirst().orElseThrow();
            assertEquals(51, com.alibaba.fastjson2.JSON.parseObject(result.text()).getJSONArray("components").size());
            assertTrue(capture.records.stream().anyMatch(record -> "model.request".equals(record.getString("type"))
                    && "main".equals(record.getJSONObject("payload").getString("purpose")) && record.toJSONString().contains("Type50")));
        }
    }

    @Test void debugTraceRetainsSummaryInputAndTheActualCompactedMainRequest() {
        var fixture = new Fixture(List.of(SystemMessage.from("安全边界"), UserMessage.from("用户目标"), AiMessage.from("旧分析".repeat(6_500))));
        try (var capture = new AiAgentTraceTestSupport()) {
            fixture.runtime.run("run", "1");
            var requests = capture.records.stream().filter(r -> "model.request".equals(r.getString("type"))).toList();
            assertEquals(2, requests.size());
            assertEquals("summary", requests.get(0).getJSONObject("payload").getString("purpose"));
            assertEquals("main", requests.get(1).getJSONObject("payload").getString("purpose"));
            assertEquals(com.alibaba.fastjson2.JSON.toJSONString(AiAgentDebugTrace.messages(fixture.summaryRequests.get(0).messages())),
                    requests.get(0).getJSONObject("payload").getJSONArray("messages").toJSONString());
            assertTrue(capture.records.stream().anyMatch(r -> "context.initialized".equals(r.getString("type")) && r.toJSONString().contains("旧分析")));
            assertTrue(requests.get(1).toJSONString().contains("Agent state digest"));
            assertEquals(fixture.context.checkpointStateJson().contains("旧分析"),
                    fixture.summaryRequests.get(0).messages().stream().anyMatch(m -> m instanceof AiMessage ai && ai.text().contains("旧分析")));
            assertTrue(capture.records.stream().anyMatch(r -> "context.compacted".equals(r.getString("type"))));
            assertEquals("segment.ended", capture.records.get(capture.records.size() - 1).getString("type"));
            assertTrue(fixture.completed);
        }
    }

    @Test void failedSummaryPreservesCompleteHistoryAndStopsBeforeMainCall() {
        var fixture = new Fixture(List.of(SystemMessage.from("安全边界"), UserMessage.from("用户目标"),
                AiMessage.from("旧分析".repeat(6_500))));
        fixture.summaryFailure = true;
        fixture.runtime.run("run", "1");
        assertFalse(fixture.completed);
        assertEquals("AGENT_RUNTIME_ERROR", fixture.failureCode);
        assertEquals(1, fixture.summaryRequests.size());
        assertEquals(512, fixture.summaryRequests.get(0).maxOutputTokens());
        assertTrue(fixture.mainRequests.isEmpty());
        assertEquals(1L, fixture.usage.get("modelCalls"));
        assertFalse(fixture.events.contains("agent.context_compaction.completed"));
        assertEquals(0L, fixture.usage.getOrDefault("compactionCount", 0L));
        assertEquals(new JacksonChatMessageJsonCodec().messagesFromJson(fixture.context.checkpointStateJson()),
                new JacksonChatMessageJsonCodec().messagesFromJson(fixture.checkpoints.get(fixture.checkpoints.size() - 1)));
    }

    @Test void oversizedProtectedInputStopsBeforeAnyModelCall() {
        var fixture = new Fixture(List.of(SystemMessage.from("安全边界"), UserMessage.from("要求".repeat(30_000))));
        fixture.runtime.run("run", "1");
        assertEquals("AGENT_CONTEXT_TOO_LARGE", fixture.failureCode);
        assertTrue(fixture.summaryRequests.isEmpty());
        assertTrue(fixture.mainRequests.isEmpty());
        assertFalse(fixture.completed);
    }

    @Test void impossibleWindowAfterSummaryAccountsForCallAndStopsMainDispatch() {
        var fixture = new Fixture(List.of(SystemMessage.from("安全边界".repeat(5_000)), UserMessage.from("要求")));
        fixture.runtime.run("run", "1");
        assertEquals("AGENT_CONTEXT_TOO_LARGE", fixture.failureCode);
        assertEquals(1, fixture.summaryRequests.size());
        assertTrue(fixture.mainRequests.isEmpty());
        assertEquals(1L, fixture.usage.get("modelCalls"));
        assertEquals(220L, fixture.usage.get("totalTokens"));
    }

    @Test void restoredWindowUsesActualOperationReceiptInsteadOfRepeatingPendingResult() {
        var call = dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("patch")
                .name("patch_canvas_components").arguments("{}").build();
        var fixture = new Fixture(List.of(SystemMessage.from("安全边界"), UserMessage.from("修改组件"),
                AiMessage.from(call), ToolExecutionResultMessage.from(call,
                "{\"status\":\"pending\",\"result\":{\"operationId\":\"op-1\"}}")));
        fixture.receipts = List.of(new AiAgentService.OperationView("op-1", "patch_canvas_components", "applied",
                Map.of("componentIds", List.of("component-1")), "1", "2", 123L));
        fixture.runtime.run("run", "1");
        assertTrue(fixture.completed);
        var result = fixture.mainRequests.get(0).messages().stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).findFirst().orElseThrow();
        assertEquals("applied", AiAgentContextHistory.facts(result.text()).get("status"));
        assertTrue(result.text().contains("component-1"));
        assertTrue(fixture.summaryRequests.isEmpty());
    }

    @Test void appliedWriteDoesNotDeletePreviousCompletionOrReportCompaction() {
        var call = dev.langchain4j.agent.tool.ToolExecutionRequest.builder().id("patch")
                .name("patch_canvas_components").arguments("{}").build();
        var fixture = new Fixture(List.of(SystemMessage.from("安全边界"), UserMessage.from("生成标题"),
                AiMessage.from("标题已生成"), UserMessage.from("生成图标"),
                AiMessage.from("写入前的过时分析"), AiMessage.from(call), ToolExecutionResultMessage.from(call,
                "{\"status\":\"applied\",\"result\":{\"operationId\":\"op-1\",\"revision\":\"2\"}}")));
        fixture.runtime.run("run", "1");
        assertTrue(fixture.completed);
        assertEquals(0L, fixture.usage.getOrDefault("compactionCount", 0L));
        assertEquals(new JacksonChatMessageJsonCodec().messagesFromJson(fixture.context.checkpointStateJson()),
                fixture.mainRequests.get(0).messages());
        assertTrue(fixture.mainRequests.get(0).messages().contains(AiMessage.from("标题已生成")));
        assertFalse(fixture.events.contains("agent.context_compaction.completed"));
        assertTrue(fixture.summaryRequests.isEmpty());
    }

    @Test void cumulativeUsageTriggersCompactionBeforeTheNextSmallMainRequest() {
        for (long consumed : new long[]{899_999, 900_000}) {
            var fixture = new Fixture(List.of(UserMessage.from("继续创建标题")), "deepseek", "deepseek-v4-flash", 512L);
            fixture.executionUsage.put("totalTokens", consumed);
            try (var capture = new AiAgentTraceTestSupport()) {
                fixture.runtime.run("run", "1");
                assertTrue(fixture.completed);
                assertEquals(consumed == 900_000 ? 1 : 0, fixture.summaryRequests.size());
                assertEquals(1, fixture.mainRequests.size());
                if (consumed == 900_000) {
                    var compacted = capture.records.stream().filter(r -> "context.compacted".equals(r.getString("type")))
                            .findFirst().orElseThrow().getJSONObject("payload");
                    assertEquals("cumulative_usage", compacted.getString("trigger"));
                    assertEquals(900_000L, compacted.getLongValue("tokensSinceCompaction"));
                    assertEquals(900_000L, compacted.getLongValue("compactionThresholdTokens"));
                    assertTrue(compacted.getLongValue("beforeTokens") < 1_000);
                    assertEquals(900_220L, fixture.usage.get("_compactionTokenBaseline"));
                    assertEquals(900_330L, fixture.usage.get("totalTokens"));
                    var requests = capture.records.stream().filter(r -> "model.request".equals(r.getString("type"))).toList();
                    assertEquals("summary", requests.get(0).getJSONObject("payload").getString("purpose"));
                    assertEquals("main", requests.get(1).getJSONObject("payload").getString("purpose"));
                }
            }
        }
    }

    @Test void successfulCompactionRestartsTheCycleAcrossCheckpointResume() {
        var first = new Fixture(List.of(UserMessage.from("创建标题")));
        first.executionUsage.put("totalTokens", 14_400L);
        first.runtime.run("run", "1");
        assertTrue(first.completed);
        assertEquals(1, first.summaryRequests.size());
        var checkpoint = new JacksonChatMessageJsonCodec().messagesFromJson(first.checkpoints.get(first.checkpoints.size() - 1));
        var resumed = new Fixture(checkpoint);
        resumed.executionUsage.putAll(first.usage);
        resumed.runtime.run("run", "1");
        assertTrue(resumed.completed);
        assertTrue(resumed.summaryRequests.isEmpty());
        assertEquals(1L, resumed.usage.get("compactionCount"));
        assertEquals(first.usage.get("_compactionTokenBaseline"), resumed.usage.get("_compactionTokenBaseline"));

        var nextCycle = new Fixture(checkpoint);
        nextCycle.executionUsage.putAll(resumed.usage);
        nextCycle.executionUsage.put("totalTokens", AiAgentBudget.number(resumed.usage, "_compactionTokenBaseline") + 14_400);
        nextCycle.runtime.run("run", "1");
        assertTrue(nextCycle.completed);
        assertEquals(1, nextCycle.summaryRequests.size());
        assertEquals(2L, nextCycle.usage.get("compactionCount"));
    }

    @Test void failedCumulativeSummaryDoesNotAdvanceThePersistedBaseline() {
        var fixture = new Fixture(List.of(UserMessage.from("继续创建标题")));
        fixture.executionUsage.put("totalTokens", 15_400L);
        fixture.executionUsage.put("_compactionTokenBaseline", 1_000L);
        fixture.summaryFailure = true;
        fixture.runtime.run("run", "1");
        assertEquals("AGENT_RUNTIME_ERROR", fixture.failureCode);
        assertEquals(1, fixture.summaryRequests.size());
        assertTrue(fixture.mainRequests.isEmpty());
        assertEquals(1_000L, fixture.usage.get("_compactionTokenBaseline"));
        assertEquals(15_400L, fixture.usage.get("totalTokens"));
        assertFalse(fixture.events.contains("agent.context_compaction.completed"));
    }

    private static final class Fixture extends AiAgentService {
        final AiAgentRuntime runtime = new AiAgentRuntime();
        final List<ChatRequest> summaryRequests = new ArrayList<>();
        final List<ChatRequest> mainRequests = new ArrayList<>();
        final List<String> checkpoints = new ArrayList<>();
        final List<String> events = new ArrayList<>();
        final Map<String, Object> executionUsage = new LinkedHashMap<>();
        final AgentExecutionContext context;
        final AiAgentRuntimeSettingsService.RuntimeSettings settings;
        List<OperationView> receipts = List.of();
        Map<String, Object> usage = Map.of();
        boolean summaryFailure;
        boolean completed;
        String failureCode;

        Fixture(List<ChatMessage> messages) {
            this(messages, "custom", "custom-model", 512L);
        }

        Fixture(List<ChatMessage> messages, String provider, String runtimeModelId, Long maxTokens) {
            this(messages, provider, runtimeModelId, maxTokens, true);
        }

        Fixture(List<ChatMessage> messages, String provider, String runtimeModelId, Long maxTokens, boolean currentCheckpoint) {
            List<ChatMessage> checkpoint = new ArrayList<>(messages);
            if (currentCheckpoint) {
                int systemIndex = -1;
                for (int i = 0; i < checkpoint.size(); i++) if (checkpoint.get(i) instanceof SystemMessage) { systemIndex = i; break; }
                if (systemIndex < 0) checkpoint.add(0, SystemMessage.from(AiAgentContextHistory.FULL_HISTORY_MARKER));
                else {
                    SystemMessage system = (SystemMessage) checkpoint.get(systemIndex);
                    if (!system.text().contains(AiAgentContextHistory.FULL_HISTORY_MARKER))
                        checkpoint.set(systemIndex, SystemMessage.from(system.text() + "\n" + AiAgentContextHistory.FULL_HISTORY_MARKER));
                }
            }
            settings = new AiAgentRuntimeSettingsService.RuntimeSettings(new AiAgentRuntimeSettingsService.ModelRequest(1),
                    new AiAgentRuntimeSettingsService.Context(8_192, 90, 512, 2_048, 512, 512),
                    AiAgentRuntimeSettingsService.RuntimeSettings.defaults().execution());
            context = new AgentExecutionContext("thread", "10", "turn", "run", "1", "用户目标",
                    Map.of("modelConfigId", "1", "runtimeModelId", runtimeModelId,
                            "executionLimits", AiAgentBudget.limits(settings.execution()),
                            "executionUsage", executionUsage), Map.of(), Map.of(),
                    new JacksonChatMessageJsonCodec().messagesToJson(checkpoint), null, 0);
            var model = new AiModelPO();
            model.setId(1L); model.setUserId(1L); model.setEnabled(1); model.setName("custom-model");
            model.setProvider(provider); model.setMaxTokens(maxTokens); model.setApiKey("stub");
            var mapper = (AiModelMapper) Proxy.newProxyInstance(AiModelMapper.class.getClassLoader(), new Class<?>[]{AiModelMapper.class},
                    (proxy, method, args) -> {
                        if (method.getName().equals("selectById")) return model;
                        throw new UnsupportedOperationException(method.getName());
                    });
            ReflectionTestUtils.setField(runtime, "aiModelMapper", mapper);
            ReflectionTestUtils.setField(runtime, "agentService", this);
            ReflectionTestUtils.setField(runtime, "runtimeSettingsService", new AiAgentRuntimeSettingsService() {
                @Override public RuntimeSettings load(Long userId) {
                    assertEquals(Long.valueOf(1L), userId);
                    return settings;
                }
            });
            ReflectionTestUtils.setField(runtime, "toolCatalog", new AiAgentToolCatalog(null, null) {
                @Override public List<ToolSpecification> specifications() { return List.of(); }
            });
            ReflectionTestUtils.setField(runtime, "modelProviderFactory", new AiModelProviderFactory() {
                @Override public AiModelCapabilities capabilities(AiModelConfig config) {
                    return new AiModelCapabilities(true, true, true, true, false, 16_000);
                }
                @Override public Long contextWindowTokens(AiModelConfig config) {
                    Long capacity = AiDrivenModelCatalog.contextWindowTokens(config.provider(), config.modelName());
                    return capacity == null ? 16_000L : capacity;
                }
                @Override public ChatModel createChatModel(AiModelConfig config) {
                    return new ChatModel() {
                        @Override public ChatResponse doChat(ChatRequest request) {
                            summaryRequests.add(request);
                            if (summaryFailure) throw new IllegalStateException("summary failed");
                            return ChatResponse.builder().aiMessage(AiMessage.from("事实摘要"))
                                    .tokenUsage(new TokenUsage(200, 20)).build();
                        }
                    };
                }
                @Override public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
                    return new StreamingChatModel() {
                        @Override public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                            mainRequests.add(request);
                            handler.onCompleteResponse(ChatResponse.builder().aiMessage(AiMessage.from("已完成"))
                                    .tokenUsage(new TokenUsage(100, 10)).build());
                        }
                    };
                }
            });
        }
        @Override public AgentExecutionContext executionContext(String runId, String userId) { return context; }
        @Override public boolean claimRun(AgentExecutionContext context, String workerId, long leaseMillis) { return true; }
        @Override public void renewRunLease(AgentExecutionContext context, String workerId, long leaseMillis) {}
        @Override public boolean isCancelRequested(String runId) { return false; }
        @Override public List<Map<String, Object>> inputAttachments(AgentExecutionContext context) { return List.of(); }
        @Override public List<OperationView> contextOperationReceipts(AgentExecutionContext context) { return receipts; }
        @Override public List<SteerMessage> steerMessagesAfter(AgentExecutionContext context, long version) { return List.of(); }
        @Override public void saveCheckpoint(AgentExecutionContext context, String stateJson, long revision) { checkpoints.add(stateJson); }
        @Override public void saveUsage(AgentExecutionContext context, Map<String, Object> usage) { this.usage = usage; }
        @Override public void appendEvent(String threadId, String turnId, String runId, String type, Map<String, Object> payload) { events.add(type); }
        @Override public ItemView appendAssistantMessage(AgentExecutionContext context, String text) { return null; }
        @Override public void markSteersConsumed(AgentExecutionContext context, long version) {}
        @Override public void markRunVerifying(AgentExecutionContext context) {}
        @Override public CompletionCheck checkCompletion(AgentExecutionContext context) { return new CompletionCheck(true, "完成"); }
        @Override public void markRunCompleted(AgentExecutionContext context) { completed = true; }
        @Override public void markRunFailed(AgentExecutionContext context, String code, String message) { failureCode = code; }
    }
}
