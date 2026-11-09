/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_thread")
public class AiAgentThreadPO implements Serializable {
    @TableId
    private String threadId;
    private String projectId;
    private String userId;
    private String title;
    private String status;
    private String currentTurnId;
    private Long eventSequenceNo;
    private Long createdAt;
    private Long updatedAt;
}
