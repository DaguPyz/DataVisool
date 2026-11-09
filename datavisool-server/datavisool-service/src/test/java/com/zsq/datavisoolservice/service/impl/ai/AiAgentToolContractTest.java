/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentToolContractTest {
    @Test
    void serializedSnapshotEnumsMatchTheBrowserAcceptedFields() throws Exception {
        Path root = Path.of("").toAbsolutePath();
        while (root != null && !Files.isDirectory(root.resolve("datavisool-app"))) root = root.getParent();
        assertNotNull(root, "必须在项目中运行，核对模型定义与浏览器实现");
        String source = Files.readString(root.resolve("datavisool-app/src/frontend-effect/tools/GetComponentSnapshotsTool.ts"));
        var declaration = Pattern.compile("SNAPSHOT_FIELDS = \\[(.*?)\\] as const").matcher(source);
        assertTrue(declaration.find());
        var quoted = Pattern.compile("\"([^\"]+)\"").matcher(declaration.group(1));
        List<String> accepted = new ArrayList<>();
        while (quoted.find()) accepted.add(quoted.group(1));
        for (String name : List.of("get_component_snapshots", "inspect_current_page")) {
            JSONObject fields = properties(name).getJSONObject("fields");
            assertEquals(accepted, fields.getJSONObject("items").getJSONArray("enum").toJavaList(String.class));
            assertTrue(fields.getString("description").contains("id/type/name自动返回"));
            assertEquals(List.of("fields"), schema(name).getJSONArray("required").toJavaList(String.class));
        }
    }

    @Test
    void everyRegisteredToolHasAnExplicitClosedContract() {
        var specifications = new AiAgentToolCatalog(null, null).specifications();
        assertEquals(31, specifications.size());
        for (var tool : specifications) {
            assertFalse(tool.description().isBlank(), tool.name());
            JSONObject parameters = JSON.parseObject(tool.toJson()).getJSONObject("parameters");
            assertEquals(false, parameters.getBoolean("additionalProperties"), tool.name());
        }
        assertThrows(IllegalArgumentException.class, () -> AiAgentToolDefinitions.specification("unexplained_tool"));
    }

    @Test
    void interactionsAndDeleteExposeTheirActualNestedParameters() {
        JSONObject question = properties("request_user_input").getJSONObject("questions").getJSONObject("items");
        assertEquals(List.of("id", "header", "question", "options"), question.getJSONArray("required").toJavaList(String.class));
        JSONObject option = question.getJSONObject("properties").getJSONObject("options").getJSONObject("items");
        assertEquals(List.of("label", "description"), option.getJSONArray("required").toJavaList(String.class));
        JSONObject target = properties("delete_canvas_components").getJSONObject("targets").getJSONObject("items");
        assertEquals(List.of("componentId", "componentType"), target.getJSONArray("required").toJavaList(String.class));
        JSONObject candidate = properties("request_component_selection").getJSONObject("candidates").getJSONObject("items");
        assertEquals(List.of("componentType", "displayName"), candidate.getJSONArray("required").toJavaList(String.class));
        assertTrue(candidate.getJSONObject("properties").containsKey("defaultSelected"));
        assertEquals(List.of("risk", "patches"), schema("confirm_canvas_patch").getJSONArray("required").toJavaList(String.class));
        assertEquals(List.of("message"), schema("push_progress_log").getJSONArray("required").toJavaList(String.class));
        assertFalse(properties("get_component_document").containsKey("fields"));
        assertFalse(properties("get_component_document").containsKey("intent"));
    }

    @Test
    void fixedActionsAndPlanStatesAreSerializedAsEnums() {
        assertEquals(List.of("render", "preview", "clear"), values(properties("render_draft").getJSONObject("action")));
        assertFalse(values(properties("render_draft").getJSONObject("action")).contains("accept"));
        assertEquals(List.of("literal", "regex"), values(properties("search_workspace_files").getJSONObject("mode")));
        assertEquals(List.of("sensitive", "insensitive", "smart"), values(properties("search_workspace_files").getJSONObject("caseMode")));
        var step = properties("update_plan").getJSONObject("plan").getJSONObject("items");
        assertEquals(List.of("pending", "in_progress", "completed"), values(step.getJSONObject("properties").getJSONObject("status")));
        var effects = properties("update_plan").getJSONObject("completionRequirements").getJSONObject("properties")
                .getJSONObject("requiredCanvasEffects").getJSONObject("items");
        assertEquals(List.of("createComponents", "patchComponents", "deleteComponents"), values(effects));
    }

    @Test
    void canvasWritesUseFileReferencesAndSeparateWritingFromValidation() {
        for (String name : List.of("create_canvas_components", "patch_canvas_components")) {
            assertEquals(List.of("path", "expectedRevision"), schema(name).getJSONArray("required").toJavaList(String.class));
            assertEquals(java.util.Set.of("path", "expectedRevision"), properties(name).keySet());
        }
        assertFalse(properties("render_draft").containsKey("components"));
        assertTrue(properties("render_draft").containsKey("draftId"));
        assertTrue(properties("render_draft").containsKey("expectedDraftRevision"));
        assertEquals(List.of("action"), schema("render_draft").getJSONArray("required").toJavaList(String.class));
        assertEquals(List.of("toolName"), schema("begin_canvas_artifact").getJSONArray("required").toJavaList(String.class));
        assertEquals(List.of("path", "expectedRevision", "content"), schema("write_canvas_artifact").getJSONArray("required").toJavaList(String.class));
        assertEquals(List.of("path", "expectedRevision"), schema("validate_canvas_artifact").getJSONArray("required").toJavaList(String.class));
        for (String name : List.of("begin_canvas_artifact", "write_canvas_artifact", "validate_canvas_artifact")) {
            assertTrue(AiAgentToolScheduling.barrier(name));
            assertTrue(AiAgentRuntime.isWriteTool(name));
            assertFalse(AiAgentToolCatalog.requiresFrontendEffect(name));
        }
    }

    @Test
    void stagedArtifactToolsUseTheFormattedFileForValidationAndRepair() {
        String begin = AiAgentToolDefinitions.specification("begin_canvas_artifact").description();
        String write = AiAgentToolDefinitions.specification("write_canvas_artifact").description();
        String validate = AiAgentToolDefinitions.specification("validate_canvas_artifact").description();
        String repair = AiAgentToolDefinitions.specification("repair_artifact").description();
        String render = AiAgentToolDefinitions.specification("render_draft").description();

        assertTrue(begin.contains("整体格式化并写入产物文件"));
        assertTrue(write.contains("每次传入最多8192字节"));
        assertTrue(write.contains("不要分别格式化文本块"));
        assertTrue(validate.contains("errorContext 对应格式化后的文件"));
        assertTrue(repair.contains("文件是格式化后的 JSON 参数体"));
        assertTrue(repair.contains("oldText 必须从当前文件或 errorContext 复制"));
        assertFalse(repair.contains("oldText 应复制文件原文"));
        assertTrue(render.contains("完整 layout"));
        assertTrue(render.contains("逐区域独立生成完整组件文件"));
        assertTrue(render.contains("仍须经 staged 文件写入、校验和提交"));
        assertTrue(render.contains("action=preview/draftId/expectedDraftRevision"));
        assertTrue(render.contains("draftId/revision 只表示当前草稿状态"));
        assertTrue(render.contains("模型不能直接 accept"));
    }

    private List<String> values(JSONObject element) {
        return element.getJSONArray("enum").toJavaList(String.class);
    }

    private JSONObject properties(String name) {
        return schema(name).getJSONObject("properties");
    }

    private JSONObject schema(String name) {
        return JSON.parseObject(AiAgentToolDefinitions.specification(name).toJson()).getJSONObject("parameters");
    }
}
