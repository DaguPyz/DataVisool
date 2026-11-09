/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.model.po.AiAgentEventPO;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.*;
import dev.langchain4j.http.client.sse.ServerSentEvent;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.openai.OpenAiChatResponseMetadata;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static org.junit.jupiter.api.Assertions.*;

class AiAgentDebugTraceTest {
    private final AiAgentService.AgentExecutionContext context = new AiAgentService.AgentExecutionContext(
            "thread", "project", "turn", "run", "1", "hello", Map.of(), Map.of(), Map.of(), null, null, 0);

    @Test void keepsExactTextThinkingCallsAndSchemasWithoutKeysImagesOrMutatingInput() {
        var records = new ArrayList<Map<String,Object>>();
        var trace = new AiAgentDebugTrace(context, records::add);
        var call = ToolExecutionRequest.builder().id("call").name("read").arguments("{\"apiKey\":\"private-key\",\"path\":\"a.txt\"}").build();
        var messages = List.<ChatMessage>of(SystemMessage.from("规则"), UserMessage.from(TextContent.from("hello"), ImageContent.from("private-image", "image/png")),
                AiMessage.builder().text("reply").thinking("provider analysis").toolExecutionRequests(List.of(call)).build(),
                ToolExecutionResultMessage.from(call, "{\"password\":\"private-password\",\"content\":\"value\"}"));
        var request = ChatRequest.builder().messages(messages).toolSpecifications(ToolSpecification.builder().name("read").description("read file").build()).maxOutputTokens(50).build();
        String id = trace.modelStarted(request, new AiModelConfig("custom", "url", "private-model-key", "test", .5, 100L), 1, "main", "streaming");
        String output = JSON.toJSONString(records);
        assertFalse(output.contains("private-key")); assertFalse(output.contains("private-image"));
        assertFalse(output.contains("private-password")); assertFalse(output.contains("private-model-key"));
        assertTrue(output.contains("provider analysis")); assertTrue(output.contains("a.txt")); assertTrue(output.contains("read file"));
        assertTrue(output.contains(id)); assertEquals(messages, request.messages()); assertTrue(call.arguments().contains("private-key"));
        var payload = JSON.parseObject(JSON.toJSONString(records.get(0))).getJSONObject("payload");
        assertEquals(50, payload.getJSONObject("parameters").getIntValue("maxOutputTokens"));
        assertEquals(4, payload.getJSONArray("messages").size());
    }

    @Test void disabledOrBrokenDebugSinkDoesNotChangeExecution() {
        var disabled = new AiAgentDebugTrace(context, null);
        disabled.record("test", () -> { fail("disabled trace must not serialize"); return Map.of(); });
        var broken = new AiAgentDebugTrace(context, record -> { throw new IllegalStateException("log failed"); });
        assertDoesNotThrow(() -> broken.record("test", () -> Map.of("text", "hello")));
    }

    @Test void segmentSequenceIsLocalAndProcessOrderSurvivesResume() {
        var records = new ArrayList<Map<String,Object>>();
        var first = new AiAgentDebugTrace(context, records::add);
        first.record("segment.started", () -> Map.of()); first.record("segment.ended", () -> Map.of());
        new AiAgentDebugTrace(context, records::add).record("segment.started", () -> Map.of());
        assertEquals(List.of(1L,2L,1L), records.stream().map(r -> r.get("sequence")).toList());
        assertNotEquals(records.get(0).get("segmentId"), records.get(2).get("segmentId"));
        assertTrue((long)records.get(2).get("processOrder") > (long)records.get(1).get("processOrder"));
    }

    @Test void frontendReceiptsAreLoggedOnlyAfterCommit() {
        try (var capture = new AiAgentTraceTestSupport()) {
            TransactionSynchronizationManager.initSynchronization();
            try {
                AiAgentDebugTrace.committedEvent(event("rolled-back"));
                assertTrue(capture.records.isEmpty());
                TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
                assertTrue(capture.records.isEmpty());
            } finally { TransactionSynchronizationManager.clearSynchronization(); }
            TransactionSynchronizationManager.initSynchronization();
            try {
                AiAgentDebugTrace.committedEvent(event("committed"));
                assertTrue(capture.records.isEmpty());
                TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
                assertEquals(1, capture.records.size());
                assertEquals("committed", capture.records.get(0).getString("recordId"));
                assertEquals("op", capture.records.get(0).getJSONObject("payload").getString("operationId"));
            } finally { TransactionSynchronizationManager.clearSynchronization(); }
        }
    }

    @Test void failedStreamingRetainsPartialOutputAndDoesNotRecordLateCallbacks() {
        var records = new ArrayList<Map<String,Object>>(); var trace = new AiAgentDebugTrace(context, records::add);
        var runtime = new AiAgentRuntime();
        ReflectionTestUtils.setField(runtime, "agentService", new AiAgentService() {
            @Override public void appendEvent(String thread, String turn, String run, String type, Map<String,Object> payload) { }
        });
        var pending = new java.util.concurrent.atomic.AtomicReference<StreamingChatResponseHandler>();
        StreamingChatModel model = new StreamingChatModel() {
            @Override public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                pending.set(handler); handler.onPartialResponse("partial"); handler.onError(new IllegalStateException("connection lost"));
            }
        };
        assertThrows(RuntimeException.class, () -> ReflectionTestUtils.invokeMethod(runtime, "stream", model,
                ChatRequest.builder().messages(UserMessage.from("hello")).build(), context, "item", 1L, trace, "call"));
        pending.get().onPartialResponse("late");
        assertEquals(1, records.size());
        assertEquals("partial", ((Map<?,?>) records.get(0).get("payload")).get("partialText"));
    }

    @Test void receivedTraceDistinguishesMissingSdkThinkingFromRawReasoningAndOmitsSensitiveContent() throws Exception {
        String sdkSecret = "sdk-api-key-secret";
        String wireSecret = "wire-api-key-secret";
        String reasoning = "思考🧠";
        var call = ToolExecutionRequest.builder().id("sdk-call").name("write")
                .arguments("{\"apiKey\":\"" + sdkSecret + "\"}").build();
        ChatResponse response = response(AiMessage.builder().text("done").toolExecutionRequests(List.of(call)).build(), List.of(
                sseEvent("{\"role\":\"assistant\"}"),
                sseEvent("{\"reasoning_content\":null}"),
                sseEvent("{\"reasoning_content\":\"\"}"),
                sseEvent("{\"reasoning_content\":\"思\"}"),
                sseEvent("{\"reasoning_content\":\"考🧠\",\"tool_calls\":[{\"index\":0,\"id\":\"wire-call\",\"function\":{\"name\":\"write\",\"arguments\":\"{\\\"apiKey\\\":\\\"" + wireSecret + "\\\"}\"}}]}")
        ));

        var records = received(response);
        String serialized = JSON.toJSONString(records);
        Map<?, ?> payload = (Map<?, ?>) records.get(0).get("payload");
        Map<?, ?> sdk = (Map<?, ?>) payload.get("sdkResponse");
        Map<?, ?> sdkThinking = (Map<?, ?>) sdk.get("thinking");
        Map<?, ?> wire = (Map<?, ?>) payload.get("wireResponse");
        Map<?, ?> choice = (Map<?, ?>) ((List<?>) wire.get("choices")).get(0);
        Map<?, ?> counts = (Map<?, ?>) choice.get("reasoningFieldCounts");

        assertEquals("missing", sdkThinking.get("state"));
        assertEquals(0, sdkThinking.get("characters"));
        assertFalse(sdkThinking.containsKey("sha256"));
        assertEquals("streaming", wire.get("mode"));
        assertEquals(1, counts.get("missing"));
        assertEquals(1, counts.get("null"));
        assertEquals(1, counts.get("empty"));
        assertEquals(2, counts.get("present"));
        assertEquals(reasoning.length(), choice.get("reasoningCharacters"));
        assertEquals(sha256(reasoning), choice.get("reasoningSha256"));
        assertFalse(serialized.contains(reasoning));
        assertFalse(serialized.contains("思"));
        assertFalse(serialized.contains("考🧠"));
        assertFalse(serialized.contains(sdkSecret));
        assertFalse(serialized.contains(wireSecret));
    }

    @Test void receivedTraceMatchesSdkThinkingWithConcatenatedRawChineseAndEmojiChunks() throws Exception {
        String reasoning = "分析🧠";
        ChatResponse response = response(AiMessage.builder().text("reply").thinking(reasoning).build(), List.of(
                sseEvent("{\"reasoning_content\":\"分析\"}"),
                sseEvent("{\"reasoning_content\":\"🧠\"}")
        ));

        var records = received(response);
        Map<?, ?> payload = (Map<?, ?>) records.get(0).get("payload");
        Map<?, ?> sdkThinking = (Map<?, ?>) ((Map<?, ?>) payload.get("sdkResponse")).get("thinking");
        Map<?, ?> choice = (Map<?, ?>) ((List<?>) ((Map<?, ?>) payload.get("wireResponse")).get("choices")).get(0);

        assertEquals("present", sdkThinking.get("state"));
        assertEquals(reasoning.length(), sdkThinking.get("characters"));
        assertEquals(sha256(reasoning), sdkThinking.get("sha256"));
        assertEquals(sdkThinking.get("characters"), choice.get("reasoningCharacters"));
        assertEquals(sdkThinking.get("sha256"), choice.get("reasoningSha256"));
        String serialized = JSON.toJSONString(records);
        assertFalse(serialized.contains(reasoning));
        assertFalse(serialized.contains("分析"));
        assertFalse(serialized.contains("🧠"));
    }

    @Test void receivedTraceKeepsEmptySdkThinkingDistinctFromMissingAndEmptyWireFields() throws Exception {
        ChatResponse response = response(AiMessage.builder().text("reply").thinking("").build(), List.of(
                sseEvent("{\"reasoning_content\":null}"),
                sseEvent("{\"reasoning_content\":\"\"}")
        ));

        var records = received(response);
        Map<?, ?> payload = (Map<?, ?>) records.get(0).get("payload");
        Map<?, ?> sdkThinking = (Map<?, ?>) ((Map<?, ?>) payload.get("sdkResponse")).get("thinking");
        Map<?, ?> choice = (Map<?, ?>) ((List<?>) ((Map<?, ?>) payload.get("wireResponse")).get("choices")).get(0);
        Map<?, ?> counts = (Map<?, ?>) choice.get("reasoningFieldCounts");

        assertEquals("empty", sdkThinking.get("state"));
        assertEquals(0, sdkThinking.get("characters"));
        assertEquals(sha256(""), sdkThinking.get("sha256"));
        assertEquals(1, counts.get("null"));
        assertEquals(1, counts.get("empty"));
        assertEquals(0, choice.get("reasoningCharacters"));
        assertEquals(sha256(""), choice.get("reasoningSha256"));
    }

    private List<Map<String, Object>> received(ChatResponse response) {
        var records = new ArrayList<Map<String, Object>>();
        new AiAgentDebugTrace(context, records::add).modelReceived("call", response);
        return records;
    }

    private ChatResponse response(AiMessage message, List<ServerSentEvent> events) {
        var metadata = OpenAiChatResponseMetadata.builder().rawServerSentEvents(events).build();
        return ChatResponse.builder().aiMessage(message).metadata(metadata).build();
    }

    private static ServerSentEvent sseEvent(String deltaJson) {
        return new ServerSentEvent("message", "{\"choices\":[{\"index\":0,\"delta\":" + deltaJson + "}]}");
    }

    private static String sha256(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private AiAgentEventPO event(String id) {
        var event = new AiAgentEventPO(); event.setEventId(id); event.setThreadId("thread"); event.setTurnId("turn"); event.setRunId("run");
        event.setSequenceNo(10L); event.setCreatedAt(1L); event.setEventType("frontend.effect.completed");
        event.setPayloadJson("{\"operationId\":\"op\",\"toolCallId\":\"call\",\"status\":\"applied\"}"); return event;
    }
}
