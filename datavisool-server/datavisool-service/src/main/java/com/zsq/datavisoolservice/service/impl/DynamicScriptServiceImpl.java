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
import com.zsq.datavisoolservice.constants.ScriptEnum;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.DynamicScriptMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.DynamicScriptDTO;
import com.zsq.datavisoolservice.model.dto.DynamicScriptPageParamDTO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.service.DynamicScriptService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Log4j2
@Service
public class DynamicScriptServiceImpl implements DynamicScriptService {

    @Resource
    private DynamicScriptMapper dynamicScriptMapper;
    @Resource
    private ProjectMapper projectMapper;

    @Override
    public DynamicScriptDTO getDynamicScript(Long id) {
        User user = AppContextUtil.getCurrentUser();
        if (id == null || user == null)
            return null;
        LambdaQueryWrapper<DynamicScriptPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(DynamicScriptPO::getId, DynamicScriptPO::getName, DynamicScriptPO::getUrl, DynamicScriptPO::getType, DynamicScriptPO::getProjectId)
                .eq(DynamicScriptPO::getId, id)
                .eq(DynamicScriptPO::getUserId, user.getId());
        DynamicScriptPO dynamicScriptPO = dynamicScriptMapper.selectOne(queryWrapper);
        if (dynamicScriptPO == null)
            return null;
        DynamicScriptDTO dynamicScriptDTO = new DynamicScriptDTO();
        BeanUtils.copyProperties(dynamicScriptPO, dynamicScriptDTO);
        return dynamicScriptDTO;
    }

    @Override
    public Page<DynamicScriptDTO> getDynamicScriptPageList(DynamicScriptPageParamDTO pageParam) {
        User user = AppContextUtil.getCurrentUser();
        if (pageParam == null || user == null)
            return new Page<>();
        long current = pageParam.getCurrent() == null ? 1 : pageParam.getCurrent();
        long size = pageParam.getSize() == null ? 10 : pageParam.getSize();
        Page<DynamicScriptPO> page = new Page<>(current, size);
        LambdaQueryWrapper<DynamicScriptPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(DynamicScriptPO::getId, DynamicScriptPO::getName, DynamicScriptPO::getUrl, DynamicScriptPO::getType,
                DynamicScriptPO::getProjectId, DynamicScriptPO::getCreateTime, DynamicScriptPO::getUpdateTime);
        Long projectId = parseOptionalProjectId(pageParam.getProjectId());
        if (projectId != null) {
            requireAccessibleProjectIfPresent(projectId, user);
            wrapper.eq(DynamicScriptPO::getProjectId, projectId);
        } else {
            wrapper.isNull(DynamicScriptPO::getProjectId);
        }
        if (pageParam.getSearchValue() != null)
            wrapper.like(DynamicScriptPO::getName, pageParam.getSearchValue());
        wrapper.eq(DynamicScriptPO::getUserId, user.getId());
        Page<DynamicScriptPO> apiPOPage = dynamicScriptMapper.selectPage(page, wrapper);
        Page<DynamicScriptDTO> apiDTOPage = new Page<>();
        BeanUtils.copyProperties(apiPOPage, apiDTOPage);
        List<DynamicScriptDTO> apiDTOList = apiPOPage.getRecords().stream().map(apiPO -> {
            DynamicScriptDTO DynamicScriptDTO = new DynamicScriptDTO();
            BeanUtils.copyProperties(apiPO, DynamicScriptDTO);
            return DynamicScriptDTO;
        }).toList();
        apiDTOPage.setRecords(apiDTOList);
        return apiDTOPage;
    }

    @Override
    @Transactional
    public Boolean saveOrUpdate(DynamicScriptDTO script) {
        if (script == null)
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        requireAccessibleProjectIfPresent(script.getProjectId(), user);
        if (script.getType() == null)
            throw new AppException(AppStatusCode.INVALID_PARAM, "请选择脚本类型");
        if (ScriptEnum.REMOTE.equals(script.getType()))
            script.setUrl(validateRemoteUrl(script.getUrl()));
        MultipartFile scriptFile = script.getScriptFile();
        Long scriptId = script.getId();
        if (scriptId != null) {
            //更新
            DynamicScriptPO oldDynamicScript = dynamicScriptMapper.selectOne(new LambdaQueryWrapper<DynamicScriptPO>()
                    .eq(DynamicScriptPO::getId, script.getId())
                    .eq(DynamicScriptPO::getUserId, user.getId()));
            if (oldDynamicScript == null)
                throw new AppException(AppStatusCode.DATA_EXCEPTION, "动态脚本不存在，无法替换");
            if (ScriptEnum.LOCAL.equals(script.getType())) {
                //本地脚本
                //替换已有的脚本
                if (scriptFile == null || scriptFile.isEmpty())
                    throw new AppException(AppStatusCode.INVALID_PARAM, "动态脚本文件不能为空");
                String fileName = MultipartFileUtil.saveFile(scriptFile, AppBaseConfig.getDynamicScriptPath(), null, null, new String[]{".js"});
                DynamicScriptPO dynamicScriptPO = new DynamicScriptPO();
                dynamicScriptPO.setUrl(fileName);
                dynamicScriptPO.setName(scriptFile.getOriginalFilename());
                dynamicScriptPO.setType(ScriptEnum.LOCAL);
                dynamicScriptPO.setProjectId(script.getProjectId());
                int updated = dynamicScriptMapper.update(dynamicScriptPO, new LambdaQueryWrapper<DynamicScriptPO>()
                        .eq(DynamicScriptPO::getId, scriptId)
                        .eq(DynamicScriptPO::getUserId, user.getId()));
                if (updated <= 0) {
                    deleteLocalScriptFile(fileName);
                    throw new AppException(AppStatusCode.DATA_EXCEPTION, "动态脚本替换失败");
                }
                //删除旧文件
                if (ScriptEnum.LOCAL.equals(oldDynamicScript.getType()))
                    deleteLocalScriptFile(oldDynamicScript.getUrl());
            } else {
                //远程脚本
                DynamicScriptPO po = script.toPO();
                po.setId(null);
                int updated = dynamicScriptMapper.update(po, new LambdaQueryWrapper<DynamicScriptPO>()
                        .eq(DynamicScriptPO::getId, scriptId)
                        .eq(DynamicScriptPO::getUserId, user.getId()));
                if (updated > 0 && ScriptEnum.LOCAL.equals(oldDynamicScript.getType()))
                    deleteLocalScriptFile(oldDynamicScript.getUrl());
            }
        } else {
            //新增
            if (ScriptEnum.LOCAL.equals(script.getType())) {
                //本地脚本
                //保存本地上传的脚本
                if (scriptFile == null || scriptFile.isEmpty())
                    throw new AppException(AppStatusCode.INVALID_PARAM, "动态脚本文件不能为空");
                String originalFilename = scriptFile.getOriginalFilename();
                if (originalFilename == null)
                    throw new AppException(AppStatusCode.INVALID_PARAM, "文件名为空");
                //保存文件
                String fileName = MultipartFileUtil.saveFile(scriptFile, AppBaseConfig.getDynamicScriptPath(), null, null, new String[]{".js"});
                DynamicScriptPO po = new DynamicScriptPO();
                po.setName(scriptFile.getOriginalFilename());
                po.setUrl(fileName);
                po.setType(ScriptEnum.LOCAL);
                po.setProjectId(script.getProjectId());
                po.setUserId(user.getId());
                dynamicScriptMapper.insert(po);
            } else {
                //远程脚本
                DynamicScriptPO po = script.toPO();
                po.setUserId(user.getId());
                po.setType(ScriptEnum.REMOTE);
                dynamicScriptMapper.insert(po);
            }
        }
        return true;
    }

    @Override
    public boolean updateDynamicScript(DynamicScriptDTO script) {
        if (script == null || script.getId() == null)
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        requireAccessibleProjectIfPresent(script.getProjectId(), user);
        if (script.getName() == null || script.getName().codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c)))
            throw new AppException(AppStatusCode.INVALID_PARAM, "请输入脚本名称");
        DynamicScriptPO dynamicScriptPO = new DynamicScriptPO();
        dynamicScriptPO.setName(script.getName());
        dynamicScriptPO.setProjectId(script.getProjectId());
        return dynamicScriptMapper.update(dynamicScriptPO, new LambdaQueryWrapper<DynamicScriptPO>()
                .eq(DynamicScriptPO::getId, script.getId())
                .eq(DynamicScriptPO::getUserId, user.getId())) > 0;
    }

    private String validateRemoteUrl(String value) {
        String url = value == null ? "" : value.strip();
        try {
            URI uri = new URI(url.startsWith("//") ? "https:" + url : url);
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getRawAuthority() == null)
                throw new URISyntaxException(url, "unsupported URL");
            URL parsed = uri.toURL();
            if (!parsed.getHost().isEmpty() && parsed.getPort() <= 65535)
                return url;
        } catch (URISyntaxException | IOException | IllegalArgumentException ignored) {
            // Report malformed addresses using the same error as unsupported schemes.
        }
        throw new AppException(AppStatusCode.INVALID_PARAM, "请输入有效的 HTTP 或 HTTPS 脚本地址");
    }

    @Override
    public boolean batchDelDynamicScript(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        return dynamicScriptMapper.delete(new LambdaQueryWrapper<DynamicScriptPO>()
                .in(DynamicScriptPO::getId, ids)
                .eq(DynamicScriptPO::getUserId, user.getId())) > 0;
    }

    @Override
    public List<DynamicScriptPO> getExpiredData() {
        return dynamicScriptMapper.getExpiredData();
    }

    @Override
    public List<DynamicScriptDTO> quickSearchTopTen(String search) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        LambdaQueryWrapper<DynamicScriptPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(DynamicScriptPO::getId, DynamicScriptPO::getName, DynamicScriptPO::getUrl, DynamicScriptPO::getType, DynamicScriptPO::getProjectId);
        queryWrapper.eq(DynamicScriptPO::getUserId, user.getId());
        if (search != null)
            queryWrapper.like(DynamicScriptPO::getName, search);
        queryWrapper.last("limit 10");
        List<DynamicScriptPO> DynamicScriptPOS = dynamicScriptMapper.selectList(queryWrapper);
        if (DynamicScriptPOS != null && !DynamicScriptPOS.isEmpty())
            return DynamicScriptPOS.stream().map(DynamicScriptPO -> {
                DynamicScriptDTO DynamicScriptDTO = new DynamicScriptDTO();
                BeanUtils.copyProperties(DynamicScriptPO, DynamicScriptDTO);
                return DynamicScriptDTO;
            }).toList();
        return new ArrayList<>();
    }

    @Override
    public List<DynamicScriptPO> getAllDynamicScript(Long projectId) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        requireAccessibleProjectIfPresent(projectId, user);
        LambdaQueryWrapper<DynamicScriptPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(DynamicScriptPO::getId, DynamicScriptPO::getUrl, DynamicScriptPO::getType, DynamicScriptPO::getName);
        queryWrapper.eq(DynamicScriptPO::getUserId, user.getId());
        queryWrapper.and(w -> {
            w.isNull(DynamicScriptPO::getProjectId);
            if (projectId != null)
                w.or().eq(DynamicScriptPO::getProjectId, projectId);
        });
        List<DynamicScriptPO> dynamicPOList = dynamicScriptMapper.selectList(queryWrapper);
        if (dynamicPOList != null && !dynamicPOList.isEmpty()) {
            return dynamicPOList.stream().map(dynamicScriptPO -> {
                DynamicScriptPO dynamicScriptDTO = new DynamicScriptPO();
                dynamicScriptDTO.setId(dynamicScriptPO.getId());
                dynamicScriptDTO.setName(dynamicScriptPO.getName());
                if (ScriptEnum.LOCAL.equals(dynamicScriptPO.getType()))
                    dynamicScriptDTO.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.DYNAMIC_SCRIPT_PATH, dynamicScriptPO.getUrl()));
                else
                    dynamicScriptDTO.setUrl(dynamicScriptPO.getUrl());
                return dynamicScriptDTO;
            }).toList();
        } else
            return new ArrayList<>();
    }

    @Override
    public List<DynamicScriptPO> getDynamicScripts(List<String> urls) {
        if (urls == null || urls.isEmpty())
            return List.of();
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return List.of();
        QueryWrapper<DynamicScriptPO> queryWrapper = new QueryWrapper<>();
        queryWrapper.lambda()
                .eq(DynamicScriptPO::getUserId, user.getId())
                .in(DynamicScriptPO::getUrl, urls);
        return dynamicScriptMapper.selectList(queryWrapper);
    }

    @Override
    public DynamicScriptPO createDynamicScript(DynamicScriptPO dynamicScriptPO) {
        User user = AppContextUtil.getCurrentUser();
        if (dynamicScriptPO == null || user == null)
            return null;
        requireAccessibleProjectIfPresent(dynamicScriptPO.getProjectId(), user);
        dynamicScriptPO.setUserId(user.getId());
        return dynamicScriptMapper.insert(dynamicScriptPO) > 0 ? dynamicScriptPO : null;
    }

    private void requireAccessibleProjectIfPresent(Long projectId, User user) {
        if (projectId == null) {
            return;
        }
        LambdaQueryWrapper<ProjectPO> wrapper = new LambdaQueryWrapper<ProjectPO>()
                .eq(ProjectPO::getId, projectId)
                .eq(ProjectPO::getDeleted, 0);
        if (!user.isAdmin()) {
            wrapper.eq(ProjectPO::getUserId, user.getId());
        }
        Long count = projectMapper.selectCount(wrapper);
        if (count == null || count <= 0) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
    }

    private Long parseOptionalProjectId(String projectId) {
        if (projectId == null) {
            return null;
        }
        String value = projectId.trim();
        if (value.isEmpty() || "null".equalsIgnoreCase(value) || "undefined".equalsIgnoreCase(value)) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "项目ID不合法");
        }
    }

    private void deleteLocalScriptFile(String relativePath) {
        Path target = resolveStoredFile(AppBaseConfig.getDynamicScriptPath(), relativePath);
        if (target == null) {
            if (relativePath != null && !relativePath.isBlank()) {
                log.warn("Skip unsafe dynamic script deletion, fileName: {}", relativePath);
            }
            return;
        }
        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            log.error("delete file failed, target path: {}", target, e);
        }
    }

    private Path resolveStoredFile(String rootPath, String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return null;
        }
        try {
            Path relative = Path.of(fileName);
            if (relative.isAbsolute()
                    || relative.getNameCount() != 1
                    || fileName.contains("/")
                    || fileName.contains("\\")
                    || ".".equals(fileName)
                    || "..".equals(fileName)) {
                return null;
            }
            Path root = Path.of(rootPath).toAbsolutePath().normalize();
            Path target = root.resolve(relative).normalize();
            return target.startsWith(root) ? target : null;
        } catch (InvalidPathException e) {
            return null;
        }
    }
}
