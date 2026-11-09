/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("user_agent_config")
public class UserAgentConfigPO {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String configKey;
    private String configValue;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
