/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.core.migration;


import org.springframework.core.env.Environment;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.logging.Logger;

public class DatabaseCheck {

    private static final Logger log = Logger.getLogger(DatabaseCheck.class.getName());

    /** Read the same resolved configuration as the datasource, before its beans are created. */
    public static void dbCheck(Environment environment) {
        String url = datasourceProperty(environment, "url");
        String username = datasourceProperty(environment, "username");
        String password = datasourceProperty(environment, "password");
        initialize(url, username, password);
    }

    private static String datasourceProperty(Environment environment, String name) {
        String value = environment.getProperty("spring.datasource.druid." + name);
        return value != null ? value : environment.getRequiredProperty("spring.datasource." + name);
    }

    public static void initialize(String url, String username, String password) {
        String dbName = extractDbName(url);
        if (dbName == null)
            throw new RuntimeException("无法从 URL 中提取数据库名: " + url);

        //使用原始连接测试目标库是否存在
        log.info("正在测试数据库连接...");
        try (Connection conn = DriverManager.getConnection(url, username, password)) {
            log.info("数据库预连接成功: " + dbName);
        } catch (Exception e) {
            log.warning("数据库连接失败: " + e.getMessage());
            String systemUrl = url.replace("/" + dbName, "/mysql");
            try (Connection conn = DriverManager.getConnection(systemUrl, username, password);
                 Statement stmt = conn.createStatement()) {

                ResultSet rs = stmt.executeQuery("show databases like '" + dbName + "'");
                if (!rs.next()) {
                    log.info("数据库 " + dbName + " 不存在，正在创建...");
                    stmt.executeUpdate("create database `" + dbName + "` default character set utf8mb4 collate utf8mb4_general_ci");
                    log.info("数据库" + dbName + "创建成功");
                } else {
                    log.info("数据库" + dbName + "已存在");
                }

            } catch (Exception exception) {
                log.warning("数据库初始化失败:  " + exception.getMessage());
                log.warning("请手动初始化数据库");
                System.exit(1);
            }
        }
    }

    private static String extractDbName(String url) {
        try {
            String withoutPrefix = url.substring(url.indexOf("://") + 3);
            String[] parts = withoutPrefix.split("/", 2);
            if (parts.length < 2)
                return null;
            String dbAndParams = parts[1];
            int idx = dbAndParams.indexOf("?");
            return (idx == -1) ? dbAndParams : dbAndParams.substring(0, idx);
        } catch (Exception e) {
            return null;
        }
    }


}