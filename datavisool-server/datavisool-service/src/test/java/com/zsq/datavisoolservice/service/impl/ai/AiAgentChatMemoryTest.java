/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.data.message.UserMessage;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAgentChatMemoryTest {
    @Test
    void keepsModelContextSeparateFromProductItems() {
        AiAgentChatMemory memory = new AiAgentChatMemory("turn-1", List.of(UserMessage.from("hello")));

        memory.add(UserMessage.from("continue"));

        assertEquals("turn-1", memory.id());
        assertEquals(2, memory.messages().size());
        memory.replace(List.of(UserMessage.from("compacted")));
        assertEquals(1, memory.messages().size());
        assertEquals("compacted", ((UserMessage) memory.messages().get(0)).singleText());
        memory.clear();
        assertEquals(0, memory.messages().size());
    }
}
