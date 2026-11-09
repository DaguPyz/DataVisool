/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.zsq.datavisoolservice.model.dto.ProjectAiMemoryDTO;
import com.zsq.datavisoolservice.model.po.ProjectAiMemoryPO;

public interface ProjectAiMemoryService extends IService<ProjectAiMemoryPO> {
    ProjectAiMemoryDTO getProjectAiMemory(Long projectId);

    ProjectAiMemoryDTO saveProjectAiMemory(ProjectAiMemoryDTO dto);
}
