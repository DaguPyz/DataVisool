/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;

/** 原生策略实现协议转换，共用传输与超时处理。 */
public abstract class AiNativeProviderStrategy extends AiProviderStrategySupport implements AiNativeCodec {
    @Override
    public ChatModel createChatModel(AiModelConfig config) {
        return new AiNativeChatModel(config, this, AiNativeChatModel.REQUEST_TIMEOUT);
    }

    @Override
    public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
        return new AiNativeChatModel(config, this, AiNativeChatModel.REQUEST_TIMEOUT).streaming();
    }
}
