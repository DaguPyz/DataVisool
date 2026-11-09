/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.zsq.datavisoolservice.model.dto.AuthRoleDTO;
import com.zsq.datavisoolservice.model.po.AuthRolePO;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【auth_role】的数据库操作Service
 */
public interface RoleService extends IService<AuthRolePO> {

    /**
     * 快速查询角色信息，返回查询结果的前10条记录
     *
     * @param search 搜索关键字
     * @return 角色列表
     */
    List<AuthRoleDTO> getRoleTopTen(String search);

    /**
     * 获取角色信息
     *
     * @param ids 角色ids
     * @return 角色信息
     */
    List<AuthRoleDTO> getRole(List<Long> ids);
}
