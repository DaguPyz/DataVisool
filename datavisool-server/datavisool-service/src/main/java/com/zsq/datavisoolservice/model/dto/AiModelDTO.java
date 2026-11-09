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

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AiModelDTO implements Serializable {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long id;
    private String name;
    private String provider;
    private String providerLabel;
    private String providerFamily;
    private String baseUrl;
    private String apiKey;
    private Boolean hasApiKey;
    private Integer clearApiKey;
    private String description;
    private Double temperature;
    private Long maxTokens;
    private Integer enabled;
    private Integer isDefault;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
