/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.DynamicScriptDTO;
import com.zsq.datavisoolservice.model.dto.DynamicScriptPageParamDTO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【dynamic_script】的数据库操作Service
 */
public interface DynamicScriptService {

    DynamicScriptDTO getDynamicScript(Long id);

    Page<DynamicScriptDTO> getDynamicScriptPageList(DynamicScriptPageParamDTO pageParam);

    Boolean saveOrUpdate(DynamicScriptDTO scriptDTO);

    boolean updateDynamicScript(DynamicScriptDTO scriptDTO);

    boolean batchDelDynamicScript(List<Long> ids);

    List<DynamicScriptPO> getExpiredData();

    List<DynamicScriptDTO> quickSearchTopTen(String search);

    List<DynamicScriptPO> getAllDynamicScript(Long projectId);

    List<DynamicScriptPO> getDynamicScripts(List<String> urls);

    DynamicScriptPO createDynamicScript(DynamicScriptPO dynamicScriptPO);

}
