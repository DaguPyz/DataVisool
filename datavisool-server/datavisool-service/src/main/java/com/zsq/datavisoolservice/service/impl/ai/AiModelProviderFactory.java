/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;

public interface AiModelProviderFactory {
    ChatModel createChatModel(AiModelConfig config);

    StreamingChatModel createStreamingChatModel(AiModelConfig config);

    AiModelCapabilities capabilities(AiModelConfig config);

    default Long contextWindowTokens(AiModelConfig config) {
        return AiDrivenModelCatalog.contextWindowTokens(config.provider(), config.modelName());
    }
}
