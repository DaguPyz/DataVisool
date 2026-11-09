/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.zsq.datavisoolservice.model.dto.ImageDTO;
import com.zsq.datavisoolservice.model.po.ImagePO;

import java.util.List;

public interface ImageService {
    /**
     * 上传图片
     *
     * @param imageDTO 图片实体
     * @return 图片地址
     */
    String uploadImage(ImageDTO imageDTO);

    /**
     * 获取指定项目下的所有手动上传的图片资源
     *
     * @param projectId 项目id
     * @return 图片资源列表
     */
    List<ImageDTO> getSourceImageList(Long projectId);

    /**
     * 获取指定项目下的所有手动上传的图片资源，不转换路径
     *
     * @param projectId 项目id
     * @return 图片资源列表
     */
    List<ImageDTO> getSourceImageListNoPathConvert(Long projectId);

    /**
     * 获取用户上传的图片列表
     *
     * @return 图片资源列表
     */
    List<ImageDTO> getUserUploadImageList();

    /**
     * 删除指定图片资源
     *
     * @param imageId 图片id
     * @return 是否删除成功
     */
    Boolean delImageSource(Long imageId);

    /**
     * 获取过期数据
     *
     * @return 过期数据列表
     */
    List<ImagePO> getExpiredData();

    /**
     * 创建文件
     *
     * @param imageDTO 文件对象
     */
    ImagePO createImage(ImageDTO imageDTO);

    /**
     * 根据id获取文件
     *
     * @param id id
     * @return filePo
     */
    ImagePO getImage(Long id);

    /**
     * 根据图片名称获取图片
     *
     * @param urls 图片名称
     * @return 图片列表
     */
    List<ImagePO> getImages(List<String> urls);

    /**
     * 创建文件
     *
     * @param imagePO 文件对象
     */
    ImagePO createImage(ImagePO imagePO);
}
