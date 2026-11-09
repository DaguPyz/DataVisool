/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.sun.net.httpserver.HttpServer;
import com.zsq.datavisoolservice.service.impl.ai.provider.AiDeepSeekProviderStrategy;
import com.zsq.datavisoolservice.service.impl.ai.provider.AiOpenAiCompatibleProviderStrategy;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.*;
import dev.langchain4j.http.client.*;
import dev.langchain4j.http.client.sse.*;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class AiModelWireTraceTest {
    private final AiAgentService.AgentExecutionContext context = new AiAgentService.AgentExecutionContext(
            "thread", "project", "turn", "run", "1", "hello", Map.of(), Map.of(), Map.of(), null, null, 0);

    @Test void keepsWireReasoningEvidenceWhenTheStreamFailsBeforeSdkCompletion() {
        RuntimeException failure = new IllegalStateException("stream failed");
        HttpClient transport = new HttpClient() {
            @Override public SuccessfulHttpResponse execute(HttpRequest request) { throw new UnsupportedOperationException(); }
            @Override public void execute(HttpRequest request, ServerSentEventParser parser, ServerSentEventListener listener) {
                listener.onEvent(new ServerSentEvent(null, "{\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"private-thought\"}}]}"));
                listener.onError(failure);
            }
        };
        var client = AiModelWireTrace.client(transport, "deepseek");
        List<Map<String, Object>> records = new ArrayList<>();
        var trace = new AiAgentDebugTrace(context, records::add);
        List<Throwable> errors = new ArrayList<>();
        AiModelWireTrace.withContext(AiModelWireTrace.context(trace, "call"), () -> client.execute(
                HttpRequest.builder().method(HttpMethod.POST).url("http://example.test").body("{\"messages\":[]}").build(),
                new ServerSentEventListener() { @Override public void onError(Throwable error) { errors.add(error); } }));
        assertEquals(List.of(failure), errors);
        JSONObject ended = payload(records.stream().filter(record -> "model.wire.stream.failed".equals(record.get("type"))).findFirst().orElseThrow());
        var choice = ended.getJSONObject("wireResponse").getJSONArray("choices").getJSONObject(0);
        assertEquals(1, choice.getJSONObject("reasoningFieldCounts").getIntValue("present"));
        assertEquals("private-thought".length(), choice.getIntValue("reasoningCharacters"));
        assertFalse(JSON.toJSONString(records).contains("private-thought"));
        assertNull(AiModelWireTrace.capture());
    }

    @Test void observesTheActualSerializedFieldsWithoutLoggingSecretsOrMutatingHistory() throws Exception {
        List<JSONObject> sent = new CopyOnWriteArrayList<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            sent.add(JSON.parseObject(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            byte[] body = "{\"id\":\"response\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            var model = new AiDeepSeekProviderStrategy().createChatModel(config(server, "deepseek"));
            var call = ToolExecutionRequest.builder().id("tool-id").name("lookup").arguments("{}").build();
            List<ChatMessage> history = List.of(UserMessage.from("private-prompt"),
                    AiMessage.builder().text("private-answer").thinking("private-thinking").build(),
                    AiMessage.builder().toolExecutionRequests(List.of(call)).build(), ToolExecutionResultMessage.from(call, "private-tool-result"));
            ChatRequest request = ChatRequest.builder().messages(history)
                    .toolSpecifications(ToolSpecification.builder().name("lookup").build()).build();
            List<Map<String, Object>> records = new ArrayList<>();
            var trace = new AiAgentDebugTrace(context, records::add);
            AiModelWireTrace.withContext(AiModelWireTrace.context(trace, "call"), () -> model.chat(request));

            JSONObject payload = payload(records.get(0));
            assertEquals("model.wire.request", records.get(0).get("type"));
            assertEquals("run", records.get(0).get("runId"));
            assertEquals("call", payload.getString("callId"));
            var assistants = payload.getJSONArray("assistantMessages");
            assertEquals("present", assistants.getJSONObject(0).getJSONObject("reasoningContent").getString("state"));
            assertEquals("empty", assistants.getJSONObject(1).getJSONObject("reasoningContent").getString("state"));
            assertEquals("private-thinking", sent.get(0).getJSONArray("messages").getJSONObject(1).getString("reasoning_content"));
            assertTrue(sent.get(0).getJSONArray("messages").getJSONObject(2).containsKey("reasoning_content"));
            assertEquals("", sent.get(0).getJSONArray("messages").getJSONObject(2).getString("reasoning_content"));
            assertEquals(history, request.messages());
            assertEquals("private-thinking", ((AiMessage) history.get(1)).thinking());
            assertNull(((AiMessage) history.get(2)).thinking());
            assertFalse(JSON.toJSONString(records).contains("private-"));
            assertNull(AiModelWireTrace.capture());

            model.chat(request);
            assertEquals(1, records.size(), "debug context must not leak into later requests");
            assertEquals("", sent.get(1).getJSONArray("messages").getJSONObject(2).getString("reasoning_content"),
                    "empty reasoning must be preserved even when diagnostic logging is disabled");
        } finally { server.stop(0); }
    }

    @Test void asynchronousCompatibilityRetryKeepsTheSameRunAndCallIdentity() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            boolean first = attempts.getAndIncrement() == 0;
            byte[] body = (first ? "{}" : "data: {\"id\":\"response\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", first ? "application/json" : "text/event-stream");
            exchange.sendResponseHeaders(first ? 404 : 200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            var model = AiProviderFallback.streaming("deepseek",
                    new AiDeepSeekProviderStrategy().createStreamingChatModel(config(server, "deepseek")),
                    new AiOpenAiCompatibleProviderStrategy().createFallbackStreamingChatModel(config(server, "compatible"), true));
            List<Map<String, Object>> records = new CopyOnWriteArrayList<>();
            var trace = new AiAgentDebugTrace(context, records::add);
            var result = new CompletableFuture<ChatResponse>();
            AiModelWireTrace.withContext(AiModelWireTrace.context(trace, "call"), () -> model.chat(
                    ChatRequest.builder().messages(UserMessage.from("hello")).build(), new StreamingChatResponseHandler() {
                        @Override public void onCompleteResponse(ChatResponse response) { result.complete(response); }
                        @Override public void onError(Throwable error) { result.completeExceptionally(error); }
                    }));
            ChatResponse response = result.get(5, TimeUnit.SECONDS);
            assertEquals("ok", response.aiMessage().text());
            trace.modelReceived("call", response);
            JSONObject received = payload(records.stream().filter(record -> "model.response.received".equals(record.get("type"))).findFirst().orElseThrow());
            assertTrue(received.getJSONObject("wireResponse").getBooleanValue("available"));
            assertEquals("streaming", received.getJSONObject("wireResponse").getString("mode"));
            assertEquals(1, received.getJSONObject("wireResponse").getJSONArray("choices").getJSONObject(0)
                    .getJSONObject("reasoningFieldCounts").getIntValue("missing"));
            assertEquals("missing", received.getJSONObject("sdkResponse").getJSONObject("thinking").getString("state"));
            var requests = records.stream().filter(record -> "model.wire.request".equals(record.get("type"))).toList();
            assertEquals(2, requests.size());
            assertEquals(List.of("deepseek", "compatible"), requests.stream().map(record -> payload(record).getString("transportProvider")).toList());
            for (var record : requests) {
                assertEquals("run", record.get("runId"));
                assertEquals("call", payload(record).getString("callId"));
            }
            assertNotEquals(payload(requests.get(0)).getString("wireRequestId"), payload(requests.get(1)).getString("wireRequestId"));
            assertNull(AiModelWireTrace.capture());
        } finally { server.stop(0); }
    }

    private static AiModelConfig config(HttpServer server, String provider) {
        return new AiModelConfig(provider, "http://127.0.0.1:" + server.getAddress().getPort(), "private-api-key", "test-model", .2, 128L);
    }

    private static JSONObject payload(Map<String, Object> record) { return JSON.parseObject(JSON.toJSONString(record)).getJSONObject("payload"); }
}
