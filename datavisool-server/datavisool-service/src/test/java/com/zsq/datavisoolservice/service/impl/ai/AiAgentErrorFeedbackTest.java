/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;

class AiAgentErrorFeedbackTest {
    private AiAgentService.AgentExecutionContext context() {
        return new AiAgentService.AgentExecutionContext("thread", "1", "turn", "run", "2", "create",
                Map.of(), Map.of(), Map.of(), null, null, 0);
    }
    private ToolExecutionRequest call(String name, Object arguments) {
        return ToolExecutionRequest.builder().id("call").name(name).arguments(arguments instanceof String text ? text : JSON.toJSONString(arguments)).build();
    }
    @Test void validJsonWithTheWrongRootReportsItsTypeRatherThanASyntaxFailure() {
        var catalog = new AiAgentToolCatalog(null, null);
        for (String input : List.of("[]", "[1]", "42", "\"hello\"", "null")) {
            var failure = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("request_user_input", input), context()));
            assertEquals("$", failure.result().get("fieldPath"));
            assertEquals(Map.of("type", "object"), failure.result().get("expected"));
            assertEquals(AiAgentErrorFeedback.type(JSON.parse(input)), failure.result().get("actualType"));
            assertFalse(failure.getMsg().contains("不是合法 JSON"));
        }
    }
    @Test void uninitializedWorkspaceServiceReportsTheMissingServiceAndRequiredState() {
        var catalog = new AiAgentToolCatalog(null, null);
        for (String tool : List.of("list_workspace_files", "begin_canvas_artifact", "repair_artifact", "create_canvas_components")) {
            Object arguments = tool.equals("create_canvas_components") ? Map.of("path", "agent-repairs/file.json") : Map.of();
            var failure = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call(tool, arguments), context()));
            assertEquals("agent.workspace.unavailable", failure.result().get("code"));
            assertEquals("workspaceService", failure.result().get("fieldPath"));
            assertNull(failure.result().get("actualValue"));
            assertEquals("initialized Workspace service", failure.result().get("expected"));
        }
    }

    @Test void workspaceArgumentConvertersNeverTruncateFractionsAndNameTheirInputs(@TempDir Path root) {
        var catalog = new AiAgentToolCatalog(null, null, new AiAgentWorkspaceService(root));
        var depth = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("list_workspace_files", Map.of("depth", 1.5)), context()));
        assertEquals("depth", depth.result().get("fieldPath"));
        assertEquals(1.5, ((Number) depth.result().get("actualValue")).doubleValue());
        assertEquals("integer", ((Map<?, ?>) depth.result().get("expected")).get("type"));
        var stringDepth = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("list_workspace_files", Map.of("depth", "1")), context()));
        assertEquals("depth", stringDepth.result().get("fieldPath"));
        var stringRevision = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("apply_workspace_patch", Map.of("expectedRevision", "1", "patch", "invalid")), context()));
        assertEquals("expectedRevision", stringRevision.result().get("fieldPath"));
        var bool = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("search_workspace_files", Map.of("query", "x", "includeHidden", "yes")), context()));
        assertEquals("includeHidden", bool.result().get("fieldPath"));
        var mode = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("search_workspace_files", Map.of("query", "x", "mode", "unknown")), context()));
        assertEquals("unknown", mode.result().get("actualValue"));
        assertEquals(List.of("literal", "regex"), ((Map<?, ?>) mode.result().get("expected")).get("allowedValues"));
    }
    @Test void plansQuestionsAndSnapshotsLocateTheActualArrayItem() {
        var catalog = new AiAgentToolCatalog(null, null);
        var failure = assertThrows(AiAgentErrorFeedback.Failure.class, () -> catalog.execute(call("update_plan", Map.of("plan", List.of(Map.of("step", "ok", "status", "pending"), Map.of("step", "bad", "status", "done")))), context()));
        assertEquals("plan[1].status", failure.result().get("fieldPath"));
        assertEquals("done", failure.result().get("actualValue"));
        var snapshot = catalog.execute(call("get_component_snapshots", Map.of("fields", List.of("layer"), "componentIds", List.of("title", 42))), context()).result();
        assertEquals("componentIds[1]", snapshot.get("fieldPath"));
        assertEquals(42, snapshot.get("actualValue"));
        var question = catalog.execute(call("request_user_input", Map.of("questions", List.of(Map.of("id", "q", "header", "h", "question", "choose", "options", List.of(Map.of("label", "one", "description", "ok"), Map.of("label", "two", "description", 4)))))), context()).result();
        assertEquals("questions[0].options[1].description", question.get("fieldPath"));
        assertEquals("number", question.get("actualType"));
    }
    private Map<String, Object> component(String id, int width) {
        return new LinkedHashMap<>(Map.of("id", id, "type", "BaseText", "x", 0, "y", 0, "width", width, "height", 30, "config", Map.of("style", Map.of("padding", "x".repeat(2200)))));
    }
    @Test void anArtifactRetainsTheComponentFieldPathAndLocatesContextNearThatField(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var catalog = new AiAgentToolCatalog(null, null, workspace);
        var result = StagedToolTestSupport.validate(catalog, "create_canvas_components",
                JSON.toJSONString(Map.of("components", List.of(component("good", 100), component("bad", 0)))), context());
        assertEquals("repair_required", result.status());
        var error = result.result();
        assertEquals("components[1].width", error.get("fieldPath"));
        assertEquals("bad", error.get("componentId"));
        assertEquals(0, error.get("actualValue"));
        assertEquals(error.get("path"), error.get("artifactPath"));
        assertEquals(true, error.get("contextLocationKnown"));
        assertTrue(((Number) error.get("contextStartOffset")).intValue() > 1000);
        String stored = workspace.readWorkspaceFile(1, error.get("path").toString()).content();
        int offset = ((Number) error.get("charOffset")).intValue();
        assertTrue(stored.substring(offset, Math.min(stored.length(), offset + 25)).contains("width"));
        assertTrue(error.get("errorContext").toString().contains("\"width\": 0"));
    }
    @Test void artifactSyntaxFailuresDistinguishEndOfFileFromAnUnexpectedCharacter(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var catalog = new AiAgentToolCatalog(null, null, workspace);
        for (String content : List.of("{\"components\":[]", "{\"components\":[?]}")) {
            var result = StagedToolTestSupport.validate(catalog, "create_canvas_components", content, context());
            assertEquals("repair_required", result.status());
            var diagnostic = result.result();
            String stored = workspace.readWorkspaceFile(1, diagnostic.get("path").toString()).content();
            assertEquals("artifact_json_invalid", diagnostic.get("code"));
            assertEquals(content.contains("?") ? "?" : "<EOF>", diagnostic.get("actualValue"));
            if (!content.contains("?")) assertEquals(stored.length(), ((Number) diagnostic.get("charOffset")).intValue());
            else assertEquals('?', stored.charAt(((Number) diagnostic.get("charOffset")).intValue()));
        }
    }

    @Test void runtimeRetainsStructuredFailuresIncludingNullActualValues() {
        var diagnostic = AiAgentErrorFeedback.error("specific_error", "field is missing", "questions[0].id", null, Map.of("type", "string"));
        var catalog = new AiAgentToolCatalog(null, null) {
            @Override ToolResult executeWithRepairGuard(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context, Consumer<ToolExecutionRequest> guard) {
                throw new AiAgentErrorFeedback.Failure(400, diagnostic);
            }
        };
        var runtime = runtime(catalog);
        AiAgentToolCatalog.ToolResult result = ReflectionTestUtils.invokeMethod(runtime, "executeRegisteredTool", call("request_user_input", "{}"), context(), 5L, new AiAgentToolGuard(3, Map.of()));
        assertEquals("failed", result.status());
        diagnostic.forEach((key, value) -> assertEquals(value, result.result().get(key), key));
        assertTrue(result.result().containsKey("actualValue"));
        assertTrue(JSON.parseObject(result.asJson()).getJSONObject("result").containsKey("actualValue"));
        assertNull(JSON.parseObject(result.asJson()).getJSONObject("result").get("actualValue"));
    }
    @Test void aTimeoutStatesItsThresholdAndDoesNotClaimTheWriteDidNotHappen() {
        CountDownLatch release = new CountDownLatch(1);
        var catalog = new AiAgentToolCatalog(null, null) {
            @Override ToolResult executeWithRepairGuard(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context, Consumer<ToolExecutionRequest> guard) {
                try { release.await(5, TimeUnit.SECONDS); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                return new ToolResult(request.id(), request.name(), "applied", Map.of(), false);
            }
        };
        try {
            AiAgentToolCatalog.ToolResult result = ReflectionTestUtils.invokeMethod(runtime(catalog), "executeToolWithTimeout", call("create_canvas_components", "{}"), context(), 0L, new AiAgentToolGuard(3, Map.of()));
            assertEquals("agent.tool.timeout", result.result().get("code"));
            assertEquals(0L, result.result().get("timeoutSeconds"));
            assertEquals("unknown", result.result().get("executionOutcome"));
            assertTrue(result.result().get("recovery").toString().contains("先读取真实操作状态"));
        } finally { release.countDown(); }
    }
    @Test void secretValuesAreRedactedWithoutDroppingTheirLocationAndExpectedType() {
        var result = AiAgentErrorFeedback.error("bad", "type mismatch", "components[0].config.data.apiData.headers.Authorization", "Bearer sensitive", Map.of("type", "object"));
        assertEquals("[已脱敏]", result.get("actualValue"));
        assertEquals("string", result.get("actualType"));
        assertEquals(Map.of("type", "object"), result.get("expected"));
        assertEquals("https://example.com/data?token=[已脱敏]&page=2", AiAgentErrorFeedback.safeValue("config.data.apiData.url", "https://example.com/data?token=secret&page=2"));
    }
    private AiAgentRuntime runtime(AiAgentToolCatalog catalog) {
        var runtime = new AiAgentRuntime();
        ReflectionTestUtils.setField(runtime, "toolCatalog", catalog);
        ReflectionTestUtils.setField(runtime, "agentService", new AiAgentService() {
            @Override public boolean isCancelRequested(String runId) { return false; }
        });
        return runtime;
    }
}
