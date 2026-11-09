/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.global.AppException;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import org.junit.jupiter.api.Test;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.ToolExecutionResultMessage;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentComponentSpecsTest {
    @Test
    void registersFullSpecSchemaAndFrontendExecution() {
        var catalog = new AiAgentToolCatalog(null, null);
        var schema = catalog.specifications().stream().filter(spec -> spec.name().equals(AiAgentComponentSpecs.TOOL_NAME))
                .findFirst().orElseThrow().toJson();
        assertTrue(schema.contains("componentTypes"));
        assertTrue(schema.contains("create"));
        assertTrue(schema.contains("patch"));
        assertFalse(schema.contains("\"fields\""));
        assertFalse(schema.contains("\"page\""));
        assertFalse(schema.contains("\"corpusVersion\""));
        assertTrue(AiAgentToolCatalog.requiresFrontendEffect(AiAgentComponentSpecs.TOOL_NAME));
    }

    @Test
    void normalizesTypesAndPreservesHistoricalArgumentsWithoutFilteringSpecs() {
        Map<String, Object> request = request();
        request.put("componentTypes", List.of(" BaseText ", "", "BaseText"));
        request.put("fields", List.of());
        request.put("page", 99);
        assertEquals(List.of("BaseText"), AiAgentComponentSpecs.normalizeRequest(request));
    }

    @Test
    void rejectsInvalidTypesIntentAndBatchSize() {
        for (Object value : List.of(List.of(), List.of(1), IntStream.range(0, 11).mapToObj(i -> "type-" + i).toList())) {
            Map<String, Object> request = request();
            request.put("componentTypes", value);
            assertThrows(AppException.class, () -> AiAgentComponentSpecs.normalizeRequest(request));
        }
        Map<String, Object> request = request();
        request.put("intent", "unknown");
        assertThrows(AppException.class, () -> AiAgentComponentSpecs.normalizeRequest(request));
    }

    @Test
    void invalidSpecRequestReturnsStructuredActualAndExpectedValues() {
        Map<String, Object> request = request();
        request.put("componentTypes", List.of("BaseText", 12));
        var failure = assertThrows(AiAgentErrorFeedback.Failure.class,
                () -> AiAgentComponentSpecs.normalizeRequest(request));
        var feedback = failure.result();
        assertEquals("agent.component_specs.component_types_required", feedback.get("code"));
        assertEquals("componentTypes[1]", feedback.get("fieldPath"));
        assertEquals(12, feedback.get("actualValue"));
        assertEquals("number", feedback.get("actualType"));
        assertEquals("string", feedback.get("expected"));
    }

    @Test
    void specCountMismatchReportsTheActualArrayAndItsCount() {
        var result = response();
        List<Map<String, Object>> actualSpecs = List.of(
                Map.of("componentType", "BaseText"), Map.of("componentType", "Unexpected"));
        result.put("specs", actualSpecs);
        var failure = assertThrows(AiAgentErrorFeedback.Failure.class,
                () -> AiAgentComponentSpecs.completeEvidence(request(), result));
        var feedback = failure.result();
        assertEquals("specs", feedback.get("fieldPath"));
        assertEquals(actualSpecs, feedback.get("actualValue"));
        assertEquals("array", feedback.get("actualType"));
        assertEquals(2, feedback.get("actualCount"));
        assertEquals(Map.of("type", "array<object>", "minItems", 1, "maxItems", 1,
                "requestedComponentTypes", List.of("BaseText")), feedback.get("expected"));
    }

    @Test
    void rejectsInvalidRequestBeforeDispatchingFrontendEffect() {
        var catalog = new AiAgentToolCatalog(null, null);
        var context = new AiAgentService.AgentExecutionContext("thread", "turn", "run", "project", "user", "input",
                Map.of(), Map.of(), Map.of(), null, null, 0);
        assertThrows(AppException.class, () -> catalog.execute(ToolExecutionRequest.builder().id("specs")
                .name(AiAgentComponentSpecs.TOOL_NAME).arguments("{\"componentTypes\":[],\"intent\":\"create\"}").build(), context));
    }

    @Test
    void recordsIntentAndCorpusVersionOnlyForReturnedFullSpecs() {
        assertEquals(List.of(Map.of("componentType", "BaseText", "intent", "create", "corpusVersion", "corpus-v1")),
                AiAgentComponentSpecs.completeEvidence(request(), response()));
        Map<String, Object> patch = request();
        patch.put("intent", "patch");
        assertThrows(AppException.class, () -> AiAgentComponentSpecs.completeEvidence(patch, response()));
        Map<String, Object> patched = response();
        patched.put("specs", List.of(Map.of("componentType", "BaseText",
                "configurable", Map.of("style", Map.of("fontSize", "number")),
                "example", Map.of("stylePatch", Map.of("style", Map.of("fontSize", 16))))));
        assertEquals("patch", AiAgentComponentSpecs.completeEvidence(patch, patched).get(0).get("intent"));
    }

    @Test
    void missingTruncatedAndUnexpectedSpecsCannotGrantEvidence() {
        for (Map<String, Object> broken : List.of(Map.<String, Object>of(), Map.<String, Object>of("truncated", true),
                Map.<String, Object>of("specs", List.of()), Map.<String, Object>of("corpusVersion", ""))) {
            var result = response();
            if (broken.isEmpty()) result.clear(); else result.putAll(broken);
            assertThrows(AppException.class, () -> AiAgentComponentSpecs.completeEvidence(request(), result));
        }
        var request = request();
        request.put("componentTypes", List.of("Other"));
        assertThrows(AppException.class, () -> AiAgentComponentSpecs.completeEvidence(request, response()));
    }

    @Test
    void rejectsMissingPublicFragmentsAndOversizedOutput() {
        var result = response();
        result.put("specs", List.of(Map.of("componentType", "BaseText",
                "configurable", Map.of("style", Map.of("xAxis", "<g2plot-axis>")), "example", Map.of("config", Map.of()))));
        assertThrows(AppException.class, () -> AiAgentComponentSpecs.completeEvidence(request(), result));
        result.put("commonFragments", Map.of("<g2plot-axis>", Map.of("label", Map.of())));
        assertEquals(1, AiAgentComponentSpecs.completeEvidence(request(), result).size());
        result.put("extra", "字".repeat(100_000));
        assertThrows(AppException.class, () -> AiAgentComponentSpecs.completeEvidence(request(), result));
    }

    @Test
    void fullSpecOutputBypassesGenericTruncation() {
        var result = new AiAgentToolCatalog.ToolResult("specs", AiAgentComponentSpecs.TOOL_NAME, "applied",
                Map.of("configurable", "内容".repeat(20_000)), true);
        var specCall = ToolExecutionRequest.builder().id("specs").name(result.toolName()).arguments("{}").build();
        var projected = AiAgentContextHistory.project(List.of(AiMessage.from(specCall),
                ToolExecutionResultMessage.from(specCall, result.asJson())), 512, 16_000, true);
        assertEquals(result.asJson(), ((ToolExecutionResultMessage) projected.get(1)).text());
        var other = new AiAgentToolCatalog.ToolResult("read", "get_component_document", "applied", result.result(), true);
        var readCall = ToolExecutionRequest.builder().id("read").name(other.toolName()).arguments("{}").build();
        projected = AiAgentContextHistory.project(List.of(AiMessage.from(readCall),
                ToolExecutionResultMessage.from(readCall, other.asJson())), 512, 16_000, true);
        assertTrue(((ToolExecutionResultMessage) projected.get(1)).text().contains("\"truncated\":true"));
    }

    static Map<String, Object> request() {
        return new LinkedHashMap<>(Map.of("componentTypes", List.of("BaseText"), "intent", "create"));
    }

    static Map<String, Object> response() {
        return new LinkedHashMap<>(Map.of("corpusVersion", "corpus-v1", "commonFragments", Map.of(), "specs", List.of(Map.of(
                "componentType", "BaseText", "configurable", Map.of("style", Map.of("fontSize", "number")),
                "example", Map.of("config", Map.of("data", Map.of("sourceType", "static", "staticData", Map.of("value", "示例"))))))));
    }
}
