/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("project_release")
public class ProjectReleasePO implements Serializable {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private Integer state;
    private Boolean encrypt;
    private String password;
    private String dataJson;
    private Long projectId;
    private Long userId;
    private Long groupId;
    private Integer groupMain;
    private String projectMap;
    private Integer expirationDate;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    @TableLogic
    private Integer deleted;
}
