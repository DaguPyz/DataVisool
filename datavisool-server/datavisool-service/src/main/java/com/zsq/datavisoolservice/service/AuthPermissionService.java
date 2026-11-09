/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.zsq.datavisoolservice.model.po.AuthPermissionPO;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * @description 针对表【auth_permission】的数据库操作Service
 */
public interface AuthPermissionService {
    /**
     * 根据角色id列表获取权限列表
     *
     * @param roleIds 角色id列表
     * @return 权限列表
     */
    List<AuthPermissionPO> getUserPermissions(@Param("roleIds") List<Long> roleIds);
}
