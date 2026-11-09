/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.zsq.datavisoolcommon.model.dto.ProjectDependenciesDTO;
import com.zsq.datavisoolservice.constants.ReleaseTypeEnum;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.CommonApiMapper;
import com.zsq.datavisoolservice.mapper.DatasourceMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeCommonApiMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeDatasourceMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ProjectDependencyParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectReleaseDTO;
import com.zsq.datavisoolservice.service.ProjectReleaseService;
import com.zsq.datavisoolservice.service.ProjectService;
import com.zsq.datavisoolservice.util.ProjectDataCodecUtil;
import org.apache.ibatis.mapping.Environment;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProjectReleaseTransactionTest {
    @Configuration
    @EnableTransactionManagement
    static class TransactionConfig { }

    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private ProjectReleaseService service;
    private ProjectService projects;

    @BeforeEach void setUp() {
        JdbcDataSource datasource = new JdbcDataSource();
        datasource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(datasource);
        jdbc.execute("create table project (id bigint primary key, user_id bigint, deleted int default 0)");
        jdbc.execute("create table project_release (id bigint auto_increment primary key, name varchar(255), state int, encrypt boolean, password varchar(255), data_json clob, project_id bigint, user_id bigint, group_id bigint, group_main int, project_map varchar(2000), expiration_date int, create_time timestamp default current_timestamp, update_time timestamp default current_timestamp, deleted int default 0)");
        jdbc.update("insert into project (id,user_id) values (42,7),(60,7)");
        jdbc.update("insert into project_release (id,name,state,encrypt,data_json,project_id,user_id,group_main,project_map) values (11,'main',1,false,'original',42,7,1,'42:11')");

        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new SpringManagedTransactionFactory(), datasource));
        configuration.addMapper(ProjectMapper.class);
        configuration.addMapper(ProjectReleaseMapper.class);
        SqlSessionTemplate session = new SqlSessionTemplate(new MybatisSqlSessionFactoryBuilder().build(configuration));
        ProjectReleaseMapper releases = session.getMapper(ProjectReleaseMapper.class);
        projects = mock(ProjectService.class);
        when(projects.calculateProjectDependency(any())).thenAnswer(invocation -> new ProjectDependenciesDTO());
        ProjectReleaseServiceImpl target = new ProjectReleaseServiceImpl();
        ReflectionTestUtils.setField(target, "projectMapper", session.getMapper(ProjectMapper.class));
        ReflectionTestUtils.setField(target, "projectReleaseMapper", releases);
        ReflectionTestUtils.setField(target, "baseMapper", releases);
        ReflectionTestUtils.setField(target, "projectService", projects);
        ReflectionTestUtils.setField(target, "runtimeDatasourceMapper", mock(ProjectReleaseRuntimeDatasourceMapper.class));
        ReflectionTestUtils.setField(target, "runtimeCommonApiMapper", mock(ProjectReleaseRuntimeCommonApiMapper.class));
        context = new AnnotationConfigApplicationContext();
        context.register(TransactionConfig.class);
        context.registerBean(PlatformTransactionManager.class, () -> new DataSourceTransactionManager(datasource));
        context.registerBean(ProjectReleaseMapper.class, () -> releases);
        context.registerBean(ProjectMapper.class, () -> session.getMapper(ProjectMapper.class));
        context.registerBean(ProjectService.class, () -> projects);
        context.registerBean(CommonApiMapper.class, () -> mock(CommonApiMapper.class));
        context.registerBean(DatasourceMapper.class, () -> mock(DatasourceMapper.class));
        context.registerBean(ProjectReleaseRuntimeDatasourceMapper.class, () -> mock(ProjectReleaseRuntimeDatasourceMapper.class));
        context.registerBean(ProjectReleaseRuntimeCommonApiMapper.class, () -> mock(ProjectReleaseRuntimeCommonApiMapper.class));
        context.registerBean(ProjectReleaseService.class, () -> target);
        context.refresh();
        service = context.getBean(ProjectReleaseService.class);
        assertTrue(AopUtils.isAopProxy(service));
        User user = new User(); user.setId(7L); user.setRoles(List.of());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, "", List.of()));
    }

    @AfterEach void tearDown() {
        SecurityContextHolder.clearContext();
        if (context != null) context.close();
    }

    @Test void commitsNewReferenceAndLoadsBothPublishedPages() {
        assertEquals("11", service.releaseProject(request()));
        assertEquals(2, jdbc.queryForObject("select count(*) from project_release", Integer.class));
        Long childId = jdbc.queryForObject("select id from project_release where id<>11", Long.class);
        Long groupId = jdbc.queryForObject("select group_id from project_release where id=11", Long.class);
        assertNotNull(groupId);
        assertEquals(groupId, jdbc.queryForObject("select group_id from project_release where id=?", Long.class, childId));
        ProjectReleaseDTO main = new ProjectReleaseDTO(); main.setId(11L);
        ProjectReleaseDTO child = new ProjectReleaseDTO(); child.setId(childId);
        String json = JSON.parseObject(service.getProjectReleaseData(main).getDataJson()).getString("projectJson");
        assertEquals(childId.toString(), JSON.parseObject(json).getJSONObject("child").getJSONObject("style").getString("screenId"));
        assertEquals("project-60", service.getProjectReleaseData(child).getName());
    }

    @Test void rollsBackTheMainPageIfCreatingTheChildFails() {
        when(projects.calculateProjectDependency(any())).thenAnswer(invocation -> {
            ProjectDependencyParamDTO input = invocation.getArgument(0);
            if (input.getId().equals(60L)) throw new IllegalStateException("synthetic failure");
            return new ProjectDependenciesDTO();
        });
        assertThrows(IllegalStateException.class, () -> service.releaseProject(request()));
        assertEquals(1, jdbc.queryForObject("select count(*) from project_release", Integer.class));
        assertEquals("original", jdbc.queryForObject("select data_json from project_release where id=11", String.class));
        assertEquals("42:11", jdbc.queryForObject("select project_map from project_release where id=11", String.class));
        assertNull(jdbc.queryForObject("select group_id from project_release where id=11", Long.class));
    }

    @Test void rollsBackTheMainPageWhenDatabaseRejectsTheChildRecord() {
        jdbc.execute("alter table project_release add constraint deny_child check (name <> 'project-60')");
        assertThrows(RuntimeException.class, () -> service.releaseProject(request()));
        assertEquals(1, jdbc.queryForObject("select count(*) from project_release", Integer.class));
        assertEquals("original", jdbc.queryForObject("select data_json from project_release where id=11", String.class));
        assertEquals("42:11", jdbc.queryForObject("select project_map from project_release where id=11", String.class));
        assertNull(jdbc.queryForObject("select group_id from project_release where id=11", Long.class));
    }

    @Test void rejectsMissingAndCyclicReferencesBeforeChangingPublishedData() {
        ProjectReleaseDTO missing = request();
        missing.setDependencies(List.of(missing.getDependencies().get(0)));
        AppException error = assertThrows(AppException.class, () -> service.releaseProject(missing));
        assertTrue(error.getMsg().contains("发布依赖缺少引用的大屏"));

        ProjectReleaseDTO cycle = request();
        cycle.getDependencies().get(1).setProjectJson(reference(42L));
        error = assertThrows(AppException.class, () -> service.releaseProject(cycle));
        assertTrue(error.getMsg().contains("大屏引用存在循环"));
        assertEquals(1, jdbc.queryForObject("select count(*) from project_release", Integer.class));
        assertEquals("original", jdbc.queryForObject("select data_json from project_release where id=11", String.class));
    }

    @Test void incrementPublishPreservesOtherTextAndCompressedData() {
        ProjectReleaseDTO input = request();
        input.setReleaseType(ReleaseTypeEnum.INCREMENT);
        String json = "{\"nested\":[" + reference(60L) + "],\"text\":\"__SCREEN_60__\"}";
        input.getDependencies().get(0).setProjectJson(ProjectDataCodecUtil.encode(json));
        Long mainId = Long.valueOf(service.releaseProject(input));
        ProjectReleaseDTO main = new ProjectReleaseDTO(); main.setId(mainId);
        String encoded = JSON.parseObject(service.getProjectReleaseData(main).getDataJson()).getString("projectJson");
        assertTrue(ProjectDataCodecUtil.isCompressed(encoded));
        var decoded = JSON.parseObject(ProjectDataCodecUtil.decode(encoded));
        String childId = decoded.getJSONArray("nested").getJSONObject(0).getJSONObject("style").getString("screenId");
        assertNotEquals("__SCREEN_60__", childId);
        assertEquals("__SCREEN_60__", decoded.getString("text"));
        ProjectReleaseDTO child = new ProjectReleaseDTO(); child.setId(Long.valueOf(childId));
        assertEquals("project-60", service.getProjectReleaseData(child).getName());
    }

    private static ProjectReleaseDTO request() {
        ProjectDependencyParamDTO main = dependency(42L, "{\"child\":" + reference(60L) + "}");
        ProjectDependencyParamDTO child = dependency(60L, "{}");
        ProjectReleaseDTO request = new ProjectReleaseDTO();
        request.setProjectId(42L); request.setDependencies(List.of(main, child));
        return request;
    }

    private static String reference(long id) {
        return "{\"base\":{\"type\":\"ScreenReference\"},\"style\":{\"screenId\":\"__SCREEN_" + id + "__\"}}";
    }

    private static ProjectDependencyParamDTO dependency(long id, String json) {
        ProjectDependencyParamDTO dependency = new ProjectDependencyParamDTO();
        dependency.setId(id); dependency.setName("project-" + id); dependency.setProjectJson(json);
        return dependency;
    }
}
