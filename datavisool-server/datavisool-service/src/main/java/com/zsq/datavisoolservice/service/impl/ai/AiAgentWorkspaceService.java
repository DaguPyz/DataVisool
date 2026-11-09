/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.util.JsonFormatter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.PathMatcher;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 项目级 AI Agent Workspace 文件服务。
 *
 * <p>Workspace 只接受相对路径，项目目录彼此隔离；读操作不返回物理路径，写操作使用
 * expectedRevision 做乐观并发控制。每次写入都在同级 staging 目录完成校验，最后交换目录，
 * 因而一个 Patch 失败时不会留下半套文件。</p>
 */
@Service
public class AiAgentWorkspaceService {
    public static final int DEFAULT_LIST_DEPTH = 3;
    public static final int MAX_LIST_DEPTH = 32;
    public static final int DEFAULT_LIST_LIMIT = 100;
    public static final int MAX_LIST_LIMIT = 200;
    public static final int DEFAULT_SEARCH_RESULTS = 50;
    public static final int MAX_SEARCH_RESULTS = 100;
    public static final int MAX_READ_LINES = 400;
    public static final int MAX_PATCH_OPERATIONS = 64;
    public static final int MAX_PATCH_BYTES = 512 * 1024;
    public static final int MAX_CANVAS_ARTIFACT_CHUNK_BYTES = 8 * 1024;
    public static final long MAX_FILE_BYTES = 2L * 1024L * 1024L;
    public static final int MAX_WORKSPACE_FILES = 2_000;
    public static final long MAX_WORKSPACE_BYTES = 100L * 1024L * 1024L;
    public static final int MAX_OUTPUT_BYTES = 512 * 1024;
    public static final int MAX_MATCH_TEXT_BYTES = 8 * 1024;

    private static final String META_DIRECTORY = ".datavisool-agent-workspace";
    // TODO(data-protection): 移除旧工作区保护前，先确认不再存在需要保留的旧版本记录。
    @Deprecated(forRemoval = true)
    private static final String LEGACY_META_DIRECTORY = ".lcp-agent-workspace";
    private static final String REVISION_FILE = "revision";
    private static final String FILE_REVISIONS_FILE = "file-revisions";
    private static final ObjectMapper STRICT_JSON_MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final ConcurrentHashMap<String, Object> WORKSPACE_LOCKS = new ConcurrentHashMap<>();

    private final Path storageRoot;
    private final Path workspacesRoot;

    @Autowired
    public AiAgentWorkspaceService(
            @Value("${datavisool.ai.storage-path:}") String configuredStoragePath,
            @Value("${datavisool.resource-path.root:}") String resourceRoot
    ) {
        String configured = configuredStoragePath == null ? "" : configuredStoragePath.trim();
        if (configured.isEmpty()) {
            configured = resourceRoot == null ? "" : resourceRoot.trim();
        }
        if (configured.isEmpty()) {
            configured = System.getProperty("user.dir");
        }
        this.storageRoot = Path.of(configured).toAbsolutePath().normalize();
        this.workspacesRoot = storageRoot.resolve("agent-project-workspaces");
    }

    /** 供单元测试和非 Spring 调用使用；storageRoot 不会出现在任何返回值中。 */
    public AiAgentWorkspaceService(Path storageRoot) {
        this.storageRoot = Objects.requireNonNull(storageRoot, "storageRoot").toAbsolutePath().normalize();
        this.workspacesRoot = this.storageRoot.resolve("agent-project-workspaces");
    }

    public long workspaceRevision(long projectId) {
        synchronized (lockFor(projectId)) {
            return readRevision(ensureProject(projectId));
        }
    }

    public long getWorkspaceRevision(long projectId) {
        return workspaceRevision(projectId);
    }

    public ListResult listWorkspaceFiles(long projectId, String path, int depth, int offset, int limit) {
        if (depth < 1 || depth > MAX_LIST_DEPTH) {
            throw invalid("list depth is outside the supported range", "depth", depth,
                    "integer between 1 and " + MAX_LIST_DEPTH);
        }
        if (offset < 0) {
            throw invalid("list offset must be non-negative", "offset", offset, "integer >= 0");
        }
        if (limit < 1 || limit > MAX_LIST_LIMIT) {
            throw invalid("list limit is outside the supported range", "limit", limit,
                    "integer between 1 and " + MAX_LIST_LIMIT);
        }
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            String prefix = normalizeRelative(path, true);
            Path scopedRoot = resolveSafe(root, prefix, false);
            if (!Files.isDirectory(scopedRoot)) {
                throw invalid("list path does not resolve to a directory", "path", prefix,
                        "existing directory inside the project Workspace",
                        Map.of("actualState", Map.of("exists", Files.exists(scopedRoot),
                                "directory", false, "regularFile", Files.isRegularFile(scopedRoot))));
            }
            long revision = readRevision(root);
            Map<String, Long> fileRevisions = readFileRevisions(root);
            List<ListEntry> all = new ArrayList<>();
            try {
                Files.walkFileTree(scopedRoot, Set.of(), depth, new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                        if (dir.equals(scopedRoot)) {
                            return FileVisitResult.CONTINUE;
                        }
                        addEntry(dir, true);
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                        addEntry(file, false);
                        return FileVisitResult.CONTINUE;
                    }

                    private void addEntry(Path entry, boolean directory) {
                        String relative = relativePath(root, entry);
                        if (relative.isEmpty() || isMetadataPath(relative)) {
                            return;
                        }
                        try {
                            long size = directory ? 0 : Files.size(entry);
                            all.add(new ListEntry(relative, directory ? "directory" : "file", size,
                                    directory ? 0L : fileRevisions.getOrDefault(relative, 0L)));
                        } catch (IOException e) {
                            throw storageFailure("读取 Workspace 条目大小失败", "path", relative,
                                    "readable Workspace entry", "read file size", e);
                        }
                    }
                });
            } catch (IOException e) {
                throw storageFailure("读取 Workspace 列表失败", "path", prefix,
                        "traversable directory", "list directory entries", e);
            } catch (UncheckedIOException e) {
                throw storageFailure("读取 Workspace 列表失败", "path", prefix,
                        "traversable directory", "list directory entries", e.getCause() == null ? e : e.getCause());
            }
            all.sort(Comparator.comparing(ListEntry::path).thenComparing(ListEntry::entryType));
            int end = Math.min(all.size(), offset + limit);
            List<ListEntry> page = offset >= all.size() ? List.of() : List.copyOf(all.subList(offset, end));
            boolean hasMore = end < all.size();
            ListResult result = new ListResult(revision, page, all.size(), offset, hasMore, hasMore ? end : null);
            ensureOutputWithinLimit(result);
            return result;
        }
    }

    public ListResult listWorkspaceFiles(long projectId, String path) {
        return listWorkspaceFiles(projectId, path, DEFAULT_LIST_DEPTH, 0, DEFAULT_LIST_LIMIT);
    }

    public ListResult list(long projectId, String path, int depth, int offset, int limit) {
        return listWorkspaceFiles(projectId, path, depth, offset, limit);
    }

    public SearchResult searchWorkspaceFiles(long projectId, SearchRequest request) {
        if (request == null) throw invalid("search request is required", "request", null, "search request object");
        String query = request.query();
        if (query == null) throw invalid("search query is required", "query", null, "string with 1–1024 characters");
        if (query.isEmpty() || query.length() > 1024) {
            throw invalid("search query must contain between 1 and 1024 characters", "query", query, "1–1024 characters");
        }
        if (request.maxResults() < 0) {
            throw invalid("maxResults must be non-negative; 0 selects the default", "maxResults", request.maxResults(),
                    "integer between 0 and " + MAX_SEARCH_RESULTS);
        }
        int maxResults = request.maxResults() == 0 ? DEFAULT_SEARCH_RESULTS : request.maxResults();
        if (maxResults > MAX_SEARCH_RESULTS) {
            throw invalid("maxResults exceeds the maximum", "maxResults", maxResults, "integer <= " + MAX_SEARCH_RESULTS);
        }
        String prefix = normalizeRelative(request.path(), true);
        Pattern pattern = compileSearchPattern(query, request.mode(), request.caseMode());
        List<String> globs = request.globs() == null ? List.of() : new ArrayList<>(request.globs());
        if (globs.size() > 20) {
            throw invalid("search globs must contain at most 20 items", "globs", globs,
                    "array with 0–20 patterns", Map.of("actualCount", globs.size()));
        }
        for (int globIndex = 0; globIndex < globs.size(); globIndex++) {
            String glob = globs.get(globIndex);
            validateGlob(glob, globIndex);
        }
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            Path scopedRoot = resolveSafe(root, prefix, true);
            if (!Files.isDirectory(scopedRoot)) {
                throw invalid("search path must resolve to an existing directory", "path", prefix,
                        "existing directory inside the project Workspace",
                        Map.of("actualState", Map.of("exists", Files.exists(scopedRoot),
                                "directory", false, "regularFile", Files.isRegularFile(scopedRoot))));
            }
            long searchedRevision = readRevision(root);
            long startedAt = System.nanoTime();
            List<String> ignorePatterns = request.respectIgnoreFiles() ? readIgnorePatterns(root) : List.of();
            List<SearchMatch> collectedMatches = new ArrayList<>();
            try {
                Files.walkFileTree(scopedRoot, new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                        String relative = relativePath(root, dir);
                        if (!relative.isEmpty() && isMetadataPath(relative)) {
                            return FileVisitResult.SKIP_SUBTREE;
                        }
                        if (!request.includeHidden() && !relative.isEmpty() && containsHidden(relative)) {
                            return FileVisitResult.SKIP_SUBTREE;
                        }
                        if (request.respectIgnoreFiles() && (isIgnoredDirectory(relative) || matchesIgnore(relative, ignorePatterns))) {
                            return FileVisitResult.SKIP_SUBTREE;
                        }
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                        if (collectedMatches.size() >= maxResults + 1) {
                            return FileVisitResult.TERMINATE;
                        }
                        String relative = relativePath(root, file);
                        if (isMetadataPath(relative) || (!request.includeHidden() && containsHidden(relative))
                                || (request.respectIgnoreFiles() && matchesIgnore(relative, ignorePatterns))
                                || !matchesGlob(relative, globs)) {
                            return FileVisitResult.CONTINUE;
                        }
                        try {
                            if (Files.size(file) > MAX_FILE_BYTES) {
                                return FileVisitResult.CONTINUE;
                            }
                            java.util.regex.Matcher pathMatcher = pattern.matcher(relative);
                            if (pathMatcher.find()) {
                                collectedMatches.add(new SearchMatch(
                                        relative,
                                        null,
                                        pathMatcher.start() + 1,
                                        truncate(relative, MAX_MATCH_TEXT_BYTES),
                                        truncate(relative, MAX_MATCH_TEXT_BYTES),
                                        "path",
                                        submatches(pathMatcher)
                                ));
                                if (collectedMatches.size() > maxResults) {
                                    return FileVisitResult.TERMINATE;
                                }
                            }
                            String content = readUtf8(file, relative);
                            String[] lines = splitLines(content);
                            for (int i = 0; i < lines.length && collectedMatches.size() <= maxResults; i++) {
                                java.util.regex.Matcher matcher = pattern.matcher(lines[i]);
                                if (matcher.find()) {
                                    String text = truncate(lines[i], MAX_MATCH_TEXT_BYTES);
                                    collectedMatches.add(new SearchMatch(
                                            relative,
                                            i + 1,
                                            matcher.start() + 1,
                                            text,
                                            text,
                                            "content",
                                            submatches(matcher)
                                    ));
                                    if (collectedMatches.size() > maxResults) {
                                        return FileVisitResult.TERMINATE;
                                    }
                                }
                            }
                        } catch (IOException e) {
                            throw storageFailure("搜索 Workspace 文件失败", "path", relative,
                                    "readable Workspace file", "read file content for search", e);
                        }
                        return FileVisitResult.CONTINUE;
                    }
                });
            } catch (IOException e) {
                throw storageFailure("搜索 Workspace 失败", "path", prefix,
                        "traversable search directory", "walk and search files", e);
            } catch (UncheckedIOException e) {
                throw storageFailure("搜索 Workspace 失败", "path", prefix,
                        "traversable search directory", "walk and search files", e.getCause() == null ? e : e.getCause());
            }
            List<SearchMatch> matches = collectedMatches;
            boolean truncated = matches.size() > maxResults;
            if (truncated) {
                matches = new ArrayList<>(matches.subList(0, maxResults));
            }
            int matchedFiles = (int) matches.stream().map(SearchMatch::path).distinct().count();
            int matchedLines = (int) matches.stream().filter(match -> match.line() != null).count();
            SearchResult result = new SearchResult(
                    searchedRevision,
                    searchedRevision,
                    List.copyOf(matches),
                    truncated,
                    truncated,
                    truncated ? "resultLimit" : null,
                    matchedFiles,
                    matchedLines,
                    TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt)
            );
            return fitSearchResult(result);
        }
    }

    public SearchResult searchWorkspaceFiles(long projectId, String query) {
        return searchWorkspaceFiles(projectId, new SearchRequest(query, "", SearchMode.LITERAL, CaseMode.SENSITIVE, List.of(), false, true, DEFAULT_SEARCH_RESULTS));
    }

    public SearchResult search(long projectId, SearchRequest request) {
        return searchWorkspaceFiles(projectId, request);
    }

    public FileExcerpt readWorkspaceFile(long projectId, String path, int startLine, int endLine) {
        if (startLine < 1 || endLine < startLine || endLine - startLine + 1 > MAX_READ_LINES) {
            Map<String, Object> rangeDetails = new LinkedHashMap<>();
            if (path != null) rangeDetails.put("path", path);
            if (startLine < 1) throw invalid("read startLine must be a positive line number", "startLine", startLine,
                    "integer >= 1", rangeDetails);
            if (endLine < startLine) throw invalid("read endLine must be greater than or equal to startLine", "endLine",
                    endLine, "integer >= startLine (" + startLine + ")", rangeDetails);
            throw invalid("requested read range exceeds the line limit", "endLine", endLine,
                    "a range of at most " + MAX_READ_LINES + " lines starting at " + startLine, rangeDetails);
        }
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            String relative = normalizeRelative(path, false);
            Path file = resolveSafe(root, relative, true);
            if (!Files.isRegularFile(file)) {
                throw invalid("Workspace path does not resolve to an existing file", "path", relative,
                        "existing regular file inside the project Workspace");
            }
            try {
                String content = readUtf8(file, relative);
                LineRange range = resolveLineRange(content, startLine, endLine, relative);
                long revision = readRevision(root);
                long modifiedRevision = readFileRevisions(root).getOrDefault(relative, 0L);
                FileExcerpt excerpt = new FileExcerpt(relative, startLine, range.endLine(), range.totalLines(), range.content(), sha256(content), modifiedRevision, revision);
                ensureOutputWithinLimit(excerpt);
                return excerpt;
            } catch (IOException e) {
                throw storageFailure("读取 Workspace 文件失败", "path", relative,
                        "readable UTF-8 regular file", "read requested file lines", e);
            }
        }
    }

    public FileExcerpt readWorkspaceFile(long projectId, String path) {
        return readWorkspaceFile(projectId, path, 1, 160);
    }

    public FileExcerpt read(long projectId, String path, int startLine, int endLine) {
        return readWorkspaceFile(projectId, path, startLine, endLine);
    }

    public MutationResult applyWorkspacePatch(long projectId, long expectedRevision, String patch) {
        ParsedPatch parsed = parsePatch(patch);
        return mutate(projectId, expectedRevision, (stage, currentRevision) -> {
            Set<String> files = collectFiles(stage);
            Set<String> touched = new HashSet<>();
            List<String> added = new ArrayList<>();
            List<String> modified = new ArrayList<>();
            List<String> deleted = new ArrayList<>();
            List<MovedPath> moved = new ArrayList<>();
            boolean changed = false;
            for (PatchOperation operation : parsed.operations()) {
                if (operation instanceof AddOperation add) {
                    String path = add.path();
                    touch(touched, path);
                    Path target = resolveSafe(stage, path, true);
                    if (Files.exists(target)) {
                        throw invalid("Add File target already exists", "path", path,
                                "non-existing path inside the project Workspace",
                                Map.of("actualState", Map.of("exists", true,
                                        "directory", Files.isDirectory(target), "regularFile", Files.isRegularFile(target))));
                    }
                    validateText(add.content(), path);
                    writeText(stage, path, add.content());
                    files.add(path);
                    added.add(path);
                    changed = true;
                } else if (operation instanceof DeleteOperation delete) {
                    String path = delete.path();
                    touch(touched, path);
                    Path target = resolveSafe(stage, path, true);
                    if (!Files.isRegularFile(target)) {
                        throw invalid("Delete File target does not resolve to an existing regular file: " + path,
                                "path", path, "existing regular file inside the project Workspace");
                    }
                    Files.delete(target);
                    files.remove(path);
                    deleted.add(path);
                    changed = true;
                } else if (operation instanceof UpdateOperation update) {
                    String source = update.path();
                    touch(touched, source);
                    Path sourceFile = resolveSafe(stage, source, true);
                    if (!Files.isRegularFile(sourceFile)) {
                        throw invalid("Update File source does not resolve to an existing regular file: " + source,
                                "path", source, "existing regular file inside the project Workspace");
                    }
                    String oldContent = readUtf8(sourceFile, source);
                    String newContent = applyHunks(oldContent, update.hunks(), source);
                    String target = update.moveTo() == null ? source : update.moveTo();
                    if (!target.equals(source)) {
                        touch(touched, target);
                        Path targetFile = resolveSafe(stage, target, true);
                        if (Files.exists(targetFile)) {
                            throw invalid("Move target already exists", "moveTo", target,
                                    "non-existing path inside the project Workspace",
                                    Map.of("sourcePath", source, "actualState", Map.of("exists", true,
                                            "directory", Files.isDirectory(targetFile), "regularFile", Files.isRegularFile(targetFile))));
                        }
                        validateText(newContent, target);
                        writeText(stage, target, newContent);
                        Files.delete(sourceFile);
                        files.remove(source);
                        files.add(target);
                        moved.add(new MovedPath(source, target));
                        changed = true;
                    } else if (!oldContent.equals(newContent)) {
                        validateText(newContent, target);
                        writeText(stage, target, newContent);
                        modified.add(source);
                        changed = true;
                    }
                }
            }
            return new MutationOutcome(changed, added, modified, deleted, moved);
        });
    }

    public MutationResult applyPatch(long projectId, long expectedRevision, String patch) {
        return applyWorkspacePatch(projectId, expectedRevision, patch);
    }

    RepairArtifact beginCanvasArtifact(long projectId, String runId, String toolName) {
        if (runId == null || runId.isBlank()) throw invalid("runId is required", "runId", runId,
                "non-empty run identifier");
        if (toolName == null || toolName.isBlank()) throw invalid("toolName is required", "toolName", toolName,
                "supported canvas artifact tool name");
        if (!Set.of("create_canvas_components", "render_draft", "patch_canvas_components").contains(toolName))
            throw invalid("unsupported canvas artifact tool", "toolName", toolName,
                    List.of("create_canvas_components", "render_draft", "patch_canvas_components"));
        synchronized (lockFor(projectId)) {
            String id = UUID.randomUUID().toString();
            String path = "agent-repairs/" + id + ".txt";
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("runId", runId);
            metadata.put("toolName", toolName);
            metadata.put("field", "");
            metadata.put("payload", Map.of());
            metadata.put("operationId", "tool-repair-" + id);
            metadata.put("staged", true);
            mutate(projectId, workspaceRevision(projectId), (stage, revision) -> {
                writeText(stage, path, "");
                writeRepairMetadata(stage, path, metadata);
                return new MutationOutcome(true, List.of(path), List.of(), List.of(), List.of());
            });
            return readRepairArtifact(projectId, runId, path);
        }
    }

    RepairArtifact appendCanvasArtifact(long projectId, String runId, String path,
                                        long expectedRevision, String content) {
        if (content == null || content.isEmpty()) throw invalid("artifact chunk must be non-empty UTF-8 text",
                "content", content, "non-empty UTF-8 string",
                path == null ? Map.of() : Map.of("path", path));
        byte[] encoded = content.getBytes(StandardCharsets.UTF_8);
        if (!new String(encoded, StandardCharsets.UTF_8).equals(content))
            throw invalid("artifact chunk contains characters that cannot be encoded as UTF-8",
                    "content", content, "well-formed UTF-16 string encodable as UTF-8",
                    Map.of("path", Objects.toString(path, "")));
        if (encoded.length > MAX_CANVAS_ARTIFACT_CHUNK_BYTES) throw sizeLimit(
                "artifact chunk exceeds the UTF-8 size limit", "content.byteLength", (long) encoded.length,
                encoded.length, MAX_CANVAS_ARTIFACT_CHUNK_BYTES,
                Map.of("path", Objects.toString(path, "")));
        synchronized (lockFor(projectId)) {
            mutate(projectId, expectedRevision, (stage, revision) -> {
                Map<String, Object> metadata = repairMetadata(stage, runId, path);
                requireStagedArtifact(metadata, path);
                if (metadata.containsKey("submitted")) throw submittedArtifactFailure(path, metadata, "append");
                Path target = resolveSafe(stage, path, false);
                String previous = readUtf8(target);
                Path source = repairSource(stage, path);
                // 不能拼接已格式化的片段：例如 "1 " 的末尾空白被删掉后，追加 "2" 会误变成 12。
                // 原始块只用于拼接；对外的产物文件始终保存累计文本整体格式化后的结果。
                String raw = Files.isRegularFile(source)
                        && sha256(previous).equals(metadata.get("sourceArtifactSha256"))
                        ? readUtf8(source) : previous;
                writeFormattedArtifact(stage, path, metadata, raw + content);
                metadata.remove("validated");
                writeRepairMetadata(stage, path, metadata);
                return new MutationOutcome(true, List.of(), List.of(path), List.of(), List.of());
            });
            return readRepairArtifact(projectId, runId, path);
        }
    }

    RepairArtifact recordArtifactValidation(long projectId, String runId, String path, String contentSha256) {
        if (contentSha256 == null || !contentSha256.matches("[0-9a-f]{64}"))
            throw invalid("contentSha256 must be a lowercase SHA-256 digest", "contentSha256", contentSha256,
                    "64 lowercase hexadecimal characters", Map.of("path", Objects.toString(path, "")));
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            Map<String, Object> metadata = repairMetadata(root, runId, path);
            requireStagedArtifact(metadata, path);
            if (metadata.containsKey("submitted")) throw submittedArtifactFailure(path, metadata, "validate");
            String content = readArtifactContent(root, path);
            String actualSha256 = sha256(content);
            if (!actualSha256.equals(contentSha256)) throw invalid("contentSha256 does not match the current artifact",
                    "contentSha256", contentSha256, actualSha256,
                    Map.of("path", path, "actualArtifactSha256", actualSha256));
            Map<String, Object> validated = metadata.get("validated") instanceof Map<?, ?> value
                    ? ComponentDocumentParser.cast(value) : Map.of();
            if (actualSha256.equals(validated.get("contentSha256"))) {
                return readRepairArtifact(projectId, runId, path);
            }

            long revision = readRevision(root);
            mutate(projectId, revision, (stage, currentRevision) -> {
                Map<String, Object> stagedMetadata = repairMetadata(stage, runId, path);
                requireStagedArtifact(stagedMetadata, path);
                if (stagedMetadata.containsKey("submitted")) throw submittedArtifactFailure(path, stagedMetadata, "validate");
                String stagedContent = readArtifactContent(stage, path);
                String stagedSha256 = sha256(stagedContent);
                if (!actualSha256.equals(stagedSha256)) throw invalid("artifact content changed while validation was being recorded",
                        "contentSha256", stagedSha256, actualSha256,
                        Map.of("path", path, "runId", runId));
                stagedMetadata.put("validated", Map.of(
                        "contentSha256", actualSha256,
                        "workspaceRevision", Math.addExact(currentRevision, 1L)));
                writeRepairMetadata(stage, path, stagedMetadata);
                return new MutationOutcome(true, List.of(), List.of(), List.of(), List.of());
            });
            return readRepairArtifact(projectId, runId, path);
        }
    }

    <T> T withRepairArtifact(long projectId, String runId, String path, long expectedRevision,
                             java.util.function.Function<RepairArtifact, T> action) {
        Objects.requireNonNull(action, "action");
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            long actualRevision = readRevision(root);
            if (actualRevision != expectedRevision)
                throw new RevisionConflictException(expectedRevision, actualRevision);
            return action.apply(readRepairArtifact(projectId, runId, path));
        }
    }

    RepairArtifact readRepairArtifact(long projectId, String runId, String path) {
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            Map<String, Object> metadata = repairMetadata(root, runId, path);
            try {
                return new RepairArtifact(path, metadata.get("toolName").toString(), metadata.get("field").toString(),
                        ComponentDocumentParser.cast((Map<?, ?>) metadata.get("payload")),
                        metadata.get("operationId").toString(), readUtf8(resolveSafe(root, path, false)), readRevision(root),
                        metadata.get("submitted") instanceof Map<?, ?> m ? ComponentDocumentParser.cast(m) : Map.of(),
                        Boolean.TRUE.equals(metadata.get("staged")),
                        metadata.get("validated") instanceof Map<?, ?> m ? ComponentDocumentParser.cast(m) : Map.of());
            } catch (IOException e) {
                throw storageFailure("读取修复产物失败", "path", path,
                        "existing readable repair artifact", "read artifact content", e);
            }
        }
    }

    RepairArtifact patchRepairArtifact(long projectId, String runId, String path, long expectedRevision,
                                       List<RepairEdit> edits) {
        if (edits == null || edits.isEmpty()) {
            Map<String, Object> extra = new LinkedHashMap<>();
            if (path != null) extra.put("path", path);
            throw invalid("at least one repair edit is required", "edits", edits,
                    "non-empty array of {oldText,newText} edits", extra);
        }
        synchronized (lockFor(projectId)) {
            mutate(projectId, expectedRevision, (stage, revision) -> {
                Map<String, Object> metadata = repairMetadata(stage, runId, path);
                if (metadata.containsKey("submitted")) throw submittedArtifactFailure(path, metadata, "edit");
                Path target = resolveSafe(stage, path, false);
                String original = readUtf8(target);
                String content = original;
                for (int editIndex = 0; editIndex < edits.size(); editIndex++) {
                    RepairEdit edit = edits.get(editIndex);
                    if (edit == null) {
                        Map<String, Object> extra = new LinkedHashMap<>();
                        if (path != null) extra.put("path", path);
                        extra.put("editIndex", editIndex);
                        extra.put("editNumber", editIndex + 1);
                        throw invalid("repair edit must be an object with oldText and newText", "edits[" + editIndex + "]",
                                null, "object with non-empty string oldText and string newText",
                                extra);
                    }
                    if (edit.oldText() == null || edit.oldText().isEmpty() || edit.newText() == null) {
                        String field = "edits[" + editIndex + "]";
                        Map<String, Object> actual = new LinkedHashMap<>();
                        actual.put("oldText", edit.oldText());
                        actual.put("newText", edit.newText());
                        throw invalid("each edit must provide non-empty oldText and string newText", field,
                                actual, "object with non-empty string oldText and string newText",
                                Map.of("path", path, "editIndex", editIndex, "editNumber", editIndex + 1));
                    }
                    if (edit.oldText().equals(edit.newText())) {
                        throw invalid("edit does not change the artifact because oldText equals newText",
                                "edits[" + editIndex + "]", Map.of("oldText", edit.oldText(), "newText", edit.newText()),
                                "newText different from oldText",
                                Map.of("path", path, "editIndex", editIndex, "editNumber", editIndex + 1));
                    }
                    List<Map<String, Object>> locations = matchLocations(content, edit.oldText(), 20);
                    int matchCount = countMatches(content, edit.oldText());
                    if (matchCount != 1) {
                        String message = matchCount == 0
                                ? "oldText was not found in the current artifact"
                                : "oldText is ambiguous because it occurs " + matchCount + " times in the current artifact";
                        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.invalid", message,
                                "edits[" + editIndex + "].oldText", edit.oldText(), "exactly one occurrence in the current artifact");
                        details.put("path", path);
                        details.put("editIndex", editIndex);
                        details.put("editNumber", editIndex + 1);
                        details.put("matchCount", matchCount);
                        details.put("matchLocations", locations);
                        details.put("matchLocationsTruncated", matchCount > locations.size());
                        details.put("recovery", "Read the current artifact at path and use a unique oldText copied from that version.");
                        throw new WorkspaceException("workspace.invalid", message, details);
                    }
                    int offset = content.indexOf(edit.oldText());
                    content = content.substring(0, offset) + edit.newText() + content.substring(offset + edit.oldText().length());
                }
                String formatted = JsonFormatter.format(content);
                boolean changed = !original.equals(content) || !original.equals(formatted);
                if (changed) {
                    writeFormattedArtifact(stage, path, metadata, content);
                    metadata.remove("validated");
                    writeRepairMetadata(stage, path, metadata);
                }
                return new MutationOutcome(changed, List.of(), List.of(path), List.of(), List.of());
            });
            return readRepairArtifact(projectId, runId, path);
        }
    }

    /** 兼容历史文件和通用 Workspace 写入：校验前先格式化保存，再读取真实文件版本。 */
    RepairArtifact formatRepairArtifact(long projectId, String runId, String path, long expectedRevision) {
        return withRepairArtifact(projectId, runId, path, expectedRevision, artifact -> {
            if (!artifact.submitted().isEmpty()) throw invalid("submitted repair artifact cannot be reformatted",
                    "submitted", artifact.submitted(), "no submitted result",
                    Map.of("path", path, "runId", runId, "toolName", artifact.toolName()));
            if (artifact.content().equals(JsonFormatter.format(artifact.content()))) return artifact;
            mutate(projectId, expectedRevision, (stage, revision) -> {
                Map<String, Object> metadata = repairMetadata(stage, runId, path);
                if (metadata.containsKey("submitted")) throw submittedArtifactFailure(path, metadata, "format");
                String original = readArtifactContent(stage, path);
                writeFormattedArtifact(stage, path, metadata, original);
                metadata.remove("validated");
                writeRepairMetadata(stage, path, metadata);
                return new MutationOutcome(true, List.of(), List.of(path), List.of(), List.of());
            });
            return readRepairArtifact(projectId, runId, path);
        });
    }

    private static void writeFormattedArtifact(Path root, String path, Map<String, Object> metadata, String raw)
            throws IOException {
        validateText(raw, path);
        String formatted = JsonFormatter.format(raw);
        writeText(root, path, formatted);
        if (Boolean.TRUE.equals(metadata.get("staged"))) {
            Path source = repairSource(root, path);
            Files.createDirectories(source.getParent());
            Files.writeString(source, raw, StandardCharsets.UTF_8);
            // 通用 Workspace 修改过公开文件时，下一次追加必须从最新文件开始，不能恢复旧缓存。
            metadata.put("sourceArtifactSha256", sha256(formatted));
        }
    }

    private static Path repairSource(Path root, String path) {
        Path descriptor = repairDescriptor(root, path);
        String name = descriptor.getFileName().toString();
        return descriptor.resolveSibling(name.substring(0, name.length() - 5) + ".source");
    }

    void recordRepairSubmission(long projectId, String runId, String path, Map<String, Object> submitted) {
        if (submitted == null) throw invalid("submitted receipt is required", "submitted", null,
                "object containing the final submission result", Map.of("path", Objects.toString(path, "")));
        synchronized (lockFor(projectId)) {
            mutate(projectId, workspaceRevision(projectId), (stage, revision) -> {
                Map<String, Object> metadata = repairMetadata(stage, runId, path);
                if (metadata.containsKey("submitted")) throw submittedArtifactFailure(path, metadata, "submit");
                metadata.put("submitted", submitted);
                metadata.remove("sourceArtifactSha256");
                Files.deleteIfExists(repairSource(stage, path));
                writeRepairMetadata(stage, path, metadata);
                return new MutationOutcome(true, List.of(), List.of(), List.of(), List.of());
            });
        }
    }

    private static void requireStagedArtifact(Map<String, Object> metadata, String path) {
        if (!Boolean.TRUE.equals(metadata.get("staged"))) {
            Map<String, Object> details = new LinkedHashMap<>();
            if (path != null) details.put("path", path);
            details.put("runId", metadata.get("runId"));
            details.put("toolName", metadata.get("toolName"));
            details.put("metadataState", Map.of("staged", Boolean.TRUE.equals(metadata.get("staged")),
                    "submitted", metadata.containsKey("submitted")));
            if (!metadata.containsKey("staged")) details.put("actualType", "missing");
            throw invalid("repair artifact does not support chunked writing or validation", "staged",
                    metadata.get("staged"), true, details);
        }
    }

    private static WorkspaceException submittedArtifactFailure(String path, Map<String, Object> metadata, String action) {
        return invalid("submitted repair artifact cannot be changed or validated", "submitted", metadata.get("submitted"),
                "no submitted result", Map.of("path", Objects.toString(path, ""),
                        "runId", Objects.toString(metadata.get("runId"), "unknown"),
                        "toolName", Objects.toString(metadata.get("toolName"), "unknown"),
                        "action", action));
    }

    private static String readArtifactContent(Path root, String path) {
        try {
            return readUtf8(resolveSafe(root, path, false));
        } catch (IOException e) {
            throw storageFailure("读取修复产物失败", "path", path,
                    "existing readable repair artifact", "read artifact content", e);
        }
    }

    private static void writeRepairMetadata(Path root, String path, Map<String, Object> metadata) {
        Path descriptor = repairDescriptor(root, path);
        String serialized = JSON.toJSONString(metadata);
        validateText(serialized, "repair-metadata.json");
        try {
            Files.createDirectories(descriptor.getParent());
            Files.writeString(descriptor, serialized, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw storageFailure("写入修复产物信息失败", "path", path,
                    "writable repair metadata storage", "write repair metadata", e,
                    Map.of("metadataPath", relativePath(root, descriptor)));
        }
    }

    private static Path repairDescriptor(Path root, String path) {
        if (path == null || !path.matches("agent-repairs/[0-9a-f-]{36}\\.txt"))
            throw invalid("path must be the artifact path returned by a repair receipt", "path", path,
                    "agent-repairs/<36-character UUID>.txt");
        String id = path.substring("agent-repairs/".length(), path.length() - 4);
        return root.resolve(META_DIRECTORY).resolve("repairs").resolve(id + ".json");
    }

    private Map<String, Object> repairMetadata(Path root, String runId, String path) {
        if (runId == null || runId.isBlank()) {
            throw invalid("runId is required to access a repair artifact", "runId", runId,
                    "non-empty run identifier", Map.of("path", Objects.toString(path, "")));
        }
        Path descriptor = repairDescriptor(root, path);
        if (!Files.isRegularFile(descriptor)) throw invalid("repair artifact metadata does not exist",
                "path", path, "existing repair artifact with metadata",
                Map.of("metadataExists", Files.exists(descriptor), "metadataRegularFile", Files.isRegularFile(descriptor)));
        String serialized;
        try {
            serialized = readUtf8(descriptor, META_DIRECTORY + "/repairs/<artifact-id>.json");
        } catch (IOException e) {
            throw storageFailure("读取修复产物信息失败", "path", path,
                    "existing readable repair metadata", "read repair metadata", e);
        }
        Map<String, Object> metadata;
        try {
            metadata = JSON.parseObject(serialized);
        } catch (RuntimeException e) {
            throw invalid("repair artifact metadata is not valid JSON", "repairMetadata", serialized,
                    "valid repair metadata object",
                    Map.of("path", path, "metadataPath", META_DIRECTORY + "/repairs/<artifact-id>.json",
                            "parserReason", Objects.toString(e.getMessage(), e.getClass().getSimpleName())));
        }
        if (metadata == null) throw invalid("repair artifact metadata is empty", "path", path,
                "valid repair metadata object", Map.of("metadataPath", META_DIRECTORY + "/repairs/<artifact-id>.json"));
        if (!Objects.equals(runId, metadata.get("runId"))) throw invalid("repair artifact belongs to a different run",
                "runId", runId, metadata.get("runId"),
                Map.of("path", Objects.toString(path, ""), "toolName", Objects.toString(metadata.get("toolName"), "unknown")));
        for (String required : List.of("toolName", "field", "payload", "operationId")) {
            if (!metadata.containsKey(required) || metadata.get(required) == null) {
                throw invalid("repair artifact metadata is missing a required field", "repairMetadata." + required,
                        metadata.get(required), "present non-null metadata field",
                        Map.of("path", Objects.toString(path, ""), "metadataPath", META_DIRECTORY + "/repairs/<artifact-id>.json"));
            }
        }
        Object toolName = metadata.get("toolName");
        if (!(toolName instanceof String value) || !Set.of("create_canvas_components", "render_draft", "patch_canvas_components").contains(value)) {
            throw invalid("repair artifact metadata contains an unsupported toolName", "repairMetadata.toolName",
                    toolName, List.of("create_canvas_components", "render_draft", "patch_canvas_components"),
                    Map.of("path", Objects.toString(path, "")));
        }
        if (!(metadata.get("field") instanceof String)) {
            throw invalid("repair artifact metadata field must be a string", "repairMetadata.field",
                    metadata.get("field"), "string", Map.of("path", Objects.toString(path, "")));
        }
        if (!(metadata.get("payload") instanceof Map<?, ?>)) {
            throw invalid("repair artifact metadata payload must be an object", "repairMetadata.payload",
                    metadata.get("payload"), "object", Map.of("path", Objects.toString(path, "")));
        }
        if (!(metadata.get("operationId") instanceof String)) {
            throw invalid("repair artifact metadata operationId must be a string", "repairMetadata.operationId",
                    metadata.get("operationId"), "string", Map.of("path", Objects.toString(path, "")));
        }
        if (metadata.containsKey("staged") && !(metadata.get("staged") instanceof Boolean)) {
            throw invalid("repair artifact metadata staged must be a boolean", "repairMetadata.staged",
                    metadata.get("staged"), "boolean", Map.of("path", Objects.toString(path, "")));
        }
        if (metadata.containsKey("submitted") && !(metadata.get("submitted") instanceof Map<?, ?>)) {
            throw invalid("repair artifact submitted state must be an object", "repairMetadata.submitted",
                    metadata.get("submitted"), "object containing the submission receipt",
                    Map.of("path", Objects.toString(path, "")));
        }
        if (metadata.containsKey("validated") && !(metadata.get("validated") instanceof Map<?, ?>)) {
            throw invalid("repair artifact validation state must be an object", "repairMetadata.validated",
                    metadata.get("validated"), "object containing contentSha256 and workspaceRevision",
                    Map.of("path", Objects.toString(path, "")));
        }
        return metadata;
    }

    public MutationResult moveWorkspacePath(long projectId, String from, String to, long expectedRevision) {
        String source = normalizeRelative(from, false);
        String target = normalizeRelative(to, false);
        if (source.equals(target) || target.startsWith(source + "/") || source.startsWith(target + "/")) {
            throw invalid("move source and target cannot be equal or overlap by ancestry", "to", target,
                    "path different from and not an ancestor or descendant of from",
                    Map.of("from", source, "to", target));
        }
        return mutate(projectId, expectedRevision, (stage, currentRevision) -> {
            Path sourcePath = resolveSafe(stage, source, false);
            Path targetPath = resolveSafe(stage, target, true);
            if (!Files.exists(sourcePath) || Files.isSymbolicLink(sourcePath)) {
                throw invalid("move source does not resolve to an existing non-symlink path", "from", source,
                        "existing file or directory inside the project Workspace",
                        Map.of("actualState", Map.of("exists", Files.exists(sourcePath),
                                "symbolicLink", Files.isSymbolicLink(sourcePath))));
            }
            if (Files.exists(targetPath)) {
                throw invalid("move target already exists", "to", target,
                        "non-existing path inside the project Workspace",
                        Map.of("from", source, "actualState", Map.of("exists", true,
                                "directory", Files.isDirectory(targetPath), "regularFile", Files.isRegularFile(targetPath))));
            }
            validateMoveContents(stage, sourcePath, target);
            ensureParentDirectory(stage, target);
            Files.move(sourcePath, targetPath);
            List<MovedPath> moved = new ArrayList<>();
            if (Files.isDirectory(targetPath)) {
                Files.walkFileTree(targetPath, new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                        String suffix = targetPath.relativize(file).toString().replace('\\', '/');
                        moved.add(new MovedPath(source + (suffix.isEmpty() ? "" : "/" + suffix), target + (suffix.isEmpty() ? "" : "/" + suffix)));
                        return FileVisitResult.CONTINUE;
                    }
                });
            } else {
                moved.add(new MovedPath(source, target));
            }
            return new MutationOutcome(true, List.of(), List.of(), List.of(), moved);
        });
    }

    public MutationResult move(long projectId, String from, String to, long expectedRevision) {
        return moveWorkspacePath(projectId, from, to, expectedRevision);
    }

    public MutationResult deleteWorkspacePath(long projectId, String path, long expectedRevision) {
        String relative = normalizeRelative(path, false);
        return mutate(projectId, expectedRevision, (stage, currentRevision) -> {
            Path target = resolveSafe(stage, relative, false);
            if (!Files.exists(target) || Files.isSymbolicLink(target)) {
                throw invalid("delete target does not resolve to an existing non-symlink path", "path", relative,
                        "existing file or directory inside the project Workspace",
                        Map.of("actualState", Map.of("exists", Files.exists(target),
                                "symbolicLink", Files.isSymbolicLink(target))));
            }
            List<String> deleted = new ArrayList<>();
            if (Files.isDirectory(target)) {
                Files.walkFileTree(target, new SimpleFileVisitor<>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                        deleted.add(relative + "/" + target.relativize(file).toString().replace('\\', '/'));
                        return FileVisitResult.CONTINUE;
                    }
                });
                deleteTree(target);
            } else {
                Files.delete(target);
                deleted.add(relative);
            }
            return new MutationOutcome(true, List.of(), List.of(), deleted, List.of());
        });
    }

    public MutationResult delete(long projectId, String path, long expectedRevision) {
        return deleteWorkspacePath(projectId, path, expectedRevision);
    }

    private MutationResult mutate(long projectId, long expectedRevision, StageMutation mutation) {
        synchronized (lockFor(projectId)) {
            Path root = ensureProject(projectId);
            validateTree(root);
            long current = readRevision(root);
            if (current != expectedRevision) {
                throw new RevisionConflictException(expectedRevision, current);
            }
            Path stage = workspacesRoot.resolve("." + projectId + ".staging-" + UUID.randomUUID()).normalize();
            try {
                Map<String, Long> oldFileRevisions = readFileRevisions(root);
                copyTree(root, stage);
                MutationOutcome outcome = mutation.apply(stage, current);
                validateTree(stage);
                if (!outcome.changed()) {
                    deleteTree(stage);
                    return outcome.result(current);
                }
                long next = Math.addExact(current, 1L);
                enforceWorkspaceLimits(stage);
                Map<String, Long> nextFileRevisions = updateFileRevisions(
                        oldFileRevisions,
                        collectFiles(stage),
                        outcome,
                        next
                );
                writeFileRevisions(stage, nextFileRevisions);
                writeRevision(stage, next);
                swapDirectories(root, stage);
                return outcome.result(next);
            } catch (WorkspaceException e) {
                deleteTreeQuietly(stage);
                throw e;
            } catch (IOException | ArithmeticException e) {
                deleteTreeQuietly(stage);
                throw storageFailure("提交 Workspace 写入失败", "workspace.mutation",
                        Map.of("expectedRevision", expectedRevision, "currentRevision", current,
                                "executionOutcome", "unknown", "stageCleanupAttempted", true),
                        "atomic commit or confirmed rollback", "stage, validate, and commit Workspace changes", e,
                        Map.of("recovery", "Read the current Workspace revision and affected paths before retrying; the commit result is unknown."));
            } catch (RuntimeException e) {
                deleteTreeQuietly(stage);
                throw e;
            }
        }
    }

    private Path ensureProject(long projectId) {
        validateProjectId(projectId);
        try {
            ensureNoSymlink(storageRoot);
            ensureNoSymlink(workspacesRoot);
            Files.createDirectories(workspacesRoot);
            recoverProjectArtifacts(projectId);
            Path root = workspacesRoot.resolve(Long.toString(projectId)).normalize();
            if (Files.exists(root) && Files.isSymbolicLink(root)) {
                throw invalid("project Workspace cannot be a symbolic link", "workspace.directory",
                        Map.of("exists", true, "symbolicLink", true),
                        "existing non-symlink directory",
                        Map.of("projectId", projectId, "recovery", "Remove or replace the symbolic link, then retry."));
            }
            if (!Files.exists(root)) {
                Files.createDirectories(root);
                Files.createDirectories(root.resolve(META_DIRECTORY));
                writeRevision(root, 0L);
            } else if (!Files.isDirectory(root)) {
                throw invalid("project Workspace path is not a directory", "workspace.directory",
                        Map.of("exists", true, "directory", false, "regularFile", Files.isRegularFile(root)),
                        "directory for this project",
                        Map.of("projectId", projectId));
            }
            if (Files.exists(root.resolve(LEGACY_META_DIRECTORY), LinkOption.NOFOLLOW_LINKS)) {
                throw invalid("检测到旧 AI 工作区记录；当前应用不支持直接使用旧工作区，请使用独立的新工作区",
                        "workspace.metadata", Map.of("projectId", projectId),
                        "workspace metadata using the DataVisool directory name");
            }
            Path metadata = root.resolve(META_DIRECTORY);
            if (Files.isSymbolicLink(metadata) || (Files.exists(metadata) && !Files.isDirectory(metadata))) {
                throw invalid("Workspace metadata path must be a non-symlink directory", "workspace.metadata",
                        Map.of("exists", Files.exists(metadata), "symbolicLink", Files.isSymbolicLink(metadata),
                                "directory", Files.isDirectory(metadata)),
                        "directory used for Workspace revision and file metadata",
                        Map.of("projectId", projectId));
            }
            Files.createDirectories(metadata);
            Path revision = metadata.resolve(REVISION_FILE);
            if (Files.exists(revision) && Files.isSymbolicLink(revision)) {
                throw invalid("Workspace revision file cannot be a symbolic link", "workspace.metadata.revision",
                        Map.of("exists", true, "symbolicLink", true), "regular file containing a non-negative integer",
                        Map.of("projectId", projectId));
            }
            if (!Files.exists(revision)) {
                writeRevision(root, 0L);
            }
            return root;
        } catch (IOException e) {
            throw storageFailure("初始化项目 Workspace 失败", "workspace.directory",
                    Map.of("projectId", projectId, "state", "unknown"),
                    "accessible project Workspace storage", "create or inspect project Workspace", e);
        }
    }

    private Object lockFor(long projectId) {
        validateProjectId(projectId);
        return WORKSPACE_LOCKS.computeIfAbsent(workspacesRoot.toString() + "#" + projectId, ignored -> new Object());
    }

    private static void validateProjectId(long projectId) {
        if (projectId <= 0) {
            throw invalid("projectId must be a positive integer", "projectId", projectId,
                    "integer >= 1");
        }
    }

    private static String normalizeRelative(String raw, boolean allowEmpty) {
        if (raw == null) {
            throw invalid("workspace path is required", "path", null,
                    allowEmpty ? "empty path or a relative path inside the project Workspace" : "non-empty relative path inside the project Workspace");
        }
        if (raw.indexOf('\0') >= 0) {
            throw invalid("workspace path contains NUL", "path", raw, "relative path without NUL characters");
        }
        String value = raw;
        if (allowEmpty && value.isEmpty()) {
            return "";
        }
        if (value.isEmpty() || value.length() > 1024 || value.getBytes(StandardCharsets.UTF_8).length > 1024
                || value.startsWith("/") || value.startsWith("\\") || value.contains("\\")
                || value.matches("^[A-Za-z]:.*") || value.startsWith("//")) {
            throw invalid("workspace path must be relative", "path", raw,
                    "non-empty path of at most 1024 UTF-8 bytes, slash-separated and relative (no drive, root, or backslash)");
        }
        String[] parts = value.split("/", -1);
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < parts.length; index++) {
            String part = parts[index];
            if (part.isEmpty() || part.equals(".") || part.equals("..")
                    || part.getBytes(StandardCharsets.UTF_8).length > 255
                    || part.contains(".datavisool-tmp-")
                    || part.endsWith(".") || part.endsWith(" ")
                    || part.chars().anyMatch(character -> character < 0x20 || character == 0x7f)
                    || part.chars().anyMatch(character -> "<>:\"|?*".indexOf(character) >= 0)
                    || isWindowsReservedName(part)) {
                throw invalid("workspace path contains an unsafe segment", "path", raw,
                        "relative path whose segments are non-empty, not . or .., portable, and at most 255 UTF-8 bytes",
                        Map.of("segmentIndex", index, "segment", part));
            }
            if (index == 0 && part.equals(META_DIRECTORY)) {
                throw invalid("workspace metadata path is reserved", "path", raw,
                        "path outside the reserved " + META_DIRECTORY + " metadata directory",
                        Map.of("segmentIndex", index, "segment", part));
            }
            if (result.length() > 0) {
                result.append('/');
            }
            result.append(part);
        }
        return result.toString();
    }

    private static boolean isWindowsReservedName(String component) {
        String stem = component.substring(0, component.indexOf('.') >= 0 ? component.indexOf('.') : component.length())
                .toUpperCase(Locale.ROOT);
        if (Set.of("CON", "PRN", "AUX", "NUL").contains(stem)) {
            return true;
        }
        return stem.length() == 4
                && (stem.startsWith("COM") || stem.startsWith("LPT"))
                && stem.charAt(3) >= '1' && stem.charAt(3) <= '9';
    }

    private static Path resolveSafe(Path root, String relative, boolean allowMissing) {
        String normalized = normalizeRelative(relative, true);
        Path candidate = normalized.isEmpty() ? root : root.resolve(normalized).normalize();
        if (!candidate.startsWith(root)) {
            throw invalid("workspace path is outside the project Workspace", "path", relative,
                    "relative path that resolves inside the project Workspace");
        }
        Path current = root;
        if (!Files.exists(root) || Files.isSymbolicLink(root)) {
            throw invalid("project Workspace is missing or a symbolic link", "workspace.directory",
                    Map.of("exists", Files.exists(root), "symbolicLink", Files.isSymbolicLink(root)),
                    "existing non-symlink workspace directory");
        }
        if (!normalized.isEmpty()) {
            for (String part : normalized.split("/")) {
                current = current.resolve(part);
                if (Files.isSymbolicLink(current)) {
                    throw invalid("workspace path cannot traverse a symbolic link: " + normalized,
                            "path", relative, "path whose every segment is not a symbolic link",
                            Map.of("segment", part, "path", normalized));
                }
                if (!allowMissing && !Files.exists(current)) {
                    throw invalid("workspace path does not exist: " + normalized, "path", relative,
                            "existing path inside the project Workspace",
                            Map.of("missingSegment", part, "path", normalized,
                                    "actualState", Map.of("exists", false)));
                }
                if (Files.exists(current) && !current.normalize().startsWith(root)) {
                    throw invalid("workspace path is outside the project Workspace", "path", relative,
                            "path that resolves inside the project Workspace", Map.of("segment", part));
                }
            }
        }
        return candidate;
    }

    private static void ensureNoSymlink(Path path) throws IOException {
        // 配置根目录可能位于系统别名路径（例如 macOS 的 /var -> /private/var），
        // 只拒绝实际 Workspace 容器本身为符号链接，不把可信的配置父目录误判为越界。
        if (Files.isSymbolicLink(path)) {
            throw invalid("Workspace storage directory cannot be a symbolic link", "workspace.storageDirectory",
                    Map.of("symbolicLink", true), "configured Workspace storage directory that is not a symbolic link");
        }
    }

    private static void validateTree(Path root) {
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (Files.isSymbolicLink(dir)) {
                        String relative = relativePath(root, dir);
                        throw invalid("Workspace directory cannot be a symbolic link", "path", relative,
                                "directory without symbolic links",
                                Map.of("actualState", Map.of("symbolicLink", true, "directory", true)));
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (Files.isSymbolicLink(file) || !attrs.isRegularFile()) {
                        String relative = relativePath(root, file);
                        throw invalid("Workspace contains a symbolic link or unsupported file type", "path", relative,
                                "regular non-symlink file",
                                Map.of("actualState", Map.of("symbolicLink", Files.isSymbolicLink(file),
                                        "regularFile", attrs.isRegularFile(), "directory", attrs.isDirectory())));
                    }
                    ensureSingleLink(file, relativePath(root, file));
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            throw storageFailure("校验 Workspace 文件树失败", "workspace.directory",
                    Map.of("state", "unknown"), "traversable Workspace directory tree", "validate tree entries", e);
        }
    }

    private static String relativePath(Path root, Path path) {
        return root.relativize(path).toString().replace('\\', '/');
    }

    private static boolean isMetadataPath(String path) {
        return path.equals(META_DIRECTORY) || path.startsWith(META_DIRECTORY + "/");
    }

    private static boolean containsHidden(String path) {
        for (String part : path.split("/")) {
            if (part.startsWith(".")) {
                return true;
            }
        }
        return false;
    }

    private static boolean isIgnoredDirectory(String path) {
        return path.equals(".git") || path.endsWith("/.git") || path.equals("node_modules") || path.endsWith("/node_modules");
    }

    private static List<String> readIgnorePatterns(Path root) {
        Path ignoreFile = root.resolve(".gitignore");
        if (!Files.isRegularFile(ignoreFile) || Files.isSymbolicLink(ignoreFile)) {
            return List.of();
        }
        try {
            if (Files.size(ignoreFile) > MAX_FILE_BYTES) {
                long bytes = Files.size(ignoreFile);
                throw sizeLimit("Workspace ignore rule file exceeds the text size limit", "path.byteLength",
                        bytes, bytes, MAX_FILE_BYTES, Map.of("path", ".gitignore"));
            }
            return Files.readAllLines(ignoreFile, StandardCharsets.UTF_8).stream()
                    .map(String::trim)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#") && !line.startsWith("!"))
                    .toList();
        } catch (IOException e) {
            throw storageFailure("读取 Workspace 忽略规则失败", "path", ".gitignore",
                    "readable UTF-8 ignore rule file", "read search ignore rules", e);
        }
    }

    private static boolean matchesIgnore(String path, List<String> patterns) {
        if (patterns.isEmpty()) {
            return false;
        }
        Path candidate = Path.of(path);
        for (String rawPattern : patterns) {
            String pattern = rawPattern.replace('\\', '/');
            boolean directoryPattern = pattern.endsWith("/");
            if (directoryPattern) {
                pattern = pattern.substring(0, pattern.length() - 1);
            }
            if (pattern.startsWith("/")) {
                pattern = pattern.substring(1);
            }
            try {
                PathMatcher matcher = candidate.getFileSystem().getPathMatcher("glob:" + pattern);
                if (matcher.matches(candidate) || (!pattern.contains("/") && candidate.getFileName() != null && matcher.matches(candidate.getFileName()))) {
                    return true;
                }
                if (directoryPattern && path.startsWith(pattern + "/")) {
                    return true;
                }
            } catch (IllegalArgumentException e) {
                throw invalid("search ignore rule is invalid", "ignoreRules", rawPattern,
                        "valid filesystem glob pattern",
                        Map.of("parserReason", Objects.toString(e.getMessage(), e.getClass().getSimpleName()),
                                "parserIndex", parserIndex(e.getMessage())));
            }
        }
        return false;
    }

    private static boolean matchesGlob(String path, List<String> globs) {
        if (globs.isEmpty()) {
            return true;
        }
        List<String> includes = globs.stream().filter(glob -> !glob.startsWith("!")).toList();
        List<String> excludes = globs.stream().filter(glob -> glob.startsWith("!")).map(glob -> glob.substring(1)).toList();
        boolean included = includes.isEmpty() || includes.stream().anyMatch(glob -> matchesSingleGlob(path, glob));
        return included && excludes.stream().noneMatch(glob -> matchesSingleGlob(path, glob));
    }

    private static boolean matchesSingleGlob(String path, String glob) {
        validateGlob(glob, -1);
        String pattern = glob.startsWith("!") ? glob.substring(1) : glob;
        Path value = Path.of(path);
        try {
            PathMatcher matcher = value.getFileSystem().getPathMatcher("glob:" + pattern);
            return matcher.matches(value) || value.getFileName() != null && matcher.matches(value.getFileName());
        } catch (IllegalArgumentException e) {
            throw globFailure(glob, -1, e);
        }
    }

    private static void validateGlob(String glob, int index) {
        String fieldPath = index < 0 ? "globs" : "globs[" + index + "]";
        if (glob == null || glob.isBlank() || glob.length() > 256) {
            throw invalid("search glob must be a non-empty pattern of at most 256 characters", fieldPath, glob,
                    "glob pattern with 1–256 characters; prefix with ! to exclude");
        }
        String pattern = glob.startsWith("!") ? glob.substring(1) : glob;
        if (pattern.isBlank()) {
            throw invalid("exclude glob is missing its pattern", fieldPath, glob, "! followed by a non-empty glob pattern");
        }
        try {
            Path.of("").getFileSystem().getPathMatcher("glob:" + pattern);
        } catch (IllegalArgumentException error) {
            throw globFailure(glob, index, error);
        }
    }

    private static WorkspaceException globFailure(String glob, int index, IllegalArgumentException cause) {
        String fieldPath = index < 0 ? "globs" : "globs[" + index + "]";
        String reason = cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.invalid",
                "search glob parser rejected this pattern: " + reason, fieldPath, glob, "valid filesystem glob pattern");
        details.put("parserReason", reason);
        details.put("parserIndex", parserIndex(reason));
        return new WorkspaceException("workspace.invalid", Objects.toString(details.get("message")), details);
    }

    private static Pattern compileSearchPattern(String query, SearchMode mode, CaseMode caseMode) {
        int flags = 0;
        CaseMode effective = caseMode == null ? CaseMode.SENSITIVE : caseMode;
        if (effective == CaseMode.INSENSITIVE || (effective == CaseMode.SMART && query.equals(query.toLowerCase(Locale.ROOT)))) {
            flags = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
        }
        try {
            return mode == SearchMode.REGEX ? Pattern.compile(query, flags) : Pattern.compile(Pattern.quote(query), flags);
        } catch (PatternSyntaxException e) {
            Map<String, Object> details = AiAgentErrorFeedback.error("workspace.invalid",
                    "search regular expression is invalid: " + e.getDescription(), "query", query,
                    "valid Java regular expression");
            details.put("parserReason", e.getDescription());
            details.put("parserIndex", e.getIndex());
            throw new WorkspaceException("workspace.invalid", Objects.toString(details.get("message")), details);
        }
    }

    private static Integer parserIndex(String reason) {
        if (reason == null) return null;
        java.util.regex.Matcher matcher = Pattern.compile("(?:index|position)[: ]+(\\d+)", Pattern.CASE_INSENSITIVE).matcher(reason);
        if (!matcher.find()) return null;
        try { return Integer.parseInt(matcher.group(1)); }
        catch (NumberFormatException ignored) { return null; }
    }

    private static String[] splitLines(String content) {
        String normalized = content.replace("\r\n", "\n");
        if (normalized.isEmpty()) {
            return new String[]{""};
        }
        if (normalized.endsWith("\n")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized.split("\n", -1);
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static int countMatches(String content, String target) {
        int count = 0;
        int from = 0;
        while ((from = content.indexOf(target, from)) >= 0) {
            count++;
            from++;
        }
        return count;
    }

    private static List<Map<String, Object>> matchLocations(String content, String target, int limit) {
        List<Map<String, Object>> result = new ArrayList<>();
        int from = 0;
        while (result.size() < limit && (from = content.indexOf(target, from)) >= 0) {
            int line = 1;
            int lineStart = 0;
            for (int index = 0; index < from; index++) {
                if (content.charAt(index) == '\n') {
                    line++;
                    lineStart = index + 1;
                }
            }
            result.add(Map.of("line", line, "column", from - lineStart + 1, "charOffset", from + 1));
            from++;
        }
        return List.copyOf(result);
    }

    private static String readUtf8(Path path) throws IOException {
        return readUtf8(path, path.getFileName() == null ? "" : path.getFileName().toString());
    }

    private static String readUtf8(Path path, String workspacePath) throws IOException {
        byte[] bytes = Files.readAllBytes(path);
        if (bytes.length > MAX_FILE_BYTES) {
            throw sizeLimit("Workspace file exceeds the UTF-8 text size limit", "path.byteLength", (long) bytes.length,
                    bytes.length, MAX_FILE_BYTES, Map.of("path", workspacePath));
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            throw invalid("Workspace file is not valid UTF-8 text", "path", workspacePath,
                    "file encoded as valid UTF-8 text", Map.of("parserReason", Objects.toString(e.getMessage(), "malformed UTF-8 byte sequence")));
        }
    }

    private static LineRange resolveLineRange(String content, int start, int end, String path) {
        if (content.isEmpty()) {
            if (start > 1) throw invalid("requested startLine is after the end of the file", "startLine", start,
                    "line 1 (totalLines=1)", Map.of("path", path, "totalLines", 1));
            return new LineRange(1, 1, "");
        }
        String normalized = content.replace("\r\n", "\n");
        String[] lines = splitLines(content);
        int total = lines.length;
        if (start > total) {
            throw invalid("requested startLine is after the end of the file", "startLine", start,
                    "integer between 1 and totalLines (" + total + ")", Map.of("path", path, "totalLines", total,
                            "requestedEndLine", end));
        }
        int actualEnd = Math.min(end, total);
        StringBuilder excerpt = new StringBuilder();
        for (int i = start - 1; i < actualEnd; i++) {
            if (i > start - 1) {
                excerpt.append('\n');
            }
            excerpt.append(lines[i]);
        }
        if (content.contains("\r\n")) {
            String value = excerpt.toString().replace("\n", "\r\n");
            return new LineRange(actualEnd, total, value);
        }
        return new LineRange(actualEnd, total, excerpt.toString());
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte item : digest) {
                result.append(String.format(Locale.ROOT, "%02x", item));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private static void validateText(String content, String path) {
        long actualBytes = content.getBytes(StandardCharsets.UTF_8).length;
        if (actualBytes > MAX_FILE_BYTES) {
            throw sizeLimit("Workspace file exceeds the UTF-8 text size limit", "path.byteLength", actualBytes,
                    actualBytes, MAX_FILE_BYTES, Map.of("path", path));
        }
        if (path.toLowerCase(Locale.ROOT).endsWith(".json")) {
            try {
                if (STRICT_JSON_MAPPER.readTree(content) == null) {
                    throw invalid("Workspace .json file is empty", "content", content,
                            "valid non-empty JSON document", Map.of("path", path, "parserReason", "empty JSON"));
                }
            } catch (JsonProcessingException e) {
                com.fasterxml.jackson.core.JsonLocation location = e.getLocation();
                String reason = Objects.toString(e.getOriginalMessage(), e.getClass().getSimpleName());
                Map<String, Object> details = AiAgentErrorFeedback.error("workspace.invalid",
                        "Workspace .json file contains invalid JSON: " + reason,
                        "content", content, "valid JSON document");
                details.put("path", path);
                details.put("parserReason", reason);
                if (location != null) {
                    details.put("parserIndex", location.getCharOffset());
                    details.put("line", location.getLineNr());
                    details.put("column", location.getColumnNr());
                }
                details.put("recovery", "Correct the JSON syntax at the reported line and column, then retry with the complete JSON document.");
                throw new WorkspaceException("workspace.invalid", Objects.toString(details.get("message")), details);
            }
        }
    }

    private static void ensureOutputWithinLimit(Object value) {
        int bytes = JSON.toJSONString(value).getBytes(StandardCharsets.UTF_8).length;
        if (bytes > MAX_OUTPUT_BYTES) {
            throw sizeLimit("Workspace tool output exceeds the response limit", "result.byteLength",
                    bytes, bytes, MAX_OUTPUT_BYTES);
        }
    }

    private static SearchResult fitSearchResult(SearchResult value) {
        List<SearchMatch> matches = new ArrayList<>(value.matches());
        boolean truncated = value.truncated();
        String reason = value.truncationReason();
        SearchResult result = value;
        while (JSON.toJSONString(result).getBytes(StandardCharsets.UTF_8).length > MAX_OUTPUT_BYTES) {
            if (matches.isEmpty()) {
                int actualBytes = JSON.toJSONString(result).getBytes(StandardCharsets.UTF_8).length;
                throw sizeLimit("Workspace search response cannot fit the output limit after removing all matches",
                        "result.byteLength", actualBytes, actualBytes, MAX_OUTPUT_BYTES);
            }
            matches.remove(matches.size() - 1);
            truncated = true;
            reason = "responseLimit";
            result = new SearchResult(
                    value.workspaceRevision(),
                    value.searchedRevision(),
                    List.copyOf(matches),
                    true,
                    truncated,
                    reason,
                    (int) matches.stream().map(SearchMatch::path).distinct().count(),
                    (int) matches.stream().filter(match -> match.line() != null).count(),
                    value.elapsedMs()
            );
        }
        return result;
    }

    private static void ensureSingleLink(Path file, String relative) {
        try {
            Object links = Files.getAttribute(file, "unix:nlink", LinkOption.NOFOLLOW_LINKS);
            if (links instanceof Number number && number.longValue() > 1L) {
                throw invalid("Workspace cannot contain hard-linked files", "path", relative,
                        "regular file with exactly one filesystem link",
                        Map.of("linkCount", number.longValue()));
            }
        } catch (UnsupportedOperationException | IllegalArgumentException ignored) {
            // 非 Unix 文件系统没有 nlink 属性；其他常规文件校验仍然生效。
        } catch (IOException e) {
            throw storageFailure("校验 Workspace 文件链接失败", "path", relative,
                    "filesystem link count readable", "read file link count", e);
        }
    }

    private static Set<String> collectFiles(Path root) {
        Set<String> files = new HashSet<>();
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (!dir.equals(root) && isMetadataPath(relativePath(root, dir))) {
                        return FileVisitResult.SKIP_SUBTREE;
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    String relative = relativePath(root, file);
                    if (!isMetadataPath(relative)) {
                        files.add(relative);
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
            return files;
        } catch (IOException e) {
            throw storageFailure("读取 Workspace 文件索引失败", "workspace.directory",
                    Map.of("state", "unknown"), "traversable Workspace directory tree", "collect file paths", e);
        }
    }

    private static void enforceWorkspaceLimits(Path root) {
        try {
            int[] fileCount = {0};
            long[] byteCount = {0L};
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    String relative = relativePath(root, dir);
                    return isMetadataPath(relative) && !relative.equals(META_DIRECTORY)
                            && !relative.equals(META_DIRECTORY + "/repairs")
                            ? FileVisitResult.SKIP_SUBTREE
                            : FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    String relative = relativePath(root, file);
                    if (isMetadataPath(relative)) {
                        // 原始拼接缓存同样占用存储，不能因位于受保护目录而绕过总容量限制。
                        if (!relative.startsWith(META_DIRECTORY + "/repairs/") || !relative.endsWith(".source"))
                            return FileVisitResult.CONTINUE;
                    } else {
                        fileCount[0]++;
                    }
                    try {
                        byteCount[0] = Math.addExact(byteCount[0], Files.size(file));
                    } catch (ArithmeticException | IOException e) {
                        throw storageFailure("Workspace file size could not be calculated", "path", relative,
                                "readable file size", "calculate Workspace byte total", e, Map.of("byteCount", "unknown"));
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
            if (fileCount[0] > MAX_WORKSPACE_FILES) {
                throw resourceLimit("Workspace file count exceeds the limit", "workspace.fileCount",
                        fileCount[0], "integer <= " + MAX_WORKSPACE_FILES,
                        Map.of("maxFiles", MAX_WORKSPACE_FILES, "actualBytes", byteCount[0],
                                "maxBytes", MAX_WORKSPACE_BYTES));
            }
            if (byteCount[0] > MAX_WORKSPACE_BYTES) {
                throw resourceLimit("Workspace total byte size exceeds the limit", "workspace.byteCount",
                        byteCount[0], "integer <= " + MAX_WORKSPACE_BYTES,
                        Map.of("maxBytes", MAX_WORKSPACE_BYTES, "actualFileCount", fileCount[0],
                                "maxFiles", MAX_WORKSPACE_FILES));
            }
        } catch (IOException e) {
            throw storageFailure("校验 Workspace 总量失败", "workspace.directory",
                    Map.of("fileCount", "unknown", "byteCount", "unknown"),
                    "traversable Workspace directory tree", "calculate Workspace file and byte totals", e);
        }
    }

    private static Map<String, Long> readFileRevisions(Path root) {
        Path file = root.resolve(META_DIRECTORY).resolve(FILE_REVISIONS_FILE);
        String workspacePath = META_DIRECTORY + "/" + FILE_REVISIONS_FILE;
        if (!Files.exists(file)) {
            return new TreeMap<>();
        }
        if (Files.isSymbolicLink(file)) {
            throw invalid("Workspace file revision index cannot be a symbolic link", "workspace.fileRevisions",
                    Map.of("exists", true, "symbolicLink", true), "regular file containing valid path/revision entries",
                    Map.of("path", workspacePath));
        }
        long actualBytes;
        try {
            actualBytes = Files.size(file);
            if (actualBytes > MAX_OUTPUT_BYTES) {
                throw sizeLimit("Workspace file revision index exceeds the metadata size limit",
                        "workspace.fileRevisions.byteLength", actualBytes, actualBytes, MAX_OUTPUT_BYTES,
                        Map.of("path", workspacePath));
            }
        } catch (IOException e) {
            throw storageFailure("读取 Workspace 文件版本索引失败", "workspace.fileRevisions",
                    Map.of("path", workspacePath, "byteLength", "unknown"),
                    "readable metadata file within the size limit", "read metadata file size", e);
        }
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw storageFailure("读取 Workspace 文件版本索引失败", "workspace.fileRevisions",
                    Map.of("path", workspacePath, "byteLength", actualBytes),
                    "valid UTF-8 metadata file", "read metadata lines", e);
        }
        Map<String, Long> result = new TreeMap<>();
        for (int lineIndex = 0; lineIndex < lines.size(); lineIndex++) {
            String line = lines.get(lineIndex);
            if (line.isBlank()) continue;
            int separator = line.indexOf('\t');
            if (separator <= 0 || separator == line.length() - 1) {
                throw invalid("Workspace file revision entry must contain an encoded path and revision separated by a tab",
                        "workspace.fileRevisions.lines[" + lineIndex + "]", line,
                        "base64url(path) followed by a tab and a non-negative integer revision",
                        Map.of("path", workspacePath, "line", lineIndex + 1));
            }
            String decodedPath;
            try {
                decodedPath = new String(Base64.getUrlDecoder().decode(line.substring(0, separator)), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw invalid("Workspace file revision path is not valid base64url", "workspace.fileRevisions.lines[" + lineIndex + "]",
                        line, "base64url(path) followed by a tab and a non-negative integer revision",
                        Map.of("path", workspacePath, "line", lineIndex + 1,
                                "parserReason", Objects.toString(e.getMessage(), e.getClass().getSimpleName())));
            }
            String normalizedPath;
            try {
                normalizedPath = normalizeRelative(decodedPath, false);
            } catch (WorkspaceException e) {
                Map<String, Object> details = new LinkedHashMap<>(e.result());
                details.put("fieldPath", "workspace.fileRevisions.lines[" + lineIndex + "]");
                details.put("actualValue", line);
                details.put("path", workspacePath);
                details.put("line", lineIndex + 1);
                details.put("expected", "entry for a safe relative Workspace path and non-negative revision");
                throw new WorkspaceException(e.code(), e.getMessage(), details);
            }
            long revision;
            String rawRevision = line.substring(separator + 1);
            try {
                revision = Long.parseLong(rawRevision);
            } catch (NumberFormatException e) {
                throw invalid("Workspace file revision is not an integer", "workspace.fileRevisions.lines[" + lineIndex + "]",
                        line, "base64url(path) followed by a tab and a non-negative integer revision",
                        Map.of("path", workspacePath, "line", lineIndex + 1,
                                "revisionValue", rawRevision,
                                "parserReason", Objects.toString(e.getMessage(), e.getClass().getSimpleName())));
            }
            if (revision < 0) {
                throw invalid("Workspace file revision must be non-negative", "workspace.fileRevisions.lines[" + lineIndex + "]",
                        revision, "integer >= 0", Map.of("path", workspacePath, "line", lineIndex + 1, "filePath", normalizedPath));
            }
            if (result.put(normalizedPath, revision) != null) {
                throw invalid("Workspace file revision index contains a duplicate path", "workspace.fileRevisions.lines[" + lineIndex + "]",
                        line, "one revision entry per Workspace path",
                        Map.of("path", workspacePath, "line", lineIndex + 1, "filePath", normalizedPath));
            }
        }
        return result;
    }

    private static void writeFileRevisions(Path root, Map<String, Long> revisions) {
        Path metadata = root.resolve(META_DIRECTORY);
        Path target = metadata.resolve(FILE_REVISIONS_FILE);
        Path temporary = metadata.resolve("." + FILE_REVISIONS_FILE + ".tmp-" + UUID.randomUUID());
        StringBuilder content = new StringBuilder();
        revisions.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            normalizeRelative(entry.getKey(), false);
            if (entry.getValue() == null || entry.getValue() < 0) {
                throw invalid("Workspace file revision must be a non-negative integer", "workspace.fileRevisions",
                        entry.getValue(), "integer >= 0",
                        Map.of("path", META_DIRECTORY + "/" + FILE_REVISIONS_FILE, "filePath", entry.getKey()));
            }
            content.append(Base64.getUrlEncoder().withoutPadding().encodeToString(entry.getKey().getBytes(StandardCharsets.UTF_8)))
                    .append('\t').append(entry.getValue()).append('\n');
        });
        try {
            Files.createDirectories(metadata);
            Files.writeString(temporary, content.toString(), StandardCharsets.UTF_8);
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw storageFailure("写入 Workspace 文件版本失败", "workspace.fileRevisions",
                    Map.of("path", META_DIRECTORY + "/" + FILE_REVISIONS_FILE, "state", "unknown"),
                    "writable metadata directory", "write file revision index", e);
        }
    }

    private static Map<String, Long> updateFileRevisions(
            Map<String, Long> oldRevisions,
            Set<String> finalFiles,
            MutationOutcome outcome,
            long revision
    ) {
        Map<String, Long> result = new TreeMap<>(oldRevisions);
        result.keySet().retainAll(finalFiles);
        outcome.deleted().forEach(result::remove);
        outcome.moved().forEach(move -> {
            Long previous = result.remove(move.from());
            result.put(move.to(), revision > 0 ? revision : (previous == null ? 0L : previous));
        });
        outcome.added().forEach(path -> result.put(path, revision));
        outcome.modified().forEach(path -> result.put(path, revision));
        return result;
    }

    private static void touch(Set<String> touched, String path) {
        if (!touched.add(path)) {
            throw invalid("a Patch path may only be touched once", "path", path,
                    "path not already used by another operation in this patch",
                    Map.of("duplicatePath", path));
        }
    }

    private static void ensureParentDirectory(Path root, String relative) throws IOException {
        int slash = relative.lastIndexOf('/');
        if (slash <= 0) {
            return;
        }
        Path parent = resolveSafe(root, relative.substring(0, slash), true);
        if (Files.exists(parent) && !Files.isDirectory(parent)) {
            throw invalid("Workspace parent path is not a directory", "path", relative,
                    "parent path that is a directory",
                    Map.of("parentPath", relative.substring(0, slash), "actualState", Map.of("exists", true,
                            "directory", false, "regularFile", Files.isRegularFile(parent))));
        }
        Files.createDirectories(parent);
        if (Files.isSymbolicLink(parent)) {
            throw invalid("Workspace parent path cannot be a symbolic link", "path", relative,
                    "parent path without symbolic links",
                    Map.of("parentPath", relative.substring(0, slash), "symbolicLink", true));
        }
    }

    private static void validateMoveContents(Path root, Path source, String target) throws IOException {
        if (Files.isDirectory(source)) {
            Files.walkFileTree(source, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    String suffix = source.relativize(file).toString().replace('\\', '/');
                    validateText(readUtf8(file), target + (suffix.isEmpty() ? "" : "/" + suffix));
                    return FileVisitResult.CONTINUE;
                }
            });
        } else {
            validateText(readUtf8(source), target);
        }
    }

    private static void writeText(Path root, String relative, String content) {
        validateText(content, relative);
        try {
            ensureParentDirectory(root, relative);
            Path target = resolveSafe(root, relative, true);
            Path temporary = target.resolveSibling("." + target.getFileName() + ".tmp-" + UUID.randomUUID());
            Files.writeString(temporary, content, StandardCharsets.UTF_8);
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw storageFailure("写入 Workspace 文件失败", "path", relative,
                    "writable parent directory and file", "write and replace Workspace file", e,
                    Map.of("executionOutcome", "not committed"));
        }
    }

    private static void writeRevision(Path root, long revision) throws IOException {
        Path metadata = root.resolve(META_DIRECTORY);
        Files.createDirectories(metadata);
        Path target = metadata.resolve(REVISION_FILE);
        Path temporary = metadata.resolve("." + REVISION_FILE + ".tmp-" + UUID.randomUUID());
        Files.writeString(temporary, Long.toString(revision), StandardCharsets.UTF_8);
        try {
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static long readRevision(Path root) {
        String relative = META_DIRECTORY + "/" + REVISION_FILE;
        String value;
        try {
            value = Files.readString(root.resolve(META_DIRECTORY).resolve(REVISION_FILE), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            throw storageFailure("读取 Workspace revision 失败", "workspace.revision",
                    Map.of("path", relative, "value", "unknown"), "readable metadata file", "read Workspace revision", e);
        }
        try {
            long revision = Long.parseLong(value);
            if (revision < 0) {
                throw invalid("Workspace revision must be non-negative", "workspace.revision", value,
                        "integer >= 0", Map.of("path", relative));
            }
            return revision;
        } catch (NumberFormatException e) {
            throw invalid("Workspace revision is not a valid integer", "workspace.revision", value,
                    "non-negative base-10 integer", Map.of("path", relative,
                            "parserReason", Objects.toString(e.getMessage(), e.getClass().getSimpleName())));
        }
    }

    private static void copyTree(Path source, Path destination) throws IOException {
        Files.createDirectories(destination);
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                String relative = relativePath(source, dir);
                // 修复的原操作信息必须随事务保留；revision 和 file-revisions 仍由 mutate 重建。
                if (isMetadataPath(relative) && !relative.equals(META_DIRECTORY)
                        && !relative.equals(META_DIRECTORY + "/repairs") && !relative.startsWith(META_DIRECTORY + "/repairs/")) {
                    return FileVisitResult.SKIP_SUBTREE;
                }
                Files.createDirectories(destination.resolve(relative));
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                String relative = relativePath(source, file);
                if (!isMetadataPath(relative) || relative.startsWith(META_DIRECTORY + "/repairs/")) {
                    Files.copy(file, destination.resolve(relative), StandardCopyOption.COPY_ATTRIBUTES);
                }
                return FileVisitResult.CONTINUE;
            }
        });
        Files.createDirectories(destination.resolve(META_DIRECTORY));
    }

    private static void swapDirectories(Path root, Path stage) throws IOException {
        Path backup = root.resolveSibling("." + root.getFileName() + ".backup-" + UUID.randomUUID());
        boolean originalMoved = false;
        boolean stageMoved = false;
        try {
            moveDirectory(root, backup);
            originalMoved = true;
            moveDirectory(stage, root);
            stageMoved = true;
            deleteTree(backup);
        } catch (IOException e) {
            if (stageMoved) {
                deleteTreeQuietly(root);
            }
            if (originalMoved && !Files.exists(root)) {
                try {
                    moveDirectory(backup, root);
                } catch (IOException ignored) {
                    // 保留原目录，下一次操作会因结构异常失败，而不会假装提交成功。
                }
            }
            throw e;
        }
    }

    private static void moveDirectory(Path from, Path to) throws IOException {
        try {
            Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException e) {
            Files.move(from, to);
        }
    }

    private static void deleteTree(Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        Files.walkFileTree(path, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.deleteIfExists(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                Files.deleteIfExists(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static void deleteTreeQuietly(Path path) {
        try {
            deleteTree(path);
        } catch (IOException ignored) {
            // staging/backup 只包含本次事务的副本，清理失败不会改变已提交内容。
        }
    }

    private void recoverProjectArtifacts(long projectId) throws IOException {
        Path root = workspacesRoot.resolve(Long.toString(projectId)).normalize();
        if (Files.isSymbolicLink(root)) {
            throw invalid("project Workspace recovery target cannot be a symbolic link", "workspace.directory",
                    Map.of("exists", true, "symbolicLink", true), "non-symlink project directory",
                    Map.of("projectId", projectId));
        }
        String stagingPrefix = "." + projectId + ".staging-";
        String backupPrefix = "." + projectId + ".backup-";
        List<Path> staging = new ArrayList<>();
        List<Path> backups = new ArrayList<>();
        try (var entries = Files.list(workspacesRoot)) {
            entries.forEach(path -> {
                String name = path.getFileName().toString();
                if (name.startsWith(stagingPrefix)) {
                    staging.add(path);
                } else if (name.startsWith(backupPrefix)) {
                    backups.add(path);
                }
            });
        }
        if (Files.exists(root)) {
            for (Path path : staging) {
                deleteRecoveryArtifact(path);
            }
            for (Path path : backups) {
                deleteRecoveryArtifact(path);
            }
            return;
        }
        Path candidate = newestRecoveryArtifact(staging);
        if (candidate == null) {
            candidate = newestRecoveryArtifact(backups);
        }
        if (candidate != null) {
            if (Files.isSymbolicLink(candidate) || !Files.isDirectory(candidate)) {
                throw invalid("Workspace recovery artifact must be a non-symlink directory", "workspace.recoveryArtifact",
                        Map.of("exists", true, "symbolicLink", Files.isSymbolicLink(candidate),
                                "directory", Files.isDirectory(candidate)),
                        "non-symlink staging or backup directory",
                        Map.of("projectId", projectId, "artifactName", candidate.getFileName().toString(),
                                "recoveryAction", "inspect the artifact and restore or remove it before retrying"));
            }
            validateTree(candidate);
            moveDirectory(candidate, root);
        }
        for (Path path : staging) {
            if (!path.equals(candidate)) {
                deleteRecoveryArtifact(path);
            }
        }
        for (Path path : backups) {
            if (!path.equals(candidate)) {
                deleteRecoveryArtifact(path);
            }
        }
    }

    private static Path newestRecoveryArtifact(List<Path> artifacts) throws IOException {
        Path result = null;
        long latest = Long.MIN_VALUE;
        for (Path artifact : artifacts) {
            long modified = Files.getLastModifiedTime(artifact).toMillis();
            if (result == null || modified > latest) {
                result = artifact;
                latest = modified;
            }
        }
        return result;
    }

    private static void deleteRecoveryArtifact(Path artifact) throws IOException {
        if (Files.isSymbolicLink(artifact)) {
            throw invalid("Workspace recovery artifact cannot be a symbolic link", "workspace.recoveryArtifact",
                    Map.of("exists", true, "symbolicLink", true), "non-symlink staging or backup directory",
                    Map.of("artifactName", artifact.getFileName().toString()));
        }
        deleteTree(artifact);
    }

    private static ParsedPatch parsePatch(String input) {
        if (input == null) throw invalid("patch is required", "patch", null, "string containing a workspace patch");
        long patchBytes = input.getBytes(StandardCharsets.UTF_8).length;
        if (patchBytes > MAX_PATCH_BYTES) {
            throw sizeLimit("patch exceeds the UTF-8 size limit", "patch", patchBytes, patchBytes, MAX_PATCH_BYTES);
        }
        String[] lines = input.replace("\r\n", "\n").split("\n", -1);
        if (lines.length == 0 || !"*** Begin Patch".equals(lines[0])) {
            throw patchFailure("patch must start with '*** Begin Patch'", null, null, 1,
                    lines.length == 0 ? null : lines[0], "*** Begin Patch");
        }
        int end = -1;
        for (int i = 1; i < lines.length; i++) {
            if ("*** End Patch".equals(lines[i])) {
                end = i;
                break;
            }
        }
        if (end < 0) {
            throw patchFailure("patch must end with '*** End Patch'", null, null, lines.length,
                    lines.length == 0 ? null : lines[lines.length - 1], "*** End Patch");
        }
        for (int i = end + 1; i < lines.length; i++) {
            if (!lines[i].isEmpty()) {
                throw patchFailure("unexpected content after '*** End Patch'", null, null, i + 1,
                        lines[i], "no content after '*** End Patch'");
            }
        }
        List<PatchOperation> operations = new ArrayList<>();
        int cursor = 1;
        while (cursor < end) {
            String line = lines[cursor];
            if (line.isEmpty()) {
                cursor++;
                continue;
            }
            if (line.startsWith("*** Add File: ")) {
                String path = normalizePatchPath(line.substring("*** Add File: ".length()), cursor + 1, "Add File");
                cursor++;
                List<String> content = new ArrayList<>();
                while (cursor < end && !isFileHeader(lines[cursor])) {
                    if (!lines[cursor].startsWith("+")) {
                        throw patchFailure("Add File content lines must start with '+'", path, null, cursor + 1,
                                lines[cursor], "+ followed by file content");
                    }
                    content.add(lines[cursor].substring(1));
                    cursor++;
                }
                operations.add(new AddOperation(path, content.isEmpty() ? "" : String.join("\n", content) + "\n"));
            } else if (line.startsWith("*** Delete File: ")) {
                operations.add(new DeleteOperation(normalizePatchPath(line.substring("*** Delete File: ".length()), cursor + 1, "Delete File")));
                cursor++;
            } else if (line.startsWith("*** Update File: ")) {
                String path = normalizePatchPath(line.substring("*** Update File: ".length()), cursor + 1, "Update File");
                cursor++;
                String moveTo = null;
                List<PatchHunk> hunks = new ArrayList<>();
                while (cursor < end && !isFileHeader(lines[cursor])) {
                    if (lines[cursor].startsWith("*** Move to: ")) {
                        if (moveTo != null) {
                            throw patchFailure("Update File contains multiple Move to directives", path,
                                    hunks.size() + 1, cursor + 1, lines[cursor], "at most one '*** Move to: <path>' directive");
                        }
                        moveTo = normalizePatchPath(lines[cursor].substring("*** Move to: ".length()), cursor + 1, "Move to");
                        cursor++;
                        continue;
                    }
                    if (!lines[cursor].startsWith("@@")) {
                        throw patchFailure("Update File content must start with a '@@' hunk", path,
                                hunks.size() + 1, cursor + 1, lines[cursor], "@@ followed by hunk context and +/- edit lines");
                    }
                    int hunkIndex = hunks.size() + 1;
                    int hunkSourceLine = cursor + 1;
                    String hunkHeader = lines[cursor];
                    cursor++;
                    List<PatchLine> hunkLines = new ArrayList<>();
                    while (cursor < end && !isFileHeader(lines[cursor]) && !lines[cursor].startsWith("@@") && !lines[cursor].startsWith("*** Move to: ")) {
                        String hunkLine = lines[cursor++];
                        if ("*** End of File".equals(hunkLine)) {
                            continue;
                        }
                        if (hunkLine.isEmpty()) {
                            throw patchFailure("empty hunk line is not allowed", path, hunkIndex, cursor,
                                    hunkLine, "line beginning with space, '-' or '+'; represent an empty file line with a single leading space");
                        }
                        char prefix = hunkLine.charAt(0);
                        if (prefix != ' ' && prefix != '-' && prefix != '+') {
                            throw patchFailure("hunk lines must start with space, '-' or '+'", path, hunkIndex, cursor,
                                    hunkLine, "line beginning with space (context), '-' (remove), or '+' (add)");
                        }
                        hunkLines.add(new PatchLine(prefix, hunkLine.substring(1)));
                    }
                    if (hunkLines.isEmpty() || hunkLines.stream().noneMatch(item -> item.prefix() == '-' || item.prefix() == '+')) {
                        throw patchFailure("hunk must contain at least one added or removed line", path, hunkIndex,
                                hunkSourceLine, hunkHeader, "hunk with at least one '+' or '-' line");
                    }
                    hunks.add(new PatchHunk(path, hunkIndex, hunkSourceLine, hunkHeader, hunkLines));
                }
                if (hunks.isEmpty()) {
                    throw patchFailure("Update File requires at least one hunk", path, 1, cursor + 1,
                            cursor < lines.length ? lines[cursor] : null, "@@ followed by at least one edit hunk");
                }
                operations.add(new UpdateOperation(path, moveTo, hunks));
            } else {
                throw patchFailure("unknown patch directive: " + line, null, null, cursor + 1, line,
                        "*** Add File: <path>, *** Update File: <path>, or *** Delete File: <path>");
            }
            if (operations.size() > MAX_PATCH_OPERATIONS) {
                throw patchFailure("patch contains too many file operations", null, null, cursor,
                        operations.size(), "at most " + MAX_PATCH_OPERATIONS + " file operations");
            }
        }
        if (operations.isEmpty()) {
            throw patchFailure("patch contains no file operations", null, null, 2,
                    end > 1 ? lines[1] : null, "at least one Add, Update, or Delete File operation");
        }
        return new ParsedPatch(List.copyOf(operations));
    }

    private static boolean isFileHeader(String line) {
        return line.startsWith("*** Add File: ") || line.startsWith("*** Update File: ") || line.startsWith("*** Delete File: ");
    }

    private static String normalizePatchPath(String value, int line, String directive) {
        try {
            return normalizeRelative(value, false);
        } catch (WorkspaceException error) {
            Map<String, Object> details = new LinkedHashMap<>(error.result());
            details.put("fieldPath", "patch.lines[" + (line - 1) + "].path");
            details.put("line", line);
            details.put("actualValue", AiAgentErrorFeedback.safeValue("path", value));
            details.put("expected", "safe relative Workspace path after '*** " + directive + ": '");
            details.put("recovery", "Use a relative slash-separated path inside the Workspace; avoid ., .., absolute paths, backslashes, reserved names, and metadata paths.");
            throw new WorkspaceException(error.code(), error.getMessage(), details);
        }
    }

    private static WorkspaceException patchFailure(String message, String path, Integer hunkIndex,
                                                   Integer line, Object actual, Object expected) {
        String fieldPath = line == null ? "patch" : "patch.lines[" + (line - 1) + "]";
        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.invalid", message, fieldPath, actual, expected);
        if (path != null) details.put("path", path);
        if (hunkIndex != null) details.put("hunkIndex", hunkIndex);
        if (line != null) details.put("line", line);
        details.put("recovery", "Correct the indicated patch line using the expected syntax, then retry against the current file content.");
        return new WorkspaceException("workspace.invalid", message, details);
    }

    private static String applyHunks(String original, List<PatchHunk> hunks, String path) {
        boolean crlf = original.contains("\r\n");
        String normalized = original.replace("\r\n", "\n");
        boolean trailingNewline = normalized.endsWith("\n");
        String body = trailingNewline ? normalized.substring(0, normalized.length() - 1) : normalized;
        List<String> lines = body.isEmpty() ? new ArrayList<>() : new ArrayList<>(List.of(body.split("\n", -1)));
        int searchStart = 0;
        for (PatchHunk hunk : hunks) {
            List<String> old = hunk.lines().stream().filter(line -> line.prefix() == ' ' || line.prefix() == '-').map(PatchLine::content).toList();
            List<String> replacement = hunk.lines().stream().filter(line -> line.prefix() == ' ' || line.prefix() == '+').map(PatchLine::content).toList();
            int position = findUniqueHunk(lines, old, searchStart, hunk, path);
            lines.subList(position, position + old.size()).clear();
            lines.addAll(position, replacement);
            searchStart = position + replacement.size();
        }
        String result = String.join("\n", lines);
        if (trailingNewline && (!result.isEmpty() || !lines.isEmpty())) {
            result += "\n";
        }
        return crlf ? result.replace("\n", "\r\n") : result;
    }

    private static int findUniqueHunk(List<String> lines, List<String> old, int searchStart, PatchHunk hunk, String path) {
        if (old.isEmpty()) {
            return lines.size();
        }
        List<Integer> matches = new ArrayList<>();
        for (int start = searchStart; start <= lines.size() - old.size(); start++) {
            boolean match = true;
            for (int i = 0; i < old.size(); i++) {
                if (!lines.get(start + i).equals(old.get(i))) {
                    match = false;
                    break;
                }
            }
            if (match) {
                matches.add(start);
            }
        }
        if (matches.size() != 1) {
            String message = matches.isEmpty() ? "patch context does not match target file" : "patch context is ambiguous in target file";
            int expectedStartLine = Math.min(lines.size() + 1, searchStart + 1);
            int previewStart = Math.max(0, expectedStartLine - 2);
            int previewEnd = Math.min(lines.size(), previewStart + Math.max(old.size(), 3));
            List<String> actualLines = lines.subList(previewStart, previewEnd);
            List<Integer> matchLines = matches.stream().map(index -> index + 1).limit(20).toList();
            Map<String, Object> actualContext = Map.of("startLine", previewStart + 1, "lines", actualLines);
            Map<String, Object> expectedContext = Map.of("contextLines", old, "uniqueMatch", true);
            Map<String, Object> details = AiAgentErrorFeedback.error("workspace.patch_context", message,
                    "patch.hunks[" + (hunk.index() - 1) + "]", actualContext,
                    expectedContext);
            details.put("path", path);
            details.put("hunkIndex", hunk.index());
            details.put("patchLine", hunk.sourceLine());
            details.put("line", expectedStartLine);
            details.put("matchCount", matches.size());
            details.put("matchLines", matchLines);
            details.put("matchLinesTruncated", matches.size() > matchLines.size());
            details.put("actual", actualContext);
            details.put("expected", expectedContext);
            details.put("recovery", "Read the current file at path, copy the exact surrounding lines into this hunk, and ensure they occur once after the preceding hunk.");
            throw new WorkspaceException("workspace.patch_context", message, details);
        }
        return matches.get(0);
    }

    private static List<SearchSubmatch> submatches(java.util.regex.Matcher matcher) {
        List<SearchSubmatch> result = new ArrayList<>();
        do {
            result.add(new SearchSubmatch(matcher.start() + 1, matcher.end() + 1));
        } while (matcher.find());
        return List.copyOf(result);
    }

    private static WorkspaceException invalid(String message, String fieldPath, Object actualValue, Object expected) {
        return invalid(message, fieldPath, actualValue, expected, Map.of());
    }

    private static WorkspaceException invalid(String message, String fieldPath, Object actualValue, Object expected,
                                              Map<String, Object> additionalDetails) {
        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.invalid", message, fieldPath, actualValue, expected);
        details.putAll(additionalDetails);
        return new WorkspaceException("workspace.invalid", message, details);
    }

    private static WorkspaceException sizeLimit(String message, String fieldPath, Object actualValue,
                                                long actualBytes, long maxBytes) {
        return sizeLimit(message, fieldPath, actualValue, actualBytes, maxBytes, Map.of());
    }

    private static WorkspaceException sizeLimit(String message, String fieldPath, Object actualValue,
                                                long actualBytes, long maxBytes, Map<String, Object> additionalDetails) {
        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.resource_limit", message, fieldPath,
                actualValue, "at most " + maxBytes + " bytes");
        details.put("actualBytes", actualBytes);
        details.put("maxBytes", maxBytes);
        details.putAll(additionalDetails);
        return new WorkspaceException("workspace.resource_limit", message, details);
    }

    private static WorkspaceException resourceLimit(String message, String fieldPath, Object actualValue,
                                                    Object expected, Map<String, Object> additionalDetails) {
        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.resource_limit", message,
                fieldPath, actualValue, expected);
        details.putAll(additionalDetails);
        return new WorkspaceException("workspace.resource_limit", message, details);
    }

    private static WorkspaceException storageFailure(String message, String fieldPath, Object actualValue,
                                                     Object expected, String action, Throwable cause) {
        return storageFailure(message, fieldPath, actualValue, expected, action, cause, Map.of());
    }

    private static WorkspaceException storageFailure(String message, String fieldPath, Object actualValue,
                                                     Object expected, String action, Throwable cause,
                                                     Map<String, Object> additionalDetails) {
        String exceptionType = cause == null ? "unknown" : cause.getClass().getName();
        String reason = cause == null ? "underlying error unavailable"
                : Objects.toString(cause.getMessage(), cause.getClass().getSimpleName());
        String detailedMessage = message + ": " + reason;
        Map<String, Object> details = AiAgentErrorFeedback.error("workspace.storage_failure", detailedMessage,
                fieldPath, actualValue, expected);
        details.put("action", action);
        details.put("exceptionType", exceptionType);
        details.put("reason", reason);
        details.putAll(additionalDetails);
        return new WorkspaceException("workspace.storage_failure", detailedMessage, details);
    }

    public enum SearchMode { LITERAL, REGEX }

    public enum CaseMode { SENSITIVE, INSENSITIVE, SMART }

    public record SearchRequest(
            String query,
            String path,
            SearchMode mode,
            CaseMode caseMode,
            List<String> globs,
            boolean includeHidden,
            boolean respectIgnoreFiles,
            int maxResults
    ) {
        public SearchRequest {
            path = path == null ? "" : path;
            mode = mode == null ? SearchMode.LITERAL : mode;
            caseMode = caseMode == null ? CaseMode.SENSITIVE : caseMode;
            globs = globs == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(globs));
            if (maxResults == 0) {
                maxResults = DEFAULT_SEARCH_RESULTS;
            }
        }

        public SearchRequest(String query) {
            this(query, "", SearchMode.LITERAL, CaseMode.SENSITIVE, List.of(), false, true, DEFAULT_SEARCH_RESULTS);
        }
    }

    public record ListEntry(String path, String entryType, long byteSize, long modifiedRevision) { }

    public record ListResult(long workspaceRevision, List<ListEntry> entries, int totalEntries, int offset, boolean hasMore, Integer nextOffset) { }

    public record SearchSubmatch(int start, int end) { }

    public record SearchMatch(
            String path,
            Integer line,
            Integer column,
            String snippet,
            String text,
            String matchKind,
            List<SearchSubmatch> submatches
    ) { }

    public record SearchResult(
            long workspaceRevision,
            long searchedRevision,
            List<SearchMatch> matches,
            boolean hasMore,
            boolean truncated,
            String truncationReason,
            int matchedFiles,
            int matchedLines,
            long elapsedMs
    ) {
        public SearchResult(long workspaceRevision, List<SearchMatch> matches, boolean hasMore) {
            this(
                    workspaceRevision,
                    workspaceRevision,
                    List.copyOf(matches),
                    hasMore,
                    hasMore,
                    hasMore ? "resultLimit" : null,
                    (int) matches.stream().map(SearchMatch::path).distinct().count(),
                    (int) matches.stream().filter(match -> match.line() != null).count(),
                    0L
            );
        }
    }

    public record FileExcerpt(String path, int startLine, int endLine, int totalLines, String content, String contentSha256, long modifiedRevision, long workspaceRevision) { }

    record RepairEdit(String oldText, String newText) { }
    record RepairArtifact(String path, String toolName, String field, Map<String, Object> payload,
                          String operationId, String content, long workspaceRevision, Map<String, Object> submitted,
                          boolean staged, Map<String, Object> validated) { }

    public record MovedPath(String from, String to) { }

    public record MutationResult(
            List<String> added,
            List<String> modified,
            List<String> deleted,
            List<MovedPath> moved,
            long workspaceRevision,
            List<String> diagnostics
    ) { }

    public static class WorkspaceException extends RuntimeException {
        private final String code;
        private final Map<String, Object> details;

        public WorkspaceException(String code, String message) {
            this(code, message, Map.of());
        }

        public WorkspaceException(String code, String message, Map<String, Object> details) {
            super(message);
            this.code = code;
            this.details = details == null ? Map.of() : new LinkedHashMap<>(details);
        }

        public String code() {
            return code;
        }

        public Map<String, Object> result() {
            Map<String, Object> result = new LinkedHashMap<>(details);
            result.put("code", code);
            result.put("message", getMessage());
            return result;
        }
    }

    public static final class RevisionConflictException extends WorkspaceException {
        private final long expected;
        private final long actual;

        public RevisionConflictException(long expected, long actual) {
            super("workspace.revision_conflict", "Workspace revision conflict: requested " + expected
                    + " but current revision is " + actual + "; read the latest revision before retrying",
                    revisionConflictDetails(expected, actual));
            this.expected = expected;
            this.actual = actual;
        }

        private static Map<String, Object> revisionConflictDetails(long expected, long actual) {
            Map<String, Object> result = AiAgentErrorFeedback.error("workspace.revision_conflict",
                    "Workspace revision conflict: requested " + expected + " but current revision is " + actual
                            + "; read the latest revision before retrying",
                    "expectedRevision", expected, actual);
            result.put("expectedRevision", expected);
            result.put("actualRevision", actual);
            result.put("retryable", true);
            return result;
        }

        public long expected() {
            return expected;
        }

        public long actual() {
            return actual;
        }
    }

    private record LineRange(int endLine, int totalLines, String content) { }

    private record PatchLine(char prefix, String content) { }

    private record PatchHunk(String path, int index, int sourceLine, String header, List<PatchLine> lines) { }

    private sealed interface PatchOperation permits AddOperation, UpdateOperation, DeleteOperation { }

    private record AddOperation(String path, String content) implements PatchOperation { }

    private record UpdateOperation(String path, String moveTo, List<PatchHunk> hunks) implements PatchOperation { }

    private record DeleteOperation(String path) implements PatchOperation { }

    private record ParsedPatch(List<PatchOperation> operations) { }

    private record MutationOutcome(boolean changed, List<String> added, List<String> modified, List<String> deleted, List<MovedPath> moved) {
        private MutationResult result(long revision) {
            return new MutationResult(
                    List.copyOf(added),
                    List.copyOf(modified),
                    List.copyOf(deleted),
                    List.copyOf(moved),
                    revision,
                    List.of()
            );
        }
    }

    @FunctionalInterface
    private interface StageMutation {
        MutationOutcome apply(Path stage, long currentRevision) throws IOException;
    }
}
