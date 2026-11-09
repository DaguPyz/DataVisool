/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_item")
public class AiAgentItemPO implements Serializable {
    @TableId
    private String itemId;
    private String threadId;
    private String turnId;
    private String itemType;
    private String contentJson;
    private Long sequenceNo;
    private Long createdAt;
}
