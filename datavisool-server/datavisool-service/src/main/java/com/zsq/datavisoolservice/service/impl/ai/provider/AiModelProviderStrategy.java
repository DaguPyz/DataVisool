/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.zsq.datavisoolservice.service.impl.ai.AiModelCapabilities;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;

/** 新厂商实现此接口并声明为 Spring Bean 即可注册。 */
public interface AiModelProviderStrategy {
    ProviderDescriptor descriptor();
    ChatModel createChatModel(AiModelConfig config);
    StreamingChatModel createStreamingChatModel(AiModelConfig config);
    AiModelCapabilities capabilities(AiModelConfig config);
    AiModelConfig compatibilityConfig(AiModelConfig config);

    /** 工具请求必须携带所有历史 assistant 的思考字段，包括空字符串。 */
    default boolean requiresAssistantReasoning() { return false; }
}
