/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_turn")
public class AiAgentTurnPO implements Serializable {
    @TableId
    private String turnId;
    private String threadId;
    private String requestId;
    private String inputText;
    private String inputAttachments;
    private String contextJson;
    private String status;
    private Integer steerVersion;
    private Long createdAt;
    private Long startedAt;
    private Long endedAt;
}
