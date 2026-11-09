/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.po;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("remote_component_document")
public class RemoteComponentDocumentPO {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long remoteComponentId;
    private Long userId;
    private String componentType;
    private String componentVersion;
    private String packageUrl;
    private String indexJson;
    @TableLogic
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
