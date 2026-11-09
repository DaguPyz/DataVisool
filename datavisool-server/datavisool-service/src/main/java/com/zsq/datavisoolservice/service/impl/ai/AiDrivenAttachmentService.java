/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.util.AppContextUtil;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI 参考图临时附件存储。
 *
 * 附件只服务当前 AI 会话，暂存在服务端并在 24 小时后失效，
 * 不写入项目素材库，避免用户取消任务后留下无关素材。
 */
@Service
public class AiDrivenAttachmentService {
    private static final Logger log = LoggerFactory.getLogger(AiDrivenAttachmentService.class);
    private static final long DEFAULT_TTL_MS = 24L * 60L * 60L * 1000L;
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_DATA_URL_CHARS = 14 * 1024 * 1024;
    private static final int MAX_ATTACHMENTS_PER_USER = 64;
    private static final long MAX_TOTAL_BYTES_PER_USER = 128L * 1024L * 1024L;
    private static final int MAX_ATTACHMENTS_GLOBAL = 512;
    private static final long MAX_TOTAL_BYTES_GLOBAL = 512L * 1024L * 1024L;
    private static final int MAX_IMAGE_EDGE = 16_384;
    private static final long MAX_IMAGE_PIXELS = 100_000_000L;
    private final Map<String, StoredAttachment> attachments = new ConcurrentHashMap<>();

    @Resource
    private AiDrivenWorkspaceService workspaceService;

    public AiDrivenAttachmentService() {
    }

    AiDrivenAttachmentService(AiDrivenWorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @PostConstruct
    void restoreStagedAttachments() {
        long now = Instant.now().toEpochMilli();
        for (AiDrivenWorkspaceService.AttachmentFile file : workspaceService.loadStagedAttachments()) {
            StoredAttachment attachment = parseStoredAttachment(file, now);
            if (attachment != null) {
                attachments.putIfAbsent(attachment.id(), attachment);
            } else {
                try {
                    workspaceService.deleteStagedAttachment(file.attachmentId());
                } catch (AppException e) {
                    log.warn("清理无效 AI 图片附件失败: {}", file.attachmentId());
                }
            }
        }
        cleanupExpired(now);
    }

    public AttachmentReference upload(UploadRequest request) {
        User user = requireCurrentUser();
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String projectId = requireText(request.projectId(), "projectId");
        String sessionId = requireText(request.sessionId(), "sessionId");
        String originalName = requireText(request.fileName(), "fileName");
        ParsedDataUrl parsed = parseImageDataUrl(request.dataUrl());
        String detectedMime = detectImageMime(parsed.bytes());
        if (detectedMime == null) {
            throw new AppException(400, "图片内容无法通过格式校验");
        }
        if (!parsed.mimeType().equals(detectedMime)) {
            throw new AppException(400, "图片内容与 MIME 类型不匹配");
        }
        ImageSize imageSize = readImageSize(parsed.bytes(), detectedMime);
        if (imageSize == null) {
            throw new AppException(400, "无法读取图片尺寸");
        }
        validateImageSize(imageSize);

        long now = Instant.now().toEpochMilli();
        long maximumExpireAt = now + DEFAULT_TTL_MS;
        long expireAt = request.expireAt() != null && request.expireAt() > now
                ? Math.min(request.expireAt(), maximumExpireAt)
                : maximumExpireAt;
        String attachmentId = "ai-attachment-" + UUID.randomUUID();
        String uploadRequestId = trimToNull(request.uploadRequestId());
        if (uploadRequestId == null) {
            uploadRequestId = "ai-upload-" + UUID.randomUUID();
        }
        String sha256 = sha256(parsed.bytes());
        StoredAttachment stored = new StoredAttachment(
                attachmentId,
                String.valueOf(user.getId()),
                projectId,
                sessionId,
                uploadRequestId,
                originalName,
                detectedMime,
                parsed.base64Data(),
                sha256,
                parsed.bytes().length,
                imageSize.width(),
                imageSize.height(),
                expireAt,
                now
        );
        synchronized (attachments) {
            cleanupExpired(now);
            enforceUserQuota(stored.userId(), stored.byteSize());
            persistStagedAttachment(stored, parsed.bytes());
            attachments.put(attachmentId, stored);
        }

        return new AttachmentReference(
                attachmentId,
                attachmentId,
                projectId,
                sessionId,
                uploadRequestId,
                detectedMime,
                originalName,
                sha256,
                request.dataUrl().trim(),
                parsed.bytes().length,
                imageSize.width(),
                imageSize.height(),
                "ready",
                expireAt,
                now,
                now
        );
    }

    public List<ModelAttachment> resolveForCurrentUser(List<String> attachmentIds) {
        return resolveForCurrentUser(attachmentIds, null, null);
    }

    public List<ModelAttachment> resolveForCurrentUser(
            List<String> attachmentIds,
            String expectedProjectId,
            String expectedSessionId
    ) {
        return resolveForCurrentUser(
                attachmentIds,
                expectedProjectId,
                expectedSessionId,
                null
        );
    }

    public List<ModelAttachment> resolveForCurrentUser(
            List<String> attachmentIds,
            String expectedProjectId,
            String expectedSessionId,
            String runId
    ) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return List.of();
        }
        User user = requireCurrentUser();
        String userId = String.valueOf(user.getId());
        long now = Instant.now().toEpochMilli();
        cleanupExpired(now);

        List<ModelAttachment> result = new ArrayList<>();
        List<String> seenIds = new ArrayList<>();
        for (String rawId : attachmentIds) {
            String attachmentId = requireText(rawId, "attachmentId");
            if (seenIds.contains(attachmentId)) {
                throw new AppException(400, "AI 图片附件不能重复");
            }
            seenIds.add(attachmentId);
            StoredAttachment attachment = attachments.get(attachmentId);
            if (attachment == null && runId != null) {
                restoreWorkspaceAttachments(runId, List.of(attachmentId));
                attachment = attachments.get(attachmentId);
            }
            if (attachment == null || attachment.expireAt() <= now) {
                throw new AppException(404, "AI 图片附件不存在或已过期");
            }
            if (!attachment.userId().equals(userId)) {
                throw new AppException(403, "无权访问该 AI 图片附件");
            }
            if (expectedProjectId != null && !attachment.projectId().equals(expectedProjectId)) {
                throw new AppException(400, "AI 图片附件与当前项目不匹配");
            }
            if (expectedSessionId != null && !attachment.sessionId().equals(expectedSessionId)) {
                throw new AppException(400, "AI 图片附件与当前会话不匹配");
            }
            result.add(new ModelAttachment(
                    attachment.id(),
                    attachment.mimeType(),
                    attachment.base64Data(),
                    attachment.originalName(),
                    attachment.sha256(),
                    attachment.width(),
                    attachment.height()
            ));
        }
        return result;
    }

    public void validateOwnedAttachments(
            List<String> attachmentIds,
            String expectedProjectId,
            String expectedSessionId
    ) {
        resolveForCurrentUser(attachmentIds, expectedProjectId, expectedSessionId);
    }

    public void bindAttachmentsToWorkspace(String runId, List<String> attachmentIds) {
        for (String attachmentId : attachmentIds) {
            StoredAttachment attachment = attachments.get(attachmentId);
            if (attachment == null || attachment.expireAt() <= Instant.now().toEpochMilli()) {
                throw new AppException(404, "AI 图片附件不存在或已过期");
            }
            workspaceService.bindAttachment(runId, attachmentId);
        }
    }

    public void restoreWorkspaceAttachments(String runId, List<String> attachmentIds) {
        long now = Instant.now().toEpochMilli();
        for (String attachmentId : attachmentIds) {
            if (attachments.containsKey(attachmentId)) {
                continue;
            }
            AiDrivenWorkspaceService.AttachmentFile file =
                    workspaceService.loadWorkspaceAttachment(runId, attachmentId);
            StoredAttachment attachment = parseStoredAttachment(file, now);
            if (attachment == null || !attachment.id().equals(attachmentId)) {
                throw new AppException(500, "AI 任务工作区附件缺失或损坏");
            }
            attachments.putIfAbsent(attachment.id(), attachment);
        }
    }

    public List<AttachmentReference> resolveReferencesForCurrentUser(ResolveRequest request) {
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String projectId = requireText(request.projectId(), "projectId");
        String sessionId = requireText(request.sessionId(), "sessionId");
        List<ModelAttachment> resolved = resolveForCurrentUser(
                request.attachmentIds(),
                projectId,
                sessionId
        );
        long now = Instant.now().toEpochMilli();
        return resolved.stream().map(modelAttachment -> {
            StoredAttachment stored = attachments.get(modelAttachment.attachmentId());
            if (stored == null || stored.expireAt() <= now) {
                throw new AppException(404, "AI 图片附件不存在或已过期");
            }
            return toReference(stored, now);
        }).toList();
    }

    public int deleteForCurrentUser(DeleteRequest request) {
        User user = requireCurrentUser();
        if (request == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        String projectId = requireText(request.projectId(), "projectId");
        String sessionId = requireText(request.sessionId(), "sessionId");
        List<String> attachmentIds = request.attachmentIds() == null
                ? List.of()
                : request.attachmentIds().stream()
                .map(value -> requireText(value, "attachmentId"))
                .distinct()
                .toList();
        String userId = String.valueOf(user.getId());
        int deleted = 0;
        synchronized (attachments) {
            for (String attachmentId : attachmentIds) {
                StoredAttachment attachment = attachments.get(attachmentId);
                if (attachment != null
                        && attachment.userId().equals(userId)
                        && attachment.projectId().equals(projectId)
                        && attachment.sessionId().equals(sessionId)) {
                    workspaceService.deleteStagedAttachment(attachmentId);
                    if (attachments.remove(attachmentId, attachment)) {
                        deleted += 1;
                    }
                }
            }
        }
        return deleted;
    }

    ParsedDataUrl parseImageDataUrl(String dataUrl) {
        String value = requireText(dataUrl, "dataUrl");
        if (value.length() > MAX_DATA_URL_CHARS) {
            throw new AppException(400, "单张图片不能超过 10MB");
        }
        int commaIndex = value.indexOf(',');
        if (!value.startsWith("data:image/") || commaIndex < 0) {
            throw new AppException(400, "图片附件必须是 base64 data URL");
        }
        String metadata = value.substring(5, commaIndex).toLowerCase(Locale.ROOT);
        if (!metadata.endsWith(";base64")) {
            throw new AppException(400, "图片附件必须使用 base64 编码");
        }
        String mimeType = metadata.substring(0, metadata.length() - ";base64".length());
        String base64Data = value.substring(commaIndex + 1).trim();
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64Data.getBytes(StandardCharsets.US_ASCII));
        } catch (IllegalArgumentException e) {
            throw new AppException(400, "图片附件 base64 内容不合法");
        }
        if (bytes.length == 0) {
            throw new AppException(400, "图片内容不能为空");
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new AppException(400, "单张图片不能超过 10MB");
        }
        return new ParsedDataUrl(mimeType, base64Data, bytes);
    }

    ImageSize readImageSize(byte[] bytes, String mimeType) {
        return switch (mimeType) {
            case "image/png" -> bytes.length >= 24
                    ? imageSize(readIntBigEndian(bytes, 16), readIntBigEndian(bytes, 20))
                    : null;
            case "image/gif" -> bytes.length >= 10
                    ? imageSize(readUnsignedShortLittleEndian(bytes, 6), readUnsignedShortLittleEndian(bytes, 8))
                    : null;
            case "image/bmp" -> bytes.length >= 26
                    ? imageSize(
                    Math.abs(readIntLittleEndian(bytes, 18)),
                    Math.abs(readIntLittleEndian(bytes, 22))
            )
                    : null;
            case "image/jpeg" -> readJpegSize(bytes);
            case "image/webp" -> readWebpSize(bytes);
            default -> null;
        };
    }

    private ImageSize readJpegSize(byte[] bytes) {
        int offset = 2;
        while (offset + 8 < bytes.length) {
            if ((bytes[offset] & 0xff) != 0xff) {
                offset += 1;
                continue;
            }
            int marker = bytes[offset + 1] & 0xff;
            if (marker == 0xd8 || marker == 0xd9 || marker == 0x01) {
                offset += 2;
                continue;
            }
            int segmentLength = readUnsignedShortBigEndian(bytes, offset + 2);
            if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
                return null;
            }
            if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
                return imageSize(
                        readUnsignedShortBigEndian(bytes, offset + 7),
                        readUnsignedShortBigEndian(bytes, offset + 5)
                );
            }
            offset += 2 + segmentLength;
        }
        return null;
    }

    private boolean isJpegStartOfFrame(int marker) {
        return marker >= 0xc0
                && marker <= 0xcf
                && marker != 0xc4
                && marker != 0xc8
                && marker != 0xcc;
    }

    private ImageSize readWebpSize(byte[] bytes) {
        if (bytes.length < 30) {
            return null;
        }
        String chunkType = new String(bytes, 12, 4, StandardCharsets.US_ASCII);
        if ("VP8X".equals(chunkType)) {
            int width = 1 + readUnsigned24LittleEndian(bytes, 24);
            int height = 1 + readUnsigned24LittleEndian(bytes, 27);
            return imageSize(width, height);
        }
        if ("VP8L".equals(chunkType) && (bytes[20] & 0xff) == 0x2f) {
            int b1 = bytes[21] & 0xff;
            int b2 = bytes[22] & 0xff;
            int b3 = bytes[23] & 0xff;
            int b4 = bytes[24] & 0xff;
            int width = 1 + (((b2 & 0x3f) << 8) | b1);
            int height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
            return imageSize(width, height);
        }
        if ("VP8 ".equals(chunkType)
                && (bytes[23] & 0xff) == 0x9d
                && (bytes[24] & 0xff) == 0x01
                && (bytes[25] & 0xff) == 0x2a) {
            int width = readUnsignedShortLittleEndian(bytes, 26) & 0x3fff;
            int height = readUnsignedShortLittleEndian(bytes, 28) & 0x3fff;
            return imageSize(width, height);
        }
        return null;
    }

    private ImageSize imageSize(int width, int height) {
        return width > 0 && height > 0 ? new ImageSize(width, height) : null;
    }

    void validateImageSize(ImageSize size) {
        if (size.width() > MAX_IMAGE_EDGE
                || size.height() > MAX_IMAGE_EDGE
                || (long) size.width() * size.height() > MAX_IMAGE_PIXELS) {
            throw new AppException(400, "图片尺寸过大");
        }
    }

    private int readUnsignedShortBigEndian(byte[] bytes, int offset) {
        return ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
    }

    private int readUnsignedShortLittleEndian(byte[] bytes, int offset) {
        return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
    }

    private int readUnsigned24LittleEndian(byte[] bytes, int offset) {
        return (bytes[offset] & 0xff)
                | ((bytes[offset + 1] & 0xff) << 8)
                | ((bytes[offset + 2] & 0xff) << 16);
    }

    private int readIntBigEndian(byte[] bytes, int offset) {
        return ((bytes[offset] & 0xff) << 24)
                | ((bytes[offset + 1] & 0xff) << 16)
                | ((bytes[offset + 2] & 0xff) << 8)
                | (bytes[offset + 3] & 0xff);
    }

    private int readIntLittleEndian(byte[] bytes, int offset) {
        return (bytes[offset] & 0xff)
                | ((bytes[offset + 1] & 0xff) << 8)
                | ((bytes[offset + 2] & 0xff) << 16)
                | ((bytes[offset + 3] & 0xff) << 24);
    }

    String detectImageMime(byte[] bytes) {
        if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
            return "image/png";
        }
        if (startsWith(bytes, 0xff, 0xd8, 0xff)) {
            return "image/jpeg";
        }
        if (startsWith(bytes, 0x47, 0x49, 0x46, 0x38)) {
            return "image/gif";
        }
        if (startsWith(bytes, 0x42, 0x4d)) {
            return "image/bmp";
        }
        if (bytes.length >= 12
                && startsWith(bytes, 0x52, 0x49, 0x46, 0x46)
                && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50) {
            return "image/webp";
        }
        return null;
    }

    private boolean startsWith(byte[] bytes, int... prefix) {
        if (bytes.length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index++) {
            if ((bytes[index] & 0xff) != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new AppException(500, "图片摘要计算失败");
        }
    }

    @Scheduled(fixedDelay = 60_000L)
    public void cleanupExpiredAttachments() {
        cleanupExpired(Instant.now().toEpochMilli());
    }

    private void cleanupExpired(long now) {
        synchronized (attachments) {
            List<String> expiredIds = attachments.entrySet().stream()
                    .filter(entry -> entry.getValue().expireAt() <= now)
                    .map(Map.Entry::getKey)
                    .toList();
            for (String attachmentId : expiredIds) {
                attachments.remove(attachmentId);
                try {
                    workspaceService.deleteStagedAttachment(attachmentId);
                } catch (AppException e) {
                    log.warn("清理过期 AI 图片附件失败: {}", attachmentId);
                }
            }
        }
    }

    private void enforceUserQuota(String userId, long newByteSize) {
        long attachmentCount = 0;
        long totalBytes = 0;
        long globalBytes = 0;
        for (StoredAttachment attachment : attachments.values()) {
            globalBytes += attachment.byteSize();
            if (attachment.userId().equals(userId)) {
                attachmentCount += 1;
                totalBytes += attachment.byteSize();
            }
        }
        if (attachmentCount >= MAX_ATTACHMENTS_PER_USER) {
            throw new AppException(429, "AI 图片附件数量已达上限，请删除不用的图片后重试");
        }
        if (totalBytes + newByteSize > MAX_TOTAL_BYTES_PER_USER) {
            throw new AppException(429, "AI 图片附件总大小已达上限，请删除不用的图片后重试");
        }
        if (attachments.size() >= MAX_ATTACHMENTS_GLOBAL
                || globalBytes + newByteSize > MAX_TOTAL_BYTES_GLOBAL) {
            throw new AppException(503, "AI 图片临时存储已满，请稍后重试");
        }
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(401, "用户未登录");
        }
        return user;
    }

    private String requireText(String value, String field) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new AppException(400, "请求参数错误：" + field + " 不能为空");
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record UploadRequest(
            String projectId,
            String sessionId,
            String uploadRequestId,
            String fileName,
            String dataUrl,
            String mime,
            Long expireAt
    ) {
    }

    public record AttachmentReference(
            String attachmentId,
            String id,
            String projectId,
            String sessionId,
            String uploadRequestId,
            String mimeType,
            String originalName,
            String sha256,
            String url,
            long byteSize,
            int width,
            int height,
            String status,
            long expireAt,
            long createdAt,
            long updatedAt
    ) {
    }

    public record ModelAttachment(
            String attachmentId,
            String mimeType,
            String base64Data,
            String originalName,
            String sha256,
            int width,
            int height
    ) {
    }

    public record DeleteRequest(
            String projectId,
            String sessionId,
            List<String> attachmentIds
    ) {
    }

    public record ResolveRequest(
            String projectId,
            String sessionId,
            List<String> attachmentIds
    ) {
    }

    record ParsedDataUrl(String mimeType, String base64Data, byte[] bytes) {
    }

    record ImageSize(int width, int height) {
    }

    private record StoredAttachment(
            String id,
            String userId,
            String projectId,
            String sessionId,
            String uploadRequestId,
            String originalName,
            String mimeType,
            String base64Data,
            String sha256,
            long byteSize,
            int width,
            int height,
            long expireAt,
            long createdAt
    ) {
    }

    private record StoredAttachmentMetadata(
            String id,
            String userId,
            String projectId,
            String sessionId,
            String uploadRequestId,
            String originalName,
            String mimeType,
            String sha256,
            long byteSize,
            int width,
            int height,
            long expireAt,
            long createdAt
    ) {
    }

    private void persistStagedAttachment(StoredAttachment attachment, byte[] content) {
        StoredAttachmentMetadata metadata = new StoredAttachmentMetadata(
                attachment.id(),
                attachment.userId(),
                attachment.projectId(),
                attachment.sessionId(),
                attachment.uploadRequestId(),
                attachment.originalName(),
                attachment.mimeType(),
                attachment.sha256(),
                attachment.byteSize(),
                attachment.width(),
                attachment.height(),
                attachment.expireAt(),
                attachment.createdAt()
        );
        workspaceService.stageAttachment(attachment.id(), JSON.toJSONString(metadata), content);
    }

    private StoredAttachment parseStoredAttachment(
            AiDrivenWorkspaceService.AttachmentFile file,
            long now
    ) {
        if (file == null) {
            return null;
        }
        try {
            StoredAttachmentMetadata metadata =
                    JSON.parseObject(file.metadataJson(), StoredAttachmentMetadata.class);
            if (metadata == null
                    || !file.attachmentId().equals(metadata.id())
                    || metadata.expireAt() <= now
                    || metadata.byteSize() != file.content().length
                    || !metadata.sha256().equals(sha256(file.content()))
                    || !metadata.mimeType().equals(detectImageMime(file.content()))) {
                return null;
            }
            return new StoredAttachment(
                    metadata.id(),
                    metadata.userId(),
                    metadata.projectId(),
                    metadata.sessionId(),
                    metadata.uploadRequestId(),
                    metadata.originalName(),
                    metadata.mimeType(),
                    Base64.getEncoder().encodeToString(file.content()),
                    metadata.sha256(),
                    metadata.byteSize(),
                    metadata.width(),
                    metadata.height(),
                    metadata.expireAt(),
                    metadata.createdAt()
            );
        } catch (RuntimeException e) {
            log.warn("解析 AI 图片附件失败，已跳过: {}", file.attachmentId());
            return null;
        }
    }

    private AttachmentReference toReference(StoredAttachment attachment, long updatedAt) {
        return new AttachmentReference(
                attachment.id(),
                attachment.id(),
                attachment.projectId(),
                attachment.sessionId(),
                attachment.uploadRequestId(),
                attachment.mimeType(),
                attachment.originalName(),
                attachment.sha256(),
                "data:" + attachment.mimeType() + ";base64," + attachment.base64Data(),
                attachment.byteSize(),
                attachment.width(),
                attachment.height(),
                "ready",
                attachment.expireAt(),
                attachment.createdAt(),
                updatedAt
        );
    }
}
