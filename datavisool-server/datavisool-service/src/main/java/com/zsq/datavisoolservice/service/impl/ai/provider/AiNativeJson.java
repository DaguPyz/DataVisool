/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import dev.langchain4j.data.message.*;
import dev.langchain4j.internal.JsonSchemaElementJsonUtils;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.output.FinishReason;
import dev.langchain4j.model.output.TokenUsage;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

final class AiNativeJson {
    private AiNativeJson() { }

    static JSONObject object(Object... pairs) {
        JSONObject result = new JSONObject();
        for (int i = 0; i < pairs.length; i += 2) if (pairs[i + 1] != null) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }

    static JSONArray array(JSONObject object, String key) {
        JSONArray value = object == null ? null : object.getJSONArray(key);
        return value == null ? new JSONArray() : value;
    }

    static JSONObject obj(JSONObject object, String key) {
        JSONObject value = object == null ? null : object.getJSONObject(key);
        return value == null ? new JSONObject() : value;
    }

    static String text(JSONObject object, String key) {
        String value = object == null ? null : object.getString(key);
        return value == null ? "" : value;
    }

    static JSONArray tools(ChatRequest request, boolean flat) {
        JSONArray result = new JSONArray();
        if (request.toolSpecifications() == null) return result;
        for (ToolSpecification tool : request.toolSpecifications()) {
            JSONObject function = object("name", tool.name(), "description", tool.description(), "parameters",
                    tool.parameters() == null ? object("type", "object", "properties", new JSONObject())
                            : JsonSchemaElementJsonUtils.toMap(tool.parameters()));
            if (flat) { function.put("type", "function"); result.add(function); }
            else result.add(object("type", "function", "function", function));
        }
        return result;
    }

    static String imageUrl(ImageContent content) {
        return content.image().url() != null ? content.image().url().toString()
                : "data:" + content.image().mimeType() + ";base64," + content.image().base64Data();
    }

    static JSONArray messages(ChatRequest request) {
        JSONArray result = new JSONArray();
        for (ChatMessage message : request.messages()) {
            if (message instanceof SystemMessage system) result.add(object("role", "system", "content", system.text()));
            else if (message instanceof UserMessage user) {
                JSONArray contents = new JSONArray();
                for (Content content : user.contents()) {
                    if (content instanceof TextContent text) contents.add(object("type", "text", "text", text.text()));
                    else if (content instanceof ImageContent image) contents.add(object("type", "image_url", "image_url", object("url", imageUrl(image))));
                    else throw new IllegalArgumentException("当前原生协议不支持此输入类型");
                }
                Object content = contents.size() == 1 && "text".equals(contents.getJSONObject(0).getString("type"))
                        ? contents.getJSONObject(0).getString("text") : contents;
                result.add(object("role", "user", "content", content));
            } else if (message instanceof AiMessage ai) {
                JSONObject item = object("role", "assistant", "content", ai.text(), "reasoning_content", ai.thinking());
                JSONArray calls = new JSONArray();
                if (ai.hasToolExecutionRequests()) for (ToolExecutionRequest call : ai.toolExecutionRequests()) calls.add(object("id", call.id(), "type", "function",
                        "function", object("name", call.name(), "arguments", call.arguments())));
                if (!calls.isEmpty()) item.put("tool_calls", calls);
                result.add(item);
            } else if (message instanceof ToolExecutionResultMessage tool) result.add(object("role", "tool", "content", tool.text(),
                    "tool_call_id", tool.id(), "name", tool.toolName()));
            else throw new IllegalArgumentException("当前原生协议不支持此消息类型");
        }
        return result;
    }

    static List<ToolExecutionRequest> calls(JSONArray values) {
        List<ToolExecutionRequest> calls = new ArrayList<>();
        for (int i = 0; i < values.size(); i++) {
            JSONObject value = values.getJSONObject(i);
            JSONObject function = obj(value, "function");
            String id = text(value, "id");
            Object args = function.get("arguments");
            calls.add(ToolExecutionRequest.builder().id(id.isBlank() ? "call-" + UUID.randomUUID() : id)
                    .name(text(function, "name")).arguments(args instanceof String s ? s : JSON.toJSONString(args == null ? object() : args)).build());
        }
        return calls;
    }

    static ChatResponse response(String id, String model, String text, String thinking,
                                 List<ToolExecutionRequest> calls, TokenUsage usage, String finish, Map<String, Object> attributes) {
        if (text.isBlank() && thinking.isBlank() && calls.isEmpty()) throw new IllegalStateException("模型未返回有效消息");
        AiMessage ai = AiMessage.builder().text(text.isBlank() ? null : text).thinking(thinking.isBlank() ? null : thinking)
                .toolExecutionRequests(calls).attributes(attributes).build();
        FinishReason reason = "length".equals(finish) || "incomplete".equals(finish) ? FinishReason.LENGTH
                : "content_filter".equals(finish) ? FinishReason.CONTENT_FILTER
                : calls.isEmpty() ? FinishReason.STOP : FinishReason.TOOL_EXECUTION;
        return ChatResponse.builder().id(id.isBlank() ? null : id).modelName(model.isBlank() ? null : model)
                .aiMessage(ai).tokenUsage(usage).finishReason(reason).build();
    }

    static TokenUsage usage(JSONObject usage, String input, String output) {
        Integer in = usage.getInteger(input), out = usage.getInteger(output);
        Integer cached = obj(usage, "prompt_tokens_details").getInteger("cached_tokens");
        if (cached == null) cached = obj(usage, "input_tokens_details").getInteger("cached_tokens");
        if (cached == null) cached = usage.getInteger("cached_tokens");
        if (cached == null) cached = usage.getInteger("total_cached_tokens");
        if (cached == null) cached = usage.getInteger("prompt_cache_hit_tokens");
        return in == null && out == null ? null : new AiProviderTokenUsage(in, out,
                usage.getInteger("total_tokens"), cached, usage.getInteger("cache_creation_input_tokens"));
    }
}
