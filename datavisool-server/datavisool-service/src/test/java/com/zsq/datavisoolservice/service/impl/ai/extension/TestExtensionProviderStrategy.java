/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.extension;

import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import com.zsq.datavisoolservice.service.impl.ai.provider.AiProviderStrategySupport;
import com.zsq.datavisoolservice.service.impl.ai.provider.ProviderDescriptor;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.springframework.stereotype.Component;

import java.util.Set;

/** 公共厂商清单中不存在的扩展，通过扫描一个新策略 Bean 接入。 */
@Component
public final class TestExtensionProviderStrategy extends AiProviderStrategySupport {
    public AiModelConfig receivedConfig;
    public boolean failNative;

    @Override
    public ProviderDescriptor descriptor() {
        return new ProviderDescriptor("test-extension", Set.of("extra-provider"), "https://extension.invalid/v9", false, true);
    }

    @Override protected boolean supportsVision(String model) { return true; }
    @Override protected long maxContextTokens() { return 64_000L; }
    @Override protected String compatibleBaseUrl(AiModelConfig config) { return config.baseUrl() + "/compat"; }

    @Override
    public ChatModel createChatModel(AiModelConfig config) {
        receivedConfig = config;
        return new ChatModel() {
            @Override
            public ChatResponse doChat(ChatRequest request) {
                if (failNative) throw new IllegalStateException("native unavailable");
                return response();
            }
        };
    }

    @Override
    public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
        receivedConfig = config;
        return new StreamingChatModel() {
            @Override
            public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                if (failNative) handler.onError(new IllegalStateException("native unavailable"));
                else handler.onCompleteResponse(response());
            }
        };
    }

    private static ChatResponse response() { return ChatResponse.builder().aiMessage(AiMessage.from("extension")).build(); }
}
