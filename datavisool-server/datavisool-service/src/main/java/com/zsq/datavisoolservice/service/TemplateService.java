/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.zsq.datavisoolservice.model.dto.TemplateDTO;
import com.zsq.datavisoolservice.model.po.TemplatePO;

import java.util.List;

public interface TemplateService {

    Long createTemplate(TemplateDTO templateDTO);

    TemplatePO getTemplateById(Long id);

    List<TemplatePO> getAllTemplate(TemplatePO condition);

    boolean batchDelTemplate(List<Long> ids);
}
