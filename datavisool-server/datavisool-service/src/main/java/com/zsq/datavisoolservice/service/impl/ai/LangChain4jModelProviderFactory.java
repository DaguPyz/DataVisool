/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.service.impl.ai.provider.AiModelProviderRegistry;
import com.zsq.datavisoolservice.service.impl.ai.provider.AiModelProviderStrategy;
import com.zsq.datavisoolservice.service.impl.ai.provider.AiOpenAiCompatibleProviderStrategy;
import com.zsq.datavisoolservice.service.impl.ai.provider.ProviderDescriptor;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import org.springframework.stereotype.Service;

/** 只负责公共配置校验、策略查找和兜底装配，不包含厂商分支。 */
@Service
public class LangChain4jModelProviderFactory implements AiModelProviderFactory {
    private final AiModelProviderRegistry registry;
    private final AiOpenAiCompatibleProviderStrategy compatible;

    public LangChain4jModelProviderFactory(AiModelProviderRegistry registry, AiOpenAiCompatibleProviderStrategy compatible) {
        this.registry = registry;
        this.compatible = compatible;
    }

    @Override
    public ChatModel createChatModel(AiModelConfig config) {
        Resolved resolved = resolve(config);
        ChatModel nativeModel = resolved.strategy().createChatModel(resolved.config());
        if (!resolved.strategy().descriptor().fallbackToCompatibility()) return nativeModel;
        AiModelConfig compatibleConfig = resolved.strategy().compatibilityConfig(resolved.config());
        return AiProviderFallback.chat(resolved.config().provider(), nativeModel,
                compatible.createFallbackChatModel(compatibleConfig, resolved.strategy().requiresAssistantReasoning()));
    }

    @Override
    public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
        Resolved resolved = resolve(config);
        StreamingChatModel nativeModel = resolved.strategy().createStreamingChatModel(resolved.config());
        if (!resolved.strategy().descriptor().fallbackToCompatibility()) return nativeModel;
        AiModelConfig compatibleConfig = resolved.strategy().compatibilityConfig(resolved.config());
        return AiProviderFallback.streaming(resolved.config().provider(), nativeModel,
                compatible.createFallbackStreamingChatModel(compatibleConfig, resolved.strategy().requiresAssistantReasoning()));
    }

    @Override
    public AiModelCapabilities capabilities(AiModelConfig config) {
        Resolved resolved = resolve(config);
        return resolved.strategy().capabilities(resolved.config());
    }

    @Override
    public Long contextWindowTokens(AiModelConfig config) {
        AiModelConfig normalized = resolve(config).config();
        return AiModelProviderFactory.super.contextWindowTokens(normalized);
    }

    private Resolved resolve(AiModelConfig config) {
        if (config == null || trimToNull(config.modelName()) == null) throw new IllegalArgumentException("AI 模型配置不完整");
        AiModelProviderStrategy strategy = registry.find(config.provider()).orElse(compatible);
        ProviderDescriptor descriptor = strategy.descriptor();
        String baseUrl = trimToNull(config.baseUrl());
        if (baseUrl == null) baseUrl = descriptor.defaultBaseUrl();
        if (trimToNull(baseUrl) == null) throw new IllegalArgumentException("AI 模型未配置接入地址");
        String apiKey = trimToNull(config.apiKey());
        if (apiKey == null && descriptor.requiresApiKey()) throw new IllegalArgumentException("AI 模型未配置 API Key");
        Double temperature = config.temperature() == null ? 0.7D : config.temperature();
        Long maxTokens = AiDrivenModelCatalog.resolveMaxOutputTokens(descriptor.key(), config.modelName(), config.maxTokens());
        if ("anthropic".equals(descriptor.key()) && maxTokens == null)
            throw new IllegalArgumentException("该 Anthropic 型号未收录官方输出上限，请填写最大 Token");
        AiModelConfig normalized = new AiModelConfig(descriptor.key(), baseUrl.trim(), apiKey, config.modelName().trim(),
                Math.max(0D, Math.min(2D, temperature)), maxTokens);
        return new Resolved(strategy, normalized);
    }

    private static String trimToNull(String value) { return value == null || value.trim().isEmpty() ? null : value.trim(); }
    private record Resolved(AiModelProviderStrategy strategy, AiModelConfig config) { }
}
