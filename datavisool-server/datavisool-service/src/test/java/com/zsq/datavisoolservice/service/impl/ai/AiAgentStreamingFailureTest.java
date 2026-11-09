/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentStreamingFailureTest {
    private final AtomicInteger events = new AtomicInteger();
    private final AiAgentRuntime runtime = new AiAgentRuntime();
    private final ChatRequest request = ChatRequest.builder().messages(UserMessage.from("hello")).build();
    private final AiAgentService.AgentExecutionContext context = new AiAgentService.AgentExecutionContext(
            "thread", "project", "turn", "run", "user", "hello", Map.of(), Map.of(), Map.of(), null, null, 0);

    AiAgentStreamingFailureTest() {
        ReflectionTestUtils.setField(runtime, "agentService", new AiAgentService() {
            @Override
            public void appendEvent(String threadId, String turnId, String runId, String type, Map<String, Object> payload) {
                events.incrementAndGet();
            }
        });
    }

    @Test
    void preventsSynchronousFallbackAfterPartialOutput() {
        StreamingChatModel model = new StreamingChatModel() {
            @Override
            public void doChat(ChatRequest request, StreamingChatResponseHandler handler) {
                handler.onPartialResponse("partial");
                handler.onError(new IllegalStateException("interrupted"));
            }
        };
        RuntimeException failure = assertThrows(RuntimeException.class,
                () -> ReflectionTestUtils.invokeMethod(runtime, "stream", model, request, context, "item", 1L));
        assertFalse(AiProviderFallback.canFallback(failure));
        assertEquals(1, events.get());
    }

    @Test
    void discardsCallbacksFromAStreamAfterTimeout() {
        AtomicReference<StreamingChatResponseHandler> pending = new AtomicReference<>();
        StreamingChatModel model = new StreamingChatModel() {
            @Override
            public void doChat(ChatRequest request, StreamingChatResponseHandler handler) { pending.set(handler); }
        };
        assertThrows(RuntimeException.class,
                () -> ReflectionTestUtils.invokeMethod(runtime, "stream", model, request, context, "item", 0L));
        pending.get().onPartialResponse("late");
        assertEquals(0, events.get());
    }
}
