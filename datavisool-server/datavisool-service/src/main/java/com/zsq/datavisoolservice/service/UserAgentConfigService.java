/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service;

/** 仅供服务端调用；用户 ID 必须来自认证信息或已验证归属的任务。 */
public interface UserAgentConfigService {
    String getConfig(Long userId, String key);
    void saveConfig(Long userId, String key, String value);
}
