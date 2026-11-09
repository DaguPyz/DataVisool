/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.TemplateMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.TemplateDTO;
import com.zsq.datavisoolservice.model.po.TemplatePO;
import com.zsq.datavisoolservice.service.TemplateService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.FileUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.List;

@Log4j2
@Service
public class TemplateServiceImpl implements TemplateService {

    @Resource
    private TemplateMapper templateMapper;
    @Autowired
    private AppBaseConfig appBaseConfig;

    @Override
    public Long createTemplate(TemplateDTO templateDTO) {
        if (templateDTO == null)
            return null;
        if (templateDTO.getName() == null || templateDTO.getName().isEmpty())
            throw new AppException(AppStatusCode.INVALID_PARAM, "模板名称不能为空");
        User user = requireCurrentUser();
        String coverUrl = handleTemplateCoverFile(templateDTO);

        TemplatePO po = new TemplatePO();
        po.setUserId(user.getId());
        po.setName(templateDTO.getName());
        po.setDescription(templateDTO.getDescription());
        po.setTemplateJson(templateDTO.getTemplateJson());
        po.setCoverUrl(coverUrl);
        templateMapper.insert(po);
        return po.getId();
    }

    @Override
    public TemplatePO getTemplateById(Long id) {
        if (id == null)
            return null;
        User user = requireCurrentUser();
        return templateMapper.selectOne(accessibleTemplateWrapper(user)
                .eq(TemplatePO::getId, id));
    }

    @Override
    public List<TemplatePO> getAllTemplate(TemplatePO condition) {
        User user = requireCurrentUser();
        LambdaQueryWrapper<TemplatePO> wrapper = accessibleTemplateWrapper(user);
        wrapper.select(TemplatePO::getId, TemplatePO::getName, TemplatePO::getDescription, TemplatePO::getCoverUrl, TemplatePO::getTemplateJson);
        if (condition != null && condition.getName() != null)
            wrapper.like(TemplatePO::getName, condition.getName());
        List<TemplatePO> templatePOS = templateMapper.selectList(wrapper);
        templatePOS.forEach(po -> {
            if (po.getCoverUrl() != null) {
                String coverUrl = FileUtil.normalizePath(Path.of(AppBaseConfig.TEMPLATE_COVER_PATH, po.getCoverUrl()).toString());
                po.setCoverUrl(FileUtil.removeBeginSeparator(coverUrl));
            }
        });
        return templatePOS;
    }

    @Override
    public boolean batchDelTemplate(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = requireCurrentUser();
        return templateMapper.delete(accessibleTemplateWrapper(user)
                .in(TemplatePO::getId, ids)) > 0;
    }


    /**
     * 处理模板封面文件
     *
     * @param templateDTO 模板信息
     * @return 处理后的模板封面文件路径
     */
    private String handleTemplateCoverFile(TemplateDTO templateDTO) {
        MultipartFile coverFile = templateDTO.getCoverFile();
        if (coverFile == null)
            return null;
        return MultipartFileUtil.saveFile(coverFile,
                AppBaseConfig.getTemplateCoverPath(),
                null,
                AppBaseConfig.IMAGE_MAX_SIZE,
                AppBaseConfig.ALLOW_IMAGE_TYPE);
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    private LambdaQueryWrapper<TemplatePO> accessibleTemplateWrapper(User user) {
        LambdaQueryWrapper<TemplatePO> wrapper = new LambdaQueryWrapper<>();
        if (!user.isAdmin()) {
            wrapper.eq(TemplatePO::getUserId, user.getId());
        }
        return wrapper;
    }
}
