/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.AuthRoleDTO;
import com.zsq.datavisoolservice.service.RoleService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/role")
public class RoleController {
    @Resource
    private RoleService roleService;

    @GetMapping("/quickSearch")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
    public ApiResponse<List<AuthRoleDTO>> quickSearch(String keywords) {
        return ApiResponse.success(roleService.getRoleTopTen(keywords));
    }

    @PostMapping("/listByIds")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
    public ApiResponse<List<AuthRoleDTO>> getRole(@RequestBody List<Long> ids) {
        return ApiResponse.success(roleService.getRole(ids));
    }

}
