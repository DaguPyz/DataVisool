/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.JSONWriter;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.global.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * AI 任务工作区文件存储。
 *
 * 每个 runId 使用独立目录，输入、运行中产物、诊断和终态分别保存。
 */
@Service
public class AiDrivenWorkspaceService {
    private static final Logger log = LoggerFactory.getLogger(AiDrivenWorkspaceService.class);
    private static final int FORMAT_VERSION = 1;
    private static final long MAX_TASK_STATE_BYTES = 32L * 1024L * 1024L;
    private static final long MAX_ATTACHMENT_METADATA_BYTES = 64L * 1024L;
    private static final long MAX_ATTACHMENT_CONTENT_BYTES = 10L * 1024L * 1024L;
    private static final Pattern SAFE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,159}");
    private static final String MANIFEST_FILE = "manifest.json";
    private static final String TASK_INPUT_FILE = "task.json";
    private static final String TASK_STATE_FILE = "task-state.json";
    private static final String DIAGNOSTICS_FILE = "events.json";
    private static final String FINAL_FILE = "result.json";
    private static final String ATTACHMENT_METADATA_FILE = "metadata.json";
    private static final String ATTACHMENT_CONTENT_FILE = "content.bin";
    private static final String MODEL_ARTIFACTS_DIRECTORY = "model";
    private static final String ARTIFACT_METADATA_FILE = "metadata.json";
    private static final long MAX_ARTIFACT_CONTENT_BYTES = 32L * 1024L * 1024L;
    private static final ObjectMapper STRICT_JSON_MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private final Path storageRoot;
    private final Path workspacesRoot;
    private final Path attachmentStagingRoot;
    private final Map<String, Object> artifactLocks = new ConcurrentHashMap<>();

    @Autowired
    public AiDrivenWorkspaceService(
            @Value("${datavisool.ai.storage-path:}") String configuredStoragePath,
            @Value("${datavisool.resource-path.root:}") String resourceRoot
    ) {
        String basePath = configuredStoragePath == null ? "" : configuredStoragePath.trim();
        if (basePath.isEmpty()) {
            String normalizedResourceRoot = resourceRoot == null ? "" : resourceRoot.trim();
            Path root = normalizedResourceRoot.isEmpty()
                    ? Path.of(System.getProperty("user.dir"))
                    : Path.of(normalizedResourceRoot);
            this.storageRoot = root.resolve("ai-driven").toAbsolutePath().normalize();
        } else {
            this.storageRoot = Path.of(basePath).toAbsolutePath().normalize();
        }
        this.workspacesRoot = this.storageRoot.resolve("workspaces");
        this.attachmentStagingRoot = this.storageRoot.resolve("attachment-staging");
    }

    AiDrivenWorkspaceService(Path storageRoot) {
        this.storageRoot = storageRoot.toAbsolutePath().normalize();
        this.workspacesRoot = this.storageRoot.resolve("workspaces");
        this.attachmentStagingRoot = this.storageRoot.resolve("attachment-staging");
    }

    public void createWorkspace(
            WorkspaceManifest manifest,
            String inputJson
    ) {
        String runId = requireSafeName(manifest.runId(), "runId");
        Path workspace = workspacePath(runId);
        if (Files.exists(workspace)) {
            throw new AppException(409, "AI 任务工作区已存在");
        }
        Path temporary = workspacesRoot.resolve("." + runId + ".creating-" + UUID.randomUUID());
        try {
            Files.createDirectories(workspacesRoot);
            Files.createDirectories(temporary.resolve("input").resolve("attachments"));
            Files.createDirectories(temporary.resolve("artifacts"));
            Files.createDirectories(temporary.resolve("diagnostics"));
            Files.createDirectories(temporary.resolve("final"));
            writeJsonAtomically(temporary.resolve(MANIFEST_FILE), JSON.toJSONString(
                    manifest,
                    JSONWriter.Feature.PrettyFormat
            ));
            writeJsonAtomically(temporary.resolve("input").resolve(TASK_INPUT_FILE), inputJson);
            moveAtomically(temporary, workspace);
        } catch (IOException e) {
            deleteQuietly(temporary);
            throw storageFailure("创建 AI 任务工作区失败", e);
        }
    }

    public void persistTask(
            String runId,
            String taskStateJson,
            String diagnosticsJson,
            String finalResultJson
    ) {
        Path workspace = requireWorkspace(runId);
        try {
            writeJsonAtomically(workspace.resolve("artifacts").resolve(TASK_STATE_FILE), taskStateJson);
            writeJsonAtomically(workspace.resolve("diagnostics").resolve(DIAGNOSTICS_FILE), diagnosticsJson);
            if (finalResultJson != null) {
                writeJsonAtomically(workspace.resolve("final").resolve(FINAL_FILE), finalResultJson);
            }
        } catch (IOException e) {
            throw storageFailure("保存 AI 任务工作区失败", e);
        }
    }

    public List<WorkspaceStateFile> loadTaskStates() {
        if (!Files.isDirectory(workspacesRoot)) {
            return List.of();
        }
        List<WorkspaceStateFile> result = new ArrayList<>();
        try (Stream<Path> entries = Files.list(workspacesRoot)) {
            entries.filter(path -> Files.isDirectory(path) && !Files.isSymbolicLink(path))
                    .forEach(path -> {
                        String runId = path.getFileName().toString();
                        if (!SAFE_NAME.matcher(runId).matches()) {
                            return;
                        }
                        Path stateFile = path.resolve("artifacts").resolve(TASK_STATE_FILE);
                        if (!Files.isRegularFile(stateFile) || Files.isSymbolicLink(stateFile)) {
                            return;
                        }
                        try {
                            if (Files.size(stateFile) > MAX_TASK_STATE_BYTES) {
                                log.warn("AI 任务工作区状态文件过大，已跳过: {}", runId);
                                return;
                            }
                            result.add(new WorkspaceStateFile(
                                    runId,
                                    Files.readString(stateFile, StandardCharsets.UTF_8)
                            ));
                        } catch (IOException e) {
                            log.warn("读取 AI 任务工作区失败，已跳过: {}", runId, e);
                        }
                    });
        } catch (IOException e) {
            throw storageFailure("读取 AI 任务工作区列表失败", e);
        }
        return result;
    }

    public ArtifactSnapshot createArtifact(
            String runId,
            String artifactId,
            String format,
            String content
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        String normalizedFormat = normalizeArtifactFormat(format);
        String normalizedContent = requireArtifactContent(content);
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            Path directory = artifactDirectory(safeRunId, safeArtifactId);
            if (Files.exists(directory.resolve(ARTIFACT_METADATA_FILE))) {
                throw new AppException(409, "AI 任务产物已存在");
            }
            return writeArtifactRevision(
                    directory,
                    new ArtifactSnapshot(
                            safeArtifactId,
                            normalizedFormat,
                            1L,
                            "draft",
                            normalizedContent,
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public ArtifactSnapshot saveArtifactRevision(
            String runId,
            String artifactId,
            String format,
            String content,
            String status
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        String normalizedFormat = normalizeArtifactFormat(format);
        String normalizedContent = requireArtifactContent(content);
        String normalizedStatus = normalizeArtifactStatus(status);
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot current = readArtifactOrNull(safeRunId, safeArtifactId);
            long revision = current == null ? 1L : current.revision() + 1L;
            return writeArtifactRevision(
                    artifactDirectory(safeRunId, safeArtifactId),
                    new ArtifactSnapshot(
                            safeArtifactId,
                            normalizedFormat,
                            revision,
                            normalizedStatus,
                            normalizedContent,
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public ArtifactSnapshot readArtifact(String runId, String artifactId) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot snapshot = readArtifactOrNull(safeRunId, safeArtifactId);
            if (snapshot == null) {
                throw new AppException(404, "AI 任务产物不存在");
            }
            return snapshot;
        }
    }

    public ArtifactSnapshot updateArtifactStatus(
            String runId,
            String artifactId,
            long baseRevision,
            String status
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        String normalizedStatus = normalizeArtifactStatus(status);
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot current = requireArtifactRevision(safeRunId, safeArtifactId, baseRevision);
            if (normalizedStatus.equals(current.status())) {
                return current;
            }
            return writeArtifactRevision(
                    artifactDirectory(safeRunId, safeArtifactId),
                    new ArtifactSnapshot(
                            safeArtifactId,
                            current.format(),
                            current.revision(),
                            normalizedStatus,
                            current.content(),
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public ArtifactSnapshot replaceArtifact(
            String runId,
            String artifactId,
            long baseRevision,
            String content
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        String normalizedContent = requireArtifactContent(content);
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot current = requireArtifactRevision(safeRunId, safeArtifactId, baseRevision);
            return writeArtifactRevision(
                    artifactDirectory(safeRunId, safeArtifactId),
                    new ArtifactSnapshot(
                            safeArtifactId,
                            current.format(),
                            current.revision() + 1L,
                            "draft",
                            normalizedContent,
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public ArtifactSnapshot applyJsonPatch(
            String runId,
            String artifactId,
            long baseRevision,
            List<JsonPatchOperation> operations
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        if (operations == null || operations.isEmpty()) {
            throw new AppException(400, "JSON Patch 操作不能为空");
        }
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot current = requireArtifactRevision(safeRunId, safeArtifactId, baseRevision);
            if (!"json".equals(current.format())) {
                throw new AppException(400, "当前产物不是 JSON 格式");
            }
            requireStrictJson(current.content());
            Object document;
            try {
                document = JSON.parse(current.content());
            } catch (RuntimeException e) {
                throw new AppException(409, "当前 JSON 产物语法无效，请使用文本补丁修复");
            }
            for (JsonPatchOperation operation : operations) {
                document = applyJsonPatchOperation(document, operation);
            }
            return writeArtifactRevision(
                    artifactDirectory(safeRunId, safeArtifactId),
                    new ArtifactSnapshot(
                            safeArtifactId,
                            current.format(),
                            current.revision() + 1L,
                            "draft",
                            JSON.toJSONString(document),
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public ArtifactSnapshot applyTextPatch(
            String runId,
            String artifactId,
            long baseRevision,
            int startLine,
            int endLine,
            String expectedText,
            String newText
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot current = requireArtifactRevision(safeRunId, safeArtifactId, baseRevision);
            if ("json".equals(current.format()) && isStrictJson(current.content())) {
                throw new AppException(400, "有效 JSON 产物必须使用 JSON Patch 修补");
            }
            String[] lines = current.content().split("\\n", -1);
            if (startLine < 1 || endLine < startLine || endLine > lines.length) {
                throw new AppException(400, "文本补丁行范围不合法");
            }
            String actual = String.join(
                    "\n",
                    java.util.Arrays.copyOfRange(lines, startLine - 1, endLine)
            );
            if (!actual.equals(expectedText == null ? "" : expectedText)) {
                throw new AppException(409, "文本补丁目标内容已变化");
            }
            List<String> nextLines = new ArrayList<>(List.of(lines));
            nextLines.subList(startLine - 1, endLine).clear();
            nextLines.addAll(
                    startLine - 1,
                    List.of((newText == null ? "" : newText).split("\\n", -1))
            );
            return writeArtifactRevision(
                    artifactDirectory(safeRunId, safeArtifactId),
                    new ArtifactSnapshot(
                            safeArtifactId,
                            current.format(),
                            current.revision() + 1L,
                            "draft",
                            String.join("\n", nextLines),
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public ArtifactValidation validateArtifact(
            String runId,
            String artifactId,
            long baseRevision
    ) {
        String safeRunId = requireSafeName(runId, "runId");
        String safeArtifactId = requireSafeName(artifactId, "artifactId");
        synchronized (artifactLock(safeRunId, safeArtifactId)) {
            ArtifactSnapshot current = requireArtifactRevision(safeRunId, safeArtifactId, baseRevision);
            List<String> issues = new ArrayList<>();
            if ("json".equals(current.format())) {
                try {
                    STRICT_JSON_MAPPER.readTree(current.content());
                } catch (JsonProcessingException e) {
                    issues.add("JSON 语法无效：" + e.getMessage());
                }
            }
            return new ArtifactValidation(
                    safeArtifactId,
                    current.revision(),
                    issues.isEmpty(),
                    List.copyOf(issues)
            );
        }
    }

    public void stageAttachment(String attachmentId, String metadataJson, byte[] content) {
        String safeAttachmentId = requireSafeName(attachmentId, "attachmentId");
        if (metadataJson == null
                || metadataJson.getBytes(StandardCharsets.UTF_8).length > MAX_ATTACHMENT_METADATA_BYTES
                || content == null
                || content.length > MAX_ATTACHMENT_CONTENT_BYTES) {
            throw new AppException(400, "AI 图片附件内容超过工作区限制");
        }
        Path target = attachmentStagingRoot.resolve(safeAttachmentId);
        Path temporary = attachmentStagingRoot.resolve(
                "." + safeAttachmentId + ".creating-" + UUID.randomUUID()
        );
        try {
            Files.createDirectories(attachmentStagingRoot);
            Files.createDirectories(temporary);
            writeJsonAtomically(temporary.resolve(ATTACHMENT_METADATA_FILE), metadataJson);
            Files.write(temporary.resolve(ATTACHMENT_CONTENT_FILE), content);
            moveAtomically(temporary, target);
        } catch (IOException e) {
            deleteQuietly(temporary);
            throw storageFailure("保存 AI 图片附件失败", e);
        }
    }

    public List<AttachmentFile> loadStagedAttachments() {
        if (!Files.isDirectory(attachmentStagingRoot)) {
            return List.of();
        }
        List<AttachmentFile> result = new ArrayList<>();
        try (Stream<Path> entries = Files.list(attachmentStagingRoot)) {
            entries.filter(path -> Files.isDirectory(path) && !Files.isSymbolicLink(path))
                    .forEach(path -> readAttachmentDirectory(path).ifPresent(result::add));
        } catch (IOException e) {
            throw storageFailure("读取 AI 图片附件列表失败", e);
        }
        return result;
    }

    public void bindAttachment(String runId, String attachmentId) {
        String safeAttachmentId = requireSafeName(attachmentId, "attachmentId");
        Path workspace = requireWorkspace(runId);
        Path source = attachmentStagingRoot.resolve(safeAttachmentId);
        if (!Files.isDirectory(source) || Files.isSymbolicLink(source)) {
            throw new AppException(404, "AI 图片附件不存在或已过期");
        }
        Path attachments = workspace.resolve("input").resolve("attachments");
        Path target = attachments.resolve(safeAttachmentId);
        if (Files.isDirectory(target) && !Files.isSymbolicLink(target)) {
            return;
        }
        Path temporary = attachments.resolve(
                "." + safeAttachmentId + ".creating-" + UUID.randomUUID()
        );
        try {
            Files.createDirectories(temporary);
            Files.copy(
                    source.resolve(ATTACHMENT_METADATA_FILE),
                    temporary.resolve(ATTACHMENT_METADATA_FILE)
            );
            Files.copy(
                    source.resolve(ATTACHMENT_CONTENT_FILE),
                    temporary.resolve(ATTACHMENT_CONTENT_FILE)
            );
            moveAtomically(temporary, target);
        } catch (IOException e) {
            deleteQuietly(temporary);
            throw storageFailure("登记 AI 任务附件失败", e);
        }
    }

    public AttachmentFile loadWorkspaceAttachment(String runId, String attachmentId) {
        Path directory = requireWorkspace(runId)
                .resolve("input")
                .resolve("attachments")
                .resolve(requireSafeName(attachmentId, "attachmentId"));
        return readAttachmentDirectory(directory).orElse(null);
    }

    public void deleteStagedAttachment(String attachmentId) {
        Path target = attachmentStagingRoot.resolve(requireSafeName(attachmentId, "attachmentId"));
        try {
            deleteDirectory(target);
        } catch (IOException e) {
            throw storageFailure("删除 AI 图片附件失败", e);
        }
    }

    public void removeWorkspace(String runId) {
        String safeRunId = requireSafeName(runId, "runId");
        Path workspace = workspacePath(safeRunId);
        try {
            deleteDirectory(workspace);
            artifactLocks.keySet().removeIf(key -> key.startsWith(safeRunId + ":"));
        } catch (IOException e) {
            throw storageFailure("清理 AI 任务工作区失败", e);
        }
    }

    Path storageRoot() {
        return storageRoot;
    }

    private java.util.Optional<AttachmentFile> readAttachmentDirectory(Path directory) {
        if (!Files.isDirectory(directory) || Files.isSymbolicLink(directory)) {
            return java.util.Optional.empty();
        }
        String attachmentId = directory.getFileName().toString();
        if (!SAFE_NAME.matcher(attachmentId).matches()) {
            return java.util.Optional.empty();
        }
        Path metadata = directory.resolve(ATTACHMENT_METADATA_FILE);
        Path content = directory.resolve(ATTACHMENT_CONTENT_FILE);
        if (!Files.isRegularFile(metadata)
                || Files.isSymbolicLink(metadata)
                || !Files.isRegularFile(content)
                || Files.isSymbolicLink(content)) {
            return java.util.Optional.empty();
        }
        try {
            if (Files.size(metadata) > MAX_ATTACHMENT_METADATA_BYTES
                    || Files.size(content) > MAX_ATTACHMENT_CONTENT_BYTES) {
                return java.util.Optional.empty();
            }
            return java.util.Optional.of(new AttachmentFile(
                    attachmentId,
                    Files.readString(metadata, StandardCharsets.UTF_8),
                    Files.readAllBytes(content)
            ));
        } catch (IOException e) {
            log.warn("读取 AI 图片附件失败，已跳过: {}", attachmentId, e);
            return java.util.Optional.empty();
        }
    }

    private Path requireWorkspace(String runId) {
        Path workspace = workspacePath(requireSafeName(runId, "runId"));
        if (!Files.isDirectory(workspace) || Files.isSymbolicLink(workspace)) {
            throw new AppException(404, "AI 任务工作区不存在");
        }
        return workspace;
    }

    private Object artifactLock(String runId, String artifactId) {
        return artifactLocks.computeIfAbsent(runId + ":" + artifactId, ignored -> new Object());
    }

    private Path artifactDirectory(String runId, String artifactId) {
        return requireWorkspace(runId)
                .resolve("artifacts")
                .resolve(MODEL_ARTIFACTS_DIRECTORY)
                .resolve(artifactId);
    }

    private ArtifactSnapshot readArtifactOrNull(String runId, String artifactId) {
        Path directory = artifactDirectory(runId, artifactId);
        Path metadataPath = directory.resolve(ARTIFACT_METADATA_FILE);
        if (!Files.isRegularFile(metadataPath) || Files.isSymbolicLink(metadataPath)) {
            return null;
        }
        try {
            StoredArtifactMetadata metadata = JSON.parseObject(
                    Files.readString(metadataPath, StandardCharsets.UTF_8),
                    StoredArtifactMetadata.class
            );
            if (metadata == null
                    || !artifactId.equals(metadata.artifactId())
                    || metadata.revision() <= 0) {
                throw new AppException(500, "AI 任务产物元数据损坏");
            }
            Path contentPath = directory.resolve(contentRevisionFile(metadata.revision()));
            if (!Files.isRegularFile(contentPath)
                    || Files.isSymbolicLink(contentPath)
                    || Files.size(contentPath) > MAX_ARTIFACT_CONTENT_BYTES) {
                throw new AppException(500, "AI 任务产物内容损坏");
            }
            return new ArtifactSnapshot(
                    metadata.artifactId(),
                    normalizeArtifactFormat(metadata.format()),
                    metadata.revision(),
                    normalizeArtifactStatus(metadata.status()),
                    Files.readString(contentPath, StandardCharsets.UTF_8),
                    metadata.updatedAt()
            );
        } catch (IOException e) {
            throw storageFailure("读取 AI 任务产物失败", e);
        }
    }

    private ArtifactSnapshot requireArtifactRevision(
            String runId,
            String artifactId,
            long baseRevision
    ) {
        ArtifactSnapshot current = readArtifactOrNull(runId, artifactId);
        if (current == null) {
            throw new AppException(404, "AI 任务产物不存在");
        }
        if (baseRevision <= 0 || current.revision() != baseRevision) {
            throw new AppException(
                    409,
                    "AI 任务产物版本冲突，当前版本为 " + current.revision()
            );
        }
        return current;
    }

    private ArtifactSnapshot writeArtifactRevision(
            Path directory,
            ArtifactSnapshot snapshot
    ) {
        try {
            Files.createDirectories(directory);
            Path contentPath = directory.resolve(contentRevisionFile(snapshot.revision()));
            writeTextAtomically(contentPath, snapshot.content());
            StoredArtifactMetadata metadata = new StoredArtifactMetadata(
                    snapshot.artifactId(),
                    snapshot.format(),
                    snapshot.revision(),
                    snapshot.status(),
                    snapshot.updatedAt()
            );
            writeJsonAtomically(
                    directory.resolve(ARTIFACT_METADATA_FILE),
                    JSON.toJSONString(metadata, JSONWriter.Feature.PrettyFormat)
            );
            return snapshot;
        } catch (IOException e) {
            throw storageFailure("保存 AI 任务产物失败", e);
        }
    }

    private String contentRevisionFile(long revision) {
        return "content-" + revision + ".txt";
    }

    private String normalizeArtifactFormat(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        if (!List.of("json", "text").contains(normalized)) {
            throw new AppException(400, "AI 任务产物格式只能是 json 或 text");
        }
        return normalized;
    }

    private String normalizeArtifactStatus(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        if (!List.of("draft", "invalid", "valid", "accepted", "committed", "blocked").contains(normalized)) {
            throw new AppException(400, "AI 任务产物状态不合法");
        }
        return normalized;
    }

    private String requireArtifactContent(String value) {
        String content = value == null ? "" : value;
        if (content.getBytes(StandardCharsets.UTF_8).length > MAX_ARTIFACT_CONTENT_BYTES) {
            throw new AppException(400, "AI 任务产物超过 32MB 限制");
        }
        return content;
    }

    private void requireStrictJson(String content) {
        if (!isStrictJson(content)) {
            throw new AppException(409, "当前 JSON 产物语法无效，请使用文本补丁修复");
        }
    }

    private boolean isStrictJson(String content) {
        try {
            STRICT_JSON_MAPPER.readTree(content);
            return true;
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    private Object applyJsonPatchOperation(Object document, JsonPatchOperation operation) {
        if (operation == null) {
            throw new AppException(400, "JSON Patch 操作不能为空");
        }
        String op = operation.op() == null ? "" : operation.op().trim().toLowerCase();
        String path = operation.path() == null ? "" : operation.path().trim();
        if (!List.of("add", "replace", "remove").contains(op)) {
            throw new AppException(400, "仅支持 add、replace、remove JSON Patch 操作");
        }
        if (path.isEmpty()) {
            if ("remove".equals(op)) {
                throw new AppException(400, "不能删除 JSON 根节点");
            }
            return deepCopyJsonValue(operation.value());
        }
        if (!path.startsWith("/")) {
            throw new AppException(400, "JSON Patch path 必须以 / 开头");
        }
        List<String> tokens = java.util.Arrays.stream(path.substring(1).split("/", -1))
                .map(this::decodeJsonPointerToken)
                .toList();
        Object parent = document;
        for (int index = 0; index < tokens.size() - 1; index++) {
            parent = readJsonChild(parent, tokens.get(index));
        }
        String key = tokens.get(tokens.size() - 1);
        if (parent instanceof JSONObject object) {
            if (("replace".equals(op) || "remove".equals(op)) && !object.containsKey(key)) {
                throw new AppException(409, "JSON Patch 目标不存在：" + path);
            }
            if ("remove".equals(op)) {
                object.remove(key);
            } else {
                object.put(key, deepCopyJsonValue(operation.value()));
            }
            return document;
        }
        if (parent instanceof JSONArray array) {
            if ("add".equals(op) && "-".equals(key)) {
                array.add(deepCopyJsonValue(operation.value()));
                return document;
            }
            int position = parseArrayIndex(key, path);
            if ("add".equals(op)) {
                if (position > array.size()) {
                    throw new AppException(409, "JSON Patch 数组位置越界：" + path);
                }
                array.add(position, deepCopyJsonValue(operation.value()));
            } else {
                if (position >= array.size()) {
                    throw new AppException(409, "JSON Patch 数组位置越界：" + path);
                }
                if ("remove".equals(op)) {
                    array.remove(position);
                } else {
                    array.set(position, deepCopyJsonValue(operation.value()));
                }
            }
            return document;
        }
        throw new AppException(409, "JSON Patch 父节点不是对象或数组：" + path);
    }

    private Object readJsonChild(Object parent, String token) {
        if (parent instanceof JSONObject object && object.containsKey(token)) {
            return object.get(token);
        }
        if (parent instanceof JSONArray array) {
            int index = parseArrayIndex(token, token);
            if (index < array.size()) {
                return array.get(index);
            }
        }
        throw new AppException(409, "JSON Patch 路径不存在");
    }

    private int parseArrayIndex(String value, String path) {
        try {
            int index = Integer.parseInt(value);
            if (index < 0) {
                throw new NumberFormatException("negative");
            }
            return index;
        } catch (NumberFormatException e) {
            throw new AppException(400, "JSON Patch 数组位置不合法：" + path);
        }
    }

    private String decodeJsonPointerToken(String value) {
        return value.replace("~1", "/").replace("~0", "~");
    }

    private Object deepCopyJsonValue(Object value) {
        return value == null ? null : JSON.parse(JSON.toJSONString(value));
    }

    private Path workspacePath(String runId) {
        return workspacesRoot.resolve(runId).normalize();
    }

    private String requireSafeName(String value, String field) {
        if (value == null || !SAFE_NAME.matcher(value).matches()) {
            throw new AppException(400, "请求参数错误：" + field + " 格式不正确");
        }
        return value;
    }

    private void writeJsonAtomically(Path target, String json) throws IOException {
        writeTextAtomically(target, json);
    }

    private void writeTextAtomically(Path target, String content) throws IOException {
        Files.createDirectories(target.getParent());
        Path temporary = target.resolveSibling(
                "." + target.getFileName() + ".writing-" + UUID.randomUUID()
        );
        try {
            Files.writeString(temporary, content, StandardCharsets.UTF_8);
            moveAtomicallyReplacing(temporary, target);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private void moveAtomically(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(source, target);
        }
    }

    private void moveAtomicallyReplacing(Path source, Path target) throws IOException {
        try {
            Files.move(
                    source,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
            );
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void deleteDirectory(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private void deleteQuietly(Path directory) {
        try {
            deleteDirectory(directory);
        } catch (IOException ignored) {
            // 失败路径只用于回收未完成的临时目录。
        }
    }

    private AppException storageFailure(String message, Exception cause) {
        log.error(message, cause);
        return new AppException(500, message);
    }

    public record WorkspaceManifest(
            int formatVersion,
            String runId,
            String requestId,
            String userId,
            String projectId,
            String sessionId,
            long createdAt,
            long updatedAt
    ) {
        public WorkspaceManifest(
                String runId,
                String requestId,
                String userId,
                String projectId,
                String sessionId,
                long createdAt
        ) {
            this(
                    FORMAT_VERSION,
                    runId,
                    requestId,
                    userId,
                    projectId,
                    sessionId,
                    createdAt,
                    createdAt
            );
        }
    }

    public record WorkspaceStateFile(String runId, String taskStateJson) {
    }

    public record AttachmentFile(String attachmentId, String metadataJson, byte[] content) {
    }

    public record ArtifactSnapshot(
            String artifactId,
            String format,
            long revision,
            String status,
            String content,
            long updatedAt
    ) {
    }

    public record JsonPatchOperation(
            String op,
            String path,
            Object value
    ) {
    }

    public record ArtifactValidation(
            String artifactId,
            long revision,
            boolean valid,
            List<String> issues
    ) {
    }

    private record StoredArtifactMetadata(
            String artifactId,
            String format,
            long revision,
            String status,
            long updatedAt
    ) {
    }
}
