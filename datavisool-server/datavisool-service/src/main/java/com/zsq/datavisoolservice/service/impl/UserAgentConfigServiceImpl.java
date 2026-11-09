/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.mapper.UserAgentConfigMapper;
import com.zsq.datavisoolservice.model.po.UserAgentConfigPO;
import com.zsq.datavisoolservice.service.UserAgentConfigService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

@Service
public class UserAgentConfigServiceImpl implements UserAgentConfigService {
    @Resource
    private UserAgentConfigMapper userAgentConfigMapper;

    @Override
    public String getConfig(Long userId, String key) {
        validate(userId, key);
        UserAgentConfigPO config = userAgentConfigMapper.selectOne(new LambdaQueryWrapper<UserAgentConfigPO>()
                .eq(UserAgentConfigPO::getUserId, userId).eq(UserAgentConfigPO::getConfigKey, key));
        return config == null ? null : config.getConfigValue();
    }

    @Override
    public void saveConfig(Long userId, String key, String value) {
        validate(userId, key);
        if (value == null) throw new AppException(400, "配置值不能为空");
        userAgentConfigMapper.upsert(userId, key, value);
    }

    private void validate(Long userId, String key) {
        if (userId == null || userId <= 0) throw new AppException(400, "用户 ID 无效");
        if (key == null || key.isBlank() || key.length() > 128) throw new AppException(400, "配置键无效");
    }
}
