/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.global.AppException;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 完整规格读取契约；证据仅从已完成的宿主结果派生，不接受模型提供的证据。 */
final class AiAgentComponentSpecs {
    static final String TOOL_NAME = "resolve_component_specs";
    static final int OUTPUT_BUDGET_BYTES = 256 * 1024;
    static final String EVIDENCE_KEY = "completeSpecEvidence";

    private AiAgentComponentSpecs() {}

    static List<String> normalizeRequest(Map<String, Object> request) {
        Object rawTypes = request.get("componentTypes");
        if (!(rawTypes instanceof List<?> types)) {
            throw invalid("component_types_required", "componentTypes 必须是组件类型字符串数组",
                    "componentTypes", rawTypes, Map.of("type", "array<string>", "minItems", 1, "maxItems", 10));
        }
        for (int index = 0; index < types.size(); index++) if (!(types.get(index) instanceof String)) {
            throw invalid("component_types_required", "componentTypes 项必须是字符串",
                    "componentTypes[" + index + "]", types.get(index), "string");
        }
        List<String> normalized = types.stream().map(type -> ((String) type).trim())
                .filter(type -> !type.isEmpty()).distinct().toList();
        if (normalized.isEmpty() || normalized.size() > 10) {
            throw invalid(normalized.isEmpty() ? "component_types_required" : "component_types_limit_exceeded",
                    normalized.isEmpty() ? "componentTypes 清理空白和重复项后没有可读取的组件类型"
                            : "componentTypes 清理空白和重复项后超过单次读取上限",
                    "componentTypes", rawTypes, Map.of("type", "array<string>", "minItems", 1, "maxItems", 10,
                            "uniqueItemsAfterTrim", true, "nonEmptyItems", true));
        }
        Object intent = request.get("intent");
        if (!Set.of("create", "patch").contains(String.valueOf(intent))) {
            throw invalid("intent_invalid", "intent 不受支持",
                    "intent", intent, Map.of("allowedValues", List.of("create", "patch")));
        }
        request.put("componentTypes", normalized);
        return normalized;
    }

    static List<Map<String, Object>> completeEvidence(Map<String, Object> request, Map<String, Object> result) {
        List<String> types = normalizeRequest(request);
        Object version = result.get("corpusVersion");
        if (!(version instanceof String corpusVersion) || corpusVersion.isBlank()) {
            throw invalid("result_invalid", "宿主规格结果缺少有效资料版本",
                    "corpusVersion", version, "non-empty string");
        }
        if (Boolean.TRUE.equals(result.get("truncated"))) {
            throw invalid("result_invalid", "宿主规格结果已截断，不能记录完整读取证据",
                    "truncated", true, false);
        }
        Object rawSpecs = result.get("specs");
        if (!(rawSpecs instanceof List<?> specs)) {
            throw invalid("result_invalid", "宿主规格结果缺少 specs 数组",
                    "specs", rawSpecs, "array<object>");
        }
        if (specs.size() != types.size()) {
            Map<String, Object> feedback = AiAgentErrorFeedback.error("agent.component_specs.result_invalid",
                    "宿主返回规格数量与请求的组件数量不一致", "specs", specs,
                    Map.of("type", "array<object>", "minItems", types.size(), "maxItems", types.size(),
                            "requestedComponentTypes", types));
            feedback.put("actualCount", specs.size());
            throw new AiAgentErrorFeedback.Failure(400, feedback);
        }
        Object rawFragments = result.get("commonFragments");
        if (!(rawFragments instanceof Map<?, ?> fragments)) {
            throw invalid("result_invalid", "宿主规格结果缺少 commonFragments 对象",
                    "commonFragments", rawFragments, "object");
        }
        if (JSON.toJSONString(result).getBytes(StandardCharsets.UTF_8).length > OUTPUT_BUDGET_BYTES) {
            int bytes = JSON.toJSONString(result).getBytes(StandardCharsets.UTF_8).length;
            throw invalid("output_limit_exceeded", "完整规格超过 256 KiB；请减少 componentTypes 后重试",
                    "result.serializedByteLength", bytes, Map.of("maxBytes", OUTPUT_BUDGET_BYTES));
        }
        Set<String> returned = new LinkedHashSet<>();
        for (int index = 0; index < specs.size(); index++) {
            String prefix = "specs[" + index + "]", componentType = null;
            try {
                Object item = specs.get(index);
                if (!(item instanceof Map<?, ?> spec))
                    throw invalid("result_invalid", "宿主规格项必须是对象", prefix, item, "object");
                Object rawType = spec.get("componentType");
                if (!(rawType instanceof String type) || type.isBlank())
                    throw invalid("result_invalid", "宿主规格项缺少有效 componentType", prefix + ".componentType",
                            rawType, "non-empty string");
                componentType = type;
                if (!types.contains(type)) throw invalid("result_invalid", "宿主返回了本次未请求的组件类型",
                        prefix + ".componentType", type, Map.of("requestedComponentTypes", types));
                if (!returned.add(type)) throw invalid("result_invalid", "宿主重复返回同一组件类型",
                        prefix + ".componentType", type, "unique requested componentType");
                if (!(spec.get("configurable") instanceof Map<?, ?> configurable))
                    throw invalid("result_invalid", "宿主规格项缺少 configurable 对象", prefix + ".configurable",
                            spec.get("configurable"), "object");
                if (!(configurable.get("style") instanceof Map<?, ?> style) || style.isEmpty())
                    throw invalid("result_invalid", "宿主规格项缺少非空 configurable.style 对象",
                            prefix + ".configurable.style", configurable.get("style"), "non-empty object");
                if (!(spec.get("example") instanceof Map<?, ?> example))
                    throw invalid("result_invalid", "宿主规格项缺少 example 对象", prefix + ".example",
                            spec.get("example"), "object");
                if (!matchesIntent(example, request.get("intent")))
                    throw invalid("result_invalid", "宿主示例与请求的 intent 不匹配", prefix + ".example",
                            example, Map.of("intent", request.get("intent"), "requiredExampleShape",
                                    "create: config object; patch: stylePatch.style or dataPatch object"));
                validateReferences(style, fragments, prefix + ".configurable.style");
            } catch (AiAgentErrorFeedback.Failure failure) {
                if (componentType == null) throw failure;
                Map<String, Object> details = failure.result();
                details.put("componentType", componentType);
                throw new AiAgentErrorFeedback.Failure(400, details);
            }
        }
        List<Map<String, Object>> evidence = new ArrayList<>();
        for (String type : types) {
            Map<String, Object> item = new java.util.LinkedHashMap<>(Map.of("componentType", type,
                    "intent", request.get("intent"), "corpusVersion", version));
            specs.stream().filter(spec -> spec instanceof Map<?, ?> s && type.equals(s.get("componentType")))
                    .map(spec -> ((Map<?, ?>) spec).get("documentIdentity")).filter(Map.class::isInstance)
                    .findFirst().ifPresent(identity -> item.put("documentIdentity", identity));
            evidence.add(item);
        }
        return evidence;
    }

    private static boolean matchesIntent(Map<?, ?> example, Object intent) {
        if ("create".equals(intent)) {
            return example.get("config") instanceof Map<?, ?>;
        }
        return !example.containsKey("config") && (example.get("dataPatch") instanceof Map<?, ?>
                || (example.get("stylePatch") instanceof Map<?, ?> patch && patch.get("style") instanceof Map<?, ?>));
    }

    private static void validateReferences(Object value, Map<?, ?> fragments, String path) {
        if (value instanceof String text) {
            if (text.matches("<g2plot-[a-z0-9-]+>")) {
                if (!(fragments.get(text) instanceof Map<?, ?>)) {
                    throw invalid("common_fragments_invalid", "完整规格引用的公共片段没有随结果返回",
                            path, text, Map.of("requiredFragmentKey", text, "expectedType", "object in commonFragments"));
                }
            } else if (text.stripLeading().toLowerCase(java.util.Locale.ROOT).matches("^(<g2plot|g2plot-).*")) {
                throw invalid("common_fragments_invalid", "G2Plot 标签必须完整匹配且单独占值",
                        path, text, "standalone tag matching <g2plot-[a-z0-9-]+>");
            }
        } else if (value instanceof Map<?, ?> map) {
            map.forEach((key, child) -> validateReferences(child, fragments, path + "." + key));
        } else if (value instanceof List<?> list) {
            for (int index = 0; index < list.size(); index++) validateReferences(list.get(index), fragments, path + "[" + index + "]");
        }
    }

    private static AppException invalid(String code, String message, String path, Object actual, Object expected) {
        Map<String, Object> feedback = AiAgentErrorFeedback.error("agent.component_specs." + code,
                message, path, actual, expected);
        return new AiAgentErrorFeedback.Failure(400, feedback);
    }
}
