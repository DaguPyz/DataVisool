/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【dynamic_script】的数据库操作Mapper
 * @createDate 2025-01-09 14:51
 */
@Mapper
public interface DynamicScriptMapper extends BaseMapper<DynamicScriptPO> {
    @Select("select id from font where deleted = 1")
    List<DynamicScriptPO> getExpiredData();
}




