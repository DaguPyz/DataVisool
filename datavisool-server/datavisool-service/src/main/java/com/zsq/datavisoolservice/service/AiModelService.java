/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.AiModelDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunRequestDTO;
import com.zsq.datavisoolservice.model.dto.AiModelRunResponseDTO;
import com.zsq.datavisoolservice.model.dto.AiModelSelectDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;

import java.util.List;

public interface AiModelService {
    Page<AiModelDTO> getAiModelPageList(PageParamDTO pageParamDTO);

    List<AiModelSelectDTO> getAiModelList();

    Long addAiModel(AiModelDTO aiModelDTO);

    Boolean updateAiModel(AiModelDTO aiModelDTO);

    Boolean batchDelAiModel(List<Long> ids);

    AiModelRunResponseDTO run(AiModelRunRequestDTO requestDTO);
}
