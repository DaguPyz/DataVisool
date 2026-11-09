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
@TableName("image")
public class ImagePO implements Serializable {
    @TableId(type = IdType.AUTO)
    private Long id;
    /**
     * 图片路径，数据库仅存储路径片段，完整路径需要读取数据库片段后结合配置完整拼接后得出
     */
    private String url;
    private String name;
    private Long userId;
    private LocalDateTime createTime;
    @TableLogic
    private Integer deleted;
    private String hash;
}
