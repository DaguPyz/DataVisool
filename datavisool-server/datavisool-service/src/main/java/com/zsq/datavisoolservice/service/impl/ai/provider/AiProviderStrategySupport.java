/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.zsq.datavisoolservice.service.impl.ai.AiModelCapabilities;
import com.zsq.datavisoolservice.service.impl.ai.AiModelCapabilitySupport;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.request.ChatRequest;

import java.util.Locale;

/** 可复用的默认能力和兼容配置；厂商差异由子类方法提供。 */
public abstract class AiProviderStrategySupport implements AiModelProviderStrategy {
    protected boolean supportsVision(String model) { return false; }
    protected boolean supportsReasoning(String model) { return model.contains("reason"); }
    protected long maxContextTokens() { return 128_000L; }

    @Override
    public AiModelCapabilities capabilities(AiModelConfig config) {
        String model = config.modelName().toLowerCase(Locale.ROOT);
        return new AiModelCapabilities(true, true,
                AiModelCapabilitySupport.isKnownVisionModel(model) || supportsVision(model), true,
                supportsReasoning(model), maxContextTokens());
    }

    protected String compatibleBaseUrl(AiModelConfig config) {
        return AiProviderEndpoints.chatCompletionsBase(config.baseUrl());
    }

    protected Long maxOutputTokens(AiModelConfig config, ChatRequest request) {
        if (request.maxOutputTokens() != null) return request.maxOutputTokens().longValue();
        return config.maxTokens();
    }

    @Override
    public AiModelConfig compatibilityConfig(AiModelConfig config) {
        return new AiModelConfig("compatible", compatibleBaseUrl(config), config.apiKey(), config.modelName(),
                config.temperature(), config.maxTokens());
    }
}
