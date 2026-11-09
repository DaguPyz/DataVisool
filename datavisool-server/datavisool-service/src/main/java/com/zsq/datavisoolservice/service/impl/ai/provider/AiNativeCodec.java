/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSONObject;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;

import java.util.Map;

public interface AiNativeCodec {
    String url(AiModelConfig config, ChatRequest request);
    JSONObject request(AiModelConfig config, ChatRequest request, boolean stream);
    ChatResponse response(JSONObject response);
    StreamDecoder stream(StreamingChatResponseHandler handler);
    default Map<String, String> headers(AiModelConfig config, boolean stream) {
        return config.apiKey() == null || config.apiKey().isBlank() ? Map.of()
                : Map.of("Authorization", "Bearer " + config.apiKey());
    }
    default boolean ndjson() { return false; }

    interface StreamDecoder {
        void accept(JSONObject event);
        ChatResponse finish();
    }
}
