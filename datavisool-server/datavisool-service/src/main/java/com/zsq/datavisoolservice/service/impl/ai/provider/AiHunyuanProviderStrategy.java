/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import org.springframework.stereotype.Component;

import java.util.Set;

/** Hunyuan 官方 Chat Completions 策略。 */
@Component
public final class AiHunyuanProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("hunyuan",
            Set.of("tencent", "tencent-hunyuan"), "https://api.hunyuan.cloud.tencent.com/v1", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean supportsVision(String model) { return model.contains("vision"); }
}

