/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.ThreeDModelMapper;
import com.zsq.datavisoolservice.mapper.VideoMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ThreeDModelDTO;
import com.zsq.datavisoolservice.model.dto.ThreeDModelPageParamDTO;
import com.zsq.datavisoolservice.model.dto.VideoDTO;
import com.zsq.datavisoolservice.model.dto.VideoPageParamDTO;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.Assert.*;

/** 普通用户、管理员和系统管理员使用相同的 SQL 隔离规则。 */
@RunWith(Parameterized.class)
public class MediaResourceUserIsolationTest {
    @Parameterized.Parameters(name = "{0}")
    public static List<String> roles() {
        return List.of("ROLE_USER", "ROLE_ADMIN", "ROLE_SYSTEM_ADMIN");
    }

    private final String role;
    private SqlSession session;
    private JdbcTemplate jdbc;
    private ThreeDModelServiceImpl models;
    private VideoServiceImpl videos;

    public MediaResourceUserIsolationTest(String role) {
        this.role = role;
    }

    @Before
    public void setUp() throws IOException {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        // H2 的索引名在同一 schema 中唯一，MySQL 的索引名只需在各表中唯一。
        String modelSchema = new ClassPathResource("migration/V2026.1.8.2__model.sql")
                .getContentAsString(StandardCharsets.UTF_8)
                .replace("`idx_user_id`", "`idx_three_d_model_user_id`");
        new ResourceDatabasePopulator(
                new ClassPathResource("migration/V2026.1.8.1__video.sql"),
                new ByteArrayResource(modelSchema.getBytes(StandardCharsets.UTF_8))
        ).execute(dataSource);
        jdbc = new JdbcTemplate(dataSource);
        for (String table : List.of("video", "three_d_model")) {
            jdbc.update("insert into " + table + " (id, name, url, user_id) values (1, 'foreign', 'foreign.asset', 1)");
            jdbc.update("insert into " + table + " (id, name, url, user_id) values (2, 'own first', 'first.asset', 2)");
            jdbc.update("insert into " + table + " (id, name, url, user_id) values (3, 'own second', 'second.asset', 2)");
        }

        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("test", new JdbcTransactionFactory(), dataSource));
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.H2));
        configuration.addInterceptor(interceptor);
        configuration.addMapper(ThreeDModelMapper.class);
        configuration.addMapper(VideoMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(configuration).openSession(true);
        models = new ThreeDModelServiceImpl(session.getMapper(ThreeDModelMapper.class));
        videos = new VideoServiceImpl(session.getMapper(VideoMapper.class));
        login(2L);
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
        if (session != null) session.close();
    }

    @Test
    public void listsPaginationAndSearchOnlyIncludeOwnResources() {
        assertEquals(Set.of(2L, 3L), models.getModelPage(null).getRecords().stream()
                .map(ThreeDModelDTO::getId).collect(Collectors.toSet()));
        assertEquals(Set.of(2L, 3L), videos.getVideoPage(null).getRecords().stream()
                .map(VideoDTO::getId).collect(Collectors.toSet()));

        ThreeDModelPageParamDTO modelPage = new ThreeDModelPageParamDTO();
        VideoPageParamDTO videoPage = new VideoPageParamDTO();
        modelPage.setSize(1L);
        videoPage.setSize(1L);
        assertEquals(2, models.getModelPage(modelPage).getTotal());
        assertEquals(1, models.getModelPage(modelPage).getRecords().size());
        assertEquals(2, videos.getVideoPage(videoPage).getTotal());
        assertEquals(1, videos.getVideoPage(videoPage).getRecords().size());
        modelPage.setSearchValue("foreign");
        videoPage.setSearchValue("foreign");
        assertEquals(0, models.getModelPage(modelPage).getTotal());
        assertEquals(0, videos.getVideoPage(videoPage).getTotal());
    }

    @Test
    public void detailsAndUpdatesRejectForeignResourcesWhileOwnResourcesRemainEditable() {
        assertEquals(Long.valueOf(2), models.getModel(2L).getId());
        assertEquals(Long.valueOf(2), videos.getVideo(2L).getId());
        assertNull(models.getModel(1L));
        assertNull(videos.getVideo(1L));

        ThreeDModelDTO model = new ThreeDModelDTO();
        model.setId(2L);
        model.setName("renamed");
        VideoDTO video = new VideoDTO();
        video.setId(2L);
        video.setName("renamed");
        assertTrue(models.updateModel(model));
        assertTrue(videos.updateVideo(video));
        assertEquals("renamed", models.getModel(2L).getName());
        assertEquals("renamed", videos.getVideo(2L).getName());

        model.setId(1L);
        video.setId(1L);
        assertEquals(AppStatusCode.NOT_FOUND.code(),
                assertThrows(AppException.class, () -> models.updateModel(model)).getCode());
        assertEquals(AppStatusCode.NOT_FOUND.code(),
                assertThrows(AppException.class, () -> videos.updateVideo(video)).getCode());
        for (String table : List.of("video", "three_d_model")) {
            assertEquals("foreign", jdbc.queryForObject("select name from " + table + " where id = 1", String.class));
        }
    }

    @Test
    public void mixedOwnerBatchDeletionRejectsEntireRequestWithoutDeletingOwnResources() {
        assertEquals(AppStatusCode.UNAUTHORIZED.code(),
                assertThrows(AppException.class, () -> models.batchDelete(List.of(2L, 1L))).getCode());
        assertEquals(AppStatusCode.UNAUTHORIZED.code(),
                assertThrows(AppException.class, () -> videos.batchDeleteVideo(List.of(2L, 1L))).getCode());
        for (String table : List.of("video", "three_d_model")) {
            assertEquals(Long.valueOf(3), jdbc.queryForObject("select count(*) from " + table + " where deleted = 0", Long.class));
        }
    }

    @Test
    public void ownBatchDeletionKeepsForeignResources() {
        assertTrue(models.batchDelete(List.of(2L, 3L)));
        assertTrue(videos.batchDeleteVideo(List.of(2L, 3L)));
        assertTrue(models.getModelPage(null).getRecords().isEmpty());
        assertTrue(videos.getVideoPage(null).getRecords().isEmpty());
        for (String table : List.of("video", "three_d_model")) {
            assertEquals(Long.valueOf(1), jdbc.queryForObject("select id from " + table + " where deleted = 0", Long.class));
        }
        assertTrue(models.batchDelete(List.of(999L)));
        assertTrue(videos.batchDeleteVideo(List.of(999L)));
        assertFalse(models.batchDelete(List.of()));
        assertFalse(videos.batchDeleteVideo(List.of()));
    }

    @Test
    public void singleVideoDeletionRequiresOwnership() {
        assertEquals(AppStatusCode.UNAUTHORIZED.code(),
                assertThrows(AppException.class, () -> videos.deleteVideo(1L)).getCode());
        assertTrue(videos.deleteVideo(2L));
        assertNull(videos.getVideo(2L));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("select deleted from video where id = 1", Integer.class));
        assertTrue(videos.deleteVideo(999L));
    }

    @Test
    public void missingUserIdCannotBypassOwnershipFilters() {
        login(null);
        assertEquals(AppStatusCode.UNAUTHORIZED.code(),
                assertThrows(AppException.class, () -> models.getModelPage(null)).getCode());
        assertEquals(AppStatusCode.UNAUTHORIZED.code(),
                assertThrows(AppException.class, () -> videos.getVideoPage(null)).getCode());
    }

    private void login(Long userId) {
        User user = new User();
        user.setId(userId);
        user.setRoles(List.of(role));
        user.setPermissions(List.of());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }
}
