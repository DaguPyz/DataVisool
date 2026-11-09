/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;

import org.springframework.util.AntPathMatcher;

/**
 * 安全路径配置类，统一管理需要放行的路径
 *
 * @author yinzhenpu
 * @date 2025/6/14
 */
public class SecurityPathConfig {

    private static final AntPathMatcher pathMatcher = new AntPathMatcher();
    /**
     * 不需要认证的路径数组
     */
    private static final String[] PERMIT_ALL_PATHS = {
            "/",
            "/index.html",
            "/favicon.ico",
            "/assets/**",
            "/static/**",
            "/api/security/getEncryptKey",  // 获取服务器公钥
            "/api/authenticate/login",  // 登录接口放行
            "/api/release/getReleaseData",  // 获取发布后的项目数据接口放行
            "/api/release/getCommonApi",  // 发布项目运行时公共 API 解析接口放行
            "/api/release/executeDatabase",  // 发布项目运行时数据库只读执行接口放行
            "/api/release/getReleaseInfo/**",  // 获取发布信息接口放行
    };

    /**
     * 获取不需要认证的路径数组
     *
     * @return 路径数组
     */
    public static String[] getPermitAllPaths() {
        return PERMIT_ALL_PATHS;
    }

    /**
     * 判断指定路径是否需要放行
     *
     * @param path 请求路径
     * @return true表示需要放行，false表示需要认证
     */
    public static boolean isPermitAllPath(String path) {
        if (path == null)
            return false;
        for (String pattern : PERMIT_ALL_PATHS) {
            if (pathMatcher.match(pattern, path)) {
                return true;
            }
        }
        return RequestPathClassifier.isFrontendRoutePath(path);
    }
}
