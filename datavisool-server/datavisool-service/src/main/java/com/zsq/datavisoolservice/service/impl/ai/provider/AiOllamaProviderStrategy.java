/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.output.TokenUsage;
import org.springframework.stereotype.Component;

import java.util.Set;

import static com.zsq.datavisoolservice.service.impl.ai.provider.AiNativeJson.*;

@Component
public final class AiOllamaProviderStrategy extends AiNativeMessageProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("ollama", Set.of(),
            "http://localhost:11434/v1", false, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override public boolean ndjson() { return true; }
    @Override protected String thinkingField() { return "thinking"; }
    @Override protected boolean supportsVision(String model) {
        return model.contains("llava") || model.contains("qwen-vl") || model.contains("minicpm-v") || model.contains("gemma3");
    }

    private String nativeBase(AiModelConfig config) { return AiProviderEndpoints.stripSuffixes(config.baseUrl(), "/api/chat", "/api", "/v1"); }
    @Override protected String compatibleBaseUrl(AiModelConfig config) { return nativeBase(config) + "/v1"; }
    @Override public String url(AiModelConfig config, ChatRequest request) { return nativeBase(config) + "/api/chat"; }
    @Override protected JSONObject message(JSONObject raw) { return obj(raw, "message"); }
    @Override protected String finishReason(JSONObject raw) { return text(raw, "done_reason"); }
    @Override protected TokenUsage tokenUsage(JSONObject raw) { return usage(raw, "prompt_eval_count", "eval_count"); }
    @Override protected boolean completed(JSONObject raw) { return raw.getBooleanValue("done"); }

    @Override
    public JSONObject request(AiModelConfig config, ChatRequest request, boolean stream) {
        JSONArray messages = messages(request), tools = tools(request, false);
        convertMessages(messages);
        JSONObject body = object("model", request.modelName() == null ? config.modelName() : request.modelName(),
                "messages", messages, "stream", stream, "options", object(
                        "temperature", request.temperature() == null ? config.temperature() : request.temperature(),
                        "num_predict", maxOutputTokens(config, request)));
        if (!tools.isEmpty()) body.put("tools", tools);
        return body;
    }

    private static void convertMessages(JSONArray messages) {
        for (Object raw : messages) {
            JSONObject message = (JSONObject) raw;
            if (message.get("content") instanceof JSONArray parts) {
                StringBuilder content = new StringBuilder();
                JSONArray images = new JSONArray();
                for (Object rawPart : parts) {
                    JSONObject part = (JSONObject) rawPart;
                    if ("text".equals(part.getString("type"))) content.append(text(part, "text"));
                    else {
                        String url = text(obj(part, "image_url"), "url");
                        if (!url.startsWith("data:") || !url.contains(";base64,")) {
                            throw new IllegalArgumentException("Ollama 原生接口需要 Base64 图片");
                        }
                        images.add(url.substring(url.indexOf(',') + 1));
                    }
                }
                message.put("content", content.toString());
                if (!images.isEmpty()) message.put("images", images);
            }
            Object reasoning = message.remove("reasoning_content");
            if (reasoning != null) message.put("thinking", reasoning);
            for (Object rawCall : array(message, "tool_calls")) {
                JSONObject call = (JSONObject) rawCall;
                call.remove("id");
                call.remove("type");
                JSONObject function = obj(call, "function");
                if (function.get("arguments") instanceof String arguments) function.put("arguments", JSON.parseObject(arguments));
            }
            if ("tool".equals(message.getString("role"))) {
                message.put("tool_name", message.remove("name"));
                message.remove("tool_call_id");
            }
            message.putIfAbsent("content", "");
        }
    }
}
