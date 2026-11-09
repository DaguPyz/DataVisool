/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.RemoteComponentDTO;
import com.zsq.datavisoolservice.service.RemoteComponentService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/remote/component")
public class RemoteComponentController {

    @Resource
    private RemoteComponentService remoteComponentService;


    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/upload")
    public ApiResponse<Boolean> uploadComponent(RemoteComponentDTO remoteComponentDTO) {
        return ApiResponse.success(remoteComponentService.uploadComponent(remoteComponentDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/list")
    public ApiResponse<List<RemoteComponentDTO>> getAllComponent() {
        return ApiResponse.success(remoteComponentService.getAllRemoteComponent());
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/pageList")
    public ApiResponse<Page<RemoteComponentDTO>> getPageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(remoteComponentService.getPageList(pageParamDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/update")
    public ApiResponse<Boolean> updateRemoteComponent(@RequestBody RemoteComponentDTO remoteComponentDTO) {
        return ApiResponse.success(remoteComponentService.updateRemoteComponent(remoteComponentDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/batchDel")
    public ApiResponse<Boolean> batchDelRemoteComponent(@RequestBody List<Long> ids) {
        return ApiResponse.success(remoteComponentService.batchDelRemoteComponent(ids));
    }
}
