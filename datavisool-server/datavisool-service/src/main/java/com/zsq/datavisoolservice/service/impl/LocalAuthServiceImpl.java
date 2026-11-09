/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.mapper.LocalAuthMapper;
import com.zsq.datavisoolservice.model.po.LocalAuthPO;
import com.zsq.datavisoolservice.service.LocalAuthService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

@Service
public class LocalAuthServiceImpl implements LocalAuthService {

    @Resource
    private LocalAuthMapper localAuthMapper;

    @Override
    public LocalAuthPO getLocalAuth(Long userId) {
        LambdaQueryWrapper<LocalAuthPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(LocalAuthPO::getId, LocalAuthPO::getUserId, LocalAuthPO::getPassword)
                .eq(LocalAuthPO::getUserId, userId);
        return localAuthMapper.selectOne(queryWrapper);
    }
}
