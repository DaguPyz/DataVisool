/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.executor;

import com.alibaba.druid.pool.DruidDataSource;
import com.alibaba.druid.support.json.JSONUtils;
import com.zsq.datavisoolservice.constants.DataBaseEnum;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import lombok.extern.log4j.Log4j2;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Log4j2
public class DataBaseExecuteFactory {

    private static final String DATABASE_CACHE_PREFIX = "db:";
    private static final String TEMPLATE_CACHE_PREFIX = "template:";

    private static final Map<DataBaseEnum, String> databaseDriverMap = new HashMap<>();

    private static final Map<String, DruidDataSource> databaseCache = new HashMap<>();

    private static final Map<String, JdbcTemplate> jdbcTemplateCache = new HashMap<>();

    public static final Map<DataBaseEnum, AbstractDatabaseUrlBuilder> urlBuilderMap = new HashMap<>(4);

    static {
        // 数据库驱动映射
        databaseDriverMap.put(DataBaseEnum.MySQL, "com.mysql.jdbc.Driver");
        databaseDriverMap.put(DataBaseEnum.ORACLE, "oracle.jdbc.driver.OracleDriver");
        databaseDriverMap.put(DataBaseEnum.SQLServer, "com.microsoft.sqlserver.jdbc.SQLServerDriver");
        databaseDriverMap.put(DataBaseEnum.PostgresSQL, "org.postgresql.Driver");

        // 数据库URL生成器
        urlBuilderMap.put(DataBaseEnum.MySQL, new MysqlUrlBuilder());
        urlBuilderMap.put(DataBaseEnum.ORACLE, new OracleUrlBuilder());
        urlBuilderMap.put(DataBaseEnum.SQLServer, new SqlServerUrlBuilder());
        urlBuilderMap.put(DataBaseEnum.PostgresSQL, new PostgresSQLUrlBuilder());
    }

    public static DruidDataSource buildDataSource(CommonDatabasePO commonDatabasePo) {
        String key = DATABASE_CACHE_PREFIX + commonDatabasePo.getId().toString();
        if (databaseCache.containsKey(key))
            return databaseCache.get(key);
        DruidDataSource dataSource = new DruidDataSource();
        dataSource.setDriverClassName(databaseDriverMap.get(commonDatabasePo.getType()));
        dataSource.setUrl(DataBaseExecuteFactory.urlBuilderMap.get(commonDatabasePo.getType()).buildUrl(commonDatabasePo));
        dataSource.setUsername(commonDatabasePo.getUsername());
        dataSource.setPassword(commonDatabasePo.getPassword());

        // 设置获取连接时的最大等待时间，单位毫秒
        dataSource.setMaxWait(3000);
        dataSource.setConnectTimeout(3000);
        // 设置获取连接失败后的重试次数
        dataSource.setNotFullTimeoutRetryCount(1);
        // 设置获取连接失败后是否继续尝试
        dataSource.setBreakAfterAcquireFailure(true);
        // 设置获取连接出错时的自动重连次数
        dataSource.setConnectionErrorRetryAttempts(1);
        dataSource.setMaxCreateTaskCount(10);
        databaseCache.put(key, dataSource);
        return dataSource;
    }

    public static JdbcTemplate buildJdbcTemplate(CommonDatabasePO commonDatabasePo) {
        String templateKey = TEMPLATE_CACHE_PREFIX + commonDatabasePo.getId().toString();
        String dbKey = DATABASE_CACHE_PREFIX + commonDatabasePo.getId().toString();
        if (jdbcTemplateCache.containsKey(templateKey))
            return jdbcTemplateCache.get(templateKey);
        DruidDataSource dataSource = databaseCache.get(dbKey);
        if (dataSource == null) {
            dataSource = DataBaseExecuteFactory.buildDataSource(commonDatabasePo);
            if (dataSource == null) {
                log.error("Unable to create a data source，commonDatabasePo: {}", JSONUtils.toJSONString(commonDatabasePo));
                throw new RuntimeException("Unable to create a data source，commonDatabasePo");
            } else {
                databaseCache.put(dbKey, dataSource);
            }
        }
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        jdbcTemplateCache.put(templateKey, jdbcTemplate);
        return jdbcTemplate;
    }

    public static void removeCache(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return;
        for (Long id : ids) {
            removeCache(id);
        }
    }

    public static void removeCache(Long id) {
        String idStr = id.toString();
        databaseCache.remove(DATABASE_CACHE_PREFIX + idStr);
        jdbcTemplateCache.remove(TEMPLATE_CACHE_PREFIX + idStr);
    }
}
