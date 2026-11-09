/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.security;

import lombok.Data;

import java.io.Serializable;
import java.security.KeyPair;

@Data
public class RsaKeyPair implements Serializable {
    private String publicKey;
    private String privateKey;
    private long generateTime;
    private KeyPair keyPair;
}
