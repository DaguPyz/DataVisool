/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.anthropic.AnthropicChatModel;
import dev.langchain4j.model.anthropic.AnthropicStreamingChatModel;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public final class AiAnthropicProviderStrategy extends AiProviderStrategySupport {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("anthropic", Set.of("claude"),
            "https://api.anthropic.com", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) { return model.startsWith("claude-"); }
    @Override protected boolean supportsReasoning(String model) { return true; }
    @Override protected long maxContextTokens() { return 200_000L; }

    @Override
    protected String compatibleBaseUrl(AiModelConfig config) {
        return AiProviderEndpoints.stripSuffixes(config.baseUrl(), "/messages", "/v1") + "/v1";
    }

    @Override
    public ChatModel createChatModel(AiModelConfig config) {
        var builder = AnthropicChatModel.builder().baseUrl(compatibleBaseUrl(config))
                .apiKey(config.apiKey()).modelName(config.modelName()).temperature(config.temperature())
                .timeout(AiNativeChatModel.REQUEST_TIMEOUT).maxRetries(0).returnThinking(true);
        if (config.maxTokens() != null) builder.maxTokens(AiProviderEndpoints.tokenLimit(config.maxTokens()));
        return builder.build();
    }

    @Override
    public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
        var builder = AnthropicStreamingChatModel.builder().baseUrl(compatibleBaseUrl(config))
                .apiKey(config.apiKey()).modelName(config.modelName()).temperature(config.temperature())
                .timeout(AiNativeChatModel.REQUEST_TIMEOUT).returnThinking(true);
        if (config.maxTokens() != null) builder.maxTokens(AiProviderEndpoints.tokenLimit(config.maxTokens()));
        return builder.build();
    }
}
