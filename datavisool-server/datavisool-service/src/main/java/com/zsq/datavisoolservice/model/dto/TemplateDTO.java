/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.io.Serializable;

@Data
public class TemplateDTO implements Serializable {
    private Long id;
    private String name;
    private String description;
    private Long userId;
    private MultipartFile coverFile;
    private String templateJson;
}
