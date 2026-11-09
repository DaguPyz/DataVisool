/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import java.util.*;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentToolCatalog.ToolResult;
import static com.zsq.datavisoolservice.service.impl.ai.AiAgentToolProgressGuard.map;

/** 用量内的私有状态与检查点共同保存；对外事件及查询不包含缓存正文。 */
final class AiAgentToolGuard {
    private final AiAgentToolFailurePolicy failures;
    private final AiAgentToolProgressGuard progress;
    private final Map<String, Map<String, Object>> pending = new LinkedHashMap<>();
    AiAgentToolGuard(long repeatLimit, Map<String, Object> state) {
        failures = new AiAgentToolFailurePolicy(map(state.get("failure")));
        progress = new AiAgentToolProgressGuard(repeatLimit, map(state.get("progress")));
        map(state.get("pending")).forEach((k,v) -> pending.put(k, map(v)));
    }
    void authorizationRevision(long revision) { failures.authorizationRevision(revision); }
    ToolResult before(ToolExecutionRequest call, String version) {
        failures.before(call);
        return progress.before(call, version);
    }
    void beforeResume(ToolExecutionRequest call) { failures.before(call); }
    AiAgentToolFailurePolicy.Outcome after(ToolExecutionRequest call, ToolResult result) {
        if (result.requiresFrontendEffect() && result.result().get("operationId") instanceof String id)
            pending.put(id, Map.of("id", call.id(), "name", call.name(), "arguments", call.arguments()));
        return failures.after(call, progress.after(call, result));
    }
    List<AiAgentToolFailurePolicy.Outcome> receipts(List<AiAgentService.OperationView> receipts) {
        var outcomes = new ArrayList<AiAgentToolFailurePolicy.Outcome>();
        for (var receipt : receipts) {
            var request = pending.get(receipt.operationId());
            if (request == null || !Set.of("applied", "completed", "failed", "rejected", "declined", "cancelled").contains(receipt.status())) continue;
            pending.remove(receipt.operationId());
            var call = ToolExecutionRequest.builder().id(request.get("id").toString()).name(request.get("name").toString())
                    .arguments(request.get("arguments").toString()).build();
            var body = new LinkedHashMap<>(receipt.result());
            body.put("operationId", receipt.operationId());
            if (receipt.resultRevision() != null) body.put("revision", receipt.resultRevision());
            if ("rejected".equals(receipt.status()) && !body.containsKey("code")) body.put("code", "user_rejected");
            outcomes.add(failures.after(call, progress.after(call,
                    new ToolResult(call.id(), call.name(), receipt.status(), body, false), false)));
        }
        return outcomes;
    }
    Map<String, Object> snapshot() {
        return Map.of("failure", failures.snapshot(), "progress", progress.snapshot(), "pending", new LinkedHashMap<>(pending));
    }
}
