/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import java.util.Locale;
import java.util.Set;

/**
 * AI 模型能力判断。
 *
 * 图片能力使用保守策略：明确支持的模型返回 true，无法确认时返回 false，
 * 避免把图片发给只接受文本的模型后才暴露协议错误。
 */
public final class AiModelCapabilitySupport {
    private static final Set<String> IMAGE_MODEL_NAMES = Set.of(
            "gpt-5.5",
            "gpt-5.4-pro",
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.4-nano",
            "mimo-v2.5",
            "mimo-v2.6-flash",
            "mimo-v2.6-pro",
            "claude-fable-5",
            "claude-opus-4-8",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001"
    );

    private AiModelCapabilitySupport() {
    }

    public static boolean isKnownVisionModel(String modelName) {
        return IMAGE_MODEL_NAMES.contains(normalize(modelName));
    }

    public static boolean supportsImageInput(String provider, String modelName) {
        String normalizedProvider = normalize(provider);
        String normalizedModel = normalize(modelName);
        if (normalizedModel.isEmpty()) {
            return false;
        }
        if (IMAGE_MODEL_NAMES.contains(normalizedModel)) {
            return true;
        }
        if ("deepseek".equals(normalizedProvider)) {
            return normalizedModel.contains("vl") || normalizedModel.contains("vision");
        }
        if ("anthropic".equals(normalizedProvider)) {
            return normalizedModel.startsWith("claude-");
        }
        if ("openai".equals(normalizedProvider)) {
            return normalizedModel.startsWith("gpt-4o")
                    || normalizedModel.startsWith("gpt-4.1")
                    || normalizedModel.startsWith("gpt-5");
        }
        if ("qwen".equals(normalizedProvider)) {
            return normalizedModel.contains("vl")
                    || normalizedModel.contains("vision")
                    || normalizedModel.contains("omni")
                    || normalizedModel.equals("qwen3.8-max")
                    || normalizedModel.equals("qwen3.7-plus")
                    || normalizedModel.equals("qwen3.7-flash");
        }
        if ("kimi".equals(normalizedProvider)) {
            return normalizedModel.equals("kimi-k3")
                    || normalizedModel.equals("kimi-k2.7-code")
                    || normalizedModel.equals("kimi-k2.7-code-highspeed")
                    || normalizedModel.equals("kimi-k2.6");
        }
        if ("glm".equals(normalizedProvider)) {
            return normalizedModel.equals("glm-5v-turbo");
        }
        if ("minimax".equals(normalizedProvider)) {
            return normalizedModel.equals("minimax-m3");
        }
        if ("doubao".equals(normalizedProvider)) {
            return normalizedModel.startsWith("doubao-seed-2-0-lite-")
                    || normalizedModel.startsWith("doubao-seed-2-0-pro-");
        }
        if ("hunyuan".equals(normalizedProvider)) {
            return normalizedModel.contains("vision");
        }
        if ("gemini".equals(normalizedProvider) || "grok".equals(normalizedProvider)) {
            return true;
        }
        if ("ollama".equals(normalizedProvider)) {
            return normalizedModel.contains("llava")
                    || normalizedModel.contains("qwen-vl")
                    || normalizedModel.contains("minicpm-v")
                    || normalizedModel.contains("gemma3");
        }
        return false;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
