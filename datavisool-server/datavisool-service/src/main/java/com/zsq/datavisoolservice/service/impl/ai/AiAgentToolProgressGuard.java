/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentToolCatalog.ToolResult;

/** 读取按业务事实去重，缓存只用于已知版本的目录及文件读取。 */
final class AiAgentToolProgressGuard {
    private static final Set<String> READS = Set.of("inspect_current_page", "get_component_catalog", "get_component_snapshots",
            "get_component_data_contract", "get_current_canvas_selection", "get_project_snapshot",
            "get_current_canvas_revision", "get_canvas_operation_status", "get_component_document",
            "resolve_component_specs", "search_component_documents",
            "list_workspace_files", "search_workspace_files", "read_workspace_file");
    private static final Set<String> VOLATILE = Set.of("elapsedMs", "durationMs", "timestamp", "updatedAt", "createdAt",
            "observedAt", "fetchedAt", "checkedAt", "cacheHit", "repeatCount", "fingerprint", "guard",
            "actualExecutionCount", "producedNewFact", "readsWithoutBusinessProgress", "lastProgressSequence");
    private final Set<String> facts = new LinkedHashSet<>();
    private final Map<String, Map<String, Object>> cache = new LinkedHashMap<>();
    private final Map<String, Long> executions = new LinkedHashMap<>();
    private final long repeatLimit;
    private long readsWithoutProgress, sameReadRepeats, sequence, planRepeats, emptySpecs;
    private String lastRead = "", lastPlan = "";
    AiAgentToolProgressGuard(long repeatLimit, Map<String, Object> state) {
        this.repeatLimit = repeatLimit;
        if (state.get("facts") instanceof List<?> list) list.forEach(v -> facts.add(v.toString()));
        if (state.get("cache") instanceof Map<?, ?> map) map.forEach((k,v) -> {
            if (v instanceof Map<?, ?> m) cache.put(k.toString(), ComponentDocumentParser.cast(m));
        });
        if (state.get("executions") instanceof Map<?, ?> map) map.forEach((k,v) -> {
            if (v instanceof Number n) executions.put(k.toString(), n.longValue());
        });
        readsWithoutProgress = AiAgentBudget.number(state, "readsWithoutProgress");
        sameReadRepeats = AiAgentBudget.number(state, "sameReadRepeats");
        sequence = AiAgentBudget.number(state, "sequence");
        planRepeats = AiAgentBudget.number(state, "planRepeats");
        emptySpecs = AiAgentBudget.number(state, "emptySpecs");
        lastRead = Objects.toString(state.get("lastRead"), "");
        lastPlan = Objects.toString(state.get("lastPlan"), "");
    }
    ToolResult before(ToolExecutionRequest call, String sourceVersion) {
        String key = key(call);
        if ("update_plan".equals(call.name())) {
            planRepeats = key.equals(lastPlan) ? planRepeats + 1 : 1;
            lastPlan = key;
            if (planRepeats >= 3) stop("重复更新相同计划三次，没有业务进展");
            return null;
        }
        if (!READS.contains(call.name())) return null;
        if ("resolve_component_specs".equals(call.name()) && emptySpecs >= 3) stop("连续三次没有取得完整组件规格");
        sameReadRepeats = key.equals(lastRead) ? sameReadRepeats + 1 : 1;
        lastRead = key;
        if (!"get_component_catalog".equals(call.name()) && sameReadRepeats > repeatLimit)
            stop("重复读取相同内容达到上限，没有取得新业务事实");
        if (readsWithoutProgress >= repeatLimit) stop("连续读取没有业务进展，必须停止空转");
        var cached = cache.get(key);
        if (cached != null && ("get_component_catalog".equals(call.name())
                || sourceVersion != null && sourceVersion.equals(cached.get("version")))) {
            var body = new LinkedHashMap<>(map(cached.get("result")));
            body.put("guard", metadata(key, true, false, false));
            return new ToolResult(call.id(), call.name(), "completed", body, false);
        }
        return null;
    }
    ToolResult after(ToolExecutionRequest call, ToolResult result) {
        return after(call, result, true);
    }
    ToolResult after(ToolExecutionRequest call, ToolResult result, boolean executed) {
        String key = key(call);
        boolean hit = Boolean.TRUE.equals(map(result.result().get("guard")).get("cacheHit"));
        if (executed && !hit) executions.merge(key, 1L, Long::sum);
        boolean success = Set.of("completed", "applied", "appended").contains(result.status());
        boolean write = AiAgentRuntime.isWriteTool(call.name()) && !"discard_canvas_draft".equals(call.name())
                && ("applied".equals(result.status()) || "repair_required".equals(result.status())
                && Boolean.TRUE.equals(result.result().get("artifactUpdated"))
                || Set.of("writing", "validated").contains(result.status())
                && Boolean.TRUE.equals(result.result().get("artifactUpdated")));
        success = success || write;
        boolean newFact = !hit && success && (write || READS.contains(call.name())) && recordFacts(call, result.result(), write);
        if ("resolve_component_specs".equals(call.name()) && !Set.of("pending", "prepared", "applying", "waiting_input").contains(result.status()))
            emptySpecs = success && completeSpecs(result.result()) ? 0 : emptySpecs + 1;
        if ("update_plan".equals(call.name()) && !success) { lastPlan = ""; planRepeats = 0; }
        if (newFact) {
            readsWithoutProgress = 0; sameReadRepeats = 0; lastRead = ""; sequence++;
            if (write) { cache.entrySet().removeIf(e -> !e.getKey().startsWith("get_component_catalog|")); emptySpecs = 0; }
        } else if (READS.contains(call.name()) && !Set.of("pending", "prepared", "applying", "waiting_input", "deferred").contains(result.status())) {
            // 只有实际结果已返回才能判断无进展；并行派发和等待回执不计为空转。
            readsWithoutProgress++;
        }
        String version = version(result.result());
        if (!hit && success && version != null && (AiAgentToolCatalog.workspaceRead(call.name()) || "get_component_catalog".equals(call.name()))
                && JSON.toJSONString(result.result()).getBytes(StandardCharsets.UTF_8).length <= 65_536) {
            cache.put(key, Map.of("version", version, "result", new LinkedHashMap<>(result.result())));
            while (cache.size() > 16) cache.remove(cache.keySet().iterator().next());
        }
        var body = new LinkedHashMap<>(result.result());
        body.put("guard", metadata(key, hit, newFact, write));
        return new ToolResult(result.requestId(), result.toolName(), result.status(), body, result.requiresFrontendEffect());
    }
    private Map<String, Object> metadata(String key, boolean hit, boolean newFact, boolean write) {
        return Map.of("fingerprint", hash(key), "repeatCount", sameReadRepeats, "actualExecutionCount", executions.getOrDefault(key, 0L),
                "cacheHit", hit, "producedNewFact", newFact, "businessWrite", write,
                "readsWithoutBusinessProgress", readsWithoutProgress, "lastProgressSequence", sequence);
    }
    private boolean recordFacts(ToolExecutionRequest call, Map<String, Object> body, boolean write) {
        if (write) return insert(List.of("write", call.name(), clean(body)));
        if ("resolve_component_specs".equals(call.name())) {
            String intent = Objects.toString(arguments(call).getOrDefault("intent", body.get("intent")), "");
            Object version = body.get("corpusVersion");
            if (intent.isBlank() || version == null || version.toString().isBlank()) return false;
            boolean changed = false;
            for (Object raw : list(body.get("specs"))) {
                var spec = map(raw);
                if (completeSpec(spec)) changed |= insert(List.of("spec", spec.get("componentType"), intent, version));
            }
            return changed;
        }
        if ("inspect_current_page".equals(call.name())) {
            Object revision = body.getOrDefault("revision", body.getOrDefault("workspaceRevision", ""));
            boolean changed = false;
            for (Object raw : list(body.get("components"))) {
                var component = map(raw);
                Object id = component.getOrDefault("id", component.get("componentId"));
                if (id instanceof String s && !s.isBlank()) changed |= insert(List.of("canvas", revision, id));
            }
            for (Object id : list(body.get("missingComponentIds"))) changed |= insert(List.of("missing", revision, id));
            return changed;
        }
        return insert(List.of(call.name(), clean(body)));
    }
    private boolean insert(Object value) {
        if (facts.size() >= 8_192) stop("任务事实记录已达安全上限，请结束当前任务");
        return facts.add(hash(canonical(value)));
    }
    private static boolean completeSpecs(Map<String, Object> body) {
        return list(body.get("specs")).stream().anyMatch(v -> completeSpec(map(v)));
    }
    private static boolean completeSpec(Map<String, Object> spec) {
        return spec.get("componentType") instanceof String type && !type.isBlank()
                && !map(spec.get("configurable")).isEmpty() && !map(spec.get("example")).isEmpty()
                && (!spec.containsKey("dataRequirements") || spec.get("dataRequirements") instanceof String)
                && (!spec.containsKey("constraints") || spec.get("constraints") instanceof List<?>);
    }
    private static Object clean(Object value) {
        if (value instanceof Map<?, ?> map) {
            var result = new TreeMap<String, Object>();
            map.forEach((k,v) -> { if (!VOLATILE.contains(k.toString())) result.put(k.toString(), clean(v)); });
            return result;
        }
        if (value instanceof List<?> list) return list.stream().map(AiAgentToolProgressGuard::clean).toList();
        return value;
    }
    static Map<String, Object> arguments(ToolExecutionRequest call) {
        try { return map(JSON.parse(call.arguments())); } catch (RuntimeException e) { return Map.of("_invalid", Objects.toString(call.arguments(), "")); }
    }
    static String key(ToolExecutionRequest call) {
        var args = new LinkedHashMap<>(arguments(call));
        if ("resolve_component_specs".equals(call.name()) && args.get("componentTypes") instanceof List<?> types)
            args.put("componentTypes", types.stream().filter(String.class::isInstance).map(v -> v.toString().trim()).distinct().sorted().toList());
        return call.name() + "|" + canonical(args);
    }
    static String canonical(Object value) {
        if (value instanceof Map<?, ?> map) {
            var sorted = new TreeMap<String, Object>(); map.forEach((k,v) -> sorted.put(k.toString(), canonicalValue(v)));
            return JSON.toJSONString(sorted);
        }
        return JSON.toJSONString(canonicalValue(value));
    }
    private static Object canonicalValue(Object value) {
        if (value instanceof Map<?, ?> m) {
            var sorted = new TreeMap<String, Object>(); m.forEach((k,v) -> sorted.put(k.toString(), canonicalValue(v))); return sorted;
        }
        return value instanceof List<?> list ? list.stream().map(AiAgentToolProgressGuard::canonicalValue).toList() : value;
    }
    static Map<String, Object> map(Object value) { return value instanceof Map<?, ?> m ? ComponentDocumentParser.cast(m) : Map.of(); }
    private static List<?> list(Object value) { return value instanceof List<?> list ? list : List.of(); }
    static String version(Map<String, Object> body) {
        for (String key : List.of("sourceVersion", "corpusVersion", "catalogVersion", "workspaceRevision", "revision", "version"))
            if (body.get(key) != null) return body.get(key).toString();
        return body.get("excerpt") instanceof Map<?, ?> m ? version(map(m)) : null;
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    private static void stop(String message) { throw new AiAgentToolFailurePolicy.Stop("agent.tool.no_progress", message); }
    Map<String, Object> snapshot() {
        var state = new LinkedHashMap<String, Object>();
        state.put("facts", new ArrayList<>(facts)); state.put("cache", new LinkedHashMap<>(cache));
        state.put("executions", new LinkedHashMap<>(executions)); state.put("readsWithoutProgress", readsWithoutProgress);
        state.put("sameReadRepeats", sameReadRepeats); state.put("sequence", sequence); state.put("planRepeats", planRepeats);
        state.put("emptySpecs", emptySpecs); state.put("lastRead", lastRead); state.put("lastPlan", lastPlan);
        return state;
    }
}
