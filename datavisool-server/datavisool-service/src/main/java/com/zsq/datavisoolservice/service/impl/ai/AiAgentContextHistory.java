/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONWriter;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.*;

import java.nio.charset.StandardCharsets;
import java.util.*;

/** 模型可见投影；原始回执仍保存在审计记录和未压缩的检查点中。 */
final class AiAgentContextHistory {
    static final String FULL_HISTORY_MARKER = "[Agent full-history policy/v1]";
    static final String SUMMARY_MARKER = "[Agent context summary]\n";
    static final String DIGEST_MARKER = "\n\n[Agent state digest]\n";
    static final String BUDGET_MARKER = "\n\n[Execution budget]\n";
    private static final String RECEIPTS_MARKER = "[Agent operation receipts]\n";
    private static final Set<String> FACT_KEYS = Set.of(
            "status", "code", "message", "operationId", "artifactId", "revision", "resultRevision",
            "workspaceRevision", "corpusVersion", "sourceVersion", "catalogVersion", "managerId",
            "componentId", "componentIds", "componentType", "componentBindings", "path", "section",
            "draftId", "expectedDraftRevision", "regionId", "confirmed",
            "sourceType", "offset", "nextOffset", "hasMore", "total", "totalComponents", "retryHint",
            "actualComponentIds", "actualComponentTypes", "actualComponentCount", "missingComponentIds",
            "configuredComponentCount", "defaultConfigComponentCount", "repairTool", "error", "errorContext",
            "line", "column", "charOffset", "contextStartOffset");
    private static final Set<String> READ_TOOLS = Set.of("get_component_catalog", "resolve_component_specs", "get_component_data_contract",
            "inspect_current_page", "get_component_snapshots", "get_component_document", "list_workspace_files",
            "search_workspace_files", "read_workspace_file");
    private static final Set<String> ARGUMENT_KEYS = Set.of("componentTypes", "componentType", "componentIds",
            "intent", "fields", "sourceType", "path", "query", "offset", "limit", "startLine", "lineCount",
            "section", "page", "pageSize", "cursor");
    private static final Set<String> DIAGNOSTIC_FIELDS = Set.of(
            "code", "message", "status", "componentId", "componentIds", "componentType", "path", "fieldPath",
            "actualValue", "actualType", "expected", "expectedValue", "currentValue", "actual", "recovery", "retryHint", "retryable",
            "error", "errorContext", "reason", "detail", "details", "errors", "failed", "failures", "diagnostics",
            "itemId", "id", "name", "type", "index", "editIndex", "editNumber", "matchCount",
            "matchLocations", "matchLocationsTruncated", "hunkIndex", "line", "column", "patchLine",
            "matchLines", "matchLinesTruncated", "parserReason", "parserIndex", "actualBytes", "maxBytes",
            "totalLines", "requestedEndLine", "expectedRevision", "currentRevision", "partial", "applied",
            "deletedComponentIds", "actualStateUnknown", "rollbackFailedComponentIds", "partiallyApplied",
            "partiallyAppliedComponentIds", "failedComponentId", "causeCode", "changedPaths",
            "operationId", "toolName", "workspaceRevision", "revision", "resultRevision", "baseRevision", "actualRevision",
            "draftId", "expectedDraftRevision", "regionId", "missingRegionIds", "confirmed",
            "repairTool", "artifactPath", "contentSha256", "artifactUpdated", "validationStage",
            "charOffset", "contextStartOffset", "contextLocationKnown", "actualDescription",
            "source", "documentPath", "documentType", "parseLine", "parseColumn",
            "allowedFields", "allowedValues", "missingFields", "offendingComponentIds",
            "timeoutSeconds", "cancellationRequested", "executionOutcome", "exceptionType", "diagnosticSource", "action", "metadataPath",
            "cause", "operationError", "verificationError", "cleanupStateUnknown", "actualState", "interactionState", "actualBounds", "expectedBounds",
            "presentFields", "actualCount", "canvasSize",
            "segment", "missingSegment", "sourceField", "items", "component");
    private static final Set<String> ERROR_COLLECTION_FIELDS = Set.of("errors", "failed", "failures", "diagnostics");
    private static final Set<String> NON_FLATTENED_ERROR_FIELDS = Set.of(
            "code", "message", "componentId", "componentType", "path", "fieldPath", "actualValue", "actualType", "expected", "recovery");

    private AiAgentContextHistory() {}

    /** 每个多调用 assistant 连同全部结果作为不可拆分的一组。 */
    static List<ChatMessage> normalize(List<ChatMessage> source) {
        List<ChatMessage> result = new ArrayList<>();
        for (int i = 0; i < source.size(); i++) {
            ChatMessage message = source.get(i);
            if (message instanceof ToolExecutionResultMessage) continue; // 孤立或重复的结果
            result.add(message);
            if (!(message instanceof AiMessage ai) || !ai.hasToolExecutionRequests()) continue;
            Map<String, ToolExecutionResultMessage> returned = new LinkedHashMap<>();
            while (i + 1 < source.size() && source.get(i + 1) instanceof ToolExecutionResultMessage toolResult) {
                returned.putIfAbsent(toolResult.id(), toolResult);
                i++;
            }
            Set<String> ids = new HashSet<>();
            for (ToolExecutionRequest call : ai.toolExecutionRequests()) {
                if (call.id() == null || call.id().isBlank() || !ids.add(call.id())) {
                    throw new IllegalStateException("上下文包含无效或重复的工具调用 ID");
                }
                result.add(returned.getOrDefault(call.id(), ToolExecutionResultMessage.from(call, json(Map.of(
                        "status", "aborted", "code", "tool_result_unavailable",
                        "message", "工具结果不可用；执行事实不明，请读取实时状态后继续，禁止直接重放写操作。")))));
            }
        }
        return result;
    }

    static List<List<ChatMessage>> groups(List<ChatMessage> source) {
        List<List<ChatMessage>> groups = new ArrayList<>();
        for (int i = 0; i < source.size(); i++) {
            List<ChatMessage> group = new ArrayList<>();
            ChatMessage message = source.get(i);
            group.add(message);
            if (message instanceof AiMessage ai && ai.hasToolExecutionRequests()) {
                while (i + 1 < source.size() && source.get(i + 1) instanceof ToolExecutionResultMessage) {
                    group.add(source.get(++i));
                }
            }
            groups.add(group);
        }
        return groups;
    }

    static boolean isSummary(ChatMessage message) {
        return message instanceof UserMessage user && (userText(user).startsWith(SUMMARY_MARKER)
                || userText(user).startsWith("此前 Agent 历史摘要：") || userText(user).startsWith(RECEIPTS_MARKER));
    }

    static String userText(UserMessage user) {
        return user.contents().stream().filter(TextContent.class::isInstance).map(TextContent.class::cast)
                .map(TextContent::text).reduce((left, right) -> left + "\n" + right).orElse("");
    }

    static boolean isRequirement(ChatMessage message) {
        if (!(message instanceof UserMessage user) || isSummary(message) || AiAgentComponentCatalog.isSnapshot(message)) return false;
        String text = user.contents().stream().filter(TextContent.class::isInstance)
                .map(TextContent.class::cast).map(TextContent::text).findFirst().orElse("");
        return !text.startsWith("任务完成门禁") && !text.startsWith("继续当前任务")
                && !text.startsWith("仍有画布动作") && !text.startsWith("[Agent budget warning]")
                && !text.startsWith("[Agent runtime notice]");
    }

    static List<ChatMessage> refreshReceipts(List<ChatMessage> source, List<AiAgentService.OperationView> receipts, long digestTokens) {
        if (receipts.isEmpty()) return source;
        Map<String, AiAgentService.OperationView> byId = new LinkedHashMap<>();
        List<Map<String, Object>> operations = new ArrayList<>();
        for (var receipt : receipts) {
            byId.put(receipt.operationId(), receipt);
            Map<String, Object> fact = facts(json(receipt.result()));
            fact.put("operationId", receipt.operationId());
            fact.put("status", receipt.status());
            if (receipt.resultRevision() != null) fact.put("resultRevision", receipt.resultRevision());
            operations.add(fact);
        }
        List<ChatMessage> refreshed = new ArrayList<>();
        for (ChatMessage message : source) {
            if (message instanceof UserMessage user && userText(user).startsWith(RECEIPTS_MARKER)) continue;
            if (message instanceof ToolExecutionResultMessage result) {
                Object id = facts(result.text()).get("operationId");
                var receipt = byId.get(id);
                if (receipt != null && !"pending".equals(receipt.status()) && result.toolName().equals(receipt.operationType())) {
                    Map<String, Object> payload = new LinkedHashMap<>(receipt.result() == null ? Map.of() : receipt.result());
                    payload.put("operationId", receipt.operationId());
                    payload.put("status", receipt.status());
                    if (receipt.resultRevision() != null) payload.put("resultRevision", receipt.resultRevision());
                    message = ToolExecutionResultMessage.from(result.id(), result.toolName(),
                            new AiAgentToolCatalog.ToolResult(result.id(), result.toolName(), receipt.status(), payload, false).asJson());
                }
            }
            refreshed.add(message);
        }
        refreshed = new ArrayList<>(AiAgentComponentCatalog.restore(refreshed, receipts));
        refreshed.add(UserMessage.from(SUMMARY_MARKER + "恢复时重新查询的真实操作状态。"
                + DIGEST_MARKER + json(Map.of("operations", operations)) + BUDGET_MARKER + "{}"));
        String digest = stateDigest(refreshed, digestTokens);
        refreshed.set(refreshed.size() - 1, UserMessage.from(RECEIPTS_MARKER + digest));
        return refreshed;
    }

    static boolean essential(List<ChatMessage> group) {
        return group.stream().anyMatch(message -> message instanceof ToolExecutionResultMessage result
                && (READ_TOOLS.contains(result.toolName()) || facts(result.text()).containsKey("operationId")
                || facts(result.text()).containsKey("code")));
    }

    static List<ChatMessage> project(List<ChatMessage> source, long resultTokens, long historyTokens,
                                     boolean protectLatestSpecs) {
        List<ChatMessage> projected = new ArrayList<>(AiAgentComponentCatalog.retainLatestSnapshot(normalize(source)));
        String latestCatalogId = AiAgentComponentCatalog.latestResultId(projected);
        Set<String> protectedIds = new HashSet<>();
        if (protectLatestSpecs) {
            List<List<ChatMessage>> groups = groups(projected);
            for (int i = groups.size() - 1; i >= 0; i--) {
                if (groups.get(i).get(0) instanceof AiMessage ai && ai.hasToolExecutionRequests()) {
                    ai.toolExecutionRequests().stream().filter(call -> AiAgentComponentSpecs.TOOL_NAME.equals(call.name()))
                            .map(ToolExecutionRequest::id).forEach(protectedIds::add);
                    break;
                }
            }
        }
        long remaining = bytesForTokens(historyTokens);
        long resultLimit = bytesForTokens(resultTokens);
        long count = projected.stream().filter(ToolExecutionResultMessage.class::isInstance).count();
        for (int i = projected.size() - 1; i >= 0; i--) {
            if (!(projected.get(i) instanceof ToolExecutionResultMessage result)) continue;
            result = AiAgentComponentCatalog.project(result, latestCatalogId);
            projected.set(i, result);
            count--;
            long available = Math.max(0, remaining - count * 64);
            // 完整目录及首次送入主模型的完整规格不得被截断；容纳不下时由窗口拟合明确失败。
            boolean completeRead = protectedIds.contains(result.id())
                    || AiAgentComponentCatalog.TOOL_NAME.equals(result.toolName()) && result.id().equals(latestCatalogId);
            long limit = completeRead ? Long.MAX_VALUE : Math.min(resultLimit, available);
            String text = result.text();
            if (bytes(text) > limit) {
                text = boundedResult(result, limit);
                projected.set(i, ToolExecutionResultMessage.builder().id(result.id()).toolName(result.toolName())
                        .text(text).isError(result.isError()).attributes(result.attributes()).build());
            }
            remaining = Math.max(0, remaining - bytes(text));
        }
        return projected;
    }

    static long toolBytes(List<ChatMessage> messages) {
        return messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).mapToLong(result -> bytes(result.text())).sum();
    }

    private static String boundedResult(ToolExecutionResultMessage result, long limit) {
        Map<String, Object> parsed = parse(result.text());
        List<Object> diagnostics = extractDiagnostics(parsed);
        if (Boolean.TRUE.equals(result.isError()) && diagnostics.isEmpty()) {
            Map<String, Object> fallback = new LinkedHashMap<>();
            fallback.put("code", "tool_error");
            fallback.put("message", "工具返回了错误，但没有结构化诊断；原始错误内容已保留。");
            fallback.put("actualValue", result.text());
            fallback.put("actualType", "string");
            fallback.put("expected", "成功的工具回执，或包含 code 和 message 的结构化错误");
            diagnostics = List.of(fallback);
        }
        Map<String, Object> reference = Map.of("tool", result.toolName(), "toolCallId", result.id(),
                "source", "original_tool_result");
        if (!diagnostics.isEmpty()) {
            // 错误字段及每条 errors/failed 与组件、路径、实际值、期望值的关联是最小诊断；不以回执引用代替。
            Map<String, Object> complete = new LinkedHashMap<>();
            complete.put("truncated", true);
            complete.put("diagnostics", diagnostics);
            complete.put("reference", reference);
            complete.put("originalBytes", bytes(result.text()));
            String text = json(complete);
            if (bytes(text) <= limit) return text;
            complete.remove("reference");
            complete.remove("originalBytes");
            text = json(complete);
            if (bytes(text) <= limit) return text;
            Map<String, Object> minimum = Map.of("diagnostics", diagnostics);
            text = json(minimum);
            if (bytes(text) <= limit) return text;
            throw new CapacityExceeded("工具错误诊断超过可用结果预算，已停止裁剪以避免丢失错误字段或逐项关联");
        }
        Map<String, Object> essential = new LinkedHashMap<>(facts(result.text()));
        essential.keySet().retainAll(Set.of("operationId", "status", "code", "message", "revision", "resultRevision", "workspaceRevision"));
        for (Object candidate : List.of(
                Map.of("truncated", true, "originalBytes", bytes(result.text()), "reference", reference,
                        "facts", facts(result.text())),
                Map.of("truncated", true, "reference", reference, "facts", essential),
                Map.of("truncated", true, "reference", reference),
                Map.of("truncated", true, "toolCallId", result.id()))) {
            String text = json(candidate);
            if (bytes(text) <= limit) return text;
        }
        throw new CapacityExceeded("工具结果超过可用预算，无法保留有效的裁剪标记和回执引用");
    }

    /** 从原始回执提取恢复事实，携带上一轮摘要，避免连续压缩丢失操作引用。 */
    static String stateDigest(List<ChatMessage> source, long maxTokens) {
        Map<String, Object> operations = new LinkedHashMap<>();
        Set<String> operationIds = new LinkedHashSet<>();
        Set<String> pendingIds = new LinkedHashSet<>();
        Map<String, Object> reads = new LinkedHashMap<>();
        Map<String, Object> canvas = new LinkedHashMap<>();
        Object latestPlan = null;
        Object latestOperation = null;
        Object latestError = null;
        Map<String, ToolExecutionRequest> calls = new HashMap<>();
        for (ChatMessage message : normalize(source)) {
            if (isSummary(message) && message instanceof UserMessage user) {
                String text = userText(user);
                int start = text.indexOf(DIGEST_MARKER);
                int end = text.indexOf(BUDGET_MARKER, start + DIGEST_MARKER.length());
                if ((start >= 0 && end > start) || text.startsWith(RECEIPTS_MARKER)) {
                    Map<String, Object> digest = parse(text.startsWith(RECEIPTS_MARKER)
                            ? text.substring(RECEIPTS_MARKER.length()) : text.substring(start + DIGEST_MARKER.length(), end));
                    addStrings(operationIds, digest.get("operationIds"));
                    addStrings(pendingIds, digest.get("pendingOperationIds"));
                    if (digest.get("operations") instanceof List<?> items) {
                        for (Object item : items) if (item instanceof Map<?, ?> op && op.get("operationId") instanceof String id) {
                            operations.put(id, item);
                            operationIds.add(id);
                            if (Set.of("applied", "failed", "rejected", "error", "cancelled", "completed").contains(String.valueOf(op.get("status")))) pendingIds.remove(id);
                            else pendingIds.add(id);
                            latestOperation = item;
                            for (String key : List.of("managerId", "revision", "resultRevision", "workspaceRevision",
                                    "componentBindings", "draftId", "expectedDraftRevision", "regionId")) {
                                if (op.containsKey(key)) canvas.put(key, op.get(key));
                            }
                        }
                    }
                    if (digest.get("documentAndWorkspaceReads") instanceof List<?> items) {
                        for (Object item : items) reads.put(json(item), item);
                    }
                    canvas.putAll(asMap(digest.get("canvas")));
                    if (digest.get("latestPlan") != null) latestPlan = digest.get("latestPlan");
                    if (digest.get("latestOperation") != null) latestOperation = digest.get("latestOperation");
                    if (digest.get("latestStructuredError") != null) latestError = digest.get("latestStructuredError");
                }
            }
            if (message instanceof AiMessage ai && ai.hasToolExecutionRequests()) {
                ai.toolExecutionRequests().forEach(call -> calls.put(call.id(), call));
            }
            if (!(message instanceof ToolExecutionResultMessage result)) continue;
            Map<String, Object> facts = facts(result.text());
            if (facts.get("operationId") instanceof String id) {
                operations.put(id, facts);
                operationIds.add(id);
                if (Set.of("applied", "failed", "rejected", "error", "cancelled", "completed").contains(String.valueOf(facts.get("status")))) {
                    pendingIds.remove(id);
                } else pendingIds.add(id);
                latestOperation = facts;
            }
            ToolExecutionRequest call = calls.get(result.id());
            if (call != null && READ_TOOLS.contains(call.name())) {
                Map<String, Object> read = new LinkedHashMap<>(facts);
                Map<String, Object> args = parse(call.arguments());
                args.keySet().retainAll(ARGUMENT_KEYS);
                args.replaceAll((key, value) -> boundValue(value, 2_000));
                read.put("toolName", call.name());
                read.put("arguments", args);
                reads.put(call.name() + json(args), read);
            }
            if (call != null && "update_plan".equals(call.name()) && !Set.of("failed", "rejected", "aborted").contains(String.valueOf(facts.get("status")))) {
                latestPlan = boundValue(parse(call.arguments()), bytesForTokens(maxTokens) / 2);
            }
            for (String key : List.of("managerId", "revision", "resultRevision", "workspaceRevision",
                    "componentBindings", "draftId", "expectedDraftRevision", "regionId")) {
                if (facts.containsKey(key)) canvas.put(key, facts.get(key));
            }
            if (facts.containsKey("code") || Set.of("failed", "rejected", "error").contains(String.valueOf(facts.get("status")))) latestError = facts;
        }
        Map<String, Object> digest = new LinkedHashMap<>();
        digest.put("operationIds", operationIds);
        digest.put("pendingOperationIds", pendingIds);
        digest.put("operations", new ArrayList<>(operations.values()));
        digest.put("documentAndWorkspaceReads", reads.values().stream().skip(Math.max(0, reads.size() - 32)).toList());
        digest.put("canvas", canvas);
        digest.put("latestPlan", latestPlan);
        digest.put("latestOperation", latestOperation);
        digest.put("latestStructuredError", latestError);
        String text = json(digest);
        long limit = bytesForTokens(maxTokens);
        if (bytes(text) <= limit) return text;
        Map<String, Object> minimum = new LinkedHashMap<>();
        minimum.put("truncated", true);
        minimum.put("operationIds", operationIds);
        minimum.put("pendingOperationIds", pendingIds);
        if (latestError != null) minimum.put("latestStructuredError", latestError);
        text = json(minimum);
        if (bytes(text) > limit) throw new CapacityExceeded("操作引用超过状态摘要预算，无法安全压缩上下文");
        return text;
    }

    static Map<String, Object> facts(String text) {
        Map<String, Object> facts = new LinkedHashMap<>();
        Map<String, Object> parsed = parse(text);
        collectFacts(parsed, facts, 0);
        List<Object> diagnostics = extractDiagnostics(parsed);
        if (!diagnostics.isEmpty()) facts.put("diagnostics", diagnostics);
        Map<String, Object> body = parsed.get("result") instanceof Map<?, ?> result ? asMap(result) : parsed;
        if (body.get("components") instanceof List<?> components) {
            facts.put("actualComponentCount", components.size());
            facts.put("actualComponentIds", components.stream().filter(Map.class::isInstance)
                    .map(Map.class::cast).map(component -> component.get("id")).filter(String.class::isInstance).limit(100).toList());
            facts.put("actualComponentTypes", components.stream().filter(Map.class::isInstance)
                    .map(Map.class::cast).map(component -> component.get("type")).filter(String.class::isInstance).limit(100).toList());
        }
        if (body.get("specs") instanceof List<?> specs) {
            facts.put("specs", specs.stream().filter(Map.class::isInstance).map(Map.class::cast)
                    .filter(spec -> spec.get("componentType") instanceof String && spec.get("configurable") instanceof Map<?, ?>
                            && spec.get("example") instanceof Map<?, ?>)
                    .limit(10).map(spec -> Map.of("componentType", spec.get("componentType"), "complete", true)).toList());
        }
        return facts;
    }

    private static List<Object> extractDiagnostics(Object value) {
        List<Object> diagnostics = new ArrayList<>();
        collectDiagnostics(value, diagnostics, 0);
        return diagnostics;
    }

    private static void collectDiagnostics(Object value, List<Object> diagnostics, int depth) {
        if (depth > 10) return;
        if (value instanceof Map<?, ?> map) {
            if (map.containsKey("code") || map.containsKey("fieldPath")
                    || map.containsKey("actualValue") && map.containsKey("expected")
                    || map.entrySet().stream().anyMatch(entry -> ERROR_COLLECTION_FIELDS.contains(String.valueOf(entry.getKey()))
                    && entry.getValue() instanceof Collection<?> errors && !errors.isEmpty())) {
                Map<String, Object> record = diagnosticRecord(map);
                if (!record.isEmpty()) diagnostics.add(record);
                return;
            }
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey());
                Object child = entry.getValue();
                if (ERROR_COLLECTION_FIELDS.contains(key) && child instanceof List<?> items) {
                    List<Object> records = new ArrayList<>();
                    for (Object item : items) {
                        if (item instanceof Map<?, ?> itemMap) {
                            records.add(diagnosticRecord(itemMap));
                        } else if (item instanceof String || item instanceof Number || item instanceof Boolean) {
                            records.add(item);
                        }
                    }
                    if (!records.isEmpty()) diagnostics.add(Map.of("sourceField", key, "items", records));
                } else if (child instanceof Map<?, ?> || child instanceof List<?>) {
                    collectDiagnostics(child, diagnostics, depth + 1);
                }
            }
        } else if (value instanceof List<?> list) {
            for (Object item : list) collectDiagnostics(item, diagnostics, depth + 1);
        }
    }

    private static Map<String, Object> diagnosticRecord(Map<?, ?> source) {
        Map<String, Object> record = new LinkedHashMap<>();
        for (String key : DIAGNOSTIC_FIELDS) {
            if (!source.containsKey(key)) continue;
            Object value = source.get(key);
            if (ERROR_COLLECTION_FIELDS.contains(key) && value instanceof List<?> items) {
                List<Object> related = new ArrayList<>();
                for (Object item : items) {
                    if (item instanceof Map<?, ?> map) related.add(diagnosticRecord(map));
                    else related.add(item);
                }
                record.put(key, related);
            } else if (value instanceof Map<?, ?> map && "component".equals(key)) {
                Map<String, Object> component = new LinkedHashMap<>();
                for (String identity : List.of("id", "type", "name")) if (map.containsKey(identity)) component.put(identity, map.get(identity));
                record.put(key, component);
            } else {
                record.put(key, value);
            }
        }
        return record;
    }

    private static void collectFacts(Object value, Map<String, Object> facts, int depth) {
        if (depth > 7) return;
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey());
                if (FACT_KEYS.contains(key) && bytes(json(entry.getValue())) <= 4_000) {
                    if (NON_FLATTENED_ERROR_FIELDS.contains(key)) facts.putIfAbsent(key, entry.getValue());
                    else facts.put(key, entry.getValue());
                }
                collectFacts(entry.getValue(), facts, depth + 1);
            }
        } else if (value instanceof List<?> list) {
            list.stream().limit(12).forEach(child -> collectFacts(child, facts, depth + 1));
        }
    }

    static Map<String, Object> parse(String text) {
        try { return text == null ? new LinkedHashMap<>() : new LinkedHashMap<>(JSON.parseObject(text)); }
        catch (RuntimeException ignored) { return new LinkedHashMap<>(); }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private static void addStrings(Set<String> target, Object values) {
        if (values instanceof Collection<?> list) for (Object item : list) if (item instanceof String text) target.add(text);
    }

    private static Object boundValue(Object value, long limit) {
        String text = json(value);
        return bytes(text) <= limit ? value : Map.of("truncated", true, "summary", truncate(text, Math.max(0, limit - 64)));
    }

    static long bytes(String text) { return text.getBytes(StandardCharsets.UTF_8).length; }
    static long bytesForTokens(long tokens) { return Math.max(0, tokens) * 4; }

    private static String json(Object value) {
        return JSON.toJSONString(value, JSONWriter.Feature.WriteNulls);
    }

    static String truncate(String text, long maxBytes) {
        StringBuilder result = new StringBuilder();
        long used = 0;
        for (int offset = 0; offset < text.length();) {
            int cp = text.codePointAt(offset);
            int size = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
            if (used + size > maxBytes) break;
            result.appendCodePoint(cp);
            used += size;
            offset += Character.charCount(cp);
        }
        return result.toString();
    }

    static final class CapacityExceeded extends IllegalStateException {
        CapacityExceeded(String message) { super(message); }
    }
}
