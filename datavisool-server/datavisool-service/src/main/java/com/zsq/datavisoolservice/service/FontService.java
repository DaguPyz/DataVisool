/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.FontDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.FontPO;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * @author DAGU
 * @description 针对表【font】的数据库操作Service
 */
public interface FontService {

    FontDTO getFont(Long id);

    Page<FontDTO> getFontPageList(PageParamDTO pageParam);

    boolean updateFont(FontDTO font);

    boolean batchDelFont(List<Long> ids);

    List<FontPO> getExpiredData();

    List<FontDTO> quickSearchTopTen(String search);

    Boolean uploadFont(Long id, List<MultipartFile> fontFiles);

    List<FontDTO> getAllFont();

    List<FontPO> getFonts(List<String> urls);

    List<FontPO> getFontsByNames(List<String> names);

    FontPO createFont(FontPO fontPO);
}
