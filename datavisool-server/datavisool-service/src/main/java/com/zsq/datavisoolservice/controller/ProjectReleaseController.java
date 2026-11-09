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
import com.zsq.datavisoolservice.model.dto.ProjectReleaseDTO;
import com.zsq.datavisoolservice.model.dto.ReleaseCommonApiDTO;
import com.zsq.datavisoolservice.model.dto.ReleaseDbExecutorDTO;
import com.zsq.datavisoolservice.service.ProjectReleaseService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/release")
public class ProjectReleaseController {
    @Resource
    private ProjectReleaseService projectReleaseService;

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/pageList")
    public ApiResponse<Page<ProjectReleaseDTO>> getProjectReleasePageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(projectReleaseService.getProjectReleasePageList(pageParamDTO));
    }

    @GetMapping("/getReleaseInfo/{id}")
    public ApiResponse<ProjectReleaseDTO> getReleaseInfo(@PathVariable Long id) {
        return ApiResponse.success(projectReleaseService.getProjectReleaseInfo(id));
    }

    @PostMapping("/getReleaseData")
    public ApiResponse<ProjectReleaseDTO> getProjectReleaseData(@RequestBody ProjectReleaseDTO projectReleaseDTO) {
        return ApiResponse.success(projectReleaseService.getProjectReleaseData(projectReleaseDTO));
    }

    @PostMapping("/getCommonApi")
    public ApiResponse<CommonApiDTO> getReleaseCommonApi(@RequestBody ReleaseCommonApiDTO releaseCommonApiDTO) {
        return ApiResponse.success(projectReleaseService.getReleaseCommonApi(releaseCommonApiDTO));
    }

    @PostMapping("/executeDatabase")
    public ApiResponse<Object> executeReleaseDatabase(@RequestBody ReleaseDbExecutorDTO releaseDbExecutorDTO) {
        return ApiResponse.success(projectReleaseService.executeReleaseDatabase(releaseDbExecutorDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/release")
    public ApiResponse<String> releaseProject(@RequestBody ProjectReleaseDTO projectReleaseDTO) {
        return ApiResponse.success(projectReleaseService.releaseProject(projectReleaseDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/update")
    public ApiResponse<Boolean> updateProject(@RequestBody ProjectReleaseDTO projectReleaseDTO) {
        return ApiResponse.success(projectReleaseService.updateProjectRelease(projectReleaseDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/batchDel")
    public ApiResponse<Boolean> batchDelProjectRelease(@RequestBody List<Long> ids) {
        return ApiResponse.success(projectReleaseService.batchDelProjectRelease(ids));
    }
}
