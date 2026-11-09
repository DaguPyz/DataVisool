/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.output.TokenUsage;

import java.util.ArrayList;
import java.util.Map;
import java.util.TreeMap;

import static com.zsq.datavisoolservice.service.impl.ai.provider.AiNativeJson.*;

/** 共用 message/tool_calls 响应和增量拼接；响应位置及字段由厂商策略提供。 */
public abstract class AiNativeMessageProviderStrategy extends AiNativeProviderStrategy {
    protected JSONArray choices(JSONObject raw) { return array(raw, "choices"); }

    protected JSONObject message(JSONObject raw) {
        JSONArray choices = choices(raw);
        if (choices.isEmpty()) return object();
        JSONObject choice = choices.getJSONObject(0);
        return choice.containsKey("message") ? obj(choice, "message") : obj(choice, "delta");
    }

    protected String finishReason(JSONObject raw) {
        JSONArray choices = choices(raw);
        return choices.isEmpty() ? "" : text(choices.getJSONObject(0), "finish_reason");
    }

    protected TokenUsage tokenUsage(JSONObject raw) { return usage(obj(raw, "usage"), "prompt_tokens", "completion_tokens"); }
    protected String thinkingField() { return "reasoning_content"; }
    protected boolean completed(JSONObject raw) { return false; }

    protected void check(JSONObject raw) {
        if (raw.get("error") != null || raw.get("code") != null && !text(raw, "code").isBlank()
                || obj(raw, "base_resp").getIntValue("status_code") != 0) throw new IllegalStateException("厂商原生接口返回错误");
    }

    private static String content(JSONObject message) {
        Object value = message.get("content");
        if (value instanceof JSONArray parts) {
            StringBuilder result = new StringBuilder();
            for (Object part : parts) result.append(text((JSONObject) part, "text"));
            return result.toString();
        }
        return value == null ? "" : String.valueOf(value);
    }

    @Override
    public ChatResponse response(JSONObject raw) {
        check(raw);
        JSONObject message = message(raw);
        return AiNativeJson.response(text(raw, "id"), text(raw, "model"), content(message), text(message, thinkingField()),
                calls(array(message, "tool_calls")), tokenUsage(raw), finishReason(raw), Map.of());
    }

    @Override
    public StreamDecoder stream(StreamingChatResponseHandler handler) {
        return new StreamDecoder() {
            private final StringBuilder text = new StringBuilder(), thinking = new StringBuilder();
            private final Map<Integer, JSONObject> calls = new TreeMap<>();
            private JSONObject last = object();
            private TokenUsage usage;
            private boolean finished;
            private String reason = "";

            @Override
            public void accept(JSONObject event) {
                check(event);
                last = event;
                JSONObject message = message(event);
                String delta = content(message);
                text.append(delta);
                if (!delta.isEmpty()) handler.onPartialResponse(delta);
                thinking.append(AiNativeJson.text(message, thinkingField()));
                JSONArray toolCalls = array(message, "tool_calls");
                for (int i = 0; i < toolCalls.size(); i++) {
                    JSONObject value = toolCalls.getJSONObject(i);
                    int index = value.containsKey("index") ? value.getIntValue("index") : i;
                    JSONObject target = calls.computeIfAbsent(index, ignored -> object("function", object("arguments", "")));
                    if (value.get("id") != null) target.put("id", value.get("id"));
                    JSONObject sourceFunction = obj(value, "function"), function = obj(target, "function");
                    if (sourceFunction.get("name") != null) function.put("name", sourceFunction.get("name"));
                    Object arguments = sourceFunction.get("arguments");
                    if (arguments instanceof String fragment) function.put("arguments", AiNativeJson.text(function, "arguments") + fragment);
                    else if (arguments != null) function.put("arguments", JSON.toJSONString(arguments));
                }
                TokenUsage tokens = tokenUsage(event);
                if (tokens != null) usage = tokens;
                String finish = finishReason(event);
                if (!finish.isBlank() && !"null".equals(finish)) { reason = finish; finished = true; }
                if (completed(event)) finished = true;
            }

            @Override
            public ChatResponse finish() {
                if (!finished) throw new IllegalStateException("厂商流在完成事件前中断");
                return AiNativeJson.response(AiNativeJson.text(last, "id"), AiNativeJson.text(last, "model"), text.toString(), thinking.toString(),
                        AiNativeJson.calls(new JSONArray(new ArrayList<>(calls.values()))), usage, reason, Map.of());
            }
        };
    }
}
