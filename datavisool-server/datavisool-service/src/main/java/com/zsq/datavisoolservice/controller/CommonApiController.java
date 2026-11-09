/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.CommonApiDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.service.CommonApiService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/commonApi")
public class CommonApiController {
    @Resource
    private CommonApiService commonApiService;

    @PostMapping("/pageList")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Page<CommonApiDTO>> getCommonApiPageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(commonApiService.getCommonApiPageList(pageParamDTO));
    }

    @GetMapping("/getCommonApi/{id}")
    public ApiResponse<CommonApiDTO> getCommonApi(@PathVariable(name = "id") Long id) {
        CommonApiDTO commonApi = commonApiService.getCommonApi(id);
        return ApiResponse.success(commonApi);
    }

    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateCommonApi(@RequestBody CommonApiDTO api) {
        return ApiResponse.success(commonApiService.updateCommonApi(api));
    }

    @PostMapping("/create")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Long> createCommonApi(@RequestBody CommonApiDTO api) {
        return ApiResponse.success(commonApiService.addCommonApi(api));
    }

    @PostMapping("/batchDel")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> batchDelCommonApi(@RequestBody List<Long> ids) {
        return ApiResponse.success(commonApiService.batchDelCommonApi(ids));
    }

    @GetMapping("/copy/{id}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> copyCommonApi(@PathVariable Long id) {
        return ApiResponse.success(commonApiService.copyCommonApi(id));
    }


    @GetMapping("/quickSearch")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<List<CommonApiDTO>> quickSearch(String search) {
        return ApiResponse.success(commonApiService.quickSearchTopTen(search));
    }


}
