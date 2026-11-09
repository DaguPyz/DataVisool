/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.List;
import java.util.Objects;

/** AI 驱动控制台可选的厂商与具体模型型号目录。 */
public final class AiDrivenModelCatalog {
    private static final String RESOURCE_NAME = "ai-driven-provider-models.json";
    private static final Catalog CATALOG = loadCatalog();

    private AiDrivenModelCatalog() {
    }

    public static List<ProviderModels> listProviders() {
        return CATALOG.providers();
    }

    public static Long contextWindowTokens(String provider, String modelName) {
        RuntimeModel model = findModel(provider, modelName);
        return model == null ? null : model.contextWindowTokens();
    }

    /** 用户设置优先；目录未收录默认预算时不发送上限，让厂商使用自己的默认值。 */
    public static Long resolveMaxOutputTokens(String provider, String modelName, Long configuredTokens) {
        if (configuredTokens != null && configuredTokens > 0) return configuredTokens;
        RuntimeModel model = findModel(provider, modelName);
        return model == null ? null : model.defaultMaxOutputTokens();
    }

    private static RuntimeModel findModel(String provider, String modelName) {
        if (modelName == null) return null;
        String normalizedProvider = AiModelProviderSupport.normalizeProviderKeyForStorage(provider);
        return listProviders().stream()
                .filter(entry -> entry.provider().equalsIgnoreCase(normalizedProvider))
                .flatMap(entry -> entry.models().stream())
                .filter(Objects::nonNull)
                .filter(model -> model.modelName().equalsIgnoreCase(modelName.trim()))
                .findFirst().orElse(null);
    }

    private static Catalog loadCatalog() {
        try (InputStream input = AiDrivenModelCatalog.class.getClassLoader().getResourceAsStream(RESOURCE_NAME)) {
            if (input == null) {
                throw new IllegalStateException("未找到 AI 驱动模型目录：" + RESOURCE_NAME);
            }
            Catalog catalog = new ObjectMapper().readValue(input, Catalog.class);
            if (catalog.providers() == null || catalog.providers().isEmpty()) {
                throw new IllegalStateException("AI 驱动模型目录不能为空");
            }
            return new Catalog(catalog.schemaVersion(), List.copyOf(catalog.providers()));
        } catch (Exception e) {
            throw new IllegalStateException("加载 AI 驱动模型目录失败", e);
        }
    }

    public record Catalog(Integer schemaVersion, List<ProviderModels> providers) {
    }

    public record ProviderModels(
            String provider,
            String providerLabel,
            String providerFamily,
            List<RuntimeModel> models
    ) {
    }

    public record RuntimeModel(
            String modelName,
            String label,
            Boolean isDefault,
            Boolean supportsImageInput,
            Long contextWindowTokens,
            Long defaultMaxOutputTokens,
            String defaultMaxOutputTokensBasis,
            String defaultMaxOutputTokensSource
    ) {
    }
}
