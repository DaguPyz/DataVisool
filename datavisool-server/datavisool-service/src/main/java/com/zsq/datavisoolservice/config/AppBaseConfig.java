/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;

import com.zsq.datavisoolservice.security.RsaKeyPair;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

@Log4j2
@Component
public class AppBaseConfig {

    public static final String SEPARATOR = "/";

    /**
     * 系统默认允许接受的文件类型
     */
    public static final String[] ALLOW_FILE_TYPE = new String[]{".js"};

    /**
     * 默认允许上传的图片类型
     */
    public static final String[] ALLOW_IMAGE_TYPE = new String[]{".bmp", ".jpg", ".jpeg", ".png", ".gif"};

    /**
     * 默认允许上传的视频类型
     */
    public static final String[] ALLOW_VIDEO_TYPE = new String[]{".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv", ".webm"};

    /**
     * 默认允许上传的模型类型
     */
    public static final String[] ALLOW_MODEL_TYPE = new String[]{".glb", ".gltf", ".obj", ".fbx", ".zip"};

    /**
     * 默认允许上传的文件大小限制
     */
    public static long FILE_MAX_SIZE;

    /**
     * 默认允许上传的图片大小限制
     */
    public static long IMAGE_MAX_SIZE;

    /**
     * 默认允许的头像图片大小限制
     */
    public static long AVATAR_MAX_SIZE;

    /**
     * 默认允许的视频大小限制
     */
    public static long VIDEO_MAX_SIZE;

    /**
     * 默认允许的模型大小限制
     */
    public static long MODEL_MAX_SIZE;

    /**
     * 项目资源根目录
     */
    public static String ROOT_PATH;

    /**
     * 图片资源路径，用于存储图片资源
     */
    public static String IMAGE_PATH;

    /**
     * 封面路径，用于存储项目封面图片
     */
    public static String COVER_PATH;

    /**
     * 头像路径，用于存储头像图片
     */
    public static String AVATAR_PATH;

    /**
     * 服务器组件路径，用于存储服务器组件
     */
    public static String REMOTE_COMPONENT_PATH;

    /**
     * 字体路径
     */
    public static String FONT_PATH;

    /**
     * 动态脚本路径，用于存储动态脚本
     */
    public static String DYNAMIC_SCRIPT_PATH;

    /**
     * logo 路径
     */
    public static String LOGO_PATH;

    /**
     * 模板封面
     */
    public static String TEMPLATE_COVER_PATH;

    /**
     * 视频路径
     */
    public static String VIDEO_PATH;

    /**
     * 模型路径
     */
    public static String MODEL_PATH;

    /**
     * 测试数据库连接的最大等待时间
     */
    public static Long TEST_DATABASE_MAX_TIMEOUT;

    /**
     * 系统密钥对
     */
    public static RsaKeyPair SYSTEM_RSA_KEY_PAIR;

    /**
     * 系统版本
     */public static String VERSION = "2026.9.0";

    @Value("${datavisool.resource-path.root:#{null}}")
    public void setRootPath(String path) {
        if (path == null)
            path = System.getProperty("user.dir");
        ROOT_PATH = path;
    }

    @Value("${datavisool.resource-path.image:/static/images}")
    public void setSourceImagePath(String path) {
        IMAGE_PATH = path;
    }

    @Value("${datavisool.resource-path.cover:/static/covers}")
    public void setCoverPath(String path) {
        COVER_PATH = path;
    }

    @Value("${datavisool.resource-path.avatar:/static/avatar}")
    public void setAvatarPath(String path) {
        AVATAR_PATH = path;
    }

    @Value("${datavisool.resource-path.remote-component:/static/components}")
    public void setRemoteComponentPath(String path) {
        REMOTE_COMPONENT_PATH = path;
    }

    @Value("${datavisool.resource-path.font:/static/font}")
    public void setFontPath(String path) {
        FONT_PATH = path;
    }

    @Value("${datavisool.resource-path.dynamic-script:/static/lib}")
    public void setDynamicScriptPath(String path) {
        DYNAMIC_SCRIPT_PATH = path;
    }

    @Value("${datavisool.resource-path.logo:/static/logo}")
    public void setLogoPath(String path) {
        LOGO_PATH = path;
    }

    @Value("${datavisool.resource-path.template-cover:/static/templateCover}")
    public void setTemplateCoverPath(String path) {
        TEMPLATE_COVER_PATH = path;
    }

    @Value("${datavisool.resource-path.video:/static/videos}")
    public void setVideoPath(String path) {
        VIDEO_PATH = path;
    }

    @Value("${datavisool.resource-path.model:/static/models}")
    public void setModelPath(String path) {
        MODEL_PATH = path;
    }

    @Value("${datavisool.file.avatar-max-size:1MB}")
    public void setAvatarMaxSize(String size) {
        size = size.toUpperCase();
        if (size.contains("MB"))
            AVATAR_MAX_SIZE = Long.parseLong(size.replace("MB", "")) * 1024 * 1024;
        else if (size.contains("KB"))
            AVATAR_MAX_SIZE = Long.parseLong(size.replace("KB", "")) * 1024;
        else {
            try {
                AVATAR_MAX_SIZE = Long.parseLong(size);
            } catch (Exception e) {
                log.error("the configuration format <datavisool.file.avatar-max-size> is incorrect, and the allowed formats are 5MB, 5KB, 5");
            }
        }
    }

    @Value("${datavisool.file.image-max-size:50MB}")
    public void setImageSize(String size) {
        size = size.toUpperCase();
        if (size.contains("MB"))
            IMAGE_MAX_SIZE = Long.parseLong(size.replace("MB", "")) * 1024 * 1024;
        else if (size.contains("KB"))
            IMAGE_MAX_SIZE = Long.parseLong(size.replace("KB", "")) * 1024;
        else {
            try {
                IMAGE_MAX_SIZE = Long.parseLong(size);
            } catch (Exception e) {
                log.error("the configuration format <datavisool.file.image-max-size> is incorrect, and the allowed formats are 5MB, 5KB, 5");
            }
        }
    }

    @Value("${datavisool.file.max-size:20MB}")
    public void setFileMaxSize(String size) {
        size = size.toUpperCase();
        if (size.contains("MB"))
            FILE_MAX_SIZE = Long.parseLong(size.replace("MB", "")) * 1024 * 1024;
        else if (size.contains("KB"))
            FILE_MAX_SIZE = Long.parseLong(size.replace("KB", "")) * 1024;
        else {
            try {
                FILE_MAX_SIZE = Long.parseLong(size);
            } catch (Exception e) {
                log.error("the configuration format <datavisool.file.max-size> is incorrect, and the allowed formats are 5MB, 5KB, 5");
            }
        }
    }

    @Value("${datavisool.file.video-max-size:500MB}")
    public void setVideoMaxSize(String size) {
        size = size.toUpperCase();
        if (size.contains("MB"))
            VIDEO_MAX_SIZE = Long.parseLong(size.replace("MB", "")) * 1024 * 1024;
        else if (size.contains("KB"))
            VIDEO_MAX_SIZE = Long.parseLong(size.replace("KB", "")) * 1024;
        else {
            try {
                VIDEO_MAX_SIZE = Long.parseLong(size);
            } catch (Exception e) {
                log.error("the configuration format <datavisool.file.video-max-size> is incorrect, and the allowed formats are 5MB, 5KB, 5");
            }
        }
    }

    @Value("${datavisool.file.model-max-size:500MB}")
    public void setModelMaxSize(String size) {
        size = size.toUpperCase();
        if (size.contains("MB"))
            MODEL_MAX_SIZE = Long.parseLong(size.replace("MB", "")) * 1024 * 1024;
        else if (size.contains("KB"))
            MODEL_MAX_SIZE = Long.parseLong(size.replace("KB", "")) * 1024;
        else {
            try {
                MODEL_MAX_SIZE = Long.parseLong(size);
            } catch (Exception e) {
                log.error("the configuration format <datavisool.file.model-max-size> is incorrect, and the allowed formats are 5MB, 5KB, 5");
            }
        }
    }

    @Value("${datavisool.db.test-database-max-timeout:10}")
    public void setTestDatabaseMaxTimeout(Long timeout) {
        TEST_DATABASE_MAX_TIMEOUT = timeout * 1000;
    }

    public static String getRootPath() {
        return ROOT_PATH;
    }

    public static String getImagePath() {
        return Path.of(ROOT_PATH, IMAGE_PATH).toString();
    }

    public static String getCoverPath() {
        return Path.of(ROOT_PATH, COVER_PATH).toString();
    }

    public static String getAvatarPath() {
        return Path.of(ROOT_PATH, AVATAR_PATH).toString();
    }

    public static String getRemoteComponentPath() {
        return Path.of(ROOT_PATH, REMOTE_COMPONENT_PATH).toString();
    }

    public static String getTemplateCoverPath() {
        return Path.of(ROOT_PATH, TEMPLATE_COVER_PATH).toString();
    }

    public static String getVideoPath() {
        return Path.of(ROOT_PATH, VIDEO_PATH).toString();
    }

    public static String getModelPath() {
        return Path.of(ROOT_PATH, MODEL_PATH).toString();
    }

    public static String getFontPath() {
        return Path.of(ROOT_PATH, FONT_PATH).toString();
    }

    public static String getDynamicScriptPath() {
        return Path.of(ROOT_PATH, DYNAMIC_SCRIPT_PATH).toString();
    }

    public static String getLogoPath() {
        return Path.of(ROOT_PATH, LOGO_PATH).toString();
    }

}
