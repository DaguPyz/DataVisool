/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.FontDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.service.FontService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/font")
public class FontController {
    @Resource
    private FontService fontService;

    @PostMapping("/pageList")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Page<FontDTO>> getFontPageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(fontService.getFontPageList(pageParamDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/list")
    public ApiResponse<List<FontDTO>> getAllFont() {
        return ApiResponse.success(fontService.getAllFont());
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/getFont/{id}")
    public ApiResponse<FontDTO> getFont(@PathVariable(name = "id") Long id) {
        FontDTO Font = fontService.getFont(id);
        return ApiResponse.success(Font);
    }

    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateFont(@RequestBody FontDTO font) {
        return ApiResponse.success(fontService.updateFont(font));
    }

    @PostMapping("/batchDel")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> batchDelFont(@RequestBody List<Long> ids) {
        return ApiResponse.success(fontService.batchDelFont(ids));
    }

    @GetMapping("/quickSearch")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<List<FontDTO>> quickSearch(String search) {
        return ApiResponse.success(fontService.quickSearchTopTen(search));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/upload")
    public ApiResponse<Boolean> uploadFont(@RequestParam("fontFile") List<MultipartFile> fontFiles,
                                           @RequestParam(value = "id", required = false) Long id) {
        return ApiResponse.success(fontService.uploadFont(id, fontFiles));
    }

}
