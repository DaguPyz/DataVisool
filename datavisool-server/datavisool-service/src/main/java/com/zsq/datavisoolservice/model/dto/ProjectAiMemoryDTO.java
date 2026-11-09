/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ProjectAiMemoryDTO implements Serializable {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long projectId;
    private String summary;
    private String styleTone;
    private String layoutTone;
    private String colorSystem;
    private List<String> components;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
