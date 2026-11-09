/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.service.impl.ai.AiDrivenAttachmentService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/aiDriven/attachment")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
public class AiDrivenAttachmentController {
    @Resource
    private AiDrivenAttachmentService attachmentService;

    @PostMapping("/upload")
    public ApiResponse<AiDrivenAttachmentService.AttachmentReference> upload(
            @RequestBody AiDrivenAttachmentService.UploadRequest request
    ) {
        return ApiResponse.success(attachmentService.upload(request));
    }

    @PostMapping("/delete")
    public ApiResponse<Integer> delete(
            @RequestBody AiDrivenAttachmentService.DeleteRequest request
    ) {
        return ApiResponse.success(attachmentService.deleteForCurrentUser(request));
    }

    @PostMapping("/resolve")
    public ApiResponse<List<AiDrivenAttachmentService.AttachmentReference>> resolve(
            @RequestBody AiDrivenAttachmentService.ResolveRequest request
    ) {
        return ApiResponse.success(attachmentService.resolveReferencesForCurrentUser(request));
    }
}
