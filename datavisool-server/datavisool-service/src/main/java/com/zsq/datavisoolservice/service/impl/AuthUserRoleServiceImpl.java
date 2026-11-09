/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.zsq.datavisoolservice.mapper.AuthUserRoleMapper;
import com.zsq.datavisoolservice.model.po.AuthUserRolePO;
import com.zsq.datavisoolservice.service.AuthUserRoleService;
import org.springframework.stereotype.Service;

@Service
public class AuthUserRoleServiceImpl extends ServiceImpl<AuthUserRoleMapper, AuthUserRolePO> implements AuthUserRoleService {
}
