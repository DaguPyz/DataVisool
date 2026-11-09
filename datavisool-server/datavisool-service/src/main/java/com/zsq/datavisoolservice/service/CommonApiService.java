/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.CommonApiDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.CommonApiPO;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【common_api】的数据库操作Service
 */
public interface CommonApiService {

    CommonApiDTO getCommonApi(Long id);

    Page<CommonApiDTO> getCommonApiPageList(PageParamDTO pageParam);

    Long addCommonApi(CommonApiDTO api);

    boolean updateCommonApi(CommonApiDTO api);

    boolean batchDelCommonApi(List<Long> ids);

    List<CommonApiPO> getExpiredData();

    boolean copyCommonApi(Long id);

    List<CommonApiDTO> quickSearchTopTen(String search);
}
