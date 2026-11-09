/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.DynamicScriptDTO;
import com.zsq.datavisoolservice.model.dto.DynamicScriptPageParamDTO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import com.zsq.datavisoolservice.service.DynamicScriptService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/dynamicScript")
public class DynamicScriptController {
    @Resource
    private DynamicScriptService dynamicScriptService;

    @PostMapping("/pageList")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Page<DynamicScriptDTO>> getDynamicScriptPageList(@RequestBody DynamicScriptPageParamDTO pageParamDTO) {
        return ApiResponse.success(dynamicScriptService.getDynamicScriptPageList(pageParamDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/list")
    public ApiResponse<List<DynamicScriptPO>> getAllDynamicScript(Long projectId) {
        return ApiResponse.success(dynamicScriptService.getAllDynamicScript(projectId));
    }


    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/getDynamicScript/{id}")
    public ApiResponse<DynamicScriptDTO> getDynamicScript(@PathVariable(name = "id") Long id) {
        DynamicScriptDTO DynamicScript = dynamicScriptService.getDynamicScript(id);
        return ApiResponse.success(DynamicScript);
    }

    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateDynamicScript(@RequestBody DynamicScriptDTO script) {
        return ApiResponse.success(dynamicScriptService.updateDynamicScript(script));
    }

    @PostMapping("/saveOrUpdate")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> saveOrUpdate(DynamicScriptDTO script) {
        return ApiResponse.success(dynamicScriptService.saveOrUpdate(script));
    }

    @PostMapping("/batchDel")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> batchDelDynamicScript(@RequestBody List<Long> ids) {
        return ApiResponse.success(dynamicScriptService.batchDelDynamicScript(ids));
    }

    @GetMapping("/quickSearch")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<List<DynamicScriptDTO>> quickSearch(String search) {
        return ApiResponse.success(dynamicScriptService.quickSearchTopTen(search));
    }

}
