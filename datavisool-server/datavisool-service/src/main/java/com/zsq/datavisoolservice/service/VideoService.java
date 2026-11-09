/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.zsq.datavisoolservice.model.dto.VideoDTO;
import com.zsq.datavisoolservice.model.dto.VideoPageParamDTO;
import com.zsq.datavisoolservice.model.po.VideoPO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface VideoService extends IService<VideoPO> {
    
    /**
     * 批量上传视频
     *
     * @param files 视频文件列表
     * @return 上传成功的视频列表
     */
    List<VideoDTO> batchUpload(List<MultipartFile> files);
    
    /**
     * 更新视频信息
     *
     * @param videoDTO 视频信息
     * @return 是否成功
     */
    boolean updateVideo(VideoDTO videoDTO);
    
    /**
     * 获取视频详情
     *
     * @param id 视频ID
     * @return 视频详情
     */
    VideoDTO getVideo(Long id);
    
    /**
     * 分页查询视频
     *
     * @param pageParam 分页参数
     * @return 视频分页列表
     */
    Page<VideoDTO> getVideoPage(VideoPageParamDTO pageParam);
    
    /**
     * 逻辑删除视频
     *
     * @param id 视频ID
     * @return 是否成功
     */
    boolean deleteVideo(Long id);

    /**
     * 批量逻辑删除视频
     *
     * @param ids 视频ID列表
     * @return 是否成功
     */
    boolean batchDeleteVideo(List<Long> ids);
}
