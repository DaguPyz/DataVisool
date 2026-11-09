/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolcommon.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * @author yinzhenpu
 * @date 2025/6/18 07:49:15
 * @description 项目依赖项（用于项目导出时各类资源项目的引用）
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ProjectDependencyItemDTO implements Serializable {
    /**
     * 依赖名称
     */
    String name;
    /**
     * 依赖值
     */
    String value;
}
