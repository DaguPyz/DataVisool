/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 目录始终保留最新完整列表；旧回执只保留引用，原始审计记录不变。 */
final class AiAgentComponentCatalog {
    static final String TOOL_NAME = "get_component_catalog";
    private static final String SNAPSHOT_MARKER = "[Agent component catalog]\n";
    private static final String SNAPSHOT_ID = "restored_component_catalog";
    private static final List<String> SELECTION_FIELDS = List.of("componentType", "componentName", "description");

    private AiAgentComponentCatalog() {}

    static String latestResultId(List<ChatMessage> messages) {
        String latest = null;
        for (ChatMessage message : messages) {
            if (isSnapshot(message)) latest = SNAPSHOT_ID;
            if (message instanceof ToolExecutionResultMessage result && TOOL_NAME.equals(result.toolName())
                    && !Boolean.TRUE.equals(result.isError()) && !Set.of("pending", "failed", "rejected", "aborted", "cancelled")
                    .contains(String.valueOf(AiAgentContextHistory.facts(result.text()).get("status")))
                    && catalog(AiAgentContextHistory.parse(result.text())) != null) latest = result.id();
        }
        return latest;
    }

    static boolean containsResult(List<ChatMessage> group, String id) {
        if (SNAPSHOT_ID.equals(id)) return group.stream().anyMatch(AiAgentComponentCatalog::isSnapshot);
        return id != null && group.stream().anyMatch(message -> message instanceof ToolExecutionResultMessage result
                && TOOL_NAME.equals(result.toolName()) && id.equals(result.id()));
    }

    static boolean isSnapshot(ChatMessage message) {
        return message instanceof UserMessage user && AiAgentContextHistory.userText(user).startsWith(SNAPSHOT_MARKER);
    }

    /** 升级前目录工具组可能已被裁掉；用真实回执恢复选择信息，不重新执行查询。 */
    static List<ChatMessage> restore(List<ChatMessage> messages, List<AiAgentService.OperationView> receipts) {
        Map<String, Object> latestReceipt = null;
        for (var receipt : receipts) {
            if (TOOL_NAME.equals(receipt.operationType()) && Set.of("applied", "completed").contains(receipt.status())
                    && receipt.result() != null && catalog(receipt.result()) != null) latestReceipt = catalog(receipt.result());
        }
        if (latestReceipt == null) return messages;
        Map<String, Object> current = null;
        String latestId = latestResultId(messages);
        for (ChatMessage message : messages) {
            if (isSnapshot(message) && SNAPSHOT_ID.equals(latestId)) {
                current = AiAgentContextHistory.parse(AiAgentContextHistory.userText((UserMessage) message).substring(SNAPSHOT_MARKER.length()));
            } else if (message instanceof ToolExecutionResultMessage result && result.id().equals(latestId)) {
                current = catalog(AiAgentContextHistory.parse(result.text()));
            }
        }
        Map<String, Object> selection = projectBody(latestReceipt, true);
        if (current != null && selection.equals(projectBody(current, true))) return messages;
        List<ChatMessage> restored = new ArrayList<>(messages);
        restored.add(UserMessage.from(SNAPSHOT_MARKER + JSON.toJSONString(selection)));
        return retainLatestSnapshot(restored);
    }

    /** 恢复快照和工具结果共享同一份目录，版本变化后旧快照也不保留。 */
    static List<ChatMessage> retainLatestSnapshot(List<ChatMessage> messages) {
        boolean retain = SNAPSHOT_ID.equals(latestResultId(messages));
        int latestSnapshot = -1;
        for (int i = 0; i < messages.size(); i++) if (isSnapshot(messages.get(i))) latestSnapshot = i;
        List<ChatMessage> result = new ArrayList<>();
        for (int i = 0; i < messages.size(); i++) {
            ChatMessage message = messages.get(i);
            if (isSnapshot(message)) {
                if (!retain || i != latestSnapshot) continue;
                var body = AiAgentContextHistory.parse(AiAgentContextHistory.userText((UserMessage) message).substring(SNAPSHOT_MARKER.length()));
                message = UserMessage.from(SNAPSHOT_MARKER + JSON.toJSONString(projectBody(body, true)));
            }
            result.add(message);
        }
        return result;
    }

    static ToolExecutionResultMessage project(ToolExecutionResultMessage result, String latestId) {
        if (!TOOL_NAME.equals(result.toolName())) return result;
        Map<String, Object> parsed = AiAgentContextHistory.parse(result.text());
        if (catalog(parsed) == null) return result;
        String text = JSON.toJSONString(projectBody(parsed, result.id().equals(latestId)));
        return ToolExecutionResultMessage.builder().id(result.id()).toolName(result.toolName()).text(text)
                .isError(result.isError()).attributes(result.attributes()).build();
    }

    private static Map<String, Object> catalog(Map<String, Object> body) {
        if (body.get("catalogVersion") instanceof String && body.get("components") instanceof List<?>) return body;
        return body.get("result") instanceof Map<?, ?> nested ? catalog(ComponentDocumentParser.cast(nested)) : null;
    }

    private static Map<String, Object> projectBody(Map<String, Object> body, boolean latest) {
        if (body.get("catalogVersion") instanceof String && body.get("components") instanceof List<?> components) {
            if (!latest) return Map.of("catalogVersion", body.get("catalogVersion"),
                    "reference", "latest_component_catalog", "superseded", true);
            List<Map<String, Object>> entries = new ArrayList<>();
            for (Object value : components) {
                if (!(value instanceof Map<?, ?> raw)) continue;
                Map<String, Object> component = ComponentDocumentParser.cast(raw);
                Map<String, Object> info = component.get("componentInfo") instanceof Map<?, ?> nested
                        ? ComponentDocumentParser.cast(nested) : Map.of();
                Map<String, Object> entry = new LinkedHashMap<>();
                for (String field : SELECTION_FIELDS) {
                    Object selected = component.containsKey(field) ? component.get(field) : info.get(field);
                    if (selected != null) entry.put(field, selected);
                }
                entries.add(entry);
            }
            return Map.of("catalogVersion", body.get("catalogVersion"), "components", entries);
        }
        Map<String, Object> projected = new LinkedHashMap<>(body);
        if (body.get("result") instanceof Map<?, ?> nested) {
            projected.put("result", projectBody(ComponentDocumentParser.cast(nested), latest));
        }
        return projected;
    }
}
