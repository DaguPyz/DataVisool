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
@TableName("system_config")
public class SystemConfigPO implements Serializable {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private String value;
    private String des;
    @TableLogic
    private Integer deleted;
    private LocalDateTime updateTime;
    private LocalDateTime createTime;
}
