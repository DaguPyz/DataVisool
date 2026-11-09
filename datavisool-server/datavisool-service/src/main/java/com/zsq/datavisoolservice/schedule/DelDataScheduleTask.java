/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.schedule;

import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.model.po.ImagePO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import com.zsq.datavisoolservice.model.po.UserPO;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.service.ProjectService;
import com.zsq.datavisoolservice.service.RemoteComponentService;
import com.zsq.datavisoolservice.service.UserService;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.List;

@DependsOn({"imageServiceImpl", "remoteComponentServiceImpl", "projectServiceImpl", "userServiceImpl"})
@Log4j2
@Component
public class DelDataScheduleTask {

    @Resource
    private ImageService imageService;

    @Resource
    private RemoteComponentService remoteComponentService;
    @Resource
    private com.zsq.datavisoolservice.service.impl.ai.ComponentDocumentService componentDocuments;

    @Resource
    private ProjectService projectService;

    @Resource
    private UserService userService;

    @Resource
    private JdbcTemplate jdbcTemplate;


    private static final String[] TABLES = new String[]{
            "project",
            "common_database",
            "common_api",
            "ai_model",
            "user",
            "file",
            "local_auth",
            "remote_component",
            "remote_component_document",
            "project_release"
    };

    private static final String DELETE_SQL = "delete from %s where deleted = 1";

    /**
     * 定时任务
     */
    @Scheduled(cron = "0 0 0 ? * SUN")
    @Transactional
    public void executeTask() {
        log.info("execute scheduled tasks: ==> delete expired data");
        // 删除过期的远程组件文件
        deleteRemoteComponentFile();
        componentDocuments.cleanDeletedDocuments();
        // 删除过期的图片资源
        deleteImageFile();
        //删除过期的项目封面
        deleteProjectCover();
        // 删除过期的用户头像
        deleteUserAvatar();
        // 彻底删除数据库中的过期数据
        deleteExpiredData();
        log.info("execute scheduled tasks: ==> delete expired data success");
    }

    /**
     * 删除过期的远程组件文件
     */
    private void deleteRemoteComponentFile() {
        List<RemoteComponentPO> expiredData = remoteComponentService.getExpiredData();
        if (expiredData == null || expiredData.isEmpty())
            return;
        expiredData.stream().map(RemoteComponentPO::getUrl)
                .filter(url -> !componentDocuments.hasActivePackageReference(url)).forEach(this::deleteRemoteComponentPhysicalPath);
    }

    /**
     * 删除过期的图片资源
     */
    private void deleteImageFile() {
        List<ImagePO> expiredData = imageService.getExpiredData();
        if (expiredData == null || expiredData.isEmpty())
            return;
        List<String> urls = expiredData.stream().map(ImagePO::getUrl).map(url -> AppBaseConfig.getImagePath() + AppBaseConfig.SEPARATOR + url).toList();
        deletePhysicalFile(urls);
    }

    /**
     * 删除过期的项目封面
     */
    private void deleteProjectCover() {
        List<ProjectPO> expiredData = projectService.getExpiredData();
        if (expiredData == null || expiredData.isEmpty())
            return;
        List<String> urls = expiredData.stream().map(ProjectPO::getCover).map(cover -> AppBaseConfig.getCoverPath() + AppBaseConfig.SEPARATOR + cover).toList();
        deletePhysicalFile(urls);
    }

    /**
     * 删除过期的用户头像
     */
    private void deleteUserAvatar() {
        List<UserPO> expiredData = userService.getExpiredData();
        if (expiredData == null || expiredData.isEmpty())
            return;
        List<String> urls = expiredData.stream().map(UserPO::getAvatar).map(avatar -> AppBaseConfig.getAvatarPath() + AppBaseConfig.SEPARATOR + avatar).toList();
        deletePhysicalFile(urls);
    }

    /**
     * 彻底删除数据库中的过期数据
     */
    private void deleteExpiredData() {
        for (String table : TABLES) {
            jdbcTemplate.execute(String.format(DELETE_SQL, table));
        }
    }

    /**
     * 删除物理文件
     *
     * @param paths 文件路径
     */
    private void deletePhysicalFile(List<String> paths) {
        paths.forEach(path -> {
            try {
                Path filePath = Paths.get(path);
                Files.deleteIfExists(filePath);
            } catch (IOException e) {
                log.error("delete physical file error: {}, the file path: {}", e.getMessage(), path);
            }
        });
    }

    private void deleteRemoteComponentPhysicalPath(String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        String normalized = url.replace('\\', '/').replaceFirst("^/+", "");
        String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "") + "/";
        if (normalized.startsWith(marker)) {
            normalized = normalized.substring(marker.length());
        }
        if (normalized.isBlank()) {
            return;
        }

        Path root = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
        Path target = normalized.contains("/")
                ? root.resolve(normalized.substring(0, normalized.indexOf('/'))).normalize()
                : root.resolve(normalized).normalize();
        if (!target.startsWith(root)) {
            log.error("remote component path is unsafe: {}", url);
            return;
        }
        deletePhysicalPath(target);
    }

    private void deletePhysicalPath(Path target) {
        try {
            if (Files.isDirectory(target)) {
                try (var paths = Files.walk(target)) {
                    paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            log.error("delete physical directory file error: {}, the file path: {}", e.getMessage(), path);
                        }
                    });
                }
                return;
            }
            Files.deleteIfExists(target);
        } catch (IOException e) {
            log.error("delete physical path error: {}, the file path: {}", e.getMessage(), target);
        }
    }
}
