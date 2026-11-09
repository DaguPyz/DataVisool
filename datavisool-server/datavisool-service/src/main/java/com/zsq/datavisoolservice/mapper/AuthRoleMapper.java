/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.AuthRolePO;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * @author edy
 * @description 针对表【auth_role】的数据库操作Mapper
 * @createDate 2025-06-14 20:18:00
 * @Entity generator.domain.AuthRole
 */
public interface AuthRoleMapper extends BaseMapper<AuthRolePO> {

    /**
     * 联查获取用户角色
     *
     * @param userId 用户ID
     * @return 角色列表
     */
    @Select("""
            select ar.id, ar.name, ar.description
            from auth_role ar
                     inner join auth_user_role aur on ar.id = aur.role_id
            where ar.deleted = 0
                          and aur.user_id = #{userId}
            """)
    List<AuthRolePO> getUserRoles(Long userId);
}




