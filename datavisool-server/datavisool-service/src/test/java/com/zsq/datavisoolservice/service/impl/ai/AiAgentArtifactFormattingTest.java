/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.util.JsonFormatter;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentArtifactFormattingTest {
    private static final String COMPONENT = "{\"id\":\"card\",\"type\":\"BaseColorBlock\",\"x\":12,\"y\":20,\"width\":450,\"height\":350,\"useDefaultConfig\":true}";

    @Test
    void chunksStayBasedOnRawOutputAcrossServiceRestartAndCanBeRepairedWithoutSubmitting(@TempDir Path root) throws Exception {
        var requests = new ArrayList<Map<String, Object>>();
        var workspace = new AiAgentWorkspaceService(root);
        var result = begin(catalog(workspace, requests), "render_draft");
        String path = result.result().get("path").toString();
        String raw = "{\"message\":\"trailing  spaces and \\\"quoted\\\"\",\"interactive\":false,\"incremental\":true,\"components\":["
                + COMPONENT.replace("\"x\":12", "\"x\":1 2") + "]}";

        int afterStringWhitespace = raw.indexOf("trailing  ") + "trailing  ".length();
        int afterEscapingBackslash = raw.indexOf("\\\"quoted") + 1;
        int afterNumberWhitespace = raw.indexOf("\"x\":1 2,") + "\"x\":1 ".length();
        assertTrue(afterStringWhitespace > 0 && afterStringWhitespace < afterEscapingBackslash);
        assertTrue(afterEscapingBackslash < afterNumberWhitespace);
        List<String> chunks = List.of(raw.substring(0, afterStringWhitespace),
                raw.substring(afterStringWhitespace, afterEscapingBackslash),
                raw.substring(afterEscapingBackslash, afterNumberWhitespace), raw.substring(afterNumberWhitespace));

        StringBuilder rawSoFar = new StringBuilder();
        for (String chunk : chunks) {
            rawSoFar.append(chunk);
            // 每块都用新 service/catalog 写入，验证源文本随产物持久化，而非留在内存缓存中。
            result = write(catalog(new AiAgentWorkspaceService(root), requests), result, chunk);
            assertEquals("writing", result.status(), result.asJson());
            String file = readArtifact(root, path);
            assertEquals(JsonFormatter.format(rawSoFar.toString()), file);
            assertEquals(sha256(file), result.result().get("contentSha256"));
            assertEquals(file.getBytes(StandardCharsets.UTF_8).length, result.result().get("byteSize"));
        }

        workspace = new AiAgentWorkspaceService(root);
        var repaired = validate(catalog(workspace, requests), result);
        assertEquals("repair_required", repaired.status(), repaired.asJson());
        String formattedFile = readArtifact(root, path);
        assertEquals(JsonFormatter.format(raw), formattedFile);
        assertEquals(sha256(formattedFile), repaired.result().get("contentSha256"));
        assertEquals(workspace.workspaceRevision(1), ((Number) repaired.result().get("workspaceRevision")).longValue());
        assertErrorContextMatchesFile(repaired, formattedFile);

        // 第一次替换的 oldText 来自已格式化文件；故意保留语法错误，检查补丁会格式化并重新校验。
        assertTrue(formattedFile.contains("1 2,"));
        repaired = repair(catalog(workspace, requests), repaired, "1 2", "1\n  2");
        assertEquals("repair_required", repaired.status(), repaired.asJson());
        String stillInvalidFile = readArtifact(root, path);
        assertEquals(JsonFormatter.format(stillInvalidFile), stillInvalidFile);
        assertErrorContextMatchesFile(repaired, stillInvalidFile);
        assertEquals(workspace.workspaceRevision(1), ((Number) repaired.result().get("workspaceRevision")).longValue());

        // 第二次补丁也从更新后的真实文件取匹配片段，修好数字后进入 validated。
        int valueStart = stillInvalidFile.indexOf("\"x\":");
        int valueEnd = stillInvalidFile.indexOf(',', valueStart);
        assertTrue(valueStart >= 0 && valueEnd > valueStart);
        String formattedOldText = stillInvalidFile.substring(valueStart, valueEnd);
        assertTrue(formattedOldText.contains("\n"));
        repaired = repair(catalog(workspace, requests), repaired, formattedOldText, "\"x\": 12");
        assertEquals("validated", repaired.status(), repaired.asJson());
        assertFalse(repaired.requiresFrontendEffect());
        assertTrue(requests.isEmpty());
        String finalFile = readArtifact(root, path);
        assertEquals(JsonFormatter.format(raw.replace("\"x\":1 2,", "\"x\":12,")), finalFile);
        assertEquals(sha256(finalFile), repaired.result().get("contentSha256"));
        assertEquals(sha256(finalFile), workspace.readRepairArtifact(1, "format-run", path)
                .validated().get("contentSha256"));
        assertEquals(workspace.workspaceRevision(1), ((Number) repaired.result().get("workspaceRevision")).longValue());
    }

    @Test
    void chunkLimitUsesRawUtf8BytesAndFormattedExpansionRollsBackAtomically(@TempDir Path root) throws Exception {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var result = begin(catalog(workspace, requests), "render_draft");
        String path = result.result().get("path").toString();

        String exactlyAtLimit = "1" + " ".repeat(AiAgentWorkspaceService.MAX_CANVAS_ARTIFACT_CHUNK_BYTES - 2) + "2";
        result = write(catalog(workspace, requests), result, exactlyAtLimit);
        assertEquals("writing", result.status(), result.asJson());
        String beforeOversizedChunk = readArtifact(root, path);
        long revisionBeforeOversizedChunk = workspace.workspaceRevision(1);
        String rawOverLimitButSmallWhenFormatted = "3" + " ".repeat(AiAgentWorkspaceService.MAX_CANVAS_ARTIFACT_CHUNK_BYTES - 1) + "4";
        var rejectedChunk = write(catalog(workspace, requests), result, rawOverLimitButSmallWhenFormatted);
        assertEquals("rejected", rejectedChunk.status(), rejectedChunk.asJson());
        assertEquals(revisionBeforeOversizedChunk, workspace.workspaceRevision(1));
        assertEquals(beforeOversizedChunk, readArtifact(root, path));

        // 16 KiB 的原始输入很小，但逐层缩进后会超过单文件 2 MiB 上限。
        var expansionResult = begin(catalog(workspace, requests), "render_draft");
        String expansionPath = expansionResult.result().get("path").toString();
        String opens = "[".repeat(AiAgentWorkspaceService.MAX_CANVAS_ARTIFACT_CHUNK_BYTES);
        expansionResult = write(catalog(workspace, requests), expansionResult, opens);
        assertEquals("writing", expansionResult.status(), expansionResult.asJson());
        String beforeExpansion = readArtifact(root, expansionPath);
        long revisionBeforeExpansion = workspace.workspaceRevision(1);
        assertTrue(beforeExpansion.getBytes(StandardCharsets.UTF_8).length < AiAgentWorkspaceService.MAX_FILE_BYTES);

        var rejectedExpansion = write(catalog(workspace, requests), expansionResult, opens);
        assertEquals("rejected", rejectedExpansion.status(), rejectedExpansion.asJson());
        assertEquals(revisionBeforeExpansion, workspace.workspaceRevision(1));
        assertEquals(beforeExpansion, readArtifact(root, expansionPath));
        assertTrue(requests.isEmpty());
    }

    @Test
    void genericWorkspaceEditInvalidatesRawChunkSourceBeforeTheNextAppend(@TempDir Path root) throws Exception {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        var result = write(catalog(workspace, requests), begin(catalog(workspace, requests), "render_draft"), "{\"obsolete\":");
        String path = result.result().get("path").toString();

        workspace.applyWorkspacePatch(1, workspace.workspaceRevision(1),
                replaceWholeFilePatch(path, readArtifact(root, path), "{\"external\":"));
        assertEquals("{\"external\":", readArtifact(root, path));

        var continued = write(catalog(new AiAgentWorkspaceService(root), requests), result,
                "1}", workspace.workspaceRevision(1));
        assertEquals("writing", continued.status(), continued.asJson());
        String actualFile = readArtifact(root, path);
        assertEquals(JsonFormatter.format("{\"external\":1}"), actualFile);
        assertTrue(actualFile.contains("external"));
        assertFalse(actualFile.contains("obsolete"));
    }

    @Test
    void validatingCompactExistingArtifactFormatsAndPersistsBeforeCheckingIt(@TempDir Path root) throws Exception {
        var workspace = new AiAgentWorkspaceService(root);
        var requests = new ArrayList<Map<String, Object>>();
        String compact = "{\"message\":\"legacy\",\"interactive\":false,\"incremental\":true,\"components\":[" + COMPONENT + "]}";
        var result = write(catalog(workspace, requests), begin(catalog(workspace, requests), "render_draft"), compact);
        String path = result.result().get("path").toString();

        // 模拟升级前已落盘的紧凑产物：通用 Workspace 编辑只改公开文件，保留 staged 元数据。
        String formatted = readArtifact(root, path);
        assertNotEquals(compact, formatted);
        workspace.applyWorkspacePatch(1, workspace.workspaceRevision(1), replaceWholeFilePatch(path, formatted, compact));
        assertEquals(compact, readArtifact(root, path));
        long beforeValidation = workspace.workspaceRevision(1);

        var validated = validate(catalog(new AiAgentWorkspaceService(root), requests), result,
                workspace.workspaceRevision(1));
        assertEquals("validated", validated.status(), validated.asJson());
        String actualFile = readArtifact(root, path);
        assertEquals(JsonFormatter.format(compact), actualFile);
        assertEquals(sha256(actualFile), validated.result().get("contentSha256"));
        assertTrue(((Number) validated.result().get("workspaceRevision")).longValue() > beforeValidation);
        assertEquals(workspace.workspaceRevision(1), ((Number) validated.result().get("workspaceRevision")).longValue());
        assertFalse(validated.requiresFrontendEffect());
        assertTrue(requests.isEmpty());
    }

    private AiAgentToolCatalog catalog(AiAgentWorkspaceService workspace, List<Map<String, Object>> requests) {
        return new AiAgentToolCatalog(null, (context, type, request, revision) -> {
            requests.add(request);
            return new AiAgentService.OperationView(request.get("operationId").toString(), type, "pending",
                    Map.of(), revision, null, 0L);
        }, workspace);
    }

    private AiAgentToolCatalog.ToolResult begin(AiAgentToolCatalog catalog, String toolName) {
        return catalog.execute(call("begin_canvas_artifact", Map.of("toolName", toolName)), context());
    }

    private AiAgentToolCatalog.ToolResult write(AiAgentToolCatalog catalog,
                                                 AiAgentToolCatalog.ToolResult previous, String content) {
        return write(catalog, previous, content,
                ((Number) previous.result().get("workspaceRevision")).longValue());
    }

    private AiAgentToolCatalog.ToolResult write(AiAgentToolCatalog catalog,
                                                 AiAgentToolCatalog.ToolResult previous, String content, long revision) {
        var args = new java.util.LinkedHashMap<>(reference(previous));
        args.put("expectedRevision", revision);
        args.put("content", content);
        return catalog.execute(call("write_canvas_artifact", args), context());
    }

    private AiAgentToolCatalog.ToolResult validate(AiAgentToolCatalog catalog,
                                                    AiAgentToolCatalog.ToolResult previous) {
        return validate(catalog, previous, ((Number) previous.result().get("workspaceRevision")).longValue());
    }

    private AiAgentToolCatalog.ToolResult validate(AiAgentToolCatalog catalog,
                                                    AiAgentToolCatalog.ToolResult previous, long revision) {
        var args = new java.util.LinkedHashMap<>(reference(previous));
        args.put("expectedRevision", revision);
        return catalog.execute(call("validate_canvas_artifact", args), context());
    }

    private AiAgentToolCatalog.ToolResult repair(AiAgentToolCatalog catalog,
                                                  AiAgentToolCatalog.ToolResult previous,
                                                  String oldText, String newText) {
        var args = new java.util.LinkedHashMap<>(reference(previous));
        args.put("edits", List.of(Map.of("oldText", oldText, "newText", newText)));
        return catalog.execute(call("repair_artifact", args), context());
    }

    private Map<String, Object> reference(AiAgentToolCatalog.ToolResult previous) {
        return Map.of("path", previous.result().get("path"),
                "expectedRevision", previous.result().get("workspaceRevision"));
    }

    private ToolExecutionRequest call(String name, Map<String, Object> args) {
        return ToolExecutionRequest.builder().id(UUID.randomUUID().toString()).name(name)
                .arguments(JSON.toJSONString(args)).build();
    }

    private AiAgentService.AgentExecutionContext context() {
        return new AiAgentService.AgentExecutionContext("thread", "1", "turn", "format-run", "1", "格式化产物",
                Map.of("canvasRevision", 42L), Map.of("mode", "none"), Map.of("revision", 42L), null, null, 0);
    }

    private String readArtifact(Path storageRoot, String relativePath) throws IOException {
        return Files.readString(storageRoot.resolve("agent-project-workspaces").resolve("1")
                .resolve(relativePath), StandardCharsets.UTF_8);
    }

    private String replaceWholeFilePatch(String path, String previous, String replacement) {
        StringBuilder patch = new StringBuilder("*** Begin Patch\n*** Update File: ").append(path).append("\n@@\n");
        for (String line : previous.split("\n", -1)) {
            if (!line.isEmpty() || !previous.endsWith("\n")) patch.append('-').append(line).append('\n');
        }
        patch.append('+').append(replacement).append("\n*** End Patch");
        return patch.toString();
    }

    private void assertErrorContextMatchesFile(AiAgentToolCatalog.ToolResult result, String file) throws Exception {
        assertEquals(sha256(file), result.result().get("contentSha256"));
        assertEquals("syntax", result.result().get("validationStage"));
        int offset = ((Number) result.result().get("charOffset")).intValue();
        int start = ((Number) result.result().get("contextStartOffset")).intValue();
        String fragment = result.result().get("errorContext").toString();
        assertFalse(fragment.isEmpty());
        assertTrue(fragment.length() <= 240);
        assertEquals(file.substring(start, start + fragment.length()), fragment);
        assertTrue(offset >= start && offset <= start + fragment.length());
        assertTrue(((Number) result.result().get("line")).intValue() > 1,
                "错误位置应指向格式化后的多行文件，而非最初的一行输出");
        assertNotNull(result.result().get("error"));
    }

    private String sha256(String value) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
