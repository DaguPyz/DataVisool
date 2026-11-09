/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.RemoteComponentDTO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【remote_component】的数据库操作Service
 * @createDate 2024-08-8 20:43:08
 */
public interface RemoteComponentService {
    /**
     * 上传远程组件
     *
     * @param remoteComponentDTO 组件信息
     * @return 上传结果
     */
    boolean uploadComponent(RemoteComponentDTO remoteComponentDTO);

    /**
     * 获取所有远程组件
     *
     * @return 远程组件列表
     */
    List<RemoteComponentDTO> getAllRemoteComponent();

    /**
     * 获取远程组件分页列表
     *
     * @param pageParamDTO 分页参数
     * @return 分页列表
     */
    Page<RemoteComponentDTO> getPageList(PageParamDTO pageParamDTO);

    /**
     * 更新远程组件
     *
     * @param remoteComponentDTO 组件信息
     * @return 更新结果
     */
    Boolean updateRemoteComponent(RemoteComponentDTO remoteComponentDTO);

    /**
     * 批量删除远程组件
     *
     * @param ids id列表
     * @return 删除结果
     */
    Boolean batchDelRemoteComponent(List<Long> ids);

    /**
     * 获取过期数据
     *
     * @return 过期数据列表
     */
    List<RemoteComponentPO> getExpiredData();

    /**
     * 根据id列表获取远程组件
     */
    List<RemoteComponentPO> getRemoteComponentsByIds(List<Long> ids);

    /**
     * 根据组件名列表获取远程组件
     */
    List<RemoteComponentPO> getRemoteComponents(List<String> urls);

    /**
     * 创建远程组件
     */
    RemoteComponentPO createRemoteComponent(RemoteComponentPO remoteComponentPO);
}
