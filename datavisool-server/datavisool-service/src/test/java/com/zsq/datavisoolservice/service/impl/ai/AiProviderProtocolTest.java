/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.zsq.datavisoolservice.service.impl.ai.extension.TestExtensionProviderStrategy;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.json.JsonObjectSchema;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;

/** 用真实 HTTP 请求验证协议及兜底，不需要真实厂商账号。 */
class AiProviderProtocolTest {
    private static AnnotationConfigApplicationContext providers;
    private static LangChain4jModelProviderFactory factory;

    @BeforeAll
    static void loadProviders() {
        providers = new AnnotationConfigApplicationContext(AiProviderTestConfiguration.class);
        factory = providers.getBean(LangChain4jModelProviderFactory.class);
    }

    @AfterAll
    static void closeProviders() { providers.close(); }
    private final List<Wire> requests = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private Function<Wire, Reply> responder;
    private String base;

    record Wire(String path, JSONObject body, String authorization, String googleKey, String anthropicKey) { }
    record Reply(int status, String contentType, String body) { }

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::respond);
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort() + "/proxy/v1";
    }

    @AfterEach
    void stopServer() { if (server != null) server.stop(0); }

    private void respond(HttpExchange exchange) throws IOException {
        Wire wire = new Wire(exchange.getRequestURI().getPath(), JSON.parseObject(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)),
                exchange.getRequestHeaders().getFirst("Authorization"), exchange.getRequestHeaders().getFirst("x-goog-api-key"),
                exchange.getRequestHeaders().getFirst("x-api-key"));
        requests.add(wire);
        Reply reply = responder.apply(wire);
        byte[] bytes = reply.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", reply.contentType());
        exchange.sendResponseHeaders(reply.status(), bytes.length);
        try (var output = exchange.getResponseBody()) { output.write(bytes); }
    }

    private AiModelConfig config(String provider) { return new AiModelConfig(provider, base, "test-key", "test-model", 0.2, 128L); }
    private ChatRequest request() {
        return ChatRequest.builder().messages(SystemMessage.from("system"), UserMessage.from("hello"))
                .toolSpecifications(ToolSpecification.builder().name("lookup").description("look up")
                        .parameters(JsonObjectSchema.builder().addStringProperty("query").required("query").build()).build()).build();
    }

    private static String nativePath(String provider) {
        return switch (provider) {
            case "gemini" -> "/proxy/v1beta/interactions";
            case "grok" -> "/proxy/v1/responses";
            case "qwen" -> "/proxy/api/v1/services/aigc/text-generation/generation";
            case "minimax" -> "/proxy/v1/text/chatcompletion_v2";
            case "ollama" -> "/proxy/api/chat";
            default -> "/proxy/v1/messages";
        };
    }

    private static String compatiblePath(String provider) {
        return switch (provider) {
            case "gemini" -> "/proxy/v1beta/openai/chat/completions";
            case "qwen" -> "/proxy/compatible-mode/v1/chat/completions";
            default -> "/proxy/v1/chat/completions";
        };
    }

    @ParameterizedTest
    @CsvSource({
            "mimo,mimo-v2.6-flash,max_completion_tokens,131072",
            "mimo,mimo-v2.6-pro,max_completion_tokens,131072",
            "kimi,kimi-k3,max_completion_tokens,131072",
            "deepseek,deepseek-v4-pro,max_tokens,65536",
            "glm,glm-5.2,max_tokens,65536",
            "openai,gpt-5.5,max_completion_tokens,25000",
            "anthropic,claude-haiku-4-5-20251001,max_tokens,64000"
    })
    void blankConfigurationSendsOfficialModelBudget(String provider, String model, String field, long budget) {
        responder = ignored -> new Reply(200, "application/json", nativeResponse(provider));
        factory.createChatModel(new AiModelConfig(provider, base, "test-key", model, 0.2, null)).chat(request());
        assertEquals(model, requests.get(0).body().getString("model"));
        assertEquals(budget, requests.get(0).body().getLongValue(field));
        assertEquals(1, requests.size());
        if ("max_completion_tokens".equals(field)) assertFalse(requests.get(0).body().containsKey("max_tokens"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama", "compatible"})
    void modelsWithoutCatalogBudgetOmitTheLimitAndUseProviderDefaults(String provider) {
        responder = ignored -> new Reply(200, "application/json", nativeResponse(provider));
        factory.createChatModel(new AiModelConfig(provider, base, "test-key", "test-model", 0.2, null)).chat(request());
        String body = requests.get(0).body().toJSONString();
        assertFalse(body.contains("max_tokens"));
        assertFalse(body.contains("max_completion_tokens"));
        assertFalse(body.contains("max_output_tokens"));
        assertFalse(body.contains("num_predict"));
        assertEquals(1, requests.size());
        assertEquals("compatible".equals(provider) ? compatiblePath(provider) : nativePath(provider), requests.get(0).path());
    }

    @ParameterizedTest
    @CsvSource({"mimo,mimo-v2.6-pro", "kimi,kimi-k3", "openai,gpt-5.5"})
    void remainingContextBudgetOverridesTheModelDefaultInTheWireRequest(String provider, String modelName) {
        responder = ignored -> new Reply(200, "application/json", openAiResponse());
        var model = new AiModelConfig(provider, base, "test-key", modelName, 0.2, null);
        factory.createChatModel(model).chat(ChatRequest.builder().messages(request().messages())
                .toolSpecifications(request().toolSpecifications()).maxOutputTokens(1_234).build());
        assertEquals(1_234, requests.get(0).body().getIntValue("max_completion_tokens"));
        assertFalse(requests.get(0).body().containsKey("max_tokens"));
    }

    @Test
    void streamingBudgetAlsoOverridesMiMoDefaultWithoutSendingMaxTokens() throws Exception {
        responder = ignored -> new Reply(200, "text/event-stream", openAiStream());
        CompletableFuture<ChatResponse> result = new CompletableFuture<>();
        var model = new AiModelConfig("mimo", base, "test-key", "mimo-v2.6-pro", 0.2, null);
        factory.createStreamingChatModel(model).chat(ChatRequest.builder().messages(UserMessage.from("hello"))
                .maxOutputTokens(1_234).build(), new StreamingChatResponseHandler() {
                    @Override public void onCompleteResponse(ChatResponse response) { result.complete(response); }
                    @Override public void onError(Throwable error) { result.completeExceptionally(error); }
                });
        assertEquals("你好", result.get(5, TimeUnit.SECONDS).aiMessage().text());
        assertEquals(1_234, requests.get(0).body().getIntValue("max_completion_tokens"));
        assertFalse(requests.get(0).body().containsKey("max_tokens"));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void miMoSendsFileReferenceToolsWithoutClosingDynamicPatchConfiguration(boolean streaming) throws Exception {
        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiStream() : openAiResponse());
        var tools = new AiAgentToolCatalog(null, null).specifications();
        var request = ChatRequest.builder().messages(UserMessage.from("hello"))
                .toolSpecifications(tools).maxOutputTokens(1_234).build();
        if (streaming) {
            CompletableFuture<ChatResponse> response = new CompletableFuture<>();
            factory.createStreamingChatModel(config("mimo")).chat(request, new StreamingChatResponseHandler() {
                @Override public void onCompleteResponse(ChatResponse value) { response.complete(value); }
                @Override public void onError(Throwable error) { response.completeExceptionally(error); }
            });
            assertEquals("你好", response.get(5, TimeUnit.SECONDS).aiMessage().text());
        } else {
            assertEquals("你好", factory.createChatModel(config("mimo")).chat(request).aiMessage().text());
        }
        assertEquals(1, requests.size());
        var sent = requests.get(0).body();
        assertEquals(1_234, sent.getIntValue("max_completion_tokens"));
        assertFalse(sent.containsKey("max_tokens"));
        var sentTools = sent.getJSONArray("tools");
        assertEquals(tools.size(), sentTools.size());
        for (int i = 0; i < tools.size(); i++) {
            var function = sentTools.getJSONObject(i).getJSONObject("function");
            assertEquals(Boolean.TRUE, function.getBoolean("strict"), tools.get(i).name());
            if (List.of("create_canvas_components", "patch_canvas_components").contains(function.getString("name"))) {
                var parameters = function.getJSONObject("parameters");
                assertEquals(java.util.Set.of("path", "expectedRevision"), parameters.getJSONObject("properties").keySet());
                assertEquals(List.of("path", "expectedRevision"), parameters.getJSONArray("required").toJavaList(String.class));
            }
            if ("confirm_canvas_patch".equals(function.getString("name"))) {
                var patch = function.getJSONObject("parameters").getJSONObject("properties")
                        .getJSONObject("patches").getJSONObject("items").getJSONObject("properties");
                assertEquals(Boolean.TRUE, patch.getJSONObject("dataPatch").getBoolean("additionalProperties"));
                assertEquals(Boolean.TRUE, patch.getJSONObject("stylePatch").getJSONObject("properties")
                        .getJSONObject("style").getBoolean("additionalProperties"));
            }
            assertEquals(Boolean.FALSE, tools.get(i).strict(), "不能修改共享工具定义");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"openai", "deepseek", "kimi", "glm", "compatible"})
    void otherProvidersKeepTheAgentToolStrictnessUnchanged(String provider) {
        responder = ignored -> new Reply(200, "application/json", openAiResponse());
        factory.createChatModel(config(provider)).chat(ChatRequest.builder().messages(UserMessage.from("hello"))
                .toolSpecifications(AiAgentToolDefinitions.specification("create_canvas_components")).build());
        var function = requests.get(0).body().getJSONArray("tools").getJSONObject(0).getJSONObject("function");
        assertNotEquals(Boolean.TRUE, function.getBoolean("strict"));
        assertEquals(java.util.Set.of("path", "expectedRevision"), function.getJSONObject("parameters").getJSONObject("properties").keySet());
        assertEquals(List.of("path", "expectedRevision"), function.getJSONObject("parameters").getJSONArray("required").toJavaList(String.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax"})
    void nativeResponsesRetainReportedCachedInputTokens(String provider) {
        var raw = JSON.parseObject(nativeResponse(provider));
        var usage = raw.getJSONObject("usage");
        if (provider.equals("gemini")) usage.put("total_cached_tokens", 2);
        else usage.put("input_tokens_details", fixtureObject("cached_tokens", 2));
        responder = ignored -> new Reply(200, "application/json", raw.toJSONString());
        var response = factory.createChatModel(config(provider)).chat(request());
        var tokens = assertInstanceOf(com.zsq.datavisoolservice.service.impl.ai.provider.AiProviderTokenUsage.class, response.tokenUsage());
        assertEquals(2, tokens.cachedInputTokens());
        assertNull(tokens.cacheCreationInputTokens());
        assertEquals(3, tokens.inputTokenCount());
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama", "anthropic"})
    void sendsNativeProtocolBeforeCompatibility(String provider) {
        responder = ignored -> new Reply(200, "application/json", nativeResponse(provider));
        ChatResponse result = factory.createChatModel(config(provider)).chat(request());
        assertEquals("你好", result.aiMessage().text());
        assertEquals(3, result.tokenUsage().inputTokenCount());
        assertEquals(2, result.tokenUsage().outputTokenCount());
        assertEquals(1, requests.size());
        Wire sent = requests.get(0);
        assertEquals(nativePath(provider), sent.path());
        switch (provider) {
            case "gemini" -> {
                assertEquals("test-key", sent.googleKey());
                assertFalse(sent.body().getBooleanValue("store"));
                assertEquals("system", sent.body().getString("system_instruction"));
                assertEquals("user_input", sent.body().getJSONArray("input").getJSONObject(0).getString("type"));
                assertEquals(128, sent.body().getJSONObject("generation_config").getIntValue("max_output_tokens"));
            }
            case "grok" -> {
                assertNotNull(sent.body().getJSONArray("input"));
                assertFalse(sent.body().getBooleanValue("store"));
                assertEquals(128, sent.body().getIntValue("max_output_tokens"));
            }
            case "qwen" -> {
                assertNotNull(sent.body().getJSONObject("input").getJSONArray("messages"));
                assertEquals("message", sent.body().getJSONObject("parameters").getString("result_format"));
                assertNotNull(sent.body().getJSONObject("parameters").getJSONArray("tools"));
            }
            case "ollama" -> assertEquals(128, sent.body().getJSONObject("options").getIntValue("num_predict"));
            case "anthropic" -> {
                assertEquals("test-key", sent.anthropicKey());
                assertEquals("system", sent.body().getJSONArray("system").getJSONObject(0).getString("text"));
            }
            default -> assertNotNull(sent.body().getJSONArray("tools"));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama", "anthropic"})
    void fallsBackOnlyAfterNativeRequestFails(String provider) {
        responder = wire -> wire.path().equals(nativePath(provider))
                ? new Reply(404, "application/json", "{}") : new Reply(200, "application/json", openAiResponse());
        var model = factory.createChatModel(config(provider));
        assertEquals("你好", model.chat(request()).aiMessage().text());
        assertEquals(List.of(nativePath(provider), compatiblePath(provider)), requests.stream().map(Wire::path).toList());
        assertEquals("test-key", requests.get(1).authorization().substring("Bearer ".length()));
        assertEquals(128, requests.get(1).body().getIntValue("max_tokens"));
        assertEquals("你好", model.chat(request()).aiMessage().text());
        assertEquals(compatiblePath(provider), requests.get(2).path());
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama", "anthropic"})
    void streamsNativeProtocol(String provider) throws Exception {
        responder = ignored -> new Reply(200, provider.equals("ollama") ? "application/x-ndjson" : "text/event-stream", nativeStream(provider));
        StringBuilder partial = new StringBuilder();
        ChatResponse result = stream(provider, partial).get(5, TimeUnit.SECONDS);
        assertEquals("你好", result.aiMessage().text());
        assertEquals("你好", partial.toString());
        assertEquals(1, requests.size());
        assertEquals(nativePath(provider), requests.get(0).path());
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama", "anthropic"})
    void streamsCompatibilityWhenNativeEndpointIsUnavailable(String provider) throws Exception {
        responder = wire -> wire.path().equals(nativePath(provider)) ? new Reply(404, "application/json", "{}")
                : new Reply(200, "text/event-stream", openAiStream());
        StringBuilder partial = new StringBuilder();
        assertEquals("你好", stream(provider, partial).get(5, TimeUnit.SECONDS).aiMessage().text());
        assertEquals("你好", partial.toString());
        assertEquals(List.of(nativePath(provider), compatiblePath(provider)), requests.stream().map(Wire::path).toList());
    }

    @ParameterizedTest
    @ValueSource(strings = {"deepseek", "mimo", "kimi", "glm", "doubao", "hunyuan"})
    void preservesOfficialChatCompletionsFields(String provider) {
        responder = ignored -> new Reply(200, "application/json", openAiResponse());
        ChatRequest withHistory = request().toBuilder().messages(UserMessage.from("hello"),
                AiMessage.builder().text("previous").thinking("previous thinking").build(), UserMessage.from("continue")).build();
        factory.createChatModel(config(provider)).chat(withHistory);
        JSONObject sent = requests.get(0).body();
        assertEquals("previous thinking", sent.getJSONArray("messages").getJSONObject(1).getString("reasoning_content"));
        assertEquals(128, sent.getIntValue(provider.equals("mimo") || provider.equals("kimi") ? "max_completion_tokens" : "max_tokens"));
        assertEquals(1, requests.size());
    }

    @ParameterizedTest
    @CsvSource({"deepseek,false,true", "kimi,false,false", "deepseek,true,true", "kimi,true,false"})
    void compatibilityFallbackPreservesReasoningOnlyForDeepSeek(String provider, boolean streaming,
                                                                  boolean fallbackSendsThinking) throws Exception {
        responder = ignored -> requests.size() == 1
                ? new Reply(404, "application/json", "{}")
                : new Reply(200, streaming ? "text/event-stream" : "application/json",
                        streaming ? openAiStream() : openAiResponse());
        ToolExecutionRequest unreasonedCall = ToolExecutionRequest.builder().id("call-without-thinking")
                .name("lookup").arguments("{\"query\":\"x\"}").build();
        ChatRequest withHistory = request().toBuilder().messages(UserMessage.from("hello"),
                AiMessage.builder().text("previous").thinking("previous thinking").build(),
                AiMessage.builder().toolExecutionRequests(List.of(unreasonedCall)).build(),
                ToolExecutionResultMessage.from(unreasonedCall, "tool result"),
                AiMessage.builder().text("plain assistant without thinking").build(), UserMessage.from("continue")).build();

        if (streaming) {
            CompletableFuture<ChatResponse> response = new CompletableFuture<>();
            factory.createStreamingChatModel(config(provider)).chat(withHistory, new StreamingChatResponseHandler() {
                @Override public void onCompleteResponse(ChatResponse value) { response.complete(value); }
                @Override public void onError(Throwable error) { response.completeExceptionally(error); }
            });
            assertEquals("你好", response.get(5, TimeUnit.SECONDS).aiMessage().text());
        } else {
            assertEquals("你好", factory.createChatModel(config(provider)).chat(withHistory).aiMessage().text());
        }

        assertEquals(2, requests.size());
        assertEquals("previous thinking", requests.get(0).body().getJSONArray("messages").getJSONObject(1)
                .getString("reasoning_content"));
        JSONObject compatibilityMessage = requests.get(1).body().getJSONArray("messages").getJSONObject(1);
        if (fallbackSendsThinking) assertEquals("previous thinking", compatibilityMessage.getString("reasoning_content"));
        else assertFalse(compatibilityMessage.containsKey("reasoning_content"));
        JSONObject toolCallMessage = requests.get(1).body().getJSONArray("messages").getJSONObject(2);
        if (fallbackSendsThinking) {
            assertTrue(toolCallMessage.containsKey("reasoning_content"));
            assertEquals("", toolCallMessage.getString("reasoning_content"));
        } else {
            assertFalse(toolCallMessage.containsKey("reasoning_content"));
        }
        JSONObject plainAssistantMessage = requests.get(1).body().getJSONArray("messages").getJSONObject(4);
        if (fallbackSendsThinking) {
            assertTrue(plainAssistantMessage.containsKey("reasoning_content"));
            assertEquals("", plainAssistantMessage.getString("reasoning_content"));
        } else {
            assertFalse(plainAssistantMessage.containsKey("reasoning_content"));
        }
    }

    @ParameterizedTest
    @CsvSource({
            "false,missing", "false,null", "false,empty", "false,present",
            "true,missing", "true,null", "true,empty", "true,present"
    })
    void deepSeekKeepsEmptyReasoningAcrossResponseAndSecondRound(boolean streaming, String reasoningState) throws Exception {
        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiReasoningStream(reasoningState) : openAiReasoningResponse(reasoningState));
        var firstRequest = request().toBuilder().messages(UserMessage.from("first round")).build();
        ChatResponse first = invoke("deepseek", streaming, firstRequest);

        String expectedThinking = reasoningState.equals("present") ? "思考🧠" : "";
        if (reasoningState.equals("present")) assertEquals(expectedThinking, first.aiMessage().thinking());

        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiStream() : openAiResponse());
        ChatRequest nextRequest = request().toBuilder().messages(UserMessage.from("first round"), first.aiMessage(),
                ToolExecutionResultMessage.from(first.aiMessage().toolExecutionRequests().get(0), "tool result"),
                UserMessage.from("continue")).build();
        invoke("deepseek", streaming, nextRequest);

        assertEquals(2, requests.size());
        JSONObject assistant = requests.get(1).body().getJSONArray("messages").stream()
                .map(value -> (JSONObject) value).filter(value -> "assistant".equals(value.getString("role")))
                .findFirst().orElseThrow();
        assertTrue(assistant.containsKey("reasoning_content"), "DeepSeek must resend even an empty thinking value");
        assertEquals(expectedThinking, assistant.getString("reasoning_content"));
        JSONObject sentCall = assistant.getJSONArray("tool_calls").getJSONObject(0);
        assertEquals("lookup-call", sentCall.getString("id"));
        assertEquals("lookup", sentCall.getJSONObject("function").getString("name"));
        assertEquals("{\"query\":\"x\"}", sentCall.getJSONObject("function").getString("arguments"));
        JSONObject sentToolResult = requests.get(1).body().getJSONArray("messages").stream()
                .map(value -> (JSONObject) value).filter(value -> "tool".equals(value.getString("role")))
                .findFirst().orElseThrow();
        assertEquals("lookup-call", sentToolResult.getString("tool_call_id"));
        assertEquals("tool result", sentToolResult.getString("content"));
    }

    @ParameterizedTest
    @CsvSource({
            "kimi,false,missing", "kimi,false,null", "kimi,true,missing", "kimi,true,null",
            "compatible,false,missing", "compatible,false,null", "compatible,true,missing", "compatible,true,null"
    })
    void otherCompatibleProvidersDoNotInventMissingReasoning(String provider, boolean streaming, String reasoningState) throws Exception {
        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiReasoningStream(reasoningState) : openAiReasoningResponse(reasoningState));
        ChatResponse first = invoke(provider, streaming, request().toBuilder()
                .messages(UserMessage.from("first round")).build());
        assertNull(first.aiMessage().thinking());

        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiStream() : openAiResponse());
        invoke(provider, streaming, request().toBuilder().messages(UserMessage.from("first round"), first.aiMessage(),
                UserMessage.from("continue")).build());

        JSONObject assistant = requests.get(1).body().getJSONArray("messages").stream()
                .map(value -> (JSONObject) value).filter(value -> "assistant".equals(value.getString("role")))
                .findFirst().orElseThrow();
        assertFalse(assistant.containsKey("reasoning_content"), provider + " must not synthesize the field");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void deepSeekDoesNotAddEmptyReasoningWhenRequestHasNoTools(boolean streaming) throws Exception {
        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiStream() : openAiResponse());
        ChatRequest withoutTools = ChatRequest.builder().messages(UserMessage.from("first round"),
                AiMessage.builder().text("assistant without thinking").build(), UserMessage.from("continue")).build();

        invoke("deepseek", streaming, withoutTools);

        JSONObject assistant = requests.get(0).body().getJSONArray("messages").getJSONObject(1);
        assertFalse(assistant.containsKey("reasoning_content"));
    }

    @Test
    void doesNotReplayAStreamAfterTextWasDelivered() throws Exception {
        responder = ignored -> new Reply(200, "text/event-stream", """
                data: {"event_type":"step.start","index":0,"step":{"type":"model_output","content":[]}}

                data: {"event_type":"step.delta","index":0,"delta":{"type":"text","text":"partial"}}

                data: {"event_type":"error","error":{"code":"failed","message":"broken"}}

                """);
        StringBuilder partial = new StringBuilder();
        Exception error = assertThrows(Exception.class, () -> stream("gemini", partial).get(5, TimeUnit.SECONDS));
        assertInstanceOf(AiProviderFallback.ResponseStartedException.class, error.getCause());
        assertEquals("partial", partial.toString());
        assertEquals(1, requests.size());
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 429})
    void doesNotRetryAuthenticationOrRateLimitFailures(int status) {
        responder = ignored -> new Reply(status, "application/json", "{}");
        assertThrows(RuntimeException.class, () -> factory.createChatModel(config("gemini")).chat(request()));
        assertEquals(1, requests.size());
    }

    @Test
    void preservesGeminiThoughtSignaturesAndToolIdsAcrossCheckpoint() {
        String toolResponse = """
                {"id":"g1","status":"requires_action","steps":[
                {"type":"thought","signature":"opaque-signature","summary":[{"type":"text","text":"thinking"}]},
                {"type":"function_call","id":"call-1","name":"lookup","arguments":{"query":"x"}}]}
                """;
        responder = ignored -> new Reply(200, "application/json", requests.size() == 1 ? toolResponse : nativeResponse("gemini"));
        var model = factory.createChatModel(config("gemini"));
        AiMessage first = AiAgentRuntime.assignToolCallIds(model.chat(request()).aiMessage());
        String id = first.toolExecutionRequests().get(0).id();
        assertNotEquals("call-1", id);
        JacksonChatMessageJsonCodec checkpoint = new JacksonChatMessageJsonCodec();
        List<ChatMessage> history = checkpoint.messagesFromJson(checkpoint.messagesToJson(List.of(UserMessage.from("hello"), first,
                ToolExecutionResultMessage.from(first.toolExecutionRequests().get(0), "result"))));
        assertEquals("你好", model.chat(request().toBuilder().messages(history).build()).aiMessage().text());
        var input = requests.get(1).body().getJSONArray("input");
        assertEquals("opaque-signature", input.getJSONObject(1).getString("signature"));
        assertEquals(id, input.getJSONObject(2).getString("id"));
        assertEquals(id, input.getJSONObject(3).getString("call_id"));
    }

    @Test
    void usesNativeQwenImageFormatAndMultimodalEndpoint() {
        responder = ignored -> new Reply(200, "application/json", nativeResponse("qwen"));
        factory.createChatModel(config("qwen")).chat(ChatRequest.builder().messages(UserMessage.from(
                TextContent.from("image"), ImageContent.from("aGVsbG8=", "image/png"))).build());
        assertEquals("/proxy/api/v1/services/aigc/multimodal-generation/generation", requests.get(0).path());
        var content = requests.get(0).body().getJSONObject("input").getJSONArray("messages").getJSONObject(0).getJSONArray("content");
        assertEquals("data:image/png;base64,aGVsbG8=", content.getJSONObject(1).getString("image"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama", "anthropic", "mimo", "openai"})
    void preservesProgramAssignedToolCallsAndResultsAcrossCheckpoint(String provider) {
        responder = ignored -> new Reply(200, "application/json", requests.size() == 1
                ? nativeToolResponse(provider) : nativeResponse(provider));
        var model = factory.createChatModel(config(provider));
        AiMessage first = AiAgentRuntime.assignToolCallIds(model.chat(request()).aiMessage());
        var call = first.toolExecutionRequests().get(0);
        assertNotEquals("call-1", call.id());
        assertEquals("lookup", call.name());
        assertEquals("x", JSON.parseObject(call.arguments()).getString("query"));
        JacksonChatMessageJsonCodec checkpoint = new JacksonChatMessageJsonCodec();
        List<ChatMessage> history = checkpoint.messagesFromJson(checkpoint.messagesToJson(List.of(UserMessage.from("hello"), first,
                ToolExecutionResultMessage.from(call, "tool result"))));
        assertEquals("你好", model.chat(request().toBuilder().messages(history).build()).aiMessage().text());
        assertEquals(2, requests.size());
        assertEquals(provider.equals("mimo") || provider.equals("openai") ? compatiblePath(provider) : nativePath(provider), requests.get(1).path());
        JSONObject body = requests.get(1).body();
        switch (provider) {
            case "gemini" -> {
                assertEquals(call.id(), body.getJSONArray("input").getJSONObject(2).getString("id"));
                assertEquals(call.id(), body.getJSONArray("input").getJSONObject(3).getString("call_id"));
                assertEquals("x", body.getJSONArray("input").getJSONObject(2).getJSONObject("arguments").getString("query"));
            }
            case "grok" -> {
                var input = body.getJSONArray("input");
                assertEquals("encrypted", input.getJSONObject(1).getString("encrypted_content"));
                assertEquals("item-1", input.getJSONObject(2).getString("id"));
                assertEquals(call.id(), input.getJSONObject(2).getString("call_id"));
                assertEquals(call.id(), input.getJSONObject(3).getString("call_id"));
            }
            case "qwen" -> {
                var messages = body.getJSONObject("input").getJSONArray("messages");
                assertEquals(call.id(), messages.getJSONObject(1).getJSONArray("tool_calls").getJSONObject(0).getString("id"));
                assertEquals(call.id(), messages.getJSONObject(2).getString("tool_call_id"));
            }
            case "ollama" -> {
                var messages = body.getJSONArray("messages");
                assertEquals("lookup", messages.getJSONObject(2).getString("tool_name"));
                assertEquals("x", messages.getJSONObject(1).getJSONArray("tool_calls").getJSONObject(0)
                        .getJSONObject("function").getJSONObject("arguments").getString("query"));
            }
            case "anthropic" -> {
                var messages = body.getJSONArray("messages");
                assertEquals(call.id(), messages.getJSONObject(1).getJSONArray("content").getJSONObject(0).getString("id"));
                assertEquals(call.id(), messages.getJSONObject(2).getJSONArray("content").getJSONObject(0).getString("tool_use_id"));
            }
            default -> {
                var messages = body.getJSONArray("messages");
                assertEquals(call.id(), messages.getJSONObject(1).getJSONArray("tool_calls").getJSONObject(0).getString("id"));
                assertEquals(call.id(), messages.getJSONObject(2).getString("tool_call_id"));
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"gemini", "grok", "qwen", "minimax", "ollama"})
    void assemblesNativeStreamingToolArguments(String provider) throws Exception {
        responder = ignored -> new Reply(200, provider.equals("ollama") ? "application/x-ndjson" : "text/event-stream", nativeToolStream(provider));
        ChatResponse response = stream(provider, new StringBuilder()).get(5, TimeUnit.SECONDS);
        var call = response.aiMessage().toolExecutionRequests().get(0);
        assertEquals("lookup", call.name());
        assertEquals("x", JSON.parseObject(call.arguments()).getString("query"));
        if (!provider.equals("ollama")) assertEquals("call-1", call.id());
        assertEquals(1, requests.size());
    }

    @Test
    void acceptsOllamaWithoutAnApiKey() {
        responder = ignored -> new Reply(200, "application/json", nativeResponse("ollama"));
        factory.createChatModel(new AiModelConfig("ollama", base, null, "test-model", 0.2, 128L)).chat(request());
        assertNull(requests.get(0).authorization());
    }

    @Test
    void doesNotReplayAnInterruptedCompatibilityStream() throws Exception {
        responder = wire -> wire.path().equals(nativePath("gemini")) ? new Reply(404, "application/json", "{}")
                : new Reply(200, "text/event-stream", """
                data: {"id":"c1","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}

                data: {broken}

                """);
        Exception failure = assertThrows(Exception.class, () -> stream("gemini", new StringBuilder()).get(5, TimeUnit.SECONDS));
        assertInstanceOf(AiProviderFallback.ResponseStartedException.class, failure.getCause());
        assertEquals(2, requests.size());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void usesAnAdditionalStrategysCompatibilityConfiguration(boolean streaming) throws Exception {
        responder = ignored -> new Reply(200, streaming ? "text/event-stream" : "application/json",
                streaming ? openAiStream() : openAiResponse());
        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(AiProviderTestConfiguration.class);
            context.scan("com.zsq.datavisoolservice.service.impl.ai.extension");
            context.refresh();
            context.getBean(TestExtensionProviderStrategy.class).failNative = true;
            var extendedFactory = context.getBean(LangChain4jModelProviderFactory.class);
            var config = new AiModelConfig("extra-provider", base, "test-key", "model", 0.2, 128L);
            ChatResponse result;
            if (streaming) {
                CompletableFuture<ChatResponse> response = new CompletableFuture<>();
                extendedFactory.createStreamingChatModel(config).chat(request(), new StreamingChatResponseHandler() {
                    @Override public void onCompleteResponse(ChatResponse value) { response.complete(value); }
                    @Override public void onError(Throwable error) { response.completeExceptionally(error); }
                });
                result = response.get(5, TimeUnit.SECONDS);
            } else result = extendedFactory.createChatModel(config).chat(request());
            assertEquals("你好", result.aiMessage().text());
            assertEquals(1, requests.size());
            assertEquals("/proxy/v1/compat/chat/completions", requests.get(0).path());
            assertEquals("Bearer test-key", requests.get(0).authorization());
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void terminatesWhenNativeAndCompatibilityProtocolsBothFail(boolean streaming) throws Exception {
        responder = ignored -> new Reply(404, "application/json", "{}");
        Throwable failure;
        if (streaming) {
            Exception error = assertThrows(Exception.class, () -> stream("gemini", new StringBuilder()).get(5, TimeUnit.SECONDS));
            failure = error.getCause();
        } else failure = assertThrows(RuntimeException.class, () -> factory.createChatModel(config("gemini")).chat(request()));
        assertInstanceOf(AiProviderFallback.FallbackFailedException.class, failure);
        assertFalse(AiProviderFallback.canFallback(failure));
        assertEquals(2, requests.size());
        assertEquals(1, failure.getSuppressed().length);
    }

    private static JSONObject fixtureObject(Object... fields) {
        JSONObject value = new JSONObject();
        for (int i = 0; i < fields.length; i += 2) if (fields[i + 1] != null) value.put((String) fields[i], fields[i + 1]);
        return value;
    }

    private static String nativeToolResponse(String provider) {
        JSONObject call = fixtureObject("id", "call-1", "type", "function", "function",
                fixtureObject("name", "lookup", "arguments", "{\"query\":\"x\"}"));
        JSONObject message = fixtureObject("role", "assistant", "reasoning_content", "thinking", "tool_calls", List.of(call));
        return switch (provider) {
            case "gemini" -> """
                    {"id":"g1","status":"completed","steps":[{"type":"thought","signature":"signature","summary":[]},
                    {"type":"function_call","id":"call-1","name":"lookup","arguments":{"query":"x"}}]}
                    """;
            case "grok" -> """
                    {"id":"g1","status":"completed","output":[{"type":"reasoning","id":"reason-1","encrypted_content":"encrypted","summary":[]},
                    {"type":"function_call","id":"item-1","call_id":"call-1","name":"lookup","arguments":"{\\"query\\":\\"x\\"}"}]}
                    """;
            case "qwen" -> fixtureObject("output", fixtureObject("choices", List.of(fixtureObject(
                    "message", message, "finish_reason", "tool_calls")))).toJSONString();
            case "ollama" -> {
                call.remove("id");
                call.getJSONObject("function").put("arguments", fixtureObject("query", "x"));
                yield fixtureObject("message", message, "done", true).toJSONString();
            }
            case "anthropic" -> """
                    {"id":"a1","type":"message","role":"assistant","model":"test-model","content":[
                    {"type":"tool_use","id":"call-1","name":"lookup","input":{"query":"x"}}],"stop_reason":"tool_use",
                    "usage":{"input_tokens":3,"output_tokens":2}}
                    """;
            default -> fixtureObject("id", "m1", "choices", List.of(fixtureObject(
                    "index", 0, "message", message, "finish_reason", "tool_calls"))).toJSONString();
        };
    }

    private static String nativeToolStream(String provider) {
        if (provider.equals("gemini")) return """
                data: {"event_type":"step.start","index":0,"step":{"type":"function_call","id":"call-1","name":"lookup"}}

                data: {"event_type":"step.delta","index":0,"delta":{"type":"function_call","arguments":"{\\"query\\":"}}

                data: {"event_type":"step.delta","index":0,"delta":{"type":"function_call","arguments":"\\"x\\"}"}}

                data: {"event_type":"interaction.completed","interaction":{"id":"g1","status":"completed","steps":[]}}

                """;
        if (provider.equals("grok")) return "data: " + fixtureObject("type", "response.output_item.done", "output_index", 0,
                "item", JSON.parseObject(nativeToolResponse("grok")).getJSONArray("output").getJSONObject(1)).toJSONString()
                + "\n\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"r1\",\"status\":\"completed\",\"output\":[]}}\n\n";
        if (provider.equals("ollama")) return nativeToolResponse(provider).trim() + "\n";
        StringBuilder events = new StringBuilder();
        List<String> fragments = List.of("{\"query\":", "\"x\"}");
        for (int i = 0; i < fragments.size(); i++) {
            JSONObject delta = fixtureObject("tool_calls", List.of(fixtureObject("index", 0, "id", "call-1", "type", "function",
                    "function", fixtureObject("name", "lookup", "arguments", fragments.get(i)))));
            JSONObject choice = fixtureObject(provider.equals("qwen") ? "message" : "delta", delta,
                    "index", 0, "finish_reason", i == 1 ? "tool_calls" : null);
            JSONObject event = provider.equals("qwen") ? fixtureObject("output", fixtureObject("choices", List.of(choice)))
                    : fixtureObject("choices", List.of(choice));
            events.append("data: ").append(event.toJSONString()).append("\n\n");
        }
        return events.toString();
    }

    private CompletableFuture<ChatResponse> stream(String provider, StringBuilder partial) {
        CompletableFuture<ChatResponse> result = new CompletableFuture<>();
        factory.createStreamingChatModel(config(provider)).chat(request(), new StreamingChatResponseHandler() {
            @Override public void onPartialResponse(String text) { partial.append(text); }
            @Override public void onCompleteResponse(ChatResponse response) { result.complete(response); }
            @Override public void onError(Throwable error) { result.completeExceptionally(error); }
        });
        return result;
    }

    private ChatResponse invoke(String provider, boolean streaming, ChatRequest request) throws Exception {
        if (!streaming) return factory.createChatModel(config(provider)).chat(request);
        CompletableFuture<ChatResponse> result = new CompletableFuture<>();
        factory.createStreamingChatModel(config(provider)).chat(request, new StreamingChatResponseHandler() {
            @Override public void onCompleteResponse(ChatResponse response) { result.complete(response); }
            @Override public void onError(Throwable error) { result.completeExceptionally(error); }
        });
        return result.get(5, TimeUnit.SECONDS);
    }

    private static String openAiReasoningResponse(String reasoningState) {
        String message = withReasoningField(fixtureObject("role", "assistant", "content", "处理中",
                "tool_calls", List.of(fixtureObject("id", "lookup-call", "type", "function",
                        "function", fixtureObject("name", "lookup", "arguments", "{\"query\":\"x\"}")))), reasoningState);
        return "{\"id\":\"c1\",\"choices\":[{\"index\":0,\"message\":" + message
                + ",\"finish_reason\":\"tool_calls\"}]}";
    }

    private static String openAiReasoningStream(String reasoningState) {
        String delta = withReasoningField(fixtureObject("role", "assistant", "content", "处理中",
                "tool_calls", List.of(fixtureObject("index", 0, "id", "lookup-call", "type", "function",
                        "function", fixtureObject("name", "lookup", "arguments", "{\"query\":\"x\"}")))), reasoningState);
        String first = "{\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":" + delta + "}]}";
        String finished = fixtureObject("id", "c1", "choices", List.of(fixtureObject("index", 0,
                "delta", fixtureObject(), "finish_reason", "tool_calls"))).toJSONString();
        return "data: " + first + "\n\n" + "data: " + finished + "\n\n" + "data: [DONE]\n\n";
    }

    private static String withReasoningField(JSONObject object, String reasoningState) {
        String field = switch (reasoningState) {
            case "null" -> "\"reasoning_content\":null";
            case "empty" -> "\"reasoning_content\":\"\"";
            case "present" -> "\"reasoning_content\":\"思考🧠\"";
            default -> null;
        };
        String json = object.toJSONString();
        if (field == null) return json;
        return json.substring(0, json.length() - 1) + "," + field + "}";
    }

    private static String openAiResponse() {
        return """
                {"id":"c1","object":"chat.completion","model":"test-model","choices":[{"index":0,"message":{"role":"assistant","content":"你好"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}
                """;
    }

    private static String nativeResponse(String provider) {
        return switch (provider) {
            case "gemini" -> """
                    {"id":"g1","model":"test-model","status":"completed","steps":[{"type":"model_output","content":[{"type":"text","text":"你好"}]}],"usage":{"total_input_tokens":3,"total_output_tokens":2}}
                    """;
            case "grok" -> """
                    {"id":"r1","model":"test-model","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"你好"}]}],"usage":{"input_tokens":3,"output_tokens":2}}
                    """;
            case "qwen" -> """
                    {"output":{"choices":[{"message":{"role":"assistant","content":"你好"},"finish_reason":"stop"}]},"usage":{"input_tokens":3,"output_tokens":2}}
                    """;
            case "ollama" -> """
                    {"model":"test-model","message":{"role":"assistant","content":"你好"},"done":true,"done_reason":"stop","prompt_eval_count":3,"eval_count":2}
                    """;
            case "anthropic" -> """
                    {"id":"a1","type":"message","role":"assistant","model":"test-model","content":[{"type":"text","text":"你好"}],"stop_reason":"end_turn","usage":{"input_tokens":3,"output_tokens":2}}
                    """;
            default -> openAiResponse();
        };
    }

    private static String openAiStream() {
        return """
                data: {"id":"c1","model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"你好"},"finish_reason":null}]}

                data: {"id":"c1","model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}

                data: [DONE]

                """;
    }

    private static String nativeStream(String provider) {
        return switch (provider) {
            case "gemini" -> "data: {\"event_type\":\"step.start\",\"index\":0,\"step\":{\"type\":\"model_output\",\"content\":[]}}\n\n"
                    + "data: {\"event_type\":\"step.delta\",\"index\":0,\"delta\":{\"type\":\"text\",\"text\":\"你好\"}}\n\n"
                    + "data: {\"event_type\":\"interaction.completed\",\"interaction\":" + nativeResponse("gemini").trim() + "}\n\n";
            case "grok" -> "data: {\"type\":\"response.output_text.delta\",\"delta\":\"你好\"}\n\n"
                    + "data: {\"type\":\"response.completed\",\"response\":" + nativeResponse("grok").trim() + "}\n\n";
            case "qwen" -> "data: " + nativeResponse("qwen").trim() + "\n\n";
            case "ollama" -> "{\"message\":{\"content\":\"你好\"},\"done\":false}\n"
                    + "{\"message\":{\"content\":\"\"},\"done\":true,\"prompt_eval_count\":3,\"eval_count\":2}\n";
            case "anthropic" -> """
                    event: message_start
                    data: {"type":"message_start","message":{"id":"a1","type":"message","role":"assistant","model":"test-model","content":[],"usage":{"input_tokens":3,"output_tokens":0}}}

                    event: content_block_start
                    data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

                    event: content_block_delta
                    data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}

                    event: content_block_stop
                    data: {"type":"content_block_stop","index":0}

                    event: message_delta
                    data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}

                    event: message_stop
                    data: {"type":"message_stop"}

                    """;
            default -> openAiStream();
        };
    }
}
