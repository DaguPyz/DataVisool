/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.constants;

import com.baomidou.mybatisplus.annotation.IEnum;
import lombok.Getter;

@Getter
public enum DataBaseEnum implements IEnum<String> {
    MySQL,
    PostgresSQL,
    ORACLE,
    SQLServer,
    ;


    @Override
    public String getValue() {
         return this.name();
    }
}
