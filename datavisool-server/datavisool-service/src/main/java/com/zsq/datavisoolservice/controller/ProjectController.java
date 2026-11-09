/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectDTO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.service.ProjectService;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/project")
public class ProjectController {
    @Resource
    private ProjectService projectService;

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/pageList")
    public ApiResponse<Page<ProjectDTO>> getProjectPageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(projectService.getProjectPageList(pageParamDTO));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/getProjectData/{id}")
    public ApiResponse<ProjectDTO> getProjectData(@PathVariable(name = "id") Long id) {
        return ApiResponse.success(projectService.getProjectData(id));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/getProjectInfo/{id}")
    public ApiResponse<ProjectDTO> getProjectInfo(@PathVariable(name = "id") Long id) {
        return ApiResponse.success(projectService.getProjectInfo(id));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/update")
    public ApiResponse<Boolean> updateProject(@RequestBody ProjectPO projectPo) {
        return ApiResponse.success(projectService.updateProject(projectPo));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/create")
    public ApiResponse<String> createProject(@RequestBody ProjectPO projectPo) {
        return ApiResponse.success(projectService.createProject(projectPo).toString());
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/del/{id}")
    public ApiResponse<Boolean> deleteProject(@PathVariable(name = "id") Long id) {
        return ApiResponse.success(projectService.deleteProject(id));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/copy/{id}")
    public ApiResponse<String> copyProject(@PathVariable(name = "id") Long id) {
        return ApiResponse.success(projectService.copyProject(id).toString());
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/cover")
    public ApiResponse<String> uploadCover(ProjectPO projectPo) {
        return ApiResponse.success(projectService.uploadCover(projectPo));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/quickSearch")
    public ApiResponse<List<ProjectDTO>> quickSearch(Long current, Long exclude, String search) {
        return ApiResponse.success(projectService.quickSearchTopTen(current, exclude, search));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @GetMapping("/getSubProjectList/{id}")
    public ApiResponse<List<ProjectDTO>> getSubProjectList(@PathVariable Long id) {
        return ApiResponse.success(projectService.getSubProjectList(id));
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/createSubProject")
    public ApiResponse<String> createSubProject(@RequestBody ProjectDTO dto) {
        return ApiResponse.success(projectService.createSubProject(dto).toString());
    }

    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/deleteSubProject/{pid}/{subId}")
    public ApiResponse<Boolean> deleteSubProject(@PathVariable Long pid, @PathVariable Long subId) {
        return ApiResponse.success(projectService.deleteSubProject(pid, subId));
    }
}
