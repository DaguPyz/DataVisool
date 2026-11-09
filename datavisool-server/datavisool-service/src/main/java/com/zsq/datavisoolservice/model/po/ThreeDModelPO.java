/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("three_d_model")
public class ThreeDModelPO implements Serializable {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String name;
    
    private String url;
    
    private Long size;
    
    private String type;
    
    private Long userId;
    
    /**
     * 是否为压缩包解压 0:否 1:是
     */
    private Integer isCompressed;
    
    private LocalDateTime createTime;
    
    private LocalDateTime updateTime;
    
    @TableLogic
    private Integer deleted;
}
