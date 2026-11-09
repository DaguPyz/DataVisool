/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

/** 每次读取后临时解析；不持有正文或解析缓存。 */
public final class ComponentDocumentParser {
    public static final int FILE_LIMIT = 256 * 1024;
    private static final Set<String> MAPPING = Set.of("xField", "yField", "seriesField", "angleField", "colorField",
            "sizeField", "shapeField", "wordField", "weightField", "groupField");
    private static final Pattern BLOCK = Pattern.compile("```json\\s*([\\s\\S]*?)```");

    public static final class DocumentException extends RuntimeException {
        public final String code;
        public final String fieldPath, componentId, componentType, documentPath, section, source, documentType;
        public final Integer line, column;
        private final String baseMessage;
        private final Object actualValue, expected;
        private final boolean actualProvided;
        DocumentException(String code, String message, String fieldPath, Object actualValue, Object expected,
                          boolean actualProvided, Integer line, Integer column, String componentId, String componentType,
                          String documentPath, String section, String source, String documentType) {
            super(format(message, fieldPath, actualValue, expected, line, column, componentId, componentType,
                    documentPath, section, source, documentType));
            this.code = "agent.component_specs." + code;
            this.baseMessage = message;
            this.fieldPath = fieldPath;
            this.actualValue = actualValue;
            this.actualProvided = actualProvided;
            this.expected = expected;
            this.line = line;
            this.column = column;
            this.componentId = componentId;
            this.componentType = componentType;
            this.documentPath = documentPath;
            this.section = section;
            this.source = source;
            this.documentType = documentType;
        }

        DocumentException withDocumentContext(String componentId, String componentType, String documentPath) {
            return withDocumentContext(componentId, componentType, documentPath, null, null);
        }

        DocumentException withDocumentContext(String componentId, String componentType, String documentPath,
                                              String source, String documentType) {
            if ((this.componentId != null || this.componentType != null || this.documentPath != null)
                    && Objects.equals(this.componentId, componentId) && Objects.equals(this.componentType, componentType)
                    && Objects.equals(this.documentPath, documentPath) && Objects.equals(this.source, source)
                    && Objects.equals(this.documentType, documentType)) return this;
            return new DocumentException(code.substring("agent.component_specs.".length()), baseMessage,
                    fieldPath, actualValue, expected, actualProvided, line, column,
                    this.componentId == null ? componentId : this.componentId,
                    this.componentType == null ? componentType : this.componentType,
                    this.documentPath == null ? documentPath : this.documentPath, section,
                    this.source == null ? source : this.source,
                    this.documentType == null ? documentType : this.documentType);
        }

        DocumentException withSectionContext(String section) {
            if (section == null || section.isBlank() || Objects.equals(this.section, section)) return this;
            return new DocumentException(code.substring("agent.component_specs.".length()), baseMessage,
                    fieldPath, actualValue, expected, actualProvided, line, column, componentId, componentType,
                    documentPath, section, source, documentType);
        }

        /** Structured details used by the tool response so the Agent can locate and correct the document error. */
        public Map<String, Object> result() {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("code", code);
            result.put("message", getMessage());
            result.put("reason", baseMessage);
            if (componentId != null) result.put("componentId", componentId);
            if (componentType != null) result.put("componentType", componentType);
            if (documentType != null) result.put("documentType", documentType);
            if (source != null) result.put("source", source);
            if (documentPath != null) result.put("path", documentPath);
            if (section != null) result.put("section", section);
            if (fieldPath != null) result.put("fieldPath", fieldPath);
            if (line != null) result.put("parseLine", line);
            if (column != null) result.put("parseColumn", column);
            result.put("actualValue", actualProvided ? AiAgentErrorFeedback.safeValue(fieldPath, actualValue) : "[missing]");
            result.put("actualType", actualProvided ? AiAgentErrorFeedback.type(actualValue) : "missing");
            result.put("expected", AiAgentDebugTrace.redact(expected));
            return result;
        }

        private static String format(String message, String fieldPath, Object actualValue, Object expected,
                                     Integer line, Integer column, String componentId, String componentType,
                                     String documentPath, String section, String source, String documentType) {
            StringBuilder result = new StringBuilder(message);
            if (componentId != null) result.append("；componentId=").append(componentId);
            if (componentType != null) result.append("；componentType=").append(componentType);
            if (source != null) result.append("；source=").append(source);
            if (documentType != null) result.append("；documentType=").append(documentType);
            if (documentPath != null) result.append("；documentPath=").append(documentPath);
            if (section != null) result.append("；section=").append(section);
            if (fieldPath != null) result.append("；fieldPath=").append(fieldPath);
            if (line != null) result.append("；line=").append(line);
            if (column != null) result.append("；column=").append(column);
            if (actualValue != null) result.append("；actualValue=").append(JSON.toJSONString(AiAgentErrorFeedback.safeValue(fieldPath, actualValue)));
            if (expected != null) result.append("；expected=").append(JSON.toJSONString(AiAgentDebugTrace.redact(expected)));
            return result.toString();
        }
    }
    public static DocumentException invalid(String code, String message) {
        return invalid(code, message, null, null, null, false, null, null, null);
    }
    static DocumentException invalid(String code, String message, String fieldPath, Object actual, Object expected) {
        return invalid(code, message, fieldPath, actual, expected, true, null, null, null);
    }
    private static DocumentException invalid(String code, String message, String fieldPath, Object actual, Object expected,
                                             Integer line, Integer column, String section) {
        return invalid(code, message, fieldPath, actual, expected, actual != null, line, column, section);
    }
    private static DocumentException invalid(String code, String message, String fieldPath, Object actual, Object expected,
                                             boolean actualProvided, Integer line, Integer column, String section) {
        return new DocumentException(code, message, fieldPath, actual, expected, actualProvided, line, column,
                null, null, null, section, null, null);
    }
    public static String hash(byte[] bytes) {
        try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
        catch (Exception e) {throw new IllegalStateException(e);}
    }
    public static String hash(String value) {return hash(value.getBytes(StandardCharsets.UTF_8));}

    public static Map<String, Map<String, Integer>> sections(String content) {
        String[] lines = content.split("\\r?\\n", -1);
        record Heading(String title, int level, int line) {}
        List<Heading> headings = new ArrayList<>(); boolean fenced = false;
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("```")) {fenced = !fenced; continue;}
            if (fenced) continue;
            var match = Pattern.compile("^(#{2,6}) (.+)$").matcher(lines[i]);
            if (match.matches()) headings.add(new Heading(match.group(2).trim(), match.group(1).length(), i + 1));
        }
        Map<String, Map<String, Integer>> result = new LinkedHashMap<>();
        for (int i = 0; i < headings.size(); i++) {
            var h = headings.get(i); int end = lines.length;
            for (int j = i + 1; j < headings.size(); j++) if (headings.get(j).level <= h.level) {end = headings.get(j).line - 1; break;}
            if (result.put(h.title, Map.of("startLine", h.line, "endLine", end)) != null)
                throw invalid("document_unavailable", "文档章节名称重复", "sections." + h.title,
                        h.title, Map.of("unique", true), h.line, 1, h.title);
        }
        return result;
    }
    public static String section(String content, String title) {
        var range = sections(content).get(title);
        if (range == null) throw invalid("document_unavailable", "文档缺少必需章节", "sections." + title,
                "[missing]", Map.of("heading", title, "acceptedLevels", "## through ######"), null, null, title);
        String[] lines = content.split("\\r?\\n", -1);
        return String.join("\n", Arrays.copyOfRange(lines, range.get("startLine"), range.get("endLine"))).trim();
    }
    private static int sectionContentLine(String content, String title) {
        var range = sections(content).get(title);
        if (range == null) throw invalid("document_unavailable", "文档缺少必需章节", "sections." + title,
                "[missing]", Map.of("heading", title, "acceptedLevels", "## through ######"), null, null, title);
        return range.get("startLine") + 1;
    }
    private static Map<String, Object> sectionJson(String content, String title) {
        return firstJson(section(content, title), sectionContentLine(content, title), title);
    }
    static List<Map<String, Object>> jsonBlocks(String content) {
        return jsonBlocks(content, 1, null);
    }
    static List<Map<String, Object>> jsonBlocks(String content, int baseLine, String section) {
        List<Map<String, Object>> blocks = new ArrayList<>(); var match = BLOCK.matcher(content); int blockIndex = 0;
        while (match.find()) {
            blockIndex++;
            try {
                Object value = JSON.parse(match.group(1));
                if (!(value instanceof Map<?, ?> map))
                    throw invalid("document_unavailable", "JSON 代码块必须解析为对象", "jsonBlock[" + blockIndex + "]",
                            value, "object", baseLine + countLines(content, match.start(1)), 1, section);
                blocks.add(cast(map));
            } catch (DocumentException e) { throw e; }
            catch (RuntimeException e) {
                int line = baseLine + countLines(content, match.start(1));
                int column = 1;
                Matcher location = Pattern.compile("(?i)line\\s+(\\d+)\\s*,\\s*column\\s+(\\d+)").matcher(Objects.toString(e.getMessage(), ""));
                if (location.find()) {
                    line += Integer.parseInt(location.group(1)) - 1;
                    column = Integer.parseInt(location.group(2));
                }
                String cause = Objects.toString(e.getMessage(), e.getClass().getSimpleName());
                if (cause.length() > 240) cause = cause.substring(0, 240) + "…";
                throw invalid("document_unavailable", "组件文档 JSON 解析失败：" + cause,
                        "jsonBlock[" + blockIndex + "]", "[invalid JSON block]", "valid JSON object",
                        line, column, section);
            }
        }
        return blocks;
    }
    private static int countLines(String content, int end) {
        int lines = 0;
        for (int i = 0; i < end && i < content.length(); i++) if (content.charAt(i) == '\n') lines++;
        return lines;
    }
    static Map<String, Object> firstJson(String content) {
        var blocks = jsonBlocks(content);
        if (blocks.isEmpty()) throw invalid("document_unavailable", "组件章节缺少 JSON 对象", "jsonBlock[1]",
                "[missing]", "fenced JSON object");
        return blocks.get(0);
    }
    static Map<String, Object> firstJson(String content, int baseLine, String section) {
        var blocks = jsonBlocks(content, baseLine, section);
        if (blocks.isEmpty()) throw invalid("document_unavailable", "组件章节缺少 JSON 对象", "jsonBlock[1]",
                "[missing]", "fenced JSON object", baseLine, 1, section);
        return blocks.get(0);
    }
    @SuppressWarnings("unchecked")
    static Map<String, Object> cast(Map<?, ?> value) {return (Map<String, Object>) value;}

    public static Map<String, Object> describe(String content, String fileName) {
        int documentBytes = content.getBytes(StandardCharsets.UTF_8).length;
        if (documentBytes > FILE_LIMIT) throw invalid("output_limit_exceeded", "文档超过 256 KiB", "documentBytes",
                documentBytes, Map.of("maxBytes", FILE_LIMIT));
        Map<String, Object> identity = sectionJson(content, "组件标识");
        Map<String, Object> selection = sectionJson(content, "组件选择");
        Object rawType = identity.get("componentType");
        if (!(rawType instanceof String type) || !type.matches("[A-Za-z][A-Za-z0-9_-]{0,127}"))
            throw invalid("document_unavailable", "组件标识.componentType 格式无效", "组件标识.componentType", rawType,
                    "1–128 characters: letter followed by letters, digits, '_' or '-'");
        if (!fileName.equals(type + ".md"))
            throw invalid("document_unavailable", "文档文件名与组件类型不一致", "fileName", fileName, type + ".md");
        if (!type.equals(selection.get("componentType")))
            throw invalid("document_unavailable", "组件选择.componentType 与组件标识不一致", "组件选择.componentType",
                    selection.get("componentType"), type);
        if (!(identity.get("componentName") instanceof String name) || name.isBlank())
            throw invalid("document_unavailable", "组件标识.componentName 必须是非空字符串", "组件标识.componentName",
                    identity.get("componentName"), "non-empty string");
        if (!(selection.get("description") instanceof String description) || description.isBlank())
            throw invalid("document_unavailable", "组件选择.description 必须是非空字符串", "组件选择.description",
                    selection.get("description"), "non-empty string");
        if (!(selection.get("nativeCapabilities") instanceof String capabilities) || capabilities.isBlank())
            throw invalid("document_unavailable", "组件选择.nativeCapabilities 必须是非空字符串", "组件选择.nativeCapabilities",
                    selection.get("nativeCapabilities"), "non-empty string");
        var chapters = sections(content); boolean full = chapters.containsKey("完整规格");
        Set<String> refs = new TreeSet<>();
        jsonBlocks(content, 1, null);
        if (full) {
            var spec = fullSpec(content, "create"); collectReferences(spec.get("configurable"), refs, "configurable");
            var rules = sectionJson(content, "校验规则");
            if (!type.equals(rules.get("componentType")))
                throw invalid("document_unavailable", "校验规则.componentType 与文档组件类型不一致", "校验规则.componentType",
                        rules.get("componentType"), type);
            if (!(rules.get("allowedStylePaths") instanceof List<?>))
                throw invalid("document_unavailable", "校验规则缺少 allowedStylePaths 数组", "校验规则.allowedStylePaths",
                        rules.get("allowedStylePaths"), "array<object>");
        }
        selection.put("selectable", full && !Boolean.FALSE.equals(selection.get("selectable")));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("componentType", type); result.put("componentName", identity.get("componentName"));
        result.put("componentInfo", selection); result.put("hasFullSpec", full); result.put("sections", chapters);
        result.put("sha256", hash(content)); result.put("bytes", content.getBytes(StandardCharsets.UTF_8).length);
        result.put("fragmentRefs", new ArrayList<>(refs)); result.put("documentFormatVersion", "component-document/v1");
        return result;
    }

    public static Map<String, Object> fullSpec(String content, String intent) {
        String type = String.valueOf(sectionJson(content, "组件标识").get("componentType"));
        String fields = section(content, "配置字段"), requirements = section(content, "数据要求"), notes = section(content, "限制与校验");
        var configurable = firstJson(fields, sectionContentLine(content, "配置字段"), "配置字段");
        if (!(configurable.get("style") instanceof Map<?, ?> map) || map.isEmpty())
            throw invalid("document_unavailable", "配置字段.style 必须是非空对象", "配置字段.style",
                    configurable.get("style"), "non-empty object");
        var style = cast(map);
        boolean supportsData = supportsDataInput(requirements);
        var mapping = mappingFields(requirements);
        mapping.forEach(field -> style.putIfAbsent(field, "string，必须与实际数据记录的属性名一致"));
        Map<String, Object> config = new LinkedHashMap<>();
        if (supportsData) {
            var data = dataExample(requirements, sectionContentLine(content, "数据要求")); config.put("data", data);
            List<String> keys = new ArrayList<>();
            if (data.get("staticData") instanceof Map<?, ?> staticData && staticData.get("value") instanceof List<?> rows
                    && !rows.isEmpty() && rows.get(0) instanceof Map<?, ?> row) keys.addAll(row.keySet().stream().map(Object::toString).sorted().toList());
            Map<String, Object> mapped = new LinkedHashMap<>(); int i = 0;
            for (String field : mapping) {
                int index = field.equals("yField") || field.equals("weightField") ? 1 : i; i++;
                mapped.put(field, keys.size() > index ? keys.get(index) : keys.isEmpty() ? "field" : keys.get(0));
            }
            if (!mapped.isEmpty()) config.put("style", mapped);
        } else {
            var styles = jsonBlocks(notes, sectionContentLine(content, "限制与校验"), "限制与校验").stream().map(value -> {
                Object patch = value.get("stylePatch"); if (!(patch instanceof Map<?, ?>)) patch = value.get("config");
                return patch instanceof Map<?, ?> p && p.get("style") instanceof Map<?, ?> s ? cast(s) : null;
            }).filter(Objects::nonNull).sorted(Comparator.comparingInt(value -> JSON.toJSONBytes(value).length)).toList();
            if (!styles.isEmpty() && !styles.get(0).isEmpty()) config.put("style", styles.get(0));
        }
        Map<String, Object> example = new LinkedHashMap<>();
        if ("create".equals(intent)) example.put("config", config);
        else {if (config.containsKey("style")) example.put("stylePatch", Map.of("style", config.get("style")));
            if (config.containsKey("data")) example.put("dataPatch", config.get("data"));}
        List<String> constraints = new ArrayList<>();
        for (String prose : BLOCK.matcher(fields).replaceAll("").trim().split("。"))
            if (Pattern.compile("false|null|只能|不得|不包含").matcher(prose).find()) constraints.add(prose.trim() + "。");
        var heading = Pattern.compile("^\\*\\*(.+)\\*\\*\\s*$", Pattern.MULTILINE).matcher(notes);
        List<String> titles = new ArrayList<>(); List<Integer> starts = new ArrayList<>(), ends = new ArrayList<>();
        while (heading.find()) {titles.add(heading.group(1).trim()); starts.add(heading.start()); ends.add(heading.end());}
        for (int j = 0; j < titles.size(); j++) {
            String title = titles.get(j); if (title.equals("通用限制") || title.equals("参考依据") || title.contains("示例")) continue;
            String body = notes.substring(ends.get(j), j + 1 < starts.size() ? starts.get(j + 1) : notes.length())
                    .replaceAll("(?m)^```(?:json)?\\s*$", "").trim();
            if (!body.isEmpty()) constraints.add(title + "：\n" + body);
        }
        Map<String, Object> result = new LinkedHashMap<>(); result.put("componentType", type); result.put("configurable", configurable);
        result.put("supportsDataInput", supportsData);
        result.put("dataRequirements", requirements);
        if (!constraints.isEmpty()) result.put("constraints", constraints);
        result.put("example", example); return result;
    }
    private static Map<String, Object> dataExample(String requirements, int baseLine) {
        for (String marker : List.of("静态数据示例：`", "最小数据示例：`")) {
            int start = requirements.indexOf(marker); if (start < 0) continue;
            int end = requirements.indexOf('`', start + marker.length());
            int line = baseLine + countLines(requirements, start);
            int column = start - Math.max(requirements.lastIndexOf('\n', start), requirements.lastIndexOf('\r', start));
            if (end < 0) throw invalid("document_unavailable", "静态数据示例缺少结束反引号", "数据要求.静态数据示例",
                    "[unterminated inline JSON]", "JSON example enclosed by backticks", line, column, "数据要求");
            String raw = requirements.substring(start + marker.length(), end);
            try {
                Object value = JSON.parse(raw);
                if (value instanceof Map<?, ?> map && map.containsKey("sourceType")) return cast(map);
                return Map.of("sourceType", "static", "staticData", Map.of("value", value));
            } catch (RuntimeException e) {
                String cause = Objects.toString(e.getMessage(), e.getClass().getSimpleName());
                if (cause.length() > 240) cause = cause.substring(0, 240) + "…";
                Matcher location = Pattern.compile("(?i)line\\s+(\\d+)\\s*,\\s*column\\s+(\\d+)").matcher(cause);
                int errorLine = line, errorColumn = column;
                if (location.find()) {errorLine += Integer.parseInt(location.group(1)) - 1; errorColumn = Integer.parseInt(location.group(2));}
                throw invalid("document_unavailable", "数据要求中的静态数据示例 JSON 解析失败：" + cause,
                        "数据要求.静态数据示例", "[invalid JSON example]", "valid JSON value",
                        errorLine, errorColumn, "数据要求");
            }
        }
        return Map.of("sourceType", "static", "staticData", Map.of("value", requirements.contains("对象数组")
                ? List.of(Map.of("category", "示例", "value", 1)) : 1));
    }
    static boolean supportsDataInput(String requirements) {
        boolean supported = requirements.contains("该组件支持通过 `dataPatch` 修改数据。");
        boolean unsupported = requirements.contains("该组件不支持通过 `dataPatch` 修改数据。");
        if (supported == unsupported) throw invalid("document_unavailable", "数据要求必须且只能声明一种 dataPatch 能力",
                "数据要求.dataPatchCapability", Map.of("supports", supported, "unsupported", unsupported),
                Map.of("mustDeclareExactlyOne", List.of("支持通过 dataPatch 修改数据", "不支持通过 dataPatch 修改数据")))
                .withSectionContext("数据要求");
        return supported;
    }
    static Set<String> mappingFields(String requirements) {
        var result = new TreeSet<String>();
        var matches = Pattern.compile("style\\.([a-zA-Z0-9_]+)").matcher(requirements);
        while (matches.find()) if (MAPPING.contains(matches.group(1))) result.add(matches.group(1));
        return result;
    }
    static void collectReferences(Object value, Set<String> refs, String path) {
        if (value instanceof String text) {
            if (text.matches("<g2plot-[a-z0-9-]+>")) refs.add(text);
            else if (text.trim().matches("(?is)^(<g2plot|g2plot-).*$"))
                throw invalid("common_fragments_invalid", "公共片段引用必须完整匹配", path, text,
                        "standalone tag matching <g2plot-[a-z0-9-]+>");
        } else if (value instanceof Map<?, ?> map) {
            map.forEach((key, child) -> collectReferences(child, refs, path + "." + key));
        } else if (value instanceof List<?> list) {
            for (int index = 0; index < list.size(); index++) collectReferences(list.get(index), refs, path + "[" + index + "]");
        }
    }
    public static void collectReferences(Object value, Set<String> refs) {
        if (value instanceof String text) {
            if (text.matches("<g2plot-[a-z0-9-]+>")) refs.add(text);
            else if (text.trim().matches("(?is)^(<g2plot|g2plot-).*")) throw invalid("common_fragments_invalid", "公共片段引用必须完整匹配：" + text);
        } else if (value instanceof Map<?, ?> map) map.values().forEach(child -> collectReferences(child, refs));
        else if (value instanceof List<?> list) list.forEach(child -> collectReferences(child, refs));
    }
    private ComponentDocumentParser() {}
}
