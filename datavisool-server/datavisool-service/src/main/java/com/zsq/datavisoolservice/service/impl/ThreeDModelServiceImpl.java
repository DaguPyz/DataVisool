/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.ThreeDModelMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ThreeDModelDTO;
import com.zsq.datavisoolservice.model.dto.ThreeDModelPageParamDTO;
import com.zsq.datavisoolservice.model.po.ThreeDModelPO;
import com.zsq.datavisoolservice.service.ThreeDModelService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.DataInputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Log4j2
@Service
@RequiredArgsConstructor
public class ThreeDModelServiceImpl extends ServiceImpl<ThreeDModelMapper, ThreeDModelPO> implements ThreeDModelService {
    private static final int MODEL_ZIP_COPY_BUFFER_SIZE = 64 * 1024;
    private static final int MAX_MODEL_ZIP_ENTRY_COUNT = 1000;
    private static final long DEFAULT_MODEL_ZIP_UNCOMPRESSED_LIMIT = 500L * 1024 * 1024;
    private static final long GLB_MAGIC = 0x46546c67L;
    private static final long GLB_JSON_CHUNK = 0x4e4f534aL;
    private static final long GLB_BINARY_CHUNK = 0x004e4942L;
    private static final List<String> ALLOWED_MODEL_PACKAGE_ENTRY_TYPES = List.of(
            ".gltf", ".glb", ".obj", ".fbx", ".mtl",
            ".bin", ".json", ".txt",
            ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp",
            ".ktx", ".ktx2", ".basis", ".tga", ".dds", ".hdr", ".exr"
    );

    private final ThreeDModelMapper threeDModelMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ThreeDModelDTO> batchUpload(List<MultipartFile> files) {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        validateFiles(files);
        List<ThreeDModelPO> staged = new ArrayList<>();
        try {
            List<ThreeDModelDTO> resultList = new ArrayList<>();
            for (MultipartFile file : files) {
                ThreeDModelPO po = storeModel(file, user);
                staged.add(po);
                if (threeDModelMapper.insert(po) <= 0)
                    throw new AppException(AppStatusCode.DATA_EXCEPTION, "模型上传失败");
                resultList.add(toDto(po));
            }
            cleanupOnRollback(staged);
            return resultList;
        } catch (RuntimeException error) {
            staged.forEach(this::deleteStagedModel);
            throw error;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ThreeDModelDTO replaceModel(Long id, List<MultipartFile> files) {
        User user = requireCurrentUser();
        if (id == null || files == null || files.size() != 1)
            throw new AppException(AppStatusCode.INVALID_PARAM, "替换模型时只能上传一个文件");
        ThreeDModelPO old = threeDModelMapper.selectOne(ownedModelWrapper(user)
                .eq(ThreeDModelPO::getId, id).last("FOR UPDATE"));
        if (old == null) throw new AppException(AppStatusCode.NOT_FOUND, "模型不存在");
        validateFiles(files);
        ThreeDModelPO replacement = storeModel(files.get(0), user);
        try {
            if (threeDModelMapper.update(replacement, ownedModelWrapper(user).eq(ThreeDModelPO::getId, id)) <= 0)
                throw new AppException(AppStatusCode.DATA_EXCEPTION, "模型替换失败");
            replacement.setId(id);
            cleanupOnRollback(List.of(replacement));
            // Existing projects can still reference the previous URL, so keep its files.
            return toDto(replacement);
        } catch (RuntimeException error) {
            deleteStagedModel(replacement);
            throw error;
        }
    }

    private void validateFiles(List<MultipartFile> files) {
        if (files == null || files.isEmpty())
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件列表不能为空");
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty())
                throw new AppException(AppStatusCode.INVALID_PARAM, "模型文件不能为空");
            String suffix = getUploadSuffix(file.getOriginalFilename());
            validateModelUploadFile(file, suffix);
            if (".glb".equals(suffix)) {
                try (InputStream input = file.getInputStream()) {
                    validateGlb(input, file.getSize());
                } catch (IOException error) {
                    throw new AppException(AppStatusCode.INVALID_PARAM, "GLB 文件格式无效");
                }
            }
        }
    }

    private ThreeDModelPO storeModel(MultipartFile file, User user) {
        ThreeDModelPO po = new ThreeDModelPO();
        po.setName(file.getOriginalFilename());
        po.setSize(file.getSize());
        po.setType(file.getContentType());
        po.setUserId(user.getId());
        if (".zip".equals(getUploadSuffix(file.getOriginalFilename()))) handleZipUpload(file, po);
        else handleSingleFileUpload(file, po);
        return po;
    }

    private ThreeDModelDTO toDto(ThreeDModelPO po) {
        ThreeDModelDTO dto = new ThreeDModelDTO();
        BeanUtils.copyProperties(po, dto);
        dto.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.MODEL_PATH, po.getUrl()));
        return dto;
    }

    private void cleanupOnRollback(List<ThreeDModelPO> staged) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
        List<ThreeDModelPO> assets = List.copyOf(staged);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) assets.forEach(ThreeDModelServiceImpl.this::deleteStagedModel);
            }
        });
    }

    private void deleteStagedModel(ThreeDModelPO po) {
        if (po.getUrl() == null) return;
        Path root = Paths.get(AppBaseConfig.getModelPath()).toAbsolutePath().normalize();
        String[] parts = po.getUrl().replace('\\', '/').split("/", 2);
        if (Integer.valueOf(1).equals(po.getIsCompressed())) {
            if (parts.length == 2 && parts[0].matches("[0-9a-f]{32}")) deleteDirectoryQuietly(root.resolve(parts[0]));
        } else if (parts.length == 1 && parts[0].matches("[0-9a-f]{32}\\.[a-z0-9]+")) {
            try {
                Files.deleteIfExists(root.resolve(parts[0]));
            } catch (IOException error) {
                log.warn("Failed to clean staged model: {}", parts[0], error);
            }
        }
    }
    
    private void handleSingleFileUpload(MultipartFile file, ThreeDModelPO po) {
        String fileName = MultipartFileUtil.saveFile(file,
                AppBaseConfig.getModelPath(),
                null,
                AppBaseConfig.MODEL_MAX_SIZE,
                AppBaseConfig.ALLOW_MODEL_TYPE);
        
        po.setUrl(fileName);
        po.setIsCompressed(0);
    }
    
    private void handleZipUpload(MultipartFile file, ThreeDModelPO po) {
        String uuid = UUID.randomUUID().toString().replace("-", "");
        Path modelRoot = Paths.get(AppBaseConfig.getModelPath()).toAbsolutePath().normalize();
        Path targetDir = modelRoot.resolve(uuid).normalize();
        if (!targetDir.startsWith(modelRoot)) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "模型路径不合法");
        }
        
        try {
            // 创建解压目录
            Files.createDirectories(targetDir);
            
            // 解压 ZIP
            String mainFilePath = null;
            ZipExtractionGuard guard = new ZipExtractionGuard(modelZipUncompressedLimit());
            try (ZipInputStream zis = new ZipInputStream(file.getInputStream())) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    try {
                        guard.nextEntry(entry);
                        if (entry.isDirectory()) {
                            drainZipEntryWithLimit(zis, guard);
                            continue;
                        }

                        String entryName = normalizeZipEntryName(entry.getName());
                        if (entryName == null) {
                            drainZipEntryWithLimit(zis, guard);
                            continue;
                        }
                        if (isIgnoredZipMetadataEntry(entryName)) {
                            drainZipEntryWithLimit(zis, guard);
                            continue;
                        }
                        if (!isAllowedModelPackageEntry(entryName)) {
                            throw new AppException(AppStatusCode.INVALID_PARAM, "模型压缩包包含不支持的文件类型: " + entryName);
                        }

                        Path entryPath = targetDir.resolve(entryName).normalize();
                        // 防止路径遍历攻击
                        if (!entryPath.startsWith(targetDir)) {
                            drainZipEntryWithLimit(zis, guard);
                            continue;
                        }

                        // 确保父目录存在
                        if (!Files.exists(entryPath.getParent())) {
                            Files.createDirectories(entryPath.getParent());
                        }

                        copyZipEntryWithLimit(zis, entryPath, guard);

                        // 寻找主文件 (gltf > glb > obj > fbx)
                        String lowerEntryName = entryName.toLowerCase(Locale.ROOT);
                        if (mainFilePath == null) {
                            if (isMainModelFile(lowerEntryName)) {
                                mainFilePath = entryName;
                            }
                        } else if (getPriority(lowerEntryName) > getPriority(mainFilePath.toLowerCase(Locale.ROOT))) {
                            // 如果已经找到了主文件，看是否有更高优先级的
                            mainFilePath = entryName;
                        }
                    } finally {
                        zis.closeEntry();
                    }
                }
            }
            
            if (mainFilePath == null) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "压缩包中未找到支持的3D模型文件(.gltf, .glb, .obj, .fbx)");
            }
            if (mainFilePath.toLowerCase(Locale.ROOT).endsWith(".glb")) {
                Path mainFile = targetDir.resolve(mainFilePath);
                try (InputStream input = Files.newInputStream(mainFile)) {
                    validateGlb(input, Files.size(mainFile));
                } catch (IOException error) {
                    throw invalidGlb();
                }
            }
            
            // 设置相对路径：uuid/mainFile
            po.setUrl(uuid + "/" + mainFilePath);
            po.setIsCompressed(1);
            
        } catch (AppException e) {
            deleteDirectoryQuietly(targetDir);
            throw e;
        } catch (IOException e) {
            deleteDirectoryQuietly(targetDir);
            log.error("Failed to extract model zip", e);
            throw new AppException(AppStatusCode.SYSTEM_ERR, "模型解压失败");
        } catch (RuntimeException e) {
            deleteDirectoryQuietly(targetDir);
            throw e;
        }
    }

    private String getUploadSuffix(String originalFilename) {
        if (originalFilename == null || !originalFilename.contains(".")) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "不支持该格式的文件");
        }
        return originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase(Locale.ROOT);
    }

    private void validateModelUploadFile(MultipartFile file, String suffix) {
        if (!Arrays.asList(AppBaseConfig.ALLOW_MODEL_TYPE).contains(suffix)) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "不支持该格式的文件");
        }
        if (file.getSize() > AppBaseConfig.MODEL_MAX_SIZE) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件体积太大, 允许最大的文件体积为: " + (AppBaseConfig.MODEL_MAX_SIZE / 1024 / 1024) + "M");
        }
    }

    private void validateGlb(InputStream input, long size) throws IOException {
        DataInputStream data = new DataInputStream(input);
        if (size < 20 || readLittleEndian(data) != GLB_MAGIC || readLittleEndian(data) != 2
                || readLittleEndian(data) != size)
            throw invalidGlb();

        long remaining = size - 12;
        long jsonLength = readLittleEndian(data);
        long jsonType = readLittleEndian(data);
        remaining -= 8;
        if (jsonType != GLB_JSON_CHUNK || jsonLength == 0 || jsonLength % 4 != 0 || jsonLength > remaining)
            throw invalidGlb();
        validateGlbJson(new LimitedInputStream(data, jsonLength));
        remaining -= jsonLength;

        boolean binarySeen = false;
        while (remaining > 0) {
            if (remaining < 8) throw invalidGlb();
            long length = readLittleEndian(data);
            long type = readLittleEndian(data);
            remaining -= 8;
            if (length % 4 != 0 || length > remaining || type == GLB_JSON_CHUNK
                    || (type == GLB_BINARY_CHUNK && binarySeen)) throw invalidGlb();
            if (type == GLB_BINARY_CHUNK) binarySeen = true;
            data.skipNBytes(length);
            remaining -= length;
        }
    }

    private long readLittleEndian(DataInputStream input) throws IOException {
        return Integer.toUnsignedLong(Integer.reverseBytes(input.readInt()));
    }

    private void validateGlbJson(InputStream input) throws IOException {
        boolean versionFound = false;
        try (JsonParser parser = new JsonFactory().createParser(input)) {
            if (parser.nextToken() != JsonToken.START_OBJECT) throw invalidGlb();
            JsonToken token;
            while ((token = parser.nextToken()) != JsonToken.END_OBJECT) {
                if (token != JsonToken.FIELD_NAME) throw invalidGlb();
                String field = parser.currentName();
                JsonToken value = parser.nextToken();
                if (value == null) throw invalidGlb();
                if ("asset".equals(field) && value == JsonToken.START_OBJECT) {
                    while ((token = parser.nextToken()) != JsonToken.END_OBJECT) {
                        if (token != JsonToken.FIELD_NAME) throw invalidGlb();
                        String assetField = parser.currentName();
                        JsonToken assetValue = parser.nextToken();
                        if (assetValue == null) throw invalidGlb();
                        if ("version".equals(assetField) && assetValue == JsonToken.VALUE_STRING)
                            versionFound = "2.0".equals(parser.getText());
                        else parser.skipChildren();
                    }
                } else parser.skipChildren();
            }
            if (!versionFound || parser.nextToken() != null) throw invalidGlb();
        }
    }

    private AppException invalidGlb() {
        return new AppException(AppStatusCode.INVALID_PARAM, "GLB 文件格式无效");
    }

    private static final class LimitedInputStream extends FilterInputStream {
        private long remaining;

        private LimitedInputStream(InputStream input, long length) {
            super(input);
            this.remaining = length;
        }

        @Override
        public int read() throws IOException {
            if (remaining == 0) return -1;
            int value = in.read();
            if (value >= 0) remaining--;
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining == 0) return -1;
            int count = in.read(bytes, offset, (int) Math.min(length, remaining));
            if (count > 0) remaining -= count;
            return count;
        }

        @Override
        public void close() {
            // The outer GLB stream is still needed for subsequent chunks.
        }
    }

    private String normalizeZipEntryName(String entryName) {
        if (entryName == null || entryName.isBlank() || entryName.indexOf('\0') >= 0) {
            return null;
        }
        String normalized = entryName.replace('\\', '/');
        if (normalized.startsWith("/") || normalized.contains(":")) {
            return null;
        }
        String[] segments = normalized.split("/");
        List<String> safeSegments = new ArrayList<>();
        for (String segment : segments) {
            if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) {
                return null;
            }
            safeSegments.add(segment);
        }
        return String.join("/", safeSegments);
    }

    private boolean isIgnoredZipMetadataEntry(String entryName) {
        return "__MACOSX".equals(entryName)
                || entryName.startsWith("__MACOSX/")
                || ".DS_Store".equals(entryName)
                || entryName.endsWith("/.DS_Store");
    }

    private boolean isAllowedModelPackageEntry(String entryName) {
        int slashIndex = entryName.lastIndexOf('/');
        String fileName = slashIndex >= 0 ? entryName.substring(slashIndex + 1) : entryName;
        int suffixIndex = fileName.lastIndexOf('.');
        if (suffixIndex <= 0 || suffixIndex == fileName.length() - 1) {
            return false;
        }
        String suffix = fileName.substring(suffixIndex).toLowerCase(Locale.ROOT);
        return ALLOWED_MODEL_PACKAGE_ENTRY_TYPES.contains(suffix);
    }

    private void copyZipEntryWithLimit(ZipInputStream inputStream, Path target, ZipExtractionGuard guard) throws IOException {
        try (OutputStream outputStream = Files.newOutputStream(target, StandardOpenOption.WRITE, StandardOpenOption.CREATE_NEW)) {
            byte[] buffer = new byte[MODEL_ZIP_COPY_BUFFER_SIZE];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                guard.addBytes(read);
                outputStream.write(buffer, 0, read);
            }
        }
    }

    private void drainZipEntryWithLimit(ZipInputStream inputStream, ZipExtractionGuard guard) throws IOException {
        byte[] buffer = new byte[MODEL_ZIP_COPY_BUFFER_SIZE];
        int read;
        while ((read = inputStream.read(buffer)) != -1) {
            guard.addBytes(read);
        }
    }

    private long modelZipUncompressedLimit() {
        return AppBaseConfig.MODEL_MAX_SIZE > 0 ? AppBaseConfig.MODEL_MAX_SIZE : DEFAULT_MODEL_ZIP_UNCOMPRESSED_LIMIT;
    }

    private void deleteDirectoryQuietly(Path targetDir) {
        if (targetDir == null || !Files.exists(targetDir)) {
            return;
        }
        try (var paths = Files.walk(targetDir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    log.warn("Failed to clean extracted model path: {}", path, e);
                }
            });
        } catch (IOException e) {
            log.warn("Failed to clean extracted model directory: {}", targetDir, e);
        }
    }

    private static class ZipExtractionGuard {
        private final long maxUncompressedBytes;
        private long totalBytes;
        private int entryCount;

        private ZipExtractionGuard(long maxUncompressedBytes) {
            this.maxUncompressedBytes = maxUncompressedBytes;
        }

        private void nextEntry(ZipEntry entry) {
            entryCount++;
            if (entryCount > MAX_MODEL_ZIP_ENTRY_COUNT) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "模型压缩包文件数量超过限制");
            }
            long declaredSize = entry.getSize();
            if (declaredSize > maxUncompressedBytes) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "模型压缩包单个文件超过大小限制");
            }
        }

        private void addBytes(int bytes) {
            if (bytes <= 0) {
                return;
            }
            if (totalBytes > maxUncompressedBytes - bytes) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "模型压缩包解压后总大小超过限制");
            }
            totalBytes += bytes;
        }
    }
    
    private boolean isMainModelFile(String name) {
        return name.endsWith(".gltf") || name.endsWith(".glb") || name.endsWith(".obj") || name.endsWith(".fbx");
    }
    
    private int getPriority(String name) {
        if (name.endsWith(".gltf")) return 4;
        if (name.endsWith(".glb")) return 3;
        if (name.endsWith(".obj")) return 2;
        if (name.endsWith(".fbx")) return 1;
        return 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateModel(ThreeDModelDTO dto) {
        if (dto == null || dto.getId() == null) {
            throw new AppException(AppStatusCode.INVALID_PARAM);
        }
        String name = dto.getName();
        if (name == null || name.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c)))
            throw new AppException(AppStatusCode.INVALID_PARAM, "请输入新的模型名称");
        if (name.length() > 255)
            throw new AppException(AppStatusCode.INVALID_PARAM, "模型名称不能超过255个字符");

        User user = requireCurrentUser();
        
        ThreeDModelPO existing = threeDModelMapper.selectOne(ownedModelWrapper(user)
                .eq(ThreeDModelPO::getId, dto.getId()));
        if (existing == null) {
            throw new AppException(AppStatusCode.NOT_FOUND, "模型不存在");
        }
        
        ThreeDModelPO updatePO = new ThreeDModelPO();
        updatePO.setName(name.strip());
        
        return threeDModelMapper.update(updatePO, ownedModelWrapper(user)
                .eq(ThreeDModelPO::getId, dto.getId())) > 0;
    }

    @Override
    public ThreeDModelDTO getModel(Long id) {
        if (id == null) return null;

        User user = requireCurrentUser();
        
        ThreeDModelPO po = threeDModelMapper.selectOne(ownedModelWrapper(user)
                .eq(ThreeDModelPO::getId, id));
        if (po == null) return null;
        
        ThreeDModelDTO dto = new ThreeDModelDTO();
        BeanUtils.copyProperties(po, dto);
        dto.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.MODEL_PATH, po.getUrl()));
        return dto;
    }

    @Override
    public Page<ThreeDModelDTO> getModelPage(ThreeDModelPageParamDTO pageParam) {
        if (pageParam == null) {
            pageParam = new ThreeDModelPageParamDTO();
        }
        
        Page<ThreeDModelPO> page = new Page<>(pageParam.getCurrent() == null ? 1 : pageParam.getCurrent(),
                                              pageParam.getSize() == null ? 10 : pageParam.getSize());
        
        LambdaQueryWrapper<ThreeDModelPO> wrapper = ownedModelWrapper(requireCurrentUser());
        wrapper.orderByDesc(ThreeDModelPO::getCreateTime);
        
        if (pageParam.getSearchValue() != null && !pageParam.getSearchValue().isBlank()) {
            wrapper.like(ThreeDModelPO::getName, pageParam.getSearchValue());
        }
        
        Page<ThreeDModelPO> poPage = threeDModelMapper.selectPage(page, wrapper);
        
        Page<ThreeDModelDTO> dtoPage = new Page<>();
        BeanUtils.copyProperties(poPage, dtoPage);
        
        List<ThreeDModelDTO> dtoList = poPage.getRecords().stream().map(po -> {
            ThreeDModelDTO dto = new ThreeDModelDTO();
            BeanUtils.copyProperties(po, dto);
            dto.setUrl(String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.MODEL_PATH, po.getUrl()));
            return dto;
        }).toList();
        
        dtoPage.setRecords(dtoList);
        return dtoPage;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean batchDelete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return false;
        
        User user = requireCurrentUser();
        
        List<ThreeDModelPO> models = threeDModelMapper.selectBatchIds(ids);
        if (models.isEmpty()) return true;
        
        for (ThreeDModelPO model : models) {
            if (!user.getId().equals(model.getUserId())) {
                throw new AppException(AppStatusCode.UNAUTHORIZED, "无权删除部分模型");
            }
        }
        
        return threeDModelMapper.delete(ownedModelWrapper(user).in(ThreeDModelPO::getId, ids)) > 0;
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null || user.getId() == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    private LambdaQueryWrapper<ThreeDModelPO> ownedModelWrapper(User user) {
        return new LambdaQueryWrapper<ThreeDModelPO>()
                .eq(ThreeDModelPO::getUserId, user.getId());
    }
}
