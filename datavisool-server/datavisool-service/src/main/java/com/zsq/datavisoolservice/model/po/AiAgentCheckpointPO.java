/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_checkpoint")
public class AiAgentCheckpointPO implements Serializable {
    @TableId
    private String checkpointId;
    private String runId;
    private String stateJson;
    private Long revision;
    private String status;
    private Long createdAt;
}
