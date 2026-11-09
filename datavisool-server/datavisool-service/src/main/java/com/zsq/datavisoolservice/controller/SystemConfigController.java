/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.SystemConfigDTO;
import com.zsq.datavisoolservice.service.SystemConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/config")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
@RequiredArgsConstructor
public class SystemConfigController {

    private final SystemConfigService service;

    @PostMapping("/updateMainLogo")
    public ApiResponse<Boolean> updateMainLogo(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(service.updateMainLogo(file));
    }

    @PostMapping("/updateLogo")
    public ApiResponse<Boolean> updateLogo(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(service.updateLogo(file));
    }

    @GetMapping("/list")
    public List<SystemConfigDTO> list() {
        return service.listAll();
    }
}
