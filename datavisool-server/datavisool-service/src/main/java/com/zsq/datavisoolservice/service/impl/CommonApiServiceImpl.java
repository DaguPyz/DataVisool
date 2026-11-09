/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.CommonApiMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.CommonApiDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.CommonApiPO;
import com.zsq.datavisoolservice.service.CommonApiService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import jakarta.annotation.Resource;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class CommonApiServiceImpl implements CommonApiService {

    @Resource
    private CommonApiMapper commonApiMapper;

    @Override
    public CommonApiDTO getCommonApi(Long id) {
        User user = AppContextUtil.getCurrentUser();
        if (id == null || user == null)
            return null;
        LambdaQueryWrapper<CommonApiPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(CommonApiPO::getId, CommonApiPO::getName, CommonApiPO::getUrl, CommonApiPO::getParams, CommonApiPO::getMethod, CommonApiPO::getHeaders)
                .eq(CommonApiPO::getId, id);
        queryWrapper.eq(CommonApiPO::getUserId, user.getId());
        CommonApiPO commonApiPO = commonApiMapper.selectOne(queryWrapper);
        if (commonApiPO == null)
            return null;
        CommonApiDTO commonApiDTO = new CommonApiDTO();
        BeanUtils.copyProperties(commonApiPO, commonApiDTO);
        return commonApiDTO;
    }

    @Override
    public Page<CommonApiDTO> getCommonApiPageList(PageParamDTO pageParam) {
        User user = AppContextUtil.getCurrentUser();
        if (pageParam == null || user == null)
            return new Page<>();
        long current = pageParam.getCurrent() == null ? 1 : pageParam.getCurrent();
        long size = pageParam.getSize() == null ? 10 : pageParam.getSize();
        Page<CommonApiPO> page = new Page<>(current, size);
        LambdaQueryWrapper<CommonApiPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(CommonApiPO::getId, CommonApiPO::getName, CommonApiPO::getUrl, CommonApiPO::getParams, CommonApiPO::getMethod, CommonApiPO::getHeaders);
        if (pageParam.getSearchValue() != null)
            wrapper.like(CommonApiPO::getName, pageParam.getSearchValue());
        wrapper.eq(CommonApiPO::getUserId, user.getId());
        Page<CommonApiPO> apiPOPage = commonApiMapper.selectPage(page, wrapper);
        Page<CommonApiDTO> apiDTOPage = new Page<>();
        BeanUtils.copyProperties(apiPOPage, apiDTOPage);
        List<CommonApiDTO> apiDTOList = apiPOPage.getRecords().stream().map(apiPO -> {
            CommonApiDTO commonApiDTO = new CommonApiDTO();
            BeanUtils.copyProperties(apiPO, commonApiDTO);
            return commonApiDTO;
        }).toList();
        apiDTOPage.setRecords(apiDTOList);
        return apiDTOPage;
    }

    @Override
    public Long addCommonApi(CommonApiDTO api) {
        User user = AppContextUtil.getCurrentUser();
        if (api == null || user == null)
            return null;
        CommonApiPO commonApiPO = new CommonApiPO();
        BeanUtils.copyProperties(api, commonApiPO);
        commonApiPO.setUserId(user.getId());
        return (long) commonApiMapper.insert(commonApiPO);
    }

    @Override
    public boolean updateCommonApi(CommonApiDTO api) {
        if (api == null || api.getId() == null)
            return false;
        User user = requireCurrentUser();
        CommonApiPO commonApiPO = new CommonApiPO();
        commonApiPO.setName(api.getName());
        commonApiPO.setUrl(api.getUrl());
        commonApiPO.setMethod(api.getMethod());
        commonApiPO.setParams(api.getParams());
        commonApiPO.setHeaders(api.getHeaders());
        commonApiPO.setUpdateTime(LocalDateTime.now());
        return commonApiMapper.update(commonApiPO, ownedApiWrapper(api.getId(), user)) > 0;
    }

    @Override
    public boolean batchDelCommonApi(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = requireCurrentUser();
        return commonApiMapper.delete(new LambdaQueryWrapper<CommonApiPO>()
                .in(CommonApiPO::getId, ids)
                .eq(CommonApiPO::getUserId, user.getId())) > 0;
    }

    @Override
    public List<CommonApiPO> getExpiredData() {
        return commonApiMapper.getExpiredData();
    }

    @Override
    @Transactional
    public boolean copyCommonApi(Long id) {
        User user = AppContextUtil.getCurrentUser();
        if (id == null || user == null)
            return false;
        LambdaQueryWrapper<CommonApiPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(CommonApiPO::getName, CommonApiPO::getUrl, CommonApiPO::getHeaders, CommonApiPO::getParams, CommonApiPO::getMethod);
        wrapper.eq(CommonApiPO::getId, id)
                .eq(CommonApiPO::getUserId, user.getId());
        CommonApiPO commonApiPO = commonApiMapper.selectOne(wrapper);
        if (commonApiPO == null)
            return false;
        commonApiPO.setUserId(user.getId());
        commonApiPO.setName(commonApiPO.getName() + "（副本）");
        return commonApiMapper.insert(commonApiPO) > 0;
    }

    @Override
    public List<CommonApiDTO> quickSearchTopTen(String search) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        LambdaQueryWrapper<CommonApiPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.last("limit 10");
        if (search != null)
            queryWrapper.like(CommonApiPO::getName, search);
        queryWrapper.eq(CommonApiPO::getUserId, user.getId());
        List<CommonApiPO> commonApiPOS = commonApiMapper.selectList(queryWrapper);
        if (commonApiPOS != null && !commonApiPOS.isEmpty())
            return commonApiPOS.stream().map(commonApiPO -> {
                CommonApiDTO commonApiDTO = new CommonApiDTO();
                BeanUtils.copyProperties(commonApiPO, commonApiDTO);
                return commonApiDTO;
            }).toList();
        return new ArrayList<>();
    }

    private LambdaQueryWrapper<CommonApiPO> ownedApiWrapper(Long id, User user) {
        return new LambdaQueryWrapper<CommonApiPO>()
                .eq(CommonApiPO::getId, id)
                .eq(CommonApiPO::getUserId, user.getId());
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }
}
