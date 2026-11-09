/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.AuthPermissionPO;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * @author edy
 * @description 针对表【auth_permission】的数据库操作Mapper
 * @createDate 2025-06-14 20:17:59
 * @Entity generator.domain.AuthPermission
 */
public interface AuthPermissionMapper extends BaseMapper<AuthPermissionPO> {
    /**
     * 获取角色权限
     *
     * @param roleIds 角色ID列表
     * @return 权限列表
     */
    List<AuthPermissionPO> getUserPermissions(@Param("roleIds") List<Long> roleIds);

}




