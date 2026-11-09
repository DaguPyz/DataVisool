/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenTaskService;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/aiDriven/task")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
public class AiDrivenTaskController {
    @Resource
    private AiDrivenTaskService taskService;

    @Resource
    private AiAgentService agentService;

    @Resource
    private ObjectMapper objectMapper;

    @PostMapping("/submit")
    public ApiResponse<?> submit(
            @RequestBody JsonNode request
    ) {
        if (request != null && (request.has("threadId") || request.has("inputText"))) {
            return ApiResponse.success(agentService.submit(objectMapper.convertValue(
                    request,
                    AiAgentService.AgentSubmitRequest.class
            )));
        }
        return ApiResponse.success(taskService.submit(objectMapper.convertValue(
                request,
                AiDrivenTaskService.TaskSubmitRequest.class
        )));
    }

    @PostMapping("/progress")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> progress(
            @RequestBody AiDrivenTaskService.ProgressRequest request
    ) {
        return ApiResponse.success(taskService.progress(request));
    }

    @PostMapping("/resume")
    public ApiResponse<AiAgentService.TaskView> resume(@RequestBody AiAgentService.AgentResumeRequest request) {
        return ApiResponse.success(agentService.resume(request));
    }

    @PostMapping("/diagnose")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> diagnose(
            @RequestBody AiDrivenTaskService.DiagnosticRequest request
    ) {
        return ApiResponse.success(taskService.diagnose(request));
    }

    @PostMapping("/complete")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> complete(
            @RequestBody AiDrivenTaskService.TaskCompleteRequest request
    ) {
        return ApiResponse.success(taskService.complete(request));
    }

    @PostMapping("/cancel")
    public ApiResponse<?> cancel(
            @RequestBody JsonNode request
    ) {
        if (request != null && (request.has("runId") || request.has("turnId"))) {
            String runId = request.hasNonNull("runId")
                    ? request.get("runId").asText()
                    : request.get("turnId").asText();
            return ApiResponse.success(agentService.cancel(new AiAgentService.AgentCancelRequest(
                    text(request, "projectId"),
                    text(request, "threadId"),
                    text(request, "turnId"),
                    runId
            )));
        }
        return ApiResponse.success(taskService.cancel(objectMapper.convertValue(
                request,
                AiDrivenTaskService.TaskCancelRequest.class
        )));
    }

    @PostMapping("/heartbeat")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> heartbeat(
            @RequestBody AiDrivenTaskService.TaskHeartbeatRequest request
    ) {
        return ApiResponse.success(taskService.heartbeat(request));
    }

    @PostMapping("/worker/claim")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> claimWorker(
            @RequestBody AiDrivenTaskService.TaskWorkerClaimRequest request
    ) {
        return ApiResponse.success(taskService.claimWorker(request));
    }

    @PostMapping("/worker/checkpoint")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> checkpoint(
            @RequestBody AiDrivenTaskService.TaskCheckpointRequest request
    ) {
        return ApiResponse.success(taskService.checkpoint(request));
    }

    @PostMapping("/worker/release")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> releaseWorker(
            @RequestBody AiDrivenTaskService.TaskWorkerReleaseRequest request
    ) {
        return ApiResponse.success(taskService.releaseWorker(request));
    }

    @PostMapping("/draft/decision")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> decideDraft(
            @RequestBody AiDrivenTaskService.TaskDraftDecisionRequest request
    ) {
        return ApiResponse.success(taskService.decideDraft(request));
    }

    @PostMapping("/attachments")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> registerAttachments(
            @RequestBody AiDrivenTaskService.TaskAttachmentRegisterRequest request
    ) {
        return ApiResponse.success(taskService.registerAttachments(request));
    }

    @GetMapping("/snapshot/{requestId}")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> snapshot(@PathVariable String requestId) {
        return ApiResponse.success(taskService.snapshot(requestId));
    }

    @GetMapping("/latest")
    public ApiResponse<AiDrivenTaskService.TaskSnapshot> latest(
            @RequestParam String projectId,
            @RequestParam String sessionId
    ) {
        return ApiResponse.success(taskService.latest(projectId, sessionId));
    }

    private String text(JsonNode request, String field) {
        JsonNode value = request == null ? null : request.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
