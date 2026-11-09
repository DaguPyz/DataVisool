/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.zsq.datavisoolcommon.model.dto.ProjectDependenciesDTO;
import com.zsq.datavisoolservice.constants.ReleaseTypeEnum;
import com.zsq.datavisoolservice.executor.DataBaseExecuteFactory;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.CommonApiMapper;
import com.zsq.datavisoolservice.mapper.DatasourceMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeCommonApiMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeDatasourceMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.CommonApiDTO;
import com.zsq.datavisoolservice.model.dto.EncryptResultDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectDependencyParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectReleaseDTO;
import com.zsq.datavisoolservice.model.dto.ReleaseCommonApiDTO;
import com.zsq.datavisoolservice.model.dto.ReleaseDbExecutorDTO;
import com.zsq.datavisoolservice.model.po.CommonApiPO;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.model.po.ProjectReleasePO;
import com.zsq.datavisoolservice.model.po.ProjectReleaseRuntimeCommonApiPO;
import com.zsq.datavisoolservice.model.po.ProjectReleaseRuntimeDatasourcePO;
import com.zsq.datavisoolservice.security.HybridCryptoUtil;
import com.zsq.datavisoolservice.service.ProjectReleaseService;
import com.zsq.datavisoolservice.service.ProjectService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.ProjectDataCodecUtil;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.function.BiConsumer;

@Log4j2
@Service
public class ProjectReleaseServiceImpl extends ServiceImpl<ProjectReleaseMapper, ProjectReleasePO> implements ProjectReleaseService {

    @Resource
    private ProjectReleaseMapper projectReleaseMapper;

    @Resource
    private ProjectMapper projectMapper;

    @Resource
    private ProjectService projectService;

    @Resource
    private CommonApiMapper commonApiMapper;

    @Resource
    private DatasourceMapper datasourceMapper;

    @Resource
    private ProjectReleaseRuntimeDatasourceMapper runtimeDatasourceMapper;

    @Resource
    private ProjectReleaseRuntimeCommonApiMapper runtimeCommonApiMapper;

    private static final Pattern GLOBAL_VARIABLE_PATTERN = Pattern.compile("#\\{([-_0-9a-zA-Z]+)}");
    private static final Pattern SQL_IDENTIFIER_PATTERN = Pattern.compile("[A-Za-z_][0-9A-Za-z_$]*(\\.[A-Za-z_][0-9A-Za-z_$]*)*");
    private static final Pattern RELEASE_SCREEN_REFERENCE_PATTERN = Pattern.compile("__SCREEN_([0-9]+)__");
    private static final Set<String> SQL_IDENTIFIER_CONTEXT_KEYWORDS = Set.of("from", "join");

    @Override
    public Boolean updateProjectRelease(ProjectReleaseDTO projectReleaseDTO) {
        if (projectReleaseDTO == null || projectReleaseDTO.getId() == null)
            return null;
        User user = requireCurrentUser();
        ProjectReleasePO existing = projectReleaseMapper.selectOne(accessibleReleaseWrapper(user)
                .select(ProjectReleasePO::getId, ProjectReleasePO::getEncrypt, ProjectReleasePO::getPassword)
                .eq(ProjectReleasePO::getId, projectReleaseDTO.getId()));
        if (existing == null)
            return false;
        String nextPassword = resolveNextReleasePassword(projectReleaseDTO.getPassword(), existing.getPassword());
        Boolean nextEncrypt = projectReleaseDTO.getEncrypt() == null ? existing.getEncrypt() : projectReleaseDTO.getEncrypt();
        requirePasswordWhenEncrypted(nextEncrypt, nextPassword);

        ProjectReleasePO projectReleasePO = new ProjectReleasePO();
        projectReleasePO.setName(projectReleaseDTO.getName());
        projectReleasePO.setState(projectReleaseDTO.getState());
        projectReleasePO.setEncrypt(projectReleaseDTO.getEncrypt());
        projectReleasePO.setExpirationDate(projectReleaseDTO.getExpirationDate());
        if (projectReleaseDTO.getPassword() != null)
            projectReleasePO.setPassword(nextPassword);
        LambdaQueryWrapper<ProjectReleasePO> wrapper = accessibleReleaseWrapper(user)
                .eq(ProjectReleasePO::getId, projectReleaseDTO.getId());
        return projectReleaseMapper.update(projectReleasePO, wrapper) > 0;
    }

    @Override
    public ProjectReleaseDTO getProjectReleaseData(ProjectReleaseDTO projectReleaseDTO) {
        if (projectReleaseDTO == null || projectReleaseDTO.getId() == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        ProjectReleasePO projectReleasePO = getRuntimeRelease(projectReleaseDTO.getId(), projectReleaseDTO.getPassword());
        ProjectReleaseDTO releaseDTO = new ProjectReleaseDTO();
        releaseDTO.setId(projectReleaseDTO.getId());
        releaseDTO.setDataJson(projectReleasePO.getDataJson());
        releaseDTO.setName(projectReleasePO.getName());
        return releaseDTO;
    }

    @Override
    public CommonApiDTO getReleaseCommonApi(ReleaseCommonApiDTO releaseCommonApiDTO) {
        if (releaseCommonApiDTO == null || releaseCommonApiDTO.getReleaseId() == null || releaseCommonApiDTO.getCommonApiId() == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        ProjectReleasePO release = getRuntimeRelease(releaseCommonApiDTO.getReleaseId(), releaseCommonApiDTO.getPassword());
        Long commonApiId = releaseCommonApiDTO.getCommonApiId();
        ProjectReleaseRuntimeCommonApiPO runtimeCommonApi = getReleaseRuntimeCommonApi(release, commonApiId);
        if (runtimeCommonApi == null)
            throw new AppException(AppStatusCode.UNAUTHORIZED, "公共API不属于当前发布项目");

        CommonApiDTO commonApiDTO = new CommonApiDTO();
        commonApiDTO.setId(runtimeCommonApi.getCommonApiId());
        commonApiDTO.setName(runtimeCommonApi.getName());
        commonApiDTO.setUrl(runtimeCommonApi.getUrl());
        commonApiDTO.setMethod(runtimeCommonApi.getMethod());
        commonApiDTO.setParams(runtimeCommonApi.getParams());
        commonApiDTO.setHeaders(runtimeCommonApi.getHeaders());
        return commonApiDTO;
    }

    @Override
    public Object executeReleaseDatabase(ReleaseDbExecutorDTO releaseDbExecutorDTO) {
        if (releaseDbExecutorDTO == null || releaseDbExecutorDTO.getReleaseId() == null
                || releaseDbExecutorDTO.getRuntimeDataSourceId() == null || releaseDbExecutorDTO.getRuntimeDataSourceId().isBlank())
            throw new AppException(AppStatusCode.INVALID_PARAM);
        ProjectReleasePO release = getRuntimeRelease(releaseDbExecutorDTO.getReleaseId(), releaseDbExecutorDTO.getPassword());
        ProjectReleaseRuntimeDatasourcePO runtimeDatasource = getReleaseRuntimeDatasource(release, releaseDbExecutorDTO.getRuntimeDataSourceId());
        if (runtimeDatasource == null)
            throw new AppException(AppStatusCode.UNAUTHORIZED, "数据库数据源不属于当前发布项目");

        CommonDatabasePO commonDatabasePO = datasourceMapper.selectOne(new LambdaQueryWrapper<CommonDatabasePO>()
                .select(CommonDatabasePO::getId,
                        CommonDatabasePO::getName,
                        CommonDatabasePO::getUsername,
                        CommonDatabasePO::getPassword,
                        CommonDatabasePO::getType,
                        CommonDatabasePO::getIp,
                        CommonDatabasePO::getPort,
                        CommonDatabasePO::getDatabaseName,
                        CommonDatabasePO::getUrl,
                        CommonDatabasePO::getAllowSqlScript)
                .eq(CommonDatabasePO::getId, runtimeDatasource.getTargetDb())
                .eq(CommonDatabasePO::getUserId, release.getUserId()));
        if (commonDatabasePO == null)
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "数据连接不存在");
        PreparedSql preparedSql = buildPreparedSql(runtimeDatasource.getSqlTemplate(), releaseDbExecutorDTO.getVariables());
        if (!preparedSql.sql().trim().toLowerCase().startsWith("select"))
            throw new AppException(AppStatusCode.INVALID_PARAM, "sql必须以select开头");
        JdbcTemplate jdbcTemplate = DataBaseExecuteFactory.buildJdbcTemplate(commonDatabasePO);
        try {
            return jdbcTemplate.queryForList(preparedSql.sql(), preparedSql.args().toArray());
        } catch (Exception e) {
            log.error("发布态数据库SQL执行异常, releaseId:{}, runtimeDataSourceId:{}, targetDb:{}, sql:{}",
                    release.getId(), runtimeDatasource.getRuntimeDataSourceId(), runtimeDatasource.getTargetDb(), preparedSql.sql(), e);
            DataBaseExecuteFactory.removeCache(commonDatabasePO.getId());
            throw new AppException(AppStatusCode.SYSTEM_ERR, "sql执行失败，请联系管理员");
        }
    }

    @Override
    public Long createProjectRelease(ProjectReleaseDTO projectReleaseDTO) {
        if (projectReleaseDTO == null)
            return null;
        User user = requireCurrentUser();
        requireAccessibleProject(projectReleaseDTO.getProjectId(), user);
        ProjectReleasePO projectReleasePO = new ProjectReleasePO();
        BeanUtils.copyProperties(projectReleaseDTO, projectReleasePO);
        projectReleasePO.setDeleted(0);
        projectReleasePO.setState(1);
        projectReleasePO.setUserId(user.getId());
        if (Boolean.TRUE.equals(projectReleaseDTO.getEncrypt()))
            projectReleasePO.setPassword(requireSubmittedReleasePassword(projectReleaseDTO.getPassword()));
        int res = projectReleaseMapper.insert(projectReleasePO);
        if (res < 1)
            throw new AppException(AppStatusCode.SYSTEM_ERR, "发布项目失败");
        return projectReleasePO.getId();
    }

    @Override
    public ProjectReleaseDTO getProjectReleaseInfo(Long id) {
        if (id == null)
            return null;
        LambdaQueryWrapper<ProjectReleasePO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(ProjectReleasePO::getState, ProjectReleasePO::getEncrypt).eq(ProjectReleasePO::getId, id);
        ProjectReleasePO projectReleasePO = projectReleaseMapper.selectOne(queryWrapper);
        if (projectReleasePO == null)
            return null;
        ProjectReleaseDTO projectReleaseDTO = new ProjectReleaseDTO();
        BeanUtils.copyProperties(projectReleasePO, projectReleaseDTO);
        return projectReleaseDTO;
    }

    @Override
    public ProjectReleaseDTO getLatestReleaseByProjectId(Long projectId) {
        if (projectId == null)
            return null;
        LambdaQueryWrapper<ProjectReleasePO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(ProjectReleasePO::getId).eq(ProjectReleasePO::getProjectId, projectId).orderByDesc(ProjectReleasePO::getUpdateTime).last("limit 1");
        ProjectReleasePO projectReleasePO = projectReleaseMapper.selectOne(queryWrapper);
        if (projectReleasePO == null)
            return null;
        ProjectReleaseDTO projectReleaseDTO = new ProjectReleaseDTO();
        BeanUtils.copyProperties(projectReleasePO, projectReleaseDTO);
        return projectReleaseDTO;
    }

    @Override
    public Page<ProjectReleaseDTO> getProjectReleasePageList(PageParamDTO pageParamDTO) {
        if (pageParamDTO == null)
            return new Page<>();
        User user = AppContextUtil.getCurrentUser();
        Page<ProjectReleasePO> page = new Page<>();
        page.setSize(pageParamDTO.getSize() == 0 ? 10 : pageParamDTO.getSize());
        page.setCurrent(pageParamDTO.getCurrent() == 0 ? 1 : pageParamDTO.getCurrent());
        LambdaQueryWrapper<ProjectReleasePO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(
                        ProjectReleasePO::getId,
                        ProjectReleasePO::getName,
                        ProjectReleasePO::getState,
                        ProjectReleasePO::getExpirationDate,
                        ProjectReleasePO::getEncrypt,
                        ProjectReleasePO::getCreateTime,
                        ProjectReleasePO::getUpdateTime
                ).eq(ProjectReleasePO::getDeleted, 0)
                .and(w -> w.isNull(ProjectReleasePO::getGroupId)
                        .or(w2 -> w2.isNotNull(ProjectReleasePO::getGroupId)
                                .eq(ProjectReleasePO::getGroupMain, 1)))
                .orderByDesc(ProjectReleasePO::getUpdateTime);

        if (pageParamDTO.getSearchValue() != null && !pageParamDTO.getSearchValue().isEmpty())
            wrapper.like(ProjectReleasePO::getName, pageParamDTO.getSearchValue());
        if (!user.getRoles().contains("ROLE_SYSTEM_ADMIN"))
            wrapper.eq(ProjectReleasePO::getUserId, user.getId());
        Page<ProjectReleasePO> projectReleasePOPage = projectReleaseMapper.selectPage(page, wrapper);
        Page<ProjectReleaseDTO> projectReleaseDTOPage = new Page<>();
        BeanUtils.copyProperties(projectReleasePOPage, projectReleaseDTOPage);

        List<ProjectReleaseDTO> projectReleaseDTOList = new ArrayList<>();
        for (ProjectReleasePO projectReleasePO : projectReleasePOPage.getRecords()) {
            ProjectReleaseDTO projectReleaseDTO = new ProjectReleaseDTO();
            BeanUtils.copyProperties(projectReleasePO, projectReleaseDTO);
            if (projectReleasePO.getCreateTime() != null)
                projectReleaseDTO.setCreateTime(projectReleasePO.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            if (projectReleasePO.getUpdateTime() != null)
                projectReleaseDTO.setUpdateTime(projectReleasePO.getUpdateTime().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            projectReleaseDTOList.add(projectReleaseDTO);
        }
        projectReleaseDTOPage.setRecords(projectReleaseDTOList);
        return projectReleaseDTOPage;
    }

    /**
     * 发布项目
     * 项目发布，支持单个项目发布，与多个项目同时发布多个项目发布的场景。 通常为一个项目关联了其他多个项目。
     * 对于这种情况，当前项目为主项目。 被关联的项目为子项目。 加密只对主项目加密子项密不做加密。 如果存在加密设置的话
     *
     * @param projectReleaseDTO 项目发布信息
     * @return 发布连接
     */
    @Override
    @Transactional
    public String releaseProject(ProjectReleaseDTO projectReleaseDTO) {
        if (projectReleaseDTO == null || projectReleaseDTO.getProjectId() == null)
            throw new AppException(AppStatusCode.INVALID_PARAM);
        List<ProjectDependencyParamDTO> dependencies = projectReleaseDTO.getDependencies();
        if (dependencies == null || dependencies.isEmpty())
            throw new AppException(AppStatusCode.INVALID_PARAM, "依赖不能为空");
        User user = requireCurrentUser();
        validateReleaseProjects(projectReleaseDTO, dependencies, user);
        if (projectReleaseDTO.getReleaseType() == null)
            projectReleaseDTO.setReleaseType(ReleaseTypeEnum.OVERWRITE);

        String releaseId = "";
        // 覆盖发布
        if (ReleaseTypeEnum.OVERWRITE.equals(projectReleaseDTO.getReleaseType()))
            releaseId = overridePublish(projectReleaseDTO, dependencies);
        // 增量发布
        if (ReleaseTypeEnum.INCREMENT.equals(projectReleaseDTO.getReleaseType()))
            releaseId = incrementPublish(projectReleaseDTO, dependencies);
        return releaseId;
    }

    @Override
    public Boolean batchDelProjectRelease(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = requireCurrentUser();
        LambdaQueryWrapper<ProjectReleasePO> wrapper = new LambdaQueryWrapper<>();
        applyReleaseAccess(wrapper, user);
        wrapper.in(ProjectReleasePO::getId, ids);
        List<ProjectReleasePO> poList = projectReleaseMapper.selectList(wrapper);
        if (poList.isEmpty())
            return false;
        List<Long> groupIdList = poList.stream()
                .map(ProjectReleasePO::getGroupId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        LambdaQueryWrapper<ProjectReleasePO> delWrapper = accessibleReleaseWrapper(user);
        delWrapper.and(wr -> {
            if (!groupIdList.isEmpty())
                wr.in(ProjectReleasePO::getGroupId, groupIdList).or();
            wr.in(ProjectReleasePO::getId, ids);
        });
        Set<Long> runtimeReleaseIds = poList.stream()
                .map(ProjectReleasePO::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!groupIdList.isEmpty()) {
            LambdaQueryWrapper<ProjectReleasePO> runtimeWrapper = accessibleReleaseWrapper(user);
            runtimeWrapper.select(ProjectReleasePO::getId)
                    .in(ProjectReleasePO::getGroupId, groupIdList);
            runtimeReleaseIds.addAll(projectReleaseMapper.selectList(runtimeWrapper)
                    .stream()
                    .map(ProjectReleasePO::getId)
                    .toList());
        }
        boolean deleted = projectReleaseMapper.delete(delWrapper) > 0;
        if (deleted)
            removeReleaseRuntimeResources(runtimeReleaseIds);
        return deleted;
    }

    //=============================内部逻辑 私有方法=============================//

    /**
     * 覆盖发布
     *
     * @param projectReleaseDTO 项目发布信息
     * @param dependencies      项目依赖
     */
    public String overridePublish(ProjectReleaseDTO projectReleaseDTO, List<ProjectDependencyParamDTO> dependencies) {
        User user = requireCurrentUser();
        //判断当前项目是否已经存在过发布记录
        Long mainId = projectReleaseDTO.getProjectId();
        LambdaQueryWrapper<ProjectReleasePO> queryWrapper = accessibleReleaseWrapper(user);
        queryWrapper.select(ProjectReleasePO::getId, ProjectReleasePO::getGroupId, ProjectReleasePO::getProjectMap, ProjectReleasePO::getUserId)
                .eq(ProjectReleasePO::getProjectId, mainId)
                .and(wrapper -> wrapper.eq(ProjectReleasePO::getGroupMain, 1))
                .orderByDesc(ProjectReleasePO::getUpdateTime).last("limit 1");
        ProjectReleasePO projectReleasePO = projectReleaseMapper.selectOne(queryWrapper);
        String releaseId = "";
        if (projectReleasePO == null) {
            //首次覆盖发布，走增量发布逻辑，创建全新的发布内容
            releaseId = incrementPublish(projectReleaseDTO, dependencies);
        } else {
            String projectMapStr = projectReleasePO.getProjectMap();
            Map<Long, Long> projectReleaseMap = new LinkedHashMap<>();
            if (projectMapStr != null && !projectMapStr.isBlank()) {
                projectMapStr = projectMapStr.replaceAll("\\s", "");
                Arrays.stream(projectMapStr.split(",")).forEach(map -> {
                    String[] idStr = map.split(":");
                    projectReleaseMap.put(Long.valueOf(idStr[0]), Long.valueOf(idStr[1]));
                });
            }
            Long mappedMainId = projectReleaseMap.putIfAbsent(mainId, projectReleasePO.getId());
            if (mappedMainId != null && !mappedMainId.equals(projectReleasePO.getId()))
                throw new AppException(AppStatusCode.DATA_EXCEPTION, "发布项目的主页面映射不一致");
            for (ProjectDependencyParamDTO dependency : dependencies)
                projectReleaseMap.computeIfAbsent(dependency.getId(), ignored -> IdWorker.getId());
            Long groupId = projectReleasePO.getGroupId();
            if (groupId == null && projectReleaseMap.size() > 1) groupId = IdWorker.getId();
            String projectMap = projectReleaseMap.entrySet().stream()
                    .map(entry -> entry.getKey() + ":" + entry.getValue()).collect(Collectors.joining(","));
            rewriteReleaseReferences(dependencies, projectReleaseMap);
            for (ProjectDependencyParamDTO dependency : dependencies) {
                Long currentReleaseId = projectReleaseMap.get(dependency.getId());
                Long ownerUserId = projectReleasePO.getUserId() == null ? user.getId() : projectReleasePO.getUserId();
                dependency.setProjectJson(prepareReleaseRuntimeResources(currentReleaseId, ownerUserId, dependency.getProjectJson()));
                ProjectDependenciesDTO projectDependency = projectService.calculateProjectDependency(dependency);
                projectDependency.setProjectJson(dependency.getProjectJson());
                ProjectReleasePO po = new ProjectReleasePO();
                po.setDataJson(JSON.toJSONString(projectDependency));
                po.setName(dependency.getName());
                po.setId(currentReleaseId);
                po.setExpirationDate(projectReleaseDTO.getExpirationDate());
                po.setState(1);
                po.setProjectId(projectReleaseDTO.getProjectId());
                po.setUserId(ownerUserId);
                po.setGroupId(groupId);
                if (dependency.getId().equals(mainId)) {
                    po.setGroupMain(1);
                    po.setProjectMap(projectMap);
                    po.setEncrypt(projectReleaseDTO.getEncrypt());
                    if (Boolean.TRUE.equals(projectReleaseDTO.getEncrypt()))
                        po.setPassword(requireSubmittedReleasePassword(projectReleaseDTO.getPassword()));
                }
                if (!this.saveOrUpdate(po)) throw new AppException(AppStatusCode.DATA_EXCEPTION, "保存发布项目失败");
            }
            releaseId = projectReleaseMap.get(mainId).toString();
        }
        return releaseId;
    }

    /**
     * 增量发布
     *
     * @param projectReleaseDTO 项目发布信息
     * @param dependencies      项目依赖
     */
    public String incrementPublish(ProjectReleaseDTO projectReleaseDTO, List<ProjectDependencyParamDTO> dependencies) {
        User user = requireCurrentUser();

        Long mainId = projectReleaseDTO.getProjectId();
        boolean groupRelease = dependencies.size() > 1;
        Long groupId = IdWorker.getId();

        Map<Long, Long> releaseIdMap = dependencies.stream().collect(Collectors.toMap(
                ProjectDependencyParamDTO::getId,
                dependency -> IdWorker.getId()
        ));
        String projectMap = releaseIdMap.entrySet().stream().map(entry -> entry.getKey() + ":" + entry.getValue()).collect(Collectors.joining(","));

        rewriteReleaseReferences(dependencies, releaseIdMap);

        for (ProjectDependencyParamDTO dependency : dependencies) {
            Long currentReleaseId = releaseIdMap.get(dependency.getId());
            dependency.setProjectJson(prepareReleaseRuntimeResources(currentReleaseId, user.getId(), dependency.getProjectJson()));
            ProjectDependenciesDTO projectDependency = projectService.calculateProjectDependency(dependency);
            projectDependency.setProjectJson(dependency.getProjectJson());
            ProjectReleasePO po = new ProjectReleasePO();

            po.setDataJson(JSON.toJSONString(projectDependency));
            po.setName(dependency.getName());
            po.setId(currentReleaseId);
            po.setExpirationDate(projectReleaseDTO.getExpirationDate());
            po.setState(1);
            po.setUserId(user.getId());
            po.setProjectId(projectReleaseDTO.getProjectId());
            if (groupRelease)
                po.setGroupId(groupId);
            if (dependency.getId().equals(mainId)) {
                po.setGroupMain(1);
                po.setProjectMap(projectMap);
            }
            if (dependency.getId().equals(mainId)) {
                po.setEncrypt(projectReleaseDTO.getEncrypt());
                if (Boolean.TRUE.equals(projectReleaseDTO.getEncrypt()))
                    po.setPassword(requireSubmittedReleasePassword(projectReleaseDTO.getPassword()));
            }
            if (!this.saveOrUpdate(po)) throw new AppException(AppStatusCode.DATA_EXCEPTION, "保存发布项目失败");
        }
        return releaseIdMap.get(mainId).toString();
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            throw new AppException(AppStatusCode.UN_LOGGED_IN);
        return user;
    }

    private LambdaQueryWrapper<ProjectReleasePO> accessibleReleaseWrapper(User user) {
        LambdaQueryWrapper<ProjectReleasePO> wrapper = new LambdaQueryWrapper<>();
        applyReleaseAccess(wrapper, user);
        return wrapper;
    }

    private void applyReleaseAccess(LambdaQueryWrapper<ProjectReleasePO> wrapper, User user) {
        if (!user.isAdmin())
            wrapper.eq(ProjectReleasePO::getUserId, user.getId());
    }

    private String prepareReleaseRuntimeResources(Long releaseId, Long ownerUserId, String rawProjectJson) {
        if (releaseId == null || rawProjectJson == null || rawProjectJson.isBlank())
            return rawProjectJson;
        String projectJson = ProjectDataCodecUtil.decode(rawProjectJson);
        Object projectData = JSON.parse(projectJson);
        List<ProjectReleaseRuntimeDatasourcePO> runtimeDataSources = new ArrayList<>();
        Map<Long, String> runtimeCommonApiRefs = new LinkedHashMap<>();
        collectReleaseRuntimeResources(projectData, "$", new ArrayList<>(), null, null, releaseId, runtimeDataSources, runtimeCommonApiRefs);
        removeReleaseRuntimeResources(List.of(releaseId));
        for (ProjectReleaseRuntimeDatasourcePO runtimeDataSource : runtimeDataSources)
            runtimeDatasourceMapper.insert(runtimeDataSource);
        insertReleaseRuntimeCommonApis(releaseId, ownerUserId, runtimeCommonApiRefs);
        String nextProjectJson = JSON.toJSONString(projectData);
        boolean preferCompressed = ProjectDataCodecUtil.isCompressed(rawProjectJson);
        return preferCompressed ? ProjectDataCodecUtil.encode(nextProjectJson) : nextProjectJson;
    }

    private void collectReleaseRuntimeResources(Object value, String path, List<String> pathKeys,
                                                Object parent, String key, Long releaseId,
                                                List<ProjectReleaseRuntimeDatasourcePO> runtimeDataSources,
                                                Map<Long, String> runtimeCommonApiRefs) {
        if (value instanceof JSONObject object) {
            if (isReleaseRuntimeDataSourceContext(pathKeys, parent, key)) {
                if ("database".equals(object.getString("sourceType"))) {
                    JSONObject database = object.getJSONObject("database");
                    addReleaseRuntimeDataSource(database, path + ".database", releaseId, runtimeDataSources);
                }
                if ("commonApi".equals(object.getString("sourceType"))) {
                    JSONObject commonApi = object.getJSONObject("commonApi");
                    addReleaseRuntimeCommonApiRef(commonApi, path + ".commonApi", runtimeCommonApiRefs);
                }
            }
            for (String childKey : object.keySet()) {
                List<String> childPathKeys = new ArrayList<>(pathKeys);
                childPathKeys.add(childKey);
                collectReleaseRuntimeResources(object.get(childKey), path + "." + childKey, childPathKeys,
                        object, childKey, releaseId, runtimeDataSources, runtimeCommonApiRefs);
            }
            return;
        }
        if (value instanceof JSONArray array) {
            for (int i = 0; i < array.size(); i++) {
                List<String> childPathKeys = new ArrayList<>(pathKeys);
                childPathKeys.add(String.valueOf(i));
                collectReleaseRuntimeResources(array.get(i), path + "[" + i + "]", childPathKeys,
                        array, String.valueOf(i), releaseId, runtimeDataSources, runtimeCommonApiRefs);
            }
        }
    }

    private boolean isReleaseRuntimeDataSourceContext(List<String> pathKeys, Object parent, String key) {
        return isComponentDataConfigContext(pathKeys, key)
                || isGlobalVariableTriggerSourceContext(pathKeys, key)
                || isGisDataConfigContext(pathKeys, parent, key);
    }

    private boolean isComponentDataConfigContext(List<String> pathKeys, String key) {
        return "data".equals(key) && endsWithPath(pathKeys, "elemConfigs", "*", "data");
    }

    private boolean isGlobalVariableTriggerSourceContext(List<String> pathKeys, String key) {
        return "triggerSource".equals(key) && endsWithPath(pathKeys, "globalVariableManager", "globalVariables", "*", "triggerSource");
    }

    private boolean isGisDataConfigContext(List<String> pathKeys, Object parent, String key) {
        if (!"dataConfig".equals(key) || !endsWithPath(pathKeys, "elemConfigs", "*", "style", "sources", "*", "dataConfig"))
            return false;
        if (!(parent instanceof JSONObject sourceConfig))
            return false;
        return "geojson".equals(sourceConfig.getString("sourceType"))
                && "dataConfig".equals(sourceConfig.getString("dataMode"));
    }

    private boolean endsWithPath(List<String> pathKeys, String... suffix) {
        if (pathKeys == null || pathKeys.size() < suffix.length)
            return false;
        int start = pathKeys.size() - suffix.length;
        for (int i = 0; i < suffix.length; i++) {
            String expected = suffix[i];
            if (!"*".equals(expected) && !Objects.equals(expected, pathKeys.get(start + i)))
                return false;
        }
        return true;
    }

    private void addReleaseRuntimeDataSource(JSONObject database, String sourcePath, Long releaseId, List<ProjectReleaseRuntimeDatasourcePO> runtimeDataSources) {
        if (database == null)
            return;
        String sqlTemplate = database.getString("sql");
        Long targetDb = parseLongValue(database.get("targetDb"));
        if (targetDb == null || sqlTemplate == null || sqlTemplate.isBlank())
            return;
        String runtimeDataSourceId = buildRuntimeDataSourceId(releaseId, sourcePath, targetDb, sqlTemplate);
        database.put("runtimeDataSourceId", runtimeDataSourceId);

        ProjectReleaseRuntimeDatasourcePO runtimeDataSource = new ProjectReleaseRuntimeDatasourcePO();
        runtimeDataSource.setReleaseId(releaseId);
        runtimeDataSource.setRuntimeDataSourceId(runtimeDataSourceId);
        runtimeDataSource.setTargetDb(targetDb);
        runtimeDataSource.setSqlTemplate(sqlTemplate);
        runtimeDataSource.setVariableKeys(JSON.toJSONString(collectVariableKeys(sqlTemplate)));
        runtimeDataSource.setSourcePath(sourcePath);
        runtimeDataSources.add(runtimeDataSource);
    }

    private void addReleaseRuntimeCommonApiRef(JSONObject commonApi, String sourcePath, Map<Long, String> runtimeCommonApiRefs) {
        if (commonApi == null)
            return;
        Long commonApiId = parseLongValue(commonApi.get("commonApiId"));
        if (commonApiId != null)
            runtimeCommonApiRefs.putIfAbsent(commonApiId, sourcePath);
    }

    private void insertReleaseRuntimeCommonApis(Long releaseId, Long ownerUserId, Map<Long, String> runtimeCommonApiRefs) {
        if (releaseId == null || ownerUserId == null || runtimeCommonApiRefs == null || runtimeCommonApiRefs.isEmpty())
            return;
        List<CommonApiPO> commonApiList = commonApiMapper.selectList(new LambdaQueryWrapper<CommonApiPO>()
                .select(CommonApiPO::getId,
                        CommonApiPO::getName,
                        CommonApiPO::getUrl,
                        CommonApiPO::getParams,
                        CommonApiPO::getMethod,
                        CommonApiPO::getHeaders)
                .in(CommonApiPO::getId, runtimeCommonApiRefs.keySet())
                .eq(CommonApiPO::getUserId, ownerUserId));
        Map<Long, CommonApiPO> commonApiMap = commonApiList.stream()
                .collect(Collectors.toMap(CommonApiPO::getId, item -> item, (left, right) -> left));
        for (Map.Entry<Long, String> entry : runtimeCommonApiRefs.entrySet()) {
            CommonApiPO commonApi = commonApiMap.get(entry.getKey());
            if (commonApi == null)
                continue;
            ProjectReleaseRuntimeCommonApiPO runtimeCommonApi = new ProjectReleaseRuntimeCommonApiPO();
            runtimeCommonApi.setReleaseId(releaseId);
            runtimeCommonApi.setCommonApiId(commonApi.getId());
            runtimeCommonApi.setName(commonApi.getName());
            runtimeCommonApi.setUrl(commonApi.getUrl());
            runtimeCommonApi.setMethod(commonApi.getMethod());
            runtimeCommonApi.setParams(commonApi.getParams());
            runtimeCommonApi.setHeaders(commonApi.getHeaders());
            runtimeCommonApi.setSourcePath(entry.getValue());
            runtimeCommonApiMapper.insert(runtimeCommonApi);
        }
    }

    private String buildRuntimeDataSourceId(Long releaseId, String sourcePath, Long targetDb, String sqlTemplate) {
        String source = releaseId + ":" + sourcePath + ":" + targetDb + ":" + sqlTemplate;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(source.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte item : bytes)
                builder.append(String.format("%02x", item));
            return builder.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new AppException(AppStatusCode.SYSTEM_ERR, "生成发布态数据源ID失败");
        }
    }

    private Set<String> collectVariableKeys(String sqlTemplate) {
        Set<String> keys = new LinkedHashSet<>();
        Matcher matcher = GLOBAL_VARIABLE_PATTERN.matcher(sqlTemplate == null ? "" : sqlTemplate);
        while (matcher.find())
            keys.add(matcher.group(1));
        return keys;
    }

    private void removeReleaseRuntimeDataSources(Collection<Long> releaseIds) {
        if (releaseIds == null || releaseIds.isEmpty())
            return;
        runtimeDatasourceMapper.delete(new LambdaQueryWrapper<ProjectReleaseRuntimeDatasourcePO>()
                .in(ProjectReleaseRuntimeDatasourcePO::getReleaseId, releaseIds));
    }

    private void removeReleaseRuntimeCommonApis(Collection<Long> releaseIds) {
        if (releaseIds == null || releaseIds.isEmpty())
            return;
        runtimeCommonApiMapper.delete(new LambdaQueryWrapper<ProjectReleaseRuntimeCommonApiPO>()
                .in(ProjectReleaseRuntimeCommonApiPO::getReleaseId, releaseIds));
    }

    private void removeReleaseRuntimeResources(Collection<Long> releaseIds) {
        removeReleaseRuntimeDataSources(releaseIds);
        removeReleaseRuntimeCommonApis(releaseIds);
    }

    private ProjectReleaseRuntimeDatasourcePO getReleaseRuntimeDatasource(ProjectReleasePO release, String runtimeDataSourceId) {
        List<Long> releaseIds = getRelatedReleaseIds(release);
        if (releaseIds.isEmpty())
            return null;
        return runtimeDatasourceMapper.selectOne(new LambdaQueryWrapper<ProjectReleaseRuntimeDatasourcePO>()
                .select(ProjectReleaseRuntimeDatasourcePO::getId,
                        ProjectReleaseRuntimeDatasourcePO::getReleaseId,
                        ProjectReleaseRuntimeDatasourcePO::getRuntimeDataSourceId,
                        ProjectReleaseRuntimeDatasourcePO::getTargetDb,
                        ProjectReleaseRuntimeDatasourcePO::getSqlTemplate,
                        ProjectReleaseRuntimeDatasourcePO::getVariableKeys)
                .in(ProjectReleaseRuntimeDatasourcePO::getReleaseId, releaseIds)
                .eq(ProjectReleaseRuntimeDatasourcePO::getRuntimeDataSourceId, runtimeDataSourceId)
                .last("limit 1"));
    }

    private ProjectReleaseRuntimeCommonApiPO getReleaseRuntimeCommonApi(ProjectReleasePO release, Long commonApiId) {
        List<Long> releaseIds = getRelatedReleaseIds(release);
        if (releaseIds.isEmpty())
            return null;
        return runtimeCommonApiMapper.selectOne(new LambdaQueryWrapper<ProjectReleaseRuntimeCommonApiPO>()
                .select(ProjectReleaseRuntimeCommonApiPO::getId,
                        ProjectReleaseRuntimeCommonApiPO::getReleaseId,
                        ProjectReleaseRuntimeCommonApiPO::getCommonApiId,
                        ProjectReleaseRuntimeCommonApiPO::getName,
                        ProjectReleaseRuntimeCommonApiPO::getUrl,
                        ProjectReleaseRuntimeCommonApiPO::getMethod,
                        ProjectReleaseRuntimeCommonApiPO::getParams,
                        ProjectReleaseRuntimeCommonApiPO::getHeaders)
                .in(ProjectReleaseRuntimeCommonApiPO::getReleaseId, releaseIds)
                .eq(ProjectReleaseRuntimeCommonApiPO::getCommonApiId, commonApiId)
                .last("limit 1"));
    }

    private List<Long> getRelatedReleaseIds(ProjectReleasePO release) {
        if (release.getGroupId() == null)
            return List.of(release.getId());
        return projectReleaseMapper.selectList(new LambdaQueryWrapper<ProjectReleasePO>()
                        .select(ProjectReleasePO::getId)
                        .eq(ProjectReleasePO::getGroupId, release.getGroupId()))
                .stream()
                .map(ProjectReleasePO::getId)
                .toList();
    }

    private PreparedSql buildPreparedSql(String sqlTemplate, Map<String, Object> variables) {
        if (sqlTemplate == null || sqlTemplate.isBlank())
            throw new AppException(AppStatusCode.INVALID_PARAM, "sql不能为空");
        Set<String> allowedVariableKeys = collectVariableKeys(sqlTemplate);
        Map<String, Object> safeVariables = variables == null ? Collections.emptyMap() : variables;
        for (String key : safeVariables.keySet()) {
            if (!allowedVariableKeys.contains(key))
                throw new AppException(AppStatusCode.INVALID_PARAM, "存在未声明的全局变量: " + key);
        }

        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder();
        int index = 0;
        while (index < sqlTemplate.length()) {
            char current = sqlTemplate.charAt(index);
            if (current == '\'' || current == '"') {
                int quoteEnd = findSqlQuoteEnd(sqlTemplate, index, current);
                if (quoteEnd > index) {
                    String quoteContent = sqlTemplate.substring(index + 1, quoteEnd);
                    if (GLOBAL_VARIABLE_PATTERN.matcher(quoteContent).find()) {
                        sql.append("?");
                        args.add(buildQuotedSqlArg(quoteContent, current, safeVariables));
                    } else {
                        sql.append(sqlTemplate, index, quoteEnd + 1);
                    }
                    index = quoteEnd + 1;
                    continue;
                }
            }
            if (sqlTemplate.startsWith("#{", index)) {
                int expressionEnd = sqlTemplate.indexOf('}', index + 2);
                if (expressionEnd > index) {
                    String key = sqlTemplate.substring(index + 2, expressionEnd);
                    requireDeclaredSqlVariable(safeVariables, key);
                    if (isIdentifierVariableContext(sqlTemplate, index)) {
                        sql.append(normalizeSqlIdentifier(safeVariables.get(key), key));
                    } else {
                        sql.append("?");
                        args.add(normalizeSqlArg(safeVariables.get(key)));
                    }
                    index = expressionEnd + 1;
                    continue;
                }
            }
            sql.append(current);
            index++;
        }
        return new PreparedSql(sql.toString(), args);
    }

    private Object buildQuotedSqlArg(String quoteContent, char quote, Map<String, Object> variables) {
        Matcher matcher = GLOBAL_VARIABLE_PATTERN.matcher(quoteContent);
        StringBuilder arg = new StringBuilder();
        int lastEnd = 0;
        while (matcher.find()) {
            String key = matcher.group(1);
            requireDeclaredSqlVariable(variables, key);
            arg.append(unescapeSqlQuoteContent(quoteContent.substring(lastEnd, matcher.start()), quote));
            arg.append(normalizeSqlArg(variables.get(key)));
            lastEnd = matcher.end();
        }
        arg.append(unescapeSqlQuoteContent(quoteContent.substring(lastEnd), quote));
        return arg.toString();
    }

    private String unescapeSqlQuoteContent(String value, char quote) {
        return value.replace(String.valueOf(quote) + quote, String.valueOf(quote));
    }

    private void requireDeclaredSqlVariable(Map<String, Object> variables, String key) {
        if (!variables.containsKey(key))
            throw new AppException(AppStatusCode.INVALID_PARAM, "缺少全局变量: " + key);
    }

    private int findSqlQuoteEnd(String sqlTemplate, int quoteStart, char quote) {
        for (int i = quoteStart + 1; i < sqlTemplate.length(); i++) {
            if (sqlTemplate.charAt(i) != quote)
                continue;
            if (i + 1 < sqlTemplate.length() && sqlTemplate.charAt(i + 1) == quote) {
                i++;
            } else {
                return i;
            }
        }
        return -1;
    }

    private boolean isIdentifierVariableContext(String sqlTemplate, int variableStart) {
        int previousIndex = previousNonWhitespaceIndex(sqlTemplate, variableStart - 1);
        if (previousIndex >= 0 && sqlTemplate.charAt(previousIndex) == '.')
            return true;
        String previousWord = previousWord(sqlTemplate, variableStart);
        return SQL_IDENTIFIER_CONTEXT_KEYWORDS.contains(previousWord);
    }

    private int previousNonWhitespaceIndex(String value, int startIndex) {
        for (int i = startIndex; i >= 0; i--) {
            if (!Character.isWhitespace(value.charAt(i)))
                return i;
        }
        return -1;
    }

    private String previousWord(String value, int endExclusive) {
        int index = previousNonWhitespaceIndex(value, endExclusive - 1);
        if (index < 0 || !isSqlIdentifierChar(value.charAt(index)))
            return "";
        int start = index;
        while (start >= 0 && isSqlIdentifierChar(value.charAt(start)))
            start--;
        return value.substring(start + 1, index + 1).toLowerCase(Locale.ROOT);
    }

    private boolean isSqlIdentifierChar(char value) {
        return Character.isLetterOrDigit(value) || value == '_' || value == '$';
    }

    private String normalizeSqlIdentifier(Object value, String key) {
        if (value == null)
            throw new AppException(AppStatusCode.INVALID_PARAM, "缺少全局变量: " + key);
        String identifier = value.toString().trim();
        if (!SQL_IDENTIFIER_PATTERN.matcher(identifier).matches())
            throw new AppException(AppStatusCode.INVALID_PARAM, "全局变量不是合法SQL标识符: " + key);
        return identifier;
    }

    private Object normalizeSqlArg(Object value) {
        if (value instanceof JSONObject || value instanceof JSONArray || value instanceof Collection<?> || value instanceof Map<?, ?>)
            return JSON.toJSONString(value);
        return value;
    }

    private ProjectReleasePO getRuntimeRelease(Long releaseId, EncryptResultDTO password) {
        LambdaQueryWrapper<ProjectReleasePO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(ProjectReleasePO::getId,
                        ProjectReleasePO::getState,
                        ProjectReleasePO::getEncrypt,
                        ProjectReleasePO::getDataJson,
                        ProjectReleasePO::getPassword,
                        ProjectReleasePO::getName,
                        ProjectReleasePO::getUpdateTime,
                        ProjectReleasePO::getExpirationDate,
                        ProjectReleasePO::getUserId,
                        ProjectReleasePO::getGroupId)
                .eq(ProjectReleasePO::getId, releaseId);
        ProjectReleasePO projectReleasePO = projectReleaseMapper.selectOne(queryWrapper);
        if (projectReleasePO == null)
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "发布的项目不存在");
        if (projectReleasePO.getState() == 0)
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "发布已停用");
        if (projectReleasePO.getExpirationDate() != null) {
            LocalDateTime updateTime = projectReleasePO.getUpdateTime();
            updateTime = updateTime.plusDays(projectReleasePO.getExpirationDate());
            if (updateTime.isBefore(LocalDateTime.now()))
                throw new AppException(AppStatusCode.DATA_EXCEPTION, "发布已超过有效期");
        }
        validateReleasePassword(projectReleasePO, password);
        return projectReleasePO;
    }

    private Long parseLongValue(Object value) {
        if (value == null)
            return null;
        try {
            return Long.valueOf(value.toString());
        } catch (NumberFormatException ignored) {
            // 忽略旧数据或未配置值。
            return null;
        }
    }

    private record PreparedSql(String sql, List<Object> args) {
    }

    private void validateReleasePassword(ProjectReleasePO projectReleasePO, EncryptResultDTO submittedPassword) {
        if (!Boolean.TRUE.equals(projectReleasePO.getEncrypt()))
            return;
        String storedPassword = projectReleasePO.getPassword();
        if (storedPassword == null || storedPassword.isBlank())
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "发布加密状态异常，请重新设置密码");
        String password = decryptReleasePassword(submittedPassword);
        if (password == null || !storedPassword.equals(password))
            throw new AppException(AppStatusCode.PWD_ERR);
    }

    private String resolveNextReleasePassword(EncryptResultDTO submittedPassword, String existingPassword) {
        if (submittedPassword == null)
            return existingPassword;
        return decryptReleasePassword(submittedPassword);
    }

    private String requireSubmittedReleasePassword(EncryptResultDTO submittedPassword) {
        String password = decryptReleasePassword(submittedPassword);
        requirePasswordWhenEncrypted(true, password);
        return password;
    }

    private String decryptReleasePassword(EncryptResultDTO submittedPassword) {
        if (submittedPassword == null)
            return null;
        try {
            return HybridCryptoUtil.decrypt(submittedPassword);
        } catch (RuntimeException e) {
            throw new AppException(AppStatusCode.PWD_ERR);
        }
    }

    private void requirePasswordWhenEncrypted(Boolean encrypt, String password) {
        if (Boolean.TRUE.equals(encrypt) && (password == null || password.isBlank()))
            throw new AppException(AppStatusCode.INVALID_PARAM, "开启加密时必须填写密码");
    }

    private void validateReleaseProjects(ProjectReleaseDTO projectReleaseDTO, List<ProjectDependencyParamDTO> dependencies, User user) {
        Long mainProjectId = projectReleaseDTO.getProjectId();
        requireAccessibleProject(mainProjectId, user);

        Set<Long> dependencyIds = new HashSet<>();
        boolean containsMainProject = false;
        for (ProjectDependencyParamDTO dependency : dependencies) {
            if (dependency == null || dependency.getId() == null) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "依赖项目ID不能为空");
            }
            if (!dependencyIds.add(dependency.getId())) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "依赖项目ID重复");
            }
            if (Objects.equals(dependency.getId(), mainProjectId)) {
                containsMainProject = true;
            }
            requireAccessibleProject(dependency.getId(), user);
        }
        if (!containsMainProject) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "依赖缺少主项目");
        }
        Map<Long, Set<Long>> references = new LinkedHashMap<>();
        for (ProjectDependencyParamDTO dependency : dependencies) {
            Set<Long> targets = new LinkedHashSet<>();
            visitReleaseScreenReferences(parseReleaseProject(dependency), (style, targetId) -> {
                if (!dependencyIds.contains(targetId))
                    throw new AppException(AppStatusCode.INVALID_PARAM, "发布依赖缺少引用的大屏: " + targetId);
                targets.add(targetId);
            });
            references.put(dependency.getId(), targets);
        }
        Set<Long> complete = new HashSet<>(), visiting = new HashSet<>();
        for (Long id : references.keySet()) validateReleaseReferenceCycle(id, references, visiting, complete);
    }

    private void validateReleaseReferenceCycle(Long id, Map<Long, Set<Long>> references,
                                               Set<Long> visiting, Set<Long> complete) {
        if (complete.contains(id)) return;
        if (!visiting.add(id)) throw new AppException(AppStatusCode.INVALID_PARAM, "大屏引用存在循环: " + id);
        for (Long target : references.getOrDefault(id, Set.of()))
            validateReleaseReferenceCycle(target, references, visiting, complete);
        visiting.remove(id);
        complete.add(id);
    }

    private JSONObject parseReleaseProject(ProjectDependencyParamDTO dependency) {
        String raw = dependency.getProjectJson();
        if (raw == null || raw.isBlank()) throw new AppException(AppStatusCode.INVALID_PARAM, "发布项目数据为空: " + dependency.getId());
        try {
            Object value = JSON.parse(ProjectDataCodecUtil.decode(raw));
            if (value instanceof JSONObject object) return object;
        } catch (RuntimeException e) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "发布项目数据不合法: " + dependency.getId());
        }
        throw new AppException(AppStatusCode.INVALID_PARAM, "发布项目数据不合法: " + dependency.getId());
    }

    private void visitReleaseScreenReferences(Object value, BiConsumer<JSONObject, Long> visitor) {
        if (value instanceof JSONObject object) {
            Object base = object.get("base"), style = object.get("style");
            if (base instanceof JSONObject baseInfo && "ScreenReference".equals(baseInfo.getString("type")) && style instanceof JSONObject screenStyle) {
                String reference = screenStyle.getString("screenId");
                if (reference != null && !reference.isBlank()) {
                    Matcher matcher = RELEASE_SCREEN_REFERENCE_PATTERN.matcher(reference);
                    if (!matcher.matches()) throw new AppException(AppStatusCode.INVALID_PARAM, "发布的大屏引用格式不合法: " + reference);
                    try {
                        visitor.accept(screenStyle, Long.parseLong(matcher.group(1)));
                    } catch (NumberFormatException e) {
                        throw new AppException(AppStatusCode.INVALID_PARAM, "发布的大屏引用格式不合法: " + reference);
                    }
                }
            }
            for (Object child : object.values()) visitReleaseScreenReferences(child, visitor);
        } else if (value instanceof JSONArray array) {
            for (Object child : array) visitReleaseScreenReferences(child, visitor);
        }
    }

    private void rewriteReleaseReferences(List<ProjectDependencyParamDTO> dependencies, Map<Long, Long> mapping) {
        for (ProjectDependencyParamDTO dependency : dependencies) {
            String raw = dependency.getProjectJson();
            JSONObject project = parseReleaseProject(dependency);
            visitReleaseScreenReferences(project, (style, targetId) -> {
                Long releaseId = mapping.get(targetId);
                if (releaseId == null) throw new AppException(AppStatusCode.INVALID_PARAM, "发布依赖缺少引用的大屏: " + targetId);
                style.put("screenId", releaseId.toString());
            });
            String projectJson = JSON.toJSONString(project);
            dependency.setProjectJson(ProjectDataCodecUtil.isCompressed(raw) ? ProjectDataCodecUtil.encode(projectJson) : projectJson);
        }
    }

    private void requireAccessibleProject(Long projectId, User user) {
        if (projectId == null) {
            throw new AppException(AppStatusCode.INVALID_PARAM);
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
}
