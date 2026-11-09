/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public final class AiOpenAiCompatibleProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("compatible",
            Set.of("openai-compatible", "custom"), null, true, false);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean sendThinking() { return false; }
    @Override protected boolean accumulateToolCallId() { return true; }
    @Override protected int maxRetries() { return 2; }

    /** 降级请求不隐式重试，失败后由兜底装饰器直接结束调用。 */
    public ChatModel createFallbackChatModel(AiModelConfig config) { return buildChatModel(config, 0); }

    public ChatModel createFallbackChatModel(AiModelConfig config, boolean requireReasoningField) {
        return buildChatModel(config, 0, requireReasoningField, requireReasoningField);
    }

    public StreamingChatModel createFallbackStreamingChatModel(AiModelConfig config, boolean requireReasoningField) {
        return buildStreamingChatModel(config, requireReasoningField, requireReasoningField);
    }
}
