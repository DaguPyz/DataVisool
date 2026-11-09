/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.dto.ProjectDependenciesDTO;
import com.zsq.datavisoolservice.model.dto.*;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.util.List;

public interface ProjectService {
    Boolean updateProject(ProjectPO projectPo);

    ProjectDTO getProjectData(Long id);

    Long createProject(ProjectPO projectPo);

    Boolean deleteProject(Long id);

    Long copyProject(Long id);

    ProjectDTO getProjectInfo(Long id);

    String uploadCover(ProjectPO projectPo);

    Page<ProjectDTO> getProjectPageList(PageParamDTO pageParamDTO);

    List<ProjectPO> getExpiredData();

    List<ProjectDTO> quickSearchTopTen(Long current, Long exclude, String search);

    ResponseEntity<StreamingResponseBody> exportProject(ProjectDependencyParamDTO dependency) throws Exception;

    Boolean importProject(ProjectImportParamDTO importParam) throws IOException;

    ProjectDependenciesDTO calculateProjectDependency(ProjectDependencyParamDTO dependency);

    List<ProjectDTO> getSubProjectList(Long id);

    Long createSubProject(ProjectDTO dto);

    Boolean deleteSubProject(Long pid, Long subId);
}
