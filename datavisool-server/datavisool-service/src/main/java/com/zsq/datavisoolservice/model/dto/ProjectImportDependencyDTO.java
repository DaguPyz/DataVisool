/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.zsq.datavisoolcommon.model.dto.ProjectDependencyItemDTO;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 项目导入依赖项
 */
@Data
public class ProjectImportDependencyDTO implements Serializable {
    /**
     * 源项目id
     */
    private Integer id;
    /**
     * 源项目名称
     */
    private String name;
    /**
     * 服务器组件依赖
     */
    private List<ProjectDependencyItemDTO> components;
    /**
     * 动态脚本依赖
     */
    private List<ProjectDependencyItemDTO> dynamicScripts;
    /**
     * 字体依赖
     */
    private List<ProjectDependencyItemDTO> fonts;
    /**
     * 图片依赖
     */
    private List<ProjectDependencyItemDTO> images;
}
