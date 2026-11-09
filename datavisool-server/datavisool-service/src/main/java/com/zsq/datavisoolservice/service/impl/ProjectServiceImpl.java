/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.dto.ProjectDependenciesDTO;
import com.zsq.datavisoolcommon.model.dto.ProjectDependencyItemDTO;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.*;
import com.zsq.datavisoolservice.model.po.*;
import com.zsq.datavisoolservice.service.*;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.FileUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import com.zsq.datavisoolservice.util.ProjectDataCodecUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.BeanUtils;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Log4j2
@Service
@RequiredArgsConstructor
public class ProjectServiceImpl implements ProjectService {

    private static final int MAX_PROJECT_NAME_LENGTH = 50;

    private final ProjectMapper projectMapper;
    private final FontService fontService;
    private final ImageService imageService;
    private final RemoteComponentService remoteComponentService;
    private final DynamicScriptService dynamicScriptService;
    private final ProjectArchiveCompatHelper projectArchiveCompatHelper;

    @Override
    @Transactional
    public Boolean updateProject(ProjectPO projectPo) {
        if (projectPo == null || projectPo.getId() == null)
            return false;
        if (projectPo.getName() != null)
            validateProjectName(projectPo.getName());
        User user = requireCurrentUser();
        assertProjectParentAllowed(projectPo.getId(), projectPo.getPid(), user);
        ProjectPO update = new ProjectPO();
        update.setName(projectPo.getName());
        update.setDes(projectPo.getDes());
        update.setDataJson(projectPo.getDataJson());
        update.setPid(projectPo.getPid());
        update.setUpdateTime(LocalDateTime.now());
        return projectMapper.update(update, accessibleProjectUpdateWrapper(projectPo.getId(), user)) > 0;
    }

    @Override
    public ProjectDTO getProjectData(Long id) {
        User user = AppContextUtil.getCurrentUser();
        if (id == null || user == null)
            return null;
        LambdaQueryWrapper<ProjectPO> queryWrapper = accessibleProjectQueryWrapper(id, user)
                .select(ProjectPO::getDataJson, ProjectPO::getId, ProjectPO::getName);
        ProjectPO projectPO = projectMapper.selectOne(queryWrapper);
        if (projectPO == null)
            return null;
        ProjectDTO projectDTO = new ProjectDTO();
        BeanUtils.copyProperties(projectPO, projectDTO);
        return projectDTO;
    }

    @Override
    @Transactional
    public Long createProject(ProjectPO projectPo) {
        if (projectPo == null)
            return null;
        validateProjectName(projectPo.getName());
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return null;
        if (projectPo.getPid() != null) {
            requireAccessibleProject(projectPo.getPid(), user);
        }
        ProjectPO create = new ProjectPO();
        create.setName(projectPo.getName());
        create.setDes(projectPo.getDes());
        create.setDataJson(projectPo.getDataJson());
        create.setPid(projectPo.getPid());
        create.setUserId(user.getId());
        projectMapper.insert(create);
        return create.getId();
    }

    @Override
    @Transactional
    public Boolean deleteProject(Long id) {
        if (id == null)
            return false;
        User user = requireCurrentUser();
        return projectMapper.delete(accessibleProjectQueryWrapper(id, user)) > 0;
    }

    @Override
    @Transactional
    public Long copyProject(Long id) {
        if (id == null)
            return null;
        User user = requireCurrentUser();
        ProjectPO projectPo = projectMapper.selectOne(accessibleProjectQueryWrapper(id, user));
        if (projectPo == null)
            return null;
        projectPo.setId(null);
        projectPo.setUserId(user.getId());
        projectPo.setName(projectPo.getName() + " - 副本");
        projectPo.setCreateTime(null);
        projectPo.setUpdateTime(null);
        projectMapper.insert(projectPo);
        return projectPo.getId();
    }

    @Override
    public ProjectDTO getProjectInfo(Long id) {
        if (id == null)
            return null;
        User user = requireCurrentUser();
        ProjectPO po = projectMapper.selectOne(accessibleProjectQueryWrapper(id, user));
        if (po == null)
            return null;
        ProjectDTO dto = new ProjectDTO();
        BeanUtils.copyProperties(po, dto);
        return dto;
    }

    @Override
    @Transactional
    public String uploadCover(ProjectPO projectPo) {
        if (projectPo == null || projectPo.getId() == null || projectPo.getFile() == null)
            throw new AppException(500, "参数错误");
        User user = requireCurrentUser();
        ProjectPO record = projectMapper.selectOne(accessibleProjectQueryWrapper(projectPo.getId(), user));
        if (record == null)
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        MultipartFile file = projectPo.getFile();

        String fileName = MultipartFileUtil.saveFile(file,
                AppBaseConfig.getCoverPath(),
                null,
                AppBaseConfig.AVATAR_MAX_SIZE,
                AppBaseConfig.ALLOW_IMAGE_TYPE);

        deleteStoredCoverFile(record.getCover(), record.getId());

        //数据入库
        ProjectPO update = new ProjectPO();
        update.setCover(fileName);
        update.setUpdateTime(LocalDateTime.now());
        projectMapper.update(update, accessibleProjectUpdateWrapper(projectPo.getId(), user));
        return String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.COVER_PATH, fileName);
    }

    @Override
    public Page<ProjectDTO> getProjectPageList(PageParamDTO pageParamDTO) {
        if (pageParamDTO == null)
            return new Page<>();
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new Page<>();
        long current = pageParamDTO.getCurrent() == null ? 1 : pageParamDTO.getCurrent();
        long size = pageParamDTO.getSize() == null ? 10 : pageParamDTO.getSize();
        Page<ProjectPO> page = new Page<>(current, size);
        LambdaQueryWrapper<ProjectPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(ProjectPO::getId, ProjectPO::getName, ProjectPO::getDes, ProjectPO::getCover,
                ProjectPO::getCreateTime, ProjectPO::getUpdateTime).orderByDesc(ProjectPO::getCreateTime);
        wrapper.eq(ProjectPO::getUserId, user.getId());
        wrapper.isNull(ProjectPO::getPid);
        if (pageParamDTO.getSearchValue() != null)
            wrapper.like(ProjectPO::getName, pageParamDTO.getSearchValue());
        Page<ProjectPO> pageData = projectMapper.selectPage(page, wrapper);
        //补全封面的完整路径
        for (ProjectPO projectPo : pageData.getRecords()) {
            if (projectPo.getCover() != null) {
                projectPo.setCover(String.join("/", AppBaseConfig.COVER_PATH, projectPo.getCover()));
            }
        }
        List<ProjectDTO> dtoList = pageData.getRecords().stream().map(projectPo -> {
            ProjectDTO dto = new ProjectDTO();
            BeanUtils.copyProperties(projectPo, dto);
            return dto;
        }).toList();
        Page<ProjectDTO> dtoPage = new Page<>();
        BeanUtils.copyProperties(pageData, dtoPage);
        dtoPage.setRecords(dtoList);
        return dtoPage;
    }

    @Override
    public List<ProjectPO> getExpiredData() {
        return projectMapper.getExpiredData();
    }

    @Override
    public List<ProjectDTO> quickSearchTopTen(Long current, Long exclude, String search) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        LambdaQueryWrapper<ProjectPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(ProjectPO::getId, ProjectPO::getName);
        if (search != null)
            queryWrapper.like(ProjectPO::getName, search);
        if (exclude != null)
            queryWrapper.ne(ProjectPO::getId, exclude);
        queryWrapper.eq(ProjectPO::getUserId, user.getId())
                .eq(ProjectPO::getDeleted, 0);
        queryWrapper.last("limit 10");
        List<ProjectPO> projectPOS = projectMapper.selectList(queryWrapper);
        if (current != null && projectPOS.stream().noneMatch(projectPO -> Objects.equals(projectPO.getId(), current))) {
            ProjectPO projectPO = projectMapper.selectOne(accessibleProjectQueryWrapper(current, user));
            if (projectPO != null)
                projectPOS.add(projectPO);
        }
        return projectPOS.stream().map(projectPO -> {
            ProjectDTO projectDTO = new ProjectDTO();
            projectDTO.setId(projectPO.getId());
            projectDTO.setName(projectPO.getName());
            return projectDTO;
        }).collect(Collectors.toList());
    }

    @Override
    public ResponseEntity<StreamingResponseBody> exportProject(ProjectDependencyParamDTO dependency) throws Exception {
        return projectArchiveCompatHelper.exportProject(dependency);
    }

    @Override
    @Transactional
    public Boolean importProject(ProjectImportParamDTO importParam) throws IOException {
        return projectArchiveCompatHelper.importProject(importParam);
    }

    @Override
    public ProjectDependenciesDTO calculateProjectDependency(ProjectDependencyParamDTO dependency) {
        if (dependency == null || dependency.getId() == null)
            return null;

        //字体依赖
        List<ProjectDependencyItemDTO> fontDep = new ArrayList<>();
        //服务器组件依赖
        List<ProjectDependencyItemDTO> serverComponentsDep = new ArrayList<>();
        //动态脚本依赖
        List<ProjectDependencyItemDTO> dynamicScriptsDep = new ArrayList<>();
        //图片依赖
        List<ProjectDependencyItemDTO> imageDep = new ArrayList<>();
        //项目json数据
        String dataJson = dependency.getProjectJson();

        //2. 导出图片
        List<String> images = dependency.getImages();
        if (images != null && !images.isEmpty()) {
            List<ImagePO> imagePoList = imageService.getImages(dependency.getImages());
            for (ImagePO imagePO : imagePoList) {
                Path imageZipPath = Path.of(AppBaseConfig.IMAGE_PATH, imagePO.getUrl());
                imageDep.add(new ProjectDependencyItemDTO(imagePO.getName(), FileUtil.removeBeginSeparator(FileUtil.normalizePath(imageZipPath.toString()))));
            }
        }
        //3. 导出字体
        List<String> fonts = dependency.getFonts();
        if (fonts != null && !fonts.isEmpty()) {
            List<FontPO> fontPoList = fontService.getFontsByNames(fonts);
            for (FontPO po : fontPoList) {
                Path fontZipPath = Path.of(AppBaseConfig.FONT_PATH, po.getUrl());
                fontDep.add(new ProjectDependencyItemDTO(po.getName(), FileUtil.removeBeginSeparator(FileUtil.normalizePath(fontZipPath.toString()))));
            }
        }
        //4. 导出三方脚本了（三方脚本根据本项目设置直接从数据库中获取记录）
        List<DynamicScriptPO> dynamicScriptList = dynamicScriptService.getAllDynamicScript(dependency.getId());
        for (DynamicScriptPO dynamicScriptPO : dynamicScriptList) {
            String script = dynamicScriptPO.getUrl();
            if (!script.startsWith("http")) {
                Path scriptZipPath = Path.of(script);
                //收集动态脚本依赖
                dynamicScriptsDep.add(new ProjectDependencyItemDTO(dynamicScriptPO.getName(), FileUtil.removeBeginSeparator(FileUtil.normalizePath(scriptZipPath.toString()))));
            } else {
                //收集动态脚本依赖
                dynamicScriptsDep.add(new ProjectDependencyItemDTO(dynamicScriptPO.getName(), script));
            }
        }
        //5. 导出服务器组件
        List<String> components = dependency.getComponents();
        if (components != null && !components.isEmpty()) {
            List<RemoteComponentPO> componentPoList = remoteComponentService.getRemoteComponents(components);
            for (RemoteComponentPO componentPO : componentPoList) {
                String component = componentPO.getUrl();
                Path componentZipPath = Path.of(AppBaseConfig.REMOTE_COMPONENT_PATH, component);
                serverComponentsDep.add(new ProjectDependencyItemDTO(componentPO.getComponentName(), AppBaseConfig.SEPARATOR + FileUtil.removeBeginSeparator(FileUtil.normalizePath(componentZipPath.toString()))));
            }
        }

        //6. 导出项目json数据
        if (dataJson == null) {
            ProjectDTO projectData = getProjectData(dependency.getId());
            if (projectData != null)
                dataJson = ProjectDataCodecUtil.decode(projectData.getDataJson());
        }

        ProjectDependenciesDTO dependencies = new ProjectDependenciesDTO();
        dependencies.setId(dependency.getId());
        dependencies.setName(dependency.getName());
        dependencies.setComponents(serverComponentsDep);
        dependencies.setFonts(fontDep);
        dependencies.setDynamicScripts(dynamicScriptsDep);
        dependencies.setImages(imageDep);
        dependencies.setProjectJson(dataJson);
        dependencies.setVersion(AppBaseConfig.VERSION);
        return dependencies;
    }

    @Override
    public List<ProjectDTO> getSubProjectList(Long id) {
        if (id == null)
            return List.of();
        User user = requireCurrentUser();
        requireAccessibleProject(id, user);
        LambdaQueryWrapper<ProjectPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(ProjectPO::getId, ProjectPO::getName, ProjectPO::getDes)
                .eq(ProjectPO::getPid, id)
                .eq(ProjectPO::getDeleted, 0);
        if (!user.isAdmin()) {
            queryWrapper.eq(ProjectPO::getUserId, user.getId());
        }
        return projectMapper.selectList(queryWrapper).stream().map(po -> {
            ProjectDTO projectDTO = new ProjectDTO();
            BeanUtils.copyProperties(po, projectDTO);
            return projectDTO;
        }).toList();
    }

    @Override
    public Long createSubProject(ProjectDTO dto) {
        User user = AppContextUtil.getCurrentUser();
        if (dto == null || user == null)
            return -1L;
        if (dto.getPid() != null) {
            requireAccessibleProject(dto.getPid(), user);
        }
        ProjectPO po = new ProjectPO();
        BeanUtils.copyProperties(dto, po);
        po.setId(null);
        po.setCover(null);
        po.setUserId(user.getId());
        projectMapper.insert(po);
        return po.getId();
    }

    @Override
    public Boolean deleteSubProject(Long pid, Long subId) {
        if (pid == null || subId == null)
            return false;
        User user = requireCurrentUser();
        requireAccessibleProject(pid, user);
        LambdaUpdateWrapper<ProjectPO> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(ProjectPO::getId, subId)
                .eq(ProjectPO::getPid, pid);
        if (!user.isAdmin()) {
            updateWrapper.eq(ProjectPO::getUserId, user.getId());
        }
        projectMapper.delete(updateWrapper);
        return true;
    }

    private LambdaQueryWrapper<ProjectPO> accessibleProjectQueryWrapper(Long id, User user) {
        LambdaQueryWrapper<ProjectPO> wrapper = new LambdaQueryWrapper<ProjectPO>()
                .eq(ProjectPO::getId, id)
                .eq(ProjectPO::getDeleted, 0);
        if (!user.isAdmin()) {
            wrapper.eq(ProjectPO::getUserId, user.getId());
        }
        return wrapper;
    }

    private LambdaUpdateWrapper<ProjectPO> accessibleProjectUpdateWrapper(Long id, User user) {
        LambdaUpdateWrapper<ProjectPO> wrapper = new LambdaUpdateWrapper<ProjectPO>()
                .eq(ProjectPO::getId, id)
                .eq(ProjectPO::getDeleted, 0);
        if (!user.isAdmin()) {
            wrapper.eq(ProjectPO::getUserId, user.getId());
        }
        return wrapper;
    }

    private void requireAccessibleProject(Long id, User user) {
        if (id == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        Long count = projectMapper.selectCount(accessibleProjectQueryWrapper(id, user));
        if (count == null || count <= 0) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
    }

    private void assertProjectParentAllowed(Long projectId, Long candidatePid, User user) {
        if (candidatePid == null) {
            return;
        }
        if (Objects.equals(projectId, candidatePid)) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "项目父级不能指向自身");
        }

        Long currentPid = candidatePid;
        Set<Long> visited = new HashSet<>();
        while (currentPid != null) {
            if (!visited.add(currentPid)) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "项目父级结构存在循环");
            }
            if (Objects.equals(projectId, currentPid)) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "项目父级不能指向子项目");
            }

            ProjectPO parent = projectMapper.selectOne(accessibleProjectQueryWrapper(currentPid, user)
                    .select(ProjectPO::getId, ProjectPO::getPid));
            if (parent == null) {
                throw new AppException(AppStatusCode.UNAUTHORIZED);
            }
            currentPid = parent.getPid();
        }
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    private void deleteStoredCoverFile(String fileName, Long projectId) {
        Path target = resolveStoredFile(AppBaseConfig.getCoverPath(), fileName);
        if (target == null) {
            if (StringUtils.isNotBlank(fileName)) {
                log.warn("Skip unsafe cover deletion, projectId:{}, fileName:{}", projectId, fileName);
            }
            return;
        }
        try {
            if (!Files.deleteIfExists(target)) {
                return;
            }
        } catch (IOException e) {
            log.error("Failed to delete old cover, projectId:{}, fileName:{}", projectId, fileName, e);
        }
    }

    private Path resolveStoredFile(String rootPath, String fileName) {
        if (StringUtils.isBlank(fileName)) {
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

    private void validateProjectName(String name) {
        if (name == null || name.codePoints().allMatch(codePoint ->
                Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint) || codePoint == 0xFEFF))
            throw new AppException(AppStatusCode.INVALID_PARAM, "项目名称不能为空");
        if (name.length() > MAX_PROJECT_NAME_LENGTH)
            throw new AppException(AppStatusCode.INVALID_PARAM, "项目名称不能超过50个字符");
    }
}
