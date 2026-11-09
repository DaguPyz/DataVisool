/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.zsq.datavisoolservice.constants.ReleaseTypeEnum;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ProjectReleaseDTO implements Serializable {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long id;
    private String name;
    private Integer state;
    private Boolean encrypt;
    private EncryptResultDTO password;
    private String dataJson;
    private ReleaseTypeEnum releaseType;
    private List<ProjectDependencyParamDTO> dependencies;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long projectId;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long userId;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long groupId;
    private Integer groupMain;
    private Integer expirationDate;
    private String createTime;
    private String updateTime;
}
