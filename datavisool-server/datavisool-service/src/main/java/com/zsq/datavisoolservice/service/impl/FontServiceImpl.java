/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.FontMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.FontDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.po.FontPO;
import com.zsq.datavisoolservice.service.FontService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.FileUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Log4j2
@Service
public class FontServiceImpl implements FontService {

    @Resource
    private FontMapper fontMapper;

    @Override
    public FontDTO getFont(Long id) {
        User user = AppContextUtil.getCurrentUser();
        if (id == null || user == null)
            return null;
        LambdaQueryWrapper<FontPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(FontPO::getId, FontPO::getName, FontPO::getUrl)
                .eq(FontPO::getId, id)
                .eq(FontPO::getUserId, user.getId());
        FontPO fontPO = fontMapper.selectOne(queryWrapper);
        if (fontPO == null)
            return null;
        FontDTO fontDTO = new FontDTO();
        BeanUtils.copyProperties(fontPO, fontDTO);
        return fontDTO;
    }

    @Override
    public Page<FontDTO> getFontPageList(PageParamDTO pageParam) {
        User user = AppContextUtil.getCurrentUser();
        if (pageParam == null || user == null)
            return new Page<>();
        long current = pageParam.getCurrent() == null ? 1 : pageParam.getCurrent();
        long size = pageParam.getSize() == null ? 10 : pageParam.getSize();
        Page<FontPO> page = new Page<>(current, size);
        LambdaQueryWrapper<FontPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(FontPO::getId, FontPO::getName, FontPO::getUrl,
                FontPO::getCreateTime, FontPO::getUpdateTime);
        if (pageParam.getSearchValue() != null)
            wrapper.like(FontPO::getName, pageParam.getSearchValue());
        wrapper.eq(FontPO::getUserId, user.getId());
        Page<FontPO> apiPOPage = fontMapper.selectPage(page, wrapper);
        Page<FontDTO> apiDTOPage = new Page<>();
        BeanUtils.copyProperties(apiPOPage, apiDTOPage);
        List<FontDTO> apiDTOList = apiPOPage.getRecords().stream().map(apiPO -> {
            FontDTO FontDTO = new FontDTO();
            BeanUtils.copyProperties(apiPO, FontDTO);
            FontDTO.setUrl(FileUtil.normalizePath(Path.of(AppBaseConfig.FONT_PATH, FontDTO.getUrl()).toString()));
            return FontDTO;
        }).toList();
        apiDTOPage.setRecords(apiDTOList);
        return apiDTOPage;
    }

    @Override
    public boolean updateFont(FontDTO fontDTO) {
        if (fontDTO == null || fontDTO.getId() == null)
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        FontPO fontPO = new FontPO();
        fontPO.setName(fontDTO.getName());
        return fontMapper.update(fontPO, new LambdaQueryWrapper<FontPO>()
                .eq(FontPO::getId, fontDTO.getId())
                .eq(FontPO::getUserId, user.getId())) > 0;
    }

    @Override
    public boolean batchDelFont(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        return fontMapper.delete(new LambdaQueryWrapper<FontPO>()
                .in(FontPO::getId, ids)
                .eq(FontPO::getUserId, user.getId())) > 0;
    }

    @Override
    public List<FontPO> getExpiredData() {
        return fontMapper.getExpiredData();
    }

    @Override
    public List<FontDTO> quickSearchTopTen(String search) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return List.of();
        LambdaQueryWrapper<FontPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.last("limit 10");
        queryWrapper.eq(FontPO::getUserId, user.getId());
        if (search != null)
            queryWrapper.like(FontPO::getName, search);
        List<FontPO> FontPOS = fontMapper.selectList(queryWrapper);
        if (FontPOS != null && !FontPOS.isEmpty())
            return FontPOS.stream().map(FontPO -> {
                FontDTO FontDTO = new FontDTO();
                BeanUtils.copyProperties(FontPO, FontDTO);
                return FontDTO;
            }).toList();
        return new ArrayList<>();
    }

    @Override
    public Boolean uploadFont(Long id, List<MultipartFile> fontFiles) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null || fontFiles == null || fontFiles.isEmpty())
            return false;
        List<MultipartFile> validFontFiles = fontFiles.stream()
                .filter(fontFile -> fontFile != null && !fontFile.isEmpty())
                .toList();
        if (validFontFiles.isEmpty())
            return false;

        if (id != null) {
            if (validFontFiles.size() > 1)
                throw new AppException(AppStatusCode.INVALID_PARAM, "替换字体时只能上传一个文件");
            return replaceFont(id, validFontFiles.get(0));
        }

        for (MultipartFile fontFile : validFontFiles) {
            createFont(user, fontFile);
        }
        return true;
    }

    private void createFont(User user, MultipartFile fontFile) {
        String originalFilename = getOriginalFilename(fontFile);
        String fileName = saveFontFile(fontFile);
        FontPO fontPO = new FontPO();
        fontPO.setName(getFontName(originalFilename));
        fontPO.setUrl(fileName);
        fontPO.setUserId(user.getId());
        if (fontMapper.insert(fontPO) <= 0) {
            deleteFontFile(fileName);
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "字体上传失败");
        }
    }

    private boolean replaceFont(Long id, MultipartFile fontFile) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        FontPO oldFont = fontMapper.selectOne(new LambdaQueryWrapper<FontPO>()
                .eq(FontPO::getId, id)
                .eq(FontPO::getUserId, user.getId()));
        if (oldFont == null)
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "字体不存在，无法替换");

        String fileName = saveFontFile(fontFile);
        FontPO fontPO = new FontPO();
        fontPO.setUrl(fileName);
        if (fontMapper.update(fontPO, new LambdaQueryWrapper<FontPO>()
                .eq(FontPO::getId, oldFont.getId())
                .eq(FontPO::getUserId, user.getId())) <= 0) {
            deleteFontFile(fileName);
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "字体替换失败");
        }

        deleteFontFile(oldFont.getUrl());
        return true;
    }

    private String saveFontFile(MultipartFile fontFile) {
        getOriginalFilename(fontFile);
        return MultipartFileUtil.saveFile(fontFile,
                AppBaseConfig.getFontPath(),
                null,
                null,
                new String[]{".ttf", ".otf", ".woff", ".woff2", ".eot"});
    }

    private String getOriginalFilename(MultipartFile fontFile) {
        String originalFilename = fontFile.getOriginalFilename();
        if (originalFilename == null)
            throw new AppException(AppStatusCode.INVALID_PARAM, "字体名不能为空");
        return originalFilename;
    }

    private String getFontName(String originalFilename) {
        int suffixIndex = originalFilename.lastIndexOf(".");
        return suffixIndex > 0 ? originalFilename.substring(0, suffixIndex) : originalFilename;
    }

    private void deleteFontFile(String relativePath) {
        if (relativePath == null || relativePath.isBlank())
            return;
        String fontPath = String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.getFontPath(), relativePath);
        File file = new File(fontPath);
        if (file.exists() && !file.delete()) {
            log.error("delete file failed, target path: {}", fontPath);
        }
    }

    @Override
    public List<FontDTO> getAllFont() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        LambdaQueryWrapper<FontPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(FontPO::getId, FontPO::getUrl, FontPO::getName);
        queryWrapper.eq(FontPO::getUserId, user.getId());
        List<FontPO> fontPOList = fontMapper.selectList(queryWrapper);
        if (fontPOList != null && !fontPOList.isEmpty()) {
            return fontPOList.stream().map(fontPO -> {
                FontDTO fontDTO = new FontDTO();
                fontDTO.setId(fontPO.getId());
                fontDTO.setName(fontPO.getName());
                fontDTO.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.FONT_PATH, fontPO.getUrl()));
                return fontDTO;
            }).toList();
        } else
            return new ArrayList<>();
    }

    @Override
    public List<FontPO> getFonts(List<String> urls) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return List.of();
        if (urls == null || urls.isEmpty())
            return List.of();
        LambdaQueryWrapper<FontPO> wrapper = new LambdaQueryWrapper<FontPO>()
                .in(FontPO::getUrl, urls)
                .and(w -> w.eq(FontPO::getUserId, user.getId()));
        return fontMapper.selectList(wrapper);
    }

    @Override
    public List<FontPO> getFontsByNames(List<String> names) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return List.of();
        if (names == null || names.isEmpty())
            return List.of();
        LambdaQueryWrapper<FontPO> wrapper = new LambdaQueryWrapper<FontPO>()
                .in(FontPO::getName, names)
                .and(w -> w.eq(FontPO::getUserId, user.getId()));
        return fontMapper.selectList(wrapper).stream().distinct().toList();

    }

    @Override
    public FontPO createFont(FontPO fontPO) {
        User user = AppContextUtil.getCurrentUser();
        if (fontPO == null || user == null)
            return null;
        fontPO.setUserId(user.getId());
        return fontMapper.insert(fontPO) > 0 ? fontPO : null;
    }
}
