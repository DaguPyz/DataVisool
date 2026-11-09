/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.zsq.datavisoolcommon.model.dto.ProjectDependenciesDTO;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.ProjectReleaseMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeCommonApiMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeDatasourceMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ProjectDependencyParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectReleaseDTO;
import com.zsq.datavisoolservice.model.po.ProjectReleasePO;
import com.zsq.datavisoolservice.service.ProjectService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProjectReleaseOverrideMappingTest {
    private ProjectReleaseServiceImpl service;
    private ProjectReleaseMapper releases;
    private final List<ProjectReleasePO> saved = new ArrayList<>();

    @BeforeEach void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), ProjectReleasePO.class);
        service = spy(new ProjectReleaseServiceImpl());
        releases = mock(ProjectReleaseMapper.class);
        ProjectService projects = mock(ProjectService.class);
        when(projects.calculateProjectDependency(any())).thenAnswer(invocation -> new ProjectDependenciesDTO());
        ReflectionTestUtils.setField(service, "projectReleaseMapper", releases);
        ReflectionTestUtils.setField(service, "projectService", projects);
        ReflectionTestUtils.setField(service, "runtimeDatasourceMapper", mock(ProjectReleaseRuntimeDatasourceMapper.class));
        ReflectionTestUtils.setField(service, "runtimeCommonApiMapper", mock(ProjectReleaseRuntimeCommonApiMapper.class));
        doAnswer(invocation -> { saved.add(invocation.getArgument(0)); return true; }).when(service).saveOrUpdate(any(ProjectReleasePO.class));
        User user = new User(); user.setId(7L); user.setRoles(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, "", List.of()));
    }

    @AfterEach void tearDown() { SecurityContextHolder.clearContext(); }

    @Test void keepsExistingAddressesAndAssignsAnAddressToNewReferencedPage() {
        ProjectReleasePO existing = new ProjectReleasePO();
        existing.setId(11L); existing.setUserId(7L); existing.setGroupId(100L); existing.setProjectMap("42:11,50:12");
        when(releases.selectOne(any())).thenReturn(existing);
        ProjectReleaseDTO request = new ProjectReleaseDTO(); request.setProjectId(42L);
        List<ProjectDependencyParamDTO> dependencies = List.of(
                dependency(42L, "{\"old\":{\"base\":{\"type\":\"ScreenReference\"},\"style\":{\"screenId\":\"__SCREEN_50__\"}},\"new\":{\"base\":{\"type\":\"ScreenReference\"},\"style\":{\"screenId\":\"__SCREEN_60__\"}},\"text\":\"__SCREEN_60__\"}"),
                dependency(50L, "{}"), dependency(60L, "{}"));

        assertEquals("11", service.overridePublish(request, dependencies));
        assertEquals(3, saved.size());
        ProjectReleasePO main = saved.get(0), oldChild = saved.get(1), newChild = saved.get(2);
        assertEquals(11L, main.getId());
        assertEquals(12L, oldChild.getId());
        assertNotNull(newChild.getId());
        assertNotEquals(main.getId(), newChild.getId());
        assertEquals(100L, newChild.getGroupId());
        assertEquals(1, main.getGroupMain());
        assertTrue(main.getProjectMap().contains("60:" + newChild.getId()));
        String data = JSON.parseObject(main.getDataJson()).getString("projectJson");
        assertEquals("12", JSON.parseObject(data).getJSONObject("old").getJSONObject("style").getString("screenId"));
        assertEquals(newChild.getId().toString(), JSON.parseObject(data).getJSONObject("new").getJSONObject("style").getString("screenId"));
        assertEquals("__SCREEN_60__", JSON.parseObject(data).getString("text"));

        when(releases.selectOne(any())).thenReturn(main);
        saved.clear();
        assertEquals("11", service.overridePublish(request, List.of(
                dependency(42L, "{\"new\":\"__SCREEN_60__\"}"), dependency(60L, "{}"))));
        assertEquals(newChild.getId(), saved.get(1).getId());
        assertEquals(100L, saved.get(1).getGroupId());
    }

    @Test void createsGroupForAFormerSinglePageAndRetainsItsAddress() {
        ProjectReleasePO existing = new ProjectReleasePO(); existing.setId(11L); existing.setUserId(7L);
        when(releases.selectOne(any())).thenReturn(existing);
        ProjectReleaseDTO request = new ProjectReleaseDTO(); request.setProjectId(42L);
        assertEquals("11", service.overridePublish(request, List.of(
                dependency(42L, "{\"child\":\"__SCREEN_60__\"}"), dependency(60L, "{}"))));
        assertNotNull(saved.get(0).getGroupId());
        assertEquals(saved.get(0).getGroupId(), saved.get(1).getGroupId());
        assertTrue(saved.get(0).getProjectMap().contains("42:11"));
    }

    @Test void stopsIfAReleaseRecordCannotBeSaved() {
        ProjectReleasePO existing = new ProjectReleasePO(); existing.setId(11L); existing.setUserId(7L);
        when(releases.selectOne(any())).thenReturn(existing);
        doReturn(false).when(service).saveOrUpdate(any(ProjectReleasePO.class));
        ProjectReleaseDTO request = new ProjectReleaseDTO(); request.setProjectId(42L);
        AppException error = assertThrows(AppException.class, () -> service.overridePublish(request,
                List.of(dependency(42L, "{}"), dependency(60L, "{}"))));
        assertTrue(error.getMsg().contains("保存发布项目失败"));
        verify(service, times(1)).saveOrUpdate(any(ProjectReleasePO.class));
    }

    private static ProjectDependencyParamDTO dependency(long id, String json) {
        ProjectDependencyParamDTO dependency = new ProjectDependencyParamDTO();
        dependency.setId(id); dependency.setName("project-" + id); dependency.setProjectJson(json);
        return dependency;
    }
}
