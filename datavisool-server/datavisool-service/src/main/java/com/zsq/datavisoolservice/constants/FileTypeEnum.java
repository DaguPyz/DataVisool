/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.constants;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;

@Getter
public enum FileTypeEnum implements BaseWebParamEnum {
    MATERIAL_IMAGE(1, "material_image"),
    SYSTEM_CONFIG(4, "system_config");

    @JsonValue
    @EnumValue
    private final int code;
    private final String name;

    FileTypeEnum(int code, String name) {
        this.code = code;
        this.name = name;
    }

}
