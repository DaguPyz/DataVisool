/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.Set;

/** OpenAi 官方 Chat Completions 策略。 */
@Component
public final class AiOpenAiProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("openai",
            Set.of(), "https://api.openai.com/v1", true, false);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean completionTokenLimit() { return true; }
    @Override protected boolean sendThinking() { return false; }
    @Override protected boolean strictTools() { return true; }
    @Override protected boolean accumulateToolCallId() { return true; }
    @Override protected int maxRetries() { return 2; }
    @Override protected boolean supportsVision(String model) {
        return model.startsWith("gpt-4o") || model.startsWith("gpt-4.1") || model.startsWith("gpt-5");
    }
}
