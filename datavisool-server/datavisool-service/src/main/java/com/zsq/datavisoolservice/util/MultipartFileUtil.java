/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.util;

import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.UUID;
import java.util.stream.Stream;

public class MultipartFileUtil {


    /**
     * 保存文件到磁盘
     *
     * @param file        待保存文件
     * @param parentPath  文件父路径（文件具体要保存的目录路径）
     * @param fileName    文件名。不传时默认使用UUID生成文件名
     * @param maxSize     允许上传的最大文件大小，单位：字节
     * @param allowFormat 允许上传的文件格式，不传则不做校验
     * @return 保存后的文件名
     */
    public static String saveFile(MultipartFile file, String parentPath, String fileName, Long maxSize, String[] allowFormat) {
        //是否需要校验hash
        if (file == null || parentPath == null || parentPath.isEmpty())
            throw new AppException(AppStatusCode.INVALID_PARAM);
        if (file.getSize() > (maxSize = maxSize == null ? AppBaseConfig.FILE_MAX_SIZE : maxSize))
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件体积太大, 允许最大的文件体积为: " + (maxSize / 1024 / 1024) + "M");
        String originFileName = file.getOriginalFilename();
        if (originFileName == null)
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件名称错误");
        int suffixIndex = originFileName.lastIndexOf(".");
        if (suffixIndex < 0 || suffixIndex == originFileName.length() - 1)
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件名称错误");
        String suffix = originFileName.substring(suffixIndex).toLowerCase();
        if (allowFormat == null)
            allowFormat = Stream.concat(Arrays.stream(AppBaseConfig.ALLOW_FILE_TYPE), Arrays.stream(AppBaseConfig.ALLOW_IMAGE_TYPE)).toList().toArray(new String[0]);
        if (!Arrays.asList(allowFormat).contains(suffix))
            throw new AppException(AppStatusCode.INVALID_PARAM, "不支持该格式的文件");

        if (fileName == null)
            fileName = UUID.randomUUID().toString().replaceAll("-", "") + suffix;

        //构建父路径
        Path uploadPath = Paths.get(parentPath);
        if (!Files.exists(uploadPath)) {
            try {
                Files.createDirectories(uploadPath);
            } catch (IOException e) {
                throw new AppException(AppStatusCode.SYSTEM_ERR, "无法创建文件目录： " + e.getMessage());
            }
        }
        Path finalFilePath = uploadPath.resolve(fileName);
        try {
            file.transferTo(finalFilePath.toFile());
            return fileName;
        } catch (IOException e) {
            throw new AppException(AppStatusCode.SYSTEM_ERR, "无法保存文件：" + e.getMessage());
        }
    }

}
