/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.AiModelPO;
import org.apache.ibatis.annotations.Mapper;

/**
 * @author DAGU
 * @description 针对表【ai_model】的数据库操作Mapper
 * @createDate 2026-04-11
 */
@Mapper
public interface AiModelMapper extends BaseMapper<AiModelPO> {
}
