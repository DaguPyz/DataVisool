/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.AuthRoleMapper;
import com.zsq.datavisoolservice.mapper.LocalAuthMapper;
import com.zsq.datavisoolservice.mapper.UserMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.UserDTO;
import com.zsq.datavisoolservice.model.po.AuthRolePO;
import com.zsq.datavisoolservice.model.po.AuthUserRolePO;
import com.zsq.datavisoolservice.model.po.LocalAuthPO;
import com.zsq.datavisoolservice.model.po.UserPO;
import com.zsq.datavisoolservice.security.BCryptUtil;
import com.zsq.datavisoolservice.service.AuthUserRoleService;
import com.zsq.datavisoolservice.service.UserService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * @author DAGU
 * @description 针对表【user】的数据库操作Service实现
 * @createDate 2024-05-29 16:32:52
 */
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {
    private static final String LEGACY_SYSTEM_ADMIN_ROLE = "SYSTEM_ADMIN";
    private static final String SYSTEM_ADMIN_USER_ID_SQL = """
            select aur.user_id
            from auth_user_role aur
                     inner join auth_role ar on ar.id = aur.role_id
            where aur.deleted = 0
              and ar.deleted = 0
              and ar.name = 'ROLE_SYSTEM_ADMIN'
            """;

    private final UserMapper userMapper;
    private final LocalAuthMapper localAuthMapper;
    private final AuthUserRoleService authUserRoleService;
    private final AuthRoleMapper authRoleMapper;

    @Override
    public UserDTO getUser(Long id) {
        if (id == null)
            return null;
        User currentUser = requireCurrentUser();
        if (!currentUser.isAdmin() && !currentUser.getId().equals(id)) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        //查询用户信息
        LambdaQueryWrapper<UserPO> userWrapper = new LambdaQueryWrapper<>();
        userWrapper.select(UserPO::getId, UserPO::getName, UserPO::getUsername, UserPO::getPhone, UserPO::getEmail)
                .eq(UserPO::getId, id);
        UserPO userPo = userMapper.selectOne(userWrapper);
        if (userPo == null)
            return null;
        UserDTO user = new UserDTO();
        BeanUtils.copyProperties(userPo, user);
        // 从关联关系中查询角色信息，返回角色ID列表
        List<AuthRolePO> userRoles = authRoleMapper.getUserRoles(userPo.getId());
        user.setRoles(userRoles == null || userRoles.isEmpty()
                ? List.of()
                : userRoles.stream().map(r -> String.valueOf(r.getId())).toList());

        //头像路径拼接
        if (user.getAvatar() != null)
            user.setAvatar(AppBaseConfig.AVATAR_PATH + user.getAvatar());
        return user;
    }

    @Override
    public UserPO getUserByUserName(String userName) {
        if (userName == null || userName.isEmpty())
            return null;
        LambdaQueryWrapper<UserPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(UserPO::getId, UserPO::getName, UserPO::getUsername, UserPO::getPhone, UserPO::getEmail, UserPO::getRoles)
                .eq(UserPO::getUsername, userName);
        return userMapper.selectOne(wrapper);
    }

    @Override
    public Page<UserPO> getUserPageList(PageParamDTO pageParamDTO) {
        if (pageParamDTO == null)
            return new Page<>();
        long current = pageParamDTO.getCurrent() == null ? 1 : pageParamDTO.getCurrent();
        long size = pageParamDTO.getSize() == null ? 10 : pageParamDTO.getSize();
        Page<UserPO> page = new Page<>(current, size);
        LambdaQueryWrapper<UserPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(UserPO::getId, UserPO::getName, UserPO::getUsername, UserPO::getPhone, UserPO::getEmail);
        wrapper.notLike(UserPO::getRoles, LEGACY_SYSTEM_ADMIN_ROLE);
        wrapper.notInSql(UserPO::getId, SYSTEM_ADMIN_USER_ID_SQL);
        if (pageParamDTO.getSearchValue() != null && !pageParamDTO.getSearchValue().isBlank()) {
            String search = pageParamDTO.getSearchValue().trim();
            wrapper.and(q -> q.like(UserPO::getName, search).or().like(UserPO::getUsername, search)
                    .or().like(UserPO::getEmail, search));
        }
        return userMapper.selectPage(page, wrapper);
    }

    @Override
    @Transactional
    public Long addUser(UserDTO user) {
        if (user == null || user.getUsername() == null || user.getUsername().isBlank()
                || user.getName() == null || user.getName().isBlank())
            throw new AppException(AppStatusCode.INVALID_PARAM);
        validatePassword(user.getPassword());
        user.setUsername(user.getUsername().trim());
        //查询是否存在同名用户
        if (userMapper.selectOne(new LambdaQueryWrapper<UserPO>().eq(UserPO::getUsername, user.getUsername())) != null)
            throw new AppException(AppStatusCode.USER_EXISTS);
        //插入用户信息
        UserPO userPO = new UserPO();
        BeanUtils.copyProperties(user, userPO);
        boolean useDefaultRole = user.getRoles() == null || user.getRoles().isEmpty();
        List<String> roleIds = useDefaultRole ? List.of(String.valueOf(getDefaultUserRoleId())) : user.getRoles();
        if (useDefaultRole)
            userPO.setRoles("ROLE_USER");
        else
            userPO.setRoles(String.join(",", roleIds));
        try {
            if (userMapper.insert(userPO) <= 0)
                throw new AppException(AppStatusCode.SYSTEM_ERR, "新增用户失败");
        } catch (DuplicateKeyException e) {
            throw new AppException(AppStatusCode.USER_EXISTS);
        }
        //插入认证信息
        LocalAuthPO localAuthPo = new LocalAuthPO();
        localAuthPo.setUserId(userPO.getId());
        localAuthPo.setPassword(BCryptUtil.hashPassword(user.getPassword()));
        if (localAuthMapper.insert(localAuthPo) <= 0)
            throw new AppException(AppStatusCode.SYSTEM_ERR, "新增用户认证信息失败");
        //建立用户角色关系
        List<AuthUserRolePO> authUserRolePoList = roleIds.stream().map(roleId -> {
            AuthUserRolePO authUserRolePO = new AuthUserRolePO();
            authUserRolePO.setUserId(userPO.getId());
            authUserRolePO.setRoleId(Long.parseLong(roleId));
            return authUserRolePO;
        }).toList();
        authUserRoleService.saveBatch(authUserRolePoList);
        return userPO.getId();
    }

    private Long getDefaultUserRoleId() {
        AuthRolePO defaultRole = authRoleMapper.selectOne(new QueryWrapper<AuthRolePO>()
                .eq("name", "ROLE_USER")
                .eq("deleted", 0)
                .last("limit 1"));
        if (defaultRole == null || defaultRole.getId() == null) {
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "默认用户角色不存在");
        }
        return defaultRole.getId();
    }

    @Override
    @Transactional
    public boolean updateUser(UserDTO user) {
        if (user == null || user.getId() == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        if (user.getPassword() != null && !user.getPassword().isEmpty())
            validatePassword(user.getPassword());
        User currentUser = requireCurrentUser();
        if (!currentUser.isAdmin()) {
            return updateOwnProfile(currentUser, user);
        }

        if (userMapper.selectById(user.getId()) == null) {
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "用户不存在");
        }
        if (user.getUsername() != null) {
            if (user.getUsername().isBlank()) throw new AppException(AppStatusCode.INVALID_PARAM);
            user.setUsername(user.getUsername().trim());
            if (userMapper.selectCount(new LambdaQueryWrapper<UserPO>().eq(UserPO::getUsername, user.getUsername())
                    .ne(UserPO::getId, user.getId())) > 0) throw new AppException(AppStatusCode.USER_EXISTS);
        }
        //更新用户信息
        UserPO userPO = new UserPO();
        BeanUtils.copyProperties(user, userPO);
        // 如果角色列表不为空，更新角色信息
        if (user.getRoles() != null) {
            if (!user.getRoles().isEmpty()) {
                userPO.setRoles(String.join(",", user.getRoles()));
            }
        }
        if (hasProfileFields(userPO)) {
            try {
                userMapper.updateById(userPO);
            } catch (DuplicateKeyException e) {
                throw new AppException(AppStatusCode.USER_EXISTS);
            }
        }

        // 更新用户角色关联表
        if (user.getRoles() != null) {
            // 删除原有角色关联
            LambdaQueryWrapper<AuthUserRolePO> removeWrapper = new LambdaQueryWrapper<>();
            removeWrapper.eq(AuthUserRolePO::getUserId, user.getId());
            authUserRoleService.remove(removeWrapper);

            // 插入新角色关联
            if (!user.getRoles().isEmpty()) {
                List<String> roleIds = user.getRoles();
                List<AuthUserRolePO> authUserRolePoList = roleIds.stream().map(roleId -> {
                    AuthUserRolePO authUserRolePO = new AuthUserRolePO();
                    authUserRolePO.setUserId(user.getId());
                    authUserRolePO.setRoleId(Long.parseLong(roleId));
                    return authUserRolePO;
                }).toList();
                authUserRoleService.saveBatch(authUserRolePoList);
            }
        }

        //更新认证信息
        if (user.getPassword() != null && !user.getPassword().isEmpty()) {
            LocalAuthPO localAuthPo = new LocalAuthPO();
            localAuthPo.setUserId(user.getId());
            localAuthPo.setPassword(BCryptUtil.hashPassword(user.getPassword()));
            QueryWrapper<LocalAuthPO> wrapper = new QueryWrapper<>();
            wrapper.eq("user_id", user.getId());
            wrapper.eq("deleted", 0);
            return localAuthMapper.update(localAuthPo, wrapper) > 0;
        }
        return true;
    }

    private boolean updateOwnProfile(User currentUser, UserDTO user) {
        if (!currentUser.getId().equals(user.getId())) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }

        UserPO userPO = new UserPO();
        userPO.setId(currentUser.getId());
        userPO.setName(user.getName());
        userPO.setPhone(user.getPhone());
        userPO.setEmail(user.getEmail());
        if (hasProfileFields(userPO)) userMapper.updateById(userPO);

        if (user.getPassword() != null && !user.getPassword().isEmpty()) {
            return updatePassword(currentUser.getId(), user.getPassword());
        }
        return true;
    }

    private boolean updatePassword(Long userId, String password) {
        LocalAuthPO localAuthPo = new LocalAuthPO();
        localAuthPo.setUserId(userId);
        localAuthPo.setPassword(BCryptUtil.hashPassword(password));
        QueryWrapper<LocalAuthPO> wrapper = new QueryWrapper<>();
        wrapper.eq("user_id", userId);
        wrapper.eq("deleted", 0);
        return localAuthMapper.update(localAuthPo, wrapper) > 0;
    }

    private static void validatePassword(String password) {
        if (password == null || password.isBlank()
                || password.codePointCount(0, password.length()) < 8
                || password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new AppException(AppStatusCode.INVALID_PARAM, "密码至少8个字符且不超过72字节");
    }

    private static boolean hasProfileFields(UserPO user) {
        return user.getUsername() != null || user.getName() != null || user.getPhone() != null
                || user.getEmail() != null || user.getAvatar() != null || user.getRoles() != null
                || user.getCreateTime() != null || user.getUpdateTime() != null;
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    @Override
    @Transactional
    public boolean batchDelUser(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        if (userMapper.deleteBatchIds(ids) > 0) {
            QueryWrapper<LocalAuthPO> wrapper = new QueryWrapper<>();
            wrapper.in("user_id", ids);
            return localAuthMapper.delete(wrapper) > 0;
        } else
            return false;
    }

    @Override
    public List<UserPO> getExpiredData() {
        return userMapper.getExpiredData();
    }

}
