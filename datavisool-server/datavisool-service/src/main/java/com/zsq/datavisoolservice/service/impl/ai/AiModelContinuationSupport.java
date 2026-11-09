/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSONObject;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;

/**
 * 模型截断续写的结束原因、文本合并和用量累计。
 */
public final class AiModelContinuationSupport {
    private static final int MAX_OVERLAP_CHARS = 512;
    private static final ObjectMapper STRICT_JSON_MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private AiModelContinuationSupport() {
    }

    public static String extractFinishReason(String provider, JSONObject raw) {
        if (raw == null) {
            return null;
        }
        String normalizedProvider = AiModelProviderSupport.normalizeProviderKeyForStorage(provider);
        if ("anthropic".equals(normalizedProvider)) {
            String stopReason = trimToNull(raw.getString("stop_reason"));
            if ("max_tokens".equals(stopReason)) {
                return "length";
            }
            if ("end_turn".equals(stopReason) || "stop_sequence".equals(stopReason)) {
                return "stop";
            }
            if ("tool_use".equals(stopReason)) {
                return "tool_calls";
            }
            if ("refusal".equals(stopReason)) {
                return "content_filter";
            }
            return stopReason == null ? "missing" : stopReason;
        }
        if (raw.getJSONArray("choices") == null || raw.getJSONArray("choices").isEmpty()) {
            return "missing";
        }
        JSONObject choice = raw.getJSONArray("choices").getJSONObject(0);
        if (choice == null) {
            return "missing";
        }
        String finishReason = trimToNull(choice.getString("finish_reason"));
        return finishReason == null ? "missing" : finishReason;
    }

    public static boolean isLengthFinish(String provider, JSONObject raw) {
        return "length".equals(extractFinishReason(provider, raw));
    }

    public static String appendWithOverlap(String accumulated, String delta) {
        String prefix = accumulated == null ? "" : accumulated;
        String suffix = stripCodeFence(delta == null ? "" : delta.trim());
        if (suffix.isEmpty()) {
            return prefix;
        }
        int overlap = longestSuffixPrefixOverlap(prefix, suffix);
        return prefix + suffix.substring(suffix.offsetByCodePoints(0, overlap));
    }

    public static JSONObject mergeUsage(JSONObject accumulated, Object nextValue) {
        JSONObject next = toObject(nextValue);
        if (next == null) {
            return accumulated;
        }
        JSONObject result = accumulated == null ? new JSONObject() : new JSONObject(accumulated);
        for (String key : next.keySet()) {
            Object nextItem = next.get(key);
            Object currentItem = result.get(key);
            if (nextItem instanceof Number nextNumber && currentItem instanceof Number currentNumber) {
                result.put(key, toBigDecimal(currentNumber).add(toBigDecimal(nextNumber)));
            } else if (!result.containsKey(key)) {
                result.put(key, nextItem);
            }
        }
        return result;
    }

    /**
     * 校验续写后的 JSON，并丢弃模型误生成的第二个完整顶层 JSON。
     */
    public static String normalizeContinuedJson(String value) {
        String text = value == null ? "" : value;
        String trimmed = text.trim();
        if (trimmed.isEmpty()
                || (trimmed.charAt(0) != '{' && trimmed.charAt(0) != '[')) {
            return text;
        }
        int firstValueEnd = findTopLevelJsonEnd(trimmed);
        if (firstValueEnd < 0) {
            throw new IllegalArgumentException("续写后的 JSON 未完整闭合");
        }
        String firstValue = trimmed.substring(0, firstValueEnd);
        requireStrictJson(firstValue, "续写后的 JSON 无效");
        String trailing = trimmed.substring(firstValueEnd).trim();
        if (trailing.isEmpty()) {
            return text;
        }
        requireStrictJson(trailing, "第一个顶层 JSON 后存在无法解析的多余内容");
        return firstValue;
    }

    private static JSONObject toObject(Object value) {
        if (value instanceof JSONObject object) {
            return object;
        }
        return null;
    }

    private static BigDecimal toBigDecimal(Number value) {
        return new BigDecimal(value.toString());
    }

    private static int findTopLevelJsonEnd(String value) {
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (character == '\\') {
                    escaped = true;
                } else if (character == '"') {
                    inString = false;
                }
                continue;
            }
            if (character == '"') {
                inString = true;
            } else if (character == '{' || character == '[') {
                depth += 1;
            } else if (character == '}' || character == ']') {
                depth -= 1;
                if (depth < 0) {
                    return -1;
                }
                if (depth == 0) {
                    return index + 1;
                }
            }
        }
        return -1;
    }

    private static void requireStrictJson(String value, String message) {
        try {
            STRICT_JSON_MAPPER.readTree(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException(message + "：" + e.getOriginalMessage());
        }
    }

    private static int longestSuffixPrefixOverlap(String accumulated, String delta) {
        int accumulatedChars = accumulated.codePointCount(0, accumulated.length());
        int deltaChars = delta.codePointCount(0, delta.length());
        int limit = Math.min(MAX_OVERLAP_CHARS, Math.min(accumulatedChars, deltaChars));
        for (int size = limit; size > 0; size--) {
            int accumulatedStart = accumulated.offsetByCodePoints(0, accumulatedChars - size);
            int deltaEnd = delta.offsetByCodePoints(0, size);
            if (accumulated.regionMatches(accumulatedStart, delta, 0, deltaEnd)) {
                return size;
            }
        }
        return 0;
    }

    private static String stripCodeFence(String value) {
        String normalized = value;
        if (normalized.startsWith("```")) {
            int firstLineEnd = normalized.indexOf('\n');
            normalized = firstLineEnd >= 0
                    ? normalized.substring(firstLineEnd + 1)
                    : normalized.substring(3);
            normalized = normalized.trim();
        }
        if (normalized.endsWith("```")) {
            normalized = normalized.substring(0, normalized.length() - 3);
        }
        return normalized.trim();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
