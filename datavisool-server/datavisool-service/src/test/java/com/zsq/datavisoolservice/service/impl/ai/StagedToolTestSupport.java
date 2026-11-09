/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

final class StagedToolTestSupport {
    private StagedToolTestSupport() {}

    static AiAgentToolCatalog.ToolResult validate(AiAgentToolCatalog catalog, String tool, String content,
                                                   AiAgentService.AgentExecutionContext context) {
        var result = catalog.execute(call("begin_canvas_artifact", Map.of("toolName", tool)), context);
        for (int offset = 0; offset < content.length(); offset += 1000) {
            result = catalog.execute(call("write_canvas_artifact", Map.of("path", result.result().get("path"),
                    "expectedRevision", result.result().get("workspaceRevision"),
                    "content", content.substring(offset, Math.min(offset + 1000, content.length())))), context);
        }
        return catalog.execute(call("validate_canvas_artifact", Map.of("path", result.result().get("path"),
                "expectedRevision", result.result().get("workspaceRevision"))), context);
    }

    static AiAgentToolCatalog.ToolResult submit(AiAgentToolCatalog catalog, String tool, AiAgentToolCatalog.ToolResult ready,
                                                 AiAgentService.AgentExecutionContext context) {
        Map<String, Object> reference = new LinkedHashMap<>();
        reference.put("path", ready.result().get("path"));
        reference.put("expectedRevision", ready.result().get("workspaceRevision"));
        if ("render_draft".equals(tool)) reference.put("action", "render");
        return catalog.execute(call(tool, reference), context);
    }

    private static ToolExecutionRequest call(String name, Map<String, ?> args) {
        return ToolExecutionRequest.builder().id(UUID.randomUUID().toString()).name(name).arguments(JSON.toJSONString(args)).build();
    }
}
