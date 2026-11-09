/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.CommonApiDTO;
import com.zsq.datavisoolservice.model.dto.ProjectReleaseDTO;
import com.zsq.datavisoolservice.model.dto.ReleaseCommonApiDTO;
import com.zsq.datavisoolservice.model.dto.ReleaseDbExecutorDTO;
import com.zsq.datavisoolservice.model.po.ProjectReleasePO;

import java.util.List;

public interface ProjectReleaseService extends IService<ProjectReleasePO> {
    Boolean updateProjectRelease(ProjectReleaseDTO projectReleaseDTO);

    ProjectReleaseDTO getProjectReleaseData(ProjectReleaseDTO projectReleaseDTO);

    CommonApiDTO getReleaseCommonApi(ReleaseCommonApiDTO releaseCommonApiDTO);

    Object executeReleaseDatabase(ReleaseDbExecutorDTO releaseDbExecutorDTO);

    Long createProjectRelease(ProjectReleaseDTO projectReleaseDTO);

    ProjectReleaseDTO getProjectReleaseInfo(Long id);

    ProjectReleaseDTO getLatestReleaseByProjectId(Long projectId);

    Page<ProjectReleaseDTO> getProjectReleasePageList(PageParamDTO pageParamDTO);

    String releaseProject(ProjectReleaseDTO projectReleaseDTO);

    Boolean batchDelProjectRelease(List<Long> ids);
}
