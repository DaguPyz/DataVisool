/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.ProjectAiMemoryMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ProjectAiMemoryDTO;
import com.zsq.datavisoolservice.model.po.ProjectAiMemoryPO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.service.ProjectAiMemoryService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectAiMemoryServiceImpl extends ServiceImpl<ProjectAiMemoryMapper, ProjectAiMemoryPO> implements ProjectAiMemoryService {
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};

    private final ProjectAiMemoryMapper projectAiMemoryMapper;
    private final ProjectMapper projectMapper;
    private final ObjectMapper objectMapper;

    @Override
    public ProjectAiMemoryDTO getProjectAiMemory(Long projectId) {
        if (projectId == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        assertProjectAccessible(projectId);
        return toDTO(projectAiMemoryMapper.selectById(projectId));
    }

    @Override
    @Transactional
    public ProjectAiMemoryDTO saveProjectAiMemory(ProjectAiMemoryDTO dto) {
        if (dto == null || dto.getProjectId() == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        assertProjectAccessible(dto.getProjectId());
        ProjectAiMemoryPO po = toPO(dto);
        saveOrUpdate(po);
        return toDTO(projectAiMemoryMapper.selectById(dto.getProjectId()));
    }

    private void assertProjectAccessible(Long projectId) {
        User user = AppContextUtil.getCurrentUser();
        LambdaQueryWrapper<ProjectPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProjectPO::getId, projectId)
                .eq(ProjectPO::getDeleted, 0);
        if (!user.isAdmin()) {
            wrapper.eq(ProjectPO::getUserId, user.getId());
        }
        if (projectMapper.selectCount(wrapper) <= 0) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
    }

    private ProjectAiMemoryPO toPO(ProjectAiMemoryDTO dto) {
        ProjectAiMemoryPO po = new ProjectAiMemoryPO();
        po.setProjectId(dto.getProjectId());
        po.setSummary(defaultText(dto.getSummary()));
        po.setStyleTone(defaultText(dto.getStyleTone()));
        po.setLayoutTone(defaultText(dto.getLayoutTone()));
        po.setColorSystem(defaultText(dto.getColorSystem()));
        po.setComponents(writeComponents(dto.getComponents()));
        return po;
    }

    private ProjectAiMemoryDTO toDTO(ProjectAiMemoryPO po) {
        if (po == null)
            return null;
        ProjectAiMemoryDTO dto = new ProjectAiMemoryDTO();
        dto.setProjectId(po.getProjectId());
        dto.setSummary(defaultText(po.getSummary()));
        dto.setStyleTone(defaultText(po.getStyleTone()));
        dto.setLayoutTone(defaultText(po.getLayoutTone()));
        dto.setColorSystem(defaultText(po.getColorSystem()));
        dto.setComponents(readComponents(po.getComponents()));
        dto.setCreateTime(po.getCreateTime());
        dto.setUpdateTime(po.getUpdateTime());
        return dto;
    }

    private String defaultText(String value) {
        return value == null ? "" : value;
    }

    private String writeComponents(List<String> components) {
        try {
            return objectMapper.writeValueAsString(components == null ? Collections.emptyList() : components);
        } catch (Exception e) {
            throw new AppException(500, "projectAiMemory.components serialize failed");
        }
    }

    private List<String> readComponents(String value) {
        if (value == null || value.isBlank())
            return Collections.emptyList();
        try {
            return objectMapper.readValue(value, STRING_LIST_TYPE);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}
