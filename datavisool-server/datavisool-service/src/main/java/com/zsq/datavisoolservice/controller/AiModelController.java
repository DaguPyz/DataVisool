/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.AiModelDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunRequestDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunResponseDTO;
import com.zsq.datavisoolservice.model.dto.AiModelSelectDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.service.AiModelService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/aiModel")
public class AiModelController {
    @Resource
    private AiModelService aiModelService;

    @PostMapping("/pageList")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Page<AiModelDTO>> getAiModelPageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(aiModelService.getAiModelPageList(pageParamDTO));
    }

    @GetMapping({"/list", "/configuredList"})
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<List<AiModelSelectDTO>> getAiModelList() {
        return ApiResponse.success(aiModelService.getAiModelList());
    }

    @PostMapping("/create")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Long> createAiModel(@RequestBody AiModelDTO aiModelDTO) {
        return ApiResponse.success(aiModelService.addAiModel(aiModelDTO));
    }

    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateAiModel(@RequestBody AiModelDTO aiModelDTO) {
        return ApiResponse.success(aiModelService.updateAiModel(aiModelDTO));
    }

    @PostMapping("/batchDel")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> batchDelAiModel(@RequestBody List<Long> ids) {
        return ApiResponse.success(aiModelService.batchDelAiModel(ids));
    }

    @PostMapping("/run")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<AiModelRunResponseDTO> run(@RequestBody AiModelRunRequestDTO requestDTO) {
        return ApiResponse.success(aiModelService.run(requestDTO));
    }
}
