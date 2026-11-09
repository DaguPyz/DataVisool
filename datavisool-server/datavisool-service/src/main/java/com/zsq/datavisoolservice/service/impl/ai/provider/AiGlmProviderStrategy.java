/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.Set;

/** Glm 官方 Chat Completions 策略。 */
@Component
public final class AiGlmProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("glm",
            Set.of("zhipu", "bigmodel"), "https://open.bigmodel.cn/api/paas/v4", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) { return model.equals("glm-5v-turbo"); }
}

