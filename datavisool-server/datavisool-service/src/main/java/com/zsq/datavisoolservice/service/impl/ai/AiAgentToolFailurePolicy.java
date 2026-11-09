/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import java.util.*;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentToolCatalog.ToolResult;

/** 失败按业务身份累计，成功、压缩及恢复不能清零。 */
final class AiAgentToolFailurePolicy {
    private final Map<String, Long> failures = new LinkedHashMap<>();
    private final List<Map<String, Object>> denied = new ArrayList<>();
    private long authorizationRevision;
    AiAgentToolFailurePolicy(Map<String, Object> state) {
        if (state.get("failures") instanceof Map<?, ?> values)
            values.forEach((k, v) -> { if (v instanceof Number n) failures.put(k.toString(), n.longValue()); });
        if (state.get("denied") instanceof List<?> values)
            for (Object v : values) if (v instanceof Map<?, ?> m) denied.add(ComponentDocumentParser.cast(m));
    }
    void authorizationRevision(long revision) { authorizationRevision = revision; }
    ToolResult before(ToolExecutionRequest call) {
        var targets = targets(AiAgentToolProgressGuard.arguments(call));
        for (var denial : denied) {
            if (!call.name().equals(denial.get("tool")) || AiAgentBudget.number(denial, "revision") != authorizationRevision) continue;
            var original = new HashSet<>(list(denial.get("targets")));
            if (original.isEmpty() || targets.isEmpty() || !Collections.disjoint(original, targets))
                throw new Stop("agent.tool.permission_denied", "当前授权已拒绝此动作，禁止换参数重试；需要用户重新授权");
        }
        return null;
    }
    Outcome after(ToolExecutionRequest call, ToolResult result) {
        if (!Set.of("failed", "rejected", "declined", "cancelled").contains(result.status())) return new Outcome(result, false, null);
        var body = result.result();
        String code = Objects.toString(find(body, List.of("code", "kind", "reason")), "tool_execution_failed");
        if ("cancelled".equals(result.status()) || code.contains("cancelled"))
            return new Outcome(result, false, new Stop("agent.tool.cancelled", "工具执行已取消"));
        boolean permission = code.matches("(?i).*(permission.denied|authorization.denied|unauthorized|user.rejected|user.denied).*")
                || "declined".equals(result.status());
        String field = normalizeField(Objects.toString(find(body, List.of("fieldPath", "instancePath", "field", "path")), ""));
        var targets = targets(AiAgentToolProgressGuard.arguments(call));
        String signature = AiAgentToolProgressGuard.canonical(List.of(call.name(), code, field,
                permission ? List.of() : targets, permission ? authorizationRevision : 0));
        long count = failures.merge(signature, 1L, Long::sum);
        Map<String, Object> updated = new LinkedHashMap<>(body);
        Stop stop = null;
        boolean strategy = count == 2;
        if (permission) {
            denied.add(Map.of("tool", call.name(), "targets", targets, "revision", authorizationRevision));
            updated.put("recovery", "当前授权拒绝了此动作，不得换参数或重复读取来重试；需要用户重新授权");
            if (count >= 2) stop = new Stop("agent.tool.permission_denied", "当前授权下重复尝试被拒绝的动作");
        } else if (Boolean.FALSE.equals(body.get("retryable"))) {
            stop = new Stop(code, Objects.toString(body.get("message"), "工具执行失败，无法自动恢复"));
        } else if (count >= 3) {
            stop = new Stop("agent.tool.repeated_failure", "同一工具、错误、字段及目标累计失败三次，任务已停止");
        } else if (strategy) {
            updated.put("recovery", "同类错误已发生两次，必须换策略；下一次同类失败将终止任务");
        }
        updated.put("failureCount", count);
        return new Outcome(new ToolResult(result.requestId(), result.toolName(), result.status(), updated, false), strategy, stop);
    }
    Map<String, Object> snapshot() { return Map.of("failures", new LinkedHashMap<>(failures), "denied", new ArrayList<>(denied)); }
    static String normalizeField(String field) {
        return field.replace('/', '.').replaceAll("\\[\\d+]", ".*").replaceAll("(?<=\\.)\\d+(?=\\.|$)", "*")
                .replaceAll("^\\.+", "");
    }
    private static Object find(Object value, List<String> names) {
        if (value instanceof Map<?, ?> map) {
            for (String key : names) if (map.get(key) instanceof String s && !s.isBlank()) return s;
            for (var entry : map.entrySet()) if (!"config".equals(entry.getKey())) {
                Object found = find(entry.getValue(), names); if (found != null) return found;
            }
        } else if (value instanceof List<?> list) for (Object item : list) {
            Object found = find(item, names); if (found != null) return found;
        }
        return null;
    }
    static List<String> targets(Object args) {
        var targets = new TreeSet<String>(); collect(args, targets); return new ArrayList<>(targets);
    }
    private static void collect(Object value, Set<String> targets) {
        if (value instanceof Map<?, ?> map) for (var entry : map.entrySet()) {
            String key = entry.getKey().toString();
            if (Set.of("componentId", "targetId", "operationId", "path", "from", "to", "fromPath", "toPath", "id").contains(key)
                    && entry.getValue() instanceof String s && !s.isBlank()) targets.add(s);
            else if (Set.of("componentIds", "targetIds").contains(key)) targets.addAll(list(entry.getValue()));
            else if (!Set.of("config", "style", "stylePatch", "dataPatch", "example").contains(key)) collect(entry.getValue(), targets);
        }
        else if (value instanceof List<?> list) for (Object item : list) collect(item, targets);
    }
    private static List<String> list(Object value) {
        return value instanceof List<?> list ? list.stream().filter(String.class::isInstance).map(String.class::cast).toList() : List.of();
    }
    record Outcome(ToolResult result, boolean strategyRequired, Stop stop) {}
    static final class Stop extends RuntimeException {
        final String code;
        Stop(String code, String message) { super(message); this.code = code; }
    }
}
