/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.ImageDTO;
import com.zsq.datavisoolservice.service.ImageService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/image")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
public class ImageController {

    @Resource
    private ImageService imageService;

    @PostMapping("/upload")
    public ApiResponse<String> uploadImage(ImageDTO imageDTO) {
        return ApiResponse.success(imageService.uploadImage(imageDTO));
    }

    @GetMapping("/getList/{projectId}")
    public ApiResponse<List<ImageDTO>> getSourceImageList(@PathVariable Long projectId) {
        return ApiResponse.success(imageService.getSourceImageList(projectId));
    }

    @GetMapping("/getUserUploadedImageList")
    public ApiResponse<List<ImageDTO>> getUserUploadedImageList() {
        return ApiResponse.success(imageService.getUserUploadImageList());
    }

    @GetMapping("/del/{id}")
    public ApiResponse<Boolean> delImageSource(@PathVariable Long id) {
        return ApiResponse.success(imageService.delImageSource(id));
    }
}
