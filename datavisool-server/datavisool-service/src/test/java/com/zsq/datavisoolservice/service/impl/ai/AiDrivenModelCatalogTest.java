/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.model.dto.AiModelDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunRequestDTO;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class AiDrivenModelCatalogTest {
    @Test
    void exposesDesktopAlignedProviderAndRuntimeModelCatalog() {
        var providers = AiDrivenModelCatalog.listProviders();

        assertEquals(12, providers.size());
        assertEquals("openai", providers.get(0).provider());
        assertTrue(providers.get(0).models().stream()
                .anyMatch(model -> "gpt-5.5".equals(model.modelName()) && Boolean.TRUE.equals(model.isDefault())));
        assertEquals(
                Set.of("openai", "qwen", "kimi", "glm", "minimax", "doubao", "hunyuan", "gemini", "grok", "deepseek", "mimo", "anthropic"),
                providers.stream().map(AiDrivenModelCatalog.ProviderModels::provider).collect(java.util.stream.Collectors.toSet())
        );
    }

    @Test
    void keepsRuntimeModelOutOfManagementConfiguration() {
        assertFalse(hasField(AiModelDTO.class, "modelName"));
        assertFalse(hasField(AiModelPO.class, "modelName"));
        assertTrue(hasField(AiModelRunRequestDTO.class, "runtimeModelId"));
    }

    @Test
    void resolvesOfficialBudgetsByProviderAndConcreteModelWithManualOverride() {
        assertEquals(131_072L, AiDrivenModelCatalog.resolveMaxOutputTokens("xiaomi", "mimo-v2.6-flash", null));
        assertEquals(131_072L, AiDrivenModelCatalog.resolveMaxOutputTokens("mimo", "mimo-v2.6-pro", null));
        assertEquals(65_536L, AiDrivenModelCatalog.resolveMaxOutputTokens("deepseek", "deepseek-v4-pro", null));
        assertEquals(65_536L, AiDrivenModelCatalog.resolveMaxOutputTokens("zhipu", "glm-5v-turbo", null));
        assertEquals(25_000L, AiDrivenModelCatalog.resolveMaxOutputTokens("openai", "gpt-5.5", null));
        assertEquals(131_072L, AiDrivenModelCatalog.resolveMaxOutputTokens("kimi", "kimi-k3", null));
        assertEquals(128_000L, AiDrivenModelCatalog.resolveMaxOutputTokens("anthropic", "claude-sonnet-4-6", null));
        assertEquals(64_000L, AiDrivenModelCatalog.resolveMaxOutputTokens("anthropic", "claude-haiku-4-5-20251001", null));
        assertEquals(4_096L, AiDrivenModelCatalog.resolveMaxOutputTokens("mimo", "mimo-v2.6-pro", 4_096L));
        assertNull(AiDrivenModelCatalog.resolveMaxOutputTokens("mimo", "unlisted-model", null));
        assertNull(AiDrivenModelCatalog.resolveMaxOutputTokens("custom", "mimo-v2.5", null));
        assertNull(AiDrivenModelCatalog.resolveMaxOutputTokens("qwen", "qwen3.7-plus", null));
    }

    @Test
    void mimoCatalogContainsSupportedMultimodalReplacements() {
        var models = AiDrivenModelCatalog.listProviders().stream()
                .filter(provider -> "mimo".equals(provider.provider())).findFirst().orElseThrow().models();
        assertEquals(Set.of("mimo-v2.6-pro", "mimo-v2.6-flash"),
                models.stream().map(AiDrivenModelCatalog.RuntimeModel::modelName).collect(java.util.stream.Collectors.toSet()));
        for (var model : models) {
            assertTrue(model.supportsImageInput());
            assertTrue(AiModelCapabilitySupport.supportsImageInput("mimo", model.modelName()));
            assertEquals(117_964L, AiModelProviderSupport.boundMaxTokens("mimo", model.modelName(), 200_000L));
        }
    }

    @Test
    void everyExplicitDefaultHasAnOfficialSourceAndFitsItsContextWindow() {
        for (var provider : AiDrivenModelCatalog.listProviders()) {
            for (var model : provider.models()) {
                if (model.defaultMaxOutputTokens() == null) continue;
                assertTrue(model.defaultMaxOutputTokens() > 0);
                assertTrue(model.defaultMaxOutputTokens() < model.contextWindowTokens());
                assertNotNull(model.defaultMaxOutputTokensBasis());
                assertTrue(model.defaultMaxOutputTokensSource().startsWith("https://"));
            }
        }
    }

    private boolean hasField(Class<?> type, String fieldName) {
        return Arrays.stream(type.getDeclaredFields())
                .anyMatch(field -> fieldName.equals(field.getName()));
    }
}
