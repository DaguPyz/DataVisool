/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.zsq.datavisoolservice.model.po.UserAgentConfigPO;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserAgentConfigMapper extends BaseMapper<UserAgentConfigPO> {
    /** 同一用户的同一配置原子写入，避免并发首次保存产生重复记录。 */
    @Insert("""
            insert into user_agent_config (user_id, config_key, config_value)
            values (#{userId}, #{key}, #{value})
            on duplicate key update config_value = #{value}, update_time = CURRENT_TIMESTAMP
            """)
    int upsert(@Param("userId") Long userId, @Param("key") String key, @Param("value") String value);
}
