/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentService;
import com.zsq.datavisoolservice.service.impl.ai.AiAgentRuntimeSettingsService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/aiDriven")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
public class AiDrivenAgentController {
    @Resource
    private AiAgentService agentService;

    @Resource
    private AiAgentRuntimeSettingsService runtimeSettingsService;

    @GetMapping("/settings/get")
    public ApiResponse<AiAgentRuntimeSettingsService.RuntimeSettingsResponse> getRuntimeSettings() {
        return ApiResponse.success(runtimeSettingsService.get());
    }

    @PostMapping("/settings/save")
    public ApiResponse<AiAgentRuntimeSettingsService.RuntimeSettings> saveRuntimeSettings(@RequestBody JsonNode request) {
        return ApiResponse.success(runtimeSettingsService.save(request));
    }

    @PostMapping("/thread/create")
    public ApiResponse<AiAgentService.ThreadView> createThread(@RequestBody AiAgentService.ThreadCreateRequest request) {
        return ApiResponse.success(agentService.createThread(request));
    }

    @PostMapping("/thread/list")
    public ApiResponse<java.util.List<AiAgentService.ThreadView>> listThreads(@RequestBody ProjectRequest request) {
        return ApiResponse.success(agentService.listThreads(request == null ? null : request.projectId()));
    }

    @PostMapping("/thread/read")
    public ApiResponse<AiAgentService.ThreadView> readThread(@RequestBody ThreadRequest request) {
        return ApiResponse.success(agentService.readThread(
                request == null ? null : request.threadId(),
                request == null ? null : request.projectId()
        ));
    }

    @PostMapping("/thread/update")
    public ApiResponse<AiAgentService.ThreadView> updateThread(@RequestBody AiAgentService.ThreadUpdateRequest request) {
        return ApiResponse.success(agentService.updateThread(request));
    }

    @PostMapping("/thread/archive")
    public ApiResponse<AiAgentService.ThreadView> archiveThread(@RequestBody ThreadRequest request) {
        return ApiResponse.success(agentService.archiveThread(
                request == null ? null : request.threadId(),
                request == null ? null : request.projectId()
        ));
    }

    @PostMapping("/thread/events")
    public ApiResponse<java.util.List<AiAgentService.EventView>> threadEvents(@RequestBody AiAgentService.EventQueryRequest request) {
        return ApiResponse.success(agentService.events(request));
    }

    @PostMapping("/turn/list")
    public ApiResponse<java.util.List<AiAgentService.TurnView>> listTurns(@RequestBody ThreadRequest request) {
        return ApiResponse.success(agentService.listTurns(
                request == null ? null : request.threadId(),
                request == null ? null : request.projectId()
        ));
    }

    @PostMapping("/turn/read")
    public ApiResponse<AiAgentService.TurnView> readTurn(@RequestBody TurnRequest request) {
        return ApiResponse.success(agentService.readTurn(
                request == null ? null : request.turnId(),
                request == null ? null : request.projectId()
        ));
    }

    @PostMapping("/item/list")
    public ApiResponse<java.util.List<AiAgentService.ItemView>> listItems(@RequestBody AiAgentService.ItemListRequest request) {
        return ApiResponse.success(agentService.listItems(request));
    }

    @PostMapping("/item/read")
    public ApiResponse<AiAgentService.ItemView> readItem(@RequestBody ItemRequest request) {
        return ApiResponse.success(agentService.readItem(
                request == null ? null : request.itemId(),
                request == null ? null : request.projectId()
        ));
    }

    @PostMapping("/task/steer")
    public ApiResponse<AiAgentService.TaskView> steer(@RequestBody AiAgentService.AgentSteerRequest request) {
        return ApiResponse.success(agentService.steer(request));
    }

    @PostMapping("/task/status")
    public ApiResponse<AiAgentService.TaskView> status(@RequestBody AiAgentService.AgentStatusRequest request) {
        return ApiResponse.success(agentService.status(request));
    }

    @PostMapping("/task/events")
    public ApiResponse<java.util.List<AiAgentService.EventView>> taskEvents(@RequestBody AiAgentService.EventQueryRequest request) {
        return ApiResponse.success(agentService.events(request));
    }

    @PostMapping("/task/operation/complete")
    public ApiResponse<AiAgentService.OperationView> completeOperation(
            @RequestBody AiAgentService.FrontendOperationCompleteRequest request
    ) {
        return ApiResponse.success(agentService.completeOperation(request));
    }

    public record ProjectRequest(String projectId) {
    }

    public record ThreadRequest(String projectId, String threadId) {
    }

    public record TurnRequest(String projectId, String turnId) {
    }

    public record ItemRequest(String projectId, String itemId) {
    }

}
