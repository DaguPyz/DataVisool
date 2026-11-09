/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.alibaba.fastjson.serializer.SerializerFeature;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.zsq.datavisoolcommon.model.dto.ProjectDependenciesDTO;
import com.zsq.datavisoolcommon.model.dto.ProjectDependencyItemDTO;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.constants.DataBaseEnum;
import com.zsq.datavisoolservice.constants.ScriptEnum;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.global.ProjectComponentConversionException;
import com.zsq.datavisoolservice.mapper.CommonApiMapper;
import com.zsq.datavisoolservice.mapper.DatasourceMapper;
import com.zsq.datavisoolservice.mapper.DynamicScriptMapper;
import com.zsq.datavisoolservice.mapper.ProjectMapper;
import com.zsq.datavisoolservice.mapper.ThreeDModelMapper;
import com.zsq.datavisoolservice.mapper.UserMapper;
import com.zsq.datavisoolservice.mapper.VideoMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.ExportProjectNodeDTO;
import com.zsq.datavisoolservice.model.dto.FontDTO;
import com.zsq.datavisoolservice.model.dto.ProjectDependencyParamDTO;
import com.zsq.datavisoolservice.model.dto.ProjectImportParamDTO;
import com.zsq.datavisoolservice.model.po.CommonApiPO;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import com.zsq.datavisoolservice.model.po.DynamicScriptPO;
import com.zsq.datavisoolservice.model.po.FontPO;
import com.zsq.datavisoolservice.model.po.ImagePO;
import com.zsq.datavisoolservice.model.po.ProjectPO;
import com.zsq.datavisoolservice.model.po.RemoteComponentPO;
import com.zsq.datavisoolservice.model.po.ThreeDModelPO;
import com.zsq.datavisoolservice.model.po.UserPO;
import com.zsq.datavisoolservice.model.po.VideoPO;
import com.zsq.datavisoolservice.security.ManifestSecretCodecUtil;
import com.zsq.datavisoolservice.service.FontService;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.service.RemoteComponentService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.ProjectDataCodecUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.GZIPInputStream;
import java.util.zip.CRC32;
import java.util.zip.CheckedInputStream;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@Log4j2
@Component
@RequiredArgsConstructor
class ProjectArchiveCompatHelper {

    private static final String EXPORT_FORMAT = "datavisool-project";
    /** @deprecated Old project-package format identifier; retained for imports. */
    // TODO(legacy-compat): Remove this identifier and its format check when old packages are no longer supported.
    @Deprecated(forRemoval = true)
    private static final String LEGACY_EXPORT_FORMAT = "light-chaser-project";
    private static final String EXPORT_GENERATOR = "datavisool-web";
    private static final String WARNINGS_PATH = "err.log";
    private static final int LATEST_KNOWN_EXPORT_FORMAT_VERSION = 3;
    private static final int IMPORT_COPY_BUFFER_SIZE = 64 * 1024;
    private static final long MAX_IMPORT_TEXT_BYTES = 128L * 1024 * 1024;
    private static final long MAX_IMPORT_FILE_BYTES = 1024L * 1024 * 1024;
    private static final long MAX_IMPORT_TOTAL_UNCOMPRESSED_BYTES = 2L * 1024 * 1024 * 1024;
    private static final long MAX_EXPORT_FILE_BYTES = 1024L * 1024 * 1024;
    private static final long MAX_EXPORT_TOTAL_UNCOMPRESSED_BYTES = 2L * 1024 * 1024 * 1024;
    private static final String[] FONT_IMPORT_FILE_TYPES = {".ttf", ".otf", ".woff", ".woff2", ".eot"};
    private static final String[] JAVASCRIPT_IMPORT_FILE_TYPES = {".js", ".mjs"};
    private static final String[] COMPONENT_IMPORT_FILE_TYPES = {".js", ".mjs", ".zip"};
    private static final String[] MODEL_ENTRY_FILE_TYPES = {".gltf", ".glb", ".obj", ".fbx"};
    private static final String[] MODEL_PACKAGE_FILE_TYPES = {
            ".gltf", ".glb", ".obj", ".fbx", ".mtl",
            ".bin", ".json", ".txt",
            ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp",
            ".ktx", ".ktx2", ".basis", ".tga", ".dds", ".hdr", ".exr"
    };
    private static final SerializerFeature[] MANIFEST_JSON_FEATURES = {
            SerializerFeature.DisableCircularReferenceDetect
    };

    private final ProjectMapper projectMapper;
    private final UserMapper userMapper;
    private final FontService fontService;
    private final ImageService imageService;
    private final RemoteComponentService remoteComponentService;
    private final DynamicScriptMapper dynamicScriptMapper;
    private final CommonApiMapper commonApiMapper;
    private final DatasourceMapper datasourceMapper;
    private final VideoMapper videoMapper;
    private final ThreeDModelMapper threeDModelMapper;

    public ResponseEntity<StreamingResponseBody> exportProject(ProjectDependencyParamDTO dependency) throws Exception {
        if (dependency == null) {
            throw new AppException(500, "无法导出项目数据，原因：项目数据为空");
        }

        String topLevelProjectJson = ProjectDataCodecUtil.decode(dependency.getProjectJson());
        dependency.setProjectJson(topLevelProjectJson);

        List<PreparedExportProjectNode> projectNodes = prepareExportProjectNodes(dependency.getProjects());
        boolean useProjectGraphExport = shouldUseProjectGraphExport(projectNodes);
        PreparedExportProjectNode entryNode = resolveEntryNode(projectNodes, useProjectGraphExport);

        String projectId = entryNode != null
                ? entryNode.sourceProjectId
                : normalizeText(String.valueOf(dependency.getId()));
        if (StringUtils.isBlank(projectId)) {
            throw new AppException(500, "无法导出项目数据，原因：项目ID缺失");
        }

        String projectName = normalizeText(dependency.getName());
        if (StringUtils.isBlank(projectName)) {
            projectName = entryNode != null && StringUtils.isNotBlank(entryNode.name)
                    ? entryNode.name
                    : "DataVisoolProject";
        }

        List<String> warnings = new ArrayList<>();
        LinkedHashMap<String, ExportArchiveEntry> archiveEntries = new LinkedHashMap<>();
        ExportSizeGuard exportSizeGuard = new ExportSizeGuard();

        try {
            List<String> mergedImages = mergeProjectValues(projectNodes, dependency.getImages(), node -> node.images);
            List<String> mergedFonts = mergeProjectValues(projectNodes, dependency.getFonts(), node -> node.fonts);
            List<String> mergedVideos = mergeProjectValues(projectNodes, dependency.getVideos(), node -> node.videos);
            List<String> mergedModels = mergeProjectValues(projectNodes, dependency.getModels(), node -> node.models);
            List<String> mergedComponents = mergeProjectValues(projectNodes, dependency.getComponents(), node -> node.components);
            List<String> mergedCommonApiIds = mergeProjectValues(projectNodes, dependency.getCommonApiIds(), node -> node.commonApiIds);
            List<String> mergedDatabaseIds = mergeProjectValues(projectNodes, dependency.getDatabaseIds(), node -> node.databaseIds);

            List<Map<String, Object>> imageRefs = exportImages(mergedImages, warnings, archiveEntries, exportSizeGuard);
            List<Map<String, Object>> fontRefs = exportFonts(mergedFonts, warnings, archiveEntries, exportSizeGuard);
            List<Map<String, Object>> videoRefs = exportVideos(mergedVideos, warnings, archiveEntries, exportSizeGuard);
            List<Map<String, Object>> componentRefs = exportComponents(mergedComponents, warnings, archiveEntries, exportSizeGuard);
            List<Map<String, Object>> modelRefs = exportModels(mergedModels, warnings, archiveEntries, exportSizeGuard);

            List<String> dynamicScriptProjectIds = useProjectGraphExport
                    ? projectNodes.stream().map(node -> node.sourceProjectId).toList()
                    : Collections.singletonList(projectId);
            List<Map<String, Object>> dynamicScriptRefs = exportDynamicScripts(dynamicScriptProjectIds, warnings, archiveEntries, exportSizeGuard);

            List<Map<String, Object>> commonApiRefs = exportCommonApis(mergedCommonApiIds, warnings);
            List<Map<String, Object>> databaseRefs = exportCommonDatabases(mergedDatabaseIds, warnings);
            boolean encryptPackage = shouldEncryptPackage(dependency.getSecretMode(), dependency.getSecretPassphrase());
            requirePackageEncryptionForCommonDatasource(encryptPackage, commonApiRefs, databaseRefs);

            LinkedHashMap<String, Object> manifestProject = new LinkedHashMap<>();
            List<Map<String, Object>> manifestProjects = new ArrayList<>();
            int formatVersion;

            if (useProjectGraphExport) {
                for (PreparedExportProjectNode node : projectNodes) {
                    putBytesEntry(archiveEntries, node.dataPath, node.projectJson.getBytes(StandardCharsets.UTF_8), exportSizeGuard);
                    manifestProjects.add(buildProjectNodeManifest(node));
                }
                PreparedExportProjectNode finalEntryNode = Objects.requireNonNull(entryNode, "entry node must exist");
                manifestProject.put("id", finalEntryNode.sourceProjectId);
                manifestProject.put("name", projectName);
                manifestProject.put("dataPath", finalEntryNode.dataPath);
                formatVersion = 3;
            } else {
                String projectJson = entryNode != null ? entryNode.projectJson : topLevelProjectJson;
                if (StringUtils.isBlank(projectJson)) {
                    throw new AppException(500, "无法导出项目数据，原因：项目数据为空");
                }
                putBytesEntry(archiveEntries, "project/project.json", projectJson.getBytes(StandardCharsets.UTF_8), exportSizeGuard);
                manifestProject.put("id", projectId);
                manifestProject.put("name", projectName);
                manifestProject.put("dataPath", "project/project.json");
                formatVersion = 2;
            }

            if (!warnings.isEmpty()) {
                putBytesEntry(archiveEntries, WARNINGS_PATH, buildWarningsBytes(warnings), exportSizeGuard);
            }

            List<Map<String, Object>> fileRefs = buildManifestFiles(archiveEntries);
            LinkedHashMap<String, Object> manifest = new LinkedHashMap<>();
            manifest.put("format", EXPORT_FORMAT);
            manifest.put("formatVersion", formatVersion);
            manifest.put("generator", EXPORT_GENERATOR);
            manifest.put("generatedAtMs", System.currentTimeMillis());
            manifest.put("project", manifestProject);
            manifest.put("projects", manifestProjects);
            manifest.put("assets", buildAssetsObject(imageRefs, fontRefs, videoRefs, componentRefs, dynamicScriptRefs, modelRefs));
            manifest.put("commonDatasource", buildCommonDatasourceObject(commonApiRefs, databaseRefs));
            manifest.put("files", fileRefs);
            manifest.put("warningsPath", warnings.isEmpty() ? null : WARNINGS_PATH);

            StreamingResponseBody body = encryptPackage
                    ? outputStream -> writeEncryptedPackageZip(outputStream, manifest, archiveEntries, dependency.getSecretPassphrase())
                    : outputStream -> writeZip(outputStream, manifest, archiveEntries);
            String downloadName = sanitizeFileName(projectName) + ".zip";

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            String encodedFileName = java.net.URLEncoder.encode(downloadName, StandardCharsets.UTF_8);
            headers.setContentDispositionFormData("attachment", encodedFileName);
            return new ResponseEntity<>(body, headers, HttpStatus.OK);
        } catch (Exception e) {
            cleanupArchiveEntries(archiveEntries);
            throw e;
        }
    }

    public Boolean importProject(ProjectImportParamDTO importParam) throws IOException {
        if (importParam != null) importParam.setImportNotice(null);
        if (importParam == null || importParam.getFile() == null) {
            return false;
        }
        requireWritableProject(importParam.getProjectId());

        MultipartFile file = importParam.getFile();
        Path tempFile = Files.createTempFile("upload-" + UUID.randomUUID(), ".zip");
        ImportWriteContext importWriteContext = new ImportWriteContext();
        try {
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, tempFile, StandardCopyOption.REPLACE_EXISTING);
            }
            importWriteContext.cleanupOnTransactionRollback();
            if (containsManifest(tempFile)) {
                importManifestProject(importParam.getProjectId(), tempFile, importParam.getSecretPassphrase(), importWriteContext);
                importParam.setImportNotice(importWriteContext.importNotice());
                return true;
            }
            // TODO(legacy-compat): Remove the no-manifest import path when old .lc packages are no longer supported.
            Boolean imported = importLegacyProject(importParam, tempFile, importWriteContext);
            importParam.setImportNotice(importWriteContext.importNotice());
            return imported;
        } catch (Exception e) {
            importWriteContext.cleanup();
            log.error("导入失败:{}", e.getMessage(), e);
            if (e instanceof ProjectComponentConversionException conversionException) throw conversionException;
            throw new RuntimeException("导入失败,失败原因: " + e.getMessage(), e);
        } finally {
            try {
                Files.deleteIfExists(tempFile);
            } catch (IOException e) {
                log.warn("临时文件删除失败: {}", tempFile, e);
            }
        }
    }

    private boolean containsManifest(Path zipPath) throws IOException {
        try (ZipFile zipFile = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
            verifyUniqueZipEntries(zipFile);
            return findZipEntry(zipFile, "manifest.json") != null;
        }
    }

    private void verifyUniqueZipEntries(ZipFile zipFile) {
        Set<String> names = new HashSet<>();
        var entries = zipFile.entries();
        while (entries.hasMoreElements()) {
            String path = normalizeZipPath(entries.nextElement().getName());
            if (!names.add(path)) throw new IllegalArgumentException("导入包包含重复路径: " + path);
        }
    }

    /** @deprecated Imports old ZIP packages without a manifest. */
    // TODO(legacy-compat): Remove this importer when no-manifest .lc packages are no longer supported.
    @Deprecated(forRemoval = true)
    private Boolean importLegacyProject(ProjectImportParamDTO importParam, Path tempFile, ImportWriteContext importWriteContext) throws IOException {
        String dataJson = null;
        ProjectDependenciesDTO dependencies = null;
        Map<String, String> fontUrls = new LinkedHashMap<>(), scriptsUrls = new LinkedHashMap<>(), componentUrls = new LinkedHashMap<>(), imagesUrls = new LinkedHashMap<>();
        ImportSizeGuard importSizeGuard = new ImportSizeGuard();

        try (ZipFile zipFile = new ZipFile(tempFile.toFile(), StandardCharsets.UTF_8)) {
            var scanEntries = zipFile.entries();
            while (scanEntries.hasMoreElements()) {
                ZipEntry zipEntry = scanEntries.nextElement();
                if (zipEntry.isDirectory()) continue;
                String entryName = String.join("", java.io.File.separator, zipEntry.getName()).replaceAll("\\\\", "/");
                if (isLegacyAssetEntry(entryName, AppBaseConfig.IMAGE_PATH))
                    imagesUrls.put(zipEntry.getName(), entryName.substring(entryName.lastIndexOf("/") + 1));
                if (isLegacyAssetEntry(entryName, AppBaseConfig.FONT_PATH))
                    fontUrls.put(zipEntry.getName(), entryName.substring(entryName.lastIndexOf("/") + 1));
                if (isLegacyAssetEntry(entryName, AppBaseConfig.REMOTE_COMPONENT_PATH))
                    componentUrls.put(zipEntry.getName(), entryName.substring(entryName.lastIndexOf("/") + 1));
                if (isLegacyAssetEntry(entryName, AppBaseConfig.DYNAMIC_SCRIPT_PATH))
                    scriptsUrls.put(zipEntry.getName(), entryName.substring(entryName.lastIndexOf("/") + 1));
                if (entryName.endsWith(".lc")) {
                    if (dataJson != null) throw new IllegalArgumentException("旧项目包包含多个 .lc 项目数据文件");
                    assertZipEntrySizeWithinLimit(zipEntry, MAX_IMPORT_TEXT_BYTES);
                    try (CheckedInputStream input = new CheckedInputStream(zipFile.getInputStream(zipEntry), new CRC32())) {
                        dataJson = readCurrentZipEntryText(input, importSizeGuard);
                        verifyLegacyEntryCrc(zipEntry, input);
                    }
                    dependencies = JSON.parseObject(dataJson, ProjectDependenciesDTO.class);
                }
            }

            if (dependencies == null) {
                throw new RuntimeException("未找到依赖文件");
            }
            dependencies.setProjectJson(decodeImportedProjectData(dependencies.getProjectJson(), importSizeGuard));
            parseImportedProjectJson(dependencies.getProjectJson());

            List<ProjectDependencyItemDTO> componentDepList = dependencies.getComponents();
            List<ProjectDependencyItemDTO> fontDepList = dependencies.getFonts();
            List<ProjectDependencyItemDTO> imageDepList = dependencies.getImages();
            List<ProjectDependencyItemDTO> dynamicScriptDepList = dependencies.getDynamicScripts();
            ImportedAssetContext assetContext = new ImportedAssetContext(importWriteContext);
            var assetEntries = zipFile.entries();
            while (assetEntries.hasMoreElements()) {
                ZipEntry zipEntry = assetEntries.nextElement();
                if (zipEntry.isDirectory()) continue;
                String entryName = zipEntry.getName();
                String imageName = imagesUrls.get(entryName);
                String fontUrl = fontUrls.get(entryName);
                String componentUrl = componentUrls.get(entryName);
                String scriptUrl = scriptsUrls.get(entryName);
                if (StringUtils.isEmpty(imageName) && StringUtils.isEmpty(fontUrl)
                        && StringUtils.isEmpty(componentUrl) && StringUtils.isEmpty(scriptUrl)) continue;
                assertZipEntrySizeWithinLimit(zipEntry, MAX_IMPORT_FILE_BYTES);
                try (CheckedInputStream input = new CheckedInputStream(zipFile.getInputStream(zipEntry), new CRC32())) {
                    if (StringUtils.isNotEmpty(imageName)) {
                        assertAllowedImportFileType(imageName, AppBaseConfig.ALLOW_IMAGE_TYPE, "图片文件");
                        String storedImageName = writeStreamToUniqueFile(input, Path.of(AppBaseConfig.getImagePath()), imageName, importSizeGuard, importWriteContext);
                        verifyLegacyEntryCrc(zipEntry, input);
                        ImagePO imagePO = new ImagePO();
                        imagePO.setUrl(storedImageName);
                        String depFileName = getDepFileName(imageDepList, imageName);
                        imagePO.setName(StringUtils.isNotEmpty(depFileName) ? depFileName : imageName);
                        createImportedImage(imagePO);
                        assetContext.registerImage(entryName, storedImageName);
                        assetContext.registerImage(imageName, storedImageName);
                    } else if (StringUtils.isNotEmpty(fontUrl)) {
                        assertAllowedImportFileType(fontUrl, FONT_IMPORT_FILE_TYPES, "字体文件");
                        String storedFontUrl = writeStreamToUniqueFile(input, Path.of(AppBaseConfig.getFontPath()), fontUrl, importSizeGuard, importWriteContext);
                        verifyLegacyEntryCrc(zipEntry, input);
                        FontPO fontPO = new FontPO();
                        fontPO.setUrl(storedFontUrl);
                        String depFontName = getDepFileName(fontDepList, fontUrl);
                        String name = StringUtils.isNotEmpty(depFontName) ? depFontName : fontUrl;
                        ImportedFont imported = registerImportedFont(name, storedFontUrl, assetContext);
                        if (!imported.reused()) {
                            fontPO.setName(imported.name());
                            createImportedFont(fontPO);
                        }
                    } else if (StringUtils.isNotEmpty(componentUrl)) {
                        assertAllowedImportFileType(componentUrl, JAVASCRIPT_IMPORT_FILE_TYPES, "组件文件");
                        String storedComponentUrl = writeStreamToUniqueFile(input, Path.of(AppBaseConfig.getRemoteComponentPath()), componentUrl, importSizeGuard, importWriteContext);
                        verifyLegacyEntryCrc(zipEntry, input);
                        // TODO(legacy-compat): Remove legacy component conversion when support for old components ends.
                        String componentDepName = getDepFileName(componentDepList, componentUrl);
                        convertImportedComponent(Path.of(AppBaseConfig.getRemoteComponentPath(), storedComponentUrl),
                                StringUtils.defaultIfBlank(componentDepName, componentUrl), componentUrl);
                        RemoteComponentPO componentPO = new RemoteComponentPO();
                        componentPO.setUrl(storedComponentUrl);
                        componentPO.setComponentName(StringUtils.isNotEmpty(componentDepName) ? componentDepName : componentUrl);
                        createImportedComponent(componentPO);
                    } else if (StringUtils.isNotEmpty(scriptUrl)) {
                        assertAllowedImportFileType(scriptUrl, JAVASCRIPT_IMPORT_FILE_TYPES, "动态脚本文件");
                        String storedScriptUrl = writeStreamToUniqueFile(input, Path.of(AppBaseConfig.getDynamicScriptPath()), scriptUrl, importSizeGuard, importWriteContext);
                        verifyLegacyEntryCrc(zipEntry, input);
                        DynamicScriptPO scriptPO = new DynamicScriptPO();
                        scriptPO.setUrl(storedScriptUrl);
                        scriptPO.setType(ScriptEnum.LOCAL);
                        String scriptDepName = getDepFileName(dynamicScriptDepList, scriptUrl);
                        scriptPO.setName(StringUtils.isNotEmpty(scriptDepName) ? scriptDepName : scriptUrl);
                        scriptPO.setProjectId(importParam.getProjectId());
                        createDynamicScript(scriptPO);
                    }
                }
            }
            String rewrittenJson = rewriteImportedProjectJson(dependencies.getProjectJson(), new ImportedDatasourceContext(importWriteContext), assetContext, null, importParam.getProjectId());
            updateProjectJson(importParam.getProjectId(), rewrittenJson);
        }
        return true;
    }

    /** @deprecated Checks entries used by the no-manifest legacy importer. */
    // TODO(legacy-compat): Remove with the no-manifest .lc package importer.
    @Deprecated(forRemoval = true)
    private void verifyLegacyEntryCrc(ZipEntry entry, CheckedInputStream input) {
        if (entry.getCrc() >= 0 && entry.getCrc() != input.getChecksum().getValue())
            throw new IllegalArgumentException("旧项目包文件校验失败: " + entry.getName());
    }

    /** @deprecated Identifies assets in no-manifest legacy packages. */
    // TODO(legacy-compat): Remove with the no-manifest .lc package importer.
    @Deprecated(forRemoval = true)
    private static boolean isLegacyAssetEntry(String entryName, String assetDirectory) {
        if (StringUtils.isBlank(entryName) || StringUtils.isBlank(assetDirectory)) return false;
        String directory = assetDirectory.replace('\\', '/').replaceAll("^/+|/+$", "");
        if (directory.isEmpty()) return false;
        String path = "/" + entryName.replace('\\', '/').replaceAll("^/+", "");
        return path.contains("/" + directory + "/");
    }

    private void importManifestProject(Long targetProjectId, Path zipPath, String secretPassphrase, ImportWriteContext importWriteContext) throws IOException {
        if (targetProjectId == null) {
            throw new RuntimeException("项目ID缺失");
        }

        try (ZipFile zipFile = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
            verifyUniqueZipEntries(zipFile);
            ImportSizeGuard importSizeGuard = new ImportSizeGuard();
            String manifestJson = readZipText(zipFile, "manifest.json", importSizeGuard);
            JSONObject manifest = JSON.parseObject(manifestJson);
            if (!isSupportedProjectFormat(manifest.getString("format"))) {
                throw new RuntimeException("不支持的导出包格式");
            }

            Integer formatVersion = manifest.getInteger("formatVersion");
            ManifestImportMode importMode = resolveManifestImportMode(manifest);
            if (formatVersion != null && formatVersion > LATEST_KNOWN_EXPORT_FORMAT_VERSION) {
                log.warn("导入高版本项目包，将按兼容结构解析。formatVersion={}, generator={}",
                        formatVersion, manifest.getString("generator"));
            }
            if (importMode == ManifestImportMode.ENCRYPTED_PACKAGE) {
                importEncryptedPackageProject(targetProjectId, zipFile, manifest, secretPassphrase, importWriteContext, importSizeGuard);
                return;
            }

            verifyManifestFiles(zipFile, manifest.getJSONArray("files"));
            JSONObject assets = manifest.getJSONObject("assets");
            verifyManifestAssetReferences(zipFile, assets);
            validateDynamicScriptScopes(getArray(assets, "dynamicScripts"));

            // Validate all project data before creating any imported assets or records.
            List<ImportedProjectNode> projectNodes = null;
            String projectJson = null;
            if (importMode == ManifestImportMode.PROJECT_GRAPH) {
                projectNodes = readManifestProjectNodes(zipFile, manifest.getJSONArray("projects"), importSizeGuard);
                validateImportProjectGraph(projectNodes);
                validateImportProjectReferences(projectNodes);
                validateDynamicScriptOwners(getArray(assets, "dynamicScripts"), projectNodes);
            } else {
                JSONObject project = manifest.getJSONObject("project");
                String dataPath = normalizeZipPath(project == null ? null : project.getString("dataPath"));
                // TODO(legacy-compat): Review this implicit path when support for packages without an explicit dataPath ends.
                if (StringUtils.isBlank(dataPath)) dataPath = "project/project.json";
                projectJson = decodeImportedProjectData(readZipText(zipFile, dataPath, importSizeGuard), importSizeGuard);
                parseImportedProjectJson(projectJson);
            }

            JSONObject commonDatasource = manifest.getJSONObject("commonDatasource");
            ImportedDatasourceContext datasourceContext = importCommonDatasources(commonDatasource, secretPassphrase, importWriteContext);

            ImportedAssetContext assetContext = new ImportedAssetContext(importWriteContext);
            importFonts(zipFile, getArray(assets, "fonts"), assetContext, importSizeGuard, importWriteContext);
            importComponents(zipFile, getArray(assets, "components"), assetContext, importSizeGuard, importWriteContext);
            importImages(zipFile, getArray(assets, "images"), assetContext, importSizeGuard, importWriteContext);
            importVideos(zipFile, getArray(assets, "videos"), assetContext, importSizeGuard, importWriteContext);
            importModels(zipFile, getArray(assets, "models"), assetContext, importSizeGuard, importWriteContext);

            if (importMode == ManifestImportMode.PROJECT_GRAPH) {
                Map<String, Long> projectIdMap = buildImportProjectIdMap(targetProjectId, projectNodes);
                importDynamicScripts(zipFile, getArray(assets, "dynamicScripts"), targetProjectId, projectIdMap, importSizeGuard, importWriteContext);
                rewriteAndPersistProjectGraphJson(projectNodes, datasourceContext, assetContext, projectIdMap);
                return;
            }

            importDynamicScripts(zipFile, getArray(assets, "dynamicScripts"), targetProjectId, null, importSizeGuard, importWriteContext);
            String rewrittenJson = rewriteImportedProjectJson(projectJson, datasourceContext, assetContext, null, targetProjectId);
            updateProjectJson(targetProjectId, rewrittenJson);
        }
    }

    static ManifestImportMode resolveManifestImportMode(JSONObject manifest) {
        if (manifest == null || !isSupportedProjectFormat(manifest.getString("format"))) {
            throw new RuntimeException("不支持的导出包格式");
        }

        // TODO(legacy-compat): Version 1 and an absent version are accepted for import; retain current versions and encrypted envelopes if support changes.
        Integer formatVersion = manifest.getInteger("formatVersion");
        if (formatVersion != null && formatVersion < 1) {
            throw new RuntimeException("导出包版本不受支持: " + formatVersion);
        }

        if (defaultBoolean(manifest.get("encrypted"))) {
            JSONObject encryption = manifest.getJSONObject("encryption");
            String mode = encryption == null ? "" : encryption.getString("mode");
            if ("package".equals(normalizeText(mode))) {
                return ManifestImportMode.ENCRYPTED_PACKAGE;
            }
            throw new RuntimeException("不支持的加密导出包模式: " + mode);
        }

        if (formatVersion != null && formatVersion > LATEST_KNOWN_EXPORT_FORMAT_VERSION) {
            throw new RuntimeException("导出包版本过新，请升级应用");
        }

        JSONArray projectArray = manifest.getJSONArray("projects");
        if (projectArray != null && !projectArray.isEmpty()) {
            return ManifestImportMode.PROJECT_GRAPH;
        }
        return ManifestImportMode.SINGLE_PROJECT;
    }

    private static boolean isSupportedProjectFormat(String format) {
        return EXPORT_FORMAT.equals(format) || LEGACY_EXPORT_FORMAT.equals(format);
    }

    private void verifyManifestFiles(ZipFile zipFile, JSONArray files) throws IOException {
        // TODO(legacy-compat): Revisit optional file lists when packages without them are no longer supported; keep verification for current packages.
        if (files == null || files.isEmpty()) return;
        ImportSizeGuard verificationSize = new ImportSizeGuard();
        for (int i = 0; i < files.size(); i++) {
            JSONObject file = files.getJSONObject(i);
            if (file == null) throw new IllegalArgumentException("导出包文件清单不合法");
            String path = normalizeZipPath(file.getString("path"));
            if (StringUtils.isBlank(path)) throw new IllegalArgumentException("导出包文件清单缺少路径");
            ZipEntry entry = findZipEntry(zipFile, path);
            if (entry == null || entry.isDirectory()) throw new IllegalArgumentException("导出包缺少文件: " + path);
            assertZipEntrySizeWithinLimit(entry, MAX_IMPORT_FILE_BYTES);
            Long expectedSize = file.getLong("size");
            if (expectedSize != null && expectedSize < 0) throw new IllegalArgumentException("导出包文件大小不合法: " + path);
            String expectedHash = normalizeText(file.getString("sha256")).toLowerCase(Locale.ROOT);
            if (StringUtils.isNotBlank(expectedHash) && !expectedHash.matches("[0-9a-f]{64}"))
                throw new IllegalArgumentException("导出包文件哈希不合法: " + path);
            MessageDigest digest;
            try {
                digest = MessageDigest.getInstance("SHA-256");
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 不可用", e);
            }
            long actualSize = 0;
            try (InputStream input = zipFile.getInputStream(entry)) {
                byte[] buffer = new byte[IMPORT_COPY_BUFFER_SIZE];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (actualSize > MAX_IMPORT_FILE_BYTES - read) throw new IllegalArgumentException("导入包文件超过大小限制: " + path);
                    actualSize += read;
                    verificationSize.add(read);
                    digest.update(buffer, 0, read);
                }
            }
            if (expectedSize != null && expectedSize != 0 && expectedSize != actualSize)
                throw new IllegalArgumentException("导出包文件大小校验失败: " + path);
            if (StringUtils.isNotBlank(expectedHash) && !expectedHash.equals(HexFormat.of().formatHex(digest.digest())))
                throw new IllegalArgumentException("导出包文件哈希校验失败: " + path);
        }
    }

    private void verifyManifestAssetReferences(ZipFile zipFile, JSONObject assets) {
        for (String type : List.of("fonts", "components", "images", "videos", "dynamicScripts")) {
            JSONArray items = getArray(assets, type);
            for (int i = 0; i < items.size(); i++) {
                JSONObject item = items.getJSONObject(i);
                String location = "assets." + type + "[" + i + "]";
                if (item == null) throw new IllegalArgumentException("资源清单条目为空: " + location);
                if ("dynamicScripts".equals(type) &&
                        ("REMOTE".equalsIgnoreCase(defaultString(item.getString("type"))) ||
                                StringUtils.startsWithIgnoreCase(item.getString("url"), "http"))) {
                    if (StringUtils.isBlank(item.getString("url")))
                        throw new IllegalArgumentException("远程脚本缺少地址: " + location);
                    continue;
                }
                if (StringUtils.isBlank(item.getString("blob")))
                    throw new IllegalArgumentException("资源清单缺少文件路径: " + location);
                verifyManifestAssetBlob(zipFile, item.getString("blob"));
            }
        }
        JSONArray models = getArray(assets, "models");
        for (int i = 0; i < models.size(); i++) {
            JSONObject model = models.getJSONObject(i);
            if (model == null) throw new IllegalArgumentException("资源清单条目为空: assets.models[" + i + "]");
            JSONArray files = getArray(model, "files");
            for (int j = 0; j < files.size(); j++) {
                JSONObject file = files.getJSONObject(j);
                if (file != null) verifyManifestAssetBlob(zipFile, file.getString("blob"));
            }
            validateManifestModel(model, files);
        }
    }

    private void validateManifestModel(JSONObject model, JSONArray files) {
        String entry = normalizePath(model.getString("entry"));
        if (StringUtils.isBlank(model.getString("packageId")) || StringUtils.isBlank(entry) || files.isEmpty())
            throw new IllegalArgumentException("模型清单缺少包标识、入口或文件");
        assertSafeRelativePath(entry, "模型入口路径不合法");
        assertAllowedImportFileType(entry, MODEL_ENTRY_FILE_TYPES, "模型入口文件");
        Path entryPath = Path.of(entry).normalize();
        Set<Path> paths = new HashSet<>();
        for (int i = 0; i < files.size(); i++) {
            JSONObject file = files.getJSONObject(i);
            if (file == null || StringUtils.isBlank(file.getString("path")) || StringUtils.isBlank(file.getString("blob")))
                throw new IllegalArgumentException("模型文件清单缺少路径");
            String relativePath = normalizePath(file.getString("path"));
            assertSafeRelativePath(relativePath, "模型路径不合法");
            assertAllowedImportFileType(relativePath, MODEL_PACKAGE_FILE_TYPES, "模型资源文件");
            if (!paths.add(Path.of(relativePath).normalize()))
                throw new IllegalArgumentException("模型文件路径重复: " + relativePath);
        }
        if (!paths.contains(entryPath)) throw new IllegalArgumentException("模型入口文件不在文件清单中: " + entry);
    }

    private void verifyManifestAssetBlob(ZipFile zipFile, String blob) {
        String path = normalizeZipPath(blob);
        if (StringUtils.isBlank(path)) return;
        ZipEntry entry = findZipEntry(zipFile, path);
        if (entry == null || entry.isDirectory()) throw new IllegalArgumentException("导出包缺少文件: " + path);
        assertZipEntrySizeWithinLimit(entry, MAX_IMPORT_FILE_BYTES);
    }

    private void importEncryptedPackageProject(
            Long targetProjectId,
            ZipFile zipFile,
            JSONObject manifest,
            String secretPassphrase,
            ImportWriteContext importWriteContext,
            ImportSizeGuard importSizeGuard
    ) throws IOException {
        if (StringUtils.isBlank(secretPassphrase)) {
            throw new RuntimeException("请求参数错误：缺少导入口令（该项目包已加密）");
        }
        JSONObject encryption = manifest.getJSONObject("encryption");
        if (encryption == null || !"passphrase-v1".equals(normalizeText(encryption.getString("algorithm")))) {
            throw new RuntimeException("不支持的加密项目包算法");
        }

        String payloadPath = normalizeZipPath(encryption.getString("payloadPath"));
        if (StringUtils.isBlank(payloadPath)) {
            JSONObject payload = manifest.getJSONObject("payload");
            payloadPath = normalizeZipPath(payload == null ? null : payload.getString("path"));
        }
        if (StringUtils.isBlank(payloadPath)) {
            payloadPath = "payload.enc";
        }

        Path encryptedPayloadFile = writeZipEntryToTempFile(zipFile, payloadPath, ".enc", importSizeGuard);
        Path innerZip = Files.createTempFile("datavisool-import-payload-" + UUID.randomUUID(), ".zip");
        try {
            verifyEncryptedPayloadManifest(manifest, encryptedPayloadFile);
            decryptImportPackagePayload(encryptedPayloadFile, innerZip, secretPassphrase);
            importSizeGuard.add(Files.size(innerZip));
            importManifestProject(targetProjectId, innerZip, secretPassphrase, importWriteContext);
        } finally {
            try {
                Files.deleteIfExists(encryptedPayloadFile);
                Files.deleteIfExists(innerZip);
            } catch (IOException e) {
                log.warn("导入加密项目包临时文件删除失败: {}", innerZip, e);
            }
        }
    }

    static void verifyEncryptedPayloadManifest(JSONObject manifest, Path encryptedPayloadFile) throws IOException {
        JSONObject payload = manifest == null ? null : manifest.getJSONObject("payload");
        if (payload == null) {
            return;
        }

        Long expectedSize = payload.getLong("size");
        if (expectedSize != null && expectedSize != Files.size(encryptedPayloadFile)) {
            throw new RuntimeException("导入失败：加密 payload 大小校验失败");
        }

        String expectedSha = normalizeText(payload.getString("sha256")).toLowerCase(Locale.ROOT);
        if (StringUtils.isNotBlank(expectedSha) && !expectedSha.equals(sha256(encryptedPayloadFile))) {
            throw new RuntimeException("导入失败：加密 payload 校验失败");
        }
    }

    private void decryptImportPackagePayload(Path encryptedPayload, Path innerZip, String secretPassphrase) {
        try {
            ManifestSecretCodecUtil.decryptEnvelopeJsonFileWithPassphraseV1(encryptedPayload, innerZip, secretPassphrase);
        } catch (ManifestSecretCodecUtil.ManifestSecretCodecException e) {
            try {
                Files.deleteIfExists(innerZip);
            } catch (IOException cleanupError) {
                log.warn("导入加密项目包解密失败后清理临时文件失败: {}", innerZip, cleanupError);
            }
            if (e.getErrorCode() == ManifestSecretCodecUtil.ErrorCode.AES_DECRYPT) {
                throw new RuntimeException("请求参数错误：导入口令错误", e);
            }
            throw new RuntimeException("导入失败：解密项目包失败（" + e.getMessage() + "）", e);
        }
    }

    private ImportedDatasourceContext importCommonDatasources(JSONObject commonDatasource, String secretPassphrase, ImportWriteContext importWriteContext) {
        if (commonDatasource == null) {
            return new ImportedDatasourceContext(importWriteContext);
        }
        Object commonApisField = commonDatasource.get("commonApis");
        Object databasesField = commonDatasource.get("databases");
        if ((commonApisField instanceof String || databasesField instanceof String) && StringUtils.isBlank(secretPassphrase)) {
            throw new RuntimeException("请求参数错误：缺少导入口令（该项目包包含加密数据源）");
        }
        JSONArray commonApis = resolveImportedDatasourceArray(commonApisField, secretPassphrase, "commonApis");
        JSONArray databases = resolveImportedDatasourceArray(databasesField, secretPassphrase, "databases");
        validateDatasourceIdentifiers(commonApis, "公共 API");
        validateDatasourceIdentifiers(databases, "数据库");
        Map<String, Long> commonApiIdMap = importCommonApis(commonApis);
        Map<String, Long> databaseIdMap = importCommonDatabases(databases);
        return new ImportedDatasourceContext(
                commonApiIdMap,
                databaseIdMap,
                buildDatasourceRefKeyMap(commonApis, commonApiIdMap),
                buildDatasourceRefKeyMap(databases, databaseIdMap),
                importWriteContext
        );
    }

    private void validateDatasourceIdentifiers(JSONArray definitions, String label) {
        if (definitions == null) return;
        Map<String, JSONObject> byOriginId = new HashMap<>();
        Map<String, String> originByRefKey = new HashMap<>();
        for (int i = 0; i < definitions.size(); i++) {
            JSONObject item = definitions.getJSONObject(i);
            if (item == null) continue;
            String originId = normalizeText(item.getString("originId"));
            if (StringUtils.isBlank(originId)) continue;
            JSONObject previous = byOriginId.putIfAbsent(originId, item);
            if (previous != null && !previous.equals(item))
                throw new IllegalArgumentException("导入包" + label + "存在冲突的原始 ID: " + originId);
            String refKey = normalizeText(item.getString("refKey"));
            if (StringUtils.isBlank(refKey)) continue;
            String previousOriginId = originByRefKey.putIfAbsent(refKey, originId);
            if (previousOriginId != null && !previousOriginId.equals(originId))
                throw new IllegalArgumentException("导入包" + label + "存在冲突的引用标识: " + refKey);
        }
    }

    private JSONArray resolveImportedDatasourceArray(Object fieldValue, String secretPassphrase, String fieldName) {
        if (fieldValue == null) {
            return null;
        }
        if (fieldValue instanceof JSONArray array) {
            return array;
        }
        if (!(fieldValue instanceof String payload)) {
            throw new RuntimeException("导入失败：commonDatasource." + fieldName + " 格式不正确");
        }
        byte[] decrypted = decryptImportSecretPayload(payload, secretPassphrase, fieldName);
        try {
            return JSON.parseArray(new String(decrypted, StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException("导入失败：解析 " + fieldName + " 失败（" + e.getMessage() + "）", e);
        }
    }

    private byte[] decryptImportSecretPayload(String payload, String secretPassphrase, String fieldName) {
        try {
            return ManifestSecretCodecUtil.decryptWithPassphraseV1(payload, secretPassphrase);
        } catch (ManifestSecretCodecUtil.ManifestSecretCodecException e) {
            if (e.getErrorCode() == ManifestSecretCodecUtil.ErrorCode.AES_DECRYPT) {
                throw new RuntimeException("请求参数错误：导入口令错误", e);
            }
            throw new RuntimeException("导入失败：解密 " + fieldName + " 失败（" + e.getMessage() + "）", e);
        }
    }

    private Map<String, Long> importCommonApis(JSONArray commonApis) {
        Map<String, Long> mapping = new HashMap<>();
        User user = requireCurrentUser();
        if (commonApis == null) {
            return mapping;
        }
        for (int i = 0; i < commonApis.size(); i++) {
            JSONObject item = commonApis.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String originId = normalizeText(item.getString("originId"));
            if (StringUtils.isBlank(originId)) {
                continue;
            }
            if (mapping.containsKey(originId)) continue;
            String name = defaultString(item.getString("name"));
            String url = defaultString(item.getString("url"));
            String method = defaultString(item.getString("method"));
            String params = defaultJsonObjectString(item.getString("params"));
            String headers = defaultJsonObjectString(item.getString("headers"));

            CommonApiPO existing = commonApiMapper.selectOne(new LambdaQueryWrapper<CommonApiPO>()
                    .eq(CommonApiPO::getUserId, user.getId())
                    .eq(CommonApiPO::getUrl, url)
                    .eq(CommonApiPO::getMethod, method)
                    .eq(CommonApiPO::getParams, params)
                    .eq(CommonApiPO::getHeaders, headers)
                    .last("limit 1"));
            if (existing == null) {
                CommonApiPO po = new CommonApiPO();
                po.setName(name);
                po.setUrl(url);
                po.setMethod(method);
                po.setParams(params);
                po.setHeaders(headers);
                po.setUserId(user.getId());
                if (commonApiMapper.insert(po) <= 0 || po.getId() == null)
                    throw new IllegalStateException("导入公共 API 记录失败: " + name);
                existing = po;
            }
            mapping.put(originId, existing.getId());
        }
        return mapping;
    }

    private Map<String, Long> importCommonDatabases(JSONArray databases) {
        Map<String, Long> mapping = new HashMap<>();
        User user = requireCurrentUser();
        if (databases == null) {
            return mapping;
        }
        for (int i = 0; i < databases.size(); i++) {
            JSONObject item = databases.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String originId = normalizeText(item.getString("originId"));
            if (StringUtils.isBlank(originId)) {
                continue;
            }
            if (mapping.containsKey(originId)) continue;
            String type = defaultString(item.getString("type"));
            String ip = defaultString(item.getString("ip"));
            String port = defaultString(item.getString("port"));
            String databaseName = defaultString(item.getString("databaseName"));
            String username = defaultString(item.getString("username"));
            String password = defaultString(item.getString("password"));
            String url = defaultString(item.getString("url"));
            boolean allowSqlScript = defaultBoolean(item.get("allowSqlScript"));
            String des = defaultString(item.getString("des"));
            String name = StringUtils.defaultIfBlank(item.getString("name"), databaseName);
            DataBaseEnum databaseType = resolveImportedDatabaseType(type);

            CommonDatabasePO existing = datasourceMapper.selectOne(new LambdaQueryWrapper<CommonDatabasePO>()
                    .eq(CommonDatabasePO::getUserId, user.getId())
                    .eq(CommonDatabasePO::getType, databaseType)
                    .eq(CommonDatabasePO::getIp, ip)
                    .eq(CommonDatabasePO::getPort, port)
                    .eq(CommonDatabasePO::getDatabaseName, databaseName)
                    .eq(CommonDatabasePO::getUsername, username)
                    .eq(CommonDatabasePO::getPassword, password)
                    .eq(CommonDatabasePO::getUrl, url)
                    .eq(CommonDatabasePO::getAllowSqlScript, allowSqlScript)
                    .last("limit 1"));
            if (existing == null) {
                CommonDatabasePO po = new CommonDatabasePO();
                po.setName(name);
                po.setIp(ip);
                po.setPort(port);
                po.setDatabaseName(databaseName);
                po.setUsername(username);
                po.setPassword(password);
                po.setUrl(url);
                po.setAllowSqlScript(allowSqlScript);
                po.setDes(des);
                po.setType(databaseType);
                po.setUserId(user.getId());
                if (datasourceMapper.insert(po) <= 0 || po.getId() == null)
                    throw new IllegalStateException("导入数据库配置记录失败: " + name);
                existing = po;
            }
            mapping.put(originId, existing.getId());
        }
        return mapping;
    }

    private static DataBaseEnum resolveImportedDatabaseType(String type) {
        String normalized = normalizeText(type);
        if (StringUtils.isBlank(normalized)) return null;
        // TODO(legacy-compat): Review Desktop database aliases when cross-product package import no longer needs them; retain current enum names.
        if ("PostgreSQL".equalsIgnoreCase(normalized)) return DataBaseEnum.PostgresSQL;
        if ("MSSQL".equalsIgnoreCase(normalized)) return DataBaseEnum.SQLServer;
        for (DataBaseEnum candidate : DataBaseEnum.values()) {
            if (candidate.name().equalsIgnoreCase(normalized)) return candidate;
        }
        throw new IllegalArgumentException("不支持的数据库类型: " + normalized);
    }

    private void importFonts(ZipFile zipFile, JSONArray fonts, ImportedAssetContext assetContext, ImportSizeGuard importSizeGuard, ImportWriteContext importWriteContext) throws IOException {
        if (fonts == null) {
            return;
        }
        for (int i = 0; i < fonts.size(); i++) {
            JSONObject item = fonts.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String blob = normalizeZipPath(item.getString("blob"));
            if (StringUtils.isBlank(blob)) {
                continue;
            }
            String fileName = extractFileName(blob);
            if (StringUtils.isBlank(fileName)) {
                continue;
            }
            assertAllowedImportFileType(fileName, FONT_IMPORT_FILE_TYPES, "字体文件");
            String storedFileName = writeZipEntryToUniqueFile(zipFile, blob, Path.of(AppBaseConfig.getFontPath()), fileName, importSizeGuard, importWriteContext);
            FontPO po = new FontPO();
            po.setUrl(storedFileName);
            String name = StringUtils.defaultIfBlank(item.getString("name"), fileName);
            ImportedFont imported = registerImportedFont(name, storedFileName, assetContext);
            if (!imported.reused()) {
                po.setName(imported.name());
                createImportedFont(po);
            }
        }
    }

    private record ImportedFont(String name, Path file, boolean reused) {}

    private void createImportedFont(FontPO font) {
        if (fontService.createFont(font) == null) {
            throw new IllegalStateException("导入字体记录失败: " + font.getName());
        }
    }

    private ImportedFont registerImportedFont(String name, String storedFileName, ImportedAssetContext assetContext) throws IOException {
        Path root = Path.of(AppBaseConfig.getFontPath()).toAbsolutePath().normalize();
        Path incoming = root.resolve(storedFileName).normalize();
        String key = name.toLowerCase(Locale.ROOT);
        ImportedFont previous = assetContext.importedFonts.get(key);
        if (previous != null) {
            if (Files.mismatch(previous.file(), incoming) != -1) {
                throw new IllegalArgumentException("导入包中有内容不同的同名字体: " + name);
            }
            Files.deleteIfExists(incoming);
            return new ImportedFont(previous.name(), previous.file(), true);
        }

        List<FontPO> existing = fontService.getFontsByNames(List.of(name));
        if (existing == null) existing = List.of();
        Path sameFile = findIdenticalFontFile(root, existing, incoming);
        if (sameFile != null) {
            Files.deleteIfExists(incoming);
            ImportedFont result = new ImportedFont(name, sameFile, true);
            assetContext.importedFonts.put(key, result);
            return result;
        }

        String targetName = name;
        if (!existing.isEmpty()) {
            List<FontDTO> available = fontService.getAllFont();
            Set<String> checkedAliases = new HashSet<>();
            if (available != null) for (FontDTO candidate : available) {
                String alias = candidate == null ? null : candidate.getName();
                if (alias == null || !alias.matches("DV_[0-9a-f]{32}") || !checkedAliases.add(alias)) continue;
                List<FontPO> aliases = fontService.getFontsByNames(List.of(alias));
                Path existingFile = findIdenticalFontFile(root, aliases, incoming);
                if (existingFile != null) {
                    Files.deleteIfExists(incoming);
                    assetContext.fontAliases.put(key, alias);
                    ImportedFont result = new ImportedFont(alias, existingFile, true);
                    assetContext.importedFonts.put(key, result);
                    return result;
                }
            }
            do {
                targetName = "DV_" + UUID.randomUUID().toString().replace("-", "");
                List<FontPO> collision = fontService.getFontsByNames(List.of(targetName));
                if (collision == null || collision.isEmpty()) break;
            } while (true);
            assetContext.fontAliases.put(key, targetName);
        }
        ImportedFont result = new ImportedFont(targetName, incoming, false);
        assetContext.importedFonts.put(key, result);
        return result;
    }

    private Path findIdenticalFontFile(Path root, List<FontPO> fonts, Path incoming) throws IOException {
        if (fonts == null || fonts.isEmpty()) return null;
        Path sameFile = null;
        for (FontPO row : fonts) {
            String url = row == null ? null : row.getUrl();
            if (StringUtils.isBlank(url)) return null;
            Path path = root.resolve(url).normalize();
            if (!path.startsWith(root) || !Files.isRegularFile(path, java.nio.file.LinkOption.NOFOLLOW_LINKS)
                    || Files.mismatch(path, incoming) != -1) return null;
            sameFile = path;
        }
        return sameFile;
    }

    private void importComponents(ZipFile zipFile, JSONArray components, ImportedAssetContext assetContext, ImportSizeGuard importSizeGuard, ImportWriteContext importWriteContext) throws IOException {
        if (components == null) {
            return;
        }
        for (int i = 0; i < components.size(); i++) {
            JSONObject item = components.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String blob = normalizeZipPath(item.getString("blob"));
            if (StringUtils.isBlank(blob)) {
                continue;
            }
            String fileName = extractFileName(blob);
            if (StringUtils.isBlank(fileName)) {
                continue;
            }
            assertAllowedImportFileType(fileName, COMPONENT_IMPORT_FILE_TYPES, "组件文件");
            if (isZipFileName(fileName)) {
                importComponentPackage(zipFile, item, blob, fileName, assetContext, importSizeGuard, importWriteContext);
                continue;
            }
            String storedFileName = writeZipEntryToUniqueFile(zipFile, blob, Path.of(AppBaseConfig.getRemoteComponentPath()), fileName, importSizeGuard, importWriteContext);
            // TODO(legacy-compat): Remove legacy component conversion when support for old components ends.
            convertImportedComponent(Path.of(AppBaseConfig.getRemoteComponentPath(), storedFileName),
                    StringUtils.defaultIfBlank(item.getString("name"), fileName), fileName);
            RemoteComponentPO po = new RemoteComponentPO();
            po.setUrl(storedFileName);
            po.setComponentName(StringUtils.defaultIfBlank(item.getString("name"), fileName));
            createImportedComponent(po);
            assetContext.registerComponent(item.getString("original"), fileName, storedFileName);
        }
    }

    private void importComponentPackage(ZipFile zipFile,
                                        JSONObject item,
                                        String blob,
                                        String fileName,
                                        ImportedAssetContext assetContext,
                                        ImportSizeGuard importSizeGuard,
                                        ImportWriteContext importWriteContext) throws IOException {
        Path packageZip = writeZipEntryToTempFile(zipFile, blob, ".zip", importSizeGuard);
        try {
            String entry;
            try {
                entry = scanComponentPackageEntry(packageZip, componentEntryHint(item.getString("original")));
            } catch (IllegalArgumentException error) {
                throw new ProjectComponentConversionException(StringUtils.defaultIfBlank(item.getString("name"), fileName), error);
            } catch (java.util.zip.ZipException error) {
                throw new ProjectComponentConversionException(StringUtils.defaultIfBlank(item.getString("name"), fileName),
                        new IllegalArgumentException("组件压缩包格式无效", error));
            }
            String packageId = reserveImportedComponentPackageId(fileStem(fileName));
            Path root = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
            Path tempDir = root.resolve(".import-" + packageId).normalize();
            Path finalDir = root.resolve(packageId).normalize();
            if (!tempDir.startsWith(root) || !finalDir.startsWith(root)) {
                throw new RuntimeException("组件包路径不合法");
            }
            try {
                Files.createDirectories(root);
                Files.createDirectories(tempDir);
                extractComponentPackage(packageZip, tempDir, importSizeGuard);
                try (var paths = Files.walk(tempDir)) {
                    var files = paths.filter(Files::isRegularFile).toList();
                    boolean legacyComponent = false;
                    for (Path path : files) {
                        String extension = safeFileExtension(path.getFileName().toString());
                        if (extension.equals(".js") || extension.equals(".mjs")) {
                            // TODO(legacy-compat): Remove component and CSS conversion when support for old components ends.
                            legacyComponent |= convertImportedComponent(path, StringUtils.defaultIfBlank(item.getString("name"), fileName),
                                    fileName + "/" + tempDir.relativize(path));
                        }
                    }
                    if (legacyComponent) {
                        for (Path path : files) {
                            if (safeFileExtension(path.getFileName().toString()).equals(".css")) {
                                // TODO(legacy-compat): Remove legacy CSS conversion when support for old component styles ends.
                                convertImportedComponentStyles(path, StringUtils.defaultIfBlank(item.getString("name"), fileName),
                                        fileName + "/" + tempDir.relativize(path));
                            }
                        }
                    }
                }
                moveDirectory(tempDir, finalDir);
                importWriteContext.recordDirectory(finalDir);
            } catch (IOException | RuntimeException e) {
                deleteDirectoryQuietly(tempDir);
                deleteDirectoryQuietly(finalDir);
                throw e;
            }

            String storedUrl = normalizePath(packageId + "/" + entry);
            RemoteComponentPO po = new RemoteComponentPO();
            po.setUrl(storedUrl);
            po.setComponentName(StringUtils.defaultIfBlank(item.getString("name"), extractFileName(entry)));
            createImportedComponent(po);
            assetContext.registerComponent(item.getString("original"), fileName, storedUrl);
        } finally {
            Files.deleteIfExists(packageZip);
        }
    }

    private boolean convertImportedComponent(Path path, String componentName, String fileName) throws IOException {
        try {
            return LegacyComponentImportGuard.validate(path, fileName);
        } catch (IllegalArgumentException error) {
            throw new ProjectComponentConversionException(componentName, error);
        }
    }

    private void convertImportedComponentStyles(Path path, String componentName, String fileName) throws IOException {
        try {
            LegacyComponentImportGuard.validateLegacyStyles(path, fileName);
        } catch (IllegalArgumentException error) {
            throw new ProjectComponentConversionException(componentName, error);
        }
    }

    private void importImages(ZipFile zipFile, JSONArray images, ImportedAssetContext assetContext, ImportSizeGuard importSizeGuard, ImportWriteContext importWriteContext) throws IOException {
        if (images == null) {
            return;
        }
        for (int i = 0; i < images.size(); i++) {
            JSONObject item = images.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String blob = normalizeZipPath(item.getString("blob"));
            if (StringUtils.isBlank(blob)) {
                continue;
            }
            String fileName = extractFileName(blob);
            if (StringUtils.isBlank(fileName)) {
                continue;
            }
            assertAllowedImportFileType(fileName, AppBaseConfig.ALLOW_IMAGE_TYPE, "图片文件");
            String storedFileName = writeZipEntryToUniqueFile(zipFile, blob, Path.of(AppBaseConfig.getImagePath()), fileName, importSizeGuard, importWriteContext);
            ImagePO po = new ImagePO();
            po.setUrl(storedFileName);
            po.setName(StringUtils.defaultIfBlank(item.getString("name"), fileName));
            createImportedImage(po);
            assetContext.registerImage(item.getString("original"), fileName, storedFileName);
        }
    }

    private void importVideos(ZipFile zipFile, JSONArray videos, ImportedAssetContext assetContext, ImportSizeGuard importSizeGuard, ImportWriteContext importWriteContext) throws IOException {
        if (videos == null) {
            return;
        }
        User user = requireCurrentUser();
        for (int i = 0; i < videos.size(); i++) {
            JSONObject item = videos.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String blob = normalizeZipPath(item.getString("blob"));
            if (StringUtils.isBlank(blob)) {
                continue;
            }
            String fileName = extractFileName(blob);
            if (StringUtils.isBlank(fileName)) {
                continue;
            }
            assertAllowedImportFileType(fileName, AppBaseConfig.ALLOW_VIDEO_TYPE, "视频文件");
            String storedFileName = writeZipEntryToUniqueFile(zipFile, blob, Path.of(AppBaseConfig.getVideoPath()), fileName, importSizeGuard, importWriteContext);
            VideoPO existing = videoMapper.selectOne(new LambdaQueryWrapper<VideoPO>()
                    .eq(VideoPO::getUserId, user.getId())
                    .eq(VideoPO::getUrl, storedFileName)
                    .last("limit 1"));
            if (existing == null) {
                VideoPO po = new VideoPO();
                po.setUrl(storedFileName);
                po.setName(StringUtils.defaultIfBlank(item.getString("name"), fileName));
                po.setUserId(user.getId());
                if (videoMapper.insert(po) <= 0)
                    throw new IllegalStateException("导入视频记录失败: " + po.getName());
            }
            assetContext.registerVideo(item.getString("original"), fileName, storedFileName);
        }
    }

    private void importModels(ZipFile zipFile, JSONArray models, ImportedAssetContext assetContext, ImportSizeGuard importSizeGuard, ImportWriteContext importWriteContext) throws IOException {
        if (models == null) {
            return;
        }
        User user = requireCurrentUser();
        for (int i = 0; i < models.size(); i++) {
            JSONObject model = models.getJSONObject(i);
            if (model == null) {
                continue;
            }
            String packageId = normalizeText(model.getString("packageId"));
            String entry = normalizePath(model.getString("entry"));
            JSONArray files = model.getJSONArray("files");
            if (StringUtils.isBlank(packageId) || StringUtils.isBlank(entry) || files == null || files.isEmpty()) {
                continue;
            }
            Path modelBaseRoot = Path.of(AppBaseConfig.getModelPath()).toAbsolutePath().normalize();
            String storedPackageId = createImportedDirectoryName("model");
            assertSafeRelativePath(entry, "模型入口路径不合法");
            assertAllowedImportFileType(entry, MODEL_ENTRY_FILE_TYPES, "模型入口文件");
            Path modelRoot = modelBaseRoot.resolve(storedPackageId).normalize();
            if (!modelRoot.startsWith(modelBaseRoot)) {
                throw new RuntimeException("模型路径不合法");
            }
            Files.createDirectories(modelRoot);
            importWriteContext.recordDirectory(modelRoot);

            long totalSize = 0L;
            for (int j = 0; j < files.size(); j++) {
                JSONObject file = files.getJSONObject(j);
                if (file == null) {
                    continue;
                }
                String relPath = normalizePath(file.getString("path"));
                String blob = normalizeZipPath(file.getString("blob"));
                if (StringUtils.isBlank(relPath) || StringUtils.isBlank(blob)) {
                    continue;
                }
                assertAllowedImportFileType(relPath, MODEL_PACKAGE_FILE_TYPES, "模型资源文件");
                Path target = resolveImportTarget(modelRoot, relPath, "模型路径不合法");
                Files.createDirectories(target.getParent());
                totalSize += writeZipEntryToFile(zipFile, blob, target, importSizeGuard, importWriteContext);
            }

            String storedUrl = normalizePath(storedPackageId + "/" + entry);
            ThreeDModelPO existing = threeDModelMapper.selectOne(new LambdaQueryWrapper<ThreeDModelPO>()
                    .eq(ThreeDModelPO::getUserId, user.getId())
                    .eq(ThreeDModelPO::getUrl, storedUrl)
                    .last("limit 1"));
            if (existing == null) {
                ThreeDModelPO po = new ThreeDModelPO();
                po.setName(StringUtils.defaultIfBlank(model.getString("name"), entry));
                po.setUrl(storedUrl);
                po.setUserId(user.getId());
                po.setIsCompressed(files.size() > 1 ? 1 : 0);
                po.setSize(totalSize);
                if (threeDModelMapper.insert(po) <= 0)
                    throw new IllegalStateException("导入模型记录失败: " + po.getName());
            }
            assetContext.registerModel(model.getString("original"), storedPackageId, entry);
        }
    }

    private void importDynamicScripts(
            ZipFile zipFile,
            JSONArray scripts,
            Long targetProjectId,
            Map<String, Long> projectIdMap,
            ImportSizeGuard importSizeGuard,
            ImportWriteContext importWriteContext
    ) throws IOException {
        if (scripts == null) {
            return;
        }
        User user = requireCurrentUser();
        for (int i = 0; i < scripts.size(); i++) {
            JSONObject item = scripts.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String type = defaultString(item.getString("type")).toUpperCase(Locale.ROOT);
            String scope = defaultString(item.getString("scope")).toUpperCase(Locale.ROOT);
            Long ownerProjectId = null;
            if ("PROJECT".equals(scope)) {
                String sourceProjectId = normalizeText(item.getString("ownerSourceProjectId"));
                if (projectIdMap != null && StringUtils.isNotBlank(sourceProjectId)) {
                    ownerProjectId = projectIdMap.get(sourceProjectId);
                    if (ownerProjectId == null) throw new IllegalArgumentException("项目脚本所属项目不存在: " + sourceProjectId);
                } else {
                    // TODO(legacy-compat): Review missing script-owner fallback if packages without ownerSourceProjectId stop being supported.
                    ownerProjectId = targetProjectId;
                }
            }

            if ("REMOTE".equals(type) || StringUtils.startsWithIgnoreCase(item.getString("url"), "http")) {
                String remoteUrl = defaultString(item.getString("url"));
                String scriptName = StringUtils.defaultIfBlank(item.getString("name"), remoteUrl);
                DynamicScriptPO existing;
                if (ownerProjectId == null) {
                    existing = findReusableGlobalRemoteScript(scriptName, remoteUrl);
                } else {
                    existing = dynamicScriptMapper.selectOne(new LambdaQueryWrapper<DynamicScriptPO>()
                            .eq(DynamicScriptPO::getUserId, user.getId())
                            .eq(DynamicScriptPO::getProjectId, ownerProjectId)
                            .eq(DynamicScriptPO::getType, ScriptEnum.REMOTE)
                            .eq(DynamicScriptPO::getUrl, remoteUrl)
                            .last("limit 1"));
                }
                if (existing == null) {
                    DynamicScriptPO po = new DynamicScriptPO();
                    po.setName(scriptName);
                    po.setUrl(remoteUrl);
                    po.setType(ScriptEnum.REMOTE);
                    po.setProjectId(ownerProjectId);
                    createDynamicScript(po);
                }
                continue;
            }

            String blob = normalizeZipPath(item.getString("blob"));
            if (StringUtils.isBlank(blob)) {
                continue;
            }
            String fileName = extractFileName(blob);
            if (StringUtils.isBlank(fileName)) {
                continue;
            }
            assertAllowedImportFileType(fileName, JAVASCRIPT_IMPORT_FILE_TYPES, "动态脚本文件");
            String storedFileName = writeZipEntryToUniqueFile(zipFile, blob, Path.of(AppBaseConfig.getDynamicScriptPath()), fileName, importSizeGuard, importWriteContext);
            String scriptName = StringUtils.defaultIfBlank(item.getString("name"), fileName);
            if (ownerProjectId == null) {
                DynamicScriptPO existing = findReusableGlobalScript(scriptName, storedFileName);
                if (existing != null) {
                    Files.deleteIfExists(resolveStoredDynamicScript(storedFileName));
                    continue;
                }
            }
            DynamicScriptPO existing = dynamicScriptMapper.selectOne(new LambdaQueryWrapper<DynamicScriptPO>()
                    .eq(DynamicScriptPO::getUserId, user.getId())
                    .eq(DynamicScriptPO::getProjectId, ownerProjectId)
                    .eq(DynamicScriptPO::getType, ScriptEnum.LOCAL)
                    .eq(DynamicScriptPO::getUrl, storedFileName)
                    .last("limit 1"));
            if (existing == null) {
                DynamicScriptPO po = new DynamicScriptPO();
                po.setName(scriptName);
                po.setUrl(storedFileName);
                po.setType(ScriptEnum.LOCAL);
                po.setProjectId(ownerProjectId);
                createDynamicScript(po);
            }
        }
    }

    private DynamicScriptPO findReusableGlobalRemoteScript(String scriptName, String remoteUrl) {
        User user = requireCurrentUser();
        lockGlobalScriptImportsForUser(user.getId());
        List<DynamicScriptPO> candidates = dynamicScriptMapper.selectList(new LambdaQueryWrapper<DynamicScriptPO>()
                .eq(DynamicScriptPO::getUserId, user.getId())
                .isNull(DynamicScriptPO::getProjectId)
                .eq(DynamicScriptPO::getType, ScriptEnum.REMOTE)
                .eq(DynamicScriptPO::getDeleted, 0)
                .eq(DynamicScriptPO::getName, scriptName)
                .eq(DynamicScriptPO::getUrl, remoteUrl)
                .last("FOR UPDATE"));
        if (candidates == null) return null;
        for (DynamicScriptPO candidate : candidates) {
            if (candidate != null
                    && Objects.equals(candidate.getUserId(), user.getId())
                    && candidate.getProjectId() == null
                    && candidate.getType() == ScriptEnum.REMOTE
                    && Objects.equals(candidate.getName(), scriptName)
                    && Objects.equals(candidate.getUrl(), remoteUrl)
                    && (candidate.getDeleted() == null || candidate.getDeleted() == 0)) return candidate;
        }
        return null;
    }

    private DynamicScriptPO findReusableGlobalScript(String scriptName, String importedFileName) throws IOException {
        User user = requireCurrentUser();
        lockGlobalScriptImportsForUser(user.getId());
        Path importedPath = resolveStoredDynamicScript(importedFileName);
        String importedHash = sha256ScriptFile(importedPath);
        List<DynamicScriptPO> candidates = dynamicScriptMapper.selectList(new LambdaQueryWrapper<DynamicScriptPO>()
                .eq(DynamicScriptPO::getUserId, user.getId())
                .isNull(DynamicScriptPO::getProjectId)
                .eq(DynamicScriptPO::getType, ScriptEnum.LOCAL)
                .eq(DynamicScriptPO::getDeleted, 0)
                .eq(DynamicScriptPO::getName, scriptName)
                .last("FOR UPDATE"));
        if (candidates == null) return null;
        for (DynamicScriptPO candidate : candidates) {
            if (candidate == null
                    || !Objects.equals(candidate.getUserId(), user.getId())
                    || candidate.getProjectId() != null
                    || candidate.getType() != ScriptEnum.LOCAL
                    || !Objects.equals(candidate.getName(), scriptName)
                    || (candidate.getDeleted() != null && candidate.getDeleted() != 0)) continue;
            Path candidatePath;
            try {
                candidatePath = resolveStoredDynamicScript(candidate.getUrl());
                if (!Files.isRegularFile(candidatePath, LinkOption.NOFOLLOW_LINKS)
                        || Files.size(candidatePath) > MAX_IMPORT_FILE_BYTES) continue;
                if (Objects.equals(importedHash, sha256ScriptFile(candidatePath))) return candidate;
            } catch (IOException | IllegalArgumentException ignored) {
                // A missing, unreadable, or invalid legacy path is not a reusable asset.
            }
        }
        return null;
    }

    private void lockGlobalScriptImportsForUser(Long userId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            log.warn("Global script import reuse has no transaction; user-level database lock is skipped for userId:{}", userId);
            return;
        }
        UserPO lockedUser = userMapper.selectOne(new LambdaQueryWrapper<UserPO>()
                .select(UserPO::getId)
                .eq(UserPO::getId, userId)
                .eq(UserPO::getDeleted, 0)
                .last("FOR UPDATE"));
        if (lockedUser == null) throw new AppException(AppStatusCode.UNAUTHORIZED);
    }

    private Path resolveStoredDynamicScript(String storedFileName) throws IOException {
        if (StringUtils.isBlank(storedFileName)) throw new IllegalArgumentException("动态脚本路径为空");
        Path root = Path.of(AppBaseConfig.getDynamicScriptPath()).toAbsolutePath().normalize();
        Path relative = Path.of(storedFileName);
        if (relative.isAbsolute()) throw new IllegalArgumentException("动态脚本路径不合法");
        Path target = root.resolve(relative).normalize();
        if (!target.startsWith(root) || target.equals(root) || target.getFileName() == null)
            throw new IllegalArgumentException("动态脚本路径不合法");

        Path realRoot = root.toRealPath();
        Path realParent = target.getParent().toRealPath();
        if (!realParent.startsWith(realRoot)) throw new IllegalArgumentException("动态脚本路径不合法");
        Path resolved = realParent.resolve(target.getFileName()).normalize();
        if (!resolved.startsWith(realRoot) || Files.isSymbolicLink(resolved))
            throw new IllegalArgumentException("动态脚本路径不合法");
        return resolved;
    }

    private String sha256ScriptFile(Path file) throws IOException {
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > MAX_IMPORT_FILE_BYTES)
            throw new IOException("动态脚本文件不存在或超过大小限制");
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
        long total = 0;
        try (InputStream input = Files.newInputStream(file)) {
            byte[] buffer = new byte[IMPORT_COPY_BUFFER_SIZE];
            for (int read; (read = input.read(buffer)) != -1;) {
                if (total > MAX_IMPORT_FILE_BYTES - read) throw new IOException("动态脚本文件超过大小限制");
                total += read;
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private List<ImportedProjectNode> readManifestProjectNodes(ZipFile zipFile, JSONArray projectArray, ImportSizeGuard importSizeGuard) throws IOException {
        List<ImportedProjectNode> nodes = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();
        for (int i = 0; i < projectArray.size(); i++) {
            JSONObject item = projectArray.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String sourceProjectId = normalizeText(item.getString("sourceProjectId"));
            if (StringUtils.isBlank(sourceProjectId) || !seenIds.add(sourceProjectId)) {
                throw new RuntimeException("导出包 projects 节点不合法");
            }
            String dataPath = normalizeZipPath(item.getString("dataPath"));
            if (StringUtils.isBlank(dataPath)) {
                throw new RuntimeException("导出包缺少 projects[].dataPath");
            }
            nodes.add(new ImportedProjectNode(
                    sourceProjectId,
                    StringUtils.defaultIfBlank(item.getString("name"), sourceProjectId),
                    normalizeText(item.getString("sourcePid")),
                    item.getBooleanValue("isEntry"),
                    decodeImportedProjectData(readZipText(zipFile, dataPath, importSizeGuard), importSizeGuard)
            ));
        }
        return nodes;
    }

    private Map<String, Long> buildImportProjectIdMap(Long targetProjectId, List<ImportedProjectNode> projectNodes) {
        ImportedProjectNode entryNode = validateImportProjectGraph(projectNodes);

        Map<String, ImportedProjectNode> nodeMap = new HashMap<>();
        for (ImportedProjectNode node : projectNodes) {
            nodeMap.put(node.sourceProjectId, node);
        }

        Map<String, Long> projectIdMap = new HashMap<>();
        projectIdMap.put(entryNode.sourceProjectId, targetProjectId);

        Set<String> remaining = new LinkedHashSet<>(nodeMap.keySet());
        remaining.remove(entryNode.sourceProjectId);

        while (!remaining.isEmpty()) {
            boolean progress = false;
            for (String sourceProjectId : new ArrayList<>(remaining)) {
                ImportedProjectNode node = nodeMap.get(sourceProjectId);
                Long parentProjectId = null;
                if (StringUtils.isNotBlank(node.sourcePid)) {
                    parentProjectId = projectIdMap.get(node.sourcePid);
                    if (parentProjectId == null) {
                        continue;
                    }
                }
                ProjectPO subProject = new ProjectPO();
                subProject.setName(node.name);
                subProject.setPid(parentProjectId);
                subProject.setDataJson("{}");
                subProject.setCover("");
                subProject.setDes("");
                subProject.setUserId(requireCurrentUser().getId());
                if (projectMapper.insert(subProject) <= 0 || subProject.getId() == null)
                    throw new IllegalStateException("导入子项目记录失败: " + node.name);
                projectIdMap.put(sourceProjectId, subProject.getId());
                remaining.remove(sourceProjectId);
                progress = true;
            }
            if (!progress) {
                throw new RuntimeException("项目结构不完整，无法恢复子项目");
            }
        }

        updateProjectPid(targetProjectId, StringUtils.isBlank(entryNode.sourcePid) ? null : projectIdMap.get(entryNode.sourcePid));
        return projectIdMap;
    }

    private ImportedProjectNode validateImportProjectGraph(List<ImportedProjectNode> projectNodes) {
        if (projectNodes == null || projectNodes.isEmpty()) {
            throw new RuntimeException("导出包缺少项目节点");
        }

        ImportedProjectNode entryNode = null;
        Map<String, ImportedProjectNode> nodeMap = new HashMap<>();
        for (ImportedProjectNode node : projectNodes) {
            nodeMap.put(node.sourceProjectId, node);
            if (node.isEntry) {
                if (entryNode != null) {
                    throw new RuntimeException("导出包 projects 只能包含一个入口项目节点");
                }
                entryNode = node;
            }
        }
        if (entryNode == null) {
            throw new RuntimeException("导出包缺少入口项目节点");
        }

        for (ImportedProjectNode node : projectNodes) {
            if (StringUtils.isBlank(node.sourcePid)) {
                continue;
            }
            if (Objects.equals(node.sourceProjectId, node.sourcePid)) {
                throw new RuntimeException("项目结构存在循环，无法恢复子项目");
            }
            if (!nodeMap.containsKey(node.sourcePid)) {
                throw new RuntimeException("项目结构不完整，无法恢复子项目");
            }
        }

        Set<String> visited = new HashSet<>();
        Set<String> visiting = new HashSet<>();
        for (ImportedProjectNode node : projectNodes) {
            validateImportProjectParentChain(node.sourceProjectId, nodeMap, visiting, visited);
        }
        return entryNode;
    }

    private void validateImportProjectParentChain(
            String sourceProjectId,
            Map<String, ImportedProjectNode> nodeMap,
            Set<String> visiting,
            Set<String> visited
    ) {
        if (visited.contains(sourceProjectId)) {
            return;
        }
        if (!visiting.add(sourceProjectId)) {
            throw new RuntimeException("项目结构存在循环，无法恢复子项目");
        }

        ImportedProjectNode node = nodeMap.get(sourceProjectId);
        if (node == null) {
            throw new RuntimeException("项目结构不完整，无法恢复子项目");
        }
        if (StringUtils.isNotBlank(node.sourcePid)) {
            validateImportProjectParentChain(node.sourcePid, nodeMap, visiting, visited);
        }

        visiting.remove(sourceProjectId);
        visited.add(sourceProjectId);
    }

    private void rewriteAndPersistProjectGraphJson(
            List<ImportedProjectNode> projectNodes,
            ImportedDatasourceContext datasourceContext,
            ImportedAssetContext assetContext,
            Map<String, Long> projectIdMap
    ) {
        for (ImportedProjectNode node : projectNodes) {
            Long targetProjectId = projectIdMap.get(node.sourceProjectId);
            if (targetProjectId == null) {
                throw new RuntimeException("缺少项目映射: " + node.sourceProjectId);
            }
            String rewrittenJson = rewriteImportedProjectJson(node.projectJson, datasourceContext, assetContext, projectIdMap, targetProjectId);
            updateProjectJson(targetProjectId, rewrittenJson);
        }
    }

    private void updateProjectJson(Long projectId, String projectJson) {
        User user = requireCurrentUser();
        LambdaUpdateWrapper<ProjectPO> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(ProjectPO::getId, projectId)
                .eq(ProjectPO::getUserId, user.getId())
                .eq(ProjectPO::getDeleted, 0)
                .set(ProjectPO::getDataJson, projectJson)
                .set(ProjectPO::getUpdateTime, LocalDateTime.now());
        if (projectMapper.update(null, updateWrapper) <= 0) {
            ProjectPO current = getWritableProject(projectId, user.getId());
            if (current == null || !Objects.equals(current.getDataJson(), projectJson))
                throw new IllegalStateException("保存导入项目数据失败");
        }
    }

    private void updateProjectPid(Long projectId, Long pid) {
        User user = requireCurrentUser();
        LambdaUpdateWrapper<ProjectPO> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(ProjectPO::getId, projectId)
                .eq(ProjectPO::getUserId, user.getId())
                .eq(ProjectPO::getDeleted, 0)
                .set(ProjectPO::getPid, pid)
                .set(ProjectPO::getUpdateTime, LocalDateTime.now());
        if (projectMapper.update(null, updateWrapper) <= 0) {
            ProjectPO current = getWritableProject(projectId, user.getId());
            if (current == null || !Objects.equals(current.getPid(), pid))
                throw new IllegalStateException("更新导入项目关系失败");
        }
    }

    private ProjectPO getWritableProject(Long projectId, Long userId) {
        return projectMapper.selectOne(new LambdaQueryWrapper<ProjectPO>()
                .select(ProjectPO::getDataJson, ProjectPO::getPid)
                .eq(ProjectPO::getId, projectId)
                .eq(ProjectPO::getUserId, userId)
                .eq(ProjectPO::getDeleted, 0)
                .last("limit 1"));
    }

    private String rewriteImportedProjectJson(
            String projectJson,
            ImportedDatasourceContext datasourceContext,
            ImportedAssetContext assetContext,
            Map<String, Long> projectIdMap,
            Long targetProjectId
    ) {
        JSONObject root = parseImportedProjectJson(projectJson);
        assetContext.targetProjectId = targetProjectId;
        // TODO(legacy-compat): Remove old project-data normalization when those formats are no longer supported.
        LegacyProjectDataNormalizer.normalize(root);
        rewriteImportedProjectValue(root, new ArrayList<>(), null, datasourceContext, assetContext, projectIdMap);
        return JSON.toJSONString(root);
    }

    private JSONObject parseImportedProjectJson(String projectJson) {
        if (StringUtils.isBlank(projectJson)) throw new IllegalArgumentException("项目数据为空");
        JSONObject root;
        try {
            root = JSON.parseObject(projectJson);
        } catch (com.alibaba.fastjson.JSONException e) {
            throw new IllegalArgumentException("项目数据不是有效的 JSON 对象", e);
        }
        if (root == null) throw new IllegalArgumentException("项目数据不是有效的 JSON 对象");
        return root;
    }

    private String decodeImportedProjectData(String payload, ImportSizeGuard importSizeGuard) {
        if (payload == null || (!payload.startsWith("LCPZ") && !payload.startsWith("DVZ"))) return payload;
        String base64;
        // @deprecated TODO(legacy-compat): Remove the LCPZ branches when old compressed project packages are no longer supported.
        if (payload.startsWith("DVZ1:gzip:")) {
            base64 = payload.substring("DVZ1:gzip:".length());
        } else if (payload.startsWith("LCPZ1:gzip:")) {
            base64 = payload.substring("LCPZ1:gzip:".length());
        } else if (payload.startsWith("LCPZ") && payload.length() >= 6 && payload.charAt(4) == 1 && payload.charAt(5) == 1) {
            base64 = payload.substring(6);
        } else {
            throw new IllegalArgumentException("不支持的旧项目数据压缩格式");
        }
        try {
            byte[] compressed = Base64.getDecoder().decode(base64);
            try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed));
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                copyWithLimit(gzip, output, MAX_IMPORT_TEXT_BYTES, importSizeGuard);
                return output.toString(StandardCharsets.UTF_8);
            }
        } catch (IllegalArgumentException | IOException e) {
            throw new IllegalArgumentException("旧项目数据解压失败", e);
        }
    }

    private void validateImportProjectReferences(List<ImportedProjectNode> nodes) {
        Map<String, Set<String>> references = new LinkedHashMap<>();
        Map<String, Integer> incoming = new HashMap<>();
        for (ImportedProjectNode node : nodes) incoming.put(node.sourceProjectId, 0);
        for (ImportedProjectNode node : nodes) {
            Set<String> targets = new HashSet<>();
            collectImportProjectReferences(parseImportedProjectJson(node.projectJson), targets);
            for (String target : targets) {
                if (!incoming.containsKey(target)) throw new IllegalArgumentException("项目引用缺失: " + target);
                incoming.put(target, incoming.get(target) + 1);
            }
            references.put(node.sourceProjectId, targets);
        }
        ArrayDeque<String> ready = new ArrayDeque<>();
        incoming.forEach((id, count) -> { if (count == 0) ready.add(id); });
        int visited = 0;
        while (!ready.isEmpty()) {
            String id = ready.remove();
            visited++;
            for (String target : references.get(id)) {
                int remaining = incoming.merge(target, -1, Integer::sum);
                if (remaining == 0) ready.add(target);
            }
        }
        if (visited != nodes.size()) throw new IllegalArgumentException("项目大屏引用存在循环");
    }

    private void validateDynamicScriptOwners(JSONArray scripts, List<ImportedProjectNode> nodes) {
        Set<String> projectIds = new HashSet<>();
        for (ImportedProjectNode node : nodes) projectIds.add(node.sourceProjectId);
        for (int i = 0; i < scripts.size(); i++) {
            JSONObject script = scripts.getJSONObject(i);
            if (script == null || !"PROJECT".equalsIgnoreCase(defaultString(script.getString("scope")))) continue;
            String owner = normalizeText(script.getString("ownerSourceProjectId"));
            if (StringUtils.isNotBlank(owner) && !projectIds.contains(owner))
                throw new IllegalArgumentException("项目脚本所属项目不存在: " + owner);
        }
    }

    private void validateDynamicScriptScopes(JSONArray scripts) {
        for (int i = 0; i < scripts.size(); i++) {
            JSONObject script = scripts.getJSONObject(i);
            if (script == null) continue;
            String scope = defaultString(script.getString("scope"));
            if (!scope.isEmpty() && !"PROJECT".equalsIgnoreCase(scope) && !"GLOBAL".equalsIgnoreCase(scope))
                throw new IllegalArgumentException("不支持的脚本作用范围: " + scope);
        }
    }

    private void collectImportProjectReferences(Object value, Set<String> targets) {
        if (value instanceof JSONArray array) {
            for (Object item : array) collectImportProjectReferences(item, targets);
            return;
        }
        if (!(value instanceof JSONObject object)) return;
        JSONObject base = object.getJSONObject("base");
        if (base != null && "ScreenReference".equals(base.getString("type"))) {
            JSONObject style = object.getJSONObject("style");
            String screenId = style == null ? "" : normalizeText(style.getString("screenId"));
            if (StringUtils.isNotBlank(screenId)) targets.add(screenId);
        }
        for (Object child : object.values()) collectImportProjectReferences(child, targets);
    }

    private void rewriteImportedProjectValue(
            Object value,
            List<String> path,
            Object parent,
            ImportedDatasourceContext datasourceContext,
            ImportedAssetContext assetContext,
            Map<String, Long> projectIdMap
    ) {
        if (value instanceof JSONArray array) {
            for (Object item : array) {
                rewriteImportedProjectValue(item, path, array, datasourceContext, assetContext, projectIdMap);
            }
            return;
        }
        if (!(value instanceof JSONObject object)) {
            return;
        }

        // @deprecated TODO(legacy-compat): Remove this repair call when the affected old chart configurations are no longer supported.
        if (!path.isEmpty() && "layerManager".equals(path.get(path.size() - 1))) {
            repairLegacyChartConfigTypes(object);
        }

        if (isComponentDataPath(path)
                || isGlobalVariableTriggerSourcePath(path)
                || isGisDataConfigPath(path, parent)) {
            rewriteCommonApiId(object, datasourceContext.commonApiIdMap, datasourceContext.commonApiRefKeyMap, datasourceContext.writeContext);
            rewriteDatabaseTargetDb(object, datasourceContext.databaseIdMap, datasourceContext.databaseRefKeyMap, datasourceContext.writeContext);
        }

        rewriteScreenReferenceProjectId(object, projectIdMap, datasourceContext.writeContext);
        rewriteImageAssetUrl(object, assetContext);
        rewriteVideoAssetUrl(object, assetContext);
        rewriteModelAssetUrl(object, assetContext);
        if (!path.contains("value") && !path.contains("staticData") && object.get("fontFamily") instanceof String family) {
            // Font conflict resolution is also required by current-format packages.
            object.put("fontFamily", ImportedFontFamilyRewriter.rewrite(family, assetContext.fontAliases));
        }

        for (Map.Entry<String, Object> entry : object.entrySet()) {
            path.add(entry.getKey());
            rewriteImportedProjectValue(entry.getValue(), path, object, datasourceContext, assetContext, projectIdMap);
            path.remove(path.size() - 1);
        }
    }

    /** @deprecated Repairs two known chart-type errors from old Web projects. */
    // TODO(legacy-compat): Remove this repair when the affected old chart configurations are no longer supported.
    @Deprecated(forRemoval = true)
    private void repairLegacyChartConfigTypes(JSONObject layerManager) {
        if (!(layerManager.get("layerConfigs") instanceof JSONObject layers)
                || !(layerManager.get("elemConfigs") instanceof JSONObject configs)) {
            return;
        }
        for (Map.Entry<String, Object> entry : layers.entrySet()) {
            if (!(entry.getValue() instanceof JSONObject layer)
                    || !(configs.get(entry.getKey()) instanceof JSONObject config)
                    || !(config.get("base") instanceof JSONObject base)) {
                continue;
            }
            String layerType = layer.getString("type");
            String configType = base.getString("type");
            if (("AntdGroupRose".equals(layerType) && "AntdBaseRose".equals(configType))
                    || ("AntdWordCloud".equals(layerType) && "AntdBaseWordCloud".equals(configType))) {
                base.put("type", layerType);
            }
        }
    }

    private void rewriteCommonApiId(
            JSONObject dataConfig,
            Map<String, Long> commonApiIdMap,
            Map<String, Long> commonApiRefKeyMap,
            ImportWriteContext writeContext
    ) {
        if (!"commonApi".equals(dataConfig.getString("sourceType"))) {
            return;
        }
        JSONObject commonApi = dataConfig.getJSONObject("commonApi");
        if (commonApi == null) {
            return;
        }
        String refKey = normalizeText(commonApi.getString("refKey"));
        if (StringUtils.isNotBlank(refKey)) {
            Long localId = commonApiRefKeyMap.get(refKey);
            if (localId != null) {
                commonApi.put("commonApiId", localId.toString());
                return;
            }
        }
        String originId = normalizeText(commonApi.getString("commonApiId"));
        Long localId = commonApiIdMap.get(originId);
        if (localId != null) {
            commonApi.put("commonApiId", localId.toString());
        } else if (StringUtils.isNotBlank(originId) || StringUtils.isNotBlank(refKey)) {
            commonApi.put("commonApiId", "");
            commonApi.remove("refKey");
            writeContext.missingCommonApiCount++;
        }
    }

    private void rewriteDatabaseTargetDb(
            JSONObject dataConfig,
            Map<String, Long> databaseIdMap,
            Map<String, Long> databaseRefKeyMap,
            ImportWriteContext writeContext
    ) {
        if (!"database".equals(dataConfig.getString("sourceType"))) {
            return;
        }
        JSONObject database = dataConfig.getJSONObject("database");
        if (database == null) {
            return;
        }
        String refKey = normalizeText(database.getString("refKey"));
        if (StringUtils.isNotBlank(refKey)) {
            Long localId = databaseRefKeyMap.get(refKey);
            if (localId != null) {
                database.put("targetDb", localId.toString());
                return;
            }
        }
        String originId = normalizeText(database.getString("targetDb"));
        Long localId = databaseIdMap.get(originId);
        if (localId != null) {
            database.put("targetDb", localId.toString());
        } else if (StringUtils.isNotBlank(originId) || StringUtils.isNotBlank(refKey)) {
            database.put("targetDb", "");
            database.remove("refKey");
            writeContext.missingDatabaseCount++;
        }
    }

    private void rewriteScreenReferenceProjectId(JSONObject object, Map<String, Long> projectIdMap, ImportWriteContext writeContext) {
        JSONObject base = object.getJSONObject("base");
        if (base == null || !"ScreenReference".equals(base.getString("type"))) {
            return;
        }
        JSONObject style = object.getJSONObject("style");
        if (style == null) {
            return;
        }
        String screenId = normalizeText(style.getString("screenId"));
        if (StringUtils.isBlank(screenId)) {
            return;
        }
        if (projectIdMap == null) {
            style.put("screenId", "");
            writeContext.missingScreenReferenceCount++;
            return;
        }
        Long localProjectId = projectIdMap.get(screenId);
        if (localProjectId == null) throw new IllegalArgumentException("项目引用缺失: " + screenId);
        style.put("screenId", localProjectId.toString());
    }

    private void rewriteImageAssetUrl(JSONObject object, ImportedAssetContext assetContext) {
        JSONObject base = object.getJSONObject("base");
        if (base == null || !"BaseImage".equals(base.getString("type"))) {
            return;
        }
        JSONObject data = object.getJSONObject("data");
        if (data != null && "static".equals(data.getString("sourceType"))) {
            if (data.containsKey("value")) {
                data.put("value", rewriteImageSourceValue(data.get("value"), assetContext, 0, assetLocation(base, "data.value")));
            }
            JSONObject staticData = data.getJSONObject("staticData");
            if (staticData != null && staticData.containsKey("value")) {
                staticData.put("value", rewriteImageSourceValue(staticData.get("value"), assetContext, 0, assetLocation(base, "data.staticData.value")));
            }
        }
        JSONObject style = object.getJSONObject("style");
        if (style == null) {
            return;
        }
        String current = style.getString("localUrl");
        String rewritten = assetContext.resolveImageUrl(current, assetLocation(base, "style.localUrl"));
        if (StringUtils.isNotBlank(rewritten)) {
            style.put("localUrl", rewritten);
        }
        String online = style.getString("onLineUrl");
        String rewrittenOnline = assetContext.resolveImageUrl(online, assetLocation(base, "style.onLineUrl"));
        if (StringUtils.isNotBlank(rewrittenOnline)) {
            style.put("onLineUrl", rewrittenOnline);
        }
    }

    private Object rewriteImageSourceValue(Object value, ImportedAssetContext assetContext, int depth, String location) {
        if (value == null || depth > 2) return value;
        if (value instanceof String url) return assetContext.resolveImageUrl(url, location);
        if (value instanceof JSONObject source) {
            for (String key : List.of("url", "src", "data", "onLineUrl", "localUrl", "value")) {
                if (source.containsKey(key)) {
                    source.put(key, rewriteImageSourceValue(source.get(key), assetContext, depth + 1, location + "." + key));
                }
            }
        }
        return value;
    }

    private void rewriteVideoAssetUrl(JSONObject object, ImportedAssetContext assetContext) {
        JSONObject base = object.getJSONObject("base");
        if (base == null || !"BaseVideo".equals(base.getString("type"))) {
            return;
        }
        JSONObject style = object.getJSONObject("style");
        if (style == null) {
            return;
        }
        String current = style.getString("src");
        String rewritten = assetContext.resolveVideoUrl(current, assetLocation(base, "style.src"));
        if (StringUtils.isNotBlank(rewritten)) {
            style.put("src", rewritten);
        }
        String poster = style.getString("poster");
        String rewrittenPoster = assetContext.resolveImageUrl(poster, assetLocation(base, "style.poster"));
        if (StringUtils.isNotBlank(rewrittenPoster)) {
            style.put("poster", rewrittenPoster);
        }
    }

    private void rewriteModelAssetUrl(JSONObject object, ImportedAssetContext assetContext) {
        JSONObject base = object.getJSONObject("base");
        if (base == null || !"ThreeModel".equals(base.getString("type"))) {
            return;
        }
        JSONObject style = object.getJSONObject("style");
        if (style == null) {
            return;
        }
        JSONObject source = style.getJSONObject("source");
        if (source == null) {
            return;
        }
        String current = source.getString("url");
        String rewritten = assetContext.resolveModelUrl(current, assetLocation(base, "style.source.url"));
        if (StringUtils.isNotBlank(rewritten)) {
            source.put("url", rewritten);
        }
    }

    private String assetLocation(JSONObject base, String field) {
        String type = StringUtils.defaultIfBlank(base.getString("type"), "组件");
        String label = StringUtils.defaultIfBlank(base.getString("name"), base.getString("id"));
        label = StringUtils.defaultString(label).replaceAll("[\\r\\n\\t]", " ");
        if (label.length() > 80) label = label.substring(0, 80) + "…";
        return type + (label.isBlank() ? "" : "（" + label + "）") + "." + field;
    }

    private boolean isComponentDataPath(List<String> path) {
        return !path.isEmpty()
                && "data".equals(path.get(path.size() - 1))
                && path.contains("elemConfigs");
    }

    private boolean isGlobalVariableTriggerSourcePath(List<String> path) {
        return !path.isEmpty()
                && "triggerSource".equals(path.get(path.size() - 1))
                && path.contains("globalVariableManager")
                && path.contains("globalVariables");
    }

    private boolean isGisDataConfigPath(List<String> path, Object parent) {
        if (path.isEmpty()
                || !"dataConfig".equals(path.get(path.size() - 1))
                || !path.contains("elemConfigs")
                || !path.contains("sources")
                || !(parent instanceof JSONObject parentObject)) {
            return false;
        }
        return "geojson".equals(parentObject.getString("sourceType"))
                && "dataConfig".equals(parentObject.getString("dataMode"));
    }

    private String getDepFileName(List<ProjectDependencyItemDTO> items, String url) {
        if (items == null || items.isEmpty() || StringUtils.isBlank(url)) {
            return null;
        }
        return items.stream()
                .filter(item -> item != null && StringUtils.equals(item.getValue(), url))
                .map(ProjectDependencyItemDTO::getName)
                .filter(StringUtils::isNotBlank)
                .findFirst()
                .orElse(null);
    }

    private void createDynamicScript(DynamicScriptPO scriptPO) {
        User user = requireCurrentUser();
        scriptPO.setUserId(user.getId());
        if (dynamicScriptMapper.insert(scriptPO) <= 0)
            throw new IllegalStateException("导入动态脚本记录失败: " + scriptPO.getName());
    }

    private void createImportedImage(ImagePO image) {
        if (imageService.createImage(image) == null)
            throw new IllegalStateException("导入图片记录失败: " + image.getName());
    }

    private void createImportedComponent(RemoteComponentPO component) {
        if (remoteComponentService.createRemoteComponent(component) == null)
            throw new IllegalStateException("导入组件记录失败: " + component.getComponentName());
    }

    private User requireCurrentUser() {
        User user = AppContextUtil.getCurrentUser();
        if (user == null) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
        return user;
    }

    private void requireWritableProject(Long projectId) {
        if (projectId == null) {
            throw new AppException(AppStatusCode.INVALID_PARAM);
        }
        User user = requireCurrentUser();
        Long count = projectMapper.selectCount(new LambdaQueryWrapper<ProjectPO>()
                .eq(ProjectPO::getId, projectId)
                .eq(ProjectPO::getUserId, user.getId())
                .eq(ProjectPO::getDeleted, 0));
        if (count == null || count <= 0) {
            throw new AppException(AppStatusCode.UNAUTHORIZED);
        }
    }

    private List<PreparedExportProjectNode> prepareExportProjectNodes(List<ExportProjectNodeDTO> rawNodes) {
        if (rawNodes == null || rawNodes.isEmpty()) {
            return List.of();
        }

        List<PreparedExportProjectNode> prepared = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();
        int entryCount = 0;

        for (ExportProjectNodeDTO raw : rawNodes) {
            if (raw == null) {
                continue;
            }
            String sourceProjectId = normalizeText(raw.getSourceProjectId());
            if (StringUtils.isBlank(sourceProjectId)) {
                throw new AppException(500, "无法导出项目数据，原因：projects[].sourceProjectId 不能为空");
            }
            if (!seenIds.add(sourceProjectId)) {
                throw new AppException(500, "无法导出项目数据，原因：projects[].sourceProjectId 重复");
            }

            String name = normalizeText(raw.getName());
            if (StringUtils.isBlank(name)) {
                throw new AppException(500, "无法导出项目数据，原因：projects[].name 不能为空");
            }

            String projectJson = ProjectDataCodecUtil.decode(raw.getProjectJson());
            if (StringUtils.isBlank(projectJson)) {
                throw new AppException(500, "无法导出项目数据，原因：projects[].projectJson 不能为空");
            }

            boolean isEntry = Boolean.TRUE.equals(raw.getIsEntry());
            if (isEntry) {
                entryCount++;
            }

            prepared.add(new PreparedExportProjectNode(
                    sourceProjectId,
                    name,
                    normalizeText(raw.getSourcePid()),
                    isEntry,
                    normalizeTextList(raw.getFonts()),
                    normalizeTextList(raw.getImages()),
                    normalizeTextList(raw.getVideos()),
                    normalizeTextList(raw.getModels()),
                    normalizeTextList(raw.getComponents()),
                    normalizeTextList(raw.getCommonApiIds()),
                    normalizeTextList(raw.getDatabaseIds()),
                    "projects/" + safeZipPathSegment(sourceProjectId, "projects[].sourceProjectId") + "/project.json",
                    projectJson
            ));
        }

        if (entryCount > 1) {
            throw new AppException(500, "无法导出项目数据，原因：projects[] 只能有一个入口项目");
        }

        return prepared;
    }

    private boolean shouldUseProjectGraphExport(List<PreparedExportProjectNode> projectNodes) {
        return !projectNodes.isEmpty()
                && (projectNodes.size() > 1
                || projectNodes.stream().anyMatch(node -> StringUtils.isNotBlank(node.sourcePid)));
    }

    private PreparedExportProjectNode resolveEntryNode(List<PreparedExportProjectNode> projectNodes, boolean useProjectGraphExport) {
        if (projectNodes.isEmpty()) {
            return null;
        }
        List<PreparedExportProjectNode> entryNodes = projectNodes.stream()
                .filter(node -> node.isEntry)
                .toList();
        if (entryNodes.isEmpty()) {
            if (useProjectGraphExport) {
                throw new AppException(500, "无法导出项目数据，原因：projects[] 缺少入口项目");
            }
            return projectNodes.get(0);
        }
        return entryNodes.get(0);
    }

    private List<String> normalizeTextList(Collection<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String value : values) {
            String trimmed = normalizeText(value);
            if (StringUtils.isBlank(trimmed) || result.contains(trimmed)) {
                continue;
            }
            result.add(trimmed);
        }
        return result;
    }

    private List<String> mergeProjectValues(
            List<PreparedExportProjectNode> projectNodes,
            List<String> topLevelValues,
            java.util.function.Function<PreparedExportProjectNode, List<String>> extractor
    ) {
        if (projectNodes == null || projectNodes.isEmpty()) {
            return normalizeTextList(topLevelValues);
        }
        List<String> result = new ArrayList<>();
        for (PreparedExportProjectNode node : projectNodes) {
            for (String value : extractor.apply(node)) {
                if (!result.contains(value)) {
                    result.add(value);
                }
            }
        }
        return result;
    }

    private List<Map<String, Object>> exportImages(
            List<String> imageFiles,
            List<String> warnings,
            Map<String, ExportArchiveEntry> archiveEntries,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        if (imageFiles.isEmpty()) {
            return List.of();
        }
        List<ImagePO> imageRows = imageService.getImages(imageFiles);
        Map<String, ImagePO> byUrl = new HashMap<>();
        for (ImagePO row : imageRows) {
            byUrl.put(row.getUrl(), row);
        }
        List<Map<String, Object>> refs = new ArrayList<>();
        for (String file : imageFiles) {
            ImagePO row = byUrl.get(file);
            if (row == null) {
                warnings.add("【图片缺失】" + file);
                continue;
            }
            Path filePath = resolveExportTarget(Path.of(AppBaseConfig.getImagePath()), row.getUrl(), "图片路径不合法");
            if (!Files.exists(filePath)) {
                warnings.add("【图片缺失】" + file);
                continue;
            }
            String blobPath = "blobs/images/" + row.getUrl();
            putFileEntry(archiveEntries, blobPath, filePath, exportSizeGuard);
            refs.add(assetRef(StringUtils.defaultIfBlank(row.getName(), file), file, blobPath));
        }
        return refs;
    }

    private List<Map<String, Object>> exportFonts(
            List<String> fontNames,
            List<String> warnings,
            Map<String, ExportArchiveEntry> archiveEntries,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        if (fontNames.isEmpty()) {
            return List.of();
        }
        List<FontPO> fontRows = fontService.getFontsByNames(fontNames);
        Map<String, FontPO> byName = new HashMap<>();
        for (FontPO row : fontRows) {
            byName.putIfAbsent(row.getName(), row);
        }
        List<Map<String, Object>> refs = new ArrayList<>();
        for (String fontName : fontNames) {
            FontPO row = byName.get(fontName);
            if (row == null) {
                warnings.add("【字体缺失】" + fontName);
                continue;
            }
            Path filePath = resolveExportTarget(Path.of(AppBaseConfig.getFontPath()), row.getUrl(), "字体路径不合法");
            if (!Files.exists(filePath)) {
                warnings.add("【字体缺失】" + fontName);
                continue;
            }
            String blobPath = "blobs/fonts/" + row.getUrl();
            putFileEntry(archiveEntries, blobPath, filePath, exportSizeGuard);
            refs.add(assetRef(fontName, fontName, blobPath));
        }
        return refs;
    }

    private List<Map<String, Object>> exportVideos(
            List<String> videoFiles,
            List<String> warnings,
            Map<String, ExportArchiveEntry> archiveEntries,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        if (videoFiles.isEmpty()) {
            return List.of();
        }
        User user = requireCurrentUser();
        List<VideoPO> videoRows = videoMapper.selectList(new LambdaQueryWrapper<VideoPO>()
                .eq(VideoPO::getUserId, user.getId())
                .in(VideoPO::getUrl, videoFiles));
        Map<String, VideoPO> byUrl = new HashMap<>();
        for (VideoPO row : videoRows) {
            byUrl.put(row.getUrl(), row);
        }
        List<Map<String, Object>> refs = new ArrayList<>();
        for (String file : videoFiles) {
            VideoPO row = byUrl.get(file);
            if (row == null) {
                warnings.add("【视频缺失】" + file);
                continue;
            }
            Path filePath = resolveExportTarget(Path.of(AppBaseConfig.getVideoPath()), row.getUrl(), "视频路径不合法");
            if (!Files.exists(filePath)) {
                warnings.add("【视频缺失】" + file);
                continue;
            }
            String blobPath = "blobs/videos/" + row.getUrl();
            putFileEntry(archiveEntries, blobPath, filePath, exportSizeGuard);
            refs.add(assetRef(StringUtils.defaultIfBlank(row.getName(), file), file, blobPath));
        }
        return refs;
    }

    private List<Map<String, Object>> exportComponents(
            List<String> componentFiles,
            List<String> warnings,
            Map<String, ExportArchiveEntry> archiveEntries,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        if (componentFiles.isEmpty()) {
            return List.of();
        }
        List<RemoteComponentPO> componentRows = remoteComponentService.getRemoteComponents(componentFiles);
        Map<String, RemoteComponentPO> byUrl = new HashMap<>();
        for (RemoteComponentPO row : componentRows) {
            byUrl.put(row.getUrl(), row);
        }
        List<Map<String, Object>> refs = new ArrayList<>();
        for (String file : componentFiles) {
            RemoteComponentPO row = byUrl.get(file);
            if (row == null) {
                warnings.add("【组件缺失】" + file);
                continue;
            }
            Path filePath = resolveExportTarget(Path.of(AppBaseConfig.getRemoteComponentPath()), row.getUrl(), "组件路径不合法");
            if (!Files.exists(filePath)) {
                warnings.add("【组件缺失】" + file);
                continue;
            }
            String normalizedUrl = normalizePath(row.getUrl());
            String blobPath;
            if (normalizedUrl.contains("/")) {
                String packageId = normalizedUrl.substring(0, normalizedUrl.indexOf('/'));
                Path packageDir = resolveExportTarget(Path.of(AppBaseConfig.getRemoteComponentPath()), packageId, "组件路径不合法");
                if (Files.isDirectory(packageDir)) {
                    blobPath = "blobs/components/" + packageId + ".zip";
                    putZippedDirectoryEntryIfAbsent(archiveEntries, blobPath, packageDir, exportSizeGuard);
                } else {
                    blobPath = "blobs/components/" + normalizedUrl;
                    putFileEntry(archiveEntries, blobPath, filePath, exportSizeGuard);
                }
            } else {
                blobPath = "blobs/components/" + normalizedUrl;
                putFileEntry(archiveEntries, blobPath, filePath, exportSizeGuard);
            }
            refs.add(assetRef(StringUtils.defaultIfBlank(row.getComponentName(), file), file, blobPath));
        }
        return refs;
    }

    private List<Map<String, Object>> exportDynamicScripts(
            List<String> projectIds,
            List<String> warnings,
            Map<String, ExportArchiveEntry> archiveEntries,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        User user = requireCurrentUser();
        LambdaQueryWrapper<DynamicScriptPO> wrapper = new LambdaQueryWrapper<DynamicScriptPO>()
                .eq(DynamicScriptPO::getUserId, user.getId());
        List<String> normalizedProjectIds = normalizeTextList(projectIds);
        wrapper.and(w -> {
            w.isNull(DynamicScriptPO::getProjectId);
            if (!normalizedProjectIds.isEmpty()) {
                w.or().in(DynamicScriptPO::getProjectId, normalizedProjectIds.stream()
                        .map(Long::valueOf)
                        .toList());
            }
        });
        List<DynamicScriptPO> scriptRows = dynamicScriptMapper.selectList(wrapper);
        List<Map<String, Object>> refs = new ArrayList<>();
        for (DynamicScriptPO row : scriptRows) {
            String scope = row.getProjectId() == null ? "GLOBAL" : "PROJECT";
            String ownerSourceProjectId = row.getProjectId() == null ? null : row.getProjectId().toString();
            if (row.getType() == ScriptEnum.REMOTE || StringUtils.startsWithIgnoreCase(row.getUrl(), "http")) {
                refs.add(dynamicScriptRef(
                        StringUtils.defaultIfBlank(row.getName(), row.getUrl()),
                        "REMOTE",
                        scope,
                        ownerSourceProjectId,
                        null,
                        null,
                        row.getUrl()
                ));
                continue;
            }
            String fileName = extractFileName(row.getUrl());
            Path filePath = resolveExportTarget(Path.of(AppBaseConfig.getDynamicScriptPath()), fileName, "动态脚本路径不合法");
            if (!Files.exists(filePath)) {
                warnings.add("【三方脚本缺失】" + fileName);
                continue;
            }
            String blobPath = "blobs/scripts/" + fileName;
            putFileEntryIfAbsent(archiveEntries, blobPath, filePath, exportSizeGuard);
            refs.add(dynamicScriptRef(
                    StringUtils.defaultIfBlank(row.getName(), fileName),
                    "LOCAL",
                    scope,
                    ownerSourceProjectId,
                    fileName,
                    blobPath,
                    null
            ));
        }
        return refs;
    }

    private List<Map<String, Object>> exportModels(
            List<String> modelFiles,
            List<String> warnings,
            Map<String, ExportArchiveEntry> archiveEntries,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        if (modelFiles.isEmpty()) {
            return List.of();
        }
        User user = requireCurrentUser();
        List<Map<String, Object>> refs = new ArrayList<>();

        for (String modelKey : modelFiles) {
            ThreeDModelPO row = threeDModelMapper.selectOne(new LambdaQueryWrapper<ThreeDModelPO>()
                    .eq(ThreeDModelPO::getUserId, user.getId())
                    .eq(ThreeDModelPO::getUrl, modelKey)
                    .last("limit 1"));
            if (row == null) {
                warnings.add("【模型缺失】" + modelKey);
                continue;
            }

            String normalizedUrl = normalizePath(row.getUrl());
            if (StringUtils.isBlank(normalizedUrl)) {
                warnings.add("【模型缺失】" + modelKey);
                continue;
            }
            assertSafeRelativePath(normalizedUrl, "模型路径不合法");

            String packageId;
            String entry;
            int slashIndex = normalizedUrl.indexOf('/');
            if (slashIndex >= 0) {
                packageId = normalizedUrl.substring(0, slashIndex);
                entry = normalizedUrl.substring(slashIndex + 1);
            } else {
                packageId = "root";
                entry = extractFileName(normalizedUrl);
            }

            List<Map<String, Object>> modelFileRefs = new ArrayList<>();
            Path modelDir = resolveExportTarget(Path.of(AppBaseConfig.getModelPath()), packageId, "模型路径不合法");
            if (Files.isDirectory(modelDir)) {
                List<Path> allFiles;
                try (var paths = Files.walk(modelDir)) {
                    allFiles = paths
                            .filter(path -> Files.isRegularFile(path) && !Files.isSymbolicLink(path))
                            .sorted(Comparator.comparing(path -> normalizePath(modelDir.relativize(path).toString())))
                            .toList();
                }
                for (Path path : allFiles) {
                    String relPath = normalizePath(modelDir.relativize(path).toString());
                    String zipPath = normalizeZipPath("models/" + packageId + "/" + relPath);
                    putFileEntry(archiveEntries, zipPath, path, exportSizeGuard);
                    modelFileRefs.add(modelFileRef(relPath, zipPath));
                }
            } else {
                Path modelFile = resolveExportTarget(Path.of(AppBaseConfig.getModelPath()), normalizedUrl, "模型路径不合法");
                if (!Files.exists(modelFile)) {
                    warnings.add("【模型缺失】" + modelKey);
                    continue;
                }
                String zipPath = normalizeZipPath("models/" + packageId + "/" + entry);
                putFileEntry(archiveEntries, zipPath, modelFile, exportSizeGuard);
                modelFileRefs.add(modelFileRef(entry, zipPath));
            }

            refs.add(modelPackageRef(
                    StringUtils.defaultIfBlank(row.getName(), entry),
                    modelKey,
                    packageId,
                    entry,
                    modelFileRefs
            ));
        }

        return refs;
    }

    private List<Map<String, Object>> exportCommonApis(List<String> commonApiIds, List<String> warnings) {
        if (commonApiIds.isEmpty()) {
            return List.of();
        }
        User user = requireCurrentUser();
        List<Long> ids = commonApiIds.stream().map(Long::valueOf).toList();
        List<CommonApiPO> rows = commonApiMapper.selectList(new LambdaQueryWrapper<CommonApiPO>()
                .eq(CommonApiPO::getUserId, user.getId())
                .in(CommonApiPO::getId, ids));
        Map<String, CommonApiPO> byId = new HashMap<>();
        for (CommonApiPO row : rows) {
            byId.put(String.valueOf(row.getId()), row);
        }
        List<Map<String, Object>> refs = new ArrayList<>();
        for (String id : commonApiIds) {
            CommonApiPO row = byId.get(id);
            if (row == null) {
                warnings.add("【公共API缺失】" + id);
                continue;
            }
            refs.add(commonApiRef(
                    id,
                    "",
                    defaultString(row.getName()),
                    defaultString(row.getUrl()),
                    defaultString(row.getMethod()),
                    defaultJsonObjectString(row.getParams()),
                    defaultJsonObjectString(row.getHeaders())
            ));
        }
        return refs;
    }

    private List<Map<String, Object>> exportCommonDatabases(List<String> databaseIds, List<String> warnings) {
        if (databaseIds.isEmpty()) {
            return List.of();
        }
        User user = requireCurrentUser();
        List<Long> ids = databaseIds.stream().map(Long::valueOf).toList();
        List<CommonDatabasePO> rows = datasourceMapper.selectList(new LambdaQueryWrapper<CommonDatabasePO>()
                .eq(CommonDatabasePO::getUserId, user.getId())
                .in(CommonDatabasePO::getId, ids));
        Map<String, CommonDatabasePO> byId = new HashMap<>();
        for (CommonDatabasePO row : rows) {
            byId.put(String.valueOf(row.getId()), row);
        }
        List<Map<String, Object>> refs = new ArrayList<>();
        for (String id : databaseIds) {
            CommonDatabasePO row = byId.get(id);
            if (row == null) {
                warnings.add("【数据库缺失】" + id);
                continue;
            }
            refs.add(commonDatabaseRef(
                    id,
                    "",
                    row.getType() == null ? "" : row.getType().name(),
                    defaultString(row.getIp()),
                    defaultString(row.getPort()),
                    defaultString(row.getDatabaseName()),
                    defaultString(row.getUsername()),
                    defaultString(row.getPassword()),
                    defaultString(row.getUrl()),
                    Boolean.TRUE.equals(row.getAllowSqlScript()),
                    defaultString(row.getDes())
            ));
        }
        return refs;
    }

    private LinkedHashMap<String, Object> buildAssetsObject(
            List<Map<String, Object>> imageRefs,
            List<Map<String, Object>> fontRefs,
            List<Map<String, Object>> videoRefs,
            List<Map<String, Object>> componentRefs,
            List<Map<String, Object>> dynamicScriptRefs,
            List<Map<String, Object>> modelRefs
    ) {
        LinkedHashMap<String, Object> assets = new LinkedHashMap<>();
        assets.put("images", imageRefs);
        assets.put("fonts", fontRefs);
        assets.put("videos", videoRefs);
        assets.put("components", componentRefs);
        assets.put("dynamicScripts", dynamicScriptRefs);
        assets.put("models", modelRefs);
        return assets;
    }

    private LinkedHashMap<String, Object> buildCommonDatasourceObject(
            List<Map<String, Object>> commonApiRefs,
            List<Map<String, Object>> databaseRefs
    ) {
        LinkedHashMap<String, Object> commonDatasource = new LinkedHashMap<>();
        commonDatasource.put("commonApis", commonApiRefs);
        commonDatasource.put("databases", databaseRefs);
        return commonDatasource;
    }

    static boolean shouldEncryptPackage(String secretMode, String secretPassphrase) {
        String normalizedSecretMode = normalizeText(secretMode);
        if (StringUtils.isBlank(normalizedSecretMode) || "plain".equals(normalizedSecretMode)) {
            return false;
        }
        if (!"passphrase-v1".equals(normalizedSecretMode)) {
            throw new AppException(
                    AppStatusCode.INVALID_PARAM,
                    "不支持的项目包加密模式：" + normalizedSecretMode
            );
        }
        if (StringUtils.isBlank(secretPassphrase)) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "缺少导出口令");
        }
        return true;
    }

    static void requirePackageEncryptionForCommonDatasource(
            boolean encryptPackage,
            Collection<?> commonApiRefs,
            Collection<?> databaseRefs
    ) {
        boolean hasCommonDatasource = (commonApiRefs != null && !commonApiRefs.isEmpty())
                || (databaseRefs != null && !databaseRefs.isEmpty());
        if (!encryptPackage && hasCommonDatasource) {
            throw new AppException(
                    AppStatusCode.INVALID_PARAM,
                    "导出包含公共 API 或数据库时必须启用整包加密"
            );
        }
    }

    private void writeZip(OutputStream outputStream, Map<String, Object> manifest, LinkedHashMap<String, ExportArchiveEntry> archiveEntries) throws IOException {
        try (ZipOutputStream zipOutputStream = new ZipOutputStream(outputStream, StandardCharsets.UTF_8)) {
            for (Map.Entry<String, ExportArchiveEntry> entry : archiveEntries.entrySet()) {
                zipOutputStream.putNextEntry(new ZipEntry(entry.getKey()));
                entry.getValue().writeTo(zipOutputStream);
                zipOutputStream.closeEntry();
            }
            zipOutputStream.putNextEntry(new ZipEntry("manifest.json"));
            zipOutputStream.write(serializeManifestJson(manifest).getBytes(StandardCharsets.UTF_8));
            zipOutputStream.closeEntry();
        } finally {
            cleanupArchiveEntries(archiveEntries);
        }
    }

    private void writeEncryptedPackageZip(OutputStream outputStream,
                                          Map<String, Object> manifest,
                                          LinkedHashMap<String, ExportArchiveEntry> archiveEntries,
                                          String secretPassphrase) throws IOException {
        Path innerZip = null;
        Path encryptedPayload = null;
        try {
            innerZip = Files.createTempFile("datavisool-export-inner-" + UUID.randomUUID(), ".zip");
            encryptedPayload = Files.createTempFile("datavisool-export-payload-" + UUID.randomUUID(), ".enc");
            try (OutputStream innerZipOutputStream = Files.newOutputStream(innerZip, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                writeZip(innerZipOutputStream, manifest, archiveEntries);
            }

            ManifestSecretCodecUtil.encryptFileToEnvelopeJsonWithPassphraseV1(innerZip, encryptedPayload, secretPassphrase);
            if (Files.size(encryptedPayload) > MAX_EXPORT_FILE_BYTES) {
                throw new RuntimeException("导出包文件超过大小限制");
            }
            String payloadPath = "payload.enc";
            LinkedHashMap<String, Object> outerManifest = buildEncryptedPackageManifest(payloadPath, encryptedPayload, System.currentTimeMillis(), EXPORT_GENERATOR);

            try (ZipOutputStream zipOutputStream = new ZipOutputStream(outputStream, StandardCharsets.UTF_8)) {
                zipOutputStream.putNextEntry(new ZipEntry("manifest.json"));
                zipOutputStream.write(serializeManifestJson(outerManifest).getBytes(StandardCharsets.UTF_8));
                zipOutputStream.closeEntry();

                zipOutputStream.putNextEntry(new ZipEntry(payloadPath));
                try (InputStream payloadInputStream = Files.newInputStream(encryptedPayload)) {
                    payloadInputStream.transferTo(zipOutputStream);
                }
                zipOutputStream.closeEntry();
            }
        } finally {
            if (innerZip != null) {
                Files.deleteIfExists(innerZip);
            }
            if (encryptedPayload != null) {
                Files.deleteIfExists(encryptedPayload);
            }
        }
    }

    static LinkedHashMap<String, Object> buildEncryptedPackageManifest(String payloadPath,
                                                                       byte[] encryptedPayload,
                                                                       long generatedAtMs,
                                                                       String generator) {
        String normalizedPayloadPath = StringUtils.defaultIfBlank(normalizeZipPath(payloadPath), "payload.enc");

        LinkedHashMap<String, Object> encryption = new LinkedHashMap<>();
        encryption.put("algorithm", "passphrase-v1");
        encryption.put("mode", "package");
        encryption.put("payloadPath", normalizedPayloadPath);

        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("path", normalizedPayloadPath);
        payload.put("sha256", sha256(encryptedPayload));
        payload.put("size", encryptedPayload == null ? 0 : encryptedPayload.length);

        LinkedHashMap<String, Object> outerManifest = new LinkedHashMap<>();
        outerManifest.put("encrypted", true);
        outerManifest.put("encryption", encryption);
        outerManifest.put("format", EXPORT_FORMAT);
        outerManifest.put("formatVersion", 4);
        outerManifest.put("generatedAtMs", generatedAtMs);
        outerManifest.put("generator", StringUtils.defaultIfBlank(generator, EXPORT_GENERATOR));
        outerManifest.put("payload", payload);
        return outerManifest;
    }

    static LinkedHashMap<String, Object> buildEncryptedPackageManifest(String payloadPath,
                                                                       Path encryptedPayload,
                                                                       long generatedAtMs,
                                                                       String generator) throws IOException {
        String normalizedPayloadPath = StringUtils.defaultIfBlank(normalizeZipPath(payloadPath), "payload.enc");

        LinkedHashMap<String, Object> encryption = new LinkedHashMap<>();
        encryption.put("algorithm", "passphrase-v1");
        encryption.put("mode", "package");
        encryption.put("payloadPath", normalizedPayloadPath);

        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("path", normalizedPayloadPath);
        payload.put("sha256", sha256(encryptedPayload));
        payload.put("size", Files.size(encryptedPayload));

        LinkedHashMap<String, Object> outerManifest = new LinkedHashMap<>();
        outerManifest.put("encrypted", true);
        outerManifest.put("encryption", encryption);
        outerManifest.put("format", EXPORT_FORMAT);
        outerManifest.put("formatVersion", 4);
        outerManifest.put("generatedAtMs", generatedAtMs);
        outerManifest.put("generator", StringUtils.defaultIfBlank(generator, EXPORT_GENERATOR));
        outerManifest.put("payload", payload);
        return outerManifest;
    }

    static String serializeManifestJson(Map<String, Object> manifest) {
        return JSON.toJSONString(manifest, MANIFEST_JSON_FEATURES);
    }

    private List<Map<String, Object>> buildManifestFiles(LinkedHashMap<String, ExportArchiveEntry> archiveEntries) throws IOException {
        List<Map<String, Object>> files = new ArrayList<>();
        List<Map.Entry<String, ExportArchiveEntry>> sortedEntries = archiveEntries.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .toList();
        for (Map.Entry<String, ExportArchiveEntry> entry : sortedEntries) {
            files.add(manifestFile(entry.getKey(), entry.getValue()));
        }
        return files;
    }

    private byte[] buildWarningsBytes(List<String> warnings) {
        StringBuilder sb = new StringBuilder();
        warnings.forEach(warning -> sb.append(warning).append('\n'));
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private JSONObject getAssetsObject(JSONObject manifest) {
        JSONObject assets = manifest.getJSONObject("assets");
        return assets == null ? new JSONObject() : assets;
    }

    private JSONArray getArray(JSONObject object, String key) {
        if (object == null) {
            return new JSONArray();
        }
        JSONArray array = object.getJSONArray(key);
        return array == null ? new JSONArray() : array;
    }

    private byte[] readZipBytes(ZipFile zipFile, String path, long maxBytes, ImportSizeGuard importSizeGuard) throws IOException {
        ZipEntry entry = findZipEntry(zipFile, path);
        if (entry == null) {
            throw new RuntimeException("导入包缺少文件: " + path);
        }
        assertZipEntrySizeWithinLimit(entry, maxBytes);
        try (InputStream in = zipFile.getInputStream(entry);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            copyWithLimit(in, out, maxBytes, importSizeGuard);
            return out.toByteArray();
        }
    }

    private String readZipText(ZipFile zipFile, String path, ImportSizeGuard importSizeGuard) throws IOException {
        return new String(readZipBytes(zipFile, path, MAX_IMPORT_TEXT_BYTES, importSizeGuard), StandardCharsets.UTF_8);
    }

    private String readCurrentZipEntryText(InputStream inputStream, ImportSizeGuard importSizeGuard) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        copyWithLimit(inputStream, out, MAX_IMPORT_TEXT_BYTES, importSizeGuard);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private Path writeZipEntryToTempFile(ZipFile zipFile,
                                         String entryPath,
                                         String suffix,
                                         ImportSizeGuard importSizeGuard) throws IOException {
        ZipEntry entry = findZipEntry(zipFile, entryPath);
        if (entry == null) {
            throw new RuntimeException("导入包缺少文件: " + entryPath);
        }
        assertZipEntrySizeWithinLimit(entry, MAX_IMPORT_FILE_BYTES);
        Path tempFile = Files.createTempFile("datavisool-component-import-", suffix);
        boolean success = false;
        try (InputStream in = zipFile.getInputStream(entry);
             OutputStream out = Files.newOutputStream(tempFile, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
            copyWithLimit(in, out, MAX_IMPORT_FILE_BYTES, importSizeGuard);
            success = true;
            return tempFile;
        } finally {
            if (!success) {
                Files.deleteIfExists(tempFile);
            }
        }
    }

    private ZipEntry findZipEntry(ZipFile zipFile, String path) {
        String normalized = normalizeZipPath(path);
        if (StringUtils.isBlank(normalized)) {
            return null;
        }
        ZipEntry direct = zipFile.getEntry(normalized);
        if (direct != null) {
            return direct;
        }
        return zipFile.stream()
                .filter(entry -> normalizeZipPath(entry.getName()).equals(normalized))
                .findFirst()
                .orElse(null);
    }

    private String writeZipEntryToUniqueFile(ZipFile zipFile,
                                             String entryPath,
                                             Path targetDir,
                                             String originalFileName,
                                             ImportSizeGuard importSizeGuard,
                                             ImportWriteContext importWriteContext) throws IOException {
        ZipEntry entry = findZipEntry(zipFile, entryPath);
        if (entry == null) {
            throw new RuntimeException("导入包缺少文件: " + entryPath);
        }
        assertZipEntrySizeWithinLimit(entry, MAX_IMPORT_FILE_BYTES);
        try (InputStream in = zipFile.getInputStream(entry)) {
            return writeStreamToUniqueFile(in, targetDir, originalFileName, importSizeGuard, importWriteContext);
        }
    }

    private String writeStreamToUniqueFile(InputStream inputStream,
                                           Path targetDir,
                                           String originalFileName,
                                           ImportSizeGuard importSizeGuard,
                                           ImportWriteContext importWriteContext) throws IOException {
        Path root = targetDir.toAbsolutePath().normalize();
        Files.createDirectories(root);
        for (int i = 0; i < 10; i++) {
            String storedFileName = createImportedFileName(originalFileName);
            Path target = root.resolve(storedFileName).normalize();
            if (!target.startsWith(root)) {
                throw new RuntimeException("导入包路径不合法");
            }
            try {
                try (OutputStream out = Files.newOutputStream(target, StandardOpenOption.WRITE, StandardOpenOption.CREATE_NEW)) {
                    copyWithLimit(inputStream, out, MAX_IMPORT_FILE_BYTES, importSizeGuard);
                }
                importWriteContext.recordFile(target);
                return storedFileName;
            } catch (java.nio.file.FileAlreadyExistsException ignored) {
                // UUID collision or concurrent import; retry with a fresh name.
            } catch (IOException | RuntimeException e) {
                Files.deleteIfExists(target);
                throw e;
            }
        }
        throw new RuntimeException("导入文件名生成失败");
    }

    private long writeZipEntryToFile(ZipFile zipFile,
                                     String entryPath,
                                     Path target,
                                     ImportSizeGuard importSizeGuard,
                                     ImportWriteContext importWriteContext) throws IOException {
        ZipEntry entry = findZipEntry(zipFile, entryPath);
        if (entry == null) {
            throw new RuntimeException("导入包缺少文件: " + entryPath);
        }
        assertZipEntrySizeWithinLimit(entry, MAX_IMPORT_FILE_BYTES);
        try (InputStream in = zipFile.getInputStream(entry);
             OutputStream out = Files.newOutputStream(target, StandardOpenOption.WRITE, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            long copied = copyWithLimit(in, out, MAX_IMPORT_FILE_BYTES, importSizeGuard);
            importWriteContext.recordFile(target);
            return copied;
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(target);
            throw e;
        }
    }

    private long copyWithLimit(InputStream inputStream, OutputStream outputStream, long maxBytes, ImportSizeGuard importSizeGuard) throws IOException {
        byte[] buffer = new byte[IMPORT_COPY_BUFFER_SIZE];
        long copied = 0L;
        int read;
        while ((read = inputStream.read(buffer)) != -1) {
            copied += read;
            if (copied > maxBytes) {
                throw new RuntimeException("导入包文件超过大小限制");
            }
            if (importSizeGuard != null) {
                importSizeGuard.add(read);
            }
            outputStream.write(buffer, 0, read);
        }
        return copied;
    }

    private void assertZipEntrySizeWithinLimit(ZipEntry entry, long maxBytes) {
        long size = entry.getSize();
        if (size > maxBytes) {
            throw new RuntimeException("导入包文件超过大小限制");
        }
    }

    private String createImportedFileName(String originalFileName) {
        return UUID.randomUUID() + safeFileExtension(originalFileName);
    }

    private String createImportedDirectoryName(String prefix) {
        return normalizeText(prefix) + "-" + UUID.randomUUID();
    }

    private String reserveImportedComponentPackageId(String sourceId) {
        String base = sanitizePackageId(sourceId) + "-" + UUID.randomUUID().toString().replace("-", "");
        Path root = Path.of(AppBaseConfig.getRemoteComponentPath()).toAbsolutePath().normalize();
        for (int i = 0; i < 100; i++) {
            String packageId = i == 0 ? base : base + "-" + i;
            Path finalDir = root.resolve(packageId).normalize();
            Path tempDir = root.resolve(".import-" + packageId).normalize();
            if (!finalDir.startsWith(root) || !tempDir.startsWith(root)) {
                throw new RuntimeException("组件包路径不合法");
            }
            if (!Files.exists(finalDir) && !Files.exists(tempDir)) {
                return packageId;
            }
        }
        throw new RuntimeException("组件包目录生成失败");
    }

    private String sanitizePackageId(String value) {
        String normalized = normalizeText(value).replaceAll("[^a-zA-Z0-9._-]+", "-");
        normalized = normalized.replaceAll("^-+", "").replaceAll("-+$", "");
        return StringUtils.isBlank(normalized) ? "component" : normalized;
    }

    private boolean isZipFileName(String value) {
        return safeFileExtension(value).equalsIgnoreCase(".zip");
    }

    private String fileStem(String value) {
        String fileName = extractFileName(value);
        int index = fileName.lastIndexOf('.');
        return index > 0 ? fileName.substring(0, index) : fileName;
    }

    private String componentEntryHint(String original) {
        String raw = normalizePath(original).replaceFirst("^/+", "");
        if (StringUtils.isBlank(raw)) {
            return null;
        }
        String marker = "static/components/";
        int index = raw.lastIndexOf(marker);
        if (index >= 0) {
            String after = raw.substring(index + marker.length()).replaceFirst("^/+", "");
            String[] parts = after.split("/");
            if (parts.length >= 2) {
                return String.join("/", java.util.Arrays.copyOfRange(parts, 1, parts.length));
            }
        }
        return raw;
    }

    private String scanComponentPackageEntry(Path packageZip, String hint) throws IOException {
        String normalizedHint = normalizePath(hint);
        String hintFileName = extractFileName(normalizedHint);
        String best = null;
        String ambiguous = null;
        int bestPriority = Integer.MIN_VALUE;
        try (ZipFile zip = new ZipFile(packageZip.toFile(), StandardCharsets.UTF_8)) {
            Set<String> paths = new HashSet<>();
            var entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String rel = safeComponentZipRelPath(entry.getName());
                if (rel == null) {
                    continue;
                }
                if (!paths.add(rel)) {
                    throw new IllegalArgumentException("组件压缩包包含重复路径: " + rel);
                }
                if (entry.isDirectory()) {
                    continue;
                }
                String lower = rel.toLowerCase(Locale.ROOT);
                if (!lower.endsWith(".js") && !lower.endsWith(".mjs")) {
                    continue;
                }
                int priority = componentEntryPriority(rel, normalizedHint, hintFileName);
                if (best == null || priority > bestPriority) {
                    best = rel;
                    bestPriority = priority;
                    ambiguous = null;
                } else if (priority == bestPriority && !best.equals(rel)) {
                    ambiguous = rel;
                }
            }
        }
        if (StringUtils.isBlank(best)) {
            throw new IllegalArgumentException("组件压缩包中未找到 .js 或 .mjs 入口");
        }
        if (ambiguous != null) {
            throw new IllegalArgumentException("组件压缩包中存在多个可能的入口，无法确定应加载哪一个: " + best + ", " + ambiguous);
        }
        return best;
    }

    private int componentEntryPriority(String rel, String hint, String hintFileName) {
        if (StringUtils.isNotBlank(hint) && rel.equals(hint)) {
            return 100;
        }
        String fileName = extractFileName(rel);
        if (StringUtils.isNotBlank(hint) && fileName.equals(hint)) {
            return 90;
        }
        if (StringUtils.isNotBlank(hintFileName) && fileName.equals(hintFileName)) {
            return 80;
        }
        String lower = rel.toLowerCase(Locale.ROOT);
        int depth = lower.split("/").length;
        if (depth == 1) {
            return 30;
        }
        if (lower.startsWith("assets/") || lower.startsWith("chunks/")) {
            return 10;
        }
        if (lower.contains("/assets/") || lower.contains("/chunks/")) {
            return 15;
        }
        return 20;
    }

    private void extractComponentPackage(Path packageZip, Path targetDir, ImportSizeGuard importSizeGuard) throws IOException {
        Path root = targetDir.toAbsolutePath().normalize();
        try (ZipFile zip = new ZipFile(packageZip.toFile(), StandardCharsets.UTF_8)) {
            var entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (entry.isDirectory()) {
                    continue;
                }
                String rel = safeComponentZipRelPath(entry.getName());
                if (StringUtils.isBlank(rel)) {
                    continue;
                }
                Path target = root.resolve(rel).normalize();
                if (!target.startsWith(root)) {
                    throw new RuntimeException("组件压缩包路径不合法");
                }
                Files.createDirectories(target.getParent());
                try (InputStream input = zip.getInputStream(entry);
                     OutputStream out = Files.newOutputStream(target, StandardOpenOption.WRITE, StandardOpenOption.CREATE_NEW)) {
                    copyWithLimit(input, out, MAX_IMPORT_FILE_BYTES, importSizeGuard);
                }
            }
        }
    }

    private String safeComponentZipRelPath(String name) {
        String normalized = normalizePath(name);
        if (StringUtils.isBlank(normalized)) {
            throw new IllegalArgumentException("组件压缩包路径不合法");
        }
        if (normalized.startsWith("__MACOSX/")
                || normalized.endsWith("/.DS_Store")
                || normalized.equals(".DS_Store")) {
            return null;
        }
        if (normalized.startsWith("/") || normalized.matches("^[A-Za-z]:.*") || normalized.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("组件压缩包路径不合法: " + normalized);
        }
        List<String> parts = new ArrayList<>();
        for (Path part : Path.of(normalized)) {
            String item = part.toString();
            if (StringUtils.isBlank(item) || ".".equals(item)) {
                continue;
            }
            if ("..".equals(item)) {
                throw new IllegalArgumentException("组件压缩包路径不合法: " + normalized);
            }
            parts.add(item);
        }
        return parts.isEmpty() ? null : String.join("/", parts);
    }

    private String safeFileExtension(String fileName) {
        String normalized = extractFileName(fileName);
        int index = normalized.lastIndexOf('.');
        if (index < 0 || index == normalized.length() - 1) {
            return "";
        }
        String extension = normalized.substring(index).toLowerCase(Locale.ROOT);
        return extension.matches("\\.[a-z0-9]{1,16}") ? extension : "";
    }

    private void assertAllowedImportFileType(String fileName, String[] allowedExtensions, String resourceLabel) {
        String extension = safeFileExtension(fileName);
        if (StringUtils.isBlank(extension) || allowedExtensions == null || allowedExtensions.length == 0) {
            throw new RuntimeException("导入包" + resourceLabel + "格式不支持: " + extractFileName(fileName));
        }
        for (String allowedExtension : allowedExtensions) {
            if (extension.equalsIgnoreCase(allowedExtension)) {
                return;
            }
        }
        throw new RuntimeException("导入包" + resourceLabel + "格式不支持: " + extractFileName(fileName));
    }

    private Path resolveImportTarget(Path root, String relativePath, String errorMessage) {
        assertSafeRelativePath(relativePath, errorMessage);
        Path normalizedRoot = root.toAbsolutePath().normalize();
        Path target = normalizedRoot.resolve(normalizePath(relativePath)).normalize();
        if (!target.startsWith(normalizedRoot)) {
            throw new RuntimeException(errorMessage);
        }
        return target;
    }

    private void assertSafeRelativePath(String relativePath, String errorMessage) {
        String normalized = normalizePath(relativePath);
        if (StringUtils.isBlank(normalized)
                || normalized.startsWith("/")
                || normalized.contains("..")
                || Path.of(normalized).isAbsolute()) {
            throw new RuntimeException(errorMessage);
        }
    }

    private String sanitizeFileName(String name) {
        String value = StringUtils.defaultIfBlank(normalizeText(name), "DataVisoolProject");
        return value.replaceAll("[\\\\/:*?\"<>|]+", "_");
    }

    private static String normalizeText(String value) {
        return value == null ? "" : value.trim();
    }

    private static String normalizePath(String value) {
        return normalizeText(value).replace('\\', '/');
    }

    private static String normalizeZipPath(String value) {
        String normalized = normalizePath(value);
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        if (normalized.contains("..")) {
            throw new RuntimeException("导入包路径不合法");
        }
        return normalized;
    }

    private String safeZipPathSegment(String value, String fieldName) {
        String normalized = normalizeText(value);
        if (!normalized.matches("\\d{1,20}")) {
            throw new AppException(500, "无法导出项目数据，原因：" + fieldName + " 包含非法路径字符");
        }
        return normalized;
    }

    private String extractFileName(String value) {
        String normalized = normalizePath(value);
        if (StringUtils.isBlank(normalized)) {
            return normalized;
        }
        int index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.substring(index + 1) : normalized;
    }

    private String decodeAssetLikeUrl(String url) {
        String value = normalizeText(url);
        if (StringUtils.startsWith(value, "http://asset.localhost/")) {
            value = value.substring("http://asset.localhost/".length());
        } else if (StringUtils.startsWith(value, "asset://localhost/")) {
            value = value.substring("asset://localhost/".length());
        } else {
            return value;
        }
        return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private String extractAfterMarker(String url, String marker) {
        String decoded = normalizePath(decodeAssetLikeUrl(url));
        int index = decoded.lastIndexOf(marker);
        if (index >= 0) {
            return decoded.substring(index + marker.length()).replaceFirst("^/+", "");
        }
        int slashIndex = decoded.lastIndexOf('/');
        return slashIndex >= 0 ? decoded.substring(slashIndex + 1) : decoded;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private static boolean defaultBoolean(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return value != null && Boolean.parseBoolean(String.valueOf(value));
    }

    private String defaultJsonObjectString(String value) {
        return StringUtils.isBlank(value) ? "{}" : value;
    }

    private Map<String, Long> buildDatasourceRefKeyMap(JSONArray definitions, Map<String, Long> idMap) {
        Map<String, Long> mapping = new HashMap<>();
        if (definitions == null || definitions.isEmpty() || idMap.isEmpty()) {
            return mapping;
        }
        for (int i = 0; i < definitions.size(); i++) {
            JSONObject item = definitions.getJSONObject(i);
            if (item == null) {
                continue;
            }
            String originId = normalizeText(item.getString("originId"));
            String refKey = normalizeText(item.getString("refKey"));
            if (StringUtils.isBlank(originId) || StringUtils.isBlank(refKey)) {
                continue;
            }
            Long localId = idMap.get(originId);
            if (localId != null) {
                mapping.put(refKey, localId);
            }
        }
        return mapping;
    }

    private void putBytesEntry(
            Map<String, ExportArchiveEntry> archiveEntries,
            String zipPath,
            byte[] bytes,
            ExportSizeGuard exportSizeGuard
    ) {
        ExportArchiveEntry entry = ExportArchiveEntry.fromBytes(bytes);
        exportSizeGuard.add(entry.size());
        archiveEntries.put(normalizeZipPath(zipPath), entry);
    }

    private void putZippedDirectoryEntryIfAbsent(
            Map<String, ExportArchiveEntry> archiveEntries,
            String zipPath,
            Path directory,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        String normalizedZipPath = normalizeZipPath(zipPath);
        if (archiveEntries.containsKey(normalizedZipPath)) {
            return;
        }
        Path tempZip = null;
        try {
            tempZip = zipDirectoryToTempFile(directory);
            ExportArchiveEntry entry = ExportArchiveEntry.fromTempFile(tempZip);
            exportSizeGuard.add(entry.size());
            archiveEntries.put(normalizedZipPath, entry);
        } catch (IOException | RuntimeException e) {
            if (tempZip != null) {
                Files.deleteIfExists(tempZip);
            }
            throw e;
        }
    }

    private Path zipDirectoryToTempFile(Path directory) throws IOException {
        Path root = directory.toAbsolutePath().normalize();
        Path tempZip = Files.createTempFile("datavisool-component-", ".zip");
        try (OutputStream outputStream = Files.newOutputStream(tempZip, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
             ZipOutputStream zos = new ZipOutputStream(outputStream)) {
            List<Path> files;
            try (var paths = Files.walk(root)) {
                files = paths
                        .filter(path -> Files.isRegularFile(path) && !Files.isSymbolicLink(path))
                        .sorted(Comparator.comparing(path -> normalizePath(root.relativize(path).toString())))
                        .toList();
            }
            for (Path file : files) {
                String rel = normalizePath(root.relativize(file).toString());
                zos.putNextEntry(new ZipEntry(rel));
                Files.copy(file, zos);
                zos.closeEntry();
            }
            zos.finish();
            return tempZip;
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(tempZip);
            throw e;
        }
    }

    private void cleanupArchiveEntries(Map<String, ExportArchiveEntry> archiveEntries) {
        archiveEntries.values().forEach(ExportArchiveEntry::cleanup);
    }

    private void putFileEntry(
            Map<String, ExportArchiveEntry> archiveEntries,
            String zipPath,
            Path sourcePath,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        ExportArchiveEntry entry = ExportArchiveEntry.fromFile(sourcePath);
        exportSizeGuard.add(entry.size());
        archiveEntries.put(normalizeZipPath(zipPath), entry);
    }

    private void putFileEntryIfAbsent(
            Map<String, ExportArchiveEntry> archiveEntries,
            String zipPath,
            Path sourcePath,
            ExportSizeGuard exportSizeGuard
    ) throws IOException {
        String normalizedZipPath = normalizeZipPath(zipPath);
        if (archiveEntries.containsKey(normalizedZipPath)) {
            return;
        }
        ExportArchiveEntry entry = ExportArchiveEntry.fromFile(sourcePath);
        exportSizeGuard.add(entry.size());
        archiveEntries.put(normalizedZipPath, entry);
    }

    private Path resolveExportTarget(Path root, String relativePath, String errorMessage) {
        assertSafeRelativePath(relativePath, errorMessage);
        Path normalizedRoot = root.toAbsolutePath().normalize();
        Path target = normalizedRoot.resolve(normalizePath(relativePath)).normalize();
        if (!target.startsWith(normalizedRoot)) {
            throw new RuntimeException(errorMessage);
        }
        return target;
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
                    log.warn("清理目录文件失败: {}", path, e);
                }
            });
        } catch (IOException e) {
            log.warn("清理目录失败: {}", directory, e);
        }
    }

    private void moveDirectory(Path tempDir, Path finalDir) throws IOException {
        try {
            Files.move(tempDir, finalDir, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(tempDir, finalDir);
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 不可用", e);
        }
    }

    private static String sha256(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream inputStream = Files.newInputStream(path)) {
                byte[] buffer = new byte[IMPORT_COPY_BUFFER_SIZE];
                int read;
                while ((read = inputStream.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 不可用", e);
        }
    }

    private Map<String, Object> manifestFile(String path, ExportArchiveEntry entry) throws IOException {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("path", path);
        map.put("sha256", entry.sha256());
        map.put("size", entry.size());
        return map;
    }

    private Map<String, Object> buildProjectNodeManifest(PreparedExportProjectNode node) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("sourceProjectId", node.sourceProjectId);
        map.put("name", node.name);
        map.put("sourcePid", StringUtils.isBlank(node.sourcePid) ? null : node.sourcePid);
        map.put("dataPath", node.dataPath);
        map.put("isEntry", node.isEntry);
        return map;
    }

    private Map<String, Object> assetRef(String name, String original, String blob) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("original", original);
        map.put("blob", blob);
        return map;
    }

    private Map<String, Object> dynamicScriptRef(
            String name,
            String type,
            String scope,
            String ownerSourceProjectId,
            String original,
            String blob,
            String url
    ) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("type", type);
        map.put("scope", scope);
        map.put("ownerSourceProjectId", ownerSourceProjectId);
        map.put("original", original);
        map.put("blob", blob);
        map.put("url", url);
        return map;
    }

    private Map<String, Object> modelPackageRef(
            String name,
            String original,
            String packageId,
            String entry,
            List<Map<String, Object>> files
    ) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("name", name);
        map.put("original", original);
        map.put("packageId", packageId);
        map.put("entry", entry);
        map.put("files", files);
        return map;
    }

    private Map<String, Object> modelFileRef(String path, String blob) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("path", path);
        map.put("blob", blob);
        return map;
    }

    private Map<String, Object> commonApiRef(
            String originId,
            String refKey,
            String name,
            String url,
            String method,
            String params,
            String headers
    ) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("originId", originId);
        map.put("refKey", refKey);
        map.put("name", name);
        map.put("url", url);
        map.put("method", method);
        map.put("params", params);
        map.put("headers", headers);
        return map;
    }

    private Map<String, Object> commonDatabaseRef(
            String originId,
            String refKey,
            String type,
            String ip,
            String port,
            String databaseName,
            String username,
            String password,
            String url,
            boolean allowSqlScript,
            String des
    ) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        map.put("originId", originId);
        map.put("refKey", refKey);
        map.put("type", type);
        map.put("ip", ip);
        map.put("port", port);
        map.put("databaseName", databaseName);
        map.put("username", username);
        map.put("password", password);
        map.put("url", url);
        map.put("allowSqlScript", allowSqlScript);
        map.put("des", des);
        return map;
    }

    private record PreparedExportProjectNode(
            String sourceProjectId,
            String name,
            String sourcePid,
            boolean isEntry,
            List<String> fonts,
            List<String> images,
            List<String> videos,
            List<String> models,
            List<String> components,
            List<String> commonApiIds,
            List<String> databaseIds,
            String dataPath,
            String projectJson
    ) {
    }

    private record ImportedProjectNode(
            String sourceProjectId,
            String name,
            String sourcePid,
            boolean isEntry,
            String projectJson
    ) {
    }

    private record ImportedDatasourceContext(
            Map<String, Long> commonApiIdMap,
            Map<String, Long> databaseIdMap,
            Map<String, Long> commonApiRefKeyMap,
            Map<String, Long> databaseRefKeyMap,
            ImportWriteContext writeContext
    ) {
        ImportedDatasourceContext(ImportWriteContext writeContext) {
            this(new HashMap<>(), new HashMap<>(), new HashMap<>(), new HashMap<>(), writeContext);
        }
    }

    enum ManifestImportMode {
        SINGLE_PROJECT,
        PROJECT_GRAPH,
        ENCRYPTED_PACKAGE
    }

    private static class ImportSizeGuard {
        private long totalBytes;

        void add(long bytes) {
            if (bytes <= 0) {
                return;
            }
            if (totalBytes > MAX_IMPORT_TOTAL_UNCOMPRESSED_BYTES - bytes) {
                throw new RuntimeException("导入包解压后总大小超过限制");
            }
            totalBytes += bytes;
        }
    }

    private static class ExportSizeGuard {
        private long totalBytes;

        void add(long bytes) {
            if (bytes <= 0) {
                return;
            }
            if (bytes > MAX_EXPORT_FILE_BYTES) {
                throw new RuntimeException("导出包文件超过大小限制");
            }
            if (totalBytes > MAX_EXPORT_TOTAL_UNCOMPRESSED_BYTES - bytes) {
                throw new RuntimeException("导出包总大小超过限制");
            }
            totalBytes += bytes;
        }
    }

    private record ExportArchiveEntry(Path sourcePath, byte[] bytes, long size, boolean deleteAfterWrite) {
        static ExportArchiveEntry fromBytes(byte[] bytes) {
            byte[] safeBytes = bytes == null ? new byte[0] : bytes;
            if (safeBytes.length > MAX_EXPORT_FILE_BYTES) {
                throw new RuntimeException("导出包文件超过大小限制");
            }
            return new ExportArchiveEntry(null, safeBytes, safeBytes.length, false);
        }

        static ExportArchiveEntry fromFile(Path sourcePath) throws IOException {
            return fromPath(sourcePath, false);
        }

        static ExportArchiveEntry fromTempFile(Path sourcePath) throws IOException {
            return fromPath(sourcePath, true);
        }

        private static ExportArchiveEntry fromPath(Path sourcePath, boolean deleteAfterWrite) throws IOException {
            if (sourcePath == null) {
                throw new RuntimeException("导出包文件路径不合法");
            }
            Path normalized = sourcePath.toAbsolutePath().normalize();
            if (!Files.isRegularFile(normalized) || Files.isSymbolicLink(normalized)) {
                throw new RuntimeException("导出包文件不存在");
            }
            long size = Files.size(normalized);
            if (size > MAX_EXPORT_FILE_BYTES) {
                throw new RuntimeException("导出包文件超过大小限制");
            }
            return new ExportArchiveEntry(normalized, null, size, deleteAfterWrite);
        }

        void writeTo(OutputStream outputStream) throws IOException {
            if (bytes != null) {
                outputStream.write(bytes);
                return;
            }
            try (InputStream inputStream = Files.newInputStream(sourcePath)) {
                byte[] buffer = new byte[IMPORT_COPY_BUFFER_SIZE];
                int read;
                while ((read = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, read);
                }
            }
        }

        String sha256() throws IOException {
            if (bytes != null) {
                return ProjectArchiveCompatHelper.sha256(bytes);
            }
            return ProjectArchiveCompatHelper.sha256(sourcePath);
        }

        void cleanup() {
            if (!deleteAfterWrite || sourcePath == null) {
                return;
            }
            try {
                Files.deleteIfExists(sourcePath);
            } catch (IOException e) {
                log.warn("清理导出临时文件失败: {}", sourcePath, e);
            }
        }
    }

    private static class ImportWriteContext {
        private final List<Path> createdFiles = new ArrayList<>();
        private final List<Path> createdDirectories = new ArrayList<>();
        private int missingCommonApiCount;
        private int missingDatabaseCount;
        private int missingScreenReferenceCount;
        private final Set<String> missingAssetLocations = new LinkedHashSet<>();

        void cleanupOnTransactionRollback() {
            if (!TransactionSynchronizationManager.isActualTransactionActive()
                    || !TransactionSynchronizationManager.isSynchronizationActive()) return;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) cleanup();
                }
            });
        }

        String importNotice() {
            List<String> notices = new ArrayList<>();
            if (missingCommonApiCount > 0 || missingDatabaseCount > 0)
                notices.add("项目包缺少 " + missingCommonApiCount + " 处公共 API 和 " + missingDatabaseCount
                        + " 处数据库的配置，已清空这些引用，请打开对应图层或全局变量重新选择数据源");
            if (missingScreenReferenceCount > 0)
                notices.add("单项目包中有 " + missingScreenReferenceCount + " 处大屏引用无法安全映射，已清空，请在对应图层重新选择大屏");
            if (!missingAssetLocations.isEmpty()) {
                String examples = missingAssetLocations.stream().limit(10).collect(java.util.stream.Collectors.joining("、"));
                notices.add("有 " + missingAssetLocations.size() + " 处本地资源未能关联到项目包，原地址已保留，请检查：" + examples
                        + (missingAssetLocations.size() > 10 ? "等" : ""));
            }
            return notices.isEmpty() ? null : "项目已导入，但" + String.join("；", notices) + "。";
        }

        void recordFile(Path path) {
            if (path != null) {
                createdFiles.add(path.toAbsolutePath().normalize());
            }
        }

        void recordDirectory(Path path) {
            if (path != null) {
                createdDirectories.add(path.toAbsolutePath().normalize());
            }
        }

        void cleanup() {
            for (int i = createdFiles.size() - 1; i >= 0; i--) {
                Path file = createdFiles.get(i);
                try {
                    Files.deleteIfExists(file);
                } catch (IOException e) {
                    log.warn("导入失败后清理文件失败: {}", file, e);
                }
            }
            for (int i = createdDirectories.size() - 1; i >= 0; i--) {
                deleteDirectoryQuietly(createdDirectories.get(i));
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
                        log.warn("导入失败后清理目录失败: {}", path, e);
                    }
                });
            } catch (IOException e) {
                log.warn("导入失败后清理目录失败: {}", directory, e);
            }
        }
    }

    private static class ImportedAssetContext {
        private final ImportWriteContext writeContext;
        private Long targetProjectId;
        private final Map<String, ImportedFont> importedFonts = new LinkedHashMap<>();
        private final Map<String, String> fontAliases = new LinkedHashMap<>();
        private final AssetMappings imageUrlMap = new AssetMappings();
        private final AssetMappings videoUrlMap = new AssetMappings();
        private final AssetMappings modelUrlMap = new AssetMappings();
        private final AssetMappings componentUrlMap = new AssetMappings();

        ImportedAssetContext(ImportWriteContext writeContext) {
            this.writeContext = writeContext;
        }

        private static class AssetMappings {
            final Map<String, String> exact = new LinkedHashMap<>();
            final Map<String, String> fallback = new LinkedHashMap<>();
        }

        void registerImage(String original, String fileName) {
            registerAsset(imageUrlMap, original, AppBaseConfig.IMAGE_PATH + "/" + fileName, fileName);
        }

        void registerImage(String original, String sourceFileName, String storedFileName) {
            String target = AppBaseConfig.IMAGE_PATH + "/" + storedFileName;
            registerAsset(imageUrlMap, original, target, storedFileName);
            registerAssetKey(imageUrlMap.fallback, sourceFileName, target);
        }

        void registerVideo(String original, String sourceFileName, String storedFileName) {
            String target = AppBaseConfig.VIDEO_PATH + "/" + storedFileName;
            registerAsset(videoUrlMap, original, target, storedFileName);
            registerAssetKey(videoUrlMap.fallback, sourceFileName, target);
        }

        void registerModel(String original, String packageId, String entry) {
            String normalizedEntry = entry.replace('\\', '/');
            registerAsset(modelUrlMap, original, AppBaseConfig.MODEL_PATH + "/" + packageId + "/" + normalizedEntry, packageId + "/" + normalizedEntry);
        }

        void registerComponent(String original, String blobFileName, String storedUrl) {
            registerAsset(componentUrlMap, original, AppBaseConfig.REMOTE_COMPONENT_PATH + "/" + storedUrl, storedUrl);
            registerAsset(componentUrlMap, blobFileName, AppBaseConfig.REMOTE_COMPONENT_PATH + "/" + storedUrl, storedUrl);
        }

        String resolveImageUrl(String current, String location) {
            return resolveImportedAssetUrl(current, imageUrlMap, "/static/images/", true, location);
        }

        String resolveVideoUrl(String current, String location) {
            return resolveImportedAssetUrl(current, videoUrlMap, "/static/videos/", true, location);
        }

        String resolveModelUrl(String current, String location) {
            return resolveImportedAssetUrl(current, modelUrlMap, "/static/models/", false, location);
        }

        private void registerAsset(AssetMappings mapping, String original, String targetUrl, String fallbackKey) {
            if (StringUtils.isNotBlank(original)) {
                String extracted = original.trim().replace('\\', '/');
                registerAssetKey(mapping.exact, extracted, targetUrl);
                registerAssetKey(mapping.fallback, extractTail(extracted), targetUrl);
            }
            if (StringUtils.isNotBlank(fallbackKey)) {
                registerAssetKey(mapping.fallback, fallbackKey, targetUrl);
                int slashIndex = fallbackKey.lastIndexOf('/');
                if (slashIndex >= 0 && slashIndex + 1 < fallbackKey.length()) {
                    registerAssetKey(mapping.fallback, fallbackKey.substring(slashIndex + 1), targetUrl);
                }
            }
        }

        private void registerAssetKey(Map<String, String> mapping, String key, String targetUrl) {
            if (StringUtils.isBlank(key)) return;
            mapping.merge(key, targetUrl, (existing, incoming) -> existing.equals(incoming) ? existing : "");
        }

        private String resolveAssetKey(Map<String, String> mapping, String key) {
            if (!mapping.containsKey(key)) return null;
            String target = mapping.get(key);
            if (StringUtils.isBlank(target)) throw new IllegalArgumentException("资源引用存在多个同名文件，无法确定: " + key);
            return target;
        }

        private String resolveImportedAssetUrl(String current, AssetMappings mapping, String marker, boolean allowFileNameFallback, String location) {
            String normalized = current == null ? "" : current.trim();
            if (StringUtils.isBlank(normalized)) {
                return normalized;
            }
            String normalizedPath = normalized.replace('\\', '/');
            // TODO(legacy-compat): Review old local and Desktop URL handling if their package formats are retired; current Desktop imports also use this mapping.
            boolean desktopAsset = normalized.startsWith("http://asset.localhost/") || normalized.startsWith("asset://localhost/");
            boolean externalUrl = normalized.regionMatches(true, 0, "http://", 0, 7)
                    || normalized.regionMatches(true, 0, "https://", 0, 8) || normalized.startsWith("//");
            boolean urlPath = desktopAsset || externalUrl || normalizedPath.startsWith("/static/") || normalizedPath.startsWith("static/");
            int query = urlPath ? normalizedPath.indexOf('?') : -1;
            int fragment = urlPath ? normalizedPath.indexOf('#') : -1;
            int suffixStart = query < 0 ? fragment : fragment < 0 ? query : Math.min(query, fragment);
            String suffix = suffixStart < 0 ? "" : normalizedPath.substring(suffixStart);
            String exactTarget = resolveAssetKey(mapping.exact, normalizedPath);
            if (exactTarget != null) return exactTarget + suffix;
            // An external URL is not a local asset merely because its filename
            // matches one in the package; only an exact manifest mapping is safe.
            if (externalUrl && !desktopAsset) return normalized;
            if (!desktopAsset && normalized.matches("(?i)^[a-z][a-z0-9+.-]*:.*")
                    && !normalizedPath.matches("(?i)^[a-z]:/.*")) {
                if (normalized.regionMatches(true, 0, "file:", 0, 5)) recordMissingAsset(location);
                return normalized;
            }
            if (suffixStart >= 0) normalizedPath = normalizedPath.substring(0, suffixStart);
            List<String> candidates = new ArrayList<>();
            candidates.add(normalizedPath);

            String decoded = normalizedPath;
            if (desktopAsset) {
                decoded = java.net.URLDecoder.decode(
                        normalizedPath
                                .replaceFirst("^http://asset\\.localhost/", "")
                                .replaceFirst("^asset://localhost/", "")
                                .replace("+", "%2B"),
                        StandardCharsets.UTF_8
                ).replace('\\', '/');
                candidates.add(decoded);
            }

            String extracted = extractAssetCandidate(normalizedPath, marker);
            if (StringUtils.isNotBlank(extracted)) {
                candidates.add(extracted);
            }
            String extractedDecoded = extractAssetCandidate(decoded, marker);
            if (StringUtils.isNotBlank(extractedDecoded)) {
                candidates.add(extractedDecoded);
            }

            for (String candidate : candidates) {
                String target = resolveAssetKey(mapping.exact, candidate);
                if (target != null) return target + suffix;
            }

            String normalizedDecoded = decoded.replace('\\', '/');
            String exactSuffix = resolveAssetSuffix(mapping.exact, normalizedPath, normalizedDecoded, false);
            if (exactSuffix != null) return exactSuffix + suffix;
            for (String candidate : candidates) {
                String target = resolveAssetKey(mapping.fallback, candidate);
                if (target != null) return target + suffix;
            }
            String fallbackSuffix = resolveAssetSuffix(mapping.fallback, normalizedPath, normalizedDecoded, allowFileNameFallback);
            if (fallbackSuffix != null) return fallbackSuffix + suffix;
            if (allowFileNameFallback) {
                String target = resolveAssetKey(mapping.fallback, extractTail(decoded));
                if (target != null) return target + suffix;
            }
            recordMissingAsset(location);
            return normalized;
        }

        private void recordMissingAsset(String location) {
            writeContext.missingAssetLocations.add((targetProjectId == null ? "" : "项目 " + targetProjectId + "：") + location);
        }

        private String resolveAssetSuffix(Map<String, String> mapping, String normalizedPath, String normalizedDecoded, boolean allowFileNameFallback) {
            String bestKey = null;
            for (Map.Entry<String, String> entry : mapping.entrySet()) {
                String key = entry.getKey();
                if ((normalizedPath.endsWith("/" + key) || normalizedDecoded.endsWith("/" + key))
                        && (allowFileNameFallback || key.indexOf('/') >= 0)
                        && (bestKey == null || key.length() > bestKey.length())) bestKey = key;
            }
            if (bestKey != null) return resolveAssetKey(mapping, bestKey);
            return null;
        }

        private static String extractAssetCandidate(String value, String marker) {
            String normalized = value == null ? "" : value.replace('\\', '/');
            int index = normalized.lastIndexOf(marker);
            if (index >= 0) {
                return normalized.substring(index + marker.length()).replaceFirst("^/+", "");
            }
            return null;
        }

        private static String extractTail(String value) {
            if (StringUtils.isBlank(value)) {
                return null;
            }
            String normalized = value.replace('\\', '/');
            int index = normalized.lastIndexOf('/');
            return index >= 0 ? normalized.substring(index + 1) : normalized;
        }
    }
}
