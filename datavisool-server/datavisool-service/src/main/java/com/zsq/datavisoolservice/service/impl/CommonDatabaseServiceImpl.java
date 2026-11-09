/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.alibaba.druid.pool.DruidDataSource;
import com.alibaba.druid.pool.DruidPooledConnection;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.executor.DataBaseExecuteFactory;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.DatasourceMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.CommonDataBaseDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import com.zsq.datavisoolservice.model.query.DatabaseEncryptQuery;
import com.zsq.datavisoolservice.service.CommonDatabaseService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * @author DAGU
 * @description 针对表【datasource(数据源管理)】的数据库操作Service实现
 * @createDate 2024-04-12 11:07:34
 */
@Service
public class CommonDatabaseServiceImpl implements CommonDatabaseService {

    private static final Logger logger = LoggerFactory.getLogger(CommonDatabaseServiceImpl.class);

    @Resource
    private DatasourceMapper datasourceMapper;


    @Override
    public List<CommonDataBaseDTO> getDatabaseList() {
        User user = requireCurrentUser();
        LambdaQueryWrapper<CommonDatabasePO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(CommonDatabasePO::getId, CommonDatabasePO::getName, CommonDatabasePO::getAllowSqlScript);
        wrapper.eq(CommonDatabasePO::getUserId, user.getId());
        List<CommonDatabasePO> commonDatabasePOList = datasourceMapper.selectList(wrapper);
        List<CommonDataBaseDTO> datasourceDTOList = new ArrayList<>();
        commonDatabasePOList.forEach(datasourcePO -> {
            CommonDataBaseDTO datasourceDTO = new CommonDataBaseDTO();
            BeanUtils.copyProperties(datasourcePO, datasourceDTO);
            datasourceDTOList.add(datasourceDTO);
        });
        return datasourceDTOList;
    }

    @Override
    @Transactional
    public Long addDatabase(CommonDataBaseDTO datasourceDTO) {
        User currentUser = AppContextUtil.getCurrentUser();
        if (datasourceDTO == null || currentUser == null)
            return null;
        datasourceDTO.setCreateTime(LocalDateTime.now());
        CommonDatabasePO commonDatabasePO = new CommonDatabasePO();
        BeanUtils.copyProperties(datasourceDTO, commonDatabasePO);
        commonDatabasePO.setUserId(currentUser.getId());
        datasourceMapper.insert(commonDatabasePO);
        return commonDatabasePO.getId();
    }

    @Override
    @Transactional
    public Boolean updateDatabase(CommonDataBaseDTO datasourceDTO) {
        if (datasourceDTO == null || datasourceDTO.getId() == null)
            return false;
        User user = requireCurrentUser();
        CommonDatabasePO commonDatabasePo = new CommonDatabasePO();
        commonDatabasePo.setName(datasourceDTO.getName());
        commonDatabasePo.setType(datasourceDTO.getType());
        commonDatabasePo.setUsername(datasourceDTO.getUsername());
        commonDatabasePo.setPassword(datasourceDTO.getPassword());
        commonDatabasePo.setUrl(datasourceDTO.getUrl());
        commonDatabasePo.setAllowSqlScript(datasourceDTO.getAllowSqlScript());
        commonDatabasePo.setIp(datasourceDTO.getIp());
        commonDatabasePo.setPort(datasourceDTO.getPort());
        commonDatabasePo.setDatabaseName(datasourceDTO.getDatabaseName());
        commonDatabasePo.setDes(datasourceDTO.getDes());
        commonDatabasePo.setUpdateTime(LocalDateTime.now());
        int row = datasourceMapper.update(commonDatabasePo, ownedDatabaseWrapper(datasourceDTO.getId(), user));
        //清理缓存
        if (row > 0)
            DataBaseExecuteFactory.removeCache(datasourceDTO.getId());
        return row > 0;
    }

    @Override
    public CommonDataBaseDTO getDatabase(DatabaseEncryptQuery query) throws Exception {
        if (query == null)
            return null;
        CommonDatabasePO commonDatabasePO = getDatabasePO(query.getId());
        if (commonDatabasePO == null)
            return null;
        CommonDataBaseDTO datasourceDTO = new CommonDataBaseDTO();
        BeanUtils.copyProperties(commonDatabasePO, datasourceDTO);
        return datasourceDTO;
    }

    @Override
    public CommonDatabasePO getDatabasePO(Long id) {
        if (id == null)
            return null;
        User user = requireCurrentUser();
        LambdaQueryWrapper<CommonDatabasePO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(CommonDatabasePO::getId, CommonDatabasePO::getName, CommonDatabasePO::getUsername, CommonDatabasePO::getPassword, CommonDatabasePO::getType,
                CommonDatabasePO::getIp, CommonDatabasePO::getPort, CommonDatabasePO::getDatabaseName, CommonDatabasePO::getUrl, CommonDatabasePO::getAllowSqlScript);
        wrapper.eq(CommonDatabasePO::getId, id)
                .eq(CommonDatabasePO::getUserId, user.getId());
        return datasourceMapper.selectOne(wrapper);
    }

    @Override
    @Transactional
    public Boolean copyDatabase(Long id) {
        User user = requireCurrentUser();
        if (id == null)
            return false;
        LambdaQueryWrapper<CommonDatabasePO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(CommonDatabasePO::getName, CommonDatabasePO::getUsername, CommonDatabasePO::getPassword, CommonDatabasePO::getType,
                CommonDatabasePO::getIp, CommonDatabasePO::getPort, CommonDatabasePO::getDatabaseName, CommonDatabasePO::getUserId, CommonDatabasePO::getAllowSqlScript);
        wrapper.eq(CommonDatabasePO::getId, id)
                .eq(CommonDatabasePO::getUserId, user.getId());
        CommonDatabasePO commonDatabasePO = datasourceMapper.selectOne(wrapper);
        if (commonDatabasePO == null)
            return false;
        commonDatabasePO.setUserId(user.getId());
        commonDatabasePO.setName(commonDatabasePO.getName() + "（副本）");
        return datasourceMapper.insert(commonDatabasePO) > 0;
    }

    @Override
    @Transactional
    public Boolean delDatabase(Long id) {
        if (id == null)
            return false;
        User user = requireCurrentUser();
        boolean res = datasourceMapper.delete(ownedDatabaseWrapper(id, user)) > 0;
        //清理缓存
        if (res)
            DataBaseExecuteFactory.removeCache(id);
        return res;
    }

    @Override
    public Boolean testDatabaseConnect(Long id) {
        if (id == null)
            return false;
        CommonDatabasePO commonDatabasePo = getDatabasePO(id);
        if (commonDatabasePo == null)
            return false;
        DruidDataSource dataSource = DataBaseExecuteFactory.buildDataSource(commonDatabasePo);
        DruidPooledConnection connection = null;
        try {
            connection = dataSource.getConnection(AppBaseConfig.TEST_DATABASE_MAX_TIMEOUT);
        } catch (SQLException e) {
            dataSource.close();
            DataBaseExecuteFactory.removeCache(commonDatabasePo.getId());
            logger.error(e.getMessage(), e);
            throw new AppException(AppStatusCode.UNABLE_ESTABLISH_CONNECTION, AppStatusCode.UNABLE_ESTABLISH_CONNECTION.message() + e.getMessage());
        } finally {
            if (connection != null)
                try {
                    connection.close();
                } catch (SQLException e) {
                    logger.error(e.getMessage(), e);
                }
        }
        return true;
    }

    @Override
    public Page<CommonDataBaseDTO> getDatabasePageList(PageParamDTO pageParamDTO) {
        if (pageParamDTO == null)
            return new Page<>();
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new Page<>();
        Page<CommonDatabasePO> page = new Page<>();
        page.setSize(pageParamDTO.getSize() == 0 ? 10 : pageParamDTO.getSize());
        page.setCurrent(pageParamDTO.getCurrent() == 0 ? 1 : pageParamDTO.getCurrent());
        LambdaQueryWrapper<CommonDatabasePO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(CommonDatabasePO::getId, CommonDatabasePO::getName, CommonDatabasePO::getType, CommonDatabasePO::getAllowSqlScript);
        wrapper.eq(CommonDatabasePO::getUserId, user.getId());
        if (pageParamDTO.getSearchValue() != null && !pageParamDTO.getSearchValue().isEmpty())
            wrapper.like(CommonDatabasePO::getName, pageParamDTO.getSearchValue());
        Page<CommonDatabasePO> datasourcePOPage = datasourceMapper.selectPage(page, wrapper);
        Page<CommonDataBaseDTO> datasourceDTOPage = new Page<>();
        BeanUtils.copyProperties(datasourcePOPage, datasourceDTOPage);
        List<CommonDataBaseDTO> datasourceDTOList = new ArrayList<>();
        for (CommonDatabasePO commonDatabasePO : datasourcePOPage.getRecords()) {
            CommonDataBaseDTO datasourceDTO = new CommonDataBaseDTO();
            BeanUtils.copyProperties(commonDatabasePO, datasourceDTO);
            datasourceDTOList.add(datasourceDTO);
        }
        datasourceDTOPage.setRecords(datasourceDTOList);
        return datasourceDTOPage;
    }

    @Override
    @Transactional
    public boolean batchDelDatabase(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = requireCurrentUser();
        List<Long> ownedIds = datasourceMapper.selectList(new LambdaQueryWrapper<CommonDatabasePO>()
                        .select(CommonDatabasePO::getId)
                        .in(CommonDatabasePO::getId, ids)
                        .eq(CommonDatabasePO::getUserId, user.getId()))
                .stream()
                .map(CommonDatabasePO::getId)
                .toList();
        if (ownedIds.isEmpty())
            return false;
        boolean res = datasourceMapper.delete(new LambdaQueryWrapper<CommonDatabasePO>()
                .in(CommonDatabasePO::getId, ownedIds)
                .eq(CommonDatabasePO::getUserId, user.getId())) > 0;
        //清理缓存
        if (res)
            DataBaseExecuteFactory.removeCache(ownedIds);
        return res;
    }

    private LambdaQueryWrapper<CommonDatabasePO> ownedDatabaseWrapper(Long id, User user) {
        return new LambdaQueryWrapper<CommonDatabasePO>()
                .eq(CommonDatabasePO::getId, id)
                .eq(CommonDatabasePO::getUserId, user.getId());
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        return user;
    }

}


