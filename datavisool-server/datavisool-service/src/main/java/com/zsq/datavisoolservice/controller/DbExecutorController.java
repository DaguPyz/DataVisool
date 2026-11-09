/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.DbExecutorDTO;
import com.zsq.datavisoolservice.service.DbExecutorService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/db/executor")
public class DbExecutorController {

    @Resource
    private DbExecutorService dbExecutorService;

    @PostMapping("/execute")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Object> executeSql(@RequestBody DbExecutorDTO dbExecutorDTO) {
        return ApiResponse.success(dbExecutorService.executeSql(dbExecutorDTO));
    }

}
