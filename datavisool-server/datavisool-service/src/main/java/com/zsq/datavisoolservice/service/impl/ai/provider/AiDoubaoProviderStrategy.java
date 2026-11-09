/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.Set;

/** Doubao 官方 Chat Completions 策略。 */
@Component
public final class AiDoubaoProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("doubao",
            Set.of("volcengine", "ark"), "https://ark.cn-beijing.volces.com/api/v3", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) {
        return model.startsWith("doubao-seed-2-0-lite-") || model.startsWith("doubao-seed-2-0-pro-");
    }
}

