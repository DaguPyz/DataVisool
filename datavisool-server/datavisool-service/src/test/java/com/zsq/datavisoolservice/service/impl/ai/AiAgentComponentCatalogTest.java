/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.*;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentComponentCatalogTest {
    @Test
    void completeSelectionListReachesModelDespiteSmallPerResultBudget() {
        List<ChatMessage> source = base();
        addCatalog(source, "catalog", "v1", 120);
        String original = new JacksonChatMessageJsonCodec().messagesToJson(source);
        var projected = AiAgentContextHistory.project(source, 8, 16_384, true);

        var result = results(projected).get(0);
        var body = JSON.parseObject(result.text()).getJSONObject("result").getJSONObject("result");
        assertEquals(120, body.getJSONArray("components").size());
        assertEquals("Type119", body.getJSONArray("components").getJSONObject(119).getString("componentType"));
        body.getJSONArray("components").forEach(value -> assertEquals(
                java.util.Set.of("componentType", "componentName", "description"), ((Map<?, ?>) value).keySet()));
        assertEquals("组件说明", body.getJSONArray("components").getJSONObject(119).getString("description"));
        assertFalse(result.text().contains("nativeCapabilities"));
        assertFalse(result.text().contains("sha256"));
        assertFalse(result.text().contains("componentInfo"));
        assertEquals(original, new JacksonChatMessageJsonCodec().messagesToJson(source));
    }

    @Test
    void repeatedAndChangedVersionsKeepOnlyLatestCompleteList() {
        List<ChatMessage> source = base();
        addCatalog(source, "old", "v1", 51);
        addCatalog(source, "duplicate", "v1", 51);
        addCatalog(source, "new", "v2", 52);
        var projected = AiAgentContextHistory.project(source, 1_000, 16_384, true);
        assertEquals(1, results(projected).stream().filter(result -> result.text().contains("\"components\"")).count());
        assertTrue(results(projected).get(0).text().contains("superseded"));
        assertTrue(results(projected).get(2).text().contains("Type51"));
        assertEquals("new", AiAgentComponentCatalog.latestResultId(projected));
    }

    @Test
    void repeatedCompactionAndResumeKeepCompleteCatalogEvenWhenItIsOld() {
        List<ChatMessage> source = base();
        addCatalog(source, "catalog", "v1", 51);
        for (int i = 0; i < 20; i++) source.add(AiMessage.from("旧分析".repeat(1_000)));
        var manager = manager(16_384);
        var compacted = manager.compact(source, "已选择标题组件", Map.of());
        // 模拟检查点编码与恢复后的第二次压缩。
        var codec = new JacksonChatMessageJsonCodec();
        var resumed = codec.messagesFromJson(codec.messagesToJson(compacted));
        var twice = manager.compact(resumed, "继续创建标题", Map.of());
        assertEquals(1, results(twice).stream().filter(result -> result.text().contains("\"components\"")).count());
        assertTrue(results(twice).get(0).text().contains("Type50"));
        assertTrue(manager.prepare(twice).messages().stream().anyMatch(message ->
                message instanceof ToolExecutionResultMessage result && result.text().contains("Type50")));
    }

    @Test
    void restoresMissingCatalogFromRealReceiptsAndKeepsOnlyLatestVersionAcrossCompactions() {
        var manager = manager(16_384);
        var receipt = new AiAgentService.OperationView("catalog-op", "get_component_catalog", "applied",
                Map.of("catalogVersion", "v1", "components", List.of(Map.of("componentType", "BaseText", "componentName", "文本"))),
                null, null, 1L);
        var restored = AiAgentContextHistory.refreshReceipts(base(), List.of(receipt), 512);
        var compacted = manager.compact(restored, "读取过目录", Map.of());
        var again = AiAgentContextHistory.refreshReceipts(compacted, List.of(receipt), 512);
        assertEquals(1, again.stream().filter(AiAgentComponentCatalog::isSnapshot).count());
        assertTrue(new JacksonChatMessageJsonCodec().messagesToJson(manager.prepare(again).messages()).contains("BaseText"));

        var updated = new AiAgentService.OperationView("new-catalog-op", "get_component_catalog", "applied",
                Map.of("catalogVersion", "v2", "components", List.of(Map.of("componentType", "NewText", "componentName", "新文本"))),
                null, null, 2L);
        var replaced = AiAgentContextHistory.refreshReceipts(again, List.of(receipt, updated), 512);
        var twice = manager.compact(replaced, "目录版本已更新", Map.of());
        assertEquals(1, twice.stream().filter(AiAgentComponentCatalog::isSnapshot).count());
        var snapshot = twice.stream().filter(AiAgentComponentCatalog::isSnapshot).findFirst().orElseThrow();
        assertTrue(AiAgentContextHistory.userText((UserMessage) snapshot).contains("NewText"));
        assertFalse(AiAgentContextHistory.userText((UserMessage) snapshot).contains("BaseText"));
    }

    @Test
    void restoredNewVersionRemainsAuthoritativeWhenOldCatalogToolGroupSurvives() {
        List<ChatMessage> source = base();
        addCatalog(source, "old", "v1", 51);
        var receipt = new AiAgentService.OperationView("new-catalog-op", "get_component_catalog", "applied",
                Map.of("catalogVersion", "v2", "components", List.of(Map.of("componentType", "NewText", "componentName", "新文本"))),
                null, null, 2L);
        var restored = AiAgentContextHistory.refreshReceipts(source, List.of(receipt), 512);
        var compacted = manager(16_384).compact(restored, "使用新目录", Map.of());
        assertEquals(1, compacted.stream().filter(AiAgentComponentCatalog::isSnapshot).count());
        assertFalse(results(compacted).stream().anyMatch(result -> result.text().contains("\"components\"")));
        assertTrue(new JacksonChatMessageJsonCodec().messagesToJson(compacted).contains("NewText"));
    }

    @Test
    void pendingOrFailedCatalogReadDoesNotReplaceKnownCompleteList() {
        List<ChatMessage> source = base();
        addCatalog(source, "catalog", "v1", 51);
        var call = call("pending");
        source.add(AiMessage.from(call));
        source.add(ToolExecutionResultMessage.from(call, "{\"status\":\"pending\"}"));
        assertEquals("catalog", AiAgentComponentCatalog.latestResultId(source));
    }

    @Test
    void oversizedCatalogStopsExplicitlyInsteadOfSendingOnlyCount() {
        List<ChatMessage> source = base();
        addCatalog(source, "catalog", "v1", 120);
        assertThrows(AiAgentContextHistory.CapacityExceeded.class,
                () -> manager(512).compact(source, "摘要", Map.of()));
    }

    private static AiAgentContextManager manager(long historyTokens) {
        return new AiAgentContextManager(128_000L, 512L,
                new AiAgentRuntimeSettingsService.Context(32_000, 90, 512, historyTokens, 512, 512), List.of());
    }

    private static List<ChatMessage> base() {
        return new ArrayList<>(List.of(SystemMessage.from("画布编辑"), UserMessage.from("创建标题")));
    }

    private static ToolExecutionRequest call(String id) {
        return ToolExecutionRequest.builder().id(id).name(AiAgentComponentCatalog.TOOL_NAME).arguments("{}").build();
    }

    private static void addCatalog(List<ChatMessage> source, String id, String version, int count) {
        var call = call(id);
        var entries = IntStream.range(0, count).mapToObj(i -> Map.of(
                "componentType", "Type" + i, "componentName", "组件" + i,
                "width", 300, "height", 80,
                "componentInfo", Map.of("description", "组件说明", "nativeCapabilities", "文字和边框"),
                "documentInfo", Map.of("sha256", "internal-hash", "path", "internal-path"))).toList();
        source.add(AiMessage.from(call));
        source.add(ToolExecutionResultMessage.from(call, JSON.toJSONString(Map.of("status", "applied", "result",
                Map.of("operationId", "op-" + id, "status", "applied", "result",
                        Map.of("catalogVersion", version, "components", entries))))));
    }

    private static List<ToolExecutionResultMessage> results(List<ChatMessage> messages) {
        return messages.stream().filter(ToolExecutionResultMessage.class::isInstance)
                .map(ToolExecutionResultMessage.class::cast).toList();
    }
}
