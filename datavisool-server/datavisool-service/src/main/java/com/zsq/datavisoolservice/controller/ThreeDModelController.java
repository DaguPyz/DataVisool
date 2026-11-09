/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.ThreeDModelDTO;
import com.zsq.datavisoolservice.model.dto.ThreeDModelPageParamDTO;
import com.zsq.datavisoolservice.service.ThreeDModelService;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/model")
@RequiredArgsConstructor
public class ThreeDModelController {

    private final ThreeDModelService threeDModelService;

    /**
     * 批量上传模型
     */
    @PostMapping("/upload")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<List<ThreeDModelDTO>> batchUpload(@RequestParam("files") List<MultipartFile> files,
                                                        @RequestParam(value = "id", required = false) Long id) {
        return ApiResponse.success(id == null ? threeDModelService.batchUpload(files)
                : List.of(threeDModelService.replaceModel(id, files)));
    }

    /**
     * 更新模型信息
     */
    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateModel(@RequestBody ThreeDModelDTO dto) {
        return ApiResponse.success(threeDModelService.updateModel(dto));
    }

    /**
     * 获取模型详情
     */
    @GetMapping("/get/{id}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<ThreeDModelDTO> getModel(@PathVariable("id") Long id) {
        return ApiResponse.success(threeDModelService.getModel(id));
    }

    /**
     * 分页查询模型
     */
    @PostMapping("/page")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Page<ThreeDModelDTO>> getModelPage(@RequestBody ThreeDModelPageParamDTO pageParam) {
        return ApiResponse.success(threeDModelService.getModelPage(pageParam));
    }

    /**
     * 批量删除模型
     */
    @PostMapping("/batchDelete")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> batchDelete(@RequestBody List<Long> ids) {
        return ApiResponse.success(threeDModelService.batchDelete(ids));
    }
}
