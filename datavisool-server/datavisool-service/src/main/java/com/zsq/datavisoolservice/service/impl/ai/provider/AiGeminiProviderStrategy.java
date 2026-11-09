/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.*;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.Set;

import static com.zsq.datavisoolservice.service.impl.ai.provider.AiNativeJson.*;

/** 与桌面 Rig 一致的 Gemini Interactions 协议；保留 thought 签名并使用当前工具调用身份。 */
@Component
public final class AiGeminiProviderStrategy extends AiNativeProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("gemini", Set.of("google", "google-gemini"),
            "https://generativelanguage.googleapis.com", true, true);
    static final String STEPS = "gemini.interaction.steps";

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) { return true; }
    @Override protected boolean supportsReasoning(String model) { return true; }

    private String nativeBase(AiModelConfig config) {
        return AiProviderEndpoints.stripSuffixes(config.baseUrl(), "/interactions", "/openai", "/v1beta", "/v1");
    }

    @Override
    protected String compatibleBaseUrl(AiModelConfig config) { return nativeBase(config) + "/v1beta/openai"; }

    @Override
    public Map<String, String> headers(AiModelConfig config, boolean stream) { return Map.of("x-goog-api-key", config.apiKey()); }

    @Override
    public String url(AiModelConfig config, ChatRequest request) {
        return nativeBase(config) + "/v1beta/interactions";
    }

    @Override
    public JSONObject request(AiModelConfig config, ChatRequest request, boolean stream) {
        JSONArray input = new JSONArray();
        List<String> system = new ArrayList<>();
        for (ChatMessage message : request.messages()) {
            if (message instanceof SystemMessage value) system.add(value.text());
            else if (message instanceof UserMessage user) {
                JSONArray contents = new JSONArray();
                for (Content content : user.contents()) {
                    if (content instanceof TextContent value) contents.add(object("type", "text", "text", value.text()));
                    else if (content instanceof ImageContent image) {
                        String url = imageUrl(image);
                        if (url.startsWith("data:")) {
                            int comma = url.indexOf(',');
                            int semicolon = url.indexOf(';');
                            contents.add(object("type", "image", "data", url.substring(comma + 1),
                                    "mime_type", url.substring(5, semicolon)));
                        } else contents.add(object("type", "image", "uri", url,
                                "mime_type", image.image().mimeType() == null ? "image/jpeg" : image.image().mimeType()));
                    } else throw new IllegalArgumentException("Gemini 当前不支持此输入类型");
                }
                input.add(object("type", "user_input", "content", contents));
            } else if (message instanceof AiMessage ai) {
                Object raw = ai.attributes().get(STEPS);
                if (raw != null) {
                    JSONArray steps = JSON.parseArray(JSON.toJSONString(raw));
                    int callIndex = 0;
                    for (int i = 0; i < steps.size(); i++) {
                        JSONObject step = steps.getJSONObject(i);
                        if ("function_call".equals(step.getString("type")))
                            step.put("id", ai.toolExecutionRequests().get(callIndex++).id());
                    }
                    input.addAll(steps);
                }
                else {
                    if (ai.text() != null && !ai.text().isBlank()) input.add(object("type", "model_output", "content",
                            List.of(object("type", "text", "text", ai.text()))));
                    if (ai.hasToolExecutionRequests()) for (ToolExecutionRequest call : ai.toolExecutionRequests()) input.add(object("type", "function_call",
                            "id", call.id(), "name", call.name(), "arguments", JSON.parse(call.arguments())));
                }
            } else if (message instanceof ToolExecutionResultMessage tool) {
                input.add(object("type", "function_result", "call_id", tool.id(), "name", tool.toolName(),
                        "result", tool.text(), "is_error", tool.isError()));
            }
        }
        JSONObject generation = object("temperature", request.temperature() == null ? config.temperature() : request.temperature(),
                "max_output_tokens", maxOutputTokens(config, request));
        JSONObject body = object("model", request.modelName() == null ? config.modelName() : request.modelName(), "input", input,
                "stream", stream, "store", false, "generation_config", generation);
        if (!system.isEmpty()) body.put("system_instruction", String.join("\n\n", system));
        JSONArray tools = tools(request, true);
        if (!tools.isEmpty()) body.put("tools", tools);
        return body;
    }

    @Override
    public ChatResponse response(JSONObject raw) {
        if (raw.get("error") != null || "failed".equals(raw.getString("status")) || "cancelled".equals(raw.getString("status"))) {
            throw new IllegalStateException("Gemini Interactions 请求失败");
        }
        JSONArray steps = array(raw, "steps");
        // 兼容早期 Interactions 输出形状；当前桌面协议以 steps 为准。
        if (steps.isEmpty() && raw.getJSONArray("outputs") != null) steps = raw.getJSONArray("outputs");
        List<ToolExecutionRequest> calls = new ArrayList<>();
        StringBuilder text = new StringBuilder(), thinking = new StringBuilder();
        for (int i = 0; i < steps.size(); i++) {
            JSONObject step = steps.getJSONObject(i);
            switch (AiNativeJson.text(step, "type")) {
                case "text" -> text.append(AiNativeJson.text(step, "text"));
                case "model_output" -> {
                    for (Object content : array(step, "content")) {
                        JSONObject value = (JSONObject) content;
                        if ("text".equals(value.getString("type"))) text.append(AiNativeJson.text(value, "text"));
                    }
                }
                case "function_call" -> {
                    Object arguments = step.get("arguments");
                    if (arguments instanceof String value) arguments = JSON.parse(value);
                    if (arguments == null) arguments = object();
                    step.put("arguments", arguments);
                    calls.add(ToolExecutionRequest.builder().id(step.getString("id"))
                            .name(step.getString("name")).arguments(JSON.toJSONString(arguments)).build());
                }
                case "thought" -> {
                    for (Object summary : array(step, "summary")) thinking.append(AiNativeJson.text((JSONObject) summary, "text"));
                }
                default -> { }
            }
        }
        return AiNativeJson.response(AiNativeJson.text(raw, "id"), AiNativeJson.text(raw, "model"), text.toString(), thinking.toString(),
                calls, usage(obj(raw, "usage"), "total_input_tokens", "total_output_tokens"),
                AiNativeJson.text(raw, "status"), Map.of(STEPS, steps));
    }

    @Override
    public StreamDecoder stream(StreamingChatResponseHandler handler) {
        return new StreamDecoder() {
            private final Map<Integer, JSONObject> steps = new TreeMap<>();
            private JSONObject completed;

            @Override
            public void accept(JSONObject event) {
                String kind = event.getString("event_type");
                if (kind == null) kind = event.getString("type");
                if (kind == null) throw new IllegalStateException("Gemini 流式响应缺少事件类型");
                switch (kind) {
                    case "step.start" -> {
                        JSONObject step = obj(event, "step");
                        steps.put(event.getIntValue("index"), step);
                        if ("model_output".equals(step.getString("type"))) for (Object raw : array(step, "content")) {
                            JSONObject content = (JSONObject) raw;
                            if ("text".equals(content.getString("type")) && !AiNativeJson.text(content, "text").isEmpty()) {
                                handler.onPartialResponse(content.getString("text"));
                            }
                        }
                    }
                    case "step.delta" -> delta(event.getIntValue("index"), obj(event, "delta"));
                    case "interaction.completed" -> completed = obj(event, "interaction");
                    case "error" -> throw new IllegalStateException("Gemini 流式接口返回错误");
                    case "interaction.status_update" -> {
                        if ("failed".equals(event.getString("status"))) throw new IllegalStateException("Gemini 流式任务失败");
                    }
                    default -> { }
                }
            }

            private void delta(int index, JSONObject delta) {
                JSONObject step = steps.computeIfAbsent(index, ignored -> object("type", "model_output", "content", new JSONArray()));
                String type = delta.getString("type");
                if ("text".equals(type)) {
                    String value = AiNativeJson.text(delta, "text");
                    JSONArray contents = array(step, "content");
                    if (contents.isEmpty()) contents.add(object("type", "text", "text", ""));
                    JSONObject content = contents.getJSONObject(contents.size() - 1);
                    content.put("text", AiNativeJson.text(content, "text") + value);
                    step.put("content", contents);
                    if (!value.isEmpty()) handler.onPartialResponse(value);
                } else if ("function_call".equals(type)) {
                    step.put("type", "function_call");
                    delta.forEach((key, value) -> {
                        if ("arguments".equals(key) && value instanceof String fragment) {
                            step.put(key, (step.get(key) instanceof String previous ? previous : "") + fragment);
                        } else if ("arguments".equals(key) && value instanceof JSONObject arguments) {
                            JSONObject combined = obj(step, key);
                            combined.putAll(arguments);
                            step.put(key, combined);
                        } else if (!"type".equals(key)) step.put(key, value);
                    });
                } else if ("thought_signature".equals(type)) {
                    step.put("type", "thought");
                    step.put("signature", delta.get("signature"));
                } else if ("thought_summary".equals(type)) {
                    step.put("type", "thought");
                    JSONArray summaries = array(step, "summary");
                    JSONObject content = obj(delta, "content");
                    if (content.isEmpty()) content = object("type", "text", "text", AiNativeJson.text(delta, "text"));
                    summaries.add(content);
                    step.put("summary", summaries);
                }
            }

            @Override
            public ChatResponse finish() {
                if (completed == null) throw new IllegalStateException("Gemini 流在完成事件前中断");
                if (array(completed, "steps").isEmpty()) completed.put("steps", new ArrayList<>(steps.values()));
                return response(completed);
            }
        };
    }
}
