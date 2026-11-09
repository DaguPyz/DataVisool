/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.Set;

/** Kimi 官方 Chat Completions 策略。 */
@Component
public final class AiKimiProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("kimi",
            Set.of("moonshot"), "https://api.moonshot.cn/v1", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean completionTokenLimit() { return true; }
    @Override protected boolean supportsVision(String model) {
        return Set.of("kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6").contains(model);
    }
}

