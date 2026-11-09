/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class PageParamDTO implements Serializable {
    private Long size;
    private Long current;
    private String searchValue;
}
