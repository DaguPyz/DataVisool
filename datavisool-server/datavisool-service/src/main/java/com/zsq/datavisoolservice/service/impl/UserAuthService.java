/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.mapper.AuthRoleMapper;
import com.zsq.datavisoolservice.mapper.LocalAuthMapper;
import com.zsq.datavisoolservice.mapper.UserMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.po.AuthPermissionPO;
import com.zsq.datavisoolservice.model.po.AuthRolePO;
import com.zsq.datavisoolservice.model.po.LocalAuthPO;
import com.zsq.datavisoolservice.model.po.UserPO;
import com.zsq.datavisoolservice.service.AuthPermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

/**
 * @author yinzhenpu
 * @date 2025/2/23 16:54:16
 * @description 用户服务类
 */
@RequiredArgsConstructor
@Service
public class UserAuthService implements UserDetailsService {

    private final UserMapper userMapper;
    private final LocalAuthMapper localAuthMapper;
    private final AuthRoleMapper authRoleMapper;
    private final AuthPermissionService authPermissionService;

    @Override
    public User loadUserByUsername(String username) {
        LambdaQueryWrapper<UserPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(UserPO::getUsername, username);
        UserPO userPO = userMapper.selectOne(wrapper);
        if (userPO == null)
            throw new UsernameNotFoundException("User does not exist");
        LambdaQueryWrapper<LocalAuthPO> authWrapper = new LambdaQueryWrapper<>();
        authWrapper.eq(LocalAuthPO::getUserId, userPO.getId());
        LocalAuthPO localAuthPO = localAuthMapper.selectOne(authWrapper);
        if (localAuthPO == null)
            throw new IllegalArgumentException("User password does not exist");
        User user = new User();
        BeanUtils.copyProperties(userPO, user);
        user.setPassword(localAuthPO.getPassword());

        //查询角色
        List<AuthRolePO> userRoles = authRoleMapper.getUserRoles(userPO.getId());
        user.setRoles(userRoles.stream().map(AuthRolePO::getName).collect(Collectors.toList()));
        //查询权限
        List<AuthPermissionPO> permissions = authPermissionService.getUserPermissions(userRoles.stream().map(AuthRolePO::getId).collect(Collectors.toList()));
        user.setPermissions(permissions.stream().map(AuthPermissionPO::getName).collect(Collectors.toList()));
        return user;
    }


}
