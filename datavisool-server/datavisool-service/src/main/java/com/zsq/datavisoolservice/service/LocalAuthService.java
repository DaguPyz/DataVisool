/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.zsq.datavisoolservice.model.po.LocalAuthPO;

public interface LocalAuthService {

    LocalAuthPO getLocalAuth(Long userId);

}
