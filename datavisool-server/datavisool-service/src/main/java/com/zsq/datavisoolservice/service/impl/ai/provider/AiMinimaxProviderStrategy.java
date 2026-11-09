/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.request.ChatRequest;
import org.springframework.stereotype.Component;

import java.util.Set;

import static com.zsq.datavisoolservice.service.impl.ai.provider.AiNativeJson.*;

@Component
public final class AiMinimaxProviderStrategy extends AiNativeMessageProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("minimax", Set.of("mini-max"),
            "https://api.minimaxi.com/v1", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) { return model.equals("minimax-m3"); }

    @Override
    protected String compatibleBaseUrl(AiModelConfig config) {
        return AiProviderEndpoints.stripSuffixes(config.baseUrl(), "/text/chatcompletion_v2", "/chat/completions");
    }

    @Override public String url(AiModelConfig config, ChatRequest request) { return compatibleBaseUrl(config) + "/text/chatcompletion_v2"; }

    @Override
    public JSONObject request(AiModelConfig config, ChatRequest request, boolean stream) {
        JSONObject body = object("model", request.modelName() == null ? config.modelName() : request.modelName(),
                "messages", messages(request), "stream", stream,
                "temperature", request.temperature() == null ? config.temperature() : request.temperature(),
                "max_completion_tokens", maxOutputTokens(config, request));
        if (stream) body.put("stream_options", object("include_usage", true));
        JSONArray tools = tools(request, false);
        if (!tools.isEmpty()) body.put("tools", tools);
        return body;
    }
}
