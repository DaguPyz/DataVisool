/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("project")
public class ProjectPO implements Serializable {
    @TableId(type = IdType.ASSIGN_ID)
    private Long id;
    private String name;
    private String des;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    @TableLogic
    private Integer deleted;
    private String dataJson;
    private String cover;
    private Long userId;
    private Long pid;
    @TableField(exist = false)
    private MultipartFile file;
}
