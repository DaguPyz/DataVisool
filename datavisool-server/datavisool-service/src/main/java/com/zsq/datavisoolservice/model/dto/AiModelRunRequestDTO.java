/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

@Data
public class AiModelRunRequestDTO implements Serializable {
    private String modelId;
    private String runtimeModelId;
    private String prompt;
    private String systemPrompt;
    private Long maxTokens;
    private String scene;
    private List<String> attachmentIds;
    private Map<String, Object> validationContext;
    private String taskRequestId;
    private String taskWorkerId;
}
