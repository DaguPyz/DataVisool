/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolservice.model.dto.ProjectImportParamDTO;
import com.zsq.datavisoolservice.service.ProjectService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ImportControllerNoticeTest {
    @Test void keepsBooleanResponseAndIncludesImportNotice() throws Exception {
        ProjectService service = mock(ProjectService.class);
        when(service.importProject(any())).thenAnswer(invocation -> {
            ProjectImportParamDTO input = invocation.getArgument(0);
            input.setImportNotice("请重新选择数据源");
            return true;
        });
        var response = new ImportController(service).importProject(new ProjectImportParamDTO());
        assertEquals(200, response.getCode());
        assertEquals(Boolean.TRUE, response.getData());
        assertEquals("请重新选择数据源", response.getMsg());
    }
}
