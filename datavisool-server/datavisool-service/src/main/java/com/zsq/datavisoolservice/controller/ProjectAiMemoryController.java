/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.ProjectAiMemoryDTO;
import com.zsq.datavisoolservice.service.ProjectAiMemoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/projectAiMemory")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
@RequiredArgsConstructor
public class ProjectAiMemoryController {
    private final ProjectAiMemoryService projectAiMemoryService;

    @GetMapping("/get/{projectId}")
    public ApiResponse<ProjectAiMemoryDTO> getProjectAiMemory(@PathVariable Long projectId) {
        return ApiResponse.success(projectAiMemoryService.getProjectAiMemory(projectId));
    }

    @PostMapping("/save")
    public ApiResponse<ProjectAiMemoryDTO> saveProjectAiMemory(@RequestBody ProjectAiMemoryDTO dto) {
        return ApiResponse.success(projectAiMemoryService.saveProjectAiMemory(dto));
    }
}
