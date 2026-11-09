/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.model.po.AiAgentOperationPO;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAgentFrontendBatchTest {
    @Test
    void waitsUntilEveryFrontendOperationHasReturned() {
        AiAgentOperationPO first = operation("operation-1", "applied");
        AiAgentOperationPO second = operation("operation-2", "pending");

        assertFalse(AiAgentService.allFrontendOperationsCompleted(
                List.of("operation-1", "operation-2"), List.of(first, second)));

        second.setStatus("failed");

        assertTrue(AiAgentService.allFrontendOperationsCompleted(
                List.of("operation-1", "operation-2"), List.of(first, second)));
    }

    private AiAgentOperationPO operation(String operationId, String status) {
        AiAgentOperationPO operation = new AiAgentOperationPO();
        operation.setOperationId(operationId);
        operation.setStatus(status);
        return operation;
    }
}
