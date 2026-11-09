/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.mapper.RemoteComponentDocumentMapper;
import com.zsq.datavisoolservice.mapper.RemoteComponentMapper;
import com.zsq.datavisoolservice.model.po.RemoteComponentDocumentPO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import static com.zsq.datavisoolservice.service.impl.ai.ComponentDocumentParser.*;

/** 文件是正文的唯一存储。每次请求只持有当前请求所需的内容。 */
@Service
public class ComponentDocumentService {
    private static final int REMOTE_INDEX_LIMIT = 16 * 1024;
    private final Path root;
    private final boolean explicitRoot;
    private final RemoteComponentDocumentMapper documentMapper;
    private final RemoteComponentMapper componentMapper;
    private final Semaphore readers = new Semaphore(4, true);
    public ComponentDocumentService(@Value("${datavisool.component-docs.root:${DATAVISOOL_COMPONENT_DOCS_ROOT:}}") String configuredRoot,
                                    RemoteComponentDocumentMapper documentMapper, RemoteComponentMapper componentMapper) {
        this.root = locateRoot(configuredRoot);
        this.explicitRoot = configuredRoot != null && !configuredRoot.isBlank();
        this.documentMapper = documentMapper; this.componentMapper = componentMapper;
    }
    private static Path locateRoot(String configured) {
        if (configured != null && !configured.isBlank()) return Path.of(configured).toAbsolutePath().normalize();
        for (String candidate : List.of("component-docs", "target/component-docs", "datavisool-service/target/component-docs",
                "datavisool-server/datavisool-service/target/component-docs")) {
            Path path = Path.of(candidate).toAbsolutePath().normalize();
            if (Files.exists(path.resolve("current.json"))) return path;
        }
        for (String module : List.of(".", "datavisool-service", "datavisool-server/datavisool-service")) {
            Path directory = Path.of(module).toAbsolutePath().normalize();
            if (Files.isRegularFile(directory.resolve("pom.xml")) && Files.isDirectory(directory.resolve("src/main/java")))
                return directory.resolve("target/component-docs");
        }
        // 发布包的资料目录与 server.jar 放在一起。
        try {
            Path code = Path.of(ComponentDocumentService.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (Files.isRegularFile(code)) return code.getParent().resolve("component-docs");
            if (code.getFileName().toString().equals("classes")) return code.getParent().resolve("component-docs");
        } catch (Exception ignored) {}
        return Path.of("component-docs").toAbsolutePath().normalize();
    }
    public Path root() {return root;}
    public void verifyResultIdentities(Map<String, Object> result, Long userId) {
        guarded(() -> {verifyResultIdentitiesInternal(result, userId); return null;});
    }
    private void verifyResultIdentitiesInternal(Map<String, Object> result, Long userId) {
        if (!(result.get("specs") instanceof List<?> specs))
            throw invalid("result_invalid", "宿主规格结果缺少 specs 数组", "specs", result.get("specs"), "array<object>");
        for (int index = 0; index < specs.size(); index++) {
            Object value = specs.get(index);
            if (!(value instanceof Map<?, ?> rawSpec))
                throw invalid("result_invalid", "宿主规格项必须是对象", "specs[" + index + "]", value, "object");
            var spec = cast(rawSpec);
            var supplied = map(spec.get("documentIdentity"));
            if (!Objects.equals(supplied.get("componentType"), spec.get("componentType")) || supplied.isEmpty())
                throw invalid("result_invalid", "规格项缺少与 componentType 对应的 documentIdentity",
                        "specs[" + index + "].documentIdentity", spec.get("documentIdentity"),
                        Map.of("componentType", spec.get("componentType"), "required", true));
            String type = Objects.toString(spec.get("componentType"), "");
            Located located = null;
            try {
                located = verifyIdentity(supplied, userId);
                checkedFile(located.directory, located.document);
            } catch (DocumentException e) {
                throw context(e, null, type, located);
            }
        }
    }
    private Located verifyIdentity(Map<String, Object> supplied, Long userId) {
        var located = locate(String.valueOf(supplied.get("componentType")), Map.of("catalog", List.of(supplied)), userId);
        try {
            if (!identity(located.document).equals(supplied))
                throw invalid("version_mismatch", "提交的文档身份与服务端当前身份不一致", "documentIdentity",
                        supplied, Map.of("currentIdentity", identity(located.document)));
            if (!Boolean.TRUE.equals(located.document.get("hasFullSpec")))
                throw invalid("document_unavailable", "该组件没有完整规格章节", "hasFullSpec", false, true);
            return located;
        } catch (DocumentException e) {
            throw context(e, Objects.toString(supplied.get("componentId"), null),
                    Objects.toString(supplied.get("componentType"), null), located);
        }
    }
    /** 在成功回执中补入服务端从文档读取的数据能力，再验证实际查询范围。 */
    public Map<String, Object> verifyDataContractResult(Map<String, Object> request, Map<String, Object> result, Long userId) {
        return guarded(() -> {
            Map<String, Object> enriched = new LinkedHashMap<>(result); List<Map<String, Object>> components = new ArrayList<>();
            if (!(result.get("components") instanceof List<?> list))
                throw AiAgentDataValidation.error("agent.evidence.data_contract_invalid", "数据说明书缺少 components 数组", "components",
                        result.get("components"), "array<object>");
            for (int index = 0; index < list.size(); index++) {
                Object item = list.get(index);
                var component = new LinkedHashMap<>(AiAgentDataValidation.object(item, "components[" + index + "]"));
                var supplied = map(component.get("documentIdentity"));
                if (!Objects.equals(supplied.get("componentType"), component.get("componentType")))
                    throw invalid("version_mismatch", "数据说明书中的组件类型与文档身份不一致",
                            "components[" + index + "].documentIdentity.componentType",
                            supplied.get("componentType"), component.get("componentType"));
                String type = Objects.toString(component.get("componentType"), "");
                Located located = null;
                try {
                    located = verifyIdentity(supplied, userId);
                    String requirements = section(checkedFile(located.directory, located.document), "数据要求");
                    component.put("dataFormatRequirements", requirements);
                    component.put("supportsDataInput", supportsDataInput(requirements));
                    component.put("documentIdentity", identity(located.document)); components.add(component);
                } catch (DocumentException e) {
                    throw context(e, AiAgentDataValidation.text(component.get("componentId")), type, located);
                }
            }
            enriched.put("components", components); AiAgentDataValidation.verifyContract(request, enriched); return enriched;
        });
    }
    public List<Map<String, Object>> validateWrite(String operation, Map<String, Object> payload,
                                                   List<Map<String, Object>> evidence, Long userId) {
        return validateWrite(operation, payload, evidence, List.of(), userId);
    }
    public List<Map<String, Object>> validateWrite(String operation, Map<String, Object> payload,
                                                   List<Map<String, Object>> evidence, List<Map<String, Object>> dataEvidence, Long userId) {
        return guarded(() -> validateWriteInternal(operation, payload, evidence, dataEvidence, userId));
    }
    private List<Map<String, Object>> validateWriteInternal(String operation, Map<String, Object> payload,
                                                            List<Map<String, Object>> evidence, List<Map<String, Object>> dataEvidence, Long userId) {
        boolean patch = operation.equals("patch_canvas_components"); String intent = patch ? "patch" : "create";
        String listPath = patch ? "patches" : "components";
        Object raw = payload.get(listPath);
        if (!(raw instanceof List<?> items))
            throw AiAgentDataValidation.error("agent.operation.invalid_component",
                    "写入请求必须包含组件对象数组", listPath, raw, "array<object>");
        Map<String, Map<String, Object>> identities = new LinkedHashMap<>();
        for (int itemIndex = 0; itemIndex < items.size(); itemIndex++) {
            Object item = items.get(itemIndex);
            String itemPath = (patch ? "patches[" : "components[") + itemIndex + "]";
            if (!(item instanceof Map<?, ?> rawSubmitted))
                throw AiAgentDataValidation.error("agent.operation.invalid_component", "组件写入项必须是对象", itemPath, item,
                        "object");
            var submitted = cast(rawSubmitted); String type = AiAgentDataValidation.text(submitted.get(patch ? "componentType" : "type"));
            String id = AiAgentDataValidation.text(submitted.get(patch ? "componentId" : "id"));
            String documentPath = null, source = null, documentType = null;
            try {
            if (type.isEmpty()) throw AiAgentDataValidation.error("agent.operation.component_type_required",
                    "写入项缺少组件类型", patch ? "componentType" : "type",
                    submitted.get(patch ? "componentType" : "type"), "non-empty string");
            // 只有图层或滤镜修改无需组件配置规格或数据说明书。
            if (patch && !submitted.containsKey("stylePatch") && !submitted.containsKey("dataPatch")) continue;
            var proof = evidence.stream().filter(p -> type.equals(p.get("componentType")) && intent.equals(p.get("intent")))
                    .findFirst().orElse(Map.of());
            var identity = map(proof.get("documentIdentity"));
            // Agent 可以复用历史中的规格；没有本轮读取证据时，服务端仍从已登记文档校验配置。
            if (identity.isEmpty()) identity = currentDocumentIdentity(type, userId);
            var located = verifyIdentity(identity, userId); documentPath = Objects.toString(located.document.get("path"), null);
            source = documentSource(located);
            documentType = Objects.toString(located.document.get("documentFormatVersion"), null);
            String content = checkedFile(located.directory, located.document);
            String requirements = section(content, "数据要求");
            boolean supports = supportsDataInput(requirements);
            if (!patch && submitted.containsKey("useDefaultConfig") && !(submitted.get("useDefaultConfig") instanceof Boolean))
                throw AiAgentDataValidation.error("agent.operation.invalid_component",
                        "useDefaultConfig 必须是布尔值", "useDefaultConfig", submitted.get("useDefaultConfig"), "boolean");
            var config = !patch && submitted.containsKey("config")
                    ? AiAgentDataValidation.object(submitted.get("config"), "config") : map(submitted.get("config"));
            Object rawStyle = config.get("style");
            if (patch) {
                rawStyle = null;
                if (submitted.containsKey("stylePatch")) {
                    var wrapper = AiAgentDataValidation.object(submitted.get("stylePatch"), itemPath + ".stylePatch");
                    var patchStyle = AiAgentDataValidation.object(wrapper.get("style"), itemPath + ".stylePatch.style");
                    if (patchStyle.isEmpty() || !wrapper.keySet().equals(Set.of("style")))
                        throw AiAgentDataValidation.error("agent.operation.empty_style_patch", "stylePatch 必须仅包含非空 style 对象",
                                itemPath + ".stylePatch", wrapper, Map.of("allowedKeys", List.of("style"), "style", "non-empty object"));
                    rawStyle = patchStyle;
                }
            }
            var style = rawStyle == null ? Map.<String, Object>of() : AiAgentDataValidation.object(rawStyle, "style");
            var ordinaryStyle = new LinkedHashMap<>(style);
            if (patch) {
                ordinaryStyle.keySet().removeAll(AiAgentDataValidation.MAPPING_KEYS);
                boolean dataChanged = submitted.containsKey("dataPatch");
                if (dataChanged || AiAgentDataValidation.hasMapping(style)) {
                    if (!supports) throw AiAgentDataValidation.error("agent.operation.data_patch_not_allowed",
                            "该组件不支持数据或字段映射修改", "dataPatch", submitted.get("dataPatch"),
                            Map.of("supportsDataInput", false, "componentType", type));
                    var contract = dataEvidence.stream().filter(c -> id.equals(c.get("componentId"))).findFirst().orElse(Map.of());
                    if (dataChanged && submitted.get("dataPatch") == null)
                        throw AiAgentDataValidation.missing("agent.operation.data_patch_not_allowed", "dataPatch 不能是 null",
                                "dataPatch", "non-empty object");
                    AiAgentDataValidation.validateChange(id, type, submitted.get("dataPatch"), style, contract,
                            itemPath + ".dataPatch", itemPath + ".stylePatch.style");
                    var contractIdentity = map(contract.get("documentIdentity")); verifyIdentity(contractIdentity, userId);
                    if (!identity.equals(contractIdentity)) throw AiAgentDataValidation.error(
                            "agent.operation.component_data_contract_version_mismatch",
                            "数据说明书与当前组件配置文档版本不同，请重新读取数据说明书", "documentIdentity",
                            contractIdentity, Map.of("currentDocumentIdentity", identity));
                }
            } else AiAgentDataValidation.validateCreate(type, config, supports, mappingFields(requirements),
                    Boolean.TRUE.equals(submitted.get("useDefaultConfig")), itemPath + ".config");
            if (!ordinaryStyle.isEmpty()) {
                var rules = new LinkedHashMap<>(firstJson(section(content, "校验规则")));
                if (!patch) {
                    List<Map<String, Object>> allowed = new ArrayList<>();
                    for (Object rule : (List<?>) rules.get("allowedStylePaths")) allowed.add(map(rule));
                    for (String key : mappingFields(requirements)) {
                        String field = "style." + key;
                        if (allowed.stream().noneMatch(rule -> field.equals(map(rule).get("path")))) allowed.add(Map.of("path", field, "type", "string"));
                    }
                    rules.put("allowedStylePaths", allowed);
                }
                try {
                    AiAgentStyleValidation.validate(ordinaryStyle, rules);
                } catch (AiAgentDataValidation.Violation e) {
                    throw e.withComponentContext(id, type, writeFieldPath(itemPath, patch, e.path));
                }
            }
            identities.put(type, identity);
            } catch (AiAgentDataValidation.Violation e) {
                throw e.withComponentContext(id, type, writeFieldPath(itemPath, patch, e.path));
            } catch (DocumentException e) {
                throw e.withDocumentContext(id, type, documentPath, source, documentType);
            }
        }
        return new ArrayList<>(identities.values());
    }

    private String writeFieldPath(String itemPath, boolean patch, String path) {
        if (path == null || path.isBlank()) return itemPath;
        if (path.startsWith(itemPath + ".") || path.equals(itemPath)) return path;
        if (path.equals("style") || path.startsWith("style."))
            return itemPath + (patch ? ".stylePatch." : ".config.") + path;
        if (AiAgentDataValidation.MAPPING_KEYS.contains(path))
            return itemPath + (patch ? ".stylePatch.style." : ".config.style.") + path;
        return itemPath + "." + path;
    }
    public Object execute(String operation, Map<String, Object> request, Long userId) {
        return guarded(() -> switch (operation) {
            case "resolve_component_specs" -> resolve(request, userId);
            case "get_component_document" -> document(request, userId);
            case "search_component_documents" -> search(request, userId);
            default -> throw invalid("request_invalid", "未知文档操作", "operation", operation,
                    List.of("resolve_component_specs", "get_component_document", "search_component_documents"));
        });
    }
    private <T> T guarded(java.util.function.Supplier<T> action) {
        if (!readers.tryAcquire()) {
            int activeReads = 4 - readers.availablePermits();
            throw invalid("read_busy", "文档读取并发已达上限，请稍后重试",
                    "activeReads", activeReads, Map.of("maxConcurrentReads", 4, "retryable", true));
        }
        try {return action.get();} finally {readers.release();}
    }
    private record Located(Path directory, Map<String, Object> document, Map<String, Object> fragments) {}
    private Map<String, Object> currentDocumentIdentity(String type, Long userId) {
        var index = builtinIndex(null);
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (Object item : (List<?>) index.get("documents")) {
            var document = map(item);
            if (type.equals(document.get("componentType"))) candidates.add(identity(document));
        }
        if (userId != null) {
            var rows = documentMapper.selectList(new LambdaQueryWrapper<RemoteComponentDocumentPO>()
                    .eq(RemoteComponentDocumentPO::getUserId, userId).eq(RemoteComponentDocumentPO::getComponentType, type)
                    .last("limit 1001"));
            if (rows.size() > 1000) throw invalid("component_unavailable", "该类型登记的文档超过查询上限，请明确读取唯一组件规格",
                    "componentType", type, Map.of("maxRegisteredDocuments", 1000));
            for (var row : rows) {
                if (!userId.equals(row.getUserId()) || !type.equals(row.getComponentType())) continue;
                var parent = componentMapper.selectOne(new LambdaQueryWrapper<RemoteComponentPO>()
                        .eq(RemoteComponentPO::getId, row.getRemoteComponentId()).eq(RemoteComponentPO::getUserId, userId));
                if (parent != null && row.getRemoteComponentId().equals(parent.getId()) && userId.equals(parent.getUserId())
                        && Objects.equals(parent.getUrl(), row.getPackageUrl()))
                    candidates.add(identity(JSON.parseObject(row.getIndexJson())));
            }
        }
        if (candidates.size() != 1) throw invalid("component_unavailable", "组件类型没有唯一可用文档，请读取并指定组件规格",
                "componentType", type, Map.of("matchingDocumentCount", candidates.size(), "requiredCount", 1));
        return candidates.get(0);
    }
    private Map<String, Object> builtinIndex(String version) {
        if (version == null || version.isBlank()) version = Objects.toString(readJson(root.resolve("current.json"), 4096).get("corpusVersion"), "");
        if (!version.matches("[a-f0-9]{64}")) throw invalid("version_mismatch", "内置组件资料版本必须是 64 位小写 SHA-256",
                "corpusVersion", version, "64 lowercase hexadecimal characters");
        var index = readJson(root.resolve("builtin").resolve(version).resolve("index.json"), 2 * 1024 * 1024);
        if (!version.equals(index.get("corpusVersion"))) throw invalid("version_mismatch", "索引中的 corpusVersion 与请求版本不一致",
                "corpusVersion", index.get("corpusVersion"), version);
        return index;
    }
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> catalog(Map<String, Object> request) {
        Object raw = request.get("catalog");
        if (!(raw instanceof List<?> list) || list.size() > 1000 || list.stream().anyMatch(v -> !(v instanceof Map<?, ?>)))
            throw invalid("component_unavailable", "文档请求的 catalog 必须是最多 1000 项的对象数组",
                    "catalog", raw, Map.of("type", "array<object>", "maxItems", 1000));
        return (List<Map<String, Object>>) raw;
    }
    private Located locate(String type, Map<String, Object> request, Long userId) {
        var entries = catalog(request).stream().filter(item -> type.equals(item.get("componentType"))).toList();
        if (entries.isEmpty()) throw invalid("component_unavailable", "请求的组件类型不在当前加载目录中",
                "componentType", type, Map.of("matchingCatalogEntries", 0, "action", "refresh component catalog"));
        if (entries.size() > 1) throw invalid("component_unavailable", "当前目录中存在多个同类型组件，请按组件 ID 消除歧义",
                "componentType", type, Map.of("matchingCatalogEntries", entries.size(), "componentIds",
                        entries.stream().map(item -> item.get("componentId")).filter(Objects::nonNull).toList()));
        var selected = entries.get(0);
        if ("remote".equals(selected.get("source"))) {
            if (userId == null) throw invalid("component_unavailable", "读取服务器组件文档需要已登录用户",
                    "source", selected.get("source"), "authenticated user context");
            Long id;
            try {id = Long.valueOf(String.valueOf(selected.get("componentId")));}
            catch (RuntimeException e) {throw invalid("component_unavailable", "服务器组件 componentId 必须是有效整数",
                    "componentId", selected.get("componentId"), "integer ID");}
            var parent = componentMapper.selectOne(new LambdaQueryWrapper<RemoteComponentPO>()
                    .eq(RemoteComponentPO::getId, id).eq(RemoteComponentPO::getUserId, userId));
            if (parent == null) throw invalid("component_unavailable", "服务器组件不存在或不属于当前用户",
                    "componentId", id, "an existing component owned by the current user");
            String version = Objects.toString(selected.get("componentVersion"), "");
            var row = documentMapper.selectOne(new LambdaQueryWrapper<RemoteComponentDocumentPO>()
                    .eq(RemoteComponentDocumentPO::getRemoteComponentId, id).eq(RemoteComponentDocumentPO::getUserId, userId)
                    .eq(RemoteComponentDocumentPO::getComponentType, type).eq(RemoteComponentDocumentPO::getComponentVersion, version));
            if (row == null) throw invalid("document_unavailable", "该服务器组件代码版本没有登记文档",
                    "componentVersion", version, Map.of("componentType", type, "registeredDocumentRequired", true));
            var index = JSON.parseObject(row.getIndexJson());
            if (!version.equals(index.get("componentVersion"))) throw invalid("version_mismatch", "服务器组件文档 componentVersion 与目录不一致",
                    "componentVersion", index.get("componentVersion"), version);
            Path dir = remoteDirectory(userId, id, version);
            return new Located(dir, index, map(index.get("fragments")));
        }
        var index = builtinIndex(Objects.toString(selected.get("corpusVersion"), ""));
        var documents = (List<?>) index.get("documents");
        var doc = documents.stream().map(ComponentDocumentService::map).filter(d -> type.equals(d.get("componentType")))
                .findFirst().orElseThrow(() -> invalid("document_unavailable", "组件目录项对应的组件资料库中没有文档",
                        "componentType", type, "registered component document"));
        if (!Objects.equals(doc.get("componentVersion"), selected.get("componentVersion")))
            throw invalid("version_mismatch", "组件代码版本与文档索引中的版本不一致", "componentVersion",
                    selected.get("componentVersion"), doc.get("componentVersion"));
        return new Located(root.resolve("builtin").resolve(String.valueOf(index.get("corpusVersion"))), doc, map(index.get("fragments")));
    }
    private Object resolve(Map<String, Object> request, Long userId) {
        List<String> types = AiAgentComponentSpecs.normalizeRequest(request);
        List<Map<String, Object>> specs = new ArrayList<>(); Map<String, Object> common = new TreeMap<>(); List<String> versions = new ArrayList<>();
        for (String type : types) {
            String documentPath = null;
            Located located = null;
            try {
            located = locate(type, request, userId);
            documentPath = Objects.toString(located.document.get("path"), null);
            if (!Boolean.TRUE.equals(located.document.get("hasFullSpec")))
                throw invalid("document_unavailable", "该组件文档没有完整规格章节", "hasFullSpec", false,
                        Map.of("componentType", type, "required", true, "section", "完整规格"));
            String content = checkedFile(located.directory, located.document);
            var spec = fullSpec(content, String.valueOf(request.get("intent")));
            var identity = identity(located.document); spec.put("documentIdentity", identity); versions.add(JSON.toJSONString(identity));
            specs.add(spec);
            Set<String> refs = new TreeSet<>(); collectReferences(spec.get("configurable"), refs, "configurable");
            for (String label : refs) {
                Map<String, Object> fragment = map(located.fragments.get(label));
                if (fragment.isEmpty()) throw invalid("common_fragments_invalid", "规格引用的公共片段未登记",
                        "configurable", label, Map.of("registeredFragmentRequired", label));
                Object parsed;
                try {parsed = JSON.parse(checkedFile(located.directory, fragment));}
                catch (DocumentException e) {throw e;}
                catch (RuntimeException e) {throw invalid("common_fragments_invalid", "公共片段 JSON 解析失败：" + shortCause(e),
                        "commonFragments." + label, "[invalid JSON]", "JSON object");}
                if (!(parsed instanceof Map<?, ?>)) throw invalid("common_fragments_invalid", "公共片段必须解析为对象",
                        "commonFragments." + label, parsed, "object");
                Object previous = common.putIfAbsent(label, parsed);
                if (previous != null && !previous.equals(parsed)) throw invalid("common_fragments_invalid", "同名公共片段内容冲突",
                        "commonFragments." + label, "[conflicting versions]", "one identical JSON object");
            }
            } catch (DocumentException e) {
                throw e.withDocumentContext(null, type, documentPath,
                        documentSource(located),
                        located == null ? null : Objects.toString(located.document.get("documentFormatVersion"), null));
            }
        }
        Collections.sort(versions);
        var result = Map.of("corpusVersion", hash(String.join("\0", versions)), "specs", specs, "commonFragments", common);
        int outputBytes = JSON.toJSONBytes(result).length;
        if (outputBytes > AiAgentComponentSpecs.OUTPUT_BUDGET_BYTES)
            throw invalid("output_limit_exceeded", "完整规格超过输出上限，请减少 componentTypes 后重试",
                    "result.serializedByteLength", outputBytes, Map.of("maxBytes", AiAgentComponentSpecs.OUTPUT_BUDGET_BYTES));
        return result;
    }
    private Object document(Map<String, Object> request, Long userId) {
        String type = Objects.toString(request.get("componentType"), "");
        if (type.isBlank()) throw invalid("request_invalid", "componentType 必须是非空字符串", "componentType",
                request.get("componentType"), "non-empty string");
        var located = locate(type, request, userId);
        try {
        String content = checkedFile(located.directory, located.document); String[] lines = content.split("\\r?\\n", -1);
        String section = Objects.toString(request.get("section"), ""); int first = 1, last = lines.length;
        if (!section.isBlank()) {
            var range = map(map(located.document.get("sections")).get(section));
            if (range.isEmpty()) {
                List<String> available = new ArrayList<>(map(located.document.get("sections")).keySet());
                throw invalid("section_unavailable", "请求的章节“" + section + "”不存在；可用章节：" + String.join("、", available),
                        "section", section, Map.of("availableSections", available));
            }
            first = ((Number) range.get("startLine")).intValue(); last = ((Number) range.get("endLine")).intValue();
        }
        int start = Math.max(first, number(request.get("startLine"), first)), count = Math.min(80, Math.max(1, number(request.get("lineCount"), 40)));
        int end = Math.min(last, start - 1 + count);
        String text = start > end ? "" : String.join("\n", Arrays.copyOfRange(lines, start - 1, end));
        int outputBytes = text.getBytes(StandardCharsets.UTF_8).length;
        if (outputBytes > 64 * 1024) throw invalid("output_limit_exceeded", "当前文档分页超过输出上限，请减少 lineCount",
                "lineCount", count, Map.of("maxBytes", 64 * 1024, "maxLineCount", 80));
        Map<String, Object> result = new LinkedHashMap<>(); result.put("status", "ok"); result.put("componentType", type);
        result.put("componentName", located.document.get("componentName")); result.put("source", located.document.get("path"));
        result.put("section", section.isBlank() ? null : section); result.put("content", text); result.put("startLine", start);
        result.put("endLine", end); result.put("totalLines", lines.length);
        result.put("hasMore", end < last); result.put("nextStartLine", end < last ? end + 1 : null);
        result.put("availableSections", List.copyOf(map(located.document.get("sections")).keySet()));
        result.put("documentIdentity", identity(located.document)); return result;
        } catch (DocumentException e) {
            throw context(e, null, type, located).withSectionContext(Objects.toString(request.get("section"), null));
        }
    }
    private Object search(Map<String, Object> request, Long userId) {
        String query = Objects.toString(request.get("query"), "").trim().toLowerCase(Locale.ROOT);
        if (query.isEmpty()) throw invalid("request_invalid", "搜索词不能为空", "query", request.get("query"), "non-empty string");
        int limit = Math.min(100, Math.max(1, number(request.get("maxResults"), 50)));
        List<?> requested = request.get("componentTypes") instanceof List<?> list ? list : List.of();
        var candidates = catalog(request).stream().filter(d -> requested.isEmpty() || requested.contains(d.get("componentType"))).toList();
        List<Map<String, Object>> matches = new ArrayList<>(); int scanned = 0, bytes = 0; boolean limited = false;
        for (var candidate : candidates) {
            if (scanned == 20 || bytes >= 1024 * 1024 || matches.size() >= limit) {limited = true; break;}
            String type = String.valueOf(candidate.get("componentType")); var located = locate(type, request, userId);
            try {
            int size = ((Number) located.document.get("bytes")).intValue();
            if (bytes + size > 1024 * 1024) {limited = true; break;}
            String[] lines = checkedFile(located.directory, located.document).split("\\r?\\n", -1); scanned++; bytes += size;
            for (int i = 0; i < lines.length; i++) if (lines[i].toLowerCase(Locale.ROOT).contains(query)) {
                String text = lines[i].length() > 1000 ? lines[i].substring(0, 1000) : lines[i];
                matches.add(Map.of("componentType", type, "componentName", located.document.get("componentName"),
                        "source", located.document.get("path"), "lineNumber", i + 1, "text", text));
                if (matches.size() == limit) {limited = true; break;}
            }
            } catch (DocumentException e) {
                throw context(e, Objects.toString(candidate.get("componentId"), null), type, located);
            }
        }
        return Map.of("status", "ok", "query", query, "matches", matches, "totalMatches", matches.size(),
                "scannedDocuments", scanned, "scanLimited", limited);
    }
    private static Map<String, Object> identity(Map<String, Object> doc) {
        Map<String, Object> identity = new LinkedHashMap<>();
        for (String key : List.of("source", "componentType", "componentId", "componentVersion", "corpusVersion", "sha256", "documentFormatVersion"))
            if (doc.containsKey(key)) identity.put(key, doc.get(key));
        return identity;
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();}
    private static DocumentException invalid(String code, String message, String fieldPath, Object actual, Object expected) {
        return ComponentDocumentParser.invalid(code, message, fieldPath, actual, expected);
    }
    private static DocumentException invalid(String code, String message) {
        return invalid(code, message, "request", "[invalid request state]", "provide a valid component document request");
    }
    private static String shortCause(Throwable error) {
        String cause = Objects.toString(error.getMessage(), error.getClass().getSimpleName());
        return cause.length() > 240 ? cause.substring(0, 240) + "…" : cause;
    }
    private DocumentException context(DocumentException error, String componentId, String componentType, Located located) {
        if (located == null) return error.withDocumentContext(componentId, componentType, null);
        return error.withDocumentContext(componentId, componentType,
                Objects.toString(located.document.get("path"), null),
                documentSource(located),
                Objects.toString(located.document.get("documentFormatVersion"), null));
    }
    private String documentSource(Located located) {
        if (located == null) return null;
        Object declared = located.document.get("source");
        if (declared != null) return declared.toString();
        return located.directory.startsWith(root.resolve("builtin")) ? "builtin" : "remote";
    }
    private static int number(Object value, int fallback) {return value instanceof Number n ? n.intValue() : fallback;}
    private static Map<String, Object> readJson(Path path, int maxBytes) {
        try {return JSON.parseObject(read(path, maxBytes));}
        catch (DocumentException e) {throw e;}
        catch (RuntimeException e) {
            throw invalid("document_unavailable", "文档索引 JSON 解析失败：" + shortCause(e),
                    "json", "[invalid JSON]", "JSON object")
                    .withDocumentContext(null, null, path.getFileName().toString());
        }
    }
    private static String read(Path path, int maxBytes) {
        try {
            if (!Files.isRegularFile(path)) throw invalid("document_unavailable", "文档文件不存在或不是普通文件",
                    "path", path.getFileName().toString(), "existing regular file")
                    .withDocumentContext(null, null, path.getFileName().toString());
            long size = Files.size(path);
            if (size > maxBytes) throw invalid("output_limit_exceeded", "文档文件超过读取上限",
                    "bytes", size, Map.of("maxBytes", maxBytes, "path", path.getFileName().toString()))
                    .withDocumentContext(null, null, path.getFileName().toString());
            try (var input = Files.newInputStream(path)) {
                byte[] bytes = input.readNBytes(maxBytes + 1);
                if (bytes.length > maxBytes) throw invalid("output_limit_exceeded", "文档文件读取期间超过读取上限",
                        "bytes", bytes.length, Map.of("maxBytes", maxBytes, "path", path.getFileName().toString()))
                        .withDocumentContext(null, null, path.getFileName().toString());
                return new String(bytes, StandardCharsets.UTF_8);
            }
        } catch (DocumentException e) {throw e.withDocumentContext(null, null, path.getFileName().toString());}
        catch (IOException e) {
            throw invalid("document_unavailable", "读取文档文件失败：" + shortCause(e), "path",
                    path.getFileName().toString(), "readable regular file")
                    .withDocumentContext(null, null, path.getFileName().toString());
        }
    }
    private static Path registeredPath(Path directory, String relative) {
        try {
            Path requested = Path.of(relative);
            if (requested.isAbsolute()) throw invalid("path_invalid", "文档路径必须是资料目录内的相对路径",
                    "path", relative, "relative path contained within the document directory");
            Path dir = directory.toRealPath(), file = dir.resolve(requested).normalize();
            if (!file.startsWith(dir)) throw invalid("path_invalid", "文档路径超出资料目录",
                    "path", relative, "relative path contained within the document directory");
            if (!file.toRealPath().startsWith(dir)) throw invalid("path_invalid", "文档符号链接目标超出资料目录",
                    "path", relative, "file resolving inside the document directory");
            return file;
        } catch (DocumentException e) {throw e.withDocumentContext(null, null, relative);}
        catch (IOException e) {
            throw invalid("document_unavailable", "登记的文档文件不存在或无法解析",
                    "path", relative, "existing registered file inside the document directory").withDocumentContext(null, null, relative);
        } catch (RuntimeException e) {
            throw invalid("path_invalid", "文档路径格式无效：" + shortCause(e),
                    "path", relative, "valid relative file path").withDocumentContext(null, null, relative);
        }
    }
    private static String checkedFile(Path directory, Map<String, Object> metadata) {
        String relative = Objects.toString(metadata.get("path"), "");
        try {
            String content = read(registeredPath(directory, relative), FILE_LIMIT);
            String actualHash = hash(content);
            if (!actualHash.equals(metadata.get("sha256")))
                throw invalid("version_mismatch", "组件文档哈希与索引记录不一致", "sha256", actualHash,
                        metadata.get("sha256")).withDocumentContext(null,
                        Objects.toString(metadata.get("componentType"), null), relative,
                        Objects.toString(metadata.get("source"), null),
                        Objects.toString(metadata.get("documentFormatVersion"), null));
            return content;
        } catch (DocumentException e) {
            throw e.withDocumentContext(null, Objects.toString(metadata.get("componentType"), null), relative,
                    Objects.toString(metadata.get("source"), null),
                    Objects.toString(metadata.get("documentFormatVersion"), null));
        }
    }
    private Path remoteDirectory(Long userId, Long id, String version) {
        if (!version.matches("[a-f0-9]{32,64}")) throw invalid("version_mismatch", "服务器组件资源版本无效");
        // 上传文档属于运行数据，默认存到资源根目录，避免 Maven clean 删除。
        Path base = explicitRoot ? root : Path.of(AppBaseConfig.ROOT_PATH == null ? System.getProperty("user.dir") : AppBaseConfig.ROOT_PATH, "component-docs");
        return base.resolve("remote").resolve(userId.toString()).resolve(id.toString()).resolve(version);
    }

    /** 上传阶段生成文档元数据，数据库发布之前验证所有片段；代码不执行。 */
    public Map<String, Object> inspectPackage(Path packageDir) {
        Path manifestPath = packageDir.resolve("manifest.json");
        if (!Files.exists(manifestPath)) return Map.of();
        var manifest = readJson(manifestPath, 64 * 1024);
        String type = Objects.toString(manifest.get("componentType"), ""), path = Objects.toString(manifest.get("documentPath"), type + ".md");
        String version = Objects.toString(manifest.get("componentVersion"), "");
        if (version.isBlank() || version.length() > 128 || !"component-document/v1".equals(manifest.get("documentFormatVersion")))
            throw invalid("document_unavailable", "组件包需要组件版本和 component-document/v1 格式声明");
        var file = registeredPath(packageDir, path);
        var metadata = describe(read(file, FILE_LIMIT), file.getFileName().toString());
        if (!type.equals(metadata.get("componentType"))) throw invalid("document_unavailable", "元信息与文档组件类型不一致");
        String entry = Objects.toString(manifest.get("codeEntry"), "");
        if (!entry.matches("(?i).+\\.(js|mjs)$")) throw invalid("document_unavailable", "组件包 codeEntry 无效");
        registeredPath(packageDir, entry);
        Map<String, Object> fragments = new TreeMap<>();
        var dependency = map(manifest.get("commonFragments"));
        for (Object ref : (List<?>) metadata.get("fragmentRefs")) {
            String label = ref.toString(); String fragmentPath = Objects.toString(dependency.get(label), "");
            if (!fragmentPath.isBlank()) {
                String content = read(registeredPath(packageDir, fragmentPath), FILE_LIMIT);
                if (!(JSON.parse(content) instanceof Map<?, ?>)) throw invalid("common_fragments_invalid", "公共片段必须为 JSON 对象");
                fragments.put(label, Map.of("path", fragmentPath, "sha256", hash(content), "bytes", content.getBytes(StandardCharsets.UTF_8).length));
            } else {
                // 公共内置片段必须显式绑定资料版本，并复制到该组件的不可变版本目录。
                String corpus = Objects.toString(manifest.get("builtinCorpusVersion"), "");
                if (corpus.isBlank()) throw invalid("common_fragments_invalid", "缺少公共片段或内置资料版本：" + label);
                var index = builtinIndex(corpus); var fragment = map(map(index.get("fragments")).get(label));
                if (fragment.isEmpty()) throw invalid("common_fragments_invalid", "内置资料中没有该片段：" + label);
                String content = checkedFile(root.resolve("builtin").resolve(corpus), fragment);
                String target = "common/" + label.substring(1, label.length() - 1) + ".json";
                write(packageDir.resolve(target), content);
                fragments.put(label, Map.of("path", target, "sha256", hash(content), "bytes", content.getBytes(StandardCharsets.UTF_8).length));
            }
        }
        metadata.put("path", type + ".md"); metadata.put("uploadDocumentPath", path); metadata.put("fragments", fragments);
        metadata.put("codeEntry", entry); metadata.put("declaredComponentVersion", version);
        // 导出的组件包包含已固定的片段文件，导入时无需依赖另一部署的内置语料版本。
        Map<String, Object> packagedFragments = new TreeMap<>();
        fragments.forEach((label, value) -> packagedFragments.put(label, map(value).get("path")));
        if (!packagedFragments.equals(dependency)) {
            manifest.put("commonFragments", packagedFragments);
            try {Files.writeString(manifestPath, JSON.toJSONString(manifest), StandardCharsets.UTF_8);}
            catch (IOException e) {throw invalid("document_unavailable", "组件包公共片段元信息保存失败");}
        }
        return metadata;
    }
    public void registerPackage(Path packageDir, String packageUrl, RemoteComponentPO component) {
        var metadata = inspectPackage(packageDir);
        if (metadata.isEmpty()) return;
        String version = hash(packageUrl + "\0" + metadata.get("sha256"));
        Path destination = remoteDirectory(component.getUserId(), component.getId(), version);
        if (TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {if (status != STATUS_COMMITTED) deleteDirectory(destination);}
            });
        String content = read(registeredPath(packageDir, String.valueOf(metadata.remove("uploadDocumentPath"))), FILE_LIMIT);
        write(destination.resolve(String.valueOf(metadata.get("path"))), content);
        var fragments = map(metadata.get("fragments"));
        // 私有片段统一输出到 common 下，不复用上传包的可变路径。
        for (var entry : fragments.entrySet()) {
            var fragment = new LinkedHashMap<>(map(entry.getValue()));
            String body = checkedFile(packageDir, fragment); String target = "common/" + entry.getKey().replaceAll("[<>]", "") + ".json";
            write(destination.resolve(target), body); fragment.put("path", target); entry.setValue(fragment);
        }
        metadata.put("componentVersion", version); metadata.put("componentId", component.getId().toString()); metadata.put("source", "remote");
        String indexJson = JSON.toJSONString(metadata);
        if (indexJson.getBytes(StandardCharsets.UTF_8).length > REMOTE_INDEX_LIMIT)
            throw invalid("output_limit_exceeded", "组件文档索引超过 16 KiB");
        write(destination.resolve("index.json"), indexJson);
        var row = new RemoteComponentDocumentPO(); row.setRemoteComponentId(component.getId()); row.setUserId(component.getUserId());
        row.setComponentType(String.valueOf(metadata.get("componentType"))); row.setComponentVersion(version); row.setPackageUrl(packageUrl);
        row.setIndexJson(indexJson); row.setDeleted(0);
        try {
            if (documentMapper.insert(row) != 1) throw invalid("document_unavailable", "组件文档索引发布失败");
        } catch (RuntimeException e) {deleteDirectory(destination); throw e;}
    }
    public Map<String, Object> packageSummary(RemoteComponentPO component) {
        var row = documentMapper.selectOne(new LambdaQueryWrapper<RemoteComponentDocumentPO>()
                .eq(RemoteComponentDocumentPO::getRemoteComponentId, component.getId()).eq(RemoteComponentDocumentPO::getUserId, component.getUserId())
                .eq(RemoteComponentDocumentPO::getPackageUrl, component.getUrl()));
        if (row == null) return Map.of();
        var metadata = JSON.parseObject(row.getIndexJson()); Map<String, Object> summary = new LinkedHashMap<>();
        for (String key : List.of("componentType", "componentId", "componentVersion", "sha256", "documentFormatVersion", "hasFullSpec", "componentInfo", "source"))
            summary.put(key, metadata.get(key));
        return summary;
    }
    public boolean hasIndexedPackage(Long id, String url) {
        return documentMapper.selectCount(new LambdaQueryWrapper<RemoteComponentDocumentPO>()
                .eq(RemoteComponentDocumentPO::getRemoteComponentId, id).eq(RemoteComponentDocumentPO::getPackageUrl, url)) > 0;
    }
    public void deactivate(List<Long> ids, Long userId) {
        documentMapper.delete(new LambdaQueryWrapper<RemoteComponentDocumentPO>()
                .in(RemoteComponentDocumentPO::getRemoteComponentId, ids).eq(RemoteComponentDocumentPO::getUserId, userId));
    }
    /** 与现有逻辑删除资源清理同周期执行，包含已经保留的旧版本。 */
    public void cleanDeletedDocuments() {
        for (var row : documentMapper.deletedDocuments()) {
            deleteDirectory(remoteDirectory(row.getUserId(), row.getRemoteComponentId(), row.getComponentVersion()));
            if (hasActivePackageReference(row.getPackageUrl())) continue;
            String url = row.getPackageUrl().replace('\\', '/').replaceFirst("^/+", "");
            String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "") + "/";
            if (url.startsWith(marker)) url = url.substring(marker.length());
            if (!url.contains("/")) continue;
            Path packages = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
            Path directory = packages.resolve(url.substring(0, url.indexOf('/'))).normalize();
            if (directory.startsWith(packages) && !directory.equals(packages)) deleteDirectory(directory);
        }
    }
    public boolean hasActivePackageReference(String raw) {
        String url = raw.replace('\\', '/').replaceFirst("^/+", "");
        String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "") + "/";
        if (url.startsWith(marker)) url = url.substring(marker.length());
        final String key = url.contains("/") ? url.substring(0, url.indexOf('/') + 1) : url;
        var query = new LambdaQueryWrapper<RemoteComponentPO>();
        if (url.contains("/")) query.and(q -> q.likeRight(RemoteComponentPO::getUrl, key).or()
                .likeRight(RemoteComponentPO::getUrl, marker + key).or().likeRight(RemoteComponentPO::getUrl, "/" + marker + key));
        else query.and(q -> q.eq(RemoteComponentPO::getUrl, key).or().eq(RemoteComponentPO::getUrl, marker + key)
                .or().eq(RemoteComponentPO::getUrl, "/" + marker + key));
        return componentMapper.selectCount(query) > 0;
    }
    private static void deleteDirectory(Path path) {
        if (!Files.exists(path)) return;
        try (var files = Files.walk(path)) {
            for (Path file : files.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(file);
        } catch (IOException e) {throw invalid("document_unavailable", "组件文档目录清理失败");}
    }
    private static void write(Path path, String content) {
        try {Files.createDirectories(path.getParent()); Files.writeString(path, content, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);}
        catch (FileAlreadyExistsException e) {
            if (!read(path, FILE_LIMIT).equals(content)) throw invalid("version_mismatch", "不可变文档版本内容冲突");
        } catch (IOException e) {throw invalid("document_unavailable", "无法写入组件文档文件");}
    }
}
