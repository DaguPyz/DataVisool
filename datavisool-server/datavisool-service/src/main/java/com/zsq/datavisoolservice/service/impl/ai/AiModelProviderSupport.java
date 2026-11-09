/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AiModelProviderSupport {
    private static final ProviderStrategy OPENAI_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "OpenAI",
            "https://api.openai.com/v1",
            false,
            false,
            "max_completion_tokens"
    );
    private static final ProviderStrategy DEEPSEEK_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "DeepSeek",
            "https://api.deepseek.com",
            false,
            false,
            "max_tokens"
    );
    private static final ProviderStrategy QWEN_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "千问 Qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1", false, false, "max_tokens"
    );
    private static final ProviderStrategy KIMI_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "Kimi", "https://api.moonshot.cn/v1", false, false, "max_completion_tokens"
    );
    private static final ProviderStrategy GLM_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", false, false, "max_tokens"
    );
    private static final ProviderStrategy MINIMAX_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "MiniMax", "https://api.minimaxi.com/v1", false, false, "max_tokens"
    );
    private static final ProviderStrategy DOUBAO_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "豆包（火山方舟）", "https://ark.cn-beijing.volces.com/api/v3", false, false, "max_tokens"
    );
    private static final ProviderStrategy HUNYUAN_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "腾讯混元", "https://api.hunyuan.cloud.tencent.com/v1", false, false, "max_tokens"
    );
    private static final ProviderStrategy GEMINI_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "Google Gemini", "https://generativelanguage.googleapis.com", false, false, "max_tokens"
    );
    private static final ProviderStrategy GROK_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "xAI Grok", "https://api.x.ai/v1", false, false, "max_tokens"
    );
    private static final ProviderStrategy MIMO_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "小米 MiMo",
            "https://api.xiaomimimo.com/v1",
            false,
            false,
            "max_completion_tokens"
    );
    private static final ProviderStrategy OLLAMA_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "Ollama",
            "http://localhost:11434/v1",
            true,
            false,
            "max_tokens"
    );
    private static final ProviderStrategy OPENAI_COMPATIBLE_STRATEGY = new OpenAiCompatibleProviderStrategy(
            "OpenAI 兼容",
            null,
            false,
            true,
            "max_tokens"
    );
    private static final ProviderStrategy ANTHROPIC_STRATEGY = new AnthropicProviderStrategy();

    private AiModelProviderSupport() {
    }

    public static AiModelProviderRequestSpec buildProviderRequest(AiModelProviderRequestContext context) {
        return resolveProviderStrategy(context.getProvider()).buildRequestSpec(context);
    }

    public static String extractReplyText(String provider, JSONObject raw) {
        return resolveProviderStrategy(provider).extractReplyText(raw);
    }

    public static String extractReasoningContent(String provider, JSONObject raw) {
        return resolveProviderStrategy(provider).extractReasoningContent(raw);
    }

    public static String providerDisplayName(String provider) {
        return switch (normalizeProviderKey(provider)) {
            case "openai" -> "OpenAI";
            case "qwen" -> "千问 Qwen";
            case "kimi" -> "Kimi";
            case "glm" -> "智谱 GLM";
            case "minimax" -> "MiniMax";
            case "doubao" -> "豆包（火山方舟）";
            case "hunyuan" -> "腾讯混元";
            case "gemini" -> "Google Gemini";
            case "grok" -> "xAI Grok";
            case "deepseek" -> "DeepSeek";
            case "mimo" -> "小米 MiMo";
            case "anthropic" -> "Anthropic";
            case "ollama" -> "Ollama";
            case "compatible" -> "OpenAI 兼容";
            default -> {
                String trimmed = provider == null ? "" : provider.trim();
                yield trimmed.isEmpty() ? "自定义" : trimmed;
            }
        };
    }

    public static String providerFamily(String provider) {
        return switch (normalizeProviderKey(provider)) {
            case "anthropic" -> "anthropic";
            case "gemini" -> "gemini";
            case "grok" -> "xai-responses";
            case "openai", "qwen", "kimi", "glm", "minimax", "doubao", "hunyuan", "deepseek", "mimo", "ollama", "compatible" -> "openai-compatible";
            default -> "openai-compatible";
        };
    }

    public static String providerDefaultBaseUrl(String provider) {
        return resolveProviderStrategy(provider).defaultBaseUrl();
    }

    static Long boundMaxTokens(String provider, String modelName, Long requested) {
        requested = AiDrivenModelCatalog.resolveMaxOutputTokens(provider, modelName, requested);
        if (requested == null) {
            return null;
        }
        String normalizedProvider = normalizeProviderKeyForStorage(provider);
        String model = modelName == null ? "" : modelName.trim().toLowerCase(Locale.ROOT);
        Long officialLimit = switch (normalizedProvider) {
            case "openai" -> hasModelPrefix(model, "gpt-5.4", "gpt-5.5", "gpt-5.6")
                    ? 128_000L
                    : null;
            case "deepseek" -> model.startsWith("deepseek-v4-")
                    || "deepseek-chat".equals(model)
                    || "deepseek-reasoner".equals(model)
                    ? 384_000L
                    : null;
            case "mimo" -> "mimo-v2.5".equals(model) || model.startsWith("mimo-v2.5-pro")
                    || "mimo-v2.6-flash".equals(model) || "mimo-v2.6-pro".equals(model)
                    ? 131_072L
                    : null;
            case "anthropic" -> {
                if (hasModelPrefix(
                        model,
                        "claude-fable-5",
                        "claude-mythos-5",
                        "claude-opus-4-6",
                        "claude-opus-4-7",
                        "claude-opus-4-8",
                        "claude-sonnet-4-6",
                        "claude-sonnet-5"
                )) {
                    yield 128_000L;
                }
                yield "claude-haiku-4-5".equals(model)
                        || model.startsWith("claude-haiku-4-5-")
                        ? 64_000L
                        : null;
            }
            default -> null;
        };
        return officialLimit != null && requested > officialLimit
                ? officialLimit * 9L / 10L
                : requested;
    }

    private static boolean hasModelPrefix(String model, String... prefixes) {
        for (String prefix : prefixes) {
            if (model.equals(prefix) || model.startsWith(prefix + "-")) {
                return true;
            }
        }
        return false;
    }

    public static String normalizeProviderKeyForStorage(String provider) {
        String normalized = normalizeProviderKey(provider);
        if (normalized != null) {
            return normalized;
        }

        String trimmed = provider == null ? "" : provider.trim();
        if (trimmed.isEmpty()) {
            return "compatible";
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private static ProviderStrategy resolveProviderStrategy(String provider) {
        return switch (normalizeProviderKey(provider)) {
            case "anthropic" -> ANTHROPIC_STRATEGY;
            case "openai" -> OPENAI_STRATEGY;
            case "qwen" -> QWEN_STRATEGY;
            case "kimi" -> KIMI_STRATEGY;
            case "glm" -> GLM_STRATEGY;
            case "minimax" -> MINIMAX_STRATEGY;
            case "doubao" -> DOUBAO_STRATEGY;
            case "hunyuan" -> HUNYUAN_STRATEGY;
            case "gemini" -> GEMINI_STRATEGY;
            case "grok" -> GROK_STRATEGY;
            case "deepseek" -> DEEPSEEK_STRATEGY;
            case "mimo" -> MIMO_STRATEGY;
            case "ollama" -> OLLAMA_STRATEGY;
            case "compatible" -> OPENAI_COMPATIBLE_STRATEGY;
            default -> OPENAI_COMPATIBLE_STRATEGY;
        };
    }

    private static String normalizeProviderKey(String provider) {
        if (provider == null) {
            return null;
        }

        String normalized = provider.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return null;
        }

        return switch (normalized) {
            case "openai" -> "openai";
            case "qwen", "dashscope" -> "qwen";
            case "kimi", "moonshot" -> "kimi";
            case "glm", "zhipu", "bigmodel" -> "glm";
            case "minimax", "mini-max" -> "minimax";
            case "doubao", "volcengine", "ark" -> "doubao";
            case "hunyuan", "tencent", "tencent-hunyuan" -> "hunyuan";
            case "gemini", "google", "google-gemini" -> "gemini";
            case "grok", "xai", "x-ai" -> "grok";
            case "deepseek" -> "deepseek";
            case "mimo", "xiaomi", "xiaomi-mimo" -> "mimo";
            case "anthropic", "claude" -> "anthropic";
            case "ollama" -> "ollama";
            case "compatible", "openai-compatible", "custom" -> "compatible";
            default -> null;
        };
    }

    private static String joinUrl(String baseUrl, String path) {
        return baseUrl.trim().replaceAll("/+$", "") + "/" + path.replaceFirst("^/+", "");
    }

    public static String normalizeGeminiOpenAiBaseUrl(String baseUrl) {
        String normalized = trimToNull(baseUrl);
        if (normalized == null || !normalized.contains("generativelanguage.googleapis.com")) {
            return normalized;
        }
        if (normalized.toLowerCase(Locale.ROOT).contains("/openai")) {
            return normalized;
        }
        return normalized.replaceAll("/+$", "") + "/v1beta/openai";
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String valueToText(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String string) {
            String trimmed = string.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        if (value instanceof JSONArray array) {
            List<String> texts = new ArrayList<>();
            for (Object item : array) {
                String text = valueToText(item);
                if (text != null && !text.trim().isEmpty()) {
                    texts.add(text.trim());
                }
            }
            if (texts.isEmpty()) {
                return null;
            }
            return String.join("\n", texts);
        }
        if (value instanceof JSONObject object) {
            String text = trimToNull(object.getString("text"));
            if (text != null) {
                return text;
            }
            String thinking = trimToNull(object.getString("thinking"));
            if (thinking != null) {
                return thinking;
            }
            Object nestedContent = object.get("content");
            if (nestedContent != null) {
                return valueToText(nestedContent);
            }
            return object.toJSONString();
        }
        return String.valueOf(value);
    }

    private interface ProviderStrategy {
        String defaultBaseUrl();

        AiModelProviderRequestSpec buildRequestSpec(AiModelProviderRequestContext context);

        String extractReplyText(JSONObject raw);

        String extractReasoningContent(JSONObject raw);
    }

    private static final class OpenAiCompatibleProviderStrategy implements ProviderStrategy {
        private final String displayName;
        private final String defaultBaseUrl;
        private final boolean allowMissingApiKey;
        private final boolean baseUrlRequired;
        private final String maxTokensField;

        private OpenAiCompatibleProviderStrategy(
                String displayName,
                String defaultBaseUrl,
                boolean allowMissingApiKey,
                boolean baseUrlRequired,
                String maxTokensField
        ) {
            this.displayName = displayName;
            this.defaultBaseUrl = defaultBaseUrl;
            this.allowMissingApiKey = allowMissingApiKey;
            this.baseUrlRequired = baseUrlRequired;
            this.maxTokensField = maxTokensField;
        }

        @Override
        public String defaultBaseUrl() {
            return defaultBaseUrl;
        }

        @Override
        public AiModelProviderRequestSpec buildRequestSpec(AiModelProviderRequestContext context) {
            String baseUrl = trimToNull(context.getBaseUrl());
            if (baseUrl == null) {
                baseUrl = defaultBaseUrl;
            }
            if ("gemini".equals(normalizeProviderKey(context.getProvider()))) {
                baseUrl = normalizeGeminiOpenAiBaseUrl(baseUrl);
            }
            if (baseUrl == null || baseUrl.isBlank()) {
                if (baseUrlRequired) {
                    throw new IllegalArgumentException(displayName + " 需要填写接入地址");
                }
                throw new IllegalArgumentException(displayName + " 无法解析接入地址");
            }

            String apiKey = trimToNull(context.getApiKey());
            if (!allowMissingApiKey && apiKey == null) {
                throw new IllegalArgumentException(displayName + " 需要配置 API Key");
            }

            JSONObject body = new JSONObject();
            body.put("model", context.getModelName());
            body.put("temperature", context.getTemperature());
            body.put("stream", Boolean.FALSE);

            JSONArray messages = new JSONArray();
            if (context.getMessages() != null) {
                messages.addAll(context.getMessages());
            }
            body.put("messages", messages);
            Long boundedMaxTokens = boundMaxTokens(
                    context.getProvider(),
                    context.getModelName(),
                    context.getMaxTokens()
            );
            if (boundedMaxTokens != null) {
                body.put(maxTokensField, boundedMaxTokens);
            }

            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("Content-Type", "application/json");
            if (apiKey != null) {
                headers.put("Authorization", "Bearer " + apiKey);
            }

            return new AiModelProviderRequestSpec(
                    joinUrl(baseUrl, "chat/completions"),
                    headers,
                    body
            );
        }

        @Override
        public String extractReplyText(JSONObject raw) {
            return extractOpenAiReplyText(raw);
        }

        @Override
        public String extractReasoningContent(JSONObject raw) {
            return extractOpenAiReasoningContent(raw);
        }
    }

    private static final class AnthropicProviderStrategy implements ProviderStrategy {
        @Override
        public String defaultBaseUrl() {
            return "https://api.anthropic.com";
        }

        @Override
        public AiModelProviderRequestSpec buildRequestSpec(AiModelProviderRequestContext context) {
            String baseUrl = trimToNull(context.getBaseUrl());
            if (baseUrl == null) {
                baseUrl = defaultBaseUrl();
            }
            if (baseUrl == null || baseUrl.isBlank()) {
                throw new IllegalArgumentException("Anthropic 需要填写接入地址");
            }

            String apiKey = trimToNull(context.getApiKey());
            if (apiKey == null) {
                throw new IllegalArgumentException("Anthropic 需要配置 API Key");
            }

            String systemPrompt = null;
            JSONArray messages = new JSONArray();
            List<JSONObject> sourceMessages = context.getMessages() == null ? List.of() : context.getMessages();
            for (int index = 0; index < sourceMessages.size(); index++) {
                JSONObject message = sourceMessages.get(index);
                if (index == 0 && message != null && "system".equals(message.getString("role"))) {
                    systemPrompt = valueToText(message.get("content"));
                    continue;
                }
                if (message != null) {
                    messages.add(message);
                }
            }

            JSONObject body = new JSONObject();
            body.put("model", context.getModelName());
            body.put("temperature", context.getTemperature());
            body.put("messages", messages);
            Long boundedMaxTokens = boundMaxTokens(
                    context.getProvider(),
                    context.getModelName(),
                    context.getMaxTokens()
            );
            if (boundedMaxTokens == null)
                throw new IllegalArgumentException("该 Anthropic 型号未收录官方输出上限，请填写最大 Token");
            body.put("max_tokens", boundedMaxTokens);
            if (systemPrompt != null) {
                body.put("system", systemPrompt);
            }

            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("content-type", "application/json");
            headers.put("x-api-key", apiKey);
            headers.put("anthropic-version", "2023-06-01");

            return new AiModelProviderRequestSpec(
                    joinUrl(baseUrl, "v1/messages"),
                    headers,
                    body
            );
        }

        @Override
        public String extractReplyText(JSONObject raw) {
            return extractAnthropicReplyText(raw);
        }

        @Override
        public String extractReasoningContent(JSONObject raw) {
            return extractAnthropicReasoningContent(raw);
        }
    }

    private static String extractOpenAiReplyText(JSONObject raw) {
        if (raw == null) {
            return null;
        }

        JSONArray choices = raw.getJSONArray("choices");
        if (choices != null && !choices.isEmpty()) {
            JSONObject choice = choices.getJSONObject(0);
            if (choice != null) {
                JSONObject message = choice.getJSONObject("message");
                if (message != null) {
                    String content = valueToText(message.get("content"));
                    if (content != null) {
                        return content;
                    }
                }

                String text = valueToText(choice.get("text"));
                if (text != null) {
                    return text;
                }
            }
        }

        String outputText = valueToText(raw.get("output_text"));
        if (outputText != null) {
            return outputText;
        }

        return valueToText(raw.get("content"));
    }

    private static String extractOpenAiReasoningContent(JSONObject raw) {
        if (raw == null) {
            return null;
        }

        JSONArray choices = raw.getJSONArray("choices");
        if (choices != null && !choices.isEmpty()) {
            JSONObject choice = choices.getJSONObject(0);
            if (choice != null) {
                JSONObject message = choice.getJSONObject("message");
                if (message != null) {
                    String content = valueToText(message.get("reasoning_content"));
                    if (content != null) {
                        return content;
                    }
                }
            }
        }

        return valueToText(raw.get("reasoning_content"));
    }

    private static String extractAnthropicReplyText(JSONObject raw) {
        if (raw == null) {
            return null;
        }

        JSONArray content = raw.getJSONArray("content");
        if (content == null || content.isEmpty()) {
            return null;
        }

        List<String> texts = new ArrayList<>();
        for (Object item : content) {
            if (item instanceof JSONObject object) {
                String type = trimToNull(object.getString("type"));
                String text = switch (type == null ? "" : type) {
                    case "text" -> valueToText(object.get("text"));
                    case "thinking" -> null;
                    default -> valueToText(object.get("text"));
                };
                if (text != null && !text.trim().isEmpty()) {
                    texts.add(text.trim());
                }
                continue;
            }

            String text = valueToText(item);
            if (text != null && !text.trim().isEmpty()) {
                texts.add(text.trim());
            }
        }

        if (texts.isEmpty()) {
            return null;
        }

        return String.join("\n", texts);
    }

    private static String extractAnthropicReasoningContent(JSONObject raw) {
        if (raw == null) {
            return null;
        }

        JSONArray content = raw.getJSONArray("content");
        if (content == null || content.isEmpty()) {
            return null;
        }

        List<String> texts = new ArrayList<>();
        for (Object item : content) {
            if (!(item instanceof JSONObject object)) {
                continue;
            }

            String type = trimToNull(object.getString("type"));
            if (!"thinking".equals(type)) {
                continue;
            }

            String text = valueToText(object.get("thinking"));
            if (text == null) {
                text = valueToText(object.get("text"));
            }
            if (text != null && !text.trim().isEmpty()) {
                texts.add(text.trim());
            }
        }

        if (texts.isEmpty()) {
            return null;
        }

        return String.join("\n", texts);
    }
}
