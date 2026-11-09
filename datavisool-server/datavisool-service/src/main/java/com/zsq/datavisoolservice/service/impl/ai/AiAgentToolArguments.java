/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 在建立前端等待操作前校验快照和提问，错误一次返回完整修正依据。 */
final class AiAgentToolArguments {
    private AiAgentToolArguments() {}

    static Map<String, Object> snapshots(Map<String, Object> payload) {
        if (!(payload.get("fields") instanceof List<?> fields) || fields.isEmpty())
            return invalid("fields 必须是非空数组；id/type/name 自动返回", "fields", payload.get("fields"),
                    Map.of("type", "array", "minItems", 1, "allowedValues", AiAgentToolDefinitions.SNAPSHOT_FIELDS));
        for (int i = 0; i < fields.size(); i++)
            if (!(fields.get(i) instanceof String value) || !AiAgentToolDefinitions.SNAPSHOT_FIELDS.contains(value.trim()))
                return invalid("快照字段不支持；id/type/name 自动返回", "fields[" + i + "]", fields.get(i),
                        Map.of("type", "string", "allowedValues", AiAgentToolDefinitions.SNAPSHOT_FIELDS));
        payload.put("fields", fields.stream().map(value -> value.toString().trim()).distinct().toList());
        if (payload.containsKey("allPage") && !(payload.get("allPage") instanceof Boolean))
            return invalid("allPage 必须为布尔值；省略时为 false", "allPage", payload.get("allPage"), Map.of("type", "boolean", "default", false));
        if (Boolean.TRUE.equals(payload.get("allPage"))) {
            if (!integer(payload.get("offset"), 0, 9_007_199_254_740_991L))
                return invalid("offset 必须为非负安全整数，默认0", "offset", payload.get("offset"), Map.of("type", "integer", "minimum", 0, "maximum", 9_007_199_254_740_991L));
            if (!integer(payload.get("limit"), 1, 100))
                return invalid("limit 必须为1–100整数，默认50", "limit", payload.get("limit"), Map.of("type", "integer", "minimum", 1, "maximum", 100));
            return null;
        }
        if (!(payload.get("componentIds") instanceof List<?> ids))
            return invalid("allPage=false 时必须提供非空 componentIds", "componentIds", payload.get("componentIds"), Map.of("type", "array", "minItems", 1, "items", "非空真实组件ID字符串"));
        for (int i = 0; i < ids.size(); i++)
            if (!nonBlank(ids.get(i))) return invalid("组件ID必须为非空字符串", "componentIds[" + i + "]", ids.get(i), Map.of("type", "string", "minLength", 1));
        var normalized = ids.stream().filter(String.class::isInstance).map(value -> value.toString().trim())
                .filter(value -> !value.isEmpty()).distinct().toList();
        if (normalized.isEmpty()) return invalid("componentIds 必须包含至少一个真实组件ID", "componentIds", ids, Map.of("type", "array", "minItems", 1));
        payload.put("componentIds", normalized);
        return null;
    }

    static Map<String, Object> questions(Map<String, Object> payload) {
        if (!(payload.get("questions") instanceof List<?> questions) || questions.isEmpty() || questions.size() > 3)
            return invalid("questions 必须为1–3题的数组", "questions", payload.get("questions"), Map.of("type", "array", "minItems", 1, "maxItems", 3, "requiredFields", List.of("id", "header", "question", "options")));
        Set<String> ids = new HashSet<>();
        for (int index = 0; index < questions.size(); index++) {
            String path = "questions[" + index + "]";
            if (!(questions.get(index) instanceof Map<?, ?> question))
                return invalid(path + " 必须是对象", path, questions.get(index), Map.of("type", "object"));
            for (String field : List.of("id", "header", "question"))
                if (!nonBlank(question.get(field))) return invalid(path + "." + field + " 必须为非空字符串", path + "." + field, question.get(field), Map.of("type", "string", "minLength", 1));
            if (!ids.add(question.get("id").toString())) return invalid(path + ".id 不能重复", path + ".id", question.get("id"), Map.of("uniqueWithin", "questions", "rule", "与前面题目的 id 不同"));
            if (!(question.get("options") instanceof List<?> options) || options.size() < 2 || options.size() > 3)
                return invalid(path + ".options 必须为2–3个 {label,description} 对象", path + ".options", question.get("options"), Map.of("type", "array", "minItems", 2, "maxItems", 3));
            Set<String> labels = new HashSet<>();
            for (int optionIndex = 0; optionIndex < options.size(); optionIndex++) {
                String optionPath = path + ".options[" + optionIndex + "]";
                if (!(options.get(optionIndex) instanceof Map<?, ?> option))
                    return invalid(optionPath + " 必须为对象", optionPath, options.get(optionIndex), Map.of("type", "object"));
                for (String field : List.of("label", "description"))
                    if (!nonBlank(option.get(field))) return invalid(optionPath + "." + field + " 必须为非空字符串", optionPath + "." + field, option.get(field), Map.of("type", "string", "minLength", 1));
                if (!labels.add(option.get("label").toString())) return invalid(optionPath + ".label 不能重复", optionPath + ".label", option.get("label"), Map.of("uniqueWithin", path + ".options"));
            }
        }
        return null;
    }

    private static boolean integer(Object value, long min, long max) {
        return value == null || value instanceof Number number && Double.isFinite(number.doubleValue())
                && number.doubleValue() == Math.rint(number.doubleValue()) && number.doubleValue() >= min && number.doubleValue() <= max;
    }

    private static boolean nonBlank(Object value) {
        return value instanceof String text && !text.isBlank();
    }

    private static Map<String, Object> invalid(String message, String path, Object actual, Object expected) {
        var result = AiAgentErrorFeedback.error("invalid_payload", message, path, actual, expected);
        if (path.equals("fields") || path.startsWith("fields[")) result.put("allowedFields", AiAgentToolDefinitions.SNAPSHOT_FIELDS);
        return result;
    }
}
