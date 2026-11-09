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
@TableName("project_ai_memory")
public class ProjectAiMemoryPO implements Serializable {
    @TableId(value = "project_id", type = IdType.INPUT)
    private Long projectId;
    private String summary;
    private String styleTone;
    private String layoutTone;
    private String colorSystem;
    private String components;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
