/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.AiModelMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import com.zsq.datavisoolservice.util.AppContextUtil;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Web AI 任务生命周期注册表。
 *
 * 工作流由当前浏览器会话逐阶段执行，服务端负责统一的模型能力预检、
 * 任务进度、诊断、取消状态和最终快照，并通过任务工作区提供重启恢复能力。
 */
@Service
public class AiDrivenTaskService {
    private static final Logger log = LoggerFactory.getLogger(AiDrivenTaskService.class);
    private static final int PERSISTENCE_FORMAT_VERSION = 1;
    private static final long TASK_TTL_MS = 24L * 60L * 60L * 1000L;
    private static final long TASK_HEARTBEAT_TIMEOUT_MS = 45_000L;
    private static final long WORKER_LEASE_MS = 30_000L;
    private static final int MAX_CHECKPOINTS = 256;
    private static final int MAX_CHECKPOINT_JSON_CHARS = 2 * 1024 * 1024;
    private static final int MAX_CHECKPOINT_TOTAL_JSON_CHARS = 16 * 1024 * 1024;
    private static final int MAX_TASKS_PER_USER = 64;
    private static final int MAX_TASKS_GLOBAL = 512;
    private static final int MAX_PROGRESS_ENTRIES = 1_000;
    private static final int MAX_DIAGNOSTIC_ENTRIES = 500;
    private static final int SUBMIT_LOCK_STRIPES = 64;
    private final Map<String, TaskState> tasks = new ConcurrentHashMap<>();
    private final Object[] submitLocks = java.util.stream.IntStream
            .range(0, SUBMIT_LOCK_STRIPES)
            .mapToObj(ignored -> new Object())
            .toArray();

    @Resource
    private AiModelMapper aiModelMapper;

    @Resource
    private AiDrivenAttachmentService attachmentService;

    @Resource
    private AiDrivenWorkspaceService workspaceService;

    @PostConstruct
    void restorePersistedTasks() {
        long now = Instant.now().toEpochMilli();
        for (AiDrivenWorkspaceService.WorkspaceStateFile stateFile : workspaceService.loadTaskStates()) {
            try {
                PersistentTaskState persisted =
                        JSON.parseObject(stateFile.taskStateJson(), PersistentTaskState.class);
                if (persisted == null
                        || persisted.formatVersion() != PERSISTENCE_FORMAT_VERSION
                        || !stateFile.runId().equals(persisted.runId())) {
                    log.warn("AI 任务工作区状态不合法，已跳过: {}", stateFile.runId());
                    continue;
                }
                if (persisted.updatedAt() + TASK_TTL_MS <= now) {
                    workspaceService.removeWorkspace(stateFile.runId());
                    continue;
                }
                TaskState state = TaskState.restore(persisted);
                if (!state.isFinal()) {
                    attachmentService.restoreWorkspaceAttachments(
                            state.runId,
                            List.copyOf(state.attachmentIds)
                    );
                }
                TaskState existing = tasks.get(state.requestId);
                if (existing == null || existing.updatedAt < state.updatedAt) {
                    tasks.put(state.requestId, state);
                    persistTaskState(state);
                }
            } catch (RuntimeException e) {
                log.warn("恢复 AI 任务工作区失败，已跳过: {}", stateFile.runId(), e);
            }
        }
    }

    public TaskSnapshot submit(TaskSubmitRequest request) {
        User user = requireCurrentUser();
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String schemaVersion = requireText(request.schemaVersion(), "schemaVersion");
        if (!"ai-driven-task/v1".equals(schemaVersion)) {
            throw new AppException(400, "不支持的 AI 任务协议版本");
        }
        String requestId = requireText(request.requestId(), "requestId");
        String sessionId = requireText(request.sessionId(), "sessionId");
        String projectId = requireText(request.projectId(), "projectId");
        String requirement = requireText(request.requirement(), "requirement");
        String modelConfigId = request.model() == null
                ? null
                : requireText(request.model().modelConfigId(), "model.modelConfigId");
        long modelId = parseId(modelConfigId, "model.modelConfigId");
        AiModelPO model = aiModelMapper.selectById(modelId);
        if (model == null || !user.getId().equals(model.getUserId())
                || Integer.valueOf(1).equals(model.getDeleted())) {
            throw new AppException(404, "未找到对应的 AI 模型");
        }
        if (!Integer.valueOf(1).equals(model.getEnabled())) {
            throw new AppException(400, "该 AI 模型已停用，请先启用后再试");
        }

        List<String> attachmentIds = request.attachments() == null
                ? List.of()
                : request.attachments().stream()
                .filter(java.util.Objects::nonNull)
                .map(AttachmentContext::attachmentId)
                .filter(value -> value != null && !value.trim().isEmpty())
                .map(String::trim)
                .distinct()
                .toList();
        List<AttachmentContext> inputAttachments = request.attachments() == null
                ? List.of()
                : request.attachments().stream()
                .filter(java.util.Objects::nonNull)
                .toList();
        attachmentService.validateOwnedAttachments(attachmentIds, projectId, sessionId);
        String provider = AiModelProviderSupport.normalizeProviderKeyForStorage(model.getProvider());
        String runtimeModelId = requireText(request.model().runtimeModelId(), "model.runtimeModelId");
        if (!attachmentIds.isEmpty() && !AiModelCapabilitySupport.supportsImageInput(provider, runtimeModelId)) {
            throw new AppException(400, "当前模型不支持图片输入，请选择支持图片输入的模型后重试");
        }
        ShortcutContext shortcut = validateShortcut(request.shortcut());
        Map<String, Object> canvasSnapshot = validateCanvasSnapshot(request.canvasSnapshot());
        Map<String, Object> selection = validateSelection(request.selection());
        Map<String, Object> clientContext = copyMap(request.clientContext());
        String requestFingerprint = createRequestFingerprint(
                schemaVersion,
                sessionId,
                projectId,
                modelConfigId,
                runtimeModelId,
                requirement,
                attachmentIds,
                inputAttachments,
                shortcut,
                canvasSnapshot,
                selection,
                clientContext
        );

        Object submitLock = submitLocks[Math.floorMod(requestId.hashCode(), submitLocks.length)];
        synchronized (submitLock) {
            long now = Instant.now().toEpochMilli();
            cleanupExpired(now);
            String userId = String.valueOf(user.getId());
            TaskState existing = tasks.get(requestId);
            if (existing != null) {
                existing.requireOwner(userId);
                existing.requireRequestFingerprint(requestFingerprint);
                return existing.snapshot();
            }
            if (tasks.size() >= MAX_TASKS_GLOBAL) {
                throw new AppException(503, "AI 任务存储已满，请稍后重试");
            }
            long userTaskCount = tasks.values().stream()
                    .filter(state -> state.userId.equals(userId))
                    .count();
            if (userTaskCount >= MAX_TASKS_PER_USER) {
                throw new AppException(429, "AI 任务数量已达上限，请稍后重试");
            }

            TaskState state = new TaskState(
                    "ai-driven-task-" + UUID.randomUUID(),
                    "ai-driven-run-" + UUID.randomUUID(),
                    requestId,
                    sessionId,
                    projectId,
                    userId,
                    modelConfigId,
                    runtimeModelId,
                    requirement,
                    attachmentIds,
                    inputAttachments,
                    shortcut,
                    canvasSnapshot,
                    selection,
                    clientContext,
                    requestFingerprint,
                    now
            );
            state.appendProgress(new ProgressEntry(now, "info", "queued", "任务已创建，开始分析需求", null));
            PersistentTaskState persisted = state.persistent();
            workspaceService.createWorkspace(
                    new AiDrivenWorkspaceService.WorkspaceManifest(
                            state.runId,
                            state.requestId,
                            state.userId,
                            state.projectId,
                            state.sessionId,
                            state.createdAt
                    ),
                    JSON.toJSONString(persisted)
            );
            try {
                attachmentService.bindAttachmentsToWorkspace(state.runId, attachmentIds);
                persistTaskState(state);
            } catch (RuntimeException e) {
                workspaceService.removeWorkspace(state.runId);
                throw e;
            }
            tasks.put(requestId, state);
            return state.snapshot();
        }
    }

    public TaskSnapshot progress(ProgressRequest request) {
        requireRequest(request);
        String userId = currentUserId();
        TaskState state = requireTask(request.requestId(), userId);
        state.requireWorkflowWorker(request.workerId(), Instant.now().toEpochMilli());
        state.appendProgress(new ProgressEntry(
                Instant.now().toEpochMilli(),
                normalizeLevel(request.level()),
                requireText(request.phase(), "phase"),
                requireText(request.message(), "message"),
                copyMap(request.details())
        ));
        return persistAndSnapshot(state);
    }

    public TaskSnapshot diagnose(DiagnosticRequest request) {
        requireRequest(request);
        String userId = currentUserId();
        TaskState state = requireTask(request.requestId(), userId);
        state.requireWorkflowWorker(request.workerId(), Instant.now().toEpochMilli());
        state.appendDiagnostic(new DiagnosticEntry(
                Instant.now().toEpochMilli(),
                requireText(request.phase(), "phase"),
                requireText(request.code(), "code"),
                requireText(request.message(), "message"),
                copyMap(request.details())
        ));
        return persistAndSnapshot(state);
    }

    public TaskSnapshot complete(TaskCompleteRequest request) {
        requireRequest(request);
        String userId = currentUserId();
        TaskState state = requireTask(request.requestId(), userId);
        String status = normalizeFinalStatus(request.status());
        state.complete(
                status,
                copyMap(request.finalSnapshot()),
                request.workerId(),
                Instant.now().toEpochMilli()
        );
        return persistAndSnapshot(state);
    }

    public TaskSnapshot cancel(TaskCancelRequest request) {
        requireRequest(request);
        String userId = currentUserId();
        TaskState state = requireTask(request.requestId(), userId);
        state.cancel("任务已取消");
        return persistAndSnapshot(state);
    }

    public TaskSnapshot heartbeat(TaskHeartbeatRequest request) {
        requireRequest(request);
        TaskState state = requireTask(request.requestId(), currentUserId());
        state.heartbeat(Instant.now().toEpochMilli(), request.workerId());
        return persistAndSnapshot(state);
    }

    public TaskSnapshot claimWorker(TaskWorkerClaimRequest request) {
        requireRequest(request);
        TaskState state = requireTask(request.requestId(), currentUserId());
        state.claimWorker(
                requireText(request.workerId(), "workerId"),
                Instant.now().toEpochMilli(),
                WORKER_LEASE_MS
        );
        return persistAndSnapshot(state);
    }

    public TaskSnapshot checkpoint(TaskCheckpointRequest request) {
        requireRequest(request);
        TaskState state = requireTask(request.requestId(), currentUserId());
        state.writeCheckpoint(
                requireText(request.workerId(), "workerId"),
                requireText(request.nodeId(), "nodeId"),
                copyMap(request.payload()),
                Instant.now().toEpochMilli(),
                WORKER_LEASE_MS
        );
        return persistAndSnapshot(state);
    }

    public TaskSnapshot releaseWorker(TaskWorkerReleaseRequest request) {
        requireRequest(request);
        TaskState state = requireTask(request.requestId(), currentUserId());
        state.releaseWorker(requireText(request.workerId(), "workerId"));
        return persistAndSnapshot(state);
    }

    public TaskSnapshot decideDraft(TaskDraftDecisionRequest request) {
        requireRequest(request);
        TaskState state = requireTask(request.requestId(), currentUserId());
        state.recordDraftDecision(
                requireText(request.sourceId(), "sourceId"),
                normalizeDraftDecision(request.decision())
        );
        return persistAndSnapshot(state);
    }

    public TaskSnapshot registerAttachments(TaskAttachmentRegisterRequest request) {
        requireRequest(request);
        TaskState state = requireTask(request.requestId(), currentUserId());
        state.requireRunning();
        state.requireWorkflowWorker(request.workerId(), Instant.now().toEpochMilli());
        List<String> attachmentIds = request.attachmentIds() == null
                ? List.of()
                : request.attachmentIds().stream()
                .map(value -> requireText(value, "attachmentId"))
                .distinct()
                .toList();
        if (attachmentIds.isEmpty()) {
            throw new AppException(400, "请求参数错误：attachmentIds 不能为空");
        }
        attachmentService.validateOwnedAttachments(
                attachmentIds,
                state.projectId,
                state.sessionId
        );
        attachmentService.bindAttachmentsToWorkspace(state.runId, attachmentIds);
        state.addAttachments(attachmentIds);
        return persistAndSnapshot(state);
    }

    public TaskSnapshot snapshot(String requestId) {
        return requireTask(requestId, currentUserId()).snapshot();
    }

    public TaskSnapshot latest(String projectId, String sessionId) {
        String normalizedProjectId = requireText(projectId, "projectId");
        String normalizedSessionId = requireText(sessionId, "sessionId");
        String userId = currentUserId();
        long now = Instant.now().toEpochMilli();
        cleanupExpired(now);
        return tasks.values().stream()
                .filter(state -> state.belongsTo(userId, normalizedProjectId, normalizedSessionId))
                .max(Comparator.comparingLong(state -> state.updatedAt))
                .map(TaskState::snapshot)
                .orElse(null);
    }

    public ModelInvocationContext validateModelInvocation(
            String requestId,
            String workerId,
            String modelConfigId,
            String runtimeModelId,
            List<String> attachmentIds
    ) {
        TaskState state = requireTask(requestId, currentUserId());
        state.requireRunning();
        state.requireWorker(requireText(workerId, "taskWorkerId"), Instant.now().toEpochMilli());
        state.requireModelContext(modelConfigId, runtimeModelId, attachmentIds);
        return new ModelInvocationContext(state.projectId, state.sessionId, state.runId);
    }

    public void registerModelCall(
            String requestId,
            String workerId,
            CompletableFuture<?> call
    ) {
        if (call == null) {
            throw new AppException(500, "模型调用注册失败");
        }
        TaskState state = requireTask(requestId, currentUserId());
        state.registerModelCall(
                call,
                requireText(workerId, "taskWorkerId"),
                Instant.now().toEpochMilli()
        );
    }

    public void unregisterModelCall(String requestId, CompletableFuture<?> call) {
        if (requestId == null || requestId.isBlank() || call == null) {
            return;
        }
        TaskState state = tasks.get(requestId.trim());
        if (state != null) {
            state.unregisterModelCall(call);
        }
    }

    public void requireRunning(String requestId) {
        requireTask(requestId, currentUserId()).requireRunning();
    }

    public void requireModelWorker(String requestId, String workerId) {
        TaskState state = requireTask(requestId, currentUserId());
        state.requireRunning();
        state.requireWorker(
                requireText(workerId, "taskWorkerId"),
                Instant.now().toEpochMilli()
        );
    }

    @Scheduled(fixedDelay = 15_000L)
    public void cleanupExpiredAndAbandonedTasks() {
        long now = Instant.now().toEpochMilli();
        tasks.values().forEach(state -> {
            if (state.isHeartbeatExpired(now)) {
                state.cancel("任务连接已中断，系统已停止执行");
                persistTaskState(state);
            }
        });
        cleanupExpired(now);
    }

    private TaskState requireTask(String requestId, String userId) {
        String normalizedId = requireText(requestId, "requestId");
        TaskState state = tasks.get(normalizedId);
        if (state == null) {
            throw new AppException(404, "AI 任务不存在或已结束");
        }
        state.requireOwner(userId);
        return state;
    }

    private String currentUserId() {
        return String.valueOf(requireCurrentUser().getId());
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null || user.getId() == null) {
            throw new AppException(401, "用户未登录");
        }
        return user;
    }

    private long parseId(String value, String field) {
        try {
            long id = Long.parseLong(value);
            if (id <= 0) {
                throw new NumberFormatException("not positive");
            }
            return id;
        } catch (NumberFormatException e) {
            throw new AppException(400, "请求参数错误：" + field + " 格式不正确");
        }
    }

    private String normalizeLevel(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        return switch (normalized) {
            case "success", "warning", "error" -> normalized;
            default -> "info";
        };
    }

    private String normalizeFinalStatus(String value) {
        String normalized = requireText(value, "status").toLowerCase();
        return switch (normalized) {
            case "completed", "failed", "cancelled" -> normalized;
            default -> throw new AppException(400, "任务最终状态只能是 completed、failed 或 cancelled");
        };
    }

    private String normalizeDraftDecision(String value) {
        String normalized = requireText(value, "decision").toLowerCase();
        return switch (normalized) {
            case "accepted", "discarded" -> normalized;
            default -> throw new AppException(400, "草稿操作只能是 accepted 或 discarded");
        };
    }

    private Map<String, Object> copyMap(Map<String, Object> source) {
        return source == null ? null : new LinkedHashMap<>(source);
    }

    static String createRequestFingerprint(
            String schemaVersion,
            String sessionId,
            String projectId,
            String modelConfigId,
            String runtimeModelId,
            String requirement,
            List<String> attachmentIds,
            List<AttachmentContext> inputAttachments,
            ShortcutContext shortcut,
            Map<String, Object> canvasSnapshot,
            Map<String, Object> selection,
            Map<String, Object> clientContext
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", schemaVersion);
        payload.put("sessionId", sessionId);
        payload.put("projectId", projectId);
        payload.put("modelConfigId", modelConfigId);
        payload.put("runtimeModelId", runtimeModelId);
        payload.put("requirement", requirement);
        payload.put("attachmentIds", attachmentIds);
        payload.put("inputAttachments", inputAttachments);
        payload.put("shortcut", shortcut);
        payload.put("canvasSnapshot", canvasSnapshot);
        payload.put("selection", selection);
        payload.put("clientContext", clientContext);
        return sha256CanonicalJson(payload);
    }

    public static String sha256CanonicalJson(Object value) {
        Object jsonCompatible = JSON.parse(JSON.toJSONString(value));
        byte[] canonicalPayload = JSON.toJSONString(
                canonicalizeFingerprintValue(jsonCompatible)
        ).getBytes(StandardCharsets.UTF_8);
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonicalPayload)
            );
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("当前运行环境不支持 SHA-256", e);
        }
    }

    private static Object canonicalizeFingerprintValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sorted = new TreeMap<>();
            map.forEach((key, item) -> sorted.put(
                    String.valueOf(key),
                    canonicalizeFingerprintValue(item)
            ));
            return sorted;
        }
        if (value instanceof List<?> list) {
            return list.stream()
                    .map(AiDrivenTaskService::canonicalizeFingerprintValue)
                    .toList();
        }
        return value;
    }

    private ShortcutContext validateShortcut(ShortcutContext shortcut) {
        if (shortcut == null) {
            return null;
        }
        String command = requireText(shortcut.command(), "shortcut.command");
        String taskKind = requireText(shortcut.taskKind(), "shortcut.taskKind");
        String rawText = requireText(shortcut.rawText(), "shortcut.rawText");
        boolean valid = ("style".equals(command) && "styleOptimization".equals(taskKind))
                || ("data".equals(command) && "dataOptimization".equals(taskKind));
        if (!valid) {
            throw new AppException(400, "请求参数错误：shortcut.command 和 shortcut.taskKind 不匹配");
        }
        return new ShortcutContext(command, taskKind, rawText);
    }

    private Map<String, Object> validateCanvasSnapshot(Map<String, Object> source) {
        Map<String, Object> snapshot = copyMap(source);
        if (snapshot == null) {
            throw new AppException(400, "请求参数错误：canvasSnapshot 不能为空");
        }
        if (!(snapshot.get("width") instanceof Number width)
                || !(snapshot.get("height") instanceof Number height)
                || !Double.isFinite(width.doubleValue())
                || !Double.isFinite(height.doubleValue())
                || width.doubleValue() <= 0
                || height.doubleValue() <= 0) {
            throw new AppException(400, "请求参数错误：canvasSnapshot 尺寸不合法");
        }
        return snapshot;
    }

    private Map<String, Object> validateSelection(Map<String, Object> source) {
        Map<String, Object> selection = copyMap(source);
        if (selection == null) {
            throw new AppException(400, "请求参数错误：selection 不能为空");
        }
        Object modeValue = selection.get("mode");
        String mode = modeValue instanceof String ? ((String) modeValue).trim() : "";
        if (!List.of("none", "single", "multiple").contains(mode)) {
            throw new AppException(400, "请求参数错误：selection.mode 不合法");
        }
        if (!(selection.get("targetIds") instanceof List<?>)
                || !(selection.get("components") instanceof List<?>)) {
            throw new AppException(400, "请求参数错误：selection 上下文不完整");
        }
        return selection;
    }

    private String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new AppException(400, "请求参数错误：" + field + " 不能为空");
        }
        return value.trim();
    }

    private void cleanupExpired(long now) {
        List<TaskState> expired = tasks.values().stream()
                .filter(state -> state.updatedAt + TASK_TTL_MS <= now)
                .toList();
        for (TaskState state : expired) {
            if (tasks.remove(state.requestId, state)) {
                try {
                    workspaceService.removeWorkspace(state.runId);
                } catch (AppException e) {
                    log.warn("清理过期 AI 任务工作区失败: {}", state.runId);
                }
            }
        }
    }

    private TaskSnapshot persistAndSnapshot(TaskState state) {
        synchronized (state) {
            persistTaskState(state);
            return state.snapshot();
        }
    }

    private void persistTaskState(TaskState state) {
        synchronized (state) {
            PersistentTaskState persisted = state.persistent();
            workspaceService.persistTask(
                    state.runId,
                    JSON.toJSONString(persisted),
                    JSON.toJSONString(persisted.diagnostics()),
                    state.isFinal() ? JSON.toJSONString(state.snapshot()) : null
            );
        }
    }

    private void requireRequest(Object request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
    }

    public record ModelSelection(String modelConfigId, String runtimeModelId, String provider) {
    }

    public record AttachmentContext(
            String role,
            String attachmentId,
            String uploadRequestId,
            String originalName,
            String mimeType,
            String sha256,
            Integer width,
            Integer height
    ) {
    }

    public record ShortcutContext(String command, String taskKind, String rawText) {
    }

    public record TaskSubmitRequest(
            String schemaVersion,
            String requestId,
            String sessionId,
            String projectId,
            ModelSelection model,
            String requirement,
            ShortcutContext shortcut,
            List<AttachmentContext> attachments,
            Map<String, Object> canvasSnapshot,
            Map<String, Object> selection,
            Map<String, Object> clientContext
    ) {
    }

    public record ProgressRequest(
            String requestId,
            String workerId,
            String level,
            String phase,
            String message,
            Map<String, Object> details
    ) {
    }

    public record DiagnosticRequest(
            String requestId,
            String workerId,
            String phase,
            String code,
            String message,
            Map<String, Object> details
    ) {
    }

    public record TaskCompleteRequest(
            String requestId,
            String workerId,
            String status,
            Map<String, Object> finalSnapshot
    ) {
    }

    public record TaskCancelRequest(String requestId) {
    }

    public record TaskHeartbeatRequest(String requestId, String workerId) {
    }

    public record TaskWorkerClaimRequest(String requestId, String workerId) {
    }

    public record TaskCheckpointRequest(
            String requestId,
            String workerId,
            String nodeId,
            Map<String, Object> payload
    ) {
    }

    public record TaskWorkerReleaseRequest(String requestId, String workerId) {
    }

    public record TaskDraftDecisionRequest(
            String requestId,
            String sourceId,
            String decision
    ) {
    }

    public record TaskAttachmentRegisterRequest(
            String requestId,
            String workerId,
            List<String> attachmentIds
    ) {
    }

    public record ModelInvocationContext(String projectId, String sessionId, String runId) {
    }

    public record ProgressEntry(
            long time,
            String level,
            String phase,
            String message,
            Map<String, Object> details
    ) {
    }

    public record DiagnosticEntry(
            long time,
            String phase,
            String code,
            String message,
            Map<String, Object> details
    ) {
    }

    public record TaskSnapshot(
            String taskId,
            String runId,
            String requestId,
            String sessionId,
            String projectId,
            String status,
            long createdAt,
            long updatedAt,
            Map<String, Object> workflowState,
            List<ProgressEntry> progress,
            List<DiagnosticEntry> diagnostics,
            Map<String, Object> finalSnapshot
    ) {
    }

    record PersistentTaskState(
            int formatVersion,
            String taskId,
            String runId,
            String requestId,
            String sessionId,
            String projectId,
            String userId,
            String modelConfigId,
            String runtimeModelId,
            String requirement,
            String requestFingerprint,
            List<String> attachmentIds,
            List<AttachmentContext> inputAttachments,
            ShortcutContext shortcut,
            Map<String, Object> canvasSnapshot,
            Map<String, Object> selection,
            Map<String, Object> clientContext,
            long createdAt,
            List<ProgressEntry> progress,
            List<DiagnosticEntry> diagnostics,
            Map<String, Map<String, Object>> checkpoints,
            Map<String, String> draftDecisions,
            String status,
            String currentNodeId,
            String workerId,
            long workerLeaseUntil,
            int workerGeneration,
            long updatedAt,
            long lastHeartbeatAt,
            Map<String, Object> finalSnapshot
    ) {
    }

    static final class TaskState {
        private final String taskId;
        private final String runId;
        private final String requestId;
        private final String sessionId;
        private final String projectId;
        private final String userId;
        private final String modelConfigId;
        private final String runtimeModelId;
        private final String requirement;
        private final String requestFingerprint;
        private final List<String> attachmentIds;
        private final List<AttachmentContext> inputAttachments;
        private final ShortcutContext shortcut;
        private final Map<String, Object> canvasSnapshot;
        private final Map<String, Object> selection;
        private final Map<String, Object> clientContext;
        private final long createdAt;
        private final List<ProgressEntry> progress = new ArrayList<>();
        private final List<DiagnosticEntry> diagnostics = new ArrayList<>();
        private final List<CompletableFuture<?>> activeModelCalls = new ArrayList<>();
        private final Map<String, Map<String, Object>> checkpoints = new LinkedHashMap<>();
        private final Map<String, Integer> checkpointJsonSizes = new LinkedHashMap<>();
        private final Map<String, String> draftDecisions = new LinkedHashMap<>();
        private int checkpointTotalJsonChars;
        private String status = "running";
        private String currentNodeId;
        private String workerId;
        private long workerLeaseUntil;
        private int workerGeneration;
        private long updatedAt;
        private long lastHeartbeatAt;
        private Map<String, Object> finalSnapshot;

        TaskState(
                String taskId,
                String runId,
                String requestId,
                String sessionId,
                String projectId,
                String userId,
                String modelConfigId,
                String runtimeModelId,
                String requirement,
                List<String> attachmentIds,
                List<AttachmentContext> inputAttachments,
                ShortcutContext shortcut,
                Map<String, Object> canvasSnapshot,
                Map<String, Object> selection,
                Map<String, Object> clientContext,
                String requestFingerprint,
                long createdAt
        ) {
            this.taskId = taskId;
            this.runId = runId;
            this.requestId = requestId;
            this.sessionId = sessionId;
            this.projectId = projectId;
            this.userId = userId;
            this.modelConfigId = modelConfigId;
            this.runtimeModelId = runtimeModelId;
            this.requirement = requirement;
            this.requestFingerprint = requestFingerprint;
            this.attachmentIds = new ArrayList<>(attachmentIds);
            this.inputAttachments = List.copyOf(inputAttachments);
            this.shortcut = shortcut;
            this.canvasSnapshot = canvasSnapshot;
            this.selection = selection;
            this.clientContext = clientContext;
            this.createdAt = createdAt;
            this.updatedAt = createdAt;
            this.lastHeartbeatAt = createdAt;
        }

        static TaskState restore(PersistentTaskState persisted) {
            if (persisted.taskId() == null
                    || persisted.runId() == null
                    || persisted.requestId() == null
                    || persisted.sessionId() == null
                    || persisted.projectId() == null
                    || persisted.userId() == null
                    || persisted.modelConfigId() == null
                    || persisted.runtimeModelId() == null
                    || persisted.requirement() == null
                    || persisted.createdAt() <= 0
                    || persisted.updatedAt() < persisted.createdAt()) {
                throw new IllegalArgumentException("AI 任务持久化状态不完整");
            }
            if (!List.of("running", "completed", "failed", "cancelled").contains(persisted.status())) {
                throw new IllegalArgumentException("AI 任务持久化状态不合法");
            }
            TaskState state = new TaskState(
                    persisted.taskId(),
                    persisted.runId(),
                    persisted.requestId(),
                    persisted.sessionId(),
                    persisted.projectId(),
                    persisted.userId(),
                    persisted.modelConfigId(),
                    persisted.runtimeModelId(),
                    persisted.requirement(),
                    persisted.attachmentIds() == null ? List.of() : persisted.attachmentIds(),
                    persisted.inputAttachments() == null ? List.of() : persisted.inputAttachments(),
                    persisted.shortcut(),
                    persisted.canvasSnapshot() == null
                            ? null
                            : new LinkedHashMap<>(persisted.canvasSnapshot()),
                    persisted.selection() == null
                            ? null
                            : new LinkedHashMap<>(persisted.selection()),
                    persisted.clientContext() == null
                            ? null
                            : new LinkedHashMap<>(persisted.clientContext()),
                    persisted.requestFingerprint() == null || persisted.requestFingerprint().isBlank()
                            ? createRequestFingerprint(
                            "ai-driven-task/v1",
                            persisted.sessionId(),
                            persisted.projectId(),
                            persisted.modelConfigId(),
                            persisted.runtimeModelId(),
                            persisted.requirement(),
                            persisted.attachmentIds() == null ? List.of() : persisted.attachmentIds(),
                            persisted.inputAttachments() == null ? List.of() : persisted.inputAttachments(),
                            persisted.shortcut(),
                            persisted.canvasSnapshot(),
                            persisted.selection(),
                            persisted.clientContext()
                    )
                            : persisted.requestFingerprint(),
                    persisted.createdAt()
            );
            state.progress.addAll(persisted.progress() == null ? List.of() : persisted.progress());
            state.diagnostics.addAll(
                    persisted.diagnostics() == null ? List.of() : persisted.diagnostics()
            );
            if (persisted.checkpoints() != null) {
                for (Map.Entry<String, Map<String, Object>> entry
                        : persisted.checkpoints().entrySet()) {
                    Map<String, Object> checkpoint = new LinkedHashMap<>(entry.getValue());
                    int jsonChars = JSON.toJSONString(checkpoint).length();
                    state.checkpoints.put(entry.getKey(), checkpoint);
                    state.checkpointJsonSizes.put(entry.getKey(), jsonChars);
                    state.checkpointTotalJsonChars += jsonChars;
                }
            }
            if (state.checkpoints.size() > MAX_CHECKPOINTS
                    || state.checkpointTotalJsonChars > MAX_CHECKPOINT_TOTAL_JSON_CHARS) {
                throw new IllegalArgumentException("AI 任务持久化检查点超过上限");
            }
            if (persisted.draftDecisions() != null) {
                state.draftDecisions.putAll(persisted.draftDecisions());
            }
            state.status = persisted.status();
            state.currentNodeId = persisted.currentNodeId();
            state.workerId = null;
            state.workerLeaseUntil = 0L;
            state.workerGeneration = persisted.workerGeneration() + 1;
            state.updatedAt = persisted.updatedAt();
            state.lastHeartbeatAt = persisted.lastHeartbeatAt();
            state.finalSnapshot = persisted.finalSnapshot() == null
                    ? null
                    : new LinkedHashMap<>(persisted.finalSnapshot());
            return state;
        }

        synchronized PersistentTaskState persistent() {
            Map<String, Map<String, Object>> persistedCheckpoints = new LinkedHashMap<>();
            checkpoints.forEach((nodeId, payload) ->
                    persistedCheckpoints.put(nodeId, new LinkedHashMap<>(payload)));
            return new PersistentTaskState(
                    PERSISTENCE_FORMAT_VERSION,
                    taskId,
                    runId,
                    requestId,
                    sessionId,
                    projectId,
                    userId,
                    modelConfigId,
                    runtimeModelId,
                    requirement,
                    requestFingerprint,
                    List.copyOf(attachmentIds),
                    List.copyOf(inputAttachments),
                    shortcut,
                    canvasSnapshot == null ? null : new LinkedHashMap<>(canvasSnapshot),
                    selection == null ? null : new LinkedHashMap<>(selection),
                    clientContext == null ? null : new LinkedHashMap<>(clientContext),
                    createdAt,
                    List.copyOf(progress),
                    List.copyOf(diagnostics),
                    persistedCheckpoints,
                    new LinkedHashMap<>(draftDecisions),
                    status,
                    currentNodeId,
                    workerId,
                    workerLeaseUntil,
                    workerGeneration,
                    updatedAt,
                    lastHeartbeatAt,
                    finalSnapshot == null ? null : new LinkedHashMap<>(finalSnapshot)
            );
        }

        private synchronized void appendProgress(ProgressEntry entry) {
            if (isFinal()) {
                return;
            }
            if (progress.size() >= MAX_PROGRESS_ENTRIES) {
                progress.remove(0);
            }
            progress.add(entry);
            updatedAt = entry.time();
            lastHeartbeatAt = entry.time();
        }

        private synchronized void appendDiagnostic(DiagnosticEntry entry) {
            if (diagnostics.size() >= MAX_DIAGNOSTIC_ENTRIES) {
                diagnostics.remove(0);
            }
            diagnostics.add(entry);
            updatedAt = entry.time();
        }

        synchronized void complete(
                String status,
                Map<String, Object> snapshot,
                String requestedWorkerId,
                long now
        ) {
            if (isFinal()) {
                return;
            }
            requireWorkflowWorker(requestedWorkerId, now);
            this.status = status;
            this.finalSnapshot = snapshot;
            this.updatedAt = now;
        }

        synchronized void cancel(String message) {
            if (isFinal()) {
                return;
            }
            long now = Instant.now().toEpochMilli();
            progress.add(new ProgressEntry(now, "warning", "cancelled", message, null));
            activeModelCalls.forEach(call -> call.cancel(true));
            activeModelCalls.clear();
            status = "cancelled";
            finalSnapshot = Map.of("cancelledAt", now, "message", message);
            updatedAt = now;
            lastHeartbeatAt = now;
        }

        private synchronized void heartbeat(long time, String requestedWorkerId) {
            if (!isFinal()) {
                if (requestedWorkerId != null && !requestedWorkerId.isBlank()) {
                    requireWorker(requestedWorkerId, time);
                    workerLeaseUntil = time + WORKER_LEASE_MS;
                }
                lastHeartbeatAt = time;
                updatedAt = time;
            }
        }

        synchronized boolean isHeartbeatExpired(long now) {
            return !isFinal()
                    && !hasRecoverableWorkflow()
                    && lastHeartbeatAt + TASK_HEARTBEAT_TIMEOUT_MS <= now;
        }

        synchronized void claimWorker(String requestedWorkerId, long now, long leaseMs) {
            requireRunning();
            if (workerId != null
                    && !workerId.equals(requestedWorkerId)
                    && workerLeaseUntil > now) {
                throw new AppException(409, "AI 任务正在由其他页面执行");
            }
            if (!requestedWorkerId.equals(workerId)) {
                activeModelCalls.forEach(call -> call.cancel(true));
                activeModelCalls.clear();
                workerGeneration += 1;
            }
            workerId = requestedWorkerId;
            workerLeaseUntil = now + leaseMs;
            lastHeartbeatAt = now;
            updatedAt = now;
        }

        synchronized void writeCheckpoint(
                String requestedWorkerId,
                String nodeId,
                Map<String, Object> payload,
                long now,
                long leaseMs
        ) {
            requireRunning();
            requireWorker(requestedWorkerId, now);
            if (payload == null) {
                throw new AppException(400, "请求参数错误：checkpoint payload 不能为空");
            }
            if (nodeId.length() > 200) {
                throw new AppException(400, "请求参数错误：checkpoint nodeId 过长");
            }
            if (!checkpoints.containsKey(nodeId) && checkpoints.size() >= MAX_CHECKPOINTS) {
                throw new AppException(400, "AI 任务检查点数量超过上限");
            }
            int payloadJsonChars = JSON.toJSONString(payload).length();
            if (payloadJsonChars > MAX_CHECKPOINT_JSON_CHARS) {
                throw new AppException(400, "AI 任务单个检查点内容超过上限");
            }
            int previousJsonChars = checkpointJsonSizes.getOrDefault(nodeId, 0);
            int nextTotalJsonChars = checkpointTotalJsonChars - previousJsonChars + payloadJsonChars;
            if (nextTotalJsonChars > MAX_CHECKPOINT_TOTAL_JSON_CHARS) {
                throw new AppException(400, "AI 任务检查点总内容超过上限");
            }
            checkpoints.put(nodeId, new LinkedHashMap<>(payload));
            checkpointJsonSizes.put(nodeId, payloadJsonChars);
            checkpointTotalJsonChars = nextTotalJsonChars;
            currentNodeId = nodeId;
            workerLeaseUntil = now + leaseMs;
            lastHeartbeatAt = now;
            updatedAt = now;
        }

        synchronized void releaseWorker(String requestedWorkerId) {
            if (workerId != null && !workerId.equals(requestedWorkerId)) {
                throw new AppException(409, "AI 任务工作者不匹配");
            }
            workerId = null;
            workerLeaseUntil = 0L;
            updatedAt = Instant.now().toEpochMilli();
        }

        synchronized void recordDraftDecision(String sourceId, String decision) {
            if (!checkpoints.containsKey("region-draft:" + sourceId)) {
                throw new AppException(404, "未找到对应的 AI 草稿批次");
            }
            draftDecisions.put(sourceId, decision);
            updatedAt = Instant.now().toEpochMilli();
        }

        private void requireWorker(String requestedWorkerId, long now) {
            if (workerId == null
                    || !workerId.equals(requestedWorkerId)
                    || workerLeaseUntil <= now) {
                throw new AppException(409, "AI 任务工作者租约已失效，请重新接管任务");
            }
        }

        private void requireWorkflowWorker(String requestedWorkerId, long now) {
            if (!hasRecoverableWorkflow()) {
                return;
            }
            if (requestedWorkerId == null || requestedWorkerId.isBlank()) {
                throw new AppException(409, "AI 任务工作者不能为空");
            }
            requireWorker(requestedWorkerId, now);
        }

        private boolean hasRecoverableWorkflow() {
            Object workflowKind = clientContext == null ? null : clientContext.get("workflowKind");
            return "reference-image".equals(workflowKind) || "generic".equals(workflowKind);
        }

        synchronized void registerModelCall(
                CompletableFuture<?> call,
                String requestedWorkerId,
                long now
        ) {
            requireRunning();
            requireWorker(requestedWorkerId, now);
            activeModelCalls.add(call);
        }

        private synchronized void unregisterModelCall(CompletableFuture<?> call) {
            activeModelCalls.remove(call);
        }

        private synchronized void requireRunning() {
            if (isFinal()) {
                throw new AppException(409, "AI 任务已结束或已取消");
            }
        }

        private synchronized void requireModelContext(
                String requestedModelConfigId,
                String requestedRuntimeModelId,
                List<String> requestedAttachmentIds
        ) {
            if (!modelConfigId.equals(requestedModelConfigId)) {
                throw new AppException(400, "模型调用与 AI 任务选择的模型不一致");
            }
            if (!runtimeModelId.equals(requestedRuntimeModelId)) {
                throw new AppException(400, "模型调用与 AI 任务选择的模型型号不一致");
            }
            List<String> normalizedIds = requestedAttachmentIds == null
                    ? List.of()
                    : requestedAttachmentIds.stream()
                    .map(value -> value == null ? "" : value.trim())
                    .filter(value -> !value.isEmpty())
                    .distinct()
                    .toList();
            if (!attachmentIds.containsAll(normalizedIds)) {
                throw new AppException(400, "模型调用包含未登记到 AI 任务的附件");
            }
        }

        private synchronized void addAttachments(List<String> newAttachmentIds) {
            requireRunning();
            for (String attachmentId : newAttachmentIds) {
                if (!attachmentIds.contains(attachmentId)) {
                    attachmentIds.add(attachmentId);
                }
            }
            updatedAt = Instant.now().toEpochMilli();
        }

        synchronized TaskSnapshot snapshot() {
            Map<String, Object> workflowState = new LinkedHashMap<>();
            workflowState.put("modelConfigId", modelConfigId);
            workflowState.put("runtimeModelId", runtimeModelId);
            workflowState.put("requirement", requirement);
            workflowState.put("attachmentIds", List.copyOf(attachmentIds));
            workflowState.put("inputAttachments", inputAttachments);
            workflowState.put("shortcut", shortcut);
            workflowState.put("canvasSnapshot", canvasSnapshot);
            workflowState.put("selection", selection);
            workflowState.put("clientContext", clientContext);
            workflowState.put("currentNodeId", currentNodeId);
            workflowState.put("checkpoints", new LinkedHashMap<>(checkpoints));
            workflowState.put("draftDecisions", new LinkedHashMap<>(draftDecisions));
            Map<String, Object> workerLease = new LinkedHashMap<>();
            workerLease.put("workerId", workerId);
            workerLease.put("leaseUntil", workerLeaseUntil);
            workerLease.put("generation", workerGeneration);
            workflowState.put("workerLease", workerLease);
            workflowState.put("progressCount", progress.size());
            workflowState.put("diagnosticCount", diagnostics.size());
            return new TaskSnapshot(
                    taskId,
                    runId,
                    requestId,
                    sessionId,
                    projectId,
                    status,
                    createdAt,
                    updatedAt,
                    workflowState,
                    List.copyOf(progress),
                    List.copyOf(diagnostics),
                    finalSnapshot == null ? null : new LinkedHashMap<>(finalSnapshot)
            );
        }

        private void requireOwner(String ownerId) {
            if (!userId.equals(ownerId)) {
                throw new AppException(403, "无权访问该 AI 任务");
            }
        }

        synchronized void requireRequestFingerprint(String expectedFingerprint) {
            if (!requestFingerprint.equals(expectedFingerprint)) {
                throw new AppException(409, "requestId 已被用于其他 AI 任务请求，请使用新的 requestId");
            }
        }

        private boolean belongsTo(String ownerId, String expectedProjectId, String expectedSessionId) {
            return userId.equals(ownerId)
                    && projectId.equals(expectedProjectId)
                    && sessionId.equals(expectedSessionId);
        }

        private boolean isFinal() {
            return "completed".equals(status) || "failed".equals(status) || "cancelled".equals(status);
        }
    }
}
