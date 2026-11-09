/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.ProjectImportParamDTO;
import com.zsq.datavisoolservice.service.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
@RequestMapping("/api/import")
@RequiredArgsConstructor
public class ImportController {

    private final ProjectService projectService;

    @PostMapping("/importProject")
    public ApiResponse<Boolean> importProject(ProjectImportParamDTO importParam) throws IOException {
        Boolean imported = projectService.importProject(importParam);
        return importParam != null && importParam.getImportNotice() != null
                ? ApiResponse.success(importParam.getImportNotice(), imported)
                : ApiResponse.success(imported);
    }

}
