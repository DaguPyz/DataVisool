/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

public record AiModelCapabilities(
        boolean supportsToolCalling,
        boolean supportsStreaming,
        boolean supportsVision,
        boolean supportsStructuredOutput,
        boolean supportsReasoning,
        long maxContextTokens
) {
}
