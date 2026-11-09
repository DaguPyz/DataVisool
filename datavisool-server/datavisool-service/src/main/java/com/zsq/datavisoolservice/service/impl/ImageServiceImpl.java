/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.ImageMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ImageDTO;
import com.zsq.datavisoolservice.model.po.ImagePO;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import jakarta.annotation.Resource;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;


@Service
public class ImageServiceImpl implements ImageService {

    @Resource
    private ImageMapper imageMapper;

    @Override
    @Transactional
    public String uploadImage(ImageDTO imageDTO) {
        ImagePO po = createImage(imageDTO);
        if (po == null || po.getId() == null)
            return null;
        return Paths.get(AppBaseConfig.IMAGE_PATH, po.getUrl()).toString();
    }

    @Override
    public List<ImageDTO> getSourceImageList(Long projectId) {
        if (projectId == null || projectId <= 0)
            throw new AppException(500, "项目id错误");
        List<ImageDTO> imageDTOList = getSourceImageListNoPathConvert(projectId);
        imageDTOList.forEach((image) -> image.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.IMAGE_PATH, image.getUrl())));
        return imageDTOList;
    }

    @Override
    public List<ImageDTO> getSourceImageListNoPathConvert(Long projectId) {
        if (projectId == null || projectId <= 0)
            throw new AppException(500, "项目id错误");
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        QueryWrapper<ImagePO> queryWrapper = new QueryWrapper<>();
        queryWrapper.lambda().eq(ImagePO::getDeleted, 0);
        queryWrapper.lambda().eq(ImagePO::getUserId, user.getId());
        List<ImagePO> imagePOS = imageMapper.selectList(queryWrapper);
        List<ImageDTO> imageDTOS = new ArrayList<>();
        imagePOS.forEach((image) -> {
            ImageDTO imageDTO = new ImageDTO();
            BeanUtils.copyProperties(image, imageDTO);
            imageDTOS.add(imageDTO);
        });
        return imageDTOS;
    }

    @Override
    public List<ImageDTO> getUserUploadImageList() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        QueryWrapper<ImagePO> queryWrapper = new QueryWrapper<>();
        queryWrapper.lambda().eq(ImagePO::getDeleted, 0);
        queryWrapper.lambda().eq(ImagePO::getUserId, user.getId());
        List<ImagePO> imagePOS = imageMapper.selectList(queryWrapper);
        List<ImageDTO> imageDTOS = new ArrayList<>();
        imagePOS.forEach((image) -> {
            ImageDTO imageDTO = new ImageDTO();
            BeanUtils.copyProperties(image, imageDTO);
            imageDTO.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.IMAGE_PATH, image.getUrl()));
            imageDTOS.add(imageDTO);
        });
        return imageDTOS;
    }

    @Override
    @Transactional
    public Boolean delImageSource(Long imageId) {
        if (imageId == null || imageId <= 0)
            throw new AppException(500, "图片id错误");
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            throw new AppException(500, "用户未登录");
        QueryWrapper<ImagePO> queryWrapper = new QueryWrapper<>();
        queryWrapper.lambda()
                .eq(ImagePO::getId, imageId)
                .eq(ImagePO::getUserId, user.getId());
        int row = imageMapper.delete(queryWrapper);
        return row > 0;
    }

    @Override
    public List<ImagePO> getExpiredData() {
        return imageMapper.getExpiredData();
    }

    @Override
    public ImagePO createImage(ImageDTO imageDTO) {
        User user = AppContextUtil.getCurrentUser();
        //校验基础参数
        if (imageDTO == null || imageDTO.getFile() == null || user == null)
            throw new AppException(500, "图片文件参数错误");
        MultipartFile multipartFile = imageDTO.getFile();
        String fileName = MultipartFileUtil.saveFile(multipartFile,
                AppBaseConfig.getImagePath(),
                null,
                AppBaseConfig.IMAGE_MAX_SIZE,
                AppBaseConfig.ALLOW_IMAGE_TYPE);

        //数据入库
        ImagePO imagePO = new ImagePO();
        imagePO.setUrl(fileName);
        imagePO.setName(multipartFile.getOriginalFilename());
        imagePO.setUserId(user.getId());
        imageMapper.insert(imagePO);
        return imagePO;
    }

    @Override
    public ImagePO getImage(Long id) {
        if (id == null || id <= 0)
            return null;
        return imageMapper.selectById(id);
    }

    @Override
    public List<ImagePO> getImages(List<String> urls) {
        if (urls == null || urls.isEmpty())
            return List.of();
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return List.of();
        QueryWrapper<ImagePO> queryWrapper = new QueryWrapper<>();
        queryWrapper.lambda()
                .eq(ImagePO::getUserId, user.getId())
                .in(ImagePO::getUrl, urls);
        return imageMapper.selectList(queryWrapper);

    }

    @Override
    @Transactional
    public ImagePO createImage(ImagePO imagePO) {
        User user = AppContextUtil.getCurrentUser();
        if (imagePO == null || user == null)
            return null;
        imagePO.setUserId(user.getId());
        return imageMapper.insert(imagePO) > 0 ? imagePO : null;
    }

}
