/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.global.AppException;
import java.util.*;

/** 保留错误位置、实际输入和修正要求，供工具结果及异常共用。 */
final class AiAgentErrorFeedback {
    private AiAgentErrorFeedback() {}

    static Map<String, Object> error(String code, String message, String fieldPath, Object actualValue, Object expected) {
        var result = new LinkedHashMap<String, Object>();
        result.put("code", code);
        result.put("message", message);
        if (fieldPath != null) result.put("fieldPath", fieldPath);
        result.put("actualValue", safeValue(fieldPath, actualValue));
        result.put("actualType", type(actualValue));
        result.put("expected", AiAgentDebugTrace.redact(expected));
        return result;
    }

    static Failure invalid(String message, String fieldPath, Object actualValue, Object expected) {
        return new Failure(400, error("invalid_arguments", message, fieldPath, actualValue, expected));
    }

    static Object safeValue(String fieldPath, Object value) {
        String path = Objects.toString(fieldPath, "").toLowerCase(Locale.ROOT);
        if (path.matches(".*(?:password|passwd|secret|token|authorization|credential|api.?key|cookie).*")) return "[已脱敏]";
        return redactTextValues(AiAgentDebugTrace.redact(value));
    }

    private static Object redactTextValues(Object value) {
        if (value instanceof Map<?, ?> source) {
            Map<String, Object> output = new LinkedHashMap<>();
            source.forEach((key, child) -> output.put(String.valueOf(key), redactTextValues(child)));
            return output;
        }
        if (value instanceof Collection<?> source) return source.stream().map(AiAgentErrorFeedback::redactTextValues).toList();
        if (value instanceof String text) return text
                .replaceAll("(?i)(Bearer\\s+)[A-Za-z0-9._~+/=-]+", "$1[已脱敏]")
                .replaceAll("(?i)([?&](?:access_?token|refresh_?token|token|api_?key|key|password|secret|authorization|credential)=)[^&#\\s]*", "$1[已脱敏]")
                .replaceAll("(?i)(https?://)[^/@\\s:]+:[^/@\\s]+@", "$1[已脱敏]@");
        return value;
    }

    static String type(Object value) {
        if (value == null) return "null";
        if (value instanceof Map<?, ?>) return "object";
        if (value instanceof Collection<?> || value.getClass().isArray()) return "array";
        if (value instanceof String) return "string";
        if (value instanceof Boolean) return "boolean";
        if (value instanceof Number) return "number";
        return value.getClass().getSimpleName();
    }

    static final class Failure extends AppException {
        private final Map<String, Object> feedback;
        Failure(int status, Map<String, Object> feedback) {
            super(status, Objects.toString(feedback.get("message"), "工具执行失败"));
            this.feedback = feedback;
        }
        Map<String, Object> result() { return new LinkedHashMap<>(feedback); }
        @Override public String getMessage() { return getMsg(); }
    }
}
