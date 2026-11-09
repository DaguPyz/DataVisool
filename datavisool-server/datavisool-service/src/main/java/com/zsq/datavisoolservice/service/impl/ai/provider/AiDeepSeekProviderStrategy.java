/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.Set;

/** DeepSeek 官方 Chat Completions 策略。 */
@Component
public final class AiDeepSeekProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("deepseek",
            Set.of(), "https://api.deepseek.com", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsReasoning(String model) { return true; }
    @Override protected boolean supportsVision(String model) { return model.contains("vl") || model.contains("vision"); }
    @Override public boolean requiresAssistantReasoning() { return true; }
}

