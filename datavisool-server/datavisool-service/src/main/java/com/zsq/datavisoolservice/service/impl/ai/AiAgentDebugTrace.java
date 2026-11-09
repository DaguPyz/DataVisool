/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.model.po.AiAgentEventPO;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** 仅输出调试轨迹，不持有运行上下文、不修改模型消息或产品历史。 */
final class AiAgentDebugTrace {
    static final String PREFIX = "==================Agent轨迹=================";
    static final String SCHEMA = "datavisool-agent-trace/v1";
    private static final Logger LOG = LoggerFactory.getLogger(AiAgentDebugTrace.class);
    private static final String PROCESS_ID = UUID.randomUUID().toString();
    private static final AtomicLong PROCESS_ORDER = new AtomicLong();
    private static final Set<String> SECRET_FIELDS = Set.of("apikey", "password", "authorization", "accesstoken",
            "refreshtoken", "secret", "clientsecret");
    private static final Set<String> SERVICE_EVENTS = Set.of(
            "turn.started", "turn.resumed", "turn.steered", "turn.verifying",
            "run.completed", "run.failed", "run.cancelled", "run.interrupted", "run.budget_exhausted",
            "frontend.effect.requested", "frontend.effect.completed", "approval.required", "input.required");

    private final Map<String, Object> identity;
    private final Consumer<Map<String, Object>> sink;
    private final String segmentId = UUID.randomUUID().toString();
    private long sequence;

    AiAgentDebugTrace(AiAgentService.AgentExecutionContext context) {
        this(context, LOG.isDebugEnabled() ? value -> LOG.debug("{}{}", PREFIX, JSON.toJSONString(value, com.alibaba.fastjson2.JSONWriter.Feature.WriteNulls)) : null);
    }

    // 可注入接收器验证数据，生产代码只使用日志接收器。
    AiAgentDebugTrace(AiAgentService.AgentExecutionContext context, Consumer<Map<String, Object>> sink) {
        identity = map("projectId", context.projectId(), "threadId", context.threadId(),
                "turnId", context.turnId(), "runId", context.runId());
        this.sink = sink;
    }

    boolean enabled() { return sink != null; }

    synchronized void record(String type, Supplier<Map<String, Object>> payload) {
        if (!enabled()) return;
        try {
            Map<String, Object> original = payload.get();
            Object sanitized = redact(original);
            // 工具定义中的 password/apiKey 是字段描述，并非实际密钥值。
            if ("model.request".equals(type) && sanitized instanceof Map<?, ?> fields) {
                ((Map<String, Object>) fields).put("tools", original.get("tools"));
            }
            Map<String, Object> value = envelope(identity, type, sanitized);
            value.put("source", "runtime");
            value.put("segmentId", segmentId);
            value.put("sequence", ++sequence);
            value.put("recordId", segmentId + ":" + sequence);
            sink.accept(value);
        } catch (RuntimeException ignored) {
            // 调试序列化或日志接收器失败不能改变 Agent 的执行结果。
        }
    }

    String modelStarted(ChatRequest request, AiModelConfig model, int round, String purpose, String mode) {
        String callId = UUID.randomUUID().toString();
        record("model.request", () -> map("callId", callId, "round", round, "purpose", purpose, "mode", mode,
                "model", map("provider", model.provider(), "modelName", model.modelName(),
                        "temperature", model.temperature(), "maxOutputTokens", model.maxTokens()),
                "messages", messages(request.messages()),
                "tools", request.toolSpecifications() == null ? List.of() : request.toolSpecifications().stream()
                        .map(tool -> JSON.parse(tool.toJson())).toList(),
                "parameters", map("modelName", request.modelName(), "temperature", request.temperature(),
                        "topP", request.topP(), "topK", request.topK(), "maxOutputTokens", request.maxOutputTokens(),
                        "frequencyPenalty", request.frequencyPenalty(), "presencePenalty", request.presencePenalty(),
                        "stopSequences", request.stopSequences(), "toolChoice", request.toolChoice(),
                        "responseFormat", request.responseFormat() == null ? null : request.responseFormat().toString())));
        return callId;
    }

    void modelReceived(String callId, ChatResponse response) {
        record("model.response.received", () -> map("callId", callId, "responseId", response.id(),
                "sdkResponse", AiModelWireTrace.sdkResponse(response),
                "wireResponse", AiModelWireTrace.wireResponse(response)));
    }

    void modelCompleted(String callId, ChatResponse response) {
        record("model.response", () -> map("callId", callId,
                "messages", response.aiMessage() == null ? List.of() : messages(List.of(response.aiMessage())),
                "modelName", response.modelName(), "responseId", response.id(), "finishReason", response.finishReason(),
                "usage", response.tokenUsage() == null ? null : map(
                        "inputTokens", response.tokenUsage().inputTokenCount(),
                        "outputTokens", response.tokenUsage().outputTokenCount(),
                        "totalTokens", response.tokenUsage().totalTokenCount())));
    }

    void modelFailed(String callId, Throwable error, String partialText) {
        record("model.failed", () -> map("callId", callId, "error", error.getClass().getSimpleName(),
                "message", error.getMessage(), "partialText", partialText));
    }

    /** 复用已持久化的事件 ID 和序号；事务回滚时不输出浏览器成功回执。 */
    static void committedEvent(AiAgentEventPO event) {
        if (!LOG.isDebugEnabled() || !SERVICE_EVENTS.contains(event.getEventType())) return;
        try {
            Map<String, Object> value = envelope(map("threadId", event.getThreadId(), "turnId", event.getTurnId(),
                    "runId", event.getRunId()), event.getEventType(), redact(JSON.parse(event.getPayloadJson())));
            value.put("source", "service");
            value.put("recordId", event.getEventId());
            value.put("eventSequence", event.getSequenceNo());
            value.put("eventCreatedAt", event.getCreatedAt());
            Runnable write = () -> {
                try {
                    // 提交顺序与事件发生顺序可能不同，保留两者供查看器关联。
                    value.put("processOrder", PROCESS_ORDER.incrementAndGet());
                    LOG.debug("{}{}", PREFIX, JSON.toJSONString(value, com.alibaba.fastjson2.JSONWriter.Feature.WriteNulls));
                } catch (RuntimeException ignored) { }
            };
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCommit() { write.run(); }
                });
            } else write.run();
        } catch (RuntimeException ignored) { }
    }

    private static Map<String, Object> envelope(Map<String, Object> identity, String type, Object payload) {
        Map<String, Object> value = new LinkedHashMap<>(identity);
        value.putAll(map("schemaVersion", SCHEMA, "type", type, "recordedAt", Instant.now().toString(),
                "processId", PROCESS_ID, "processOrder", PROCESS_ORDER.incrementAndGet(), "payload", payload));
        return value;
    }

    static List<Map<String, Object>> messages(List<ChatMessage> messages) {
        return messages.stream().map(message -> {
            List<Map<String, Object>> content = new ArrayList<>();
            String role;
            if (message instanceof SystemMessage system) {
                role = "system";
                content.add(map("type", "text", "text", system.text()));
            } else if (message instanceof UserMessage user) {
                role = "user";
                for (Content part : user.contents()) {
                    if (part instanceof TextContent text) content.add(map("type", "text", "text", text.text()));
                    else content.add(map("type", "omitted", "contentType", part.type().name(), "text", "[媒体内容已省略]"));
                }
            } else if (message instanceof AiMessage ai) {
                role = "assistant";
                if (ai.thinking() != null) content.add(map("type", "reasoning", "text", ai.thinking()));
                if (ai.text() != null) content.add(map("type", "text", "text", ai.text()));
                if (ai.hasToolExecutionRequests()) ai.toolExecutionRequests().forEach(call -> content.add(
                        map("type", "toolCall", "id", call.id(), "name", call.name(), "arguments", jsonOrText(call.arguments()))));
                if (ai.images() != null && !ai.images().isEmpty()) content.add(map("type", "omitted", "text", "[生成图片已省略]"));
            } else if (message instanceof ToolExecutionResultMessage result) {
                role = "tool";
                content.add(map("type", "toolResult", "id", result.id(), "name", result.toolName(), "result", jsonOrText(result.text())));
            } else {
                role = message.type().name().toLowerCase(Locale.ROOT);
                content.add(map("type", "omitted", "text", "[不支持的消息类型]"));
            }
            return map("role", role, "content", content);
        }).toList();
    }

    static Object jsonOrText(String text) {
        if (text == null) return null;
        try { return JSON.parse(text); } catch (RuntimeException ignored) { return text; }
    }

    /** 只处理结构字段，不猜测、删改自然语言正文；图片不进入此方法。 */
    static Object redact(Object value) {
        if (value instanceof Map<?, ?> source) {
            Map<String, Object> result = new LinkedHashMap<>();
            source.forEach((key, child) -> {
                String name = String.valueOf(key);
                String normalized = name.replaceAll("[^a-zA-Z]", "").toLowerCase(Locale.ROOT);
                result.put(name, SECRET_FIELDS.contains(normalized) ? "[已脱敏]" : "base64data".equals(normalized) ? "[媒体内容已省略]" : redact(child));
            });
            return result;
        }
        if (value instanceof Collection<?> source) return source.stream().map(AiAgentDebugTrace::redact).toList();
        if (value instanceof String text && text.startsWith("data:") && text.contains(";base64,")) return "[媒体内容已省略]";
        return value;
    }

    static Map<String, Object> map(Object... entries) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int index = 0; index < entries.length; index += 2) result.put((String) entries[index], entries[index + 1]);
        return result;
    }
}
