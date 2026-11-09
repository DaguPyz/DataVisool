/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_operation")
public class AiAgentOperationPO implements Serializable {
    @TableId
    private String operationId;
    private String projectId;
    private String threadId;
    private String turnId;
    private String runId;
    private String operationType;
    private String status;
    private String requestJson;
    private String resultJson;
    private String baseRevision;
    private String resultRevision;
    private Long createdAt;
    private Long updatedAt;
}
