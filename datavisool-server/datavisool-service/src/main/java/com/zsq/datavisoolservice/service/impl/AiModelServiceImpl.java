/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.AiModelMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.AiModelDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunRequestDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunResponseDTO;
import com.zsq.datavisoolservice.model.dto.AiModelSelectDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import com.zsq.datavisoolservice.service.AiModelService;
import com.zsq.datavisoolservice.service.impl.ai.AiModelApiKeyCodec;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenModelCatalog;
import com.zsq.datavisoolservice.service.impl.ai.AiModelCapabilitySupport;
import com.zsq.datavisoolservice.service.impl.ai.AiModelContinuationSupport;
import com.zsq.datavisoolservice.service.impl.ai.AiModelProviderRequestContext;
import com.zsq.datavisoolservice.service.impl.ai.AiModelProviderRequestSpec;
import com.zsq.datavisoolservice.service.impl.ai.AiModelProviderSupport;
import com.zsq.datavisoolservice.service.impl.ai.AiModelResultSupport;
import com.zsq.datavisoolservice.service.impl.ai.AiModelRunScene;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenAttachmentService;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenTaskService;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenWorkspaceService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.Resource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

@Log4j2
@Service
public class AiModelServiceImpl implements AiModelService {
    private static final int AI_MODEL_RUN_MAX_ATTEMPTS = 10;
    private static final int AI_MODEL_RESULT_REPAIR_MAX_ATTEMPTS = 4;
    private static final int AI_MODEL_CONTINUATION_MAX_ROUNDS = 3;
    private static final int AI_MODEL_WORKSPACE_TOOL_MAX_TURNS = 8;
    private static final int AI_MODEL_INVOCATION_LOCK_STRIPES = 64;
    private static final int AI_MODEL_MAX_LOGICAL_CALLS = 8;
    private static final long AI_MODEL_MAX_TOTAL_TOKENS = 120_000L;
    private static final Duration AI_MODEL_MAX_EXECUTION_DURATION = Duration.ofSeconds(180);
    private static final long AI_MODEL_RUN_RETRY_DELAY_BASE_MS = 300L;
    private static final long AI_MODEL_RUN_RETRY_DELAY_MAX_MS = 3000L;

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(90))
            .build();
    private final Object[] invocationLocks = java.util.stream.IntStream
            .range(0, AI_MODEL_INVOCATION_LOCK_STRIPES)
            .mapToObj(ignored -> new Object())
            .toArray();

    @Resource
    private AiModelMapper aiModelMapper;

    @Resource
    private AiDrivenAttachmentService aiDrivenAttachmentService;

    @Resource
    private AiDrivenTaskService aiDrivenTaskService;

    @Resource
    private AiDrivenWorkspaceService aiDrivenWorkspaceService;

    @Override
    public Page<AiModelDTO> getAiModelPageList(PageParamDTO pageParamDTO) {
        User currentUser = requireCurrentUser();
        if (pageParamDTO == null) {
            return new Page<>();
        }

        long current = pageParamDTO.getCurrent() == null || pageParamDTO.getCurrent() <= 0 ? 1 : pageParamDTO.getCurrent();
        long size = pageParamDTO.getSize() == null || pageParamDTO.getSize() <= 0 ? 10 : pageParamDTO.getSize();
        String keyword = trimToNull(pageParamDTO.getSearchValue());

        Page<AiModelPO> page = new Page<>(current, size);
        LambdaQueryWrapper<AiModelPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiModelPO::getUserId, currentUser.getId());
        if (keyword != null) {
            wrapper.and(query -> query
                    .like(AiModelPO::getName, keyword)
                    .or()
                    .like(AiModelPO::getProvider, keyword)
                    .or()
                    .like(AiModelPO::getBaseUrl, keyword));
        }
        wrapper.orderByDesc(AiModelPO::getIsDefault, AiModelPO::getEnabled, AiModelPO::getUpdateTime, AiModelPO::getId);

        Page<AiModelPO> aiModelPage = aiModelMapper.selectPage(page, wrapper);
        Page<AiModelDTO> dtoPage = new Page<>();
        BeanUtils.copyProperties(aiModelPage, dtoPage);

        List<AiModelDTO> records = new ArrayList<>();
        for (AiModelPO aiModelPO : aiModelPage.getRecords()) {
            records.add(toDto(aiModelPO));
        }
        dtoPage.setRecords(records);
        return dtoPage;
    }

    @Override
    public List<AiModelSelectDTO> getAiModelList() {
        User currentUser = requireCurrentUser();
        LambdaQueryWrapper<AiModelPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiModelPO::getUserId, currentUser.getId());
        wrapper.eq(AiModelPO::getEnabled, 1);
        wrapper.orderByDesc(AiModelPO::getIsDefault, AiModelPO::getUpdateTime, AiModelPO::getId);

        List<AiModelPO> aiModels = aiModelMapper.selectList(wrapper);
        List<AiModelSelectDTO> records = new ArrayList<>();
        for (AiModelPO aiModel : aiModels) {
            records.add(toSelectDto(aiModel));
        }
        return records;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addAiModel(AiModelDTO aiModelDTO) {
        User currentUser = requireCurrentUser();
        AiModelDTO request = requireRequest(aiModelDTO);
        String name = requireTrimmed(request.getName(), "name");
        String provider = AiModelProviderSupport.normalizeProviderKeyForStorage(requireTrimmed(request.getProvider(), "provider"));
        String baseUrl = normalizeBaseUrl(request.getBaseUrl());
        String description = trimToNull(request.getDescription());
        Double temperature = normalizeTemperature(request.getTemperature());
        Long maxTokens = normalizeMaxTokens(request.getMaxTokens());
        Integer enabled = normalizeSwitchFlag(request.getEnabled(), 1);
        Integer isDefault = normalizeSwitchFlag(request.getIsDefault(), 0);
        if (isDefault == 1) {
            enabled = 1;
        }

        String apiKey = normalizeApiKeyForStorage(request.getApiKey());
        AiModelPO aiModelPO = new AiModelPO();
        aiModelPO.setUserId(currentUser.getId());
        aiModelPO.setName(name);
        aiModelPO.setProvider(provider);
        aiModelPO.setBaseUrl(baseUrl);
        aiModelPO.setApiKey(apiKey);
        aiModelPO.setDescription(description);
        aiModelPO.setTemperature(temperature);
        aiModelPO.setMaxTokens(maxTokens);
        aiModelPO.setEnabled(enabled);
        aiModelPO.setIsDefault(isDefault);

        if (isDefault == 1) {
            aiModelMapper.update(
                    null,
                    new LambdaUpdateWrapper<AiModelPO>()
                            .eq(AiModelPO::getUserId, currentUser.getId())
                            .eq(AiModelPO::getDeleted, 0)
                            .set(AiModelPO::getIsDefault, 0)
            );
        }

        int affectedRows = aiModelMapper.insert(aiModelPO);
        if (affectedRows <= 0 || aiModelPO.getId() == null) {
            throw new AppException(500, "新增 AI 模型失败，请稍后重试");
        }
        return aiModelPO.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Boolean updateAiModel(AiModelDTO aiModelDTO) {
        User currentUser = requireCurrentUser();
        AiModelDTO request = requireRequest(aiModelDTO);
        Long id = requireId(request.getId());
        String name = requireTrimmed(request.getName(), "name");
        String provider = AiModelProviderSupport.normalizeProviderKeyForStorage(requireTrimmed(request.getProvider(), "provider"));
        String baseUrl = normalizeBaseUrl(request.getBaseUrl());
        String description = trimToNull(request.getDescription());
        Integer clearApiKey = normalizeSwitchFlag(request.getClearApiKey(), 0);
        String apiKey = normalizeApiKeyForStorage(request.getApiKey());
        Double temperature = normalizeTemperature(request.getTemperature());
        Long maxTokens = normalizeMaxTokens(request.getMaxTokens());
        Integer enabled = normalizeSwitchFlag(request.getEnabled(), 1);
        Integer isDefault = normalizeSwitchFlag(request.getIsDefault(), 0);
        if (isDefault == 1) {
            enabled = 1;
        }

        AiModelPO existing = aiModelMapper.selectById(id);
        if (existing == null || !currentUser.getId().equals(existing.getUserId())) {
            throw new AppException(404, "AI 模型不存在，无法更新");
        }

        if (isDefault == 1) {
            aiModelMapper.update(
                    null,
                    new LambdaUpdateWrapper<AiModelPO>()
                            .eq(AiModelPO::getUserId, currentUser.getId())
                            .eq(AiModelPO::getDeleted, 0)
                            .ne(AiModelPO::getId, id)
                            .set(AiModelPO::getIsDefault, 0)
            );
        }

        String nextApiKey;
        if (clearApiKey == 1) {
            nextApiKey = null;
        } else if (apiKey != null) {
            nextApiKey = apiKey;
        } else {
            String existingApiKey = trimToNull(existing.getApiKey());
            if (existingApiKey == null) {
                nextApiKey = null;
            } else if (AiModelApiKeyCodec.isEncrypted(existingApiKey)) {
                nextApiKey = existingApiKey;
            } else {
                nextApiKey = AiModelApiKeyCodec.encrypt(existingApiKey);
            }
        }

        AiModelPO aiModelPO = new AiModelPO();
        aiModelPO.setId(id);
        aiModelPO.setName(name);
        aiModelPO.setProvider(provider);
        aiModelPO.setBaseUrl(baseUrl);
        aiModelPO.setApiKey(nextApiKey);
        aiModelPO.setDescription(description);
        aiModelPO.setTemperature(temperature);
        aiModelPO.setMaxTokens(maxTokens);
        aiModelPO.setEnabled(enabled);
        aiModelPO.setIsDefault(isDefault);

        return aiModelMapper.update(aiModelPO, new LambdaUpdateWrapper<AiModelPO>()
                .eq(AiModelPO::getId, id)
                .eq(AiModelPO::getUserId, currentUser.getId())
                .set(clearApiKey == 1, AiModelPO::getApiKey, null)) > 0;
    }

    @Override
    public Boolean batchDelAiModel(List<Long> ids) {
        User currentUser = requireCurrentUser();
        if (ids == null || ids.isEmpty()) {
            throw new AppException(400, "请求参数错误：ids 不能为空");
        }

        return aiModelMapper.update(
                null,
                new LambdaUpdateWrapper<AiModelPO>()
                        .eq(AiModelPO::getUserId, currentUser.getId())
                        .eq(AiModelPO::getDeleted, 0)
                        .in(AiModelPO::getId, ids)
                        .set(AiModelPO::getDeleted, 1)
                        .set(AiModelPO::getIsDefault, 0)
        ) > 0;
    }

    @Override
    public AiModelRunResponseDTO run(AiModelRunRequestDTO requestDTO) {
        User currentUser = requireCurrentUser();
        AiModelRunRequestDTO request = requireRunRequest(requestDTO);
        Long modelId = parseLongId(request.getModelId(), "modelId");
        String modelName = requireTrimmed(request.getRuntimeModelId(), "runtimeModelId");
        String prompt = requireTrimmed(request.getPrompt(), "prompt");
        String systemPrompt = trimToNull(request.getSystemPrompt());
        Long requestMaxTokens = normalizeMaxTokens(request.getMaxTokens());
        String requestedScene = trimToNull(request.getScene());
        AiModelRunScene scene = AiModelRunScene.fromValue(requestedScene);
        if (requestedScene != null && scene == null) {
            throw new AppException(400, "不支持的 AI 运行场景：" + requestedScene);
        }
        String taskRequestId = trimToNull(request.getTaskRequestId());
        String taskWorkerId = trimToNull(request.getTaskWorkerId());

        log.info(
                "AI request start: modelId={}, scene={}, promptLength={}",
                modelId,
                scene == null ? "<empty>" : scene.asString(),
                prompt.length()
        );

        AiModelPO model = aiModelMapper.selectById(modelId);
        if (model == null || !currentUser.getId().equals(model.getUserId())) {
            throw new AppException(404, "未找到对应的 AI 模型");
        }
        if (normalizeSwitchFlag(model.getEnabled(), 1) == 0) {
            throw new AppException(400, "该 AI 模型已停用，请先启用后再试");
        }

        String provider = AiModelProviderSupport.normalizeProviderKeyForStorage(model.getProvider());
        List<String> attachmentIds = request.getAttachmentIds() == null
                ? List.of()
                : request.getAttachmentIds();
        if (!attachmentIds.isEmpty() && taskRequestId == null) {
            throw new AppException(400, "带图片的模型调用必须绑定 AI 任务");
        }
        AiDrivenTaskService.ModelInvocationContext taskContext = taskRequestId == null
                ? null
                : aiDrivenTaskService.validateModelInvocation(
                taskRequestId,
                taskWorkerId,
                String.valueOf(modelId),
                modelName,
                attachmentIds
        );
        List<AiDrivenAttachmentService.ModelAttachment> attachments =
                aiDrivenAttachmentService.resolveForCurrentUser(
                        attachmentIds,
                        taskContext == null ? null : taskContext.projectId(),
                        taskContext == null ? null : taskContext.sessionId(),
                        taskContext == null ? null : taskContext.runId()
                );
        if (!attachments.isEmpty() && !AiModelCapabilitySupport.supportsImageInput(provider, modelName)) {
            throw new AppException(400, "当前模型不支持图片输入，请选择支持图片输入的模型后重试");
        }
        String baseUrl = trimToNull(model.getBaseUrl());
        String apiKey = trimToNull(model.getApiKey());
        if (apiKey != null && AiModelApiKeyCodec.isEncrypted(apiKey)) {
            apiKey = AiModelApiKeyCodec.decrypt(apiKey);
        }

        Double temperature = normalizeTemperature(model.getTemperature());
        Long effectiveMaxTokens = AiDrivenModelCatalog.resolveMaxOutputTokens(provider, modelName,
                requestMaxTokens != null ? requestMaxTokens : normalizeMaxTokens(model.getMaxTokens()));
        List<JSONObject> messages = buildMessages(provider, systemPrompt, prompt, attachments);
        int repairAttempts = scene == null ? 1 : AI_MODEL_RESULT_REPAIR_MAX_ATTEMPTS;
        String lastValidationError = null;
        String artifactId = taskContext == null
                ? null
                : createModelArtifactId(
                modelId,
                provider,
                modelName,
                systemPrompt,
                prompt,
                effectiveMaxTokens,
                scene,
                attachmentIds,
                request.getValidationContext()
        );
        Object invocationLock = artifactId == null
                ? new Object()
                : invocationLocks[Math.floorMod(
                (taskContext.runId() + ":" + artifactId).hashCode(),
                invocationLocks.length
        )];

        synchronized (invocationLock) {
            ModelCallBudget budget = new ModelCallBudget(taskRequestId, taskWorkerId);
            if (taskContext != null) {
                aiDrivenTaskService.validateModelInvocation(
                        taskRequestId,
                        taskWorkerId,
                        String.valueOf(modelId),
                        modelName,
                        attachmentIds
                );
                AiDrivenWorkspaceService.ArtifactSnapshot recovered =
                        readArtifactOrNull(taskContext.runId(), artifactId);
                if (recovered != null && "blocked".equals(recovered.status())) {
                    throw new AppException(502, "模型输出被内容安全策略拦截");
                }
                if (recovered != null && !recovered.content().isBlank()) {
                    String recoveredReply = null;
                    RuntimeException recoveredValidationError = null;
                    try {
                        recoveredReply = AiModelResultSupport.validateAiModelReply(
                                scene,
                                recovered.content(),
                                request.getValidationContext()
                        );
                    } catch (RuntimeException e) {
                        recoveredValidationError = e;
                    }
                    if (recoveredValidationError == null) {
                        AiDrivenWorkspaceService.ArtifactSnapshot acceptedArtifact =
                                acceptArtifact(taskContext.runId(), recovered, recoveredReply);
                        return buildRunResponse(
                                currentUser,
                                model,
                                modelName,
                                provider,
                                baseUrl,
                                prompt,
                                recoveredReply,
                                null,
                                "stop",
                                Map.of("recovered", true, "stoppedBy", "workspace"),
                                acceptedArtifact,
                                null
                        );
                    }
                    ArtifactRepairResult repair = repairArtifactWithWorkspaceTools(
                            provider,
                            modelName,
                            baseUrl,
                            apiKey,
                            temperature,
                            effectiveMaxTokens,
                            taskRequestId,
                            taskContext.runId(),
                            recovered,
                            scene,
                            request.getValidationContext(),
                            sanitizeErrorMessage(recoveredValidationError.getMessage()),
                            budget
                    );
                    String normalizedReply = AiModelResultSupport.validateAiModelReply(
                            scene,
                            repair.artifact().content(),
                            request.getValidationContext()
                    );
                    AiDrivenWorkspaceService.ArtifactSnapshot acceptedArtifact =
                            acceptArtifact(taskContext.runId(), repair.artifact(), normalizedReply);
                    return buildRunResponse(
                            currentUser,
                            model,
                            modelName,
                            provider,
                            baseUrl,
                            prompt,
                            normalizedReply,
                            repair.usage(),
                            repair.finishReason(),
                            Map.of("recovered", true, "stoppedBy", "workspaceRepair"),
                            acceptedArtifact,
                            repair.rawResponse()
                    );
                }
            }

            for (int repairAttempt = 1; repairAttempt <= repairAttempts; repairAttempt++) {
                budget.requireRemainingDuration();
                ModelCompletion completion = requestCompletionWithContinuation(
                        provider,
                        modelName,
                        baseUrl,
                        apiKey,
                        temperature,
                        effectiveMaxTokens,
                        messages,
                        taskRequestId,
                        scene != null,
                        taskContext == null ? null : taskContext.runId(),
                        artifactId,
                        budget
                );
                JSONObject rawResponse = completion.rawResponse();
                String rawReply = completion.reply();
                AiDrivenWorkspaceService.ArtifactSnapshot artifact = completion.artifact();
                String normalizedReply;
                try {
                    normalizedReply = AiModelResultSupport.validateAiModelReply(
                            scene,
                            rawReply,
                            request.getValidationContext()
                    );
                } catch (RuntimeException e) {
                    String detail = sanitizeErrorMessage(e.getMessage());
                    if (detail.isBlank() && e instanceof AppException appException) {
                        detail = sanitizeErrorMessage(appException.getMsg());
                    }
                    lastValidationError = detail;
                    log.info(
                            "AI result validation failed: scene={}, repairAttempt={}, error={}",
                            scene == null ? "<empty>" : scene.asString(),
                            repairAttempt,
                            detail
                    );
                    if (scene == null) {
                        throw new AppException(
                                502,
                                buildMessageWithDetail("模型返回内容格式不符合要求", detail)
                        );
                    }
                    if (artifact != null) {
                        ArtifactRepairResult repair = repairArtifactWithWorkspaceTools(
                                provider,
                                modelName,
                                baseUrl,
                                apiKey,
                                temperature,
                                effectiveMaxTokens,
                                taskRequestId,
                                taskContext.runId(),
                                artifact,
                                scene,
                                request.getValidationContext(),
                                detail,
                                budget
                        );
                        normalizedReply = AiModelResultSupport.validateAiModelReply(
                                scene,
                                repair.artifact().content(),
                                request.getValidationContext()
                        );
                        AiDrivenWorkspaceService.ArtifactSnapshot acceptedArtifact =
                                acceptArtifact(taskContext.runId(), repair.artifact(), normalizedReply);
                        return buildRunResponse(
                                currentUser,
                                model,
                                modelName,
                                provider,
                                baseUrl,
                                prompt,
                                normalizedReply,
                                AiModelContinuationSupport.mergeUsage(
                                        completion.usage(),
                                        repair.usage()
                                ),
                                repair.finishReason(),
                                completion.continuationRounds() > 0
                                        ? Map.of(
                                        "enabled",
                                        true,
                                        "rounds",
                                        completion.continuationRounds(),
                                        "stoppedBy",
                                        "workspaceRepair"
                                )
                                        : null,
                                acceptedArtifact,
                                repair.rawResponse()
                        );
                    }
                    if (repairAttempt >= repairAttempts) {
                        throw new AppException(
                                502,
                                buildMessageWithDetail(
                                        "模型返回内容格式不符合要求，已自动修复重试 "
                                                + AI_MODEL_RESULT_REPAIR_MAX_ATTEMPTS
                                                + " 次，请稍后重试",
                                        detail
                                )
                        );
                    }
                    messages.add(buildAssistantMessage(rawReply));
                    messages.add(buildUserMessage(
                            AiModelResultSupport.buildAiModelRepairPrompt(scene, detail)
                    ));
                    continue;
                }

                if (artifact != null) {
                    artifact = acceptArtifact(taskContext.runId(), artifact, normalizedReply);
                }
                return buildRunResponse(
                        currentUser,
                        model,
                        modelName,
                        provider,
                        baseUrl,
                        prompt,
                        normalizedReply,
                        completion.usage(),
                        completion.finishReason(),
                        completion.continuationRounds() > 0
                                ? Map.of(
                                "enabled",
                                true,
                                "rounds",
                                completion.continuationRounds(),
                                "stoppedBy",
                                "naturalStop"
                        )
                                : null,
                        artifact,
                        rawResponse
                );
            }
        }

        throw new AppException(502, buildMessageWithDetail("模型返回内容格式不符合要求", lastValidationError));
    }

    private AiModelRunRequestDTO requireRunRequest(AiModelRunRequestDTO requestDTO) {
        if (requestDTO == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        return requestDTO;
    }

    private String createModelArtifactId(
            Long modelId,
            String provider,
            String modelName,
            String systemPrompt,
            String prompt,
            Long maxTokens,
            AiModelRunScene scene,
            List<String> attachmentIds,
            Map<String, Object> validationContext
    ) {
        Map<String, Object> material = new LinkedHashMap<>();
        material.put("formatVersion", 1);
        material.put("modelId", modelId);
        material.put("provider", provider);
        material.put("modelName", modelName);
        material.put("systemPrompt", systemPrompt);
        material.put("prompt", prompt);
        material.put("maxTokens", maxTokens);
        material.put("scene", scene == null ? null : scene.asString());
        material.put("attachmentIds", attachmentIds);
        material.put("validationContext", validationContext);
        String digest = AiDrivenTaskService.sha256CanonicalJson(material);
        return "model-result-" + digest.substring(0, 32);
    }

    private AiDrivenWorkspaceService.ArtifactSnapshot readArtifactOrNull(
            String runId,
            String artifactId
    ) {
        try {
            return aiDrivenWorkspaceService.readArtifact(runId, artifactId);
        } catch (AppException e) {
            if (e.getCode() == 404) {
                return null;
            }
            throw e;
        }
    }

    private AiDrivenWorkspaceService.ArtifactSnapshot acceptArtifact(
            String runId,
            AiDrivenWorkspaceService.ArtifactSnapshot artifact,
            String normalizedContent
    ) {
        AiDrivenWorkspaceService.ArtifactSnapshot current = artifact;
        if (!normalizedContent.equals(current.content())) {
            current = aiDrivenWorkspaceService.saveArtifactRevision(
                    runId,
                    current.artifactId(),
                    current.format(),
                    normalizedContent,
                    "valid"
            );
        } else if (!List.of("valid", "accepted").contains(current.status())) {
            current = aiDrivenWorkspaceService.updateArtifactStatus(
                    runId,
                    current.artifactId(),
                    current.revision(),
                    "valid"
            );
        }
        if (!"accepted".equals(current.status())) {
            current = aiDrivenWorkspaceService.updateArtifactStatus(
                    runId,
                    current.artifactId(),
                    current.revision(),
                    "accepted"
            );
        }
        return current;
    }

    private AiModelRunResponseDTO buildRunResponse(
            User currentUser,
            AiModelPO model,
            String modelName,
            String provider,
            String baseUrl,
            String prompt,
            String reply,
            JSONObject usage,
            String finishReason,
            Object continuation,
            AiDrivenWorkspaceService.ArtifactSnapshot artifact,
            JSONObject rawResponse
    ) {
        AiModelRunResponseDTO response = new AiModelRunResponseDTO();
        response.setModelId(String.valueOf(model.getId()));
        response.setModelName(modelName);
        response.setProvider(provider);
        response.setPrompt(prompt);
        response.setReply(reply);
        response.setUsage(usage);
        response.setFinishReason(finishReason);
        response.setContinuation(continuation);
        if (artifact != null) {
            response.setArtifactId(artifact.artifactId());
            response.setArtifactRevision(artifact.revision());
        }
        if (rawResponse != null) {
            String reasoningContent =
                    AiModelProviderSupport.extractReasoningContent(provider, rawResponse);
            if (reasoningContent != null && !reasoningContent.trim().isEmpty()) {
                response.setReasoningContent(reasoningContent.trim());
            }
        }
        if (currentUser.isAdmin()) {
            response.setBaseUrl(resolveRuntimeBaseUrl(provider, baseUrl));
            if (rawResponse != null) {
                response.setRawResponse(rawResponse);
            }
        }
        return response;
    }

    private ModelCompletion requestCompletionWithContinuation(
            String provider,
            String modelName,
            String baseUrl,
            String apiKey,
            Double temperature,
            Long maxTokens,
            List<JSONObject> baseMessages,
            String taskRequestId,
            boolean structuredJson,
            String runId,
            String artifactId,
            ModelCallBudget budget
    ) {
        List<JSONObject> invocationMessages = new ArrayList<>(baseMessages);
        JSONObject rawResponse = requestProviderCompletion(
                provider,
                modelName,
                baseUrl,
                apiKey,
                temperature,
                maxTokens,
                invocationMessages,
                taskRequestId,
                null,
                structuredJson,
                budget
        );
        String accumulated = normalizeReply(AiModelProviderSupport.extractReplyText(provider, rawResponse));
        AiDrivenWorkspaceService.ArtifactSnapshot artifact = artifactId == null
                ? null
                : aiDrivenWorkspaceService.saveArtifactRevision(
                runId,
                artifactId,
                "json",
                accumulated,
                "draft"
        );
        JSONObject usage = AiModelContinuationSupport.mergeUsage(null, rawResponse.get("usage"));
        String finishReason = AiModelContinuationSupport.extractFinishReason(provider, rawResponse);
        int rounds = 0;
        boolean previousRoundWasEmpty = false;

        while ("length".equals(finishReason) && rounds < AI_MODEL_CONTINUATION_MAX_ROUNDS) {
            rounds += 1;
            List<JSONObject> continuationMessages = new ArrayList<>(baseMessages);
            continuationMessages.add(buildAssistantMessage(accumulated));
            continuationMessages.add(buildUserMessage(buildContinuationPrompt(previousRoundWasEmpty)));
            rawResponse = requestProviderCompletion(
                    provider,
                    modelName,
                    baseUrl,
                    apiKey,
                    temperature,
                    growContinuationMaxTokens(maxTokens, rounds),
                    continuationMessages,
                    taskRequestId,
                    budget
            );
            String delta = normalizeReply(AiModelProviderSupport.extractReplyText(provider, rawResponse));
            usage = AiModelContinuationSupport.mergeUsage(usage, rawResponse.get("usage"));
            finishReason = AiModelContinuationSupport.extractFinishReason(provider, rawResponse);
            if (delta.isBlank()) {
                if (!"length".equals(finishReason)) {
                    throw new AppException(502, "模型续写返回空内容");
                }
                previousRoundWasEmpty = true;
                continue;
            }
            int beforeLength = accumulated.length();
            accumulated = AiModelContinuationSupport.appendWithOverlap(accumulated, delta);
            if ("length".equals(finishReason) && accumulated.length() == beforeLength) {
                throw new AppException(502, "模型续写未产生新增内容");
            }
            previousRoundWasEmpty = false;
            if (artifactId != null) {
                artifact = aiDrivenWorkspaceService.saveArtifactRevision(
                        runId,
                        artifactId,
                        "json",
                        accumulated,
                        "draft"
                );
            }
        }

        if ("length".equals(finishReason)) {
            if (previousRoundWasEmpty) {
                throw new AppException(502, "模型续写连续未返回可合并内容");
            }
            throw new AppException(502, "模型输出连续截断，自动续写已达到 3 轮上限");
        }
        if ("content_filter".equals(finishReason)) {
            if (artifactId != null) {
                aiDrivenWorkspaceService.saveArtifactRevision(
                        runId,
                        artifactId,
                        "json",
                        accumulated,
                        "blocked"
                );
            }
            throw new AppException(502, "模型输出被内容安全策略拦截");
        }
        if ("tool_calls".equals(finishReason)) {
            throw new AppException(502, "模型在初始生成阶段返回了未预期的工具调用");
        }
        if (finishReason != null && !"stop".equals(finishReason)) {
            throw new AppException(502, "模型以未知原因结束：" + finishReason);
        }
        if (rounds > 0) {
            String normalized;
            try {
                normalized = AiModelContinuationSupport.normalizeContinuedJson(accumulated);
            } catch (IllegalArgumentException e) {
                throw new AppException(
                        502,
                        buildMessageWithDetail("JSON 续写合并结果无效", e.getMessage())
                );
            }
            if (!normalized.equals(accumulated)) {
                accumulated = normalized;
                if (artifactId != null) {
                    artifact = aiDrivenWorkspaceService.saveArtifactRevision(
                            runId,
                            artifactId,
                            "json",
                            accumulated,
                            "draft"
                    );
                }
            }
        }
        return new ModelCompletion(rawResponse, accumulated, usage, finishReason, rounds, artifact);
    }

    private ArtifactRepairResult repairArtifactWithWorkspaceTools(
            String provider,
            String modelName,
            String baseUrl,
            String apiKey,
            Double temperature,
            Long maxTokens,
            String taskRequestId,
            String runId,
            AiDrivenWorkspaceService.ArtifactSnapshot initialArtifact,
            AiModelRunScene scene,
            Map<String, Object> validationContext,
            String initialIssue,
            ModelCallBudget budget
    ) {
        AiDrivenWorkspaceService.ArtifactSnapshot artifact =
                aiDrivenWorkspaceService.updateArtifactStatus(
                        runId,
                        initialArtifact.artifactId(),
                        initialArtifact.revision(),
                        "invalid"
                );
        List<JSONObject> messages = new ArrayList<>();
        messages.add(buildMessage(
                "system",
                """
                        你是 AI 任务工作区的局部修复模块。
                        当前产物已保存在服务端工作区。只能使用提供的工具读取、校验和局部修复产物。
                        有效 JSON 使用 patchArtifact；无效 JSON 使用 patchArtifactText。
                        每次写入必须使用最新 revision，禁止重新输出完整产物。
                        """
        ));
        messages.add(buildUserMessage(buildWorkspaceRepairPrompt(
                artifact,
                initialIssue,
                validationContext,
                false
        )));

        JSONArray tools = buildWorkspaceToolDefinitions(provider);
        JSONObject usage = null;
        JSONObject rawResponse = new JSONObject();
        String finishReason = null;
        int repairRounds = 0;

        for (int toolTurn = 1;
             toolTurn <= AI_MODEL_WORKSPACE_TOOL_MAX_TURNS
                     && repairRounds < AI_MODEL_RESULT_REPAIR_MAX_ATTEMPTS;
             toolTurn++) {
            budget.requireRemainingDuration();
            rawResponse = requestProviderCompletion(
                    provider,
                    modelName,
                    baseUrl,
                    apiKey,
                    temperature,
                    maxTokens,
                    messages,
                    taskRequestId,
                    tools,
                    budget
            );
            usage = AiModelContinuationSupport.mergeUsage(usage, rawResponse.get("usage"));
            finishReason = AiModelContinuationSupport.extractFinishReason(provider, rawResponse);
            List<ModelToolCall> toolCalls = extractWorkspaceToolCalls(provider, rawResponse);
            if (toolCalls.isEmpty()) {
                appendAssistantProviderMessage(provider, rawResponse, messages);
                messages.add(buildUserMessage("必须使用工作区工具完成局部修复，不能直接返回完整产物。"));
                continue;
            }

            long revisionBeforeTools = artifact.revision();
            List<ToolCallResult> results = new ArrayList<>();
            for (ModelToolCall call : toolCalls) {
                JSONObject result;
                try {
                    result = executeWorkspaceTool(
                            runId,
                            call,
                            scene,
                            validationContext
                    );
                    results.add(new ToolCallResult(call.id(), true, result));
                } catch (AppException e) {
                    JSONObject error = new JSONObject();
                    error.put("code", e.getCode());
                    error.put("message", e.getMsg());
                    results.add(new ToolCallResult(call.id(), false, error));
                } catch (RuntimeException e) {
                    JSONObject error = new JSONObject();
                    error.put("code", 500);
                    error.put("message", sanitizeErrorMessage(e.getMessage()));
                    results.add(new ToolCallResult(call.id(), false, error));
                }
            }
            appendWorkspaceToolConversation(provider, rawResponse, messages, results);
            artifact = aiDrivenWorkspaceService.readArtifact(runId, artifact.artifactId());
            if (artifact.revision() == revisionBeforeTools) {
                continue;
            }
            repairRounds += 1;

            try {
                AiModelResultSupport.validateAiModelReply(
                        scene,
                        artifact.content(),
                        validationContext
                );
                artifact = aiDrivenWorkspaceService.updateArtifactStatus(
                        runId,
                        artifact.artifactId(),
                        artifact.revision(),
                        "valid"
                );
                return new ArtifactRepairResult(
                        artifact,
                        rawResponse,
                        usage,
                        finishReason,
                        toolTurn,
                        repairRounds
                );
            } catch (RuntimeException e) {
                artifact = aiDrivenWorkspaceService.updateArtifactStatus(
                        runId,
                        artifact.artifactId(),
                        artifact.revision(),
                        "invalid"
                );
                String issue = e instanceof AppException appException
                        ? appException.getMsg()
                        : e.getMessage();
                messages.add(buildUserMessage(buildWorkspaceRepairPrompt(
                        artifact,
                        sanitizeErrorMessage(issue),
                        validationContext,
                        true
                )));
            }
        }

        throw new AppException(502, "工作区局部修复达到上限，最终结果仍未通过校验");
    }

    private String buildWorkspaceRepairPrompt(
            AiDrivenWorkspaceService.ArtifactSnapshot artifact,
            String issue,
            Map<String, Object> validationContext,
            boolean retry
    ) {
        JSONObject payload = new JSONObject();
        payload.put("artifactId", artifact.artifactId());
        payload.put("revision", artifact.revision());
        payload.put(
                "instruction",
                retry
                        ? "上一轮修复后仍未通过校验，请使用最新 revision 继续局部修复，并调用 validateArtifact。"
                        : "请先读取必要范围，再提交局部补丁并调用 validateArtifact。"
        );
        payload.put("issues", List.of(issue == null || issue.isBlank() ? "结果校验未通过" : issue));
        if (validationContext != null && !validationContext.isEmpty()) {
            payload.put("validationContext", validationContext);
        }
        return "请按以下信息修复工作区产物：\n" + JSON.toJSONString(payload);
    }

    private JSONObject executeWorkspaceTool(
            String runId,
            ModelToolCall call,
            AiModelRunScene scene,
            Map<String, Object> validationContext
    ) {
        JSONObject arguments = call.arguments();
        String artifactId = requireTrimmed(arguments.getString("artifactId"), "artifactId");
        return switch (call.name()) {
            case "readArtifact" -> readWorkspaceArtifact(runId, artifactId, arguments);
            case "patchArtifact" -> {
                long baseRevision = requirePositiveRevision(arguments);
                JSONArray rawOperations = arguments.getJSONArray("operations");
                if (rawOperations == null || rawOperations.isEmpty()) {
                    throw new AppException(400, "JSON Patch 操作不能为空");
                }
                List<AiDrivenWorkspaceService.JsonPatchOperation> operations = new ArrayList<>();
                for (Object value : rawOperations) {
                    JSONObject operation = value instanceof JSONObject object
                            ? object
                            : JSON.parseObject(JSON.toJSONString(value));
                    operations.add(new AiDrivenWorkspaceService.JsonPatchOperation(
                            operation.getString("op"),
                            operation.getString("path"),
                            operation.get("value")
                    ));
                }
                yield JSON.parseObject(JSON.toJSONString(aiDrivenWorkspaceService.applyJsonPatch(
                        runId,
                        artifactId,
                        baseRevision,
                        operations
                )));
            }
            case "patchArtifactText" -> JSON.parseObject(JSON.toJSONString(
                    aiDrivenWorkspaceService.applyTextPatch(
                            runId,
                            artifactId,
                            requirePositiveRevision(arguments),
                            arguments.getIntValue("startLine"),
                            arguments.getIntValue("endLine"),
                            arguments.getString("expectedText"),
                            arguments.getString("newText")
                    )
            ));
            case "validateArtifact" -> validateWorkspaceArtifact(
                    runId,
                    artifactId,
                    requirePositiveRevision(arguments),
                    scene,
                    validationContext
            );
            default -> throw new AppException(400, "未知工作区工具：" + call.name());
        };
    }

    private JSONObject readWorkspaceArtifact(
            String runId,
            String artifactId,
            JSONObject arguments
    ) {
        AiDrivenWorkspaceService.ArtifactSnapshot artifact =
                aiDrivenWorkspaceService.readArtifact(runId, artifactId);
        JSONObject result = new JSONObject();
        result.put("artifactId", artifact.artifactId());
        result.put("revision", artifact.revision());
        result.put("status", artifact.status());
        String pointer = trimToNull(arguments.getString("pointer"));
        if (pointer != null) {
            if (!aiDrivenWorkspaceService.validateArtifact(
                    runId,
                    artifactId,
                    artifact.revision()
            ).valid()) {
                throw new AppException(409, "当前 JSON 产物语法无效，无法按 pointer 读取");
            }
            result.put("pointer", pointer);
            result.put("value", readJsonPointer(artifact.content(), pointer));
            return result;
        }
        int startLine = arguments.getIntValue("startLine");
        int endLine = arguments.getIntValue("endLine");
        if (startLine > 0 || endLine > 0) {
            String[] lines = artifact.content().split("\\n", -1);
            int normalizedStart = startLine > 0 ? startLine : 1;
            int normalizedEnd = endLine > 0 ? endLine : Math.min(lines.length, normalizedStart + 79);
            if (normalizedEnd < normalizedStart || normalizedEnd > lines.length) {
                throw new AppException(400, "读取产物的行范围不合法");
            }
            result.put("startLine", normalizedStart);
            result.put("endLine", normalizedEnd);
            result.put(
                    "content",
                    String.join(
                            "\n",
                            java.util.Arrays.copyOfRange(lines, normalizedStart - 1, normalizedEnd)
                    )
            );
            return result;
        }
        result.put("content", artifact.content());
        return result;
    }

    private Object readJsonPointer(String content, String pointer) {
        Object value;
        try {
            value = JSON.parse(content);
        } catch (RuntimeException e) {
            throw new AppException(409, "当前 JSON 产物语法无效，无法按 pointer 读取");
        }
        if (pointer.isEmpty()) {
            return value;
        }
        if (!pointer.startsWith("/")) {
            throw new AppException(400, "JSON pointer 必须以 / 开头");
        }
        for (String rawToken : pointer.substring(1).split("/", -1)) {
            String token = rawToken.replace("~1", "/").replace("~0", "~");
            if (value instanceof JSONObject object && object.containsKey(token)) {
                value = object.get(token);
            } else if (value instanceof JSONArray array) {
                try {
                    int index = Integer.parseInt(token);
                    if (index < 0 || index >= array.size()) {
                        throw new NumberFormatException("out of range");
                    }
                    value = array.get(index);
                } catch (NumberFormatException e) {
                    throw new AppException(409, "JSON pointer 路径不存在");
                }
            } else {
                throw new AppException(409, "JSON pointer 路径不存在");
            }
        }
        return value;
    }

    private JSONObject validateWorkspaceArtifact(
            String runId,
            String artifactId,
            long baseRevision,
            AiModelRunScene scene,
            Map<String, Object> validationContext
    ) {
        AiDrivenWorkspaceService.ArtifactValidation syntax =
                aiDrivenWorkspaceService.validateArtifact(runId, artifactId, baseRevision);
        List<String> issues = new ArrayList<>(syntax.issues());
        if (issues.isEmpty()) {
            try {
                AiModelResultSupport.validateAiModelReply(
                        scene,
                        aiDrivenWorkspaceService.readArtifact(runId, artifactId).content(),
                        validationContext
                );
            } catch (RuntimeException e) {
                String issue = e instanceof AppException appException
                        ? appException.getMsg()
                        : e.getMessage();
                issues.add(sanitizeErrorMessage(issue));
            }
        }
        JSONObject result = new JSONObject();
        result.put("artifactId", artifactId);
        result.put("revision", baseRevision);
        result.put("valid", issues.isEmpty());
        result.put("issues", issues);
        return result;
    }

    private long requirePositiveRevision(JSONObject arguments) {
        Long revision = arguments.getLong("baseRevision");
        if (revision == null || revision <= 0) {
            throw new AppException(400, "baseRevision 必须为正整数");
        }
        return revision;
    }

    private JSONArray buildWorkspaceToolDefinitions(String provider) {
        List<JSONObject> definitions = List.of(
                workspaceToolDefinition(
                        "readArtifact",
                        "按逻辑产物 ID 读取完整内容、JSON Pointer 或有限行范围。",
                        """
                                {
                                  "type":"object",
                                  "properties":{
                                    "artifactId":{"type":"string"},
                                    "pointer":{"type":"string"},
                                    "startLine":{"type":"integer","minimum":1},
                                    "endLine":{"type":"integer","minimum":1}
                                  },
                                  "required":["artifactId"],
                                  "additionalProperties":false
                                }
                                """
                ),
                workspaceToolDefinition(
                        "patchArtifact",
                        "按 baseRevision 对有效 JSON 产物应用 RFC 6902 局部补丁。",
                        """
                                {
                                  "type":"object",
                                  "properties":{
                                    "artifactId":{"type":"string"},
                                    "baseRevision":{"type":"integer","minimum":1},
                                    "operations":{"type":"array","items":{"type":"object"}}
                                  },
                                  "required":["artifactId","baseRevision","operations"],
                                  "additionalProperties":false
                                }
                                """
                ),
                workspaceToolDefinition(
                        "patchArtifactText",
                        "按行范围和 expectedText 精确修复无效 JSON 或文本产物。",
                        """
                                {
                                  "type":"object",
                                  "properties":{
                                    "artifactId":{"type":"string"},
                                    "baseRevision":{"type":"integer","minimum":1},
                                    "startLine":{"type":"integer","minimum":1},
                                    "endLine":{"type":"integer","minimum":1},
                                    "expectedText":{"type":"string"},
                                    "newText":{"type":"string"}
                                  },
                                  "required":["artifactId","baseRevision","startLine","endLine","expectedText","newText"],
                                  "additionalProperties":false
                                }
                                """
                ),
                workspaceToolDefinition(
                        "validateArtifact",
                        "校验指定版本的 JSON 语法和当前任务业务规则。",
                        """
                                {
                                  "type":"object",
                                  "properties":{
                                    "artifactId":{"type":"string"},
                                    "baseRevision":{"type":"integer","minimum":1}
                                  },
                                  "required":["artifactId","baseRevision"],
                                  "additionalProperties":false
                                }
                                """
                )
        );
        boolean anthropic = "anthropic".equals(
                AiModelProviderSupport.normalizeProviderKeyForStorage(provider)
        );
        JSONArray tools = new JSONArray();
        for (JSONObject definition : definitions) {
            if (anthropic) {
                JSONObject tool = new JSONObject();
                tool.put("name", definition.getString("name"));
                tool.put("description", definition.getString("description"));
                tool.put("input_schema", definition.getJSONObject("inputSchema"));
                tools.add(tool);
            } else {
                JSONObject function = new JSONObject();
                function.put("name", definition.getString("name"));
                function.put("description", definition.getString("description"));
                function.put("parameters", definition.getJSONObject("inputSchema"));
                JSONObject tool = new JSONObject();
                tool.put("type", "function");
                tool.put("function", function);
                tools.add(tool);
            }
        }
        return tools;
    }

    private JSONObject workspaceToolDefinition(
            String name,
            String description,
            String inputSchema
    ) {
        JSONObject definition = new JSONObject();
        definition.put("name", name);
        definition.put("description", description);
        definition.put("inputSchema", JSON.parseObject(inputSchema));
        return definition;
    }

    private List<ModelToolCall> extractWorkspaceToolCalls(String provider, JSONObject rawResponse) {
        List<ModelToolCall> result = new ArrayList<>();
        boolean anthropic = "anthropic".equals(
                AiModelProviderSupport.normalizeProviderKeyForStorage(provider)
        );
        if (anthropic) {
            JSONArray content = rawResponse.getJSONArray("content");
            if (content == null) {
                return result;
            }
            for (Object value : content) {
                if (!(value instanceof JSONObject item)
                        || !"tool_use".equals(item.getString("type"))) {
                    continue;
                }
                JSONObject arguments = item.getJSONObject("input");
                result.add(new ModelToolCall(
                        item.getString("id") == null ? "tool-call-" + result.size() : item.getString("id"),
                        item.getString("name"),
                        arguments == null ? new JSONObject() : arguments
                ));
            }
            return result;
        }

        JSONArray choices = rawResponse.getJSONArray("choices");
        JSONObject message = choices == null || choices.isEmpty()
                ? null
                : choices.getJSONObject(0).getJSONObject("message");
        JSONArray toolCalls = message == null ? null : message.getJSONArray("tool_calls");
        if (toolCalls == null) {
            return result;
        }
        for (Object value : toolCalls) {
            if (!(value instanceof JSONObject item)) {
                continue;
            }
            JSONObject function = item.getJSONObject("function");
            if (function == null) {
                continue;
            }
            Object rawArguments = function.get("arguments");
            JSONObject arguments;
            try {
                arguments = rawArguments instanceof JSONObject object
                        ? object
                        : JSON.parseObject(String.valueOf(rawArguments));
            } catch (RuntimeException e) {
                arguments = new JSONObject();
            }
            result.add(new ModelToolCall(
                    item.getString("id") == null ? "tool-call-" + result.size() : item.getString("id"),
                    function.getString("name"),
                    arguments == null ? new JSONObject() : arguments
            ));
        }
        return result;
    }

    private void appendAssistantProviderMessage(
            String provider,
            JSONObject rawResponse,
            List<JSONObject> messages
    ) {
        boolean anthropic = "anthropic".equals(
                AiModelProviderSupport.normalizeProviderKeyForStorage(provider)
        );
        if (anthropic) {
            JSONObject assistant = new JSONObject();
            assistant.put("role", "assistant");
            assistant.put(
                    "content",
                    rawResponse.getJSONArray("content") == null
                            ? new JSONArray()
                            : rawResponse.getJSONArray("content")
            );
            messages.add(assistant);
            return;
        }
        JSONArray choices = rawResponse.getJSONArray("choices");
        JSONObject message = choices == null || choices.isEmpty()
                ? null
                : choices.getJSONObject(0).getJSONObject("message");
        messages.add(
                message == null
                        ? buildAssistantMessage(normalizeReply(
                        AiModelProviderSupport.extractReplyText(provider, rawResponse)
                ))
                        : JSON.parseObject(message.toJSONString())
        );
    }

    private void appendWorkspaceToolConversation(
            String provider,
            JSONObject rawResponse,
            List<JSONObject> messages,
            List<ToolCallResult> results
    ) {
        appendAssistantProviderMessage(provider, rawResponse, messages);
        boolean anthropic = "anthropic".equals(
                AiModelProviderSupport.normalizeProviderKeyForStorage(provider)
        );
        if (anthropic) {
            JSONArray content = new JSONArray();
            for (ToolCallResult result : results) {
                JSONObject payload = new JSONObject();
                payload.put("ok", result.ok());
                payload.put(result.ok() ? "result" : "error", result.payload());
                JSONObject toolResult = new JSONObject();
                toolResult.put("type", "tool_result");
                toolResult.put("tool_use_id", result.callId());
                toolResult.put("content", payload.toJSONString());
                content.add(toolResult);
            }
            JSONObject message = new JSONObject();
            message.put("role", "user");
            message.put("content", content);
            messages.add(message);
            return;
        }
        for (ToolCallResult result : results) {
            JSONObject payload = new JSONObject();
            payload.put("ok", result.ok());
            payload.put(result.ok() ? "result" : "error", result.payload());
            JSONObject message = new JSONObject();
            message.put("role", "tool");
            message.put("tool_call_id", result.callId());
            message.put("content", payload.toJSONString());
            messages.add(message);
        }
    }

    private JSONObject requestProviderCompletion(
            String provider,
            String modelName,
            String baseUrl,
            String apiKey,
            Double temperature,
            Long maxTokens,
            List<JSONObject> messages,
            String taskRequestId,
            ModelCallBudget budget
    ) {
        return requestProviderCompletion(
                provider,
                modelName,
                baseUrl,
                apiKey,
                temperature,
                maxTokens,
                messages,
                taskRequestId,
                null,
                false,
                budget
        );
    }

    private JSONObject requestProviderCompletion(
            String provider,
            String modelName,
            String baseUrl,
            String apiKey,
            Double temperature,
            Long maxTokens,
            List<JSONObject> messages,
            String taskRequestId,
            JSONArray tools,
            ModelCallBudget budget
    ) {
        return requestProviderCompletion(
                provider,
                modelName,
                baseUrl,
                apiKey,
                temperature,
                maxTokens,
                messages,
                taskRequestId,
                tools,
                false,
                budget
        );
    }

    private JSONObject requestProviderCompletion(
            String provider,
            String modelName,
            String baseUrl,
            String apiKey,
            Double temperature,
            Long maxTokens,
            List<JSONObject> messages,
            String taskRequestId,
            JSONArray tools,
            boolean structuredJson,
            ModelCallBudget budget
    ) {
        try {
            budget.beforeCall();
            AiModelProviderRequestSpec requestSpec = AiModelProviderSupport.buildProviderRequest(
                    new AiModelProviderRequestContext(
                            provider,
                            modelName,
                            baseUrl,
                            apiKey,
                            temperature,
                            maxTokens,
                            messages
                    )
            );
            if (tools != null && !tools.isEmpty()) {
                requestSpec.getBody().put("tools", tools);
                if ("anthropic".equals(AiModelProviderSupport.normalizeProviderKeyForStorage(provider))) {
                    requestSpec.getBody().put("tool_choice", Map.of("type", "auto"));
                } else {
                    requestSpec.getBody().put("tool_choice", "auto");
                }
            }
            if (structuredJson) {
                if ("anthropic".equals(AiModelProviderSupport.normalizeProviderKeyForStorage(provider))) {
                    String instruction = "必须只输出合法 JSON，不要包含 Markdown 代码块或额外解释。";
                    String existingSystem = trimToNull(requestSpec.getBody().getString("system"));
                    requestSpec.getBody().put(
                            "system",
                            existingSystem == null
                                    ? instruction
                                    : existingSystem + "\n\n" + instruction
                    );
                } else {
                    requestSpec.getBody().put(
                            "response_format",
                            Map.of("type", "json_object")
                    );
                }
            }
            JSONObject response = requestAiModelCompletion(requestSpec, taskRequestId, budget);
            budget.requireRemainingDuration();
            budget.recordUsage(response.getJSONObject("usage"));
            return response;
        } catch (IllegalArgumentException e) {
            throw new AppException(400, sanitizeErrorMessage(e.getMessage()));
        }
    }

    private String normalizeReply(String value) {
        return value == null ? "" : value;
    }

    private Long growContinuationMaxTokens(Long initial, int round) {
        if (initial == null) {
            return null;
        }
        long current = initial;
        for (int index = 0; index < round; index++) {
            long increase = Math.max(1L, (current + 9L) / 10L);
            current = current > Long.MAX_VALUE - increase ? Long.MAX_VALUE : current + increase;
        }
        return current;
    }

    private String buildContinuationPrompt(boolean afterEmptyDelta) {
        if (afterEmptyDelta) {
            return "上一轮续写没有返回任何正文。请直接输出被截断内容之后缺失的 JSON 字符，"
                    + "不要分析、解释、复述或重新开始；必须完整闭合当前 JSON。";
        }
        return """
                你的上一条回复因为长度限制被截断。
                请从上一条回复停止的位置继续输出。
                要求：
                - 只输出缺失的后续内容。
                - 不要重复已经输出过的内容。
                - 不要重新开始。
                - 不要解释。
                - 不要使用 Markdown 或代码块。
                - 如果上一条内容是 JSON，只能从截断字符处继续，补齐当前 JSON 的必需字段并完整闭合。
                - 禁止输出第二个顶层 JSON 对象或数组。
                - 禁止生成下一批内容；当前批次未完成时，应完整闭合当前 JSON，并使用当前协议的未完成标记。
                """;
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null || user.getId() == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    private AiModelDTO requireRequest(AiModelDTO aiModelDTO) {
        if (aiModelDTO == null) {
            throw new AppException(400, "请求参数错误：请求体不能为空");
        }
        return aiModelDTO;
    }

    private Long requireId(Long id) {
        if (id == null) {
            throw new AppException(400, "请求参数错误：缺少 id");
        }
        return id;
    }

    private Long parseLongId(String value, String field) {
        String trimmed = requireTrimmed(value, field);
        try {
            return Long.parseLong(trimmed);
        } catch (NumberFormatException e) {
            throw new AppException(400, buildMessageWithDetail("请求参数错误：" + field + " 不合法", e.getMessage()));
        }
    }

    private String requireTrimmed(String value, String field) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new AppException(400, "请求参数错误：" + field + " 不能为空");
        }
        return trimmed;
    }

    private Double normalizeTemperature(Double value) {
        double temperature = value == null ? 0.7D : value;
        if (Double.isFinite(temperature)) {
            return Math.max(0.0D, Math.min(2.0D, temperature));
        }
        return 0.7D;
    }

    private Long normalizeMaxTokens(Long value) {
        return value != null && value > 0 ? value : null;
    }

    private Integer normalizeSwitchFlag(Integer value, int defaultValue) {
        int current = value == null ? defaultValue : value;
        return current == 0 ? 0 : 1;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeApiKeyForStorage(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        return AiModelApiKeyCodec.encrypt(trimmed);
    }

    private String normalizeBaseUrl(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) return null;
        try {
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme();
            if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))
                    || uri.getHost() == null || uri.getPort() > 65535) {
                throw new IllegalArgumentException();
            }
            return normalized;
        } catch (IllegalArgumentException error) {
            throw new AppException(400, "请输入有效的 HTTP 或 HTTPS 接入地址");
        }
    }

    private AiModelDTO toDto(AiModelPO aiModelPO) {
        AiModelDTO dto = new AiModelDTO();
        BeanUtils.copyProperties(aiModelPO, dto);
        String provider = AiModelProviderSupport.normalizeProviderKeyForStorage(aiModelPO.getProvider());
        dto.setProvider(provider);
        dto.setProviderLabel(AiModelProviderSupport.providerDisplayName(provider));
        dto.setProviderFamily(AiModelProviderSupport.providerFamily(provider));
        dto.setHasApiKey(trimToNull(aiModelPO.getApiKey()) != null);
        dto.setApiKey("");
        return dto;
    }

    private AiModelSelectDTO toSelectDto(AiModelPO aiModelPO) {
        AiModelSelectDTO dto = new AiModelSelectDTO();
        dto.setId(aiModelPO.getId());
        dto.setName(aiModelPO.getName());
        String provider = AiModelProviderSupport.normalizeProviderKeyForStorage(aiModelPO.getProvider());
        dto.setProvider(provider);
        return dto;
    }

    private List<JSONObject> buildMessages(
            String provider,
            String systemPrompt,
            String prompt,
            List<AiDrivenAttachmentService.ModelAttachment> attachments
    ) {
        List<JSONObject> messages = new ArrayList<>();
        if (trimToNull(systemPrompt) != null) {
            messages.add(buildMessage("system", systemPrompt.trim()));
        }
        if (attachments == null || attachments.isEmpty()) {
            messages.add(buildMessage("user", prompt));
        } else {
            messages.add(buildImageUserMessage(provider, prompt, attachments));
        }
        return messages;
    }

    private JSONObject buildImageUserMessage(
            String provider,
            String prompt,
            List<AiDrivenAttachmentService.ModelAttachment> attachments
    ) {
        JSONObject message = new JSONObject();
        message.put("role", "user");
        JSONArray content = new JSONArray();
        JSONObject text = new JSONObject();
        text.put("type", "text");
        text.put("text", prompt);
        content.add(text);

        boolean anthropic = "anthropic".equals(AiModelProviderSupport.normalizeProviderKeyForStorage(provider));
        for (AiDrivenAttachmentService.ModelAttachment attachment : attachments) {
            JSONObject image = new JSONObject();
            if (anthropic) {
                image.put("type", "image");
                JSONObject source = new JSONObject();
                source.put("type", "base64");
                source.put("media_type", attachment.mimeType());
                source.put("data", attachment.base64Data());
                image.put("source", source);
            } else {
                image.put("type", "image_url");
                JSONObject imageUrl = new JSONObject();
                imageUrl.put(
                        "url",
                        "data:" + attachment.mimeType() + ";base64," + attachment.base64Data()
                );
                image.put("image_url", imageUrl);
            }
            content.add(image);
        }
        message.put("content", content);
        return message;
    }

    private JSONObject buildMessage(String role, String content) {
        JSONObject message = new JSONObject();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    private JSONObject buildAssistantMessage(String content) {
        return buildMessage("assistant", content);
    }

    private JSONObject buildUserMessage(String content) {
        return buildMessage("user", content);
    }

    private final class ModelCallBudget {
        private final String taskRequestId;
        private final String taskWorkerId;
        private final long deadlineNanos =
                System.nanoTime() + AI_MODEL_MAX_EXECUTION_DURATION.toNanos();
        private int modelCalls;
        private long totalTokens;

        private ModelCallBudget(String taskRequestId, String taskWorkerId) {
            this.taskRequestId = taskRequestId;
            this.taskWorkerId = taskWorkerId;
        }

        private void beforeCall() {
            requireRemainingDuration();
            if (modelCalls >= AI_MODEL_MAX_LOGICAL_CALLS) {
                throw new AppException(502, "达到模型调用次数上限");
            }
            modelCalls += 1;
        }

        private Duration requireRemainingDuration() {
            requireTaskRunning(taskRequestId, taskWorkerId);
            long remainingNanos = deadlineNanos - System.nanoTime();
            if (remainingNanos <= 0) {
                throw new AppException(502, "AI 模型任务执行超时");
            }
            return Duration.ofNanos(remainingNanos);
        }

        private void recordUsage(JSONObject usage) {
            if (usage == null) {
                return;
            }
            long nextTokens = positiveLong(usage.get("total_tokens"));
            if (nextTokens == 0) {
                nextTokens = saturatingAdd(
                        positiveLong(usage.get("input_tokens")),
                        positiveLong(usage.get("output_tokens"))
                );
            }
            if (nextTokens == 0) {
                nextTokens = saturatingAdd(
                        positiveLong(usage.get("prompt_tokens")),
                        positiveLong(usage.get("completion_tokens"))
                );
            }
            totalTokens = saturatingAdd(totalTokens, nextTokens);
            if (totalTokens > AI_MODEL_MAX_TOTAL_TOKENS) {
                throw new AppException(502, "达到 AI 模型任务 Token 消耗上限");
            }
        }

        private static long positiveLong(Object value) {
            if (!(value instanceof Number number)) {
                return 0L;
            }
            return Math.max(0L, number.longValue());
        }

        private static long saturatingAdd(long left, long right) {
            return left > Long.MAX_VALUE - right ? Long.MAX_VALUE : left + right;
        }
    }

    private record ModelCompletion(
            JSONObject rawResponse,
            String reply,
            JSONObject usage,
            String finishReason,
            int continuationRounds,
            AiDrivenWorkspaceService.ArtifactSnapshot artifact
    ) {
    }

    private record ModelToolCall(String id, String name, JSONObject arguments) {
    }

    private record ToolCallResult(String callId, boolean ok, JSONObject payload) {
    }

    private record ArtifactRepairResult(
            AiDrivenWorkspaceService.ArtifactSnapshot artifact,
            JSONObject rawResponse,
            JSONObject usage,
            String finishReason,
            int toolTurns,
            int repairRounds
    ) {
    }

    private JSONObject requestAiModelCompletion(
            AiModelProviderRequestSpec requestSpec,
            String taskRequestId,
            ModelCallBudget budget
    ) {
        String lastErrorDetail = "";

        for (int attempt = 1; attempt <= AI_MODEL_RUN_MAX_ATTEMPTS; attempt++) {
            Duration requestTimeout = budget.requireRemainingDuration();
            String bodyText = JSON.toJSONString(requestSpec.getBody());
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(requestSpec.getUrl()))
                    .timeout(requestTimeout.compareTo(Duration.ofSeconds(90)) < 0
                            ? requestTimeout
                            : Duration.ofSeconds(90))
                    .POST(HttpRequest.BodyPublishers.ofString(bodyText));

            for (Map.Entry<String, String> header : requestSpec.getHeaders().entrySet()) {
                requestBuilder.header(header.getKey(), header.getValue());
            }

            HttpResponse<String> response;
            CompletableFuture<HttpResponse<String>> modelCall =
                    HTTP_CLIENT.sendAsync(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
            try {
                if (taskRequestId != null) {
                    try {
                        aiDrivenTaskService.registerModelCall(
                                taskRequestId,
                                budget.taskWorkerId,
                                modelCall
                        );
                    } catch (RuntimeException e) {
                        modelCall.cancel(true);
                        throw e;
                    }
                }
                response = modelCall.get();
            } catch (CancellationException e) {
                throw new AppException(409, "AI 任务已取消");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                modelCall.cancel(true);
                throw new AppException(409, "AI 任务已取消");
            } catch (ExecutionException e) {
                Throwable cause = e.getCause();
                lastErrorDetail = sanitizeErrorMessage(
                        "aiModel.run: request failed: "
                                + (cause == null ? e.getMessage() : cause.getMessage())
                );
                log.warn(
                        "AI request failed: attempt={}, url={}, error={}",
                        attempt,
                        requestSpec.getUrl(),
                        lastErrorDetail
                );
                if (attempt < AI_MODEL_RUN_MAX_ATTEMPTS) {
                    sleepRetry(attempt, budget);
                }
                continue;
            } catch (AppException e) {
                throw e;
            } catch (Exception e) {
                lastErrorDetail = sanitizeErrorMessage("aiModel.run: request failed: " + e.getMessage());
                log.warn(
                        "AI request failed: attempt={}, url={}, error={}",
                        attempt,
                        requestSpec.getUrl(),
                        lastErrorDetail
                );
                if (attempt < AI_MODEL_RUN_MAX_ATTEMPTS) {
                    sleepRetry(attempt, budget);
                }
                continue;
            } finally {
                if (taskRequestId != null) {
                    aiDrivenTaskService.unregisterModelCall(taskRequestId, modelCall);
                }
            }

            String responseBody = response.body() == null ? "" : response.body();
            if (!isSuccessfulStatus(response.statusCode())) {
                lastErrorDetail = sanitizeErrorMessage(responseBody);
                log.warn(
                        "AI request returned non-success status: attempt={}, status={}, url={}",
                        attempt,
                        response.statusCode(),
                        requestSpec.getUrl()
                );
                if (attempt < AI_MODEL_RUN_MAX_ATTEMPTS) {
                    sleepRetry(attempt, budget);
                }
                continue;
            }

            try {
                return JSON.parseObject(responseBody);
            } catch (Exception e) {
                lastErrorDetail = sanitizeErrorMessage("aiModel.run: invalid json response: " + e.getMessage());
                log.warn(
                        "AI response parse failed: attempt={}, url={}, error={}",
                        attempt,
                        requestSpec.getUrl(),
                        lastErrorDetail
                );
                if (attempt < AI_MODEL_RUN_MAX_ATTEMPTS) {
                    sleepRetry(attempt, budget);
                }
            }
        }

        throw new AppException(502, buildMessageWithDetail("模型调用失败，已自动重试 10 次，请稍后重试", lastErrorDetail));
    }

    private boolean isSuccessfulStatus(int statusCode) {
        return statusCode >= 200 && statusCode < 300;
    }

    private void sleepRetry(
            int attempt,
            ModelCallBudget budget
    ) {
        long delayMs = Math.min(attempt * AI_MODEL_RUN_RETRY_DELAY_BASE_MS, AI_MODEL_RUN_RETRY_DELAY_MAX_MS);
        long deadline = System.currentTimeMillis() + delayMs;
        while (System.currentTimeMillis() < deadline) {
            budget.requireRemainingDuration();
            long remainingMs = deadline - System.currentTimeMillis();
            try {
                Thread.sleep(Math.min(remainingMs, 100L));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AppException(409, "AI 任务已取消");
            }
        }
    }

    private void requireTaskRunning(String taskRequestId, String taskWorkerId) {
        if (taskRequestId != null) {
            aiDrivenTaskService.requireModelWorker(taskRequestId, taskWorkerId);
        }
    }

    private String resolveRuntimeBaseUrl(String provider, String baseUrl) {
        String trimmedBaseUrl = trimToNull(baseUrl);
        if (trimmedBaseUrl != null) {
            return trimmedBaseUrl;
        }

        String defaultBaseUrl = AiModelProviderSupport.providerDefaultBaseUrl(provider);
        if (defaultBaseUrl != null && !defaultBaseUrl.isBlank()) {
            return defaultBaseUrl;
        }

        throw new AppException(400, AiModelProviderSupport.providerDisplayName(provider) + " 需要填写接入地址");
    }

    private String buildMessageWithDetail(String baseMessage, String detail) {
        String sanitizedDetail = trimToNull(detail);
        if (sanitizedDetail == null) {
            return baseMessage;
        }
        return baseMessage + "（" + sanitizedDetail + "）";
    }

    private String sanitizeErrorMessage(String message) {
        if (message == null) {
            return "";
        }
        return message.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').trim();
    }
}
