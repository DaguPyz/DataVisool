/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.fasterxml.jackson.core.JsonLocation;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.global.AppException;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.agent.tool.ToolSpecification;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

import static com.zsq.datavisoolservice.service.impl.ai.AiAgentDebugTrace.map;

/** 画布工具目录。读写都通过前端效果桥接访问当前浏览器画布。 */
@Service
public class AiAgentToolCatalog {
    /** 每次命中读取缓存前核对真实工作区版本，跨恢复和外部写入仍会失效。 */
    String cacheVersion(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context) {
        return workspaceRead(request.name()) && workspaceService != null
                ? Long.toString(workspaceService.workspaceRevision(Long.parseLong(context.projectId()))) : null;
    }
    static boolean readOnly(String name) {
        return READ_TOOLS.contains(name) || workspaceRead(name);
    }
    static boolean workspaceRead(String name) {
        return WORKSPACE_READ_TOOLS.contains(name);
    }
    private static final ObjectMapper JSON_DIAGNOSTICS_MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Set<String> ARTIFACT_TOOLS = Set.of("create_canvas_components", "render_draft", "patch_canvas_components");
    private static final List<String> ARTIFACT_FILE_TOOLS = List.of("begin_canvas_artifact", "write_canvas_artifact", "validate_canvas_artifact");
    private static final List<String> READ_TOOLS = List.of(
            "inspect_current_page",
            "get_component_catalog",
            "get_component_snapshots",
            "get_component_data_contract",
            "get_current_canvas_selection",
            "get_project_snapshot",
            "get_current_canvas_revision",
            "get_canvas_operation_status",
            "get_component_document",
            "resolve_component_specs",
            "search_component_documents"
    );
    private static final List<String> WRITE_TOOLS = List.of(
            "create_canvas_components",
            "patch_canvas_components",
            "delete_canvas_components",
            "render_draft",
            "confirm_canvas_patch",
            "discard_canvas_draft",
            "request_component_selection"
    );
    private static final List<String> WORKSPACE_READ_TOOLS = List.of(
            "list_workspace_files",
            "search_workspace_files",
            "read_workspace_file"
    );
    private static final List<String> WORKSPACE_WRITE_TOOLS = List.of(
            "apply_workspace_patch",
            "move_workspace_path",
            "delete_workspace_path"
    );

    private final AiAgentService agentService;
    private final FrontendEffectGateway frontendEffectGateway;
    private final AiAgentWorkspaceService workspaceService;
    private final ComponentDocumentService componentDocuments;

    public AiAgentToolCatalog(AiAgentService agentService, FrontendEffectGateway frontendEffectGateway) {
        this(agentService, frontendEffectGateway, null);
    }

    public AiAgentToolCatalog(AiAgentService agentService, FrontendEffectGateway frontendEffectGateway,
                              AiAgentWorkspaceService workspaceService) {
        this(agentService, frontendEffectGateway, workspaceService, null);
    }

    @Autowired
    public AiAgentToolCatalog(AiAgentService agentService, FrontendEffectGateway frontendEffectGateway,
                              AiAgentWorkspaceService workspaceService, ComponentDocumentService componentDocuments) {
        this.agentService = agentService;
        this.frontendEffectGateway = frontendEffectGateway;
        this.workspaceService = workspaceService;
        this.componentDocuments = componentDocuments;
    }

    public List<ToolSpecification> specifications() {
        List<ToolSpecification> tools = new ArrayList<>();
        READ_TOOLS.forEach(name -> tools.add(AiAgentToolDefinitions.specification(name)));
        WRITE_TOOLS.forEach(name -> tools.add(AiAgentToolDefinitions.specification(name)));
        WORKSPACE_READ_TOOLS.forEach(name -> tools.add(AiAgentToolDefinitions.specification(name)));
        WORKSPACE_WRITE_TOOLS.forEach(name -> tools.add(AiAgentToolDefinitions.specification(name)));
        ARTIFACT_FILE_TOOLS.forEach(name -> tools.add(AiAgentToolDefinitions.specification(name)));
        tools.add(AiAgentToolDefinitions.specification("request_user_input"));
        tools.add(AiAgentToolDefinitions.specification("update_plan"));
        tools.add(AiAgentToolDefinitions.specification("push_progress_log"));
        tools.add(AiAgentToolDefinitions.specification("repair_artifact"));
        return tools;
    }

    static boolean requiresFrontendEffect(String name) {
        return (READ_TOOLS.contains(name) && !"get_canvas_operation_status".equals(name)) || WRITE_TOOLS.contains(name);
    }

    public ToolResult execute(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context) {
        String name = request == null ? null : request.name();
        if (name == null || name.isBlank()) {
            throw AiAgentErrorFeedback.invalid("工具名称不能为空", "toolName", name, Map.of("type", "string", "minLength", 1));
        }
        var trace = new AiAgentDebugTrace(context);
        if ("repair_artifact".equals(name)) return repairArtifact(request, context, ignored -> {}, trace);
        if (ARTIFACT_FILE_TOOLS.contains(name)) return executeArtifactFileTool(request, context, ignored -> {}, trace);
        if (isDirectDraftAction(request)) {
            return executeParsed(request, context, new LinkedHashMap<>(parseArguments(request.arguments())), ignored -> {});
        }
        if (ARTIFACT_TOOLS.contains(name)) {
            Map<String, Object> reference = artifactReference(request.arguments());
            if (reference == null) return new ToolResult(request.id(), name, "rejected",
                    error("artifact_reference_required", "请先创建、写入并校验产物，再提交路径和版本", "path", null,
                            Map.of("sourceTool", "begin_canvas_artifact")), false);
            return submitArtifact(request, context, reference, ignored -> {}, trace);
        }
        return executeParsed(request, context, new LinkedHashMap<>(parseArguments(request.arguments())), ignored -> {});
    }

    private Map<String, Object> artifactReference(String arguments) {
        try {
            Map<String, Object> args = parseArguments(arguments);
            return args.containsKey("path") ? new LinkedHashMap<>(args) : null;
        } catch (AppException error) {
            return null;
        }
    }

    private boolean isDirectDraftAction(ToolExecutionRequest request) {
        if (request == null || !"render_draft".equals(request.name())) return false;
        try {
            Map<String, Object> args = parseArguments(request.arguments());
            return Set.of("preview", "clear").contains(String.valueOf(payload(args).get("action")));
        } catch (AppException error) {
            return false;
        }
    }

    private ToolResult executeArtifactFileTool(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                             Consumer<ToolExecutionRequest> guard, AiAgentDebugTrace trace) {
        if (workspaceService == null) throw workspaceUnavailable();
        Map<String, Object> args = new LinkedHashMap<>();
        String stage = "begin_canvas_artifact".equals(request.name()) ? "stored"
                : "write_canvas_artifact".equals(request.name()) ? "write" : "validation";
        try {
            args.putAll(parseArguments(request.arguments()));
            validateScope(args, context);
            long projectId = projectId(context);
            if ("begin_canvas_artifact".equals(request.name())) {
                String name = requiredText(args.get("toolName"), "toolName");
                if (!ARTIFACT_TOOLS.contains(name)) throw AiAgentErrorFeedback.invalid("toolName 必须是支持文件产物的画布工具", "toolName", name, Map.of("allowedValues", ARTIFACT_TOOLS));
                var artifact = workspaceService.beginCanvasArtifact(projectId, context.runId(), name);
                artifactTrace(trace, "artifact.stored", request, artifact, map("mode", "staged", "stage", "writing",
                        "content", artifact.content(), "contentSha256", contentSha256(artifact.content())));
                return artifactFileReceipt(request, artifact, "writing", true);
            }
            String path = requiredText(args.get("path"), "path");
            long revision = requiredLong(args.get("expectedRevision"), "expectedRevision");
            trace.record("artifact." + stage + ".received", () -> map("requestId", request.id(), "tool", request.name(),
                    "path", path, "expectedRevision", revision, "content", args.get("content")));
            return workspaceService.withRepairArtifact(projectId, context.runId(), path, revision, artifact -> {
                if (!artifact.staged()) throw AiAgentErrorFeedback.invalid("该工具只接受 begin_canvas_artifact 创建的产物", "path", path, Map.of("mode", "staged", "sourceTool", "begin_canvas_artifact"));
                ToolResult existing = submittedArtifactReceipt(request, context, artifact, trace);
                if (existing != null) throw AiAgentErrorFeedback.invalid("产物已提交，不能再写入或校验", "path", map("path", path, "status", existing.status()), Map.of("status", "writing/validated", "recovery", "读取原操作回执，不能重复写入"));
                if ("write_canvas_artifact".equals(request.name())) {
                    if (!(args.get("content") instanceof String content) || content.isEmpty()) throw AiAgentErrorFeedback.invalid("content 必须是非空文本", "content", args.get("content"), Map.of("type", "string", "minLength", 1));
                    var updated = workspaceService.appendCanvasArtifact(projectId, context.runId(), path, revision, content);
                    artifactTrace(trace, "artifact.write.applied", request, updated, map("previousRevision", artifact.workspaceRevision(),
                            "beforeContent", artifact.content(), "afterContent", updated.content(),
                            "contentSha256", contentSha256(updated.content()), "mode", "staged"));
                    return artifactFileReceipt(request, updated, "writing", true);
                }
                return processArtifact(request, context, artifact, guard, trace, false, false);
            });
        } catch (AiAgentWorkspaceService.WorkspaceException error) {
            var result = workspaceFailure(request, error);
            traceArtifactRejection(trace, request, args, stage, result.result());
            return result;
        } catch (AppException error) {
            if (error.getCode() >= 500) throw error;
            var result = new ToolResult(request.id(), request.name(), "rejected",
                    exceptionFeedback(error), false);
            traceArtifactRejection(trace, request, args, stage, result.result());
            return result;
        } finally {
            trace.record("artifact.processing.ended", () -> map("requestId", request.id(), "tool", request.name(), "path", args.get("path")));
        }
    }

    private ToolResult artifactFileReceipt(ToolExecutionRequest request, AiAgentWorkspaceService.RepairArtifact artifact,
                                          String status, boolean updated) {
        var body = map("path", artifact.path(), "toolName", artifact.toolName(), "workspaceRevision", artifact.workspaceRevision(),
                "contentSha256", contentSha256(artifact.content()), "byteSize", artifact.content().getBytes(StandardCharsets.UTF_8).length,
                "artifactUpdated", updated, "ready", "validated".equals(status));
        return new ToolResult(request.id(), request.name(), status, body, false);
    }

    private void traceArtifactRejection(AiAgentDebugTrace trace, ToolExecutionRequest request, Map<String, Object> args,
                                       String stage, Map<String, Object> error) {
        trace.record("artifact." + stage + ".rejected", () -> map("requestId", request.id(), "tool", request.name(),
                "path", args.get("path"), "expectedRevision", args.get("expectedRevision"), "error", error));
    }

    private ToolResult submittedArtifactReceipt(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                               AiAgentWorkspaceService.RepairArtifact artifact, AiAgentDebugTrace trace) {
        if (agentService != null && agentService.findOperation(artifact.operationId()) != null) {
            var operation = agentService.readOperationStatus(context, artifact.operationId());
            artifactTrace(trace, "artifact.frontend.reused", request, artifact, map("status", operation.status(), "result", operation.result()));
            return artifactReceipt(operationResult(request, operation,
                    Set.of("pending", "prepared", "applying").contains(operation.status())), artifact);
        }
        if (artifact.submitted().isEmpty()) return null;
        var saved = artifact.submitted();
        artifactTrace(trace, "artifact.frontend.reused", request, artifact, saved);
        return artifactReceipt(new ToolResult(request.id(), request.name(), saved.get("status").toString(),
                castMap((Map<?, ?>) saved.get("result")), Boolean.TRUE.equals(saved.get("requiresFrontendEffect"))), artifact);
    }

    private ToolResult submitArtifact(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                      Map<String, Object> args, Consumer<ToolExecutionRequest> guard, AiAgentDebugTrace trace) {
        if (workspaceService == null) throw workspaceUnavailable();
        trace.record("artifact.submit.received", () -> map("requestId", request.id(), "tool", request.name(),
                "path", args.get("path"), "expectedRevision", args.get("expectedRevision")));
        try {
            validateScope(args, context);
            if ("render_draft".equals(request.name()) && !"render".equals(args.get("action")))
                throw AiAgentErrorFeedback.invalid("按文件提交草稿必须明确 action=render", "action", args.get("action"), Map.of("value", "render"));
            if (args.containsKey("components") || args.containsKey("patches") || args.containsKey("payload") || args.containsKey("payloadJson"))
                throw AiAgentErrorFeedback.invalid("提交时只传产物路径与版本，不能同时传组件内容", "$", args.keySet(), Map.of("forbiddenFields", List.of("components", "patches", "payload", "payloadJson")));
            long projectId = projectId(context);
            String path = requiredText(args.get("path"), "path");
            var artifact = workspaceService.readRepairArtifact(projectId, context.runId(), path);
            if (!artifact.staged() || !request.name().equals(artifact.toolName()))
                throw AiAgentErrorFeedback.invalid("产物绑定的工具与本次提交不匹配", "path", map("path", path, "mode", artifact.staged() ? "staged" : "legacy", "toolName", artifact.toolName()), Map.of("mode", "staged", "toolName", request.name()));
            ToolResult existing = submittedArtifactReceipt(request, context, artifact, trace);
            if (existing != null) return existing;
            return workspaceService.withRepairArtifact(projectId, context.runId(), path,
                    requiredLong(args.get("expectedRevision"), "expectedRevision"), current -> {
                        ToolResult submitted = submittedArtifactReceipt(request, context, current, trace);
                        if (submitted != null) return submitted;
                        if (!contentSha256(current.content()).equals(current.validated().get("contentSha256"))) {
                            var result = artifactFileReceipt(request, current, "rejected", false);
                            var body = new LinkedHashMap<>(result.result());
                            body.putAll(error("artifact_validation_required", "文件尚未校验或已修改，先调用 validate_canvas_artifact", "contentSha256", map("current", contentSha256(current.content()), "validated", current.validated().get("contentSha256")), Map.of("rule", "当前文件内容的 hash 与已通过校验的 hash 一致", "sourceTool", "validate_canvas_artifact")));
                            body.put("retryable", true);
                            traceArtifactRejection(trace, request, args, "submit", body);
                            return new ToolResult(request.id(), request.name(), "rejected", body, false);
                        }
                        // 锁内重读并重新检查实时配置规则，再提交同一份内存内容。
                        return processArtifact(request, context, current, guard, trace, false, true);
                    });
        } catch (AiAgentWorkspaceService.WorkspaceException error) {
            var result = workspaceFailure(request, error);
            traceArtifactRejection(trace, request, args, "submit", result.result());
            return result;
        } catch (AppException error) {
            if (error.getCode() >= 500) throw error;
            var result = new ToolResult(request.id(), request.name(), "rejected",
                    exceptionFeedback(error), false);
            traceArtifactRejection(trace, request, args, "submit", result.result());
            return result;
        } finally {
            trace.record("artifact.processing.ended", () -> map("requestId", request.id(), "tool", request.name(), "path", args.get("path")));
        }
    }

    private String contentSha256(String content) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 不可用", error);
        }
    }

    private ToolResult executeParsed(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                    Map<String, Object> args, Consumer<Map<String, Object>> onValidated) {
        return executeParsed(request, context, args, onValidated, false);
    }

    private ToolResult executeParsed(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                    Map<String, Object> args, Consumer<Map<String, Object>> onValidated, boolean validateOnly) {
        String name = request.name();
        validateScope(args, context);
        Map<String, Object> payload = payload(args);
        String operationId = text(args.get("operationId"));
        if (operationId == null) {
            operationId = text(payload.get("operationId"));
        }
        if (operationId == null) {
            operationId = "tool-" + UUID.randomUUID();
        }
        String baseRevision = text(args.get("baseRevision"));
        if (baseRevision == null) {
            baseRevision = text(payload.get("baseRevision"));
        }
        if (baseRevision == null) {
            baseRevision = revisionText(currentRevision(context));
        }

        if (READ_TOOLS.contains(name)) {
            if (Set.of("get_component_snapshots", "inspect_current_page").contains(name)) {
                Map<String, Object> validationError = AiAgentToolArguments.snapshots(payload);
                if (validationError != null)
                    return new ToolResult(request.id(), name, "rejected", validationError, false);
            }
            if ("get_component_data_contract".equals(name)) AiAgentDataValidation.normalizeContractRequest(payload);
            if (AiAgentComponentSpecs.TOOL_NAME.equals(name)) {
                AiAgentComponentSpecs.normalizeRequest(payload);
            }
            if ("get_canvas_operation_status".equals(name)) {
                String targetOperationId = text(payload.get("operationId"));
                if (targetOperationId == null) {
                    targetOperationId = text(args.get("operationId"));
                }
                AiAgentService.OperationView operation = agentService.readOperationStatus(context, targetOperationId);
                return new ToolResult(request.id(), name, operation.status(), Map.of(
                        "operationId", operation.operationId(),
                        "operationType", operation.operationType(),
                        "status", operation.status(),
                        "result", operation.result(),
                        "baseRevision", operation.baseRevision() == null ? "" : operation.baseRevision(),
                        "resultRevision", operation.resultRevision() == null ? "" : operation.resultRevision()
                ), false);
            }
            payload.put("operationId", operationId);
            payload.put("toolCallId", request.id());
            payload.put("agentScope", scope(context));
            AiAgentService.OperationView operation = frontendEffectGateway.request(context, name, payload, baseRevision);
            return operationResult(request, operation, true);
        }
        if (WORKSPACE_READ_TOOLS.contains(name) || WORKSPACE_WRITE_TOOLS.contains(name)) {
            return executeWorkspaceTool(request, context, name, payload);
        }
        if ("push_progress_log".equals(name)) {
            String message = text(payload.get("message"));
            if (message == null) {
                message = text(args.get("message"));
            }
            if (message == null) {
                throw AiAgentErrorFeedback.invalid("push_progress_log.message 不能为空", "message", payload.get("message"), Map.of("type", "string", "minLength", 1));
            }
            agentService.appendItem(context, "progress_log", Map.of("message", message));
            agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "progress_log.created", Map.of("message", message));
            return new ToolResult(request.id(), name, "appended", Map.of("message", message), false);
        }
        if ("update_plan".equals(name)) {
            Map<String, Object> plan = normalizePlan(payload, context);
            agentService.appendItem(context, "plan", plan);
            agentService.appendEvent(context.threadId(), context.turnId(), context.runId(), "plan.updated", plan);
            return new ToolResult(request.id(), name, "appended", plan, false);
        }
        if ("request_user_input".equals(name)) {
            Map<String, Object> validationError = AiAgentToolArguments.questions(payload);
            if (validationError != null)
                return new ToolResult(request.id(), name, "rejected", validationError, false);
            Map<String, Object> prompt = new LinkedHashMap<>(payload);
            agentService.markWaitingForInput(context, prompt);
            return new ToolResult(request.id(), name, "waiting_input", prompt, false);
        }
        if (WRITE_TOOLS.contains(name)) {
            Map<String, Object> validationError = validateWritePayload(name, payload, args);
            if (validationError != null) {
                return new ToolResult(request.id(), name, "rejected", validationError, false);
            }
            Map<String, Object> targetScopeError = validateExistingTargetScope(name, payload, context);
            if (targetScopeError != null) {
                return new ToolResult(request.id(), name, "rejected", targetScopeError, false);
            }
            payload.put("operationId", operationId);
            payload.put("operationFingerprint", operationFingerprint(name, payload));
            payload.put("toolCallId", request.id());
            payload.put("agentScope", scope(context));
            Map<String, Object> baselineError = injectExpectedSnapshots(name, payload, context);
            if (baselineError != null) {
                return new ToolResult(request.id(), name, "rejected", baselineError, false);
            }
            if (componentDocuments != null && Set.of("create_canvas_components", "render_draft", "patch_canvas_components").contains(name)
                    && !Set.of("clear", "preview").contains(String.valueOf(payload.get("action")))) {
                try {
                    payload.put("componentDocumentIdentities", componentDocuments.validateWrite(name, payload,
                            agentService.componentSpecEvidence(context), agentService.componentDataContractEvidence(context), Long.valueOf(context.userId())));
                } catch (AiAgentDataValidation.Violation e) {
                    return new ToolResult(request.id(), name, "rejected", e.result(), false);
                } catch (ComponentDocumentParser.DocumentException e) {
                    return new ToolResult(request.id(), name, "rejected", e.result(), false);
                }
            }
            onValidated.accept(payload);
            if (validateOnly) return new ToolResult(request.id(), name, "validated", Map.of(), false);
            AiAgentService.OperationView operation = frontendEffectGateway.request(context, name, payload, baseRevision);
            return operationResult(request, operation, true);
        }
        throw AiAgentErrorFeedback.invalid("未注册的 AI Agent 工具：" + name, "toolName", name, Map.of("allowedValues", specifications().stream().map(ToolSpecification::name).toList()));
    }

    private ToolResult artifactFailure(ToolExecutionRequest request, AiAgentWorkspaceService.RepairArtifact artifact,
                                      Map<String, Object> error, String stage, boolean updated, AiAgentDebugTrace trace) {
        Map<String, Object> result = new LinkedHashMap<>(error);
        if (!result.containsKey("fieldPath") && result.get("path") instanceof String fieldPath)
            result.put("fieldPath", fieldPath);
        result.put("artifactPath", artifact.path());
        result.put("path", artifact.path());
        result.put("workspaceRevision", artifact.workspaceRevision());
        result.put("contentSha256", contentSha256(artifact.content()));
        if (!result.containsKey("errorContext")) {
            attachFieldContext(result, artifact.content());
        }
        result.put("repairTool", "repair_artifact");
        result.put("artifactUpdated", updated);
        result.put("validationStage", stage);
        result.put("retryable", true);
        result.put("recovery", "格式化产物已保存在 path。根据错误和格式化片段调用 repair_artifact 局部修补同一文件，oldText 必须复制当前文件原文；修补后系统会整体格式化、保存并重新校验，仍失败则依据最新回执继续修补。通过全部校验后，再按 path 和最新 workspaceRevision 调用 " + artifact.toolName() + "，不要重新输出完整产物。");
        artifactTrace(trace, "artifact.validation.failed", request, artifact, map("stage", stage, "error", error));
        artifactTrace(trace, "artifact.repair.required", request, artifact, map("stage", stage, "error", result));
        return new ToolResult(request.id(), request.name(), "repair_required", result, false);
    }

    private Map<String, Object> syntaxError(JsonProcessingException error, String content) {
        Map<String, Object> result = new LinkedHashMap<>(error("artifact_json_invalid", "产物 JSON 解析失败", "$", "JSON语法错误", Map.of("type", "object", "rule", "符合 JSON 语法，详见 error 中解析器原因")));
        JsonLocation location = error.getLocation();
        long offset = error instanceof com.fasterxml.jackson.core.io.JsonEOFException ? content.length()
                : location == null ? 0 : Math.max(0, location.getCharOffset() - 1);
        result.put("line", location == null ? 1 : location.getLineNr());
        result.put("column", location == null ? 1 : location.getColumnNr());
        result.put("charOffset", offset);
        String reason = error.getOriginalMessage();
        int source = reason.indexOf(" (for ");
        if (source >= 0) reason = reason.substring(0, source);
        result.put("error", reason);
        int center = (int) Math.min(offset, content.length());
        int start = Math.max(0, center - 120), end = Math.min(content.length(), center + 120);
        result.put("actualValue", center >= content.length() ? "<EOF>" : content.substring(center, center + 1));
        result.put("actualDescription", "解析器报错位置的实际字符；<EOF> 表示文件已结束");
        result.put("errorContext", content.substring(start, end));
        result.put("contextStartOffset", start);
        return result;
    }

    private void attachFieldContext(Map<String, Object> result, String content) {
        String fieldPath = Objects.toString(result.get("fieldPath"), "");
        String pointer = fieldPath.replaceAll("\\[(\\d+)\\]", ".$1");
        pointer = pointer.isEmpty() ? "" : "/" + java.util.Arrays.stream(pointer.split("\\.")).map(part -> part.replace("~", "~0").replace("/", "~1")).collect(java.util.stream.Collectors.joining("/"));
        int center = 0;
        boolean found = false;
        try (var parser = JSON_DIAGNOSTICS_MAPPER.getFactory().createParser(content)) {
            while (parser.nextToken() != null) {
                String current = parser.getParsingContext().pathAsPointer().toString();
                if (!pointer.isEmpty() && (current.equals(pointer) || current.equals("/payload" + pointer))) {
                    var location = parser.getTokenLocation();
                    center = (int) Math.max(0, Math.min(location.getCharOffset(), content.length()));
                    result.put("charOffset", center);
                    result.put("line", location.getLineNr());
                    result.put("column", location.getColumnNr());
                    found = true;
                    break;
                }
            }
        } catch (java.io.IOException ignored) {
            // 语法错误已经携带解析器位置；这里仅处理校验后的结构错误。
        }
        int start = Math.max(0, center - 120);
        result.put("errorContext", content.substring(start, Math.min(content.length(), start + 1000)));
        result.put("contextStartOffset", start);
        result.put("contextLocationKnown", found);
    }

    private void artifactTrace(AiAgentDebugTrace trace, String type, ToolExecutionRequest request,
                               AiAgentWorkspaceService.RepairArtifact artifact, Map<String, Object> fields) {
        trace.record(type, () -> {
            var payload = map("requestId", request.id(), "tool", artifact.toolName(), "path", artifact.path(),
                    "operationId", artifact.operationId(), "workspaceRevision", artifact.workspaceRevision(),
                    "contentSha256", contentSha256(artifact.content()), "mode", "staged");
            payload.putAll(fields);
            // 对正确的 JSON 按字段脱敏，同时保留文本字节形式供辅助工具显示文件快照。
            for (String key : List.of("content", "beforeContent", "afterContent")) {
                if (payload.get(key) instanceof String content) {
                    Object parsed = AiAgentDebugTrace.jsonOrText(content);
                    Object sanitized = AiAgentDebugTrace.redact(parsed);
                    if (!Objects.equals(parsed, sanitized)) {
                        payload.put(key, JSON.toJSONString(sanitized));
                        payload.put(key + "Redacted", true);
                    }
                }
            }
            return payload;
        });
    }

    private ToolResult processArtifact(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                      AiAgentWorkspaceService.RepairArtifact originalArtifact, Consumer<ToolExecutionRequest> guard,
                                      AiAgentDebugTrace trace, boolean updated, boolean submit) {
        var artifact = workspaceService.formatRepairArtifact(projectId(context), context.runId(),
                originalArtifact.path(), originalArtifact.workspaceRevision());
        if (artifact.workspaceRevision() != originalArtifact.workspaceRevision()) {
            updated = true;
            artifactTrace(trace, "artifact.format.applied", request, artifact, map(
                    "previousRevision", originalArtifact.workspaceRevision(),
                    "beforeContent", originalArtifact.content(), "afterContent", artifact.content()));
        }
        artifactTrace(trace, "artifact.read", request, artifact, map("content", artifact.content()));
        artifactTrace(trace, "artifact.validation.started", request, artifact, map("stage", "syntax"));
        Object parsed;
        try {
            parsed = JSON_DIAGNOSTICS_MAPPER.readValue(artifact.content(), Object.class);
        } catch (JsonProcessingException error) {
            return artifactFailure(request, artifact, syntaxError(error, artifact.content()), "syntax", updated, trace);
        }
        artifactTrace(trace, "artifact.validation.passed", request, artifact, map("stage", "syntax"));
        if (!artifact.staged()) return new ToolResult(request.id(), request.name(), "rejected",
                error("artifact_format_unsupported", "不支持旧格式的修复文件", "path", artifact.path(),
                        Map.of("sourceTool", "begin_canvas_artifact")), false);
        if (!(parsed instanceof Map<?, ?> raw))
            return artifactFailure(request, artifact, error("invalid_payload", "工具产物必须解析为 JSON 对象", "$", parsed, Map.of("type", "object")), "structure", updated, trace);
        Map<String, Object> resumed = castMap(raw);
        {
            for (String field : List.of("path", "payload", "payloadJson")) if (resumed.containsKey(field))
                return artifactFailure(request, artifact, error("invalid_payload", "文件必须直接包含组件参数，不能包含 " + field,
                        field, resumed.get(field), Map.of("present", false)), "structure", updated, trace);
            if ("render_draft".equals(artifact.toolName()) && resumed.containsKey("action") && !"render".equals(resumed.get("action")))
                return artifactFailure(request, artifact, error("invalid_payload", "render 产物只允许 action=render", "action", resumed.get("action"), Map.of("value", "render")), "structure", updated, trace);
        }
        if ("render_draft".equals(artifact.toolName())) resumed.put("action", "render");
        resumed.put("operationId", artifact.operationId());
        var original = ToolExecutionRequest.builder().id(request.id()).name(artifact.toolName())
                .arguments(JSON.toJSONString(resumed)).build();
        try {
            guard.accept(original);
        } catch (AiAgentToolFailurePolicy.Stop error) {
            artifactTrace(trace, "artifact.blocked", request, artifact, map("code", error.code, "message", error.getMessage()));
            throw error;
        }
        artifactTrace(trace, "artifact.validation.started", request, artifact, map("stage", "content"));
        ToolResult result;
        try {
            result = executeParsed(original, context, resumed, payload -> {
                artifactTrace(trace, "artifact.validation.passed", request, artifact, map("stage", "content"));
                if (submit) artifactTrace(trace, "artifact.frontend.requested", request, artifact,
                        map("payload", payload, "contentSha256", contentSha256(artifact.content())));
            }, !submit);
        } catch (AppException error) {
            if (error.getCode() >= 500) {
                artifactTrace(trace, "artifact.failed", request, artifact, map("stage", "execution", "message", error.getMsg()));
                throw error;
            }
            result = new ToolResult(request.id(), request.name(), "rejected", exceptionFeedback(error), false);
        }
        if ("rejected".equals(result.status())) {
            // 缺少实时快照或授权不属于产物内容错误，继续遵守原来的读取及授权要求。
            String code = Objects.toString(result.result().get("code"), "");
            if (!Set.of("permission_denied", "read_before_write_required").contains(code))
                return artifactFailure(request, artifact, result.result(), "content", updated, trace);
            artifactTrace(trace, "artifact.validation.failed", request, artifact, map("stage", "prerequisite", "error", result.result()));
        }
        if (!submit && "validated".equals(result.status())) {
            var validated = workspaceService.recordArtifactValidation(projectId(context), context.runId(), artifact.path(), contentSha256(artifact.content()));
            artifactTrace(trace, "artifact.validated", request, validated, map("stage", "ready", "mode", "staged",
                    "contentSha256", contentSha256(validated.content())));
            return artifactFileReceipt(request, validated, "validated", updated || validated.workspaceRevision() != artifact.workspaceRevision());
        }
        if (result.requiresFrontendEffect()) {
            workspaceService.recordRepairSubmission(projectId(context), context.runId(), artifact.path(), map(
                    "status", result.status(), "result", result.result(), "requiresFrontendEffect", true));
            artifactTrace(trace, "artifact.frontend.submitted", request, artifact, map("status", result.status(), "result", result.result(),
                    "workspaceRevision", workspaceService.workspaceRevision(projectId(context))));
        }
        Map<String, Object> body = new LinkedHashMap<>(result.result());
        body.put("path", artifact.path());
        body.put("workspaceRevision", workspaceService.workspaceRevision(projectId(context)));
        body.put("repairTool", "repair_artifact");
        return new ToolResult(request.id(), request.name(), result.status(), body, result.requiresFrontendEffect());
    }

    ToolResult executeWithRepairGuard(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                      Consumer<ToolExecutionRequest> guard) {
        var trace = new AiAgentDebugTrace(context);
        if ("repair_artifact".equals(request.name())) return repairArtifact(request, context, guard, trace);
        if (ARTIFACT_FILE_TOOLS.contains(request.name())) return executeArtifactFileTool(request, context, guard, trace);
        if (isDirectDraftAction(request)) return execute(request, context);
        if (ARTIFACT_TOOLS.contains(request.name())) {
            var reference = artifactReference(request.arguments());
            if (reference != null) return submitArtifact(request, context, reference, guard, trace);
        }
        return execute(request, context);
    }

    private ToolResult repairArtifact(ToolExecutionRequest request, AiAgentService.AgentExecutionContext context,
                                      Consumer<ToolExecutionRequest> guard, AiAgentDebugTrace trace) {
        if (workspaceService == null) throw workspaceUnavailable();
        Map<String, Object> args = new LinkedHashMap<>(parseArguments(request.arguments()));
        validateScope(args, context);
        trace.record("artifact.patch.received", () -> map("requestId", request.id(), "path", args.get("path"),
                "expectedRevision", args.get("expectedRevision"), "edits", args.get("edits")));
        try {
            long projectId = projectId(context);
            String path = requiredText(args.get("path"), "path");
            var artifact = workspaceService.readRepairArtifact(projectId, context.runId(), path);
            if (!artifact.staged()) return new ToolResult(request.id(), request.name(), "rejected",
                    error("artifact_format_unsupported", "不支持旧格式的修复文件", "path", path,
                            Map.of("sourceTool", "begin_canvas_artifact")), false);
            if (agentService != null && agentService.findOperation(artifact.operationId()) != null) {
                // 数据库操作已建立但修复回执尚未落盘时，恢复也不能重复执行。
                var operation = agentService.readOperationStatus(context, artifact.operationId());
                artifactTrace(trace, "artifact.frontend.reused", request, artifact, map("status", operation.status(), "result", operation.result()));
                return artifactReceipt(operationResult(request, operation, Set.of("pending", "prepared", "applying").contains(operation.status())), artifact);
            }
            if (!artifact.submitted().isEmpty()) {
                // 恢复或重复调用只返回原操作回执，不能再次派发创建。
                var saved = artifact.submitted();
                if (agentService != null) {
                    var operation = agentService.readOperationStatus(context, artifact.operationId());
                    boolean waiting = Set.of("pending", "prepared", "applying").contains(operation.status());
                    artifactTrace(trace, "artifact.frontend.reused", request, artifact, map("status", operation.status(), "result", operation.result()));
                    return artifactReceipt(operationResult(request, operation, waiting), artifact);
                }
                artifactTrace(trace, "artifact.frontend.reused", request, artifact, saved);
                return artifactReceipt(new ToolResult(request.id(), request.name(), saved.get("status").toString(),
                        castMap((Map<?, ?>) saved.get("result")), Boolean.TRUE.equals(saved.get("requiresFrontendEffect"))), artifact);
            }
            if (!(args.get("edits") instanceof List<?> edits) || edits.isEmpty() || edits.size() > 64) {
                var error = error("invalid_payload", "edits 必须包含 1–64 个局部文本替换", "edits", args.get("edits"), Map.of("type", "array", "minItems", 1, "maxItems", 64));
                artifactTrace(trace, "artifact.patch.rejected", request, artifact, error);
                return new ToolResult(request.id(), request.name(), "rejected", error, false);
            }
            List<AiAgentWorkspaceService.RepairEdit> replacements = new ArrayList<>();
            for (int index = 0; index < edits.size(); index++) {
                Object edit = edits.get(index);
                String editPath = "edits[" + index + "]";
                Map<String, Object> invalid = null;
                if (!(edit instanceof Map<?, ?> item))
                    invalid = error("invalid_payload", editPath + " 必须为对象", editPath, edit, Map.of("type", "object"));
                else if (!(item.get("oldText") instanceof String oldText) || oldText.isEmpty())
                    invalid = error("invalid_payload", editPath + ".oldText 必须是非空字符串", editPath + ".oldText", item.get("oldText"), Map.of("type", "string", "minLength", 1, "rule", "复制当前文件中唯一匹配的原文"));
                else if (!(item.get("newText") instanceof String))
                    invalid = error("invalid_payload", editPath + ".newText 必须为字符串", editPath + ".newText", item.get("newText"), Map.of("type", "string", "emptyAllowed", true));
                if (invalid != null) {
                    artifactTrace(trace, "artifact.patch.rejected", request, artifact, invalid);
                    return new ToolResult(request.id(), request.name(), "rejected", invalid, false);
                }
                Map<?, ?> item = (Map<?, ?>) edit;
                replacements.add(new AiAgentWorkspaceService.RepairEdit((String) item.get("oldText"), (String) item.get("newText")));
            }
            long before = artifact.workspaceRevision();
            String beforeContent = artifact.content();
            artifact = workspaceService.patchRepairArtifact(projectId, context.runId(), path,
                    requiredLong(args.get("expectedRevision"), "expectedRevision"), replacements);
            artifactTrace(trace, "artifact.patch.applied", request, artifact, map("previousRevision", before,
                    "beforeContent", beforeContent, "afterContent", artifact.content(), "edits", args.get("edits")));
            return workspaceService.withRepairArtifact(projectId, context.runId(), path, artifact.workspaceRevision(),
                    current -> processArtifact(request, context, current, guard, trace, true, false));
        } catch (AiAgentWorkspaceService.WorkspaceException error) {
            var result = workspaceFailure(request, error);
            trace.record("artifact.patch.rejected", () -> map("requestId", request.id(), "path", args.get("path"), "error", result.result()));
            return result;
        } finally {
            trace.record("artifact.processing.ended", () -> map("requestId", request.id(), "tool", request.name()));
        }
    }

    private ToolResult artifactReceipt(ToolResult result, AiAgentWorkspaceService.RepairArtifact artifact) {
        var body = new LinkedHashMap<>(result.result());
        body.put("path", artifact.path());
        body.put("workspaceRevision", artifact.workspaceRevision());
        body.put("repairTool", "repair_artifact");
        return new ToolResult(result.requestId(), result.toolName(), result.status(), body, result.requiresFrontendEffect());
    }

    private ToolResult workspaceFailure(ToolExecutionRequest request, AiAgentWorkspaceService.WorkspaceException error) {
        Map<String, Object> result = error.result();
        result.put("retryable", Set.of("workspace.invalid", "workspace.revision_conflict").contains(error.code()));
        if (error instanceof AiAgentWorkspaceService.RevisionConflictException conflict) {
            result.put("expectedRevision", conflict.expected());
            result.put("actualRevision", conflict.actual());
        }
        return new ToolResult(request.id(), request.name(), "rejected", result, false);
    }

    private ToolResult operationResult(ToolExecutionRequest request, AiAgentService.OperationView operation,
                                       boolean requiresFrontendEffect) {
        Map<String, Object> operationResult = new LinkedHashMap<>();
        operationResult.put("operationId", operation.operationId());
        operationResult.put("operationType", operation.operationType());
        operationResult.put("status", operation.status());
        operationResult.put("baseRevision", operation.baseRevision());
        operationResult.put("resultRevision", operation.resultRevision());
        if (operation.result() != null && !operation.result().isEmpty()) {
            operationResult.put("result", operation.result());
        }
        return new ToolResult(request.id(), request.name(), operation.status(), operationResult, requiresFrontendEffect);
    }

    private Map<String, Object> validateWritePayload(String name, Map<String, Object> payload, Map<String, Object> args) {
        if ("render_draft".equals(name)) return validateRenderDraftPayload(payload, args);
        if ("create_canvas_components".equals(name)) {
            Map<String, Object> conversionError = normalizeComponents(payload);
            return conversionError != null ? conversionError : validateCreateComponents(payload);
        }
        for (String field : List.of("patches", "targets")) {
            if (("patches".equals(field) && "patch_canvas_components".equals(name)
                    || "targets".equals(field) && "delete_canvas_components".equals(name)) && !nonEmptyList(payload.get(field)))
                return error("invalid_payload", "必须直接传入非空 " + field + " 数组", field, payload.get(field), Map.of("type", "array", "minItems", 1));
        }
        if ("request_component_selection".equals(name)) {
            if (!(payload.get("message") instanceof String message) || message.isBlank())
                return error("invalid_payload", "组件选择 message 必须为非空字符串", "message", payload.get("message"), Map.of("type", "string", "minLength", 1));
            if (!(payload.get("candidates") instanceof List<?> candidates) || candidates.isEmpty() || candidates.size() > 30)
                return error("invalid_payload", "candidates 必须有1–30个候选", "candidates", payload.get("candidates"), Map.of("type", "array", "minItems", 1, "maxItems", 30));
            Map<String, Integer> types = new LinkedHashMap<>();
            int selected = 0;
            for (int i = 0; i < candidates.size(); i++) {
                String path = "candidates[" + i + "]";
                if (!(candidates.get(i) instanceof Map<?, ?> item))
                    return error("invalid_payload", path + " 必须为对象", path, candidates.get(i), Map.of("type", "object"));
                for (String field : List.of("componentType", "displayName"))
                    if (!(item.get(field) instanceof String text) || text.isBlank())
                        return error("invalid_payload", path + "." + field + " 必须为非空字符串", path + "." + field, item.get(field), Map.of("type", "string", "minLength", 1));
                Integer previous = types.putIfAbsent((String) item.get("componentType"), i);
                if (previous != null) return error("invalid_payload", "候选 componentType 重复", path + ".componentType", item.get("componentType"), Map.of("uniqueWithin", "candidates", "conflictingFieldPath", "candidates[" + previous + "].componentType"));
                if (item.containsKey("description") && !(item.get("description") instanceof String))
                    return error("invalid_payload", "候选 description 必须为字符串", path + ".description", item.get("description"), Map.of("type", "string"));
                if (item.containsKey("defaultSelected") && !(item.get("defaultSelected") instanceof Boolean))
                    return error("invalid_payload", "候选 defaultSelected 必须为布尔值", path + ".defaultSelected", item.get("defaultSelected"), Map.of("type", "boolean"));
                if (Boolean.TRUE.equals(item.get("defaultSelected"))) selected++;
            }
            for (String field : List.of("minSelected", "maxSelected")) {
                int min = "minSelected".equals(field) ? 0 : 1;
                if (payload.containsKey(field) && (!isInteger(payload.get(field)) || decimal(payload.get(field)) < min || decimal(payload.get(field)) > candidates.size()))
                    return error("invalid_payload", field + " 超出候选范围", field, payload.get(field), Map.of("type", "integer", "minimum", min, "maximum", candidates.size()));
            }
            int min = payload.containsKey("minSelected") ? ((Number) payload.get("minSelected")).intValue() : 1;
            int max = payload.containsKey("maxSelected") ? ((Number) payload.get("maxSelected")).intValue() : candidates.size();
            if (min > max) return error("invalid_payload", "minSelected 不能大于 maxSelected", "minSelected", min, Map.of("maximum", max));
            if (selected > max) return error("invalid_payload", "默认选中数量不能超过 maxSelected", "candidates.defaultSelected", selected, Map.of("maximum", max));
        }
        return null;
    }

    private Map<String, Object> validateRenderDraftPayload(Map<String, Object> payload, Map<String, Object> args) {
        Object rawAction = payload.get("action");
        String action = rawAction == null ? "render" : String.valueOf(rawAction);
        if (!Set.of("render", "preview", "clear").contains(action))
            return error("invalid_payload", "render_draft.action 只允许 render、preview 或 clear", "action", rawAction, Map.of("type", "string", "allowedValues", List.of("render", "preview", "clear")));
        if ("clear".equals(action)) {
            if (payload.containsKey("path") || payload.containsKey("components") || payload.containsKey("patches"))
                return error("invalid_payload", "clear 不接受产物路径或组件内容", "action", payload.keySet(), Map.of("value", "clear"));
            return null;
        }
        if ("preview".equals(action)) {
            Set<String> forbidden = Set.of("path", "expectedRevision", "components", "patches", "payload", "payloadJson", "layout", "regionId", "incremental", "interactive");
            for (String key : forbidden) if (args.containsKey(key) || payload.containsKey(key))
                return error("invalid_payload", "总预览不得传入 " + key, key, payload.containsKey(key) ? payload.get(key) : args.get(key), Map.of("allowedFields", List.of("action", "draftId", "expectedDraftRevision"), "present", false));
            if (validIdentifier(payload.get("draftId"), 200) == null)
                return error("invalid_payload", "preview 必须传有效 draftId", "draftId", payload.get("draftId"), identifierExpected(200));
            if (!isInteger(payload.get("expectedDraftRevision")) || decimal(payload.get("expectedDraftRevision")) < 1)
                return error("invalid_payload", "preview.expectedDraftRevision 必须是正整数", "expectedDraftRevision", payload.get("expectedDraftRevision"), Map.of("type", "integer", "minimum", 1));
            return null;
        }
        Map<String, Object> conversionError = normalizeComponents(payload);
        if (conversionError != null) return conversionError;
        Map<String, Object> componentsError = validateCreateComponents(payload);
        if (componentsError != null) return componentsError;
        for (String field : List.of("incremental", "interactive"))
            if (payload.containsKey(field) && !(payload.get(field) instanceof Boolean))
                return error("invalid_payload", field + " 必须为布尔值", field, payload.get(field), Map.of("type", "boolean"));
        boolean regionContract = payload.containsKey("regionId") || payload.containsKey("layout") || payload.containsKey("draftId");
        if (!regionContract) return null;
        String regionId = validIdentifier(payload.get("regionId"), 128);
        if (regionId == null) return error("invalid_payload", "分区 render 必须提供有效 regionId", "regionId", payload.get("regionId"), identifierExpected(128));
        if (!(payload.get("incremental") instanceof Boolean incremental))
            return error("invalid_payload", "分区 render 必须显式提供布尔值 incremental", "incremental", payload.get("incremental"), Map.of("type", "boolean", "required", true));
        if (!Boolean.FALSE.equals(payload.get("interactive")))
            return error("invalid_payload", "分区 render 必须设置 interactive=false", "interactive", payload.get("interactive"), Map.of("value", false));
        if (!incremental) {
            if (payload.containsKey("draftId"))
                return error("invalid_payload", "首个分区不能传 draftId；使用首次 render 回执创建草稿", "draftId", payload.get("draftId"), Map.of("present", false));
            if (!(payload.get("layout") instanceof List<?> layout) || layout.isEmpty())
                return error("invalid_payload", "首个分区必须提供非空 layout", "layout", payload.get("layout"), Map.of("type", "array", "minItems", 1));
            Map<String, Integer> ids = new LinkedHashMap<>();
            Map<String, Object> current = null;
            Set<String> fields = Set.of("id", "x", "y", "width", "height");
            for (int i = 0; i < layout.size(); i++) {
                String path = "layout[" + i + "]";
                if (!(layout.get(i) instanceof Map<?, ?> raw))
                    return error("invalid_payload", path + " 必须为对象", path, layout.get(i), Map.of("type", "object"));
                Map<String, Object> region = castMap(raw);
                for (String field : region.keySet()) if (!fields.contains(field))
                    return error("invalid_payload", path + " 不支持字段 " + field, path + "." + field, region.get(field), Map.of("allowedFields", fields));
                String id = validIdentifier(region.get("id"), 128);
                if (id == null) return error("invalid_payload", path + ".id 无效", path + ".id", region.get("id"), identifierExpected(128));
                Integer previous = ids.putIfAbsent(id, i);
                if (previous != null) return error("invalid_payload", "layout 区域 id 重复", path + ".id", id, Map.of("uniqueWithin", "layout", "conflictingFieldPath", "layout[" + previous + "].id"));
                for (String field : List.of("x", "y", "width", "height")) {
                    boolean positive = Set.of("width", "height").contains(field);
                    Object actual = region.get(field);
                    if (!isFiniteNumber(actual) || (positive ? decimal(actual) <= 0 : decimal(actual) < 0))
                        return error("invalid_payload", path + "." + field + (positive ? " 必须为正有限数" : " 必须为非负有限数"), path + "." + field, actual, Map.of("type", "number", "finite", true, positive ? "exclusiveMinimum" : "minimum", 0));
                }
                if (regionId.equals(id)) current = region;
            }
            if (current == null) return error("invalid_payload", "layout 未包含当前 regionId", "regionId", regionId, Map.of("allowedValues", ids.keySet()));
            return validateRegionComponentBounds(payload, current);
        }
        if (validIdentifier(payload.get("draftId"), 200) == null)
            return error("invalid_payload", "后续分区必须传首次 render 回执中的 draftId", "draftId", payload.get("draftId"), identifierExpected(200));
        if (payload.containsKey("layout"))
            return error("invalid_payload", "后续分区沿用首次布局，不得重复传 layout", "layout", payload.get("layout"), Map.of("present", false));
        return null;
    }

    private Map<String, Object> identifierExpected(int maxLength) {
        return Map.of("type", "string", "minLength", 1, "maxLength", maxLength, "rule", "无首尾空白、无控制字符，使用实际回执中的ID");
    }

    private Map<String, Object> validateRegionComponentBounds(Map<String, Object> payload, Map<String, Object> region) {
        List<?> components = (List<?>) payload.get("components");
        double regionX = decimal(region.get("x"));
        double regionY = decimal(region.get("y"));
        double regionRight = regionX + decimal(region.get("width"));
        double regionBottom = regionY + decimal(region.get("height"));
        for (int index = 0; index < components.size(); index++) {
            Map<String, Object> component = castMap((Map<?, ?>) components.get(index));
            double x = decimal(component.get("x"));
            double y = decimal(component.get("y"));
            double right = x + decimal(component.get("width"));
            double bottom = y + decimal(component.get("height"));
            if (x < regionX || y < regionY || right > regionRight || bottom > regionBottom) {
                return componentError(index, component, "", "组件超出 regionId=" + payload.get("regionId") + " 对应区域范围",
                        map("x", x, "y", y, "right", right, "bottom", bottom),
                        map("regionId", payload.get("regionId"), "minX", regionX, "minY", regionY, "maxRight", regionRight, "maxBottom", regionBottom));
            }
        }
        return null;
    }

    private String validIdentifier(Object value, int maxLength) {
        if (!(value instanceof String identifier) || !identifier.equals(identifier.trim()) || identifier.isEmpty()
                || identifier.codePointCount(0, identifier.length()) > maxLength
                || identifier.codePoints().anyMatch(Character::isISOControl)) return null;
        return identifier;
    }

    private Map<String, Object> normalizeComponents(Map<String, Object> payload) {
        if (!(payload.get("components") instanceof String value)) {
            return null;
        }
        Object parsed;
        try {
            parsed = JSON_DIAGNOSTICS_MAPPER.readValue(value, Object.class);
        } catch (JsonProcessingException error) {
            var result = syntaxError(error, value);
            result.putAll(error("invalid_payload", "components 字符串转换为数组失败，JSON 格式错误：" + jsonErrorDetails(error), "components", value, Map.of("type", "array", "minItems", 1)));
            return result;
        }
        if (!(parsed instanceof List<?> components)) {
            return error("invalid_payload", "components 解析结果不是 JSON 数组；必须直接传入非空数组", "components", parsed, Map.of("type", "array", "minItems", 1));
        }
        if (components.isEmpty()) {
            return error("invalid_payload", "components 数组不能为空", "components", components, Map.of("type", "array", "minItems", 1));
        }
        payload.put("components", components);
        return null;
    }

    private Map<String, Object> validateCreateComponents(Map<String, Object> payload) {
        if (!nonEmptyList(payload.get("components")))
            return error("invalid_payload", "必须直接传入非空 components 数组", "components", payload.get("components"), Map.of("type", "array", "minItems", 1));
        Map<String, Integer> ids = new LinkedHashMap<>();
        List<?> components = (List<?>) payload.get("components");
        Set<String> allowed = Set.of("id", "type", "name", "x", "y", "width", "height", "order", "config", "useDefaultConfig");
        for (int index = 0; index < components.size(); index++) {
            Object value = components.get(index);
            if (!(value instanceof Map<?, ?> raw))
                return componentError(index, Map.of(), "", "组件必须是对象", value, Map.of("type", "object"));
            Map<String, Object> component = castMap(raw);
            for (String key : component.keySet()) if (!allowed.contains(key))
                return componentError(index, component, key, "不支持的组件字段", component.get(key), Map.of("allowedFields", allowed));
            for (String field : List.of("id", "type")) if (!(component.get(field) instanceof String text) || text.isBlank())
                return componentError(index, component, field, field + " 必须为非空字符串", component.get(field), Map.of("type", "string", "minLength", 1));
            String id = text(component.get("id"));
            Integer previous = ids.putIfAbsent(id, index);
            if (previous != null)
                return componentError(index, component, "id", "组件 id 与 components[" + previous + "].id 重复", component.get("id"), Map.of("uniqueWithin", "components", "conflictingFieldPath", "components[" + previous + "].id"));
            for (String field : List.of("x", "y", "width", "height")) {
                boolean dimension = Set.of("width", "height").contains(field);
                Object actual = component.get(field);
                if (!isFiniteNumber(actual) || (dimension ? decimal(actual) <= 0 : decimal(actual) < 0))
                    return componentError(index, component, field, field + (dimension ? " 必须为正有限数" : " 必须为非负有限数"), actual, Map.of("type", "number", "finite", true, dimension ? "exclusiveMinimum" : "minimum", 0));
            }
            if (component.containsKey("name") && (!(component.get("name") instanceof String name) || name.isBlank() || name.codePointCount(0, name.length()) > 200))
                return componentError(index, component, "name", "name 必须为 1–200 个字符", component.get("name"), Map.of("type", "string", "minLength", 1, "maxLength", 200));
            if (component.containsKey("order") && !isInteger(component.get("order")))
                return componentError(index, component, "order", "order 必须是有限整数", component.get("order"), Map.of("type", "integer", "finite", true));
            Object config = component.get("config");
            boolean hasConfig = config instanceof Map<?, ?> map && !map.isEmpty();
            if (component.containsKey("useDefaultConfig") && !(component.get("useDefaultConfig") instanceof Boolean))
                return componentError(index, component, "useDefaultConfig", "useDefaultConfig 必须是布尔值", component.get("useDefaultConfig"), Map.of("type", "boolean"));
            boolean defaults = Boolean.TRUE.equals(component.get("useDefaultConfig"));
            if (hasConfig && defaults)
                return componentError(index, component, "useDefaultConfig", "config 与 useDefaultConfig=true 不能同时提供", true, Map.of("value", false, "rule", "已提供 config"));
            if ((component.containsKey("config") && !hasConfig) || (!hasConfig && !defaults))
                return componentError(index, component, "config", "必须提供非空 config 对象，或省略 config 并设置 useDefaultConfig=true", config, Map.of("type", "object", "minProperties", 1, "alternative", "省略 config 且 useDefaultConfig=true"));
        }
        return null;
    }

    private Map<String, Object> componentError(int index, Map<String, Object> component, String field,
                                               String message, Object actual, Object expected) {
        String path = "components[" + index + "]" + (field.isEmpty() ? "" : "." + field);
        var result = error("invalid_create_component", path + " " + message, path, actual, expected);
        if (component.get("id") != null) result.put("componentId", component.get("id"));
        if (component.get("type") != null) result.put("componentType", component.get("type"));
        return result;
    }

    private boolean isInteger(Object value) {
        return isFiniteNumber(value) && Math.rint(decimal(value)) == decimal(value);
    }

    private boolean isFiniteNumber(Object value) {
        return value instanceof Number number && Double.isFinite(number.doubleValue());
    }

    private double decimal(Object value) {
        return ((Number) value).doubleValue();
    }

    private Map<String, Object> validateExistingTargetScope(String name, Map<String, Object> payload,
                                                             AiAgentService.AgentExecutionContext context) {
        if (!"patch_canvas_components".equals(name) && !"delete_canvas_components".equals(name)) {
            return null;
        }
        List<String> allowedIds = selectedTargetIds(context.selection());
        if (allowedIds.isEmpty()) {
            return null;
        }
        List<String> requestedIds = targetIds(name, payload);
        List<String> outside = requestedIds.stream().filter(id -> !allowedIds.contains(id)).toList();
        if (!outside.isEmpty()) {
            var result = error("target_out_of_scope", "目标组件不在任务启动时的选中范围内", "delete_canvas_components".equals(name) ? "targets" : "patches", requestedIds, Map.of("allowedComponentIds", allowedIds));
            result.put("offendingComponentIds", outside);
            return result;
        }
        return null;
    }

    private List<String> selectedTargetIds(Map<String, Object> selection) {
        if (selection == null || selection.isEmpty()) {
            return List.of();
        }
        List<String> ids = new ArrayList<>();
        Object rawTargetIds = selection.get("targetIds");
        if (rawTargetIds instanceof List<?> targetIds) {
            for (Object id : targetIds) {
                String targetId = text(id);
                if (targetId != null) {
                    ids.add(targetId);
                }
            }
        }
        Object rawComponents = selection.get("components");
        if (rawComponents instanceof List<?> components) {
            for (Object component : components) {
                if (component instanceof Map<?, ?> raw) {
                    String id = text(raw.get("id"));
                    if (id != null) {
                        ids.add(id);
                    }
                }
            }
        }
        return ids.stream().distinct().toList();
    }

    private Map<String, Object> normalizePlan(Map<String, Object> payload, AiAgentService.AgentExecutionContext context) {
        Object rawPlan = payload.get("plan");
        if (!(rawPlan instanceof List<?> plan) || plan.isEmpty() || plan.size() > 20)
            throw AiAgentErrorFeedback.invalid("update_plan.plan 必须包含 1 到 20 个步骤", "plan", rawPlan, Map.of("type", "array", "minItems", 1, "maxItems", 20));
        List<String> inProgress = new ArrayList<>();
        for (int index = 0; index < plan.size(); index++) {
            String path = "plan[" + index + "]";
            if (!(plan.get(index) instanceof Map<?, ?> step))
                throw AiAgentErrorFeedback.invalid(path + " 必须为对象", path, plan.get(index), Map.of("type", "object", "requiredFields", List.of("step", "status")));
            if (!(step.get("step") instanceof String text) || text.isBlank() || text.length() > 200)
                throw AiAgentErrorFeedback.invalid(path + ".step 必须为 1–200 个字符", path + ".step", step.get("step"), Map.of("type", "string", "minLength", 1, "maxLength", 200));
            Set<String> statuses = Set.of("pending", "in_progress", "inProgress", "completed");
            if (!(step.get("status") instanceof String status) || !statuses.contains(status))
                throw AiAgentErrorFeedback.invalid(path + ".status 不合法", path + ".status", step.get("status"), Map.of("type", "string", "allowedValues", statuses));
            if (Set.of("in_progress", "inProgress").contains(step.get("status"))) inProgress.add(path + ".status");
        }
        if (inProgress.size() > 1)
            throw AiAgentErrorFeedback.invalid("同一时间最多一个计划步骤处于 in_progress", "plan", inProgress, Map.of("maxInProgress", 1));
        List<String> normalizedEffects = null;
        if (payload.containsKey("completionRequirements")) {
            Object raw = payload.get("completionRequirements");
            if (!(raw instanceof Map<?, ?> requirements))
                throw AiAgentErrorFeedback.invalid("completionRequirements 必须为对象", "completionRequirements", raw, Map.of("type", "object", "requiredFields", List.of("requiredCanvasEffects")));
            String path = "completionRequirements.requiredCanvasEffects";
            if (!(requirements.get("requiredCanvasEffects") instanceof List<?> effects) || effects.size() > 3)
                throw AiAgentErrorFeedback.invalid(path + " 必须为最多3项的数组", path, requirements.get("requiredCanvasEffects"), Map.of("type", "array", "maxItems", 3));
            Set<String> allowed = Set.of("createComponents", "patchComponents", "deleteComponents");
            for (int index = 0; index < effects.size(); index++) if (!(effects.get(index) instanceof String) || !allowed.contains(effects.get(index)))
                throw AiAgentErrorFeedback.invalid("不支持的画布效果", path + "[" + index + "]", effects.get(index), Map.of("type", "string", "allowedValues", allowed));
            normalizedEffects = effects.stream().map(String::valueOf).distinct().toList();
        }
        normalizedEffects = agentService.declareCompletionRequirements(context, normalizedEffects);
        Map<String, Object> normalized = new LinkedHashMap<>(payload);
        normalized.put("plan", plan);
        normalized.put("steps", plan);
        if (payload.containsKey("completionRequirements") || !normalizedEffects.isEmpty())
            normalized.put("completionRequirements", Map.of("requiredCanvasEffects", normalizedEffects));
        return normalized;
    }

    private static AiAgentErrorFeedback.Failure workspaceUnavailable() {
        return new AiAgentErrorFeedback.Failure(500, AiAgentErrorFeedback.error("agent.workspace.unavailable",
                "AI Agent Workspace 服务未初始化，当前无法执行文件工具", "workspaceService", null,
                "initialized Workspace service"));
    }

    private ToolResult executeWorkspaceTool(ToolExecutionRequest request,
                                            AiAgentService.AgentExecutionContext context,
                                            String name,
                                            Map<String, Object> args) {
        if (workspaceService == null) {
            throw workspaceUnavailable();
        }
        long projectId = projectId(context);
        try {
            Object value;
            if ("list_workspace_files".equals(name)) {
                value = workspaceService.listWorkspaceFiles(
                        projectId,
                        Objects.requireNonNullElse(text(args.get("path")), ""),
                        integer(args.get("depth"), AiAgentWorkspaceService.DEFAULT_LIST_DEPTH, "depth"),
                        integer(args.get("offset"), 0, "offset"),
                        integer(args.get("limit"), AiAgentWorkspaceService.DEFAULT_LIST_LIMIT, "limit")
                );
            } else if ("search_workspace_files".equals(name)) {
                value = workspaceService.searchWorkspaceFiles(projectId, new AiAgentWorkspaceService.SearchRequest(
                        requiredText(args.get("query"), "query"),
                        Objects.requireNonNullElse(text(args.get("path")), ""),
                        enumValue(args.get("mode"), AiAgentWorkspaceService.SearchMode.class,
                                AiAgentWorkspaceService.SearchMode.LITERAL, "mode"),
                        enumValue(args.get("caseMode"), AiAgentWorkspaceService.CaseMode.class,
                                AiAgentWorkspaceService.CaseMode.SENSITIVE, "caseMode"),
                        stringList(args.get("globs")),
                        booleanValue(args.get("includeHidden"), false, "includeHidden"),
                        booleanValue(args.get("respectIgnoreFiles"), true, "respectIgnoreFiles"),
                        integer(args.get("maxResults"), AiAgentWorkspaceService.DEFAULT_SEARCH_RESULTS, "maxResults")
                ));
            } else if ("read_workspace_file".equals(name)) {
                AiAgentWorkspaceService.FileExcerpt excerpt = workspaceService.readWorkspaceFile(
                        projectId,
                        requiredText(args.get("path"), "path"),
                        integer(args.get("startLine"), 1, "startLine"),
                        integer(args.get("endLine"), 160, "endLine")
                );
                boolean hasMore = excerpt.endLine() < excerpt.totalLines();
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("excerpt", asMap(excerpt));
                result.put("hasMore", hasMore);
                result.put("nextStartLine", hasMore ? excerpt.endLine() + 1 : null);
                value = result;
            } else if ("apply_workspace_patch".equals(name)) {
                value = workspaceService.applyWorkspacePatch(
                        projectId,
                        requiredLong(args.get("expectedRevision"), "expectedRevision"),
                        requiredText(args.get("patch"), "patch")
                );
            } else if ("move_workspace_path".equals(name)) {
                value = workspaceService.moveWorkspacePath(
                        projectId,
                        requiredText(args.get("from"), "from"),
                        requiredText(args.get("to"), "to"),
                        requiredLong(args.get("expectedRevision"), "expectedRevision")
                );
            } else {
                value = workspaceService.deleteWorkspacePath(
                        projectId,
                        requiredText(args.get("path"), "path"),
                        requiredLong(args.get("expectedRevision"), "expectedRevision")
                );
            }
            return new ToolResult(request.id(), name,
                    WORKSPACE_WRITE_TOOLS.contains(name) ? "applied" : "completed",
                    asMap(value), false);
        } catch (AiAgentWorkspaceService.WorkspaceException error) {
            Map<String, Object> result = error.result();
            result.put("retryable", error instanceof AiAgentWorkspaceService.RevisionConflictException);
            if (error instanceof AiAgentWorkspaceService.RevisionConflictException conflict) {
                result.put("expectedRevision", conflict.expected());
                result.put("actualRevision", conflict.actual());
            }
            return new ToolResult(request.id(), name, "failed", result, false);
        }
    }

    private long projectId(AiAgentService.AgentExecutionContext context) {
        try {
            long value = Long.parseLong(context.projectId());
            if (value <= 0) {
                throw new NumberFormatException();
            }
            return value;
        } catch (NumberFormatException error) {
            throw AiAgentErrorFeedback.invalid("projectId 必须为正整数ID", "agentScope.projectId", context.projectId(), Map.of("type", "integer", "minimum", 1));
        }
    }

    private int integer(Object value, int fallback, String field) {
        if (value == null) return fallback;
        try {
            long parsed;
            if (value instanceof Number && isInteger(value)) parsed = new java.math.BigDecimal(value.toString()).longValueExact();
            else throw new IllegalArgumentException();
            if (parsed < Integer.MIN_VALUE || parsed > Integer.MAX_VALUE) throw new ArithmeticException();
            return (int) parsed;
        } catch (IllegalArgumentException | ArithmeticException error) {
            throw AiAgentErrorFeedback.invalid(field + " 必须为32位整数", field, value, Map.of("type", "integer", "minimum", Integer.MIN_VALUE, "maximum", Integer.MAX_VALUE));
        }
    }

    private long requiredLong(Object value, String field) {
        try {
            long parsed = value instanceof Number && isInteger(value)
                    ? new java.math.BigDecimal(value.toString()).longValueExact() : -1;
            if (parsed < 0) throw new ArithmeticException();
            return parsed;
        } catch (IllegalArgumentException | ArithmeticException error) {
            throw AiAgentErrorFeedback.invalid(field + " 必须是非负整数", field, value, Map.of("type", "integer", "minimum", 0, "maximum", Long.MAX_VALUE));
        }
    }

    private String requiredText(Object value, String field) {
        if (!(value instanceof String text) || text.isBlank())
            throw AiAgentErrorFeedback.invalid(field + " 必须为非空字符串", field, value, Map.of("type", "string", "minLength", 1));
        return text.trim();
    }

    private List<String> stringList(Object value) {
        if (value == null) return List.of();
        if (!(value instanceof List<?> values))
            throw AiAgentErrorFeedback.invalid("globs 必须是字符串数组", "globs", value, Map.of("type", "array", "itemsType", "string"));
        for (int i = 0; i < values.size(); i++) if (!(values.get(i) instanceof String))
            throw AiAgentErrorFeedback.invalid("glob 必须为字符串", "globs[" + i + "]", values.get(i), Map.of("type", "string"));
        return values.stream().map(String.class::cast).toList();
    }

    private boolean booleanValue(Object value, boolean fallback, String field) {
        if (value == null) return fallback;
        if (value instanceof Boolean bool) return bool;
        throw AiAgentErrorFeedback.invalid(field + " 必须为布尔值", field, value, Map.of("type", "boolean", "default", fallback));
    }

    private <T extends Enum<T>> T enumValue(Object value, Class<T> type, T fallback, String field) {
        if (value == null) return fallback;
        try {
            if (!(value instanceof String raw)) throw new IllegalArgumentException();
            return Enum.valueOf(type, raw.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException error) {
            throw AiAgentErrorFeedback.invalid(field + " 参数不合法", field, value,
                    Map.of("type", "string", "allowedValues", java.util.Arrays.stream(type.getEnumConstants()).map(v -> v.name().toLowerCase(Locale.ROOT)).toList()));
        }
    }

    private Map<String, Object> asMap(Object value) {
        JSONObject object = JSON.parseObject(JSON.toJSONString(value));
        return object == null ? new LinkedHashMap<>() : new LinkedHashMap<>(object);
    }

    private Map<String, Object> injectExpectedSnapshots(String name, Map<String, Object> payload,
                                                         AiAgentService.AgentExecutionContext context) {
        if (!Set.of("patch_canvas_components", "delete_canvas_components").contains(name)) {
            return null;
        }
        if (nonEmptyList(payload.get("expectedSnapshots"))) {
            return null;
        }
        Map<String, Object> latestRead = agentService.latestFrontendReadResult(context);
        Object rawComponents = latestRead.get("components");
        if (!(rawComponents instanceof List<?> components) || components.isEmpty()) {
            return error("read_before_write_required", "请先读取将修改组件的实时快照", "expectedSnapshots", rawComponents, Map.of("componentIds", targetIds(name, payload), "sourceTool", "get_component_snapshots"));
        }
        List<String> targetIds = targetIds(name, payload);
        Map<String, Map<String, Object>> componentById = new LinkedHashMap<>();
        for (Object value : components) {
            if (!(value instanceof Map<?, ?> raw)) {
                continue;
            }
            Map<String, Object> component = castMap(raw);
            String componentId = text(component.get("id"));
            if (componentId != null) {
                componentById.put(componentId, component);
            }
        }
        List<Map<String, Object>> expected = new ArrayList<>();
        for (String targetId : targetIds) {
            Map<String, Object> component = componentById.get(targetId);
            if (component == null) {
                var result = error("read_before_write_required", "实时快照中缺少组件：" + targetId, "expectedSnapshots", componentById.keySet(), Map.of("requiredComponentId", targetId, "sourceTool", "get_component_snapshots"));
                result.put("componentId", targetId);
                return result;
            }
            Map<String, Object> snapshot = new LinkedHashMap<>();
            snapshot.put("componentId", targetId);
            snapshot.put("componentType", text(component.get("type")));
            for (String field : List.of("layer", "style", "data", "filter")) {
                if (component.containsKey(field)) {
                    snapshot.put(field, component.get(field));
                }
            }
            List<String> missing = missingBaseline(name, payload, snapshot);
            if (!missing.isEmpty()) {
                var result = error("read_before_write_required", "组件 " + targetId + " 的实时快照缺少 " + String.join("、", missing), "expectedSnapshots", snapshot, Map.of("requiredFields", missing, "sourceTool", "get_component_snapshots"));
                result.put("componentId", targetId);
                result.put("missingFields", missing);
                return result;
            }
            expected.add(snapshot);
        }
        if (!"patch_canvas_components".equals(name)) {
            payload.put("expectedSnapshots", expected);
        }
        return null;
    }

    private String operationFingerprint(String operationType, Map<String, Object> payload) {
        Map<String, Object> fingerprintPayload = new LinkedHashMap<>(payload);
        fingerprintPayload.remove("operationId");
        String content = operationType + ":" + JSON.toJSONString(fingerprintPayload);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte value : digest) {
                hex.append(String.format("%02x", value));
            }
            return "sha256:" + hex;
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 不可用", error);
        }
    }

    private List<String> missingBaseline(String name, Map<String, Object> payload, Map<String, Object> snapshot) {
        Set<String> required = new java.util.LinkedHashSet<>();
        required.add("componentId");
        required.add("componentType");
        if ("delete_canvas_components".equals(name)) required.add("layer");
        if (payload.get("patches") instanceof List<?> patches)
            for (Object value : patches) if (value instanceof Map<?, ?> patch && Objects.equals(text(patch.get("componentId")), snapshot.get("componentId")))
                for (String field : List.of("style", "data", "layer", "filter")) if (patch.containsKey(field + "Patch")) required.add(field);
        return required.stream().filter(field -> !snapshot.containsKey(field) || snapshot.get(field) == null).toList();
    }

    private List<String> targetIds(String name, Map<String, Object> payload) {
        Object rawTargets = "delete_canvas_components".equals(name) ? payload.get("targets") : payload.get("patches");
        if (!(rawTargets instanceof List<?> targets)) {
            return List.of();
        }
        List<String> ids = new ArrayList<>();
        for (Object value : targets) {
            if (value instanceof String string) {
                if (text(string) != null) {
                    ids.add(text(string));
                }
                continue;
            }
            if (value instanceof Map<?, ?> raw) {
                Map<String, Object> target = castMap(raw);
                String id = text(target.get("componentId"));
                if (id == null) {
                    id = text(target.get("id"));
                }
                if (id != null) {
                    ids.add(id);
                }
            }
        }
        return ids.stream().distinct().toList();
    }

    private boolean nonEmptyList(Object value) {
        return value instanceof List<?> list && !list.isEmpty();
    }

    private Map<String, Object> error(String code, String message) {
        return Map.of("code", code, "message", message);
    }

    private Map<String, Object> error(String code, String message, String fieldPath, Object actual, Object expected) {
        return AiAgentErrorFeedback.error(code, message, fieldPath, actual, expected);
    }

    private Map<String, Object> exceptionFeedback(AppException exception) {
        if (exception instanceof AiAgentErrorFeedback.Failure failure) return failure.result();
        if (exception instanceof AiAgentDataValidation.Violation violation) return violation.result();
        var result = error(exception.getCode() == 403 ? "permission_denied" : "invalid_payload", exception.getMsg(),
                "execution", map("httpStatus", exception.getCode(), "reason", exception.getMsg()),
                Map.of("rule", "满足错误原因中说明的授权或运行前提后执行"));
        result.put("diagnosticSource", "unstructured_exception");
        return result;
    }

    private JSONObject parseArguments(String arguments) {
        if (arguments == null || arguments.isBlank()) return new JSONObject();
        try {
            Object parsed = JSON_DIAGNOSTICS_MAPPER.readValue(arguments, Object.class);
            if (!(parsed instanceof Map<?, ?> raw))
                throw AiAgentErrorFeedback.invalid("工具参数根节点必须为 JSON 对象", "$", parsed, Map.of("type", "object"));
            return new JSONObject(castMap(raw));
        } catch (JsonProcessingException e) {
            var result = syntaxError(e, arguments);
            result.put("actualValue", AiAgentErrorFeedback.safeValue("$", arguments));
            result.put("code", "invalid_arguments");
            result.put("fieldPath", "$");
            result.put("message", "工具参数 JSON 格式错误：" + jsonErrorDetails(e));
            throw new AiAgentErrorFeedback.Failure(400, result);
        }
    }

    private String jsonErrorDetails(JsonProcessingException error) {
        JsonLocation location = error.getLocation();
        long offset = location == null ? -1 : location.getCharOffset();
        int line = location == null ? -1 : location.getLineNr();
        int column = location == null ? -1 : location.getColumnNr();
        return "第 " + line + " 行，第 " + column
                + " 列，字符偏移 " + offset + "：" + error.getOriginalMessage();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> payload(Map<String, Object> args) {
        Object value = args.get("payload");
        if (value instanceof Map<?, ?> map) {
            return new LinkedHashMap<>((Map<String, Object>) map);
        }
        String payloadJson = text(args.get("payloadJson"));
        if (payloadJson == null) {
            return new LinkedHashMap<>(args);
        }
        JSONObject object = parseArguments(payloadJson);
        return new LinkedHashMap<>(object);
    }

    private void validateScope(Map<String, Object> args, AiAgentService.AgentExecutionContext context) {
        Map<String, Object> scope = args.get("agentScope") instanceof Map<?, ?> map
                ? castMap(map)
                : args;
        String prefix = args.get("agentScope") instanceof Map<?, ?> ? "agentScope." : "";
        requireMatch(scope, "projectId", context.projectId(), prefix);
        requireMatch(scope, "threadId", context.threadId(), prefix);
        requireMatch(scope, "turnId", context.turnId(), prefix);
        requireMatch(scope, "runId", context.runId(), prefix);
    }

    private void requireMatch(Map<String, Object> scope, String field, String expected, String prefix) {
        String value = text(scope.get(field));
        if (value != null && !expected.equals(value)) {
            throw new AiAgentErrorFeedback.Failure(403, error("permission_denied", "工具作用域不匹配：" + field, prefix + field, scope.get(field), Map.of("value", expected)));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Map<?, ?> source) {
        return new LinkedHashMap<>((Map<String, Object>) source);
    }

    private Map<String, Object> scope(AiAgentService.AgentExecutionContext context) {
        Map<String, Object> scope = new LinkedHashMap<>();
        scope.put("projectId", context.projectId());
        scope.put("threadId", context.threadId());
        scope.put("turnId", context.turnId());
        scope.put("runId", context.runId());
        String managerId = text(context.canvasSnapshot().get("managerId"));
        if (managerId != null) {
            scope.put("managerId", managerId);
        }
        Object revision = currentRevision(context);
        if (revision != null) {
            scope.put("baseRevision", revision);
        }
        return scope;
    }

    private Object currentRevision(AiAgentService.AgentExecutionContext context) {
        Object value = context.canvasSnapshot().get("revision");
        if (value == null) {
            value = context.context().get("canvasRevision");
        }
        return value;
    }

    private String revisionText(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String shortcutCommand(AiAgentService.AgentExecutionContext context) {
        Object shortcut = context.context().get("shortcut");
        if (shortcut instanceof Map<?, ?> shortcutMap) {
            String command = text(shortcutMap.get("command"));
            if (command != null) {
                return command;
            }
        }
        return null;
    }

    private String text(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    public record ToolResult(String requestId, String toolName, String status, Map<String, Object> result,
                             boolean requiresFrontendEffect) {
        public String asJson() {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("requestId", requestId);
            payload.put("toolName", toolName);
            payload.put("status", status);
            payload.put("result", result);
            return JSON.toJSONString(payload, com.alibaba.fastjson2.JSONWriter.Feature.WriteNulls);
        }
    }
}
