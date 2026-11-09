/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;


import com.zsq.datavisoolservice.core.migration.DatabaseMigration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;


/**
 * 数据库脚本自动执行入口
 */
@Slf4j
@Component
public class DatabaseMigrationAware implements ApplicationContextAware, Ordered {
    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        String migrationEnable = applicationContext.getEnvironment().getProperty("datavisool.migration.enable");
        if (migrationEnable == null || "false".equals(migrationEnable))
            return;
        DatabaseMigration databaseMigration = applicationContext.getBean(DatabaseMigration.class);
        try {
            databaseMigration.migration();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Override
    public int getOrder() {
        return 0;
    }

}
