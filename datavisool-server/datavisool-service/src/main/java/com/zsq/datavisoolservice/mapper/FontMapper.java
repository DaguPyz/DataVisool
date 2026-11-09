/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.FontPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【font】的数据库操作Mapper
 * @createDate 2025-01-09 14:49
 */
@Mapper
public interface FontMapper extends BaseMapper<FontPO> {
    @Select("select id from font where deleted = 1")
    List<FontPO> getExpiredData();
}




