/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.core.migration;


import de.vandermeer.asciitable.AT_Context;
import de.vandermeer.asciitable.AsciiTable;
import com.zsq.datavisoolservice.security.BCryptUtil;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.time.DateFormatUtils;
import org.apache.ibatis.jdbc.SQL;
import org.apache.ibatis.jdbc.ScriptRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.ResourceUtils;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.Reader;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.*;
import java.util.stream.Collectors;

@Log4j2
@Component
public class DatabaseMigration {

    /**
     * 脚本执行日志记录表
     */
    private static final String MIGRATION_TABLE_NAME = "migration_history";

    /**
     * 基线版本
     */
    private static final String BASELINE = "baseline";
    private static final String ADMIN_PASSWORD_MARKER = "!DATAVISOOL_INITIAL_ADMIN_PASSWORD_REQUIRED!";

    /**
     * 默认日期格式
     */
    public static final String DEFAULT_DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

    /**
     * 所有的脚本
     */
    private static final TreeSet<Migration> allMigrations = new TreeSet<>();

    /**
     * 创建migration表
     */
    private static final String TABLE_CREATE_SQL = """
            CREATE TABLE IF NOT EXISTS `migration_history` (
              `id` varchar(32) NOT NULL,
              `version` varchar(128) NOT NULL,
              `file_name` varchar(255) NOT NULL,
              `execute_user` varchar(128) NOT NULL,
              `execute_date` timestamp NOT NULL,
              `success` tinyint(1) NOT NULL,
              PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """;

    @Value("${spring.datasource.druid.url}")
    private String url;

    @Value("${spring.datasource.druid.username}")
    private String username;

    @Value("${spring.datasource.druid.password}")
    private String password;

    @Value("${DATAVISOOL_ADMIN_PASSWORD:${datavisool.initial-admin-password:}}")
    private String initialAdminPassword;

    private final JdbcTemplate jdbcTemplate;

    public DatabaseMigration(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 数据库脚本执行入口
     */
    public void migration() throws Exception {
        //自动脚本执行前准备工作，创建migration表
        prepareMigrationTable();
        //获取需要执行的脚本
        Set<Migration> migrations = getMigrations();
        if (CollectionUtils.isEmpty(migrations)) {
            printCurrentVersion();
            log.info("无需执行脚本，当前数据库版本为 " + getAllMigrations().last().getVersion());
            return;
        }
        //执行脚本
        RuntimeException exception = doMigrations((TreeSet<Migration>) migrations);
        //打印当前数据库版本
        printCurrentVersion();
        if (exception != null)
            throw exception;
    }

    /**
     * 获取需要执行的脚本
     */
    private Set<Migration> getMigrations() throws IOException {
        //获取所有符合格式的脚本
        TreeSet<Migration> migrations = getAllMigrations();
        if (migrations.isEmpty()) {
            log.warn("未找到任何脚本文件!");
            return Collections.emptySet();
        }
        //查询脚本执行历史记录
        TreeSet<Migration> migrationHistories = new TreeSet<>(jdbcTemplate.query("select * from migration_history", new BeanPropertyRowMapper<>(Migration.class)));
        //过滤出本次需要执行的脚本
        Set<Migration> migrationsToDo;
        if (CollectionUtils.isEmpty(migrationHistories)) {
            return migrations;
        } else {
            Migration lastMigration = migrationHistories.last();
            migrationsToDo = migrations.tailSet(lastMigration, !lastMigration.isSuccess());
        }
        return migrationsToDo;
    }

    private RuntimeException doMigrations(TreeSet<Migration> migrations) throws SQLException {
        //获取待执行脚本列表中最早的脚本
        Migration first = migrations.first();
        if (BASELINE.equalsIgnoreCase(first.getVersion())) {
            log.info("数据库没有版本管理，执行基线脚本...");
            if (!doBaseLine(first))
                return new RuntimeException("基线脚本执行失败!");
            migrations.remove(first);
        }
        for (Migration migration : migrations) {
            log.info("执行脚本--> 版本: " + migration.getVersion());
            migration.setExecuteUser(username);
            migration.setExecuteDate(new Date());
            //执行脚本
            migration.setSuccess(doMigration(migration));
            //记录脚本执行结果
            upsertMigration(migration);
            if (!migration.isSuccess()) {
                return new RuntimeException("执行终端，版本为:  " + migration.getVersion());
            } else {
                log.info("脚本执行成功，版本: " + migration.getVersion());
            }
        }
        log.info("所有脚本执行完毕...");
        return null;
    }

    private boolean doMigration(Migration migration) {
        try {
            Resource upgradeFile = migration.getUpgradeFile();
            boolean success = runScript(upgradeFile, true);
            if (success)
                return true;
            log.error("执行脚本失败! 版本: " + migration.getVersion() + ". 即将执行回滚脚本...");
            Resource rollbackFile = migration.getRollbackFile();
            if (rollbackFile != null) {
                runScript(rollbackFile, false);
                log.info("回滚脚本 (" + rollbackFile.getFilename() + ") 已成功执行!");
            } else {
                log.warn("回滚脚本不存在。跳过执行");
            }
            return false;
        } catch (Exception e) {
            log.error("自动脚本失败！版本: " + migration.getVersion(), e);
            return false;
        }
    }

    private boolean doBaseLine(Migration baseline) throws SQLException {
        List<String> tables = jdbcTemplate.queryForList("SHOW TABLES", String.class);
        tables.remove(MIGRATION_TABLE_NAME);
        if (!CollectionUtils.isEmpty(tables)) {
            log.info("在非空数据库上执行基线脚本...");
            baseline.setSuccess(true);
        } else {
            log.info("在空数据库上执行基线脚本...");
            String adminHash = initialAdminPasswordHash(initialAdminPassword);
            baseline.setSuccess(runScript(baseline.getUpgradeFile(), true, adminHash));
        }
        baseline.setExecuteUser(username);
        baseline.setExecuteDate(new Date());
        upsertMigration(baseline);
        return baseline.isSuccess();
    }

    /**
     * sql脚本执行前准备工作，创建migration表
     */
    private void prepareMigrationTable() {
        List<String> tables = jdbcTemplate.queryForList("SHOW TABLES", String.class);
        if (!tables.contains(MIGRATION_TABLE_NAME))
            jdbcTemplate.execute(TABLE_CREATE_SQL);
    }

    /**
     * 从指定的目录加载所有的符合格式的脚本文件
     */
    private TreeSet<Migration> getAllMigrations() throws IOException {
        synchronized (this) {
            if (CollectionUtils.isEmpty(allMigrations)) {
                //加载脚本文件
                PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
                // 使用资源模式匹配器获取资源列表
                Resource[] resources = resolver.getResources(ResourceUtils.CLASSPATH_URL_PREFIX + "migration/*.sql");
                Map<String, List<Resource>> resourceMap = Arrays.stream(resources)
                        .filter(Migration::isMigrationFile)
                        .collect(Collectors.groupingBy(r -> Objects.requireNonNull(r.getFilename()).substring(1)));

                for (List<Resource> resourceList : resourceMap.values()) {
                    Resource upgradeFile = null, rollbackFile = null;
                    for (Resource resource : resourceList) {
                        if (Objects.requireNonNull(resource.getFilename()).startsWith(ScriptType.UPGRADE.getPrefix())) {
                            upgradeFile = resource;
                        } else if (resource.getFilename().startsWith(ScriptType.ROLLBACK.getPrefix())) {
                            rollbackFile = resource;
                        }
                    }
                    if (upgradeFile != null) {
                        Migration migration = new Migration(upgradeFile, rollbackFile);
                        if (!allMigrations.add(migration)) {
                            throw new RuntimeException("Duplicate version " + migration.getVersion());
                        }
                    }
                }
            }
        }
        return allMigrations;
    }

    private void upsertMigration(Migration migration) {
        SQL query = new SQL();
        query.SELECT("*").FROM(MIGRATION_TABLE_NAME)
                .WHERE("`id` = '" + migration.getId() + "'");
        List<Migration> migrations = jdbcTemplate.query(query.toString(), new BeanPropertyRowMapper<>(Migration.class));
        SQL sql = new SQL();
        if (!CollectionUtils.isEmpty(migrations) && !migrations.get(0).isSuccess()) {
            sql.UPDATE(MIGRATION_TABLE_NAME)
                    .SET("success = " + String.format("'%s'", (migration.isSuccess() ? "1" : "0"))
                            , "execute_date = " + String.format("'%s'", DateFormatUtils.format(new Date(), DEFAULT_DATE_FORMAT)))
                    .WHERE("`id` = " + String.format("'%s'", migration.getId()));
        } else {
            sql.INSERT_INTO(MIGRATION_TABLE_NAME)
                    .INTO_VALUES(String.format("'%s'", migration.getId())
                            , String.format("'%s'", migration.getVersion())
                            , String.format("'%s'", migration.getFileName())
                            , String.format("'%s'", migration.getExecuteUser())
                            , String.format("'%s'", DateFormatUtils.format(migration.getExecuteDate(), DEFAULT_DATE_FORMAT))
                            , String.format("'%s'", migration.isSuccess() ? "1" : "0"));
        }
        jdbcTemplate.execute(sql.toString());
    }

    private boolean runScript(Resource resource, boolean stopOnError) {
        return runScript(resource, stopOnError, null);
    }

    static String initialAdminPasswordHash(String value) {
        if (value == null || value.isBlank() || value.codePointCount(0, value.length()) < 8
                || value.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("首次初始化数据库需要设置管理员密码：DATAVISOOL_ADMIN_PASSWORD 或 datavisool.initial-admin-password，至少 8 个字符且不超过 72 字节。");
        }
        return BCryptUtil.hashPassword(value);
    }

    private boolean runScript(Resource resource, boolean stopOnError, String initialAdminHash) {
        try (Connection connection = DriverManager.getConnection(url, username, password)) {
            ScriptRunner scriptRunner = new ScriptRunner(connection);
            scriptRunner.setAutoCommit(false);
            scriptRunner.setStopOnError(stopOnError);
            scriptRunner.setSendFullScript(false);
            LogWriter logWriter = new LogWriter(System.out);
            if (!stopOnError) {
                scriptRunner.setErrorLogWriter(logWriter);
            }
            scriptRunner.setLogWriter(initialAdminHash == null ? logWriter : null);
            if (initialAdminHash != null) {
                scriptRunner.setErrorLogWriter(null);
            }
            try (Reader reader = initialAdminHash == null
                    ? new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8)
                    : baselineReader(resource, initialAdminHash)) {
                scriptRunner.runScript(reader);
            }
            return true;
        } catch (Exception e) {
            log.error("Script execute failed! " + resource.getFilename());
            return false;
        }
    }

    static Reader baselineReader(Resource resource, String initialAdminHash) throws IOException {
        String sql = resource.getContentAsString(StandardCharsets.UTF_8);
        int marker = sql.indexOf(ADMIN_PASSWORD_MARKER);
        if (marker < 0 || marker != sql.lastIndexOf(ADMIN_PASSWORD_MARKER)) {
            throw new IOException("基线脚本的管理员密码占位符无效");
        }
        return new StringReader(sql.replace(ADMIN_PASSWORD_MARKER, initialAdminHash));
    }

    private void printCurrentVersion() {
        String currentVersion = null, lastVersion = null;
        TreeSet<Migration> migrations = queryMigrationHistory();
        if (!CollectionUtils.isEmpty(migrations)) {
            Migration last = migrations.last();
            while (last != null && !last.isSuccess()) {
                last = migrations.lower(last);
            }
            if (last != null) {
                currentVersion = last.getVersion();
            }
        }

        try {
            TreeSet<Migration> allMigrations = getAllMigrations();
            lastVersion = allMigrations.last().getVersion();
        } catch (Exception e) {
            log.error("获取最新版本失败! ", e);
        }
        AT_Context at_context = new AT_Context();
        AsciiTable asciiTable = new AsciiTable(at_context);
        asciiTable.addRule();
        asciiTable.addRow("Last Script Version ", lastVersion);
        asciiTable.addRule();
        asciiTable.addRow("Current Database Version ", currentVersion);
        asciiTable.addRule();
        if (Objects.equals(lastVersion, currentVersion)) {
            log.info("\n" + asciiTable.render());
        } else {
            log.error(asciiTable.render());
        }
    }

    private TreeSet<Migration> queryMigrationHistory() {
        return new TreeSet<>(jdbcTemplate.query("select * from migration_history", new BeanPropertyRowMapper<>(Migration.class)));
    }

    static class LogWriter extends PrintWriter {

        public LogWriter(OutputStream out) {
            super(out);
        }

        @Override
        public void write(String s) {
            log.info(s);
        }
    }

}
