/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import java.util.*;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentDataValidation.*;

/** 按桌面端 Schema 递归检查字段、联合类型、数组元素、数量和数值范围。 */
final class AiAgentStyleValidation {
    private static final Set<String> TYPES = Set.of("boolean", "number", "string", "color", "colorOrColorArray", "array",
            "numberOrArray", "numberOrArrayOrAuto", "numberOrString", "string-or-string-array", "null");

    static void validate(Map<String, Object> style, Map<String, Object> schema) {
        Object rawVersion = schema.get("schemaVersion");
        if (!"component-style-doc/v1".equals(rawVersion))
            throw schemaError("schemaVersion", rawVersion, "component-style-doc/v1", "样式 Schema 版本不受支持");
        Object rawEntries = schema.get("allowedStylePaths");
        if (!(rawEntries instanceof List<?> entries) || entries.isEmpty())
            throw schemaError("allowedStylePaths", rawEntries, "non-empty array<object>", "样式 Schema 缺少允许字段规则");
        if (schema.containsKey("forbiddenFunctionConfig") && !(schema.get("forbiddenFunctionConfig") instanceof Boolean))
            throw schemaError("forbiddenFunctionConfig", schema.get("forbiddenFunctionConfig"), "boolean", "函数配置开关必须是布尔值");

        var rules = new LinkedHashMap<String, Map<String, Object>>();
        for (int i = 0; i < entries.size(); i++) {
            Object raw = entries.get(i);
            String rulePath = "allowedStylePaths[" + i + "]";
            if (!(raw instanceof Map<?, ?> rawRule))
                throw schemaError(rulePath, raw, "object with path and type", "样式规则必须是对象");
            var rule = ComponentDocumentParser.cast(rawRule);
            Object rawPath = rule.get("path");
            String path = text(rawPath);
            if (!(rawPath instanceof String) || !path.startsWith("style.") || !path.equals(rawPath))
                throw schemaError(rulePath + ".path", rawPath, "string beginning with 'style.'", "样式规则路径无效");
            if (rules.containsKey(path)) throw schemaError(rulePath + ".path", path, "unique style path", "样式规则路径重复");
            String type = text(rule.get("type"));
            if (!TYPES.contains(type))
                throw schemaError(rulePath + ".type", rule.get("type"), Map.of("allowedValues", TYPES.stream().sorted().toList()), "样式规则类型不受支持");
            String malformed = malformedField(rule);
            if (malformed != null)
                throw schemaError(rulePath + "." + malformed, rule.get(malformed), expectedRuleField(malformed), "样式规则字段的值无效");
            String reversed = reversedField(rule);
            if (reversed != null) {
                String upper = reversed.equals("min") ? "max" : "maxItems";
                Map<String, Object> range = new LinkedHashMap<>();
                range.put(reversed, rule.get(reversed)); range.put(upper, rule.get(upper));
                throw schemaError(rulePath, range, Map.of("constraint", reversed + " <= " + upper),
                        "样式规则范围上下界颠倒");
            }
            rules.put(path, rule);
        }
        if (Boolean.TRUE.equals(schema.get("forbiddenFunctionConfig"))) rejectFunctions(style, "style");
        validateObject(style, "style", "style", rules);
    }

    private static Object expectedRuleField(String key) {
        return switch (key) {
            case "min", "max" -> "finite number";
            case "minItems", "maxItems" -> "non-negative integer";
            case "allowNull", "allowFalse" -> "boolean";
            case "enumValues" -> "array<any>";
            default -> "valid value";
        };
    }

    private static String malformedField(Map<String, Object> rule) {
        for (String key : List.of("min", "max")) if (rule.get(key) != null && !finite(rule.get(key))) return key;
        for (String key : List.of("minItems", "maxItems")) if (rule.get(key) != null
                && (!finite(rule.get(key)) || ((Number) rule.get(key)).doubleValue() < 0
                || ((Number) rule.get(key)).doubleValue() != ((Number) rule.get(key)).longValue())) return key;
        for (String key : List.of("allowNull", "allowFalse")) if (rule.containsKey(key) && !(rule.get(key) instanceof Boolean)) return key;
        if (rule.get("enumValues") != null && !(rule.get("enumValues") instanceof List<?>)) return "enumValues";
        return null;
    }

    private static String reversedField(Map<String, Object> rule) {
        if (reversed(rule, "min", "max")) return "min";
        if (reversed(rule, "minItems", "maxItems")) return "minItems";
        return null;
    }

    private static boolean reversed(Map<String, Object> rule, String min, String max) {
        return rule.get(min) instanceof Number lower && rule.get(max) instanceof Number upper && lower.doubleValue() > upper.doubleValue();
    }

    private static Violation schemaError(String path, Object actual, Object expected, String message) {
        return error("agent.evidence.schema_rules_invalid", message, path, actual, expected);
    }

    private static Violation invalid(String path, String message, Object actual, Object expected) {
        return error("agent.operation.style_patch_not_allowed", message, path, actual, expected);
    }

    private static void validateObject(Map<String, Object> object, String ruleParent, String display,
                                       Map<String, Map<String, Object>> rules) {
        for (var entry : object.entrySet()) {
            String key = entry.getKey(), path = ruleParent + "." + key, shown = display + "." + key;
            Object value = entry.getValue();
            if (dangerous(key)) throw invalid(shown, "禁止危险字段", "[字段值不回显]", "safe JSON field name");
            if (value instanceof Map<?, ?> nested && rules.keySet().stream().anyMatch(candidate -> candidate.startsWith(path + "."))) {
                if (nested.isEmpty()) throw invalid(shown, "样式对象不能为空", nested, "non-empty object with declared child fields");
                validateObject(ComponentDocumentParser.cast(nested), path, shown, rules);
                continue;
            }
            validateValue(value, shown, rules.get(path), rules);
            if (value instanceof List<?> list && rules.keySet().stream().anyMatch(candidate -> candidate.startsWith(path + "[].")))
                for (int i = 0; i < list.size(); i++) {
                    if (!(list.get(i) instanceof Map<?, ?> child))
                        throw invalid(shown + "[" + i + "]", "数组元素必须是对象", list.get(i), "object");
                    validateObject(ComponentDocumentParser.cast(child), path + "[]", shown + "[" + i + "]", rules);
                }
        }
    }

    private static void validateValue(Object value, String path, Map<String, Object> rule,
                                      Map<String, Map<String, Object>> rules) {
        if (rule == null) {
            List<String> allowed = rules.keySet().stream().filter(candidate -> candidate.startsWith(parent(path) + ".")
                            || candidate.startsWith(parent(path) + "[]."))
                    .sorted().toList();
            throw invalid(path, "字段不在当前组件的样式规则中", value,
                    Map.of("allowedStylePaths", allowed));
        }
        String type = text(rule.get("type"));
        if (value == null) {
            if (Boolean.TRUE.equals(rule.get("allowNull")) || type.equals("null")) return;
            throw invalid(path, "字段不允许为 null", null, expected(rule));
        }
        if (Boolean.FALSE.equals(value) && Boolean.TRUE.equals(rule.get("allowFalse"))) return;
        boolean valid = switch (type) {
            case "boolean" -> value instanceof Boolean;
            case "number" -> finite(value);
            case "string", "color" -> value instanceof String;
            case "array" -> value instanceof List<?>;
            case "numberOrArray", "numberOrArrayOrAuto" -> finite(value) || value instanceof List<?> || type.equals("numberOrArrayOrAuto") && "auto".equals(value);
            case "numberOrString" -> finite(value) || value instanceof String;
            case "colorOrColorArray", "string-or-string-array" -> value instanceof String || value instanceof List<?>;
            case "null" -> value == null;
            default -> false;
        };
        if (!valid) throw invalid(path, "字段类型不符合组件样式规则", value, expected(rule));
        if (value instanceof List<?> values) validateArray(values, path, rule, type);
        if (Set.of("boolean", "number", "string", "color", "numberOrString").contains(type)
                && rule.get("enumValues") instanceof List<?> options && !options.contains(value))
            throw invalid(path, "字段值不在允许枚举中", value, Map.of("allowedValues", options));
        if (value instanceof Number n && !type.equals("numberOrString")) checkBounds(n.doubleValue(), n, rule, "min", "max", path);
        if (value instanceof List<?> values) {
            checkArrayBounds(values, path, rule);
            if (Set.of("numberOrArray", "numberOrArrayOrAuto").contains(type))
                for (int i = 0; i < values.size(); i++) checkBounds(((Number) values.get(i)).doubleValue(), values.get(i), rule, "min", "max", path + "[" + i + "]");
        }
    }

    private static void validateArray(List<?> values, String path, Map<String, Object> rule, String type) {
        if (Set.of("numberOrArray", "numberOrArrayOrAuto").contains(type)) {
            for (int i = 0; i < values.size(); i++) if (!finite(values.get(i)))
                throw invalid(path + "[" + i + "]", "数组元素必须是有限数", values.get(i), "finite number");
        } else if (Set.of("colorOrColorArray", "string-or-string-array").contains(type)) {
            for (int i = 0; i < values.size(); i++) if (!(values.get(i) instanceof String))
                throw invalid(path + "[" + i + "]", "数组元素必须是字符串", values.get(i), "string");
        }
    }

    private static String parent(String path) {
        String normalized = path.replaceAll("\\[\\d+\\]", "[]");
        int dot = normalized.lastIndexOf('.');
        return dot < 0 ? "style" : normalized.substring(0, dot);
    }

    private static Object expected(Map<String, Object> rule) {
        String type = text(rule.get("type"));
        Object shape = switch (type) {
            case "boolean" -> "boolean";
            case "number" -> "finite number";
            case "string", "color" -> "string";
            case "colorOrColorArray" -> Map.of("oneOf", List.of("string", "array<string>"));
            case "array" -> "array";
            case "numberOrArray" -> Map.of("oneOf", List.of("finite number", "array<finite number>"));
            case "numberOrArrayOrAuto" -> Map.of("oneOf", List.of("finite number", "array<finite number>", "auto"));
            case "numberOrString" -> Map.of("oneOf", List.of("finite number", "string"));
            case "string-or-string-array" -> Map.of("oneOf", List.of("string", "array<string>"));
            case "null" -> "null";
            default -> type;
        };
        Map<String, Object> expected = new LinkedHashMap<>();
        expected.put("type", shape);
        for (String key : List.of("min", "max", "minItems", "maxItems")) if (rule.containsKey(key)) expected.put(key, rule.get(key));
        if (rule.get("enumValues") instanceof List<?> options) expected.put("allowedValues", options);
        if (Boolean.TRUE.equals(rule.get("allowNull"))) expected.put("allowNull", true);
        return expected;
    }

    private static void checkBounds(double numericValue, Object actual, Map<String, Object> rule,
                                    String minKey, String maxKey, String path) {
        Object minimum = rule.get(minKey), maximum = rule.get(maxKey);
        if (minimum instanceof Number min && numericValue < min.doubleValue()
                || maximum instanceof Number max && numericValue > max.doubleValue()) {
            Map<String, Object> bounds = new LinkedHashMap<>();
            if (minimum != null) bounds.put("min", minimum);
            if (maximum != null) bounds.put("max", maximum);
            throw invalid(path, "字段值超出允许范围", actual, bounds);
        }
    }

    private static void checkArrayBounds(List<?> values, String path, Map<String, Object> rule) {
        Object minimum = rule.get("minItems"), maximum = rule.get("maxItems");
        int count = values.size();
        if (minimum instanceof Number min && count < min.intValue()
                || maximum instanceof Number max && count > max.intValue()) {
            Map<String, Object> expected = new LinkedHashMap<>();
            expected.put("type", "array");
            if (minimum != null) expected.put("minItems", minimum);
            if (maximum != null) expected.put("maxItems", maximum);
            throw invalid(path, "数组项数超出允许范围", values, expected).withActualCount(count);
        }
    }

    private static void rejectFunctions(Object value, String path) {
        if (value instanceof Map<?, ?> map) for (var entry : map.entrySet()) rejectFunctions(entry.getValue(), path + "." + entry.getKey());
        else if (value instanceof List<?> list) for (int i = 0; i < list.size(); i++) rejectFunctions(list.get(i), path + "[" + i + "]");
        else if (value instanceof String s && (s.stripLeading().startsWith("function ") || s.stripLeading().startsWith("async function ") || s.contains("=>")))
            throw invalid(path, "样式配置不能包含函数值", "[函数内容已省略]", "JSON literal, not a function");
    }
}
