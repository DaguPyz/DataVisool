/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.UserDTO;
import com.zsq.datavisoolservice.model.po.UserPO;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【user】的数据库操作Service
 * @createDate 2024-05-29 16:32:52
 */
public interface UserService {

    /**
     * 根据ID获取用户信息
     *
     * @param id 用户ID
     * @return 用户信息
     */
    UserDTO getUser(Long id);

    UserPO getUserByUserName(String userName);

    /**
     * 获取用户列表(分页)
     *
     * @return 用户列表
     */
    Page<UserPO> getUserPageList(PageParamDTO pageParamDTO);

    /**
     * 新增用户
     *
     * @param user 用户信息
     * @return 新增结果
     */
    Long addUser(UserDTO user);

    /**
     * 更新用户信息
     *
     * @param user 用户信息
     * @return 更新结果
     */
    boolean updateUser(UserDTO user);

    /**
     * 批量删除用户
     *
     * @param ids 用户ID列表
     * @return 删除结果
     */
    boolean batchDelUser(List<Long> ids);

    /**
     * 获取过期数据
     *
     * @return 过期数据列表
     */
    List<UserPO> getExpiredData();
}
