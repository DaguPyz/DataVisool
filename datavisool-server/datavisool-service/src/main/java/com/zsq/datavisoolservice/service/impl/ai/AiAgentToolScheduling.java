/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.Supplier;

/** 独立读取共享执行；写入及交互独占，后续步骤等待整批读取回执。 */
final class AiAgentToolScheduling {
    private static final ConcurrentHashMap<String, Gate> GATES = new ConcurrentHashMap<>();
    private static final class Gate {
        final ReentrantReadWriteLock lock = new ReentrantReadWriteLock(true);
        int users;
    }
    /** 超时只结束等待，底层调用仍可能运行；任务恢复也必须等它退出才可进入独占工具。 */
    static <T> T execute(String scope, String name, Supplier<T> action) {
        Gate gate = GATES.compute(scope, (key, current) -> {
            var value = current == null ? new Gate() : current; value.users++; return value;
        });
        var lock = parallel(name) ? gate.lock.readLock() : gate.lock.writeLock();
        lock.lock();
        try { return action.get(); }
        finally {
            lock.unlock();
            GATES.computeIfPresent(scope, (key, current) -> --current.users == 0 ? null : current);
        }
    }
    private static final Set<String> BARRIERS = Set.of("request_user_input", "request_component_selection",
            "declare_execution_scope", "create_canvas_components", "patch_canvas_components", "delete_canvas_components",
            "render_draft", "confirm_canvas_patch", "discard_canvas_draft", "repair_artifact",
            "begin_canvas_artifact", "write_canvas_artifact", "validate_canvas_artifact");
    static boolean parallel(String name) { return name != null && AiAgentToolCatalog.readOnly(name); }
    static boolean barrier(String name) { return name != null && BARRIERS.contains(name); }
    static int admittedEnd(List<ToolExecutionRequest> requests) {
        for (int i = 0; i < requests.size(); i++) if (barrier(requests.get(i).name())) return i + 1;
        return requests.size();
    }
    static int groupEnd(List<ToolExecutionRequest> requests, int start, int end) {
        if (!parallel(requests.get(start).name())) return start + 1;
        int next = start + 1;
        while (next < end && next - start < 8 && parallel(requests.get(next).name())) next++;
        return next;
    }
}
