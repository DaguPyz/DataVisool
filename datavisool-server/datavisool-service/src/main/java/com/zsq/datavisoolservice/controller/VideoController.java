/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.VideoDTO;
import com.zsq.datavisoolservice.model.dto.VideoPageParamDTO;
import com.zsq.datavisoolservice.service.VideoService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/video")
@RequiredArgsConstructor
public class VideoController {

    private final VideoService videoService;

    /**
     * 批量上传视频
     */
    @PostMapping("/upload")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<List<VideoDTO>> batchUpload(@RequestParam("files") List<MultipartFile> files) {
        return ApiResponse.success(videoService.batchUpload(files));
    }

    /**
     * 更新视频信息
     */
    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateVideo(@RequestBody VideoDTO videoDTO) {
        return ApiResponse.success(videoService.updateVideo(videoDTO));
    }

    /**
     * 获取视频详情
     */
    @GetMapping("/get/{id}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<VideoDTO> getVideo(@PathVariable("id") Long id) {
        return ApiResponse.success(videoService.getVideo(id));
    }

    /**
     * 分页查询视频
     */
    @PostMapping("/page")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Page<VideoDTO>> getVideoPage(@RequestBody VideoPageParamDTO pageParam) {
        return ApiResponse.success(videoService.getVideoPage(pageParam));
    }

    /**
     * 删除视频
     */
    @GetMapping("/delete/{id}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> deleteVideo(@PathVariable("id") Long id) {
        return ApiResponse.success(videoService.deleteVideo(id));
    }

    /**
     * 批量删除视频
     */
    @PostMapping("/batchDelete")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> batchDeleteVideo(@RequestBody List<Long> ids) {
        return ApiResponse.success(videoService.batchDeleteVideo(ids));
    }
}
