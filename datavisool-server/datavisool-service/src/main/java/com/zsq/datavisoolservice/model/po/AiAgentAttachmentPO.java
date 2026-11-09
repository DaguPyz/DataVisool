/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

@Data
@TableName("ai_agent_attachment")
public class AiAgentAttachmentPO implements Serializable {
    @TableId
    private String attachmentId;
    private String threadId;
    private String turnId;
    private String contentJson;
    private Long createdAt;
}
