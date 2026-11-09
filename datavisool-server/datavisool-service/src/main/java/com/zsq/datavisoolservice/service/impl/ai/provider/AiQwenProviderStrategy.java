/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.output.TokenUsage;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.zsq.datavisoolservice.service.impl.ai.provider.AiNativeJson.*;

@Component
public final class AiQwenProviderStrategy extends AiNativeMessageProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("qwen", Set.of("dashscope"),
            "https://dashscope.aliyuncs.com/compatible-mode/v1", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) {
        return model.contains("vl") || model.contains("vision") || model.contains("omni")
                || Set.of("qwen3.8-max", "qwen3.7-plus", "qwen3.7-flash").contains(model);
    }

    private String nativeBase(AiModelConfig config) {
        return AiProviderEndpoints.stripSuffixes(config.baseUrl(), "/services/aigc/text-generation/generation",
                "/services/aigc/multimodal-generation/generation", "/api/v1", "/compatible-mode/v1", "/v1");
    }

    @Override protected String compatibleBaseUrl(AiModelConfig config) { return nativeBase(config) + "/compatible-mode/v1"; }

    @Override
    public String url(AiModelConfig config, ChatRequest request) {
        return nativeBase(config) + "/api/v1/services/aigc/" + (multimodal(config, request) ? "multimodal" : "text") + "-generation/generation";
    }

    @Override
    public JSONObject request(AiModelConfig config, ChatRequest request, boolean stream) {
        JSONArray messages = messages(request), tools = tools(request, false);
        if (multimodal(config, request)) convertContents(messages);
        JSONObject parameters = object("temperature", request.temperature() == null ? config.temperature() : request.temperature(),
                "max_tokens", maxOutputTokens(config, request),
                "result_format", "message", "incremental_output", stream);
        if (!tools.isEmpty()) parameters.put("tools", tools);
        return object("model", request.modelName() == null ? config.modelName() : request.modelName(),
                "input", object("messages", messages), "parameters", parameters);
    }

    @Override
    public Map<String, String> headers(AiModelConfig config, boolean stream) {
        Map<String, String> headers = new HashMap<>(super.headers(config, stream));
        if (stream) headers.put("X-DashScope-SSE", "enable");
        return headers;
    }

    @Override protected JSONArray choices(JSONObject raw) { return array(obj(raw, "output"), "choices"); }
    @Override protected TokenUsage tokenUsage(JSONObject raw) { return usage(obj(raw, "usage"), "input_tokens", "output_tokens"); }

    private static boolean multimodal(AiModelConfig config, ChatRequest request) {
        String model = (request.modelName() == null ? config.modelName() : request.modelName()).toLowerCase(Locale.ROOT);
        return model.contains("-vl") || model.startsWith("qvq") || model.startsWith("qwen3.5")
                || model.startsWith("qwen3.6") || model.startsWith("qwen3.7")
                || request.messages().stream().filter(UserMessage.class::isInstance).map(UserMessage.class::cast)
                .anyMatch(message -> message.contents().stream().anyMatch(ImageContent.class::isInstance));
    }

    private static void convertContents(JSONArray messages) {
        for (Object raw : messages) {
            JSONObject message = (JSONObject) raw;
            Object content = message.get("content");
            if (content instanceof String value) message.put("content", List.of(object("text", value)));
            else if (content instanceof JSONArray parts) {
                JSONArray converted = new JSONArray();
                for (Object part : parts) {
                    JSONObject value = (JSONObject) part;
                    converted.add("image_url".equals(value.getString("type"))
                            ? object("image", obj(value, "image_url").getString("url")) : object("text", value.getString("text")));
                }
                message.put("content", converted);
            }
        }
    }
}
