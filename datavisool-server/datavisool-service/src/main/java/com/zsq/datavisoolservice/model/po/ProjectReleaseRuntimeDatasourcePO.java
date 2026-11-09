/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("project_release_runtime_datasource")
public class ProjectReleaseRuntimeDatasourcePO implements Serializable {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long releaseId;
    private String runtimeDataSourceId;
    private Long targetDb;
    private String sqlTemplate;
    private String variableKeys;
    private String sourcePath;
    private LocalDateTime createTime;
}
