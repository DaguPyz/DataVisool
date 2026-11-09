/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

@Data
public class LoginDTO {
    private String username;
    private EncryptResultDTO password;
}
