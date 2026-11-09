/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.zsq.datavisoolservice.constants.ScriptEnum;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import lombok.Data;
import org.springframework.beans.BeanUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DynamicScriptDTO implements Serializable {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long id;
    private String name;
    private String url;
    private ScriptEnum type;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long projectId;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime updateTime;
    private MultipartFile scriptFile;

    public DynamicScriptPO toPO() {
        DynamicScriptPO dynamicScriptPO = new DynamicScriptPO();
        BeanUtils.copyProperties(this, dynamicScriptPO);
        return dynamicScriptPO;
    }
}
