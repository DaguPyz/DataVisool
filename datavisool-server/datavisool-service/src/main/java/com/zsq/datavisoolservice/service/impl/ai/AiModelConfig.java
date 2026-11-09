/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

public record AiModelConfig(
        String provider,
        String baseUrl,
        String apiKey,
        String modelName,
        Double temperature,
        Long maxTokens
) {
}
