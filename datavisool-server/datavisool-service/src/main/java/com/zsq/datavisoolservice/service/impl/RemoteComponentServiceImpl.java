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
import com.zsq.datavisoolservice.mapper.RemoteComponentMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.RemoteComponentDTO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import com.zsq.datavisoolservice.service.RemoteComponentService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.MultipartFileUtil;
import jakarta.annotation.Resource;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Log4j2
@Service
public class RemoteComponentServiceImpl implements RemoteComponentService {

    private static final String[] COMPONENT_FILE_TYPES = {".js", ".mjs", ".zip"};
    private static final int COPY_BUFFER_SIZE = 8192;
    private static final int COMPONENT_PACKAGE_UNCOMPRESSED_RATIO_LIMIT = 10;

    @Resource
    private RemoteComponentMapper remoteComponentMapper;

    @Resource
    private com.zsq.datavisoolservice.service.impl.ai.ComponentDocumentService componentDocuments;

    @Override
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public boolean uploadComponent(RemoteComponentDTO remoteComponentDTO) {
        User user = AppContextUtil.getCurrentUser();
        if (remoteComponentDTO == null || user == null)
            return false;
        MultipartFile componentFile = remoteComponentDTO.getComponentFile();
        if (componentFile == null || componentFile.isEmpty())
            return false;
        String originalFilename = componentFile.getOriginalFilename();
        if (originalFilename == null || !isAllowedComponentFile(originalFilename))
            return false;
        if (componentFile.getSize() > AppBaseConfig.FILE_MAX_SIZE)
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件体积太大");
        if (!originalFilename.toLowerCase(Locale.ROOT).endsWith(".zip")) {
            try {
                ComponentScriptValidator.validate(componentFile.getBytes(), originalFilename);
            } catch (IOException error) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "无法读取组件文件");
            }
        }
        //新增
        if (remoteComponentDTO.getId() == null) {
            String fileName = saveComponentFile(componentFile);
            cleanOnRollback(fileName);
            RemoteComponentPO remoteComponentPO = new RemoteComponentPO();
            remoteComponentPO.setComponentName(componentFile.getOriginalFilename());
            remoteComponentPO.setUrl(fileName);
            remoteComponentPO.setUserId(user.getId());
            if (remoteComponentMapper.insert(remoteComponentPO) <= 0) {
                deleteComponentFile(fileName);
                throw new AppException(AppStatusCode.DATA_EXCEPTION, "服务器组件上传失败");
            }
            registerComponentDocuments(fileName, remoteComponentPO);
            return true;
        }
        //替换已有的服务器组件
        RemoteComponentPO oldRemoteComponent = remoteComponentMapper.selectOne(new LambdaQueryWrapper<RemoteComponentPO>()
                .eq(RemoteComponentPO::getId, remoteComponentDTO.getId())
                .eq(RemoteComponentPO::getUserId, user.getId()));
        if (oldRemoteComponent == null)
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "服务器组件不存在，无法替换");
        String fileName = saveComponentFile(componentFile);
        cleanOnRollback(fileName);
        boolean shouldDeleteOldFile = shouldDeleteOldComponentFile(user, oldRemoteComponent.getId(), oldRemoteComponent.getUrl(), fileName);
        RemoteComponentPO remoteComponentPO = new RemoteComponentPO();
        remoteComponentPO.setUrl(fileName);
        remoteComponentPO.setId(oldRemoteComponent.getId());
        remoteComponentPO.setUserId(user.getId());
        if (remoteComponentDTO.getComponentName() != null && !remoteComponentDTO.getComponentName().isBlank()) {
            remoteComponentPO.setComponentName(remoteComponentDTO.getComponentName());
        }
        if (remoteComponentMapper.update(remoteComponentPO, new LambdaQueryWrapper<RemoteComponentPO>()
                .eq(RemoteComponentPO::getId, remoteComponentDTO.getId())
                .eq(RemoteComponentPO::getUserId, user.getId())) <= 0) {
            deleteComponentFile(fileName);
            throw new AppException(AppStatusCode.DATA_EXCEPTION, "服务器组件替换失败");
        }
        registerComponentDocuments(fileName, remoteComponentPO);
        if (shouldDeleteOldFile && !componentDocuments.hasIndexedPackage(oldRemoteComponent.getId(), oldRemoteComponent.getUrl())) {
            if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() {deleteComponentFile(oldRemoteComponent.getUrl());}
                });
            else deleteComponentFile(oldRemoteComponent.getUrl());
        }
        return true;
    }

    private String saveComponentFile(MultipartFile componentFile) {
        String originalFilename = componentFile.getOriginalFilename();
        if (originalFilename != null && originalFilename.toLowerCase(Locale.ROOT).endsWith(".zip")) {
            return saveComponentPackage(componentFile);
        }
        return MultipartFileUtil.saveFile(componentFile,
                AppBaseConfig.getRemoteComponentPath(),
                null,
                null,
                COMPONENT_FILE_TYPES);
    }

    private boolean isAllowedComponentFile(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        for (String type : COMPONENT_FILE_TYPES) {
            if (lower.endsWith(type)) {
                return true;
            }
        }
        return false;
    }

    private String saveComponentPackage(MultipartFile componentFile) {
        if (componentFile.getSize() > AppBaseConfig.FILE_MAX_SIZE) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "文件体积太大");
        }
        String originalFilename = componentFile.getOriginalFilename();
        String sourceId = sanitizePackageId(fileStem(originalFilename));
        String packageId = sourceId + "-" + UUID.randomUUID().toString().replace("-", "");
        Path root = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
        Path tempDir = root.resolve(".import-" + packageId).normalize();
        Path finalDir = root.resolve(packageId).normalize();
        if (!tempDir.startsWith(root) || !finalDir.startsWith(root)) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "组件包名称不合法");
        }
        try {
            byte[] bytes = componentFile.getBytes();
            String entry = scanComponentPackageEntry(bytes);
            Files.createDirectories(root);
            Files.createDirectories(tempDir);
            extractComponentPackage(bytes, tempDir);
            var documentIndex = componentDocuments.inspectPackage(tempDir);
            if (!documentIndex.isEmpty()) entry = String.valueOf(documentIndex.get("codeEntry"));
            Path entryPath = tempDir.resolve(entry).normalize();
            if (!entryPath.startsWith(tempDir) || !Files.isRegularFile(entryPath))
                throw new AppException(AppStatusCode.INVALID_PARAM, "组件包入口不存在");
            ComponentScriptValidator.validate(Files.readAllBytes(entryPath), entry);
            moveDirectory(tempDir, finalDir);
            return packageId + AppBaseConfig.SEPARATOR + entry;
        } catch (IOException e) {
            deleteDirectoryQuietly(tempDir);
            deleteDirectoryQuietly(finalDir);
            throw new AppException(AppStatusCode.SYSTEM_ERR, "服务器组件包保存失败：" + e.getMessage());
        } catch (RuntimeException e) {
            deleteDirectoryQuietly(tempDir);
            deleteDirectoryQuietly(finalDir);
            throw e;
        }
    }

    private String scanComponentPackageEntry(byte[] bytes) throws IOException {
        String best = null;
        int bestPriority = Integer.MIN_VALUE;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String rel = safeComponentZipRelPath(entry.getName());
                if (rel == null) {
                    continue;
                }
                String lower = rel.toLowerCase(Locale.ROOT);
                if (!lower.endsWith(".js") && !lower.endsWith(".mjs")) {
                    continue;
                }
                int priority = componentEntryPriority(lower);
                if (best == null || priority > bestPriority) {
                    best = rel;
                    bestPriority = priority;
                }
            }
        }
        if (best == null) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "组件压缩包中未找到 .js 或 .mjs 入口");
        }
        return best;
    }

    private int componentEntryPriority(String path) {
        int depth = path.split("/").length;
        if (depth == 1) {
            return 30;
        }
        if (path.startsWith("assets/") || path.startsWith("chunks/")) {
            return 10;
        }
        if (path.contains("/assets/") || path.contains("/chunks/")) {
            return 15;
        }
        return 20;
    }

    private void extractComponentPackage(byte[] bytes, Path targetDir) throws IOException {
        Path root = targetDir.toAbsolutePath().normalize();
        long totalUncompressedBytes = 0L;
        long totalLimit = componentPackageTotalLimit();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String rel = safeComponentZipRelPath(entry.getName());
                if (rel == null) {
                    continue;
                }
                Path target = root.resolve(rel).normalize();
                if (!target.startsWith(root)) {
                    throw new AppException(AppStatusCode.INVALID_PARAM, "组件压缩包路径不合法");
                }
                Files.createDirectories(target.getParent());
                try (OutputStream out = Files.newOutputStream(target)) {
                    totalUncompressedBytes += copyZipEntryWithLimit(zis, out, AppBaseConfig.FILE_MAX_SIZE);
                    if (totalUncompressedBytes > totalLimit) {
                        throw new AppException(AppStatusCode.INVALID_PARAM, "组件压缩包解压后体积太大");
                    }
                }
            }
        }
    }

    private long copyZipEntryWithLimit(ZipInputStream zis, OutputStream out, long entryLimit) throws IOException {
        byte[] buffer = new byte[COPY_BUFFER_SIZE];
        long copied = 0L;
        int read;
        while ((read = zis.read(buffer)) != -1) {
            copied += read;
            if (copied > entryLimit) {
                throw new AppException(AppStatusCode.INVALID_PARAM, "组件压缩包内文件体积太大");
            }
            out.write(buffer, 0, read);
        }
        return copied;
    }

    private long componentPackageTotalLimit() {
        long baseLimit = Math.max(AppBaseConfig.FILE_MAX_SIZE, 1L);
        if (baseLimit > Long.MAX_VALUE / COMPONENT_PACKAGE_UNCOMPRESSED_RATIO_LIMIT) {
            return Long.MAX_VALUE;
        }
        return baseLimit * COMPONENT_PACKAGE_UNCOMPRESSED_RATIO_LIMIT;
    }

    private String safeComponentZipRelPath(String name) {
        if (name == null) {
            return null;
        }
        String normalized = name.replace('\\', '/');
        if (normalized.startsWith("__MACOSX/") || normalized.endsWith("/.DS_Store")) {
            return null;
        }
        Path path = Path.of(normalized);
        if (path.isAbsolute()) {
            return null;
        }
        List<String> parts = new ArrayList<>();
        for (Path part : path) {
            String item = part.toString();
            if (item.isBlank() || ".".equals(item)) {
                continue;
            }
            if ("..".equals(item)) {
                return null;
            }
            parts.add(item);
        }
        return parts.isEmpty() ? null : String.join("/", parts);
    }

    private String sanitizePackageId(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("[^a-zA-Z0-9._-]+", "-");
        normalized = normalized.replaceAll("^-+", "").replaceAll("-+$", "");
        return normalized.isBlank() ? "component" : normalized;
    }

    private String fileStem(String name) {
        if (name == null || name.isBlank()) {
            return "component";
        }
        String normalized = name.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String fileName = slash >= 0 ? normalized.substring(slash + 1) : normalized;
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private String toComponentPublicUrl(String storedUrl) {
        String normalized = storedUrl == null ? "" : storedUrl.replace('\\', '/').replaceFirst("^/+", "");
        String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "");
        if (normalized.startsWith(marker + "/")) {
            return AppBaseConfig.SEPARATOR + normalized;
        }
        return String.join(AppBaseConfig.SEPARATOR, AppBaseConfig.REMOTE_COMPONENT_PATH, normalized);
    }

    private boolean shouldDeleteOldComponentFile(User user, Long currentId, String oldUrl, String newUrl) {
        String oldNormalized = normalizeStoredComponentUrl(oldUrl);
        String newNormalized = normalizeStoredComponentUrl(newUrl);
        if (oldNormalized.isBlank() || oldNormalized.equals(newNormalized)) {
            return false;
        }
        if (componentPackageUrlPrefix(oldNormalized) != null) {
            return !storedComponentPackageHasOtherReference(user, currentId, oldNormalized);
        }
        return !storedComponentFileHasOtherReference(user, currentId, oldNormalized);
    }

    private boolean storedComponentFileHasOtherReference(User user, Long currentId, String oldUrl) {
        String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "");
        String staticUrl = marker + "/" + oldUrl;
        return remoteComponentMapper.selectCount(new LambdaQueryWrapper<RemoteComponentPO>()
                .eq(RemoteComponentPO::getUserId, user.getId())
                .ne(RemoteComponentPO::getId, currentId)
                .and(wrapper -> wrapper
                        .eq(RemoteComponentPO::getUrl, oldUrl)
                        .or()
                        .eq(RemoteComponentPO::getUrl, staticUrl)
                        .or()
                        .eq(RemoteComponentPO::getUrl, "/" + staticUrl))) > 0;
    }

    private boolean storedComponentPackageHasOtherReference(User user, Long currentId, String oldUrl) {
        String prefix = componentPackageUrlPrefix(oldUrl);
        if (prefix == null) {
            return false;
        }
        String staticPrefix = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "") + "/" + prefix;
        return remoteComponentMapper.selectCount(new LambdaQueryWrapper<RemoteComponentPO>()
                .eq(RemoteComponentPO::getUserId, user.getId())
                .ne(RemoteComponentPO::getId, currentId)
                .and(wrapper -> wrapper
                        .likeRight(RemoteComponentPO::getUrl, prefix)
                        .or()
                        .likeRight(RemoteComponentPO::getUrl, staticPrefix)
                        .or()
                        .likeRight(RemoteComponentPO::getUrl, "/" + staticPrefix))) > 0;
    }

    private String componentPackageUrlPrefix(String raw) {
        String normalized = normalizeStoredComponentUrl(raw);
        if (normalized.isBlank() || !normalized.contains("/")) {
            return null;
        }
        return normalized.substring(0, normalized.indexOf('/') + 1);
    }

    private String normalizeStoredComponentUrl(String raw) {
        String normalized = raw == null ? "" : raw.trim().replace('\\', '/').replaceFirst("^/+", "");
        String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "") + "/";
        if (normalized.startsWith(marker)) {
            normalized = normalized.substring(marker.length());
        }
        return normalized;
    }

    private void moveDirectory(Path tempDir, Path finalDir) throws IOException {
        try {
            Files.move(tempDir, finalDir, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(tempDir, finalDir);
        }
    }


    @Override
    public List<RemoteComponentDTO> getAllRemoteComponent() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        LambdaQueryWrapper<RemoteComponentPO> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.select(RemoteComponentPO::getId, RemoteComponentPO::getUrl, RemoteComponentPO::getUserId);
        queryWrapper.eq(RemoteComponentPO::getUserId, user.getId());
        List<RemoteComponentPO> remoteComponentPOS = remoteComponentMapper.selectList(queryWrapper);
        if (remoteComponentPOS != null && !remoteComponentPOS.isEmpty()) {
            return remoteComponentPOS.stream().map(remoteComponentPO -> {
                RemoteComponentDTO remoteComponentDTO = new RemoteComponentDTO();
                remoteComponentDTO.setId(remoteComponentPO.getId());
                remoteComponentDTO.setUrl(toComponentPublicUrl(remoteComponentPO.getUrl()));
                var summary = componentDocuments.packageSummary(remoteComponentPO);
                if (!summary.isEmpty()) remoteComponentDTO.setDocumentInfo(summary);
                return remoteComponentDTO;
            }).toList();
        } else
            return new ArrayList<>();
    }

    @Override
    public Page<RemoteComponentDTO> getPageList(PageParamDTO pageParamDTO) {
        User user = AppContextUtil.getCurrentUser();
        if (pageParamDTO == null || user == null)
            return new Page<>();
        Page<RemoteComponentPO> page = new Page<>();
        page.setSize(pageParamDTO.getSize() == 0 ? 10 : pageParamDTO.getSize());
        page.setCurrent(pageParamDTO.getCurrent() == 0 ? 1 : pageParamDTO.getCurrent());
        LambdaQueryWrapper<RemoteComponentPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(RemoteComponentPO::getId, RemoteComponentPO::getComponentName, RemoteComponentPO::getUrl);
        if (pageParamDTO.getSearchValue() != null && !pageParamDTO.getSearchValue().isEmpty())
            wrapper.like(RemoteComponentPO::getComponentName, pageParamDTO.getSearchValue());
        wrapper.eq(RemoteComponentPO::getUserId, user.getId());
        Page<RemoteComponentPO> remoteComponentPOPage = remoteComponentMapper.selectPage(page, wrapper);
        Page<RemoteComponentDTO> remoteComponentDTOPage = new Page<>();
        BeanUtils.copyProperties(remoteComponentPOPage, remoteComponentDTOPage);
        List<RemoteComponentDTO> remoteComponentDTOList = new ArrayList<>();
        for (RemoteComponentPO remoteComponentPO : remoteComponentPOPage.getRecords()) {
            RemoteComponentDTO remoteComponentDTO = new RemoteComponentDTO();
            remoteComponentDTO.setId(remoteComponentPO.getId());
            remoteComponentDTO.setComponentName(remoteComponentPO.getComponentName());
            remoteComponentDTO.setUrl(toComponentPublicUrl(remoteComponentPO.getUrl()));
            remoteComponentDTOList.add(remoteComponentDTO);
        }
        remoteComponentDTOPage.setRecords(remoteComponentDTOList);
        return remoteComponentDTOPage;
    }

    @Override
    public Boolean updateRemoteComponent(RemoteComponentDTO remoteComponentDTO) {
        if (remoteComponentDTO == null || remoteComponentDTO.getId() == null)
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        String name = remoteComponentDTO.getComponentName();
        if (name == null || name.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c)))
            throw new AppException(AppStatusCode.INVALID_PARAM, "请输入组件名称");
        name = name.replaceAll("^[\\p{javaWhitespace}\\p{Z}]+|[\\p{javaWhitespace}\\p{Z}]+$", "");
        if (name.length() > 255)
            throw new AppException(AppStatusCode.INVALID_PARAM, "组件名称不能超过255个字符");
        RemoteComponentPO remoteComponentPO = new RemoteComponentPO();
        remoteComponentPO.setComponentName(name);
        return remoteComponentMapper.update(remoteComponentPO, new LambdaQueryWrapper<RemoteComponentPO>()
                .eq(RemoteComponentPO::getId, remoteComponentDTO.getId())
                .eq(RemoteComponentPO::getUserId, user.getId())) > 0;
    }

    @Override
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public Boolean batchDelRemoteComponent(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return false;
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return false;
        componentDocuments.deactivate(ids, user.getId());
        return remoteComponentMapper.delete(new LambdaQueryWrapper<RemoteComponentPO>()
                .in(RemoteComponentPO::getId, ids)
                .eq(RemoteComponentPO::getUserId, user.getId())) > 0;
    }

    @Override
    public List<RemoteComponentPO> getExpiredData() {
        return remoteComponentMapper.getExpiredData();
    }

    @Override
    public List<RemoteComponentPO> getRemoteComponentsByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty())
            return new ArrayList<>();
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return new ArrayList<>();
        LambdaQueryWrapper<RemoteComponentPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(RemoteComponentPO::getId, RemoteComponentPO::getUrl)
                .eq(RemoteComponentPO::getUserId, user.getId())
                .in(RemoteComponentPO::getId, ids);
        return remoteComponentMapper.selectList(wrapper);
    }

    @Override
    public List<RemoteComponentPO> getRemoteComponents(List<String> urls) {
        if (urls == null || urls.isEmpty())
            return List.of();
        User user = AppContextUtil.getCurrentUser();
        if (user == null)
            return List.of();
        LambdaQueryWrapper<RemoteComponentPO> wrapper = new LambdaQueryWrapper<>();
        wrapper.select(RemoteComponentPO::getId, RemoteComponentPO::getUrl, RemoteComponentPO::getComponentName)
                .eq(RemoteComponentPO::getUserId, user.getId())
                .in(RemoteComponentPO::getUrl, urls);
        return remoteComponentMapper.selectList(wrapper);
    }

    @Override
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public RemoteComponentPO createRemoteComponent(RemoteComponentPO remoteComponentPO) {
        User user = AppContextUtil.getCurrentUser();
        if (remoteComponentPO == null || user == null)
            return null;
        remoteComponentPO.setUserId(user.getId());
        if (remoteComponentMapper.insert(remoteComponentPO) <= 0) return null;
        registerComponentDocuments(remoteComponentPO.getUrl(), remoteComponentPO);
        return remoteComponentPO;
    }

    private void registerComponentDocuments(String url, RemoteComponentPO component) {
        String normalized = normalizeStoredComponentUrl(url);
        if (!normalized.contains("/")) return;
        Path root = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
        Path directory = root.resolve(normalized.substring(0, normalized.indexOf('/'))).normalize();
        if (!directory.startsWith(root)) throw new AppException(AppStatusCode.INVALID_PARAM, "组件文档路径不合法");
        try {componentDocuments.registerPackage(directory, url, component);}
        catch (RuntimeException e) {deleteComponentFile(url); throw e;}
    }

    private void cleanOnRollback(String url) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                @Override public void afterCompletion(int status) {if (status != STATUS_COMMITTED) deleteComponentFile(url);}
            });
    }

    private void deleteComponentFile(String relativePath) {
        if (relativePath == null || relativePath.isBlank())
            return;
        String normalized = relativePath.replace('\\', '/').replaceFirst("^/+", "");
        String marker = AppBaseConfig.REMOTE_COMPONENT_PATH.replace('\\', '/').replaceFirst("^/+", "") + "/";
        if (normalized.startsWith(marker)) {
            normalized = normalized.substring(marker.length());
        }
        if (normalized.isBlank()) {
            return;
        }
        Path root = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
        try {
            if (normalized.contains("/")) {
                Path packageDir = root.resolve(normalized.substring(0, normalized.indexOf('/'))).normalize();
                if (packageDir.startsWith(root)) {
                    deleteDirectoryQuietly(packageDir);
                }
                return;
            }
            Path componentPath = root.resolve(normalized).normalize();
            if (!componentPath.startsWith(root)) {
                return;
            }
            if (Files.exists(componentPath) && !Files.deleteIfExists(componentPath))
                log.error("delete file failed, target path: {}", componentPath);
        } catch (IOException | RuntimeException e) {
            log.error("delete component failed, relative path: {}", relativePath, e);
        }
    }

    private void deleteDirectoryQuietly(Path directory) {
        if (directory == null || !Files.exists(directory)) {
            return;
        }
        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    log.warn("delete component package file failed: {}", path, e);
                }
            });
        } catch (IOException e) {
            log.warn("delete component package directory failed: {}", directory, e);
        }
    }
}
