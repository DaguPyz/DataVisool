/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("web_update_skip")
public class WebUpdateSkipPO {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String productCode;
    private String skippedVersion;
    private Long skippedBy;
    private LocalDateTime skippedAt;
}
