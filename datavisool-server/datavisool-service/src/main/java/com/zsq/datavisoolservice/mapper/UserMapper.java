/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.UserPO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【user】的数据库操作Mapper
 * @createDate 2024-05-29 16:32:52
 */
@Mapper
public interface UserMapper extends BaseMapper<UserPO> {
    @Select("select id,avatar from user where deleted = 1")
    List<UserPO> getExpiredData();
}




