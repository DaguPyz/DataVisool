/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolservice.model.dto.TemplateDTO;
import com.zsq.datavisoolservice.model.po.TemplatePO;
import com.zsq.datavisoolservice.service.TemplateService;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/template")
public class TemplateController {
    @Resource
    private TemplateService templateService;

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/create")
    public ApiResponse<Long> createTemplate(TemplateDTO templateDTO) {
        return ApiResponse.success(templateService.createTemplate(templateDTO));
    }

    @GetMapping("/getTemplate/{id}")
    public ApiResponse<TemplatePO> getTemplateById(@PathVariable Long id) {
        return ApiResponse.success(templateService.getTemplateById(id));
    }

    @PostMapping("/getAllTemplate")
    public ApiResponse<List<TemplatePO>> getAllTemplate(@RequestBody TemplatePO condition) {
        return ApiResponse.success(templateService.getAllTemplate(condition));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/batchDel")
    public ApiResponse<Boolean> batchDelTemplate(@RequestBody List<Long> ids) {
        return ApiResponse.success(templateService.batchDelTemplate(ids));
    }
}
