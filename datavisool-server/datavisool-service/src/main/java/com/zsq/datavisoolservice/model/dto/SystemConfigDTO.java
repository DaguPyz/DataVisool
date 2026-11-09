/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;


import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.zsq.datavisoolservice.model.po.SystemConfigPO;
import lombok.Data;
import lombok.experimental.Accessors;
import org.springframework.beans.BeanUtils;

@Data
@Accessors(chain = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SystemConfigDTO {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long id;
    private String name;
    private String value;
    private String des;

    public SystemConfigPO toPO() {
        SystemConfigPO po = new SystemConfigPO();
        BeanUtils.copyProperties(this, po);
        return po;
    }

    public static SystemConfigDTO fromPO(SystemConfigPO po) {
        SystemConfigDTO dto = new SystemConfigDTO();
        BeanUtils.copyProperties(po, dto);
        return dto;
    }
}
