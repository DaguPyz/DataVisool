/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * @author puyinzhen
 * 项目依赖请求参数
 */
@Data
public class ProjectDependencyParamDTO implements Serializable {
    private Long id; // 项目id
    private String name; // 项目名称
    private String projectJson; // 项目json数据
    private List<String> images; // 项目所使用的图片列表
    private List<String> fonts; // 项目所使用的字体列表
    private List<String> videos; // 项目所使用的视频列表
    private List<String> models; // 项目所使用的模型列表
    private List<String> components; // 项目所使用的远程组件列表
    private List<String> commonApiIds; // 项目所使用的公共API id列表
    private List<String> databaseIds; // 项目所使用的数据库 id列表
    private List<ExportProjectNodeDTO> projects; // 项目图导出节点
    private String secretMode; // 项目包加密模式
    private String secretPassphrase; // 敏感数据导出口令
}
