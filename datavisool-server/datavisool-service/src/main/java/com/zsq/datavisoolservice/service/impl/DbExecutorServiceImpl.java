/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.executor.DataBaseExecuteFactory;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.model.dto.DbExecutorDTO;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import com.zsq.datavisoolservice.service.CommonDatabaseService;
import com.zsq.datavisoolservice.service.DbExecutorService;
import com.zsq.datavisoolservice.util.Base64Util;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Log4j2
@Service
public class DbExecutorServiceImpl implements DbExecutorService {

    @Resource
    private CommonDatabaseService commonDatabaseService;

    @Override
    public Object executeSql(DbExecutorDTO dbExecutorDTO) {
        if (dbExecutorDTO == null)
            throw new AppException(AppStatusCode.INVALID_PARAM, "未识别到有效sql，无法执行");
        String sql = Base64Util.decode(dbExecutorDTO.getStatement());
        if (!sql.trim().toLowerCase().startsWith("select"))
            throw new AppException(AppStatusCode.INVALID_PARAM, "sql必须以select开头");
        CommonDatabasePO commonDatabasePO = commonDatabaseService.getDatabasePO(dbExecutorDTO.getId());
        if (commonDatabasePO == null)
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "数据连接不存在");
        JdbcTemplate jdbcTemplate = DataBaseExecuteFactory.buildJdbcTemplate(commonDatabasePO);
        try {
            return jdbcTemplate.queryForList(sql);
        } catch (Exception e) {
            log.error("执行sql异常, sql:{}", sql, e);
            DataBaseExecuteFactory.removeCache(commonDatabasePO.getId());
            throw new AppException(AppStatusCode.SYSTEM_ERR, "sql执行失败，请联系管理员");
        }
    }
}
