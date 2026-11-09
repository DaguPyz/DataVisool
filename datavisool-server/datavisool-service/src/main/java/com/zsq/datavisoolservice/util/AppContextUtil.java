/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.util;

import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.model.auth.User;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * @author yinzhenpu
 * @date 2025/3/5 10:55:40
 * @description 应用上下文工具类
 */
public class AppContextUtil {
    public static User getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated())
            throw new AppException(AppStatusCode.UN_LOGGED_IN);
        Object principal = authentication.getPrincipal();
        if (principal instanceof User)
            return (User) principal;
        throw new AppException(AppStatusCode.UN_LOGGED_IN);
    }
}
