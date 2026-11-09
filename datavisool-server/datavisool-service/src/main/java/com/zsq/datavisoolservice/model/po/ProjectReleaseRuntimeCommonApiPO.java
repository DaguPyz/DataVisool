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
@TableName("project_release_runtime_common_api")
public class ProjectReleaseRuntimeCommonApiPO implements Serializable {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long releaseId;
    private Long commonApiId;
    private String name;
    private String url;
    private String method;
    private String params;
    private String headers;
    private String sourcePath;
    private LocalDateTime createTime;
}
