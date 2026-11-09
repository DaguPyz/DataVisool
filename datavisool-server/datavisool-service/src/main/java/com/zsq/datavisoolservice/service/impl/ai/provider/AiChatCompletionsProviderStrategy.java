/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.zsq.datavisoolservice.service.impl.ai.AiModelWireTrace;
import com.zsq.datavisoolservice.service.impl.ai.AiModelConfig;
import dev.langchain4j.http.client.HttpClientBuilder;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiChatRequestParameters;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;

/** 共用 Chat Completions 传输，策略通过方法提供厂商参数。 */
public abstract class AiChatCompletionsProviderStrategy extends AiProviderStrategySupport {
    protected boolean sendThinking() { return true; }
    protected boolean completionTokenLimit() { return false; }
    protected boolean strictTools() { return false; }
    protected boolean accumulateToolCallId() { return false; }
    protected int maxRetries() { return 0; }

    @Override
    public ChatModel createChatModel(AiModelConfig config) { return buildChatModel(config, maxRetries()); }

    protected ChatModel buildChatModel(AiModelConfig config, int retries) {
        return buildChatModel(config, retries, sendThinking());
    }

    protected ChatModel buildChatModel(AiModelConfig config, int retries, boolean sendThinkingForRequest) {
        return buildChatModel(config, retries, sendThinkingForRequest, requiresAssistantReasoning());
    }

    protected ChatModel buildChatModel(AiModelConfig config, int retries, boolean sendThinkingForRequest, boolean requireReasoningField) {
        var builder = OpenAiChatModel.builder().baseUrl(compatibleBaseUrl(config))
                .apiKey(config.apiKey() == null ? "ollama" : config.apiKey()).modelName(config.modelName())
                .temperature(config.temperature()).timeout(AiNativeChatModel.REQUEST_TIMEOUT)
                .httpClientBuilder(httpClientBuilder(config, requireReasoningField)).maxRetries(retries)
                .strictTools(strictTools()).returnThinking(true).sendThinking(sendThinkingForRequest, "reasoning_content");
        if (config.maxTokens() != null) {
            if (completionTokenLimit()) builder.maxCompletionTokens(AiProviderEndpoints.tokenLimit(config.maxTokens()));
            else builder.maxTokens(AiProviderEndpoints.tokenLimit(config.maxTokens()));
        }
        if (!completionTokenLimit()) return builder.build();
        return new OpenAiChatModel(builder) {
            @Override public ChatResponse doChat(ChatRequest request) {
                return super.doChat(completionRequest(request));
            }
        };
    }

    @Override
    public StreamingChatModel createStreamingChatModel(AiModelConfig config) {
        return buildStreamingChatModel(config, sendThinking());
    }

    protected StreamingChatModel buildStreamingChatModel(AiModelConfig config, boolean sendThinkingForRequest) {
        return buildStreamingChatModel(config, sendThinkingForRequest, requiresAssistantReasoning());
    }

    protected StreamingChatModel buildStreamingChatModel(AiModelConfig config, boolean sendThinkingForRequest, boolean requireReasoningField) {
        var builder = OpenAiStreamingChatModel.builder().baseUrl(compatibleBaseUrl(config))
                .apiKey(config.apiKey() == null ? "ollama" : config.apiKey()).modelName(config.modelName())
                .temperature(config.temperature()).timeout(AiNativeChatModel.REQUEST_TIMEOUT).strictTools(strictTools())
                .httpClientBuilder(httpClientBuilder(config, requireReasoningField))
                .returnThinking(true).sendThinking(sendThinkingForRequest, "reasoning_content").accumulateToolCallId(accumulateToolCallId());
        if (config.maxTokens() != null) {
            if (completionTokenLimit()) builder.maxCompletionTokens(AiProviderEndpoints.tokenLimit(config.maxTokens()));
            else builder.maxTokens(AiProviderEndpoints.tokenLimit(config.maxTokens()));
        }
        if (!completionTokenLimit()) return builder.build();
        return new OpenAiStreamingChatModel(builder) {
            @Override public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                super.doChat(completionRequest(request), handler);
            }
        };
    }

    private HttpClientBuilder httpClientBuilder(AiModelConfig config, boolean requireReasoningField) {
        HttpClientBuilder builder = AiModelWireTrace.httpClientBuilder(config.provider());
        // 在日志记录前补齐字段，让诊断日志始终反映实际发送内容。
        return requireReasoningField ? AiDeepSeekReasoningHttpClient.builder(builder) : builder;
    }

    /** SDK 将通用请求预算映射为 max_tokens；这些厂商需使用同一个 max_completion_tokens 覆盖默认预算。 */
    protected ChatRequest completionRequest(ChatRequest request) {
        if (request.maxOutputTokens() == null) return request;
        var parameters = OpenAiChatRequestParameters.builder().overrideWith(request.parameters())
                .maxCompletionTokens(request.maxOutputTokens()).maxOutputTokens(null).build();
        return request.toBuilder().parameters(parameters).build();
    }
}
