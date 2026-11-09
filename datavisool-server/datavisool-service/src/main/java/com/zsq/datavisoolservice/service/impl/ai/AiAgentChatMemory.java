/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.memory.ChatMemory;

import java.util.ArrayList;
import java.util.List;

/** LangChain4j 上下文窗口适配层，不承担产品历史记录职责。 */
public class AiAgentChatMemory implements ChatMemory {
    private final String id;
    private final List<ChatMessage> messages = new ArrayList<>();

    public AiAgentChatMemory(String id, List<ChatMessage> initialMessages) {
        this.id = id;
        if (initialMessages != null) {
            messages.addAll(initialMessages);
        }
    }

    @Override
    public Object id() {
        return id;
    }

    @Override
    public void add(ChatMessage message) {
        messages.add(message);
    }

    @Override
    public List<ChatMessage> messages() {
        return List.copyOf(messages);
    }

    @Override
    public void clear() {
        messages.clear();
    }

    public void replace(List<ChatMessage> replacement) {
        messages.clear();
        if (replacement != null) {
            messages.addAll(replacement);
        }
    }
}
