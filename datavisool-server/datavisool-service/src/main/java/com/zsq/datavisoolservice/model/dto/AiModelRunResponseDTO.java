/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AiModelRunResponseDTO implements Serializable {
    private String modelId;
    private String modelName;
    private String provider;
    private String baseUrl;
    private String prompt;
    private String reply;
    private String reasoningContent;
    private Object usage;
    private String finishReason;
    private Object continuation;
    private String artifactId;
    private Long artifactRevision;
    private Object rawResponse;
}
