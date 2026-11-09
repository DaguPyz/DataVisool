/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

/**
 * 加密数据传输对象
 *
 * @author puyinzhen
 * @date 2023/10/23
 */
@Data
public class EncryptDTO {
    /**
     * 客户端传递的加密数据
     */
    private String data;
}
