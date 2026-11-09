/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.exception.HttpException;
import dev.langchain4j.http.client.*;
import dev.langchain4j.http.client.sse.*;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.openai.OpenAiChatResponseMetadata;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import java.util.function.Supplier;

import static com.zsq.datavisoolservice.service.impl.ai.AiAgentDebugTrace.map;

/** 比较真实 HTTP 字段与 SDK 消息；只记录状态、长度和摘要，不改变请求或响应。 */
public final class AiModelWireTrace {
    private static final ThreadLocal<Context> CURRENT = new ThreadLocal<>();

    private AiModelWireTrace() { }

    record Context(AiAgentDebugTrace trace, String callId) { }

    static Context context(AiAgentDebugTrace trace, String callId) {
        return trace != null && trace.enabled() ? new Context(trace, callId) : null;
    }

    static Context capture() { return CURRENT.get(); }

    static <T> T withContext(Context context, Supplier<T> action) {
        Context previous = CURRENT.get();
        if (context == null) CURRENT.remove(); else CURRENT.set(context);
        try { return action.get(); }
        finally {
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
        }
    }

    static void withContext(Context context, Runnable action) {
        withContext(context, () -> { action.run(); return null; });
    }

    public static HttpClientBuilder httpClientBuilder(String provider) {
        HttpClientBuilder delegate = HttpClientBuilderLoader.loadHttpClientBuilder();
        return new HttpClientBuilder() {
            @Override public Duration connectTimeout() { return delegate.connectTimeout(); }
            @Override public HttpClientBuilder connectTimeout(Duration timeout) { delegate.connectTimeout(timeout); return this; }
            @Override public Duration readTimeout() { return delegate.readTimeout(); }
            @Override public HttpClientBuilder readTimeout(Duration timeout) { delegate.readTimeout(timeout); return this; }
            @Override public HttpClient build() { return client(delegate.build(), provider); }
        };
    }

    static HttpClient client(HttpClient delegate, String provider) {
        return new HttpClient() {
            @Override public SuccessfulHttpResponse execute(HttpRequest request) {
                Context context = capture();
                if (context == null) return delegate.execute(request);
                String wireId = started(context, provider, request);
                try { return delegate.execute(request); }
                catch (RuntimeException error) { failed(context, provider, wireId, error); throw error; }
            }

            @Override public void execute(HttpRequest request, ServerSentEventParser parser, ServerSentEventListener listener) {
                Context context = capture();
                if (context == null) { delegate.execute(request, parser, listener); return; }
                String wireId = started(context, provider, request);
                List<String> frames = Collections.synchronizedList(new ArrayList<>());
                delegate.execute(request, parser, new ServerSentEventListener() {
                    @Override public void onOpen(SuccessfulHttpResponse response) { listener.onOpen(response); }
                    @Override public void onEvent(ServerSentEvent event) { frames.add(event.data()); listener.onEvent(event); }
                    @Override public void onEvent(ServerSentEvent event, ServerSentEventContext eventContext) {
                        frames.add(event.data());
                        listener.onEvent(event, eventContext);
                    }
                    @Override public void onError(Throwable error) {
                        failed(context, provider, wireId, error);
                        streamEnded(context, provider, wireId, frames, "model.wire.stream.failed");
                        listener.onError(error);
                    }
                    @Override public void onClose() {
                        streamEnded(context, provider, wireId, frames, "model.wire.stream.closed");
                        listener.onClose();
                    }
                });
            }
        };
    }

    private static String started(Context context, String provider, HttpRequest request) {
        String wireId = UUID.randomUUID().toString();
        context.trace().record("model.wire.request", () -> {
            JSONObject body = JSON.parseObject(request.body());
            List<Map<String, Object>> assistants = new ArrayList<>();
            JSONArray messages = body.getJSONArray("messages");
            if (messages != null) for (int i = 0; i < messages.size(); i++) {
                JSONObject message = messages.getJSONObject(i);
                if (!"assistant".equals(message.getString("role"))) continue;
                assistants.add(map("messageIndex", i,
                        "reasoningContent", fieldSummary(message, "reasoning_content"),
                        "toolCalls", toolCalls(message.getJSONArray("tool_calls")),
                        "fields", new ArrayList<>(message.keySet())));
            }
            return map("callId", context.callId(), "wireRequestId", wireId, "transportProvider", provider,
                    "model", body.getString("model"), "stream", body.getBooleanValue("stream"),
                    "assistantMessages", assistants);
        });
        return wireId;
    }

    private static void failed(Context context, String provider, String wireId, Throwable error) {
        context.trace().record("model.wire.failed", () -> map("callId", context.callId(), "wireRequestId", wireId,
                "transportProvider", provider, "error", error.getClass().getSimpleName(),
                "httpStatus", error instanceof HttpException http ? http.statusCode() : null));
    }

    private static void streamEnded(Context context, String provider, String wireId, List<String> frames, String type) {
        context.trace().record(type, () -> {
            List<String> snapshot;
            synchronized (frames) { snapshot = new ArrayList<>(frames); }
            return map("callId", context.callId(), "wireRequestId", wireId,
                    "transportProvider", provider, "wireResponse", summarizeFrames(snapshot, true, null));
        });
    }

    static Map<String, Object> sdkResponse(ChatResponse response) {
        AiMessage message = response.aiMessage();
        return map("thinking", textSummary(message == null ? null : message.thinking()),
                "toolCalls", message == null || !message.hasToolExecutionRequests() ? List.of()
                        : message.toolExecutionRequests().stream().map(call -> map("id", call.id(), "name", call.name())).toList());
    }

    static Map<String, Object> wireResponse(ChatResponse response) {
        if (!(response.metadata() instanceof OpenAiChatResponseMetadata metadata)) return map("available", false);
        List<ServerSentEvent> events = metadata.rawServerSentEvents();
        boolean streaming = events != null && !events.isEmpty();
        SuccessfulHttpResponse http = metadata.rawHttpResponse();
        if (!streaming && (http == null || http.body() == null)) return map("available", false);
        List<String> frames = streaming ? events.stream().map(ServerSentEvent::data).toList() : List.of(http.body());
        return summarizeFrames(frames, streaming, http == null ? null : http.statusCode());
    }

    private static Map<String, Object> summarizeFrames(List<String> frames, boolean streaming, Integer status) {
        Map<Integer, Choice> choices = new TreeMap<>();
        int parseErrors = 0;
        for (String frame : frames) {
            if (frame == null || frame.isBlank() || "[DONE]".equals(frame.trim())) continue;
            try {
                JSONObject body = JSON.parseObject(frame);
                JSONArray values = body.getJSONArray("choices");
                if (values == null) continue;
                for (int i = 0; i < values.size(); i++) {
                    JSONObject value = values.getJSONObject(i);
                    int index = value.containsKey("index") ? value.getIntValue("index") : i;
                    JSONObject delta = value.getJSONObject(streaming ? "delta" : "message");
                    choices.computeIfAbsent(index, Choice::new).append(delta, value.getString("finish_reason"));
                }
            } catch (RuntimeException ignored) { parseErrors++; }
        }
        return map("available", !frames.isEmpty(), "mode", streaming ? "streaming" : "synchronous",
                "httpStatus", status, "eventCount", streaming ? frames.size() : 0,
                "parseErrors", parseErrors, "choices", choices.values().stream().map(Choice::summary).toList());
    }

    private static Map<String, Object> fieldSummary(JSONObject object, String field) {
        Object value = object.get(field);
        if (!object.containsKey(field)) return map("state", "missing", "characters", 0);
        if (value == null) return map("state", "null", "characters", 0);
        if (!(value instanceof String text)) return map("state", "unexpected_type", "characters", 0);
        return textSummary(text);
    }

    private static Map<String, Object> textSummary(String text) {
        if (text == null) return map("state", "missing", "characters", 0);
        return map("state", text.isEmpty() ? "empty" : "present", "characters", text.length(), "sha256", sha256(text));
    }

    private static List<Map<String, Object>> toolCalls(JSONArray calls) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (calls != null) for (int i = 0; i < calls.size(); i++) {
            JSONObject call = calls.getJSONObject(i);
            JSONObject function = call.getJSONObject("function");
            result.add(map("id", call.getString("id"), "name", function == null ? null : function.getString("name")));
        }
        return result;
    }

    private static String sha256(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    private static final class Choice {
        private final int index;
        private final Set<String> fields = new TreeSet<>();
        private final Map<String, Integer> counts = new LinkedHashMap<>();
        private final StringBuilder reasoning = new StringBuilder();
        private final Set<String> toolIds = new LinkedHashSet<>();
        private String finishReason;

        Choice(int index) { this.index = index; }

        void append(JSONObject delta, String finishReason) {
            if (finishReason != null) this.finishReason = finishReason;
            if (delta == null) return;
            fields.addAll(delta.keySet());
            Map<String, Object> summary = fieldSummary(delta, "reasoning_content");
            counts.merge(summary.get("state").toString(), 1, Integer::sum);
            if (delta.get("reasoning_content") instanceof String text) reasoning.append(text);
            for (Map<String, Object> call : toolCalls(delta.getJSONArray("tool_calls"))) {
                if (call.get("id") instanceof String id) toolIds.add(id);
            }
        }

        Map<String, Object> summary() {
            return map("index", index, "deltaFields", new ArrayList<>(fields), "reasoningFieldCounts", counts,
                    "reasoningCharacters", reasoning.length(), "reasoningSha256", sha256(reasoning.toString()),
                    "toolCallIds", new ArrayList<>(toolIds), "finishReason", finishReason);
        }
    }
}
