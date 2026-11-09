/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai.provider;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.openai.OpenAiChatRequestParameters;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Mimo 官方 Chat Completions 策略。 */
@Component
public final class AiMimoProviderStrategy extends AiChatCompletionsProviderStrategy {
    private static final ProviderDescriptor DESCRIPTOR = new ProviderDescriptor("mimo",
            Set.of("xiaomi", "xiaomi-mimo"), "https://api.xiaomimimo.com/v1", true, true);

    @Override public ProviderDescriptor descriptor() { return DESCRIPTOR; }
    @Override protected boolean completionTokenLimit() { return true; }
    @Override protected boolean strictTools() { return true; }
    @Override protected boolean supportsReasoning(String model) { return true; }

    @Override
    protected ChatRequest completionRequest(ChatRequest request) {
        var prepared = super.completionRequest(request);
        if (prepared.toolSpecifications() == null || prepared.toolSpecifications().isEmpty()) return prepared;
        // 只开启 MiMo 的 strict 标志；SDK 的严格转换会关闭动态 config，并将可选字段改为必填 null。
        var tools = prepared.toolSpecifications().stream().map(tool -> {
            var function = JSON.parseObject(tool.toJson());
            function.remove("metadata");
            function.put("strict", true);
            return Map.of("type", "function", "function", function);
        }).toList();
        var custom = new LinkedHashMap<String, Object>();
        if (prepared.parameters() instanceof OpenAiChatRequestParameters existing && existing.customParameters() != null)
            custom.putAll(existing.customParameters());
        custom.put("tools", tools);
        // 清空 SDK 的工具列表，避免与 customParameters 中的 tools 重复序列化。
        var parameters = OpenAiChatRequestParameters.builder().overrideWith(prepared.parameters())
                .toolSpecifications(List.of()).customParameters(custom).build();
        return prepared.toBuilder().parameters(parameters).build();
    }
}

