/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.CommonApiPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【common_api】的数据库操作Mapper
 * @createDate 2024-08-24 15:17
 */
@Mapper
public interface CommonApiMapper extends BaseMapper<CommonApiPO> {
    @Select("select id from common_api where deleted = 1")
    List<CommonApiPO> getExpiredData();
}




