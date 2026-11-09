/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.io.Serializable;

/**
 * @author puyinzhen
 * 项目导入参数
 */
@Data
public class ProjectImportParamDTO implements Serializable {
    private Long projectId;
    private MultipartFile file;
    private String secretPassphrase;
    /** Server-generated notice; reset by the importer before processing each request. */
    private transient String importNotice;
}
