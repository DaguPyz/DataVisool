/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSONObject;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiModelProviderRequestContext implements Serializable {
    private String provider;
    private String modelName;
    private String baseUrl;
    private String apiKey;
    private Double temperature;
    private Long maxTokens;
    private List<JSONObject> messages;
}
