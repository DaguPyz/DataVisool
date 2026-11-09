/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_pending_input")
public class AiAgentPendingInputPO implements Serializable {
    @TableId
    private String inputId;
    private String threadId;
    private String turnId;
    private String runId;
    private String promptJson;
    private String status;
    private String answerJson;
    private Long createdAt;
    private Long updatedAt;
}
