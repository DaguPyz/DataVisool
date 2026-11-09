/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import dev.langchain4j.model.output.TokenUsage;

/** 原生协议保留缓存子项；未知值维持 null。 */
public final class AiProviderTokenUsage extends TokenUsage {
    private final Integer cached, created;
    public AiProviderTokenUsage(Integer input, Integer output, Integer total, Integer cached, Integer created) {
        super(input, output, total == null && input != null && output != null ? input + output : total);
        this.cached = cached; this.created = created;
    }
    public Integer cachedInputTokens() { return cached; }
    public Integer cacheCreationInputTokens() { return created; }
}
