/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {redirect} from "react-router-dom";
import AuthTools, {RoleType} from "@/util/AuthTools.ts";


interface IAuthConfig {
    needLogin?: boolean
    permissions?: string[]
    roles?: string[]
}

/**
 * 路由看门狗程序
 * @param config
 */
export function authGuard(config: IAuthConfig) {
    return async () => {
        const currentUser = AuthTools.getUserInfo();
        const {roles, needLogin} = config;
        if (needLogin && !currentUser) {
            console.warn('用户未登录,无权访问该页面');
            return redirect('/login')
        }
        if (roles && !roles?.every(r => currentUser?.roles?.includes(r as RoleType))) {
            console.warn('用户角色不足,无权访问该页面');
            return redirect('/403')
        }
        return null
    }
}
