/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.service.impl.ai.extension.TestExtensionProviderStrategy;
import com.zsq.datavisoolservice.service.impl.ai.provider.*;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class AiModelProviderRegistryTest {
    @Test
    void discoversAnAdditionalStrategyWithoutChangingTheFactoryOrRegistry() throws Exception {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.register(AiProviderTestConfiguration.class);
            context.scan("com.zsq.datavisoolservice.service.impl.ai.extension");
            context.refresh();
            var registry = context.getBean(AiModelProviderRegistry.class);
            var strategy = context.getBean(TestExtensionProviderStrategy.class);
            assertSame(strategy, registry.find(" EXTRA-PROVIDER ").orElseThrow());
            assertSame(strategy, registry.find("test-extension").orElseThrow());
            var factory = context.getBean(LangChain4jModelProviderFactory.class);
            var config = new AiModelConfig("extra-provider", null, null, "custom-model", null, 128L);
            var request = ChatRequest.builder().messages(UserMessage.from("hello")).build();
            assertEquals("extension", factory.createChatModel(config).chat(request).aiMessage().text());
            assertEquals("test-extension", strategy.receivedConfig.provider());
            assertEquals("https://extension.invalid/v9", strategy.receivedConfig.baseUrl());
            assertNull(strategy.receivedConfig.apiKey());
            assertEquals(0.7, strategy.receivedConfig.temperature());
            assertTrue(factory.capabilities(config).supportsVision());
            assertEquals(64_000L, factory.capabilities(config).maxContextTokens());
            CompletableFuture<ChatResponse> streamed = new CompletableFuture<>();
            factory.createStreamingChatModel(config).chat(request, new StreamingChatResponseHandler() {
                @Override public void onCompleteResponse(ChatResponse response) { streamed.complete(response); }
                @Override public void onError(Throwable error) { streamed.completeExceptionally(error); }
            });
            assertEquals("extension", streamed.get(1, TimeUnit.SECONDS).aiMessage().text());
        }
    }

    @Test
    void rejectsDuplicateProviderKeys() {
        assertThrows(IllegalArgumentException.class, () -> new AiModelProviderRegistry(
                List.of(new AiOpenAiProviderStrategy(), new AiOpenAiProviderStrategy())));
    }

    @Test
    void rejectsAliasesThatCollideWithAnExistingProviderIgnoringCase() {
        var duplicate = new AiChatCompletionsProviderStrategy() {
            @Override public ProviderDescriptor descriptor() {
                return new ProviderDescriptor("extra", Set.of(" OpenAI "), "https://example.invalid", true, true);
            }
        };
        assertThrows(IllegalArgumentException.class, () -> new AiModelProviderRegistry(List.of(new AiOpenAiProviderStrategy(), duplicate)));
    }

    @Test
    void rejectsBlankProviderKeys() {
        var invalid = new AiChatCompletionsProviderStrategy() {
            @Override public ProviderDescriptor descriptor() { return new ProviderDescriptor(" ", Set.of(), null, true, true); }
        };
        assertThrows(IllegalArgumentException.class, () -> new AiModelProviderRegistry(List.of(invalid)));
    }

    @Test
    void unknownProvidersRequireAnExplicitCompatibilityAddress() {
        try (var context = new AnnotationConfigApplicationContext(AiProviderTestConfiguration.class)) {
            var factory = context.getBean(LangChain4jModelProviderFactory.class);
            assertThrows(IllegalArgumentException.class,
                    () -> factory.createChatModel(new AiModelConfig("unknown", null, "key", "model", 0.2, 128L)));
        }
    }
}
