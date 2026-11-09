/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.global.AppException;
import java.util.*;

/** 与桌面端一致的数据说明书、数据源分支和最终字段映射校验。规则只在当前请求中使用。 */
final class AiAgentDataValidation {
    static final Set<String> MAPPING_KEYS = Set.of("xField", "yField", "seriesField", "angleField", "colorField",
            "sizeField", "shapeField", "wordField", "weightField", "groupField");
    private static final Map<String, String> BRANCHES = Map.of("static", "staticData", "api", "apiData", "database", "database",
            "commonApi", "commonApi", "globalVariable", "globalVariable", "webSocket", "webSocket", "mqtt", "mqtt");

    static final class Violation extends AppException {
        final String validationCode, path;
        private final Object actualValue, expected;
        private final boolean actualProvided;
        private String fieldPath, componentId, componentType;
        private Integer actualCount;

        Violation(String code, String message, String path, Object actualValue, boolean actualProvided, Object expected) {
            super(400, formatMessage(message, path, actualValue, actualProvided, expected));
            this.validationCode = code;
            this.path = path;
            this.fieldPath = path;
            this.actualValue = actualValue;
            this.actualProvided = actualProvided;
            this.expected = expected;
        }

        Violation withComponentContext(String id, String type, String fullPath) {
            this.componentId = id;
            this.componentType = type;
            if (fullPath != null && !fullPath.isBlank()) this.fieldPath = fullPath;
            return this;
        }

        Violation withActualCount(int count) {
            this.actualCount = count;
            return this;
        }

        Map<String, Object> result() {
            var result = AiAgentErrorFeedback.error(validationCode, getMsg(), fieldPath,
                    actualProvided ? actualValue : null, expected);
            result.put("actualValue", actualProvided ? AiAgentErrorFeedback.safeValue(fieldPath, actualValue) : null);
            if (!actualProvided) result.put("actualType", "missing");
            if (actualCount != null) result.put("actualCount", actualCount);
            if (path != null) result.put("path", path);
            if (componentId != null && !componentId.isBlank()) result.put("componentId", componentId);
            if (componentType != null && !componentType.isBlank()) result.put("componentType", componentType);
            return result;
        }
    }

    static Violation error(String code, String message, String path) {
        return new Violation(code, message, path, null, false, "按错误原因补齐或修正该字段");
    }

    static Violation error(String code, String message, String path, Object actual, Object expected) {
        return new Violation(code, message, path, actual, true, expected);
    }

    static Violation missing(String code, String message, String path, Object expected) {
        return new Violation(code, message, path, null, false, expected);
    }

    private static Violation dataError(String message, String path) {
        return error("agent.operation.data_patch_not_allowed", message, path);
    }

    private static Violation dataError(String message, String path, Object actual, Object expected) {
        return error("agent.operation.data_patch_not_allowed", message, path, actual, expected);
    }

    private static Object boundedActual(String path, Object value) {
        String normalized = Objects.toString(path, "").toLowerCase(Locale.ROOT);
        if (normalized.matches(".*(?:password|passwd|secret|token|authorization|credential|api.?key|cookie).*"))
            return "[敏感值已省略]";
        if (normalized.endsWith(".url") || normalized.equals("url")) return "[URL内容已省略，避免回显认证信息]";
        if (value instanceof Map<?, ?> map) return "[object，字段数=" + map.size() + "]";
        if (value instanceof Collection<?> list) return "[array，元素数=" + list.size() + "]";
        if (value instanceof String text && text.length() > 160) return text.substring(0, 160) + "…";
        return value;
    }

    private static String formatMessage(String message, String path, Object actual, boolean actualProvided, Object expected) {
        StringBuilder result = new StringBuilder(message);
        if (path != null && !path.isBlank()) result.append("；字段路径：").append(path);
        if (actualProvided) result.append("；实际类型：").append(AiAgentErrorFeedback.type(actual))
                .append("；实际值：").append(JSON.toJSONString(boundedActual(path, actual)));
        else result.append("；实际状态：字段缺失");
        if (expected != null) result.append("；期望：").append(JSON.toJSONString(expected));
        return result.toString();
    }

    static Map<String, Object> object(Object value, String path) {
        if (!(value instanceof Map<?, ?> map))
            throw dataError(path + " 必须是对象", path, value, Map.of("type", "object"));
        return ComponentDocumentParser.cast(map);
    }

    static String sourceType(Map<String, Object> data) {
        return sourceType(data, "");
    }

    static String sourceType(Map<String, Object> data, String dataPath) {
        String source = text(data.get("sourceType"));
        String sourcePath = child(dataPath, "sourceType");
        String branch = BRANCHES.get(source);
        if (!data.containsKey("sourceType")) throw missing("agent.operation.data_patch_not_allowed",
                "数据配置缺少 sourceType", sourcePath, Map.of("allowedValues", BRANCHES.keySet().stream().sorted().toList()));
        if (branch == null) throw dataError("不支持的数据源类型", sourcePath, data.get("sourceType"),
                Map.of("allowedValues", BRANCHES.keySet().stream().sorted().toList()));
        for (String key : data.keySet()) if (!key.equals("sourceType") && !key.equals(branch))
            throw dataError("该数据源分支不能包含此字段", child(dataPath, key), data.get(key),
                    Map.of("allowedBranch", branch, "allowedFields", List.of("sourceType", branch)));
        if (!data.containsKey(branch)) throw missing("agent.operation.data_patch_not_allowed",
                "数据配置缺少与 sourceType 对应的分支对象", child(dataPath, branch), Map.of("type", "object", "sourceType", source));
        var fields = object(data.get(branch), child(dataPath, branch));
        if (fields.isEmpty()) throw dataError("数据源配置不能是空对象", child(dataPath, branch), fields,
                "至少提供一个该数据源支持的配置字段");
        for (var field : fields.entrySet()) validateSourceField(source, branch, field.getKey(), field.getValue(), dataPath);
        if (source.equals("static") && !fields.containsKey("value"))
            throw dataError("静态数据缺少 value", child(dataPath, "staticData.value"), null, "必须提供静态数据值");
        scanData(data, dataPath.isBlank() ? "dataPatch" : dataPath);
        return source;
    }

    private static void validateSourceField(String source, String branch, String key, Object value, String dataPath) {
        String localPath = child(child(dataPath, branch), key);
        Object expected = expectedSourceField(source, key);
        boolean valid = switch (source + "." + key) {
            case "static.value" -> true;
            case "api.url", "api.method", "commonApi.commonApiId", "database.targetDb", "database.sql", "globalVariable.gvId",
                    "webSocket.url", "webSocket.protocols", "mqtt.host", "mqtt.path", "mqtt.clientId", "mqtt.username", "mqtt.topics" -> value instanceof String;
            case "api.headers", "api.params" -> value instanceof Map<?, ?>;
            case "api.autoFlush", "commonApi.autoFlush", "database.autoFlush", "mqtt.clean" -> value instanceof Boolean;
            case "api.frequency", "commonApi.frequency", "database.frequency", "mqtt.port", "mqtt.connectTimeout", "mqtt.keepalive",
                    "mqtt.reconnectPeriod", "mqtt.protocolVersion" -> finite(value);
            case "mqtt.qos" -> finite(value) && ((Number) value).doubleValue() == ((Number) value).intValue()
                    && ((Number) value).intValue() >= 0 && ((Number) value).intValue() <= 2;
            default -> false;
        };
        if (source.equals("api") && key.equals("method") && !(value instanceof String method && Set.of("get", "post", "put", "delete").contains(method))) valid = false;
        if (!valid) throw dataError("数据源字段不存在，或当前值不符合字段约束", localPath, value, expected);
    }

    private static Object expectedSourceField(String source, String key) {
        if (source.equals("api") && key.equals("method")) return Map.of("type", "string", "allowedValues", List.of("get", "post", "put", "delete"));
        if (source.equals("mqtt") && key.equals("qos")) return Map.of("type", "integer", "min", 0, "max", 2);
        String contract = source + "." + key;
        if (Set.of("api.headers", "api.params").contains(contract)) return Map.of("type", "object");
        if (Set.of("api.autoFlush", "commonApi.autoFlush", "database.autoFlush", "mqtt.clean").contains(contract)) return Map.of("type", "boolean");
        if (Set.of("api.frequency", "commonApi.frequency", "database.frequency", "mqtt.port", "mqtt.connectTimeout", "mqtt.keepalive",
                "mqtt.reconnectPeriod", "mqtt.protocolVersion").contains(contract)) return Map.of("type", "finite number");
        if (Set.of("api.url", "api.method", "commonApi.commonApiId", "database.targetDb", "database.sql", "globalVariable.gvId",
                "webSocket.url", "webSocket.protocols", "mqtt.host", "mqtt.path", "mqtt.clientId", "mqtt.username", "mqtt.topics").contains(contract))
            return Map.of("type", "string");
        return Map.of("allowedFields", sourceFields(source));
    }

    private static List<String> sourceFields(String source) {
        return switch (source) {
            case "static" -> List.of("value");
            case "api" -> List.of("url", "method", "headers", "params", "frequency", "autoFlush");
            case "database" -> List.of("targetDb", "sql", "frequency", "autoFlush");
            case "commonApi" -> List.of("commonApiId", "frequency", "autoFlush");
            case "globalVariable" -> List.of("gvId");
            case "webSocket" -> List.of("url", "protocols");
            case "mqtt" -> List.of("host", "path", "clientId", "username", "topics", "port", "connectTimeout", "keepalive", "reconnectPeriod", "protocolVersion", "qos", "clean");
            default -> List.of();
        };
    }

    private static String child(String parent, String key) { return parent == null || parent.isBlank() ? key : parent + "." + key; }

    static void normalizeContractRequest(Map<String, Object> request) {
        Object rawIds = request.get("componentIds");
        if (!(rawIds instanceof List<?> raw))
            throw error("agent.evidence.data_contract_invalid", "componentIds 必须是组件 ID 字符串数组", "componentIds", rawIds,
                    Map.of("type", "array", "itemType", "string"));
        for (int i = 0; i < raw.size(); i++) if (!(raw.get(i) instanceof String))
            throw error("agent.evidence.data_contract_invalid", "组件 ID 必须是字符串", "componentIds[" + i + "]", raw.get(i), "string");
        var ids = raw.stream().map(AiAgentDataValidation::text).filter(id -> !id.isEmpty()).distinct().toList();
        String source = request.get("sourceType") == null ? "static" : text(request.get("sourceType"));
        if (ids.isEmpty() || ids.size() > 4)
            throw error("agent.evidence.data_contract_invalid", "数据说明书查询必须包含 1–4 个不同组件 ID", "componentIds", raw,
                    Map.of("type", "array<string>", "minItems", 1, "maxItems", 4, "uniqueItems", true));
        if (!BRANCHES.containsKey(source))
            throw error("agent.evidence.data_contract_invalid", "不支持的数据源类型", "sourceType", request.get("sourceType"),
                    Map.of("allowedValues", BRANCHES.keySet().stream().sorted().toList()));
        request.put("componentIds", ids); request.put("sourceType", source);
    }

    static void verifyContract(Map<String, Object> request, Map<String, Object> response) {
        var normalized = new LinkedHashMap<>(request); normalizeContractRequest(normalized);
        String source = text(normalized.get("sourceType"));
        Object rawContract = response.get("sourceContract");
        if (!(rawContract instanceof Map<?, ?> contractMap))
            throw error("agent.evidence.data_contract_invalid", "数据说明书缺少 sourceContract 对象", "sourceContract", rawContract, "object");
        var sourceContract = ComponentDocumentParser.cast(contractMap);
        if (!"component-data-contract/v1".equals(response.get("schemaVersion")))
            throw error("agent.evidence.data_contract_invalid", "数据说明书版本不受支持", "schemaVersion", response.get("schemaVersion"), "component-data-contract/v1");
        if (!Objects.equals(source, sourceContract.get("sourceType")))
            throw error("agent.evidence.data_contract_invalid", "数据说明书 sourceType 与查询不一致", "sourceContract.sourceType",
                    sourceContract.get("sourceType"), source);
        String expectedBranch = BRANCHES.get(source);
        if (!Objects.equals(expectedBranch, sourceContract.get("branch")))
            throw error("agent.evidence.data_contract_invalid", "数据说明书分支与 sourceType 不一致", "sourceContract.branch",
                    sourceContract.get("branch"), expectedBranch);
        if (!(sourceContract.get("structure") instanceof Map<?, ?>))
            throw error("agent.evidence.data_contract_invalid", "sourceContract.structure 必须是对象", "sourceContract.structure",
                    sourceContract.get("structure"), "object");

        List<?> requested = (List<?>) normalized.get("componentIds");
        Object rawComponents = response.get("components");
        if (!(rawComponents instanceof List<?> components))
            throw error("agent.evidence.data_contract_invalid", "数据说明书缺少 components 数组", "components", rawComponents, "array<object>");
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < components.size(); index++) {
            Object raw = components.get(index);
            String prefix = "components[" + index + "]";
            if (!(raw instanceof Map<?, ?> rawComponent))
                throw error("agent.evidence.data_contract_invalid", "组件数据说明必须是对象", prefix, raw, "object");
            var component = ComponentDocumentParser.cast(rawComponent);
            String id = text(component.get("componentId"));
            if (id.isEmpty()) throw error("agent.evidence.data_contract_invalid", "组件数据说明缺少 componentId", prefix + ".componentId",
                    component.get("componentId"), "non-empty string");
            if (!requested.contains(id)) throw error("agent.evidence.data_contract_invalid", "组件 ID 未包含在本次查询中", prefix + ".componentId",
                    id, Map.of("requestedComponentIds", requested));
            if (!seen.add(id)) throw error("agent.evidence.data_contract_invalid", "组件数据说明重复返回该组件", prefix + ".componentId", id, "unique component ID");
            String type = text(component.get("componentType"));
            if (type.isEmpty()) throw error("agent.evidence.data_contract_invalid", "组件数据说明缺少 componentType", prefix + ".componentType",
                    component.get("componentType"), "non-empty string");
            if (!(component.get("supportsDataInput") instanceof Boolean supports))
                throw error("agent.evidence.data_contract_invalid", "supportsDataInput 必须是布尔值", prefix + ".supportsDataInput",
                        component.get("supportsDataInput"), "boolean").withComponentContext(id, type, prefix + ".supportsDataInput");
            String requirements = text(component.get("dataFormatRequirements"));
            String requiredSentence = "该组件" + (supports ? "支持" : "不支持") + "通过 `dataPatch` 修改数据。";
            if (!requirements.contains(requiredSentence))
                throw error("agent.evidence.data_contract_invalid", "dataFormatRequirements 与 supportsDataInput 不一致", prefix + ".dataFormatRequirements",
                        shortText(component.get("dataFormatRequirements")), Map.of("mustContain", requiredSentence))
                        .withComponentContext(id, type, prefix + ".dataFormatRequirements");
            try {
                object(component.get("currentData"), prefix + ".currentData");
                validateMapping(object(component.get("fieldMapping"), prefix + ".fieldMapping"), prefix + ".fieldMapping");
            } catch (Violation violation) {
                throw violation.withComponentContext(id, type,
                        violation.path.startsWith(prefix) ? violation.path : prefix + "." + violation.path);
            }
        }
        Object missing = response.getOrDefault("missingComponentIds", List.of());
        if (!(missing instanceof List<?> ids))
            throw error("agent.evidence.data_contract_invalid", "missingComponentIds 必须是组件 ID 数组", "missingComponentIds", missing,
                    "array<string>");
        for (int index = 0; index < ids.size(); index++) {
            Object id = ids.get(index);
            if (!(id instanceof String key)) throw error("agent.evidence.data_contract_invalid", "missingComponentIds 项必须是字符串",
                    "missingComponentIds[" + index + "]", id, "string");
            if (!requested.contains(key)) throw error("agent.evidence.data_contract_invalid", "缺失列表包含未请求的组件 ID",
                    "missingComponentIds[" + index + "]", key, Map.of("requestedComponentIds", requested));
            if (!seen.add(key)) throw error("agent.evidence.data_contract_invalid", "组件 ID 同时出现在 components 和 missingComponentIds 中",
                    "missingComponentIds[" + index + "]", key, "ID absent from components");
        }
        if (!seen.equals(new HashSet<>(requested))) {
            var absent = new TreeSet<String>();
            requested.forEach(id -> absent.add(Objects.toString(id)));
            absent.removeAll(seen);
            throw error("agent.evidence.data_contract_invalid", "数据说明书遗漏请求的组件", "components", absent,
                    Map.of("mustIncludeComponentIds", requested));
        }
    }

    private static Object shortText(Object value) {
        if (!(value instanceof String text)) return value;
        return text.length() > 160 ? text.substring(0, 160) + "…" : text;
    }

    static void validateChange(String id, String type, Object dataPatch, Map<String, Object> style, Map<String, Object> contract) {
        validateChange(id, type, dataPatch, style, contract, "dataPatch", "stylePatch.style");
    }

    static void validateChange(String id, String type, Object dataPatch, Map<String, Object> style,
                               Map<String, Object> contract, String dataPatchPath, String stylePath) {
        if (contract.isEmpty()) throw error("agent.operation.component_data_contract_required",
                "修改组件数据或字段映射前必须先读取 get_component_data_contract", "componentId", id,
                Map.of("requiredTool", "get_component_data_contract", "componentId", id)).withComponentContext(id, type, "componentId");
        if (!type.equals(contract.get("componentType")))
            throw error("agent.operation.component_data_contract_type_mismatch", "数据说明书中的组件类型与目标组件不一致",
                    "componentType", contract.get("componentType"), type).withComponentContext(id, type, "componentType");
        if (!Boolean.TRUE.equals(contract.get("supportsDataInput")))
            throw dataError("该组件不支持数据或字段映射修改", dataPatchPath, contract.get("supportsDataInput"), true)
                    .withComponentContext(id, type, dataPatchPath);
        Object finalValue = object(contract.get("currentData"), "currentData").get("valueExample");
        boolean checkMapping = hasMapping(style) && dataPatch == null;
        if (dataPatch != null) {
            var patch = object(dataPatch, dataPatchPath);
            String source = sourceType(patch, dataPatchPath);
            if (!source.equals(contract.get("contractSourceType")))
                throw error("agent.operation.component_data_contract_source_mismatch",
                        "dataPatch.sourceType 与最近读取的数据说明书不一致", child(dataPatchPath, "sourceType"), source,
                        Objects.toString(contract.get("contractSourceType"), "missing"))
                        .withComponentContext(id, type, child(dataPatchPath, "sourceType"));
            if (source.equals("static")) {
                finalValue = object(patch.get("staticData"), child(dataPatchPath, "staticData")).get("value");
                checkMapping = true;
            }
        }
        var mapping = new LinkedHashMap<>(object(contract.get("fieldMapping"), "fieldMapping"));
        for (String key : MAPPING_KEYS) if (style.containsKey(key)) mapping.put(key, style.get(key));
        validateMapping(mapping, stylePath);
        if (checkMapping) validateMappingAgainstData(mapping, finalValue,
                dataPatch == null ? "currentData.valueExample" : child(dataPatchPath, "staticData.value"), stylePath);
    }

    static void validateCreate(String type, Map<String, Object> config, boolean supports, Set<String> mappingFields, boolean defaults) {
        validateCreate(type, config, supports, mappingFields, defaults, "config");
    }

    static void validateCreate(String type, Map<String, Object> config, boolean supports, Set<String> mappingFields,
                               boolean defaults, String configPath) {
        String dataPath = child(configPath, "data"), stylePath = child(configPath, "style");
        if (supports && defaults) throw error("agent.operation.data_component_default_config_forbidden",
                "数据组件创建时必须提供实际数据配置", "useDefaultConfig", true, false);
        if (supports && !config.containsKey("data"))
            throw missing("agent.operation.create_data_required", "该数据组件缺少实际数据配置", dataPath,
                    Map.of("required", true, "type", "object"));
        if (!config.containsKey("data")) return;
        if (!supports) throw dataError("该组件不支持 config.data", dataPath, config.get("data"), "omit config.data");
        var data = object(config.get("data"), dataPath);
        String source = sourceType(data, dataPath);
        var style = config.containsKey("style") ? object(config.get("style"), stylePath) : Map.<String, Object>of();
        if (!mappingFields.isEmpty() && mappingFields.stream().noneMatch(style::containsKey))
            throw error("agent.operation.create_field_mapping_required", "图表缺少数据字段映射", stylePath, style,
                    Map.of("atLeastOneOf", mappingFields.stream().sorted().toList()));
        if (source.equals("static")) {
            Object value = object(data.get("staticData"), child(dataPath, "staticData")).get("value");
            if (value == null || value instanceof String s && s.isBlank() || value instanceof List<?> l && l.isEmpty() || value instanceof Map<?, ?> m && m.isEmpty())
                throw error("agent.operation.create_static_data_empty", "创建组件需要非空 staticData.value",
                        child(dataPath, "staticData.value"), value, "non-empty static data value");
            if (type.equals("BaseText") && !(value instanceof String s && !s.isBlank()))
                throw error("agent.operation.create_text_data_invalid", "BaseText 的 staticData.value 必须是非空文本",
                        child(dataPath, "staticData.value"), value, "non-empty string");
            var mapping = new LinkedHashMap<String, Object>(); style.forEach((key, val) -> {if (MAPPING_KEYS.contains(key)) mapping.put(key, val);});
            validateMapping(mapping, stylePath);
            validateMappingAgainstData(mapping, value, child(dataPath, "staticData.value"), stylePath);
        }
    }

    static boolean hasMapping(Map<String, Object> style) {return style.keySet().stream().anyMatch(MAPPING_KEYS::contains);}

    private static void validateMapping(Map<String, Object> mapping, String stylePath) {
        for (var entry : mapping.entrySet()) {
            String path = child(stylePath, entry.getKey());
            if (!MAPPING_KEYS.contains(entry.getKey()))
                throw dataError("不支持该数据映射字段", path, entry.getKey(), Map.of("allowedFields", MAPPING_KEYS.stream().sorted().toList()));
            if (!(entry.getValue() instanceof String value) || value.isBlank())
                throw dataError("数据映射值必须是非空字符串", path, entry.getValue(), "non-empty string");
        }
    }

    private static void validateMappingAgainstData(Map<String, Object> mapping, Object value,
                                                   String valuePath, String stylePath) {
        if (mapping.isEmpty()) return;
        List<?> rows = value instanceof List<?> list ? list : Collections.singletonList(value);
        for (int i = 0; i < rows.size(); i++) {
            String rowPath = valuePath + (value instanceof List<?> ? "[" + i + "]" : "");
            if (!(rows.get(i) instanceof Map<?, ?> row))
                throw dataError("启用了字段映射的数据必须是对象或对象数组", rowPath, rows.get(i),
                        Map.of("allowedTypes", List.of("object", "array<object>")));
            for (var field : mapping.entrySet()) {
                Object property = field.getValue();
                if (!row.containsKey(property)) {
                    String path = rowPath + "." + property;
                    throw missing("agent.operation.data_patch_not_allowed", "数据记录缺少字段映射指向的属性", path,
                            Map.of("required", true, "mappingField", child(stylePath, field.getKey()), "mappedProperty", property))
                            .withComponentContext(null, null, path);
                }
            }
        }
    }

    static boolean finite(Object value) {return value instanceof Number n && Double.isFinite(n.doubleValue());}
    static String text(Object value) {return value instanceof String s ? s.trim() : "";}
    private static boolean sensitive(String key) {
        return key.contains("password") || key.contains("token") || key.contains("secret") || key.contains("authorization")
                || key.contains("cookie") || key.contains("credential") || key.endsWith("key") || key.contains("-key") || key.contains("_key");
    }
    static boolean dangerous(String key) {return Set.of("__proto__", "constructor", "prototype").contains(key);}
    static void scanData(Object value, String path) {
        if (value instanceof Map<?, ?> map) for (var entry : map.entrySet()) {
            String key = entry.getKey().toString().trim().toLowerCase(Locale.ROOT);
            if (dangerous(key) || sensitive(key))
                throw dataError("禁止危险或敏感字段", path + "." + key, "[字段名已定位，值不回显]", "字段名不得包含危险属性或凭据");
            scanData(entry.getValue(), path + "." + entry.getKey());
        } else if (value instanceof List<?> list) for (int i = 0; i < list.size(); i++) scanData(list.get(i), path + "[" + i + "]");
        else if (value instanceof String s) {
            String text = s.trim();
            if (Set.of("undefined", "NaN", "Infinity").contains(text) || text.startsWith("function ") || text.startsWith("async function ")
                    || text.contains("=>") || text.contains("${") || text.contains("#{"))
                throw dataError("静态数据不能包含函数、表达式或非 JSON 字面量", path, "[表达式内容已省略]", "JSON literal");
            if (path.endsWith(".url")) {
                String authority = text.contains("://") ? text.substring(text.indexOf("://") + 3).split("[/?#]", 2)[0] : "";
                String query = text.contains("?") ? text.substring(text.indexOf('?') + 1).split("#", 2)[0] : "";
                if (authority.contains("@") || Arrays.stream(query.split("&")).map(part -> part.split("=", 2)[0].trim().toLowerCase(Locale.ROOT)).anyMatch(AiAgentDataValidation::sensitive))
                    throw dataError("URL 包含认证信息", path, "[URL内容已省略，避免回显认证信息]", "不包含用户名、密码或凭据查询参数的 URL");
            }
        } else if (value instanceof Number && !finite(value))
            throw dataError("数值必须是有限数", path, value, "finite number");
    }
}
