/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolcommon.model.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 项目导入/导出以此数据结构为准
 */
@Data
public class ProjectDependenciesDTO implements Serializable {
    private Long id;
    private String name;
    private String desc;
    private String version;
    private String projectJson;
    private List<ProjectDependencyItemDTO> images; // 项目所使用的图片列表
    private List<ProjectDependencyItemDTO> scripts; // 项目所使用的脚本列表
    private List<ProjectDependencyItemDTO> fonts; // 项目所使用的字体列表
    private List<ProjectDependencyItemDTO> components; // 项目所使用的远程组件列表
    private List<ProjectDependencyItemDTO> dynamicScripts; // 项目所使用的动态脚本列表
}
