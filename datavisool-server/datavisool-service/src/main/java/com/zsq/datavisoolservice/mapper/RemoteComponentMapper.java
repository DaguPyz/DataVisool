/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface RemoteComponentMapper extends BaseMapper<RemoteComponentPO> {

    @Select("select id,url from remote_component where deleted = 1")
    List<RemoteComponentPO> getExpiredData();
}
