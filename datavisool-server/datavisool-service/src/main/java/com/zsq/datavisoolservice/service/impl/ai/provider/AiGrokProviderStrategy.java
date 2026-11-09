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

/** 与桌面 xAI 适配一致，优先使用 Responses，保留原始输出项用于下一次工具循环。 */
@Component
public final class AiGrokProviderStrategy extends AiNativeProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("grok", Set.of("xai", "x-ai"),
            "https://api.x.ai/v1", true, true);
    static final String OUTPUT = "grok.response.output";

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) { return true; }
    @Override protected boolean supportsReasoning(String model) { return true; }

    @Override
    public String url(AiModelConfig config, ChatRequest request) {
        return AiProviderEndpoints.chatCompletionsBase(config.baseUrl()) + "/responses";
    }

    @Override
    public JSONObject request(AiModelConfig config, ChatRequest request, boolean stream) {
        JSONArray input = new JSONArray();
        for (ChatMessage message : request.messages()) {
            if (message instanceof AiMessage ai && ai.attributes().get(OUTPUT) != null) {
                JSONArray output = JSON.parseArray(JSON.toJSONString(ai.attributes().get(OUTPUT)));
                int callIndex = 0;
                for (int i = 0; i < output.size(); i++) {
                    JSONObject item = output.getJSONObject(i);
                    if ("function_call".equals(item.getString("type")))
                        item.put("call_id", ai.toolExecutionRequests().get(callIndex++).id());
                }
                input.addAll(output);
                continue;
            }
            if (message instanceof ToolExecutionResultMessage tool) {
                input.add(object("type", "function_call_output", "call_id", tool.id(), "output", tool.text()));
                continue;
            }
            if (message instanceof AiMessage ai) {
                if (ai.text() != null) input.add(object("role", "assistant", "content", ai.text()));
                if (ai.hasToolExecutionRequests()) for (ToolExecutionRequest call : ai.toolExecutionRequests()) input.add(object("type", "function_call",
                        "call_id", call.id(), "name", call.name(), "arguments", call.arguments()));
                continue;
            }
            JSONArray single = messages(ChatRequest.builder().messages(message).build());
            JSONObject item = single.getJSONObject(0);
            if (item.get("content") instanceof JSONArray contents) {
                for (Object value : contents) {
                    JSONObject part = (JSONObject) value;
                    if ("text".equals(part.getString("type"))) part.put("type", "input_text");
                    else if ("image_url".equals(part.getString("type"))) {
                        part.put("type", "input_image");
                        part.put("image_url", obj(part, "image_url").getString("url"));
                    }
                }
            }
            input.add(item);
        }
        JSONObject body = object("model", request.modelName() == null ? config.modelName() : request.modelName(), "input", input,
                "temperature", request.temperature() == null ? config.temperature() : request.temperature(),
                "max_output_tokens", maxOutputTokens(config, request),
                "stream", stream, "store", false);
        JSONArray tools = tools(request, true);
        if (!tools.isEmpty()) body.put("tools", tools);
        return body;
    }

    @Override
    public ChatResponse response(JSONObject raw) {
        if (raw.containsKey("error") && raw.get("error") != null || "failed".equals(raw.getString("status"))) {
            throw new IllegalStateException("Grok Responses 请求失败");
        }
        JSONArray output = array(raw, "output");
        List<ToolExecutionRequest> calls = new ArrayList<>();
        StringBuilder text = new StringBuilder(), thinking = new StringBuilder();
        for (int i = 0; i < output.size(); i++) {
            JSONObject item = output.getJSONObject(i);
            switch (AiNativeJson.text(item, "type")) {
                case "message" -> {
                    for (Object part : array(item, "content")) {
                        JSONObject content = (JSONObject) part;
                        if ("output_text".equals(content.getString("type"))) text.append(AiNativeJson.text(content, "text"));
                    }
                }
                case "function_call" -> calls.add(ToolExecutionRequest.builder().id(item.getString("call_id"))
                        .name(item.getString("name")).arguments(item.getString("arguments")).build());
                case "reasoning" -> {
                    for (Object part : array(item, "summary")) thinking.append(AiNativeJson.text((JSONObject) part, "text"));
                }
                default -> { }
            }
        }
        return AiNativeJson.response(AiNativeJson.text(raw, "id"), AiNativeJson.text(raw, "model"), text.toString(), thinking.toString(),
                calls, usage(obj(raw, "usage"), "input_tokens", "output_tokens"), AiNativeJson.text(raw, "status"), Map.of(OUTPUT, output));
    }

    @Override
    public StreamDecoder stream(StreamingChatResponseHandler handler) {
        return new StreamDecoder() {
            private JSONObject completed;
            private final Map<Integer, JSONObject> items = new TreeMap<>();

            @Override
            public void accept(JSONObject event) {
                switch (AiNativeJson.text(event, "type")) {
                    case "response.output_text.delta" -> handler.onPartialResponse(AiNativeJson.text(event, "delta"));
                    case "response.output_item.done" -> items.put(event.getIntValue("output_index"), obj(event, "item"));
                    case "response.completed", "response.incomplete" -> completed = obj(event, "response");
                    case "response.failed", "error" -> throw new IllegalStateException("Grok 流式接口返回错误");
                    default -> { }
                }
            }

            @Override
            public ChatResponse finish() {
                if (completed == null) throw new IllegalStateException("Grok 流在完成事件前中断");
                if (array(completed, "output").isEmpty()) completed.put("output", new ArrayList<>(items.values()));
                return response(completed);
            }
        };
    }
}
