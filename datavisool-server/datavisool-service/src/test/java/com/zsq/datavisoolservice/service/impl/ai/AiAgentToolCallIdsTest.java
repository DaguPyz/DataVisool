/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentToolCallIdsTest {
    @Test void assignsEveryCallANewIdWithoutChangingContentOrProviderAttributes() {
        var calls = java.util.Arrays.asList(null, "", "duplicate", "duplicate", "provider-id").stream()
                .map(id -> ToolExecutionRequest.builder().id(id).name("lookup").arguments("{\"query\":\"x\"}").build()).toList();
        var original = AiMessage.builder().text("查询中").thinking("reasoning").toolExecutionRequests(calls)
                .attributes(Map.of("signature", "opaque-provider-data")).build();

        var assigned = AiAgentRuntime.assignToolCallIds(original);
        var ids = assigned.toolExecutionRequests().stream().map(ToolExecutionRequest::id).toList();
        assertEquals(calls.size(), new HashSet<>(ids).size());
        for (int i = 0; i < calls.size(); i++) {
            String id = ids.get(i);
            assertNotEquals(calls.get(i).id(), id);
            assertTrue(id.startsWith("call-"));
            assertDoesNotThrow(() -> UUID.fromString(id.substring(5)));
            assertEquals(calls.get(i).name(), assigned.toolExecutionRequests().get(i).name());
            assertEquals(calls.get(i).arguments(), assigned.toolExecutionRequests().get(i).arguments());
        }
        assertEquals(original.text(), assigned.text());
        assertEquals(original.thinking(), assigned.thinking());
        assertEquals(original.attributes(), assigned.attributes());
        assertNull(original.toolExecutionRequests().get(0).id());
        var next = AiAgentRuntime.assignToolCallIds(original);
        assertTrue(next.toolExecutionRequests().stream().noneMatch(call -> ids.contains(call.id())));
    }

    @Test void leavesResponsesWithoutToolCallsUnchanged() {
        var message = AiMessage.from("完成");
        assertSame(message, AiAgentRuntime.assignToolCallIds(message));
        assertNull(AiAgentRuntime.assignToolCallIds(null));
    }
}
