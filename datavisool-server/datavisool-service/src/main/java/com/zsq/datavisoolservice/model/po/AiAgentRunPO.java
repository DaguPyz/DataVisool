/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_run")
public class AiAgentRunPO implements Serializable {
    @TableId
    private String runId;
    private String turnId;
    private String status;
    private Integer cancelRequested;
    private Integer consumedSteerVersion;
    private String workerId;
    private Long leaseExpiresAt;
    private String checkpointId;
    private String limitsJson;
    private String usageJson;
    private Long createdAt;
    private Long startedAt;
    private Long endedAt;
}
