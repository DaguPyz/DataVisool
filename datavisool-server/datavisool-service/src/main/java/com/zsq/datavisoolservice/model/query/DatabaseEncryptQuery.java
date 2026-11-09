/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.query;

import lombok.Data;

import java.io.Serializable;

/**
 * 公共数据库数据源安全加密查询
 */
@Data
public class DatabaseEncryptQuery implements Serializable {
    private Long id;
    private String key;
}
