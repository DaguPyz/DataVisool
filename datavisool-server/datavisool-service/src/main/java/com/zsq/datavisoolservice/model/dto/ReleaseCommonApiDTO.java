/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;

@Data
public class ReleaseCommonApiDTO implements Serializable {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long releaseId;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long commonApiId;
    private EncryptResultDTO password;
}
