/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.SystemConfigMapper;
import com.zsq.datavisoolservice.model.dto.SystemConfigDTO;
import com.zsq.datavisoolservice.model.po.ImagePO;
import com.zsq.datavisoolservice.model.po.SystemConfigPO;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.service.SystemConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Collectors;

@Log4j2
@Service
@RequiredArgsConstructor
public class SystemConfigServiceImpl extends ServiceImpl<SystemConfigMapper, SystemConfigPO> implements SystemConfigService {
    private final SystemConfigMapper systemConfigMapper;
    private final ImageService imageService;


    @Override
    public void add(SystemConfigDTO dto) {
        systemConfigMapper.insert(dto.toPO());
    }

    @Override
    public void update(SystemConfigDTO dto) {
        if (dto == null || dto.getId() == null) return;
        systemConfigMapper.updateById(dto.toPO());
    }

    @Override
    public boolean saveOrUpdateByName(String name, String value) {
        //检查参数
        if (name == null || name.isEmpty())
            throw new AppException(AppStatusCode.INVALID_PARAM);
        //查询数据
        SystemConfigPO po = systemConfigMapper.selectOne(new QueryWrapper<SystemConfigPO>().eq("name", name));
        if (po == null) {
            po = new SystemConfigPO();
            po.setName(name);
            po.setValue(value);
        } else {
            po.setValue(value);
        }
        return saveOrUpdate(po);
    }

    @Override
    public String getConfig(String name) {
        if (name == null || name.isEmpty())
            return null;
        SystemConfigPO po = systemConfigMapper.selectOne(new QueryWrapper<SystemConfigPO>().eq("name", name));
        if (po != null)
            return po.getValue();
        return null;
    }

    @Override
    public void delete(Long id) {
        SystemConfigPO entity = systemConfigMapper.selectById(id);
        if (entity != null) systemConfigMapper.deleteById(id);

    }

    @Override
    public SystemConfigDTO getById(Long id) {
        SystemConfigPO entity = systemConfigMapper.selectById(id);
        return SystemConfigDTO.fromPO(entity);
    }

    @Override
    public List<SystemConfigDTO> listAll() {
        List<SystemConfigDTO> configs = systemConfigMapper.selectList(new QueryWrapper<SystemConfigPO>().eq("deleted", 0)).stream().map(SystemConfigDTO::fromPO).collect(Collectors.toList());
        configs.forEach(config -> {
            if ("logo".equals(config.getName())) {
                ImagePO po = imageService.getImage(Long.valueOf(config.getValue()));
                if (po != null)
                    config.setValue(Path.of(AppBaseConfig.IMAGE_PATH, po.getUrl()).toString());
            } else if ("logo-icon".equals(config.getName())) {
                ImagePO po = imageService.getImage(Long.valueOf(config.getValue()));
                if (po != null)
                    config.setValue(Path.of(AppBaseConfig.IMAGE_PATH, po.getUrl()).toString());
            }
        });
        return configs;
    }

    @Override
    @Transactional
    public Boolean updateMainLogo(MultipartFile file) {
        return saveLogo(file, "main-logo.png");
    }

    @Override
    @Transactional
    public Boolean updateLogo(MultipartFile file) {
        return saveLogo(file, "logo.png");
    }

    private boolean saveLogo(MultipartFile file, String filename) {
        if (file == null || file.isEmpty() || file.getContentType() == null
                || !file.getContentType().startsWith("image/") || file.getSize() > AppBaseConfig.IMAGE_MAX_SIZE)
            throw new AppException(AppStatusCode.INVALID_PARAM, "请选择有效的 PNG、JPEG、GIF 或 BMP 图片");
        Path temp = null;
        try {
            Path dir = Path.of(AppBaseConfig.getLogoPath());
            Files.createDirectories(dir);
            temp = Files.createTempFile(dir, ".logo-", ".tmp");
            try (var input = file.getInputStream()) {
                Files.copy(input, temp, StandardCopyOption.REPLACE_EXISTING);
            }
            validateLogo(temp);
            try {
                Files.move(temp, dir.resolve(filename), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, dir.resolve(filename), StandardCopyOption.REPLACE_EXISTING);
            }
            return true;
        } catch (IOException e) {
            log.error("保存品牌图片失败", e);
            return false;
        } finally {
            if (temp != null) {
                try { Files.deleteIfExists(temp); } catch (IOException e) { log.warn("清理临时品牌图片失败", e); }
            }
        }
    }

    private void validateLogo(Path file) {
        try (ImageInputStream stream = ImageIO.createImageInputStream(file.toFile())) {
            if (stream == null) throw new AppException(AppStatusCode.INVALID_PARAM, "图片文件无效");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new AppException(AppStatusCode.INVALID_PARAM, "请选择有效的 PNG、JPEG、GIF 或 BMP 图片");
            ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                if (!List.of("png", "jpeg", "gif", "bmp").contains(reader.getFormatName().toLowerCase(java.util.Locale.ROOT)))
                    throw new AppException(AppStatusCode.INVALID_PARAM, "请选择有效的 PNG、JPEG、GIF 或 BMP 图片");
                long width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width * height > 40_000_000L || reader.read(0) == null)
                    throw new AppException(AppStatusCode.INVALID_PARAM, "图片尺寸过大或文件无效");
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException e) {
            if (e instanceof AppException appException) throw appException;
            throw new AppException(AppStatusCode.INVALID_PARAM, "图片文件无效");
        }
    }
}
