/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.VideoMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.VideoDTO;
import com.zsq.datavisoolservice.model.dto.VideoPageParamDTO;
import com.zsq.datavisoolservice.model.po.VideoPO;
import com.zsq.datavisoolservice.service.VideoService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

@Log4j2
@Service
@RequiredArgsConstructor
public class VideoServiceImpl extends ServiceImpl<VideoMapper, VideoPO> implements VideoService {

    private final VideoMapper videoMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<VideoDTO> batchUpload(List<MultipartFile> files) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        if (files == null || files.isEmpty()) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件列表不能为空");
        }
        if (files.stream().anyMatch(file -> file == null || file.isEmpty())) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "视频文件不能为空");
        }

        List<VideoDTO> resultList = new ArrayList<>();

        for (MultipartFile file : files) {
            // 保存文件
            String fileName = MultipartFileUtil.saveFile(file,
                    AppBaseConfig.getVideoPath(),
                    null,
                    AppBaseConfig.VIDEO_MAX_SIZE,
                    AppBaseConfig.ALLOW_VIDEO_TYPE);

            // 保存数据库记录
            VideoPO videoPO = new VideoPO();
            videoPO.setName(file.getOriginalFilename());
            videoPO.setUrl(fileName); // 存储文件名，前端拼接路径
            videoPO.setSize(file.getSize());
            videoPO.setType(file.getContentType());
            videoPO.setUserId(user.getId());
            
            videoMapper.insert(videoPO);

            VideoDTO dto = new VideoDTO();
            BeanUtils.copyProperties(videoPO, dto);
            // 拼接完整URL返回
            dto.setUrl(Paths.get(AppBaseConfig.VIDEO_PATH, fileName).toString());
            resultList.add(dto);
        }

        return resultList;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateVideo(VideoDTO videoDTO) {
        if (videoDTO == null || videoDTO.getId() == null) {
            throw new AppException(AppStatusCode.INVALID_PARAM);
        }
        String name = videoDTO.getName();
        if (name == null || name.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c))) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "请输入新的视频名称");
        }
        if (name.length() > 255) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "视频名称不能超过255个字符");
        }

        User user = requireCurrentUser();
        
        VideoPO existing = videoMapper.selectOne(ownedVideoWrapper(user)
                .eq(VideoPO::getId, videoDTO.getId()));
        if (existing == null) {
            throw new AppException(AppStatusCode.NOT_FOUND, "视频不存在");
        }

        VideoPO updatePO = new VideoPO();
        updatePO.setName(name.strip());
        
        return videoMapper.update(updatePO, ownedVideoWrapper(user)
                .eq(VideoPO::getId, videoDTO.getId())) > 0;
    }

    @Override
    public VideoDTO getVideo(Long id) {
        if (id == null) return null;

        User user = requireCurrentUser();
        
        VideoPO videoPO = videoMapper.selectOne(ownedVideoWrapper(user)
                .eq(VideoPO::getId, id));
        if (videoPO == null) return null;
        
        VideoDTO dto = new VideoDTO();
        BeanUtils.copyProperties(videoPO, dto);
        // 拼接完整URL
        dto.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.VIDEO_PATH, videoPO.getUrl()));
        return dto;
    }

    @Override
    public Page<VideoDTO> getVideoPage(VideoPageParamDTO pageParam) {
        if (pageParam == null) {
            pageParam = new VideoPageParamDTO();
        }
        
        Page<VideoPO> page = new Page<>(pageParam.getCurrent() == null ? 1 : pageParam.getCurrent(),
                                        pageParam.getSize() == null ? 10 : pageParam.getSize());
        
        LambdaQueryWrapper<VideoPO> wrapper = ownedVideoWrapper(requireCurrentUser());
        wrapper.orderByDesc(VideoPO::getCreateTime);
        
        if (pageParam.getSearchValue() != null && !pageParam.getSearchValue().isBlank()) {
            wrapper.like(VideoPO::getName, pageParam.getSearchValue());
        }
        
        Page<VideoPO> videoPOPage = videoMapper.selectPage(page, wrapper);
        
        Page<VideoDTO> dtoPage = new Page<>();
        BeanUtils.copyProperties(videoPOPage, dtoPage);
        
        List<VideoDTO> dtoList = videoPOPage.getRecords().stream().map(po -> {
            VideoDTO dto = new VideoDTO();
            BeanUtils.copyProperties(po, dto);
            dto.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.VIDEO_PATH, po.getUrl()));
            return dto;
        }).toList();
        
        dtoPage.setRecords(dtoList);
        return dtoPage;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteVideo(Long id) {
        if (id == null) return false;
        
        User user = requireCurrentUser();
        
        VideoPO videoPO = videoMapper.selectById(id);
        if (videoPO == null) return true; // 已经不存在了
        
        if (!user.getId().equals(videoPO.getUserId())) {
             throw new AppException(AppStatusCode.UNAUTHORIZED, "无权删除该视频");
        }
        
        // 逻辑删除数据库记录
        int rows = videoMapper.delete(ownedVideoWrapper(user).eq(VideoPO::getId, id));
        
        return rows > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean batchDeleteVideo(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return false;

        User user = requireCurrentUser();

        // 查找要删除的视频
        List<VideoPO> videos = videoMapper.selectBatchIds(ids);
        if (videos.isEmpty()) return true;

        // 权限校验
        for (VideoPO video : videos) {
            if (!user.getId().equals(video.getUserId())) {
                throw new AppException(AppStatusCode.UNAUTHORIZED, "无权删除部分视频");
            }
        }

        // 批量逻辑删除
        int rows = videoMapper.delete(ownedVideoWrapper(user).in(VideoPO::getId, ids));
        return rows > 0;
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null || user.getId() == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    private LambdaQueryWrapper<VideoPO> ownedVideoWrapper(User user) {
        return new LambdaQueryWrapper<VideoPO>()
                .eq(VideoPO::getUserId, user.getId());
    }
}
