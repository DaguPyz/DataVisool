/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ProjectNameValidationTest {
    private final ProjectServiceImpl service = new ProjectServiceImpl(null, null, null, null, null, null);

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " ", "\t", "\u00A0", "\u3000", "\uFEFF"})
    void rejectsBlankNamesWhenCreatingProject(String name) {
        ProjectPO project = new ProjectPO();
        project.setName(name);

        AppException exception = assertThrows(AppException.class,
                () -> service.createProject(project));

        assertEquals(AppStatusCode.INVALID_PARAM.code(), exception.getCode());
        assertEquals("项目名称不能为空", exception.getMsg());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t", "\u00A0", "\u3000", "\uFEFF"})
    void rejectsBlankNamesWhenRenamingProject(String name) {
        ProjectPO project = new ProjectPO();
        project.setId(1L);
        project.setName(name);

        AppException exception = assertThrows(AppException.class,
                () -> service.updateProject(project));

        assertEquals(AppStatusCode.INVALID_PARAM.code(), exception.getCode());
        assertEquals("项目名称不能为空", exception.getMsg());
    }

    @Test
    void rejectsNamesExceedingTheUtf16CodeUnitLimit() {
        ProjectPO overLimit = new ProjectPO();
        overLimit.setName("😀".repeat(26));
        AppException createException = assertThrows(AppException.class,
                () -> service.createProject(overLimit));
        assertEquals("项目名称不能超过50个字符", createException.getMsg());

        ProjectPO overLimitRename = new ProjectPO();
        overLimitRename.setId(1L);
        overLimitRename.setName("😀".repeat(26));
        AppException renameException = assertThrows(AppException.class,
                () -> service.updateProject(overLimitRename));
        assertEquals("项目名称不能超过50个字符", renameException.getMsg());
    }
}
