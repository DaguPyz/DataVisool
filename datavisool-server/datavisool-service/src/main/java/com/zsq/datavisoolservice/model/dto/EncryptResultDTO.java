/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

@Data
public class EncryptResultDTO {
    public String encryptedData; // AES 加密后的业务数据
    public String encryptedAesKey; // RSA 加密后的 AES 密钥
    public String iv; // AES CBC IV
}
