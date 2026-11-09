/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import org.apache.ibatis.type.LocalDateTimeTypeHandler;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;

/** Treat malformed database date-times as absent without hiding other database errors. */
public class DatabaseLocalDateTimeTypeHandler extends LocalDateTimeTypeHandler {
    private static final Logger log = LogManager.getLogger(DatabaseLocalDateTimeTypeHandler.class);

    @Override
    public LocalDateTime getNullableResult(ResultSet rs, String columnName) throws SQLException {
        String value = rs.getString(columnName);
        if (isInvalid(value)) {
            logInvalidResult(rs, columnName, value);
            return null;
        }
        return value == null ? null : super.getNullableResult(rs, columnName);
    }

    @Override
    public LocalDateTime getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        String value = rs.getString(columnIndex);
        if (isInvalid(value)) {
            logInvalidResult(rs, columnIndex, value);
            return null;
        }
        return value == null ? null : super.getNullableResult(rs, columnIndex);
    }

    @Override
    public LocalDateTime getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        String value = cs.getString(columnIndex);
        if (isInvalid(value)) {
            log.warn("读取到无效数据库时间: 来源=存储过程, 列序号={}, 值={}", columnIndex, safeValue(value));
            return null;
        }
        return value == null ? null : super.getNullableResult(cs, columnIndex);
    }

    private static boolean isInvalid(String value) {
        if (value == null) return false;
        try {
            LocalDateTime.parse(value.replace(' ', 'T'));
            return false;
        } catch (DateTimeParseException ignored) {
            return true;
        }
    }

    private static void logInvalidResult(ResultSet rs, String columnName, String value) {
        try {
            logInvalidResult(rs, rs.findColumn(columnName), value);
        } catch (SQLException e) {
            log.warn("读取到无效数据库时间: 字段={}, 值={}", columnName, safeValue(value));
        }
    }

    private static void logInvalidResult(ResultSet rs, int columnIndex, String value) {
        String table = "未知";
        String column = Integer.toString(columnIndex);
        String id = "未知";
        try {
            ResultSetMetaData metadata = rs.getMetaData();
            table = metadata.getTableName(columnIndex);
            column = metadata.getColumnLabel(columnIndex);
        } catch (SQLException ignored) {
            // Some drivers cannot provide source metadata; retain the column index.
        }
        try {
            id = rs.getString("id");
        } catch (SQLException ignored) {
            // The query may not select an id.
        }
        log.warn("读取到无效数据库时间: 表={}, 字段={}, 记录ID={}, 值={}", table, column, id, safeValue(value));
    }

    private static String safeValue(String value) {
        String sanitized = value.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ');
        return sanitized.length() <= 128 ? sanitized : sanitized.substring(0, 128);
    }
}
