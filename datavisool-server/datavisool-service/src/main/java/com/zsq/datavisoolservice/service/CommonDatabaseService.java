/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.CommonDataBaseDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import com.zsq.datavisoolservice.model.query.DatabaseEncryptQuery;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【datasource(数据源管理)】的数据库操作Service
 * @createDate 2024-04-12 11:07:34
 */
public interface CommonDatabaseService {

    List<CommonDataBaseDTO> getDatabaseList();

    Long addDatabase(CommonDataBaseDTO datasourceDTO);

    Boolean updateDatabase(CommonDataBaseDTO encryptDTO);

    CommonDataBaseDTO getDatabase(DatabaseEncryptQuery query) throws Exception;

    CommonDatabasePO getDatabasePO(Long id);

    Boolean copyDatabase(Long id);

    Boolean delDatabase(Long id);

    Boolean testDatabaseConnect(Long id);

    Page<CommonDataBaseDTO> getDatabasePageList(PageParamDTO pageParamDTO);

    /**
     * 批量删除数据源
     *
     * @param ids 数据源ID列表
     * @return 删除结果
     */
    boolean batchDelDatabase(List<Long> ids);
}
