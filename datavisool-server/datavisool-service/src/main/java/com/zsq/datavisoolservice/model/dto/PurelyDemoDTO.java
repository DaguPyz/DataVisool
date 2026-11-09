/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 导出纯演示部署文件DTO
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PurelyDemoDTO implements Serializable {
    private Long projectId;
    private List<String> imageUrls;
    private String name;
    private List<String> remoteComponentIds;
    private String projectData;
}
