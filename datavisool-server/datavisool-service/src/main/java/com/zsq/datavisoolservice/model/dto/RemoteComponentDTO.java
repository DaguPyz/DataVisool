/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RemoteComponentDTO {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long id;
    private String componentName;
    private String url;
    private MultipartFile componentFile;
    private Map<String, Object> documentInfo;
}
