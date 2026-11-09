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
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ReleaseDbExecutorDTO implements Serializable {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long releaseId;
    private String runtimeDataSourceId;
    private Map<String, Object> variables;
    private EncryptResultDTO password;
}
