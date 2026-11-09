/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import java.util.Map;

public interface FrontendEffectGateway {
    AiAgentService.OperationView request(
            AiAgentService.AgentExecutionContext context,
            String operationType,
            Map<String, Object> request,
            String baseRevision
    );
}
