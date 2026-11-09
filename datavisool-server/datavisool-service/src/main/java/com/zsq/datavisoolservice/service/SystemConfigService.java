/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.zsq.datavisoolservice.model.dto.SystemConfigDTO;
import com.zsq.datavisoolservice.model.po.SystemConfigPO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【system_config】的数据库操作Service
 * @createDate 2025-04-05 12:29
 */
public interface SystemConfigService extends IService<SystemConfigPO> {
    void add(SystemConfigDTO dto);

    void update(SystemConfigDTO dto);

    boolean saveOrUpdateByName(String name, String value);

    String getConfig(String name);

    void delete(Long id);

    SystemConfigDTO getById(Long id);

    List<SystemConfigDTO> listAll();

    Boolean updateMainLogo(MultipartFile file);

    Boolean updateLogo(MultipartFile file);
}
