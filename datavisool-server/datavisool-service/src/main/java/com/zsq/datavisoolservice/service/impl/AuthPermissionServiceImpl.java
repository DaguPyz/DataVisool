/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.mapper.AuthPermissionMapper;
import com.zsq.datavisoolservice.model.po.AuthPermissionPO;
import com.zsq.datavisoolservice.service.AuthPermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthPermissionServiceImpl implements AuthPermissionService {

    private final AuthPermissionMapper authPermissionMapper;

    @Override
    public List<AuthPermissionPO> getUserPermissions(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty())
            return List.of();
        return authPermissionMapper.getUserPermissions(roleIds);
    }
}
