/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import org.springframework.stereotype.Service;

import java.util.Map;

/** Web 实现只记录待执行效果，由浏览器桥接层实际执行。 */
@Service
public class WebFrontendEffectGateway implements FrontendEffectGateway {
    private final AiAgentService agentService;

    public WebFrontendEffectGateway(AiAgentService agentService) {
        this.agentService = agentService;
    }

    @Override
    public AiAgentService.OperationView request(
            AiAgentService.AgentExecutionContext context,
            String operationType,
            Map<String, Object> request,
            String baseRevision
    ) {
        return agentService.createFrontendOperation(context, operationType, request, baseRevision);
    }
}
