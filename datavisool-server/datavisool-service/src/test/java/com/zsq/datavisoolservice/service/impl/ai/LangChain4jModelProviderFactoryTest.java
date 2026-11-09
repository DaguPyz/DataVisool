/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.model.openai.OpenAiChatModel;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LangChain4jModelProviderFactoryTest {
    private static AnnotationConfigApplicationContext providers;
    private static LangChain4jModelProviderFactory factory;

    @BeforeAll
    static void loadProviders() {
        providers = new AnnotationConfigApplicationContext(AiProviderTestConfiguration.class);
        factory = providers.getBean(LangChain4jModelProviderFactory.class);
    }

    @AfterAll
    static void closeProviders() { providers.close(); }

    @Test
    void buildsOpenAiCompatibleModelsWithoutCallingProvider() {
        AiModelConfig config = new AiModelConfig("openai", "http://localhost:8080/v1", "test-key", "test-model", 0.2, 128L);

        assertInstanceOf(OpenAiChatModel.class, factory.createChatModel(config));
        assertTrue(factory.capabilities(config).supportsToolCalling());
        assertTrue(factory.capabilities(config).supportsStreaming());
    }

    @Test
    void buildsAnthropicModelThroughDedicatedAdapter() {
        AiModelConfig config = new AiModelConfig("anthropic", "http://localhost:8080", "test-key", "claude-test", 0.2, 128L);

        assertTrue(factory.capabilities(config).supportsToolCalling());
        org.junit.jupiter.api.Assertions.assertNotNull(factory.createChatModel(config));
    }

    @Test
    void contextCapacityResolvesProviderAliasesAndFallsBackForUnknownModels() {
        var known = new AiModelConfig("dashscope", null, "test-key", "qwen3.7-plus", 0.2, 512L);
        org.junit.jupiter.api.Assertions.assertEquals(1_000_000L, factory.contextWindowTokens(known));
        var unknown = new AiModelConfig("dashscope", null, "test-key", "custom-model", 0.2, 512L);
        org.junit.jupiter.api.Assertions.assertNull(factory.contextWindowTokens(unknown));
    }

    @Test
    void unknownAnthropicModelRequiresExplicitBudgetInsteadOfAnInventedDefault() {
        var unknown = new AiModelConfig("anthropic", null, "test-key", "claude-test", 0.2, null);
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class, () -> factory.createChatModel(unknown));
    }
}
