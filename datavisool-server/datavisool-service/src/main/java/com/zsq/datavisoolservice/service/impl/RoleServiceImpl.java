/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.zsq.datavisoolservice.mapper.AuthRoleMapper;
import com.zsq.datavisoolservice.model.dto.AuthRoleDTO;
import com.zsq.datavisoolservice.model.po.AuthRolePO;
import com.zsq.datavisoolservice.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RoleServiceImpl extends ServiceImpl<AuthRoleMapper, AuthRolePO> implements RoleService {

    private final AuthRoleMapper authRoleMapper;

    @Override
    public List<AuthRoleDTO> getRoleTopTen(String search) {
        LambdaQueryWrapper<AuthRolePO> wrapper = new LambdaQueryWrapper<>();
        if (search != null)
            wrapper.like(AuthRolePO::getDescription, search);
        wrapper.last("limit 10");
        List<AuthRolePO> rolePOS = authRoleMapper.selectList(wrapper);
        if (rolePOS != null && !rolePOS.isEmpty()) {
            return rolePOS.stream().map(rolePO -> {
                AuthRoleDTO roleDTO = new AuthRoleDTO();
                BeanUtils.copyProperties(rolePO, roleDTO);
                return roleDTO;
            }).toList();
        }
        return List.of();
    }

    @Override
    public List<AuthRoleDTO> getRole(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return List.of();
        LambdaQueryWrapper<AuthRolePO> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(AuthRolePO::getId, ids);
        List<AuthRolePO> rolePOS = getBaseMapper().selectList(wrapper);
        return rolePOS.stream().map(rolePO -> {
            AuthRoleDTO roleDTO = new AuthRoleDTO();
            BeanUtils.copyProperties(rolePO, roleDTO);
            return roleDTO;
        }).toList();
    }
}
