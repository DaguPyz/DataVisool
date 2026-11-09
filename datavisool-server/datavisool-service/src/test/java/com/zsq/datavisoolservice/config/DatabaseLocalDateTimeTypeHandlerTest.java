/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import org.junit.jupiter.api.Test;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DatabaseLocalDateTimeTypeHandlerTest {
    private final DatabaseLocalDateTimeTypeHandler handler = new DatabaseLocalDateTimeTypeHandler();

    @Test
    void readsValidAndNullValuesAndPropagatesDatabaseErrors() throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        LocalDateTime expected = LocalDateTime.of(2026, 11, 6, 14, 15, 16, 123_000_000);
        when(rs.getString("update_time")).thenReturn("2026-11-06 14:15:16.123", null);
        when(rs.getObject("update_time", LocalDateTime.class)).thenReturn(expected);
        assertEquals(expected, handler.getNullableResult(rs, "update_time"));
        assertNull(handler.getNullableResult(rs, "update_time"));
        verify(rs, times(1)).getObject("update_time", LocalDateTime.class);
        when(rs.getString(2)).thenThrow(new SQLException("connection error"));
        assertThrows(SQLException.class, () -> handler.getNullableResult(rs, 2));
    }

    @Test
    void invalidDateReturnsNullAndLooksUpTheRecordLocation() throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        ResultSetMetaData metadata = mock(ResultSetMetaData.class);
        when(rs.getString("update_time")).thenReturn("0000-00-00 00:00:00", "2026-02-30 10:00:00");
        when(rs.findColumn("update_time")).thenReturn(2);
        when(rs.getMetaData()).thenReturn(metadata);
        when(metadata.getTableName(2)).thenReturn("project");
        when(metadata.getColumnLabel(2)).thenReturn("update_time");
        when(rs.getString("id")).thenReturn("42");

        assertNull(handler.getNullableResult(rs, "update_time"));
        assertNull(handler.getNullableResult(rs, "update_time"));
        verify(rs, times(2)).getString("id");
        verify(metadata, times(2)).getTableName(2);
        verify(metadata, times(2)).getColumnLabel(2);
    }
}
