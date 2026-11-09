/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.zsq.datavisoolservice.model.dto.ThreeDModelDTO;
import com.zsq.datavisoolservice.model.dto.ThreeDModelPageParamDTO;
import com.zsq.datavisoolservice.model.po.ThreeDModelPO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface ThreeDModelService extends IService<ThreeDModelPO> {
    
    /**
     * 批量上传3D模型
     *
     * @param files 模型文件列表
     * @return 上传成功的模型列表
     */
    List<ThreeDModelDTO> batchUpload(List<MultipartFile> files);

    ThreeDModelDTO replaceModel(Long id, List<MultipartFile> files);
    
    /**
     * 更新模型信息
     *
     * @param dto 模型信息
     * @return 是否成功
     */
    boolean updateModel(ThreeDModelDTO dto);
    
    /**
     * 获取模型详情
     *
     * @param id 模型ID
     * @return 模型详情
     */
    ThreeDModelDTO getModel(Long id);
    
    /**
     * 分页查询模型
     *
     * @param pageParam 分页参数
     * @return 模型分页列表
     */
    Page<ThreeDModelDTO> getModelPage(ThreeDModelPageParamDTO pageParam);
    
    /**
     * 批量逻辑删除模型
     *
     * @param ids 模型ID列表
     * @return 是否成功
     */
    boolean batchDelete(List<Long> ids);
}
