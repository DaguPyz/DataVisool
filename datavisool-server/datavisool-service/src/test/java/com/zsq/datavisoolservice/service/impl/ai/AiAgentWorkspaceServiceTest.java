/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import org.junit.Assert;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.Map;

public class AiAgentWorkspaceServiceTest {
    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void isolatesProjectsAndPersistsRevision() throws Exception {
        AiAgentWorkspaceService service = service("isolation");

        AiAgentWorkspaceService.MutationResult first = service.applyWorkspacePatch(
                101L,
                0L,
                "*** Begin Patch\n*** Add File: src/project.txt\n+project-101\n*** End Patch"
        );
        Assert.assertEquals(1L, first.workspaceRevision());
        service.applyWorkspacePatch(
                202L,
                0L,
                "*** Begin Patch\n*** Add File: src/project.txt\n+project-202\n*** End Patch"
        );

        Assert.assertEquals("project-101", service.readWorkspaceFile(101L, "src/project.txt").content());
        Assert.assertEquals("project-202", service.readWorkspaceFile(202L, "src/project.txt").content());
        Assert.assertEquals(1L, service.workspaceRevision(101L));
        Assert.assertEquals(1L, service.workspaceRevision(202L));
    }

    @Test
    public void refusesLegacyMetadataWithoutModifyingIt() throws Exception {
        AiAgentWorkspaceService service = service("legacy-metadata");
        Path root = temporaryFolder.getRoot().toPath().resolve("legacy-metadata/agent-project-workspaces/1");
        Path oldMetadata = root.resolve(".lcp-agent-workspace");
        Files.createDirectories(oldMetadata);
        Files.writeString(oldMetadata.resolve("revision"), "7", StandardCharsets.UTF_8);

        var error = Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class, () -> service.workspaceRevision(1L));
        Assert.assertTrue(error.getMessage().contains("不支持直接使用旧工作区"));
        Assert.assertFalse(Files.exists(root.resolve(".datavisool-agent-workspace")));
        Assert.assertEquals("7", Files.readString(oldMetadata.resolve("revision")));
    }

    @Test
    public void listsReadsAndSearchesWithoutPhysicalPaths() throws Exception {
        AiAgentWorkspaceService service = service("read-list-search");
        service.applyWorkspacePatch(
                1L,
                0L,
                "*** Begin Patch\n*** Add File: src/main.txt\n+Hello Agent\n+Second line\n*** Add File: src/other.txt\n+Nothing\n*** End Patch"
        );

        AiAgentWorkspaceService.ListResult listing = service.listWorkspaceFiles(1L, "", 3, 0, 20);
        Assert.assertEquals(3, listing.totalEntries());
        Assert.assertTrue(listing.entries().stream().anyMatch(item -> item.path().equals("src") && item.entryType().equals("directory")));
        Assert.assertTrue(listing.entries().stream().allMatch(item -> !item.path().contains("workspaces")));

        AiAgentWorkspaceService.FileExcerpt excerpt = service.readWorkspaceFile(1L, "src/main.txt", 1, 2);
        Assert.assertEquals(2, excerpt.totalLines());
        Assert.assertEquals("Hello Agent\nSecond line", excerpt.content());
        Assert.assertEquals(64, excerpt.contentSha256().length());

        AiAgentWorkspaceService.SearchResult search = service.searchWorkspaceFiles(
                1L,
                new AiAgentWorkspaceService.SearchRequest(
                        "agent", "", AiAgentWorkspaceService.SearchMode.LITERAL,
                        AiAgentWorkspaceService.CaseMode.INSENSITIVE, List.of("*.txt"), false, true, 10
                )
        );
        Assert.assertEquals(1, search.matches().size());
        Assert.assertEquals("src/main.txt", search.matches().get(0).path());
        Assert.assertEquals(1, search.matches().get(0).line().intValue());
    }

    @Test
    public void rejectsTraversalAndSymlinks() throws Exception {
        AiAgentWorkspaceService service = service("security");
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 0L,
                        "*** Begin Patch\n*** Add File: ../escape.txt\n+x\n*** End Patch"));
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "../../etc/passwd", 1, 1));

        Path projectRoot = temporaryFolder.getRoot().toPath().resolve("security/agent-project-workspaces/1");
        Files.createDirectories(projectRoot.resolve("safe"));
        Path outside = temporaryFolder.getRoot().toPath().resolve("outside.txt");
        Files.writeString(outside, "outside", StandardCharsets.UTF_8);
        try {
            Files.createSymbolicLink(projectRoot.resolve("safe/link.txt"), outside);
        } catch (UnsupportedOperationException | SecurityException | IOException e) {
            Assume.assumeTrue("symbolic links are available", false);
        }
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "safe/link.txt", 1, 1));
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.listWorkspaceFiles(1L, "", 3, 0, 20));
    }

    @Test
    public void rejectsHardLinkedWorkspaceFilesWhenSupported() throws Exception {
        AiAgentWorkspaceService service = service("hard-links");
        service.workspaceRevision(1L);
        Path projectRoot = temporaryFolder.getRoot().toPath().resolve("hard-links/agent-project-workspaces/1");
        Path outside = temporaryFolder.getRoot().toPath().resolve("hard-link-source.txt");
        Files.writeString(outside, "outside", StandardCharsets.UTF_8);
        try {
            Files.createLink(projectRoot.resolve("linked.txt"), outside);
        } catch (UnsupportedOperationException | SecurityException | IOException e) {
            Assume.assumeTrue("hard links are available", false);
        }
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.listWorkspaceFiles(1L, "", 3, 0, 20));
    }

    @Test
    public void enforcesRevisionAndPatchIsAtomicOnValidationFailure() throws Exception {
        AiAgentWorkspaceService service = service("revision");
        AiAgentWorkspaceService.MutationResult added = service.applyWorkspacePatch(
                1L, 0L,
                "*** Begin Patch\n*** Add File: old.txt\n+old\n*** End Patch"
        );
        Assert.assertEquals(1L, added.workspaceRevision());
        Assert.assertThrows(AiAgentWorkspaceService.RevisionConflictException.class,
                () -> service.applyWorkspacePatch(1L, 0L,
                        "*** Begin Patch\n*** Add File: stale.txt\n+stale\n*** End Patch"));

        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 1L,
                        "*** Begin Patch\n*** Add File: should-not-exist.txt\n+temporary\n*** Update File: missing.txt\n@@\n-nope\n+still nope\n*** End Patch"));
        Assert.assertEquals(1L, service.workspaceRevision(1L));
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "should-not-exist.txt", 1, 1));
        Assert.assertEquals("old", service.readWorkspaceFile(1L, "old.txt").content());
    }

    @Test
    public void supportsAddUpdateMoveAndDelete() throws Exception {
        AiAgentWorkspaceService service = service("patch-operations");
        AiAgentWorkspaceService.MutationResult initial = service.applyWorkspacePatch(
                1L, 0L,
                "*** Begin Patch\n*** Add File: old.txt\n+old\n*** Add File: remove.txt\n+remove\n*** End Patch"
        );
        AiAgentWorkspaceService.MutationResult updated = service.applyWorkspacePatch(
                1L, initial.workspaceRevision(),
                "*** Begin Patch\n*** Update File: old.txt\n@@\n-old\n+new\n*** Move to: renamed.txt\n*** End Patch"
        );
        Assert.assertEquals(2L, updated.workspaceRevision());
        Assert.assertEquals("new", service.readWorkspaceFile(1L, "renamed.txt").content());
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "old.txt", 1, 1));

        AiAgentWorkspaceService.MutationResult deleted = service.deleteWorkspacePath(
                1L, "remove.txt", updated.workspaceRevision());
        Assert.assertEquals(3L, deleted.workspaceRevision());
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "remove.txt", 1, 1));

        AiAgentWorkspaceService.MutationResult moved = service.moveWorkspacePath(
                1L, "renamed.txt", "nested/final.txt", deleted.workspaceRevision());
        Assert.assertEquals(4L, moved.workspaceRevision());
        Assert.assertEquals("new", service.readWorkspaceFile(1L, "nested/final.txt").content());
    }

    @Test
    public void limitsReadLineCountAndSearchResults() throws Exception {
        AiAgentWorkspaceService service = service("limits");
        StringBuilder patch = new StringBuilder("*** Begin Patch\n*** Add File: lines.txt\n");
        for (int i = 0; i < 405; i++) {
            patch.append("+line-").append(i).append('\n');
        }
        patch.append("*** End Patch");
        service.applyWorkspacePatch(1L, 0L, patch.toString());
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "lines.txt", 1, 401));
        Assert.assertEquals(400, service.readWorkspaceFile(1L, "lines.txt", 1, 400).endLine());
    }

    @Test
    public void reportsReadRangeAndPathRequirementsWithActualValues() throws Exception {
        AiAgentWorkspaceService service = service("precise-read-errors");
        service.applyWorkspacePatch(1L, 0L,
                "*** Begin Patch\n*** Add File: lines.txt\n+one\n+two\n+three\n*** End Patch");

        AiAgentWorkspaceService.WorkspaceException pastEnd = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "lines.txt", 4, 4));
        Assert.assertEquals("startLine", pastEnd.result().get("fieldPath"));
        Assert.assertEquals(4, pastEnd.result().get("actualValue"));
        Assert.assertEquals(3, pastEnd.result().get("totalLines"));
        Assert.assertEquals("lines.txt", pastEnd.result().get("path"));

        AiAgentWorkspaceService.WorkspaceException reversed = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "lines.txt", 3, 2));
        Assert.assertEquals("endLine", reversed.result().get("fieldPath"));
        Assert.assertEquals(2, reversed.result().get("actualValue"));
        Assert.assertTrue(reversed.result().get("expected").toString().contains("startLine (3)"));

        AiAgentWorkspaceService.WorkspaceException missing = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "missing.txt", 1, 1));
        Assert.assertEquals("missing.txt", missing.result().get("actualValue"));
        Assert.assertEquals("existing regular file inside the project Workspace", missing.result().get("expected"));
    }

    @Test
    public void reportsPatchSyntaxAndContextMismatchWithPathHunkLineAndExpectedContent() throws Exception {
        AiAgentWorkspaceService service = service("precise-patch-errors");
        AiAgentWorkspaceService.WorkspaceException syntax = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 0L,
                        "*** Begin Patch\n*** Update File: src/app.txt\nnot a hunk\n*** End Patch"));
        Assert.assertEquals("src/app.txt", syntax.result().get("path"));
        Assert.assertEquals(1, syntax.result().get("hunkIndex"));
        Assert.assertEquals(3, syntax.result().get("line"));
        Assert.assertEquals("not a hunk", syntax.result().get("actualValue"));
        Assert.assertTrue(syntax.result().get("expected").toString().contains("@@"));

        service.applyWorkspacePatch(1L, 0L,
                "*** Begin Patch\n*** Add File: src/app.txt\n+alpha\n+beta\n*** End Patch");
        AiAgentWorkspaceService.WorkspaceException mismatch = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 1L,
                        "*** Begin Patch\n*** Update File: src/app.txt\n@@\n-not present\n+replacement\n*** End Patch"));
        Assert.assertEquals("src/app.txt", mismatch.result().get("path"));
        Assert.assertEquals(1, mismatch.result().get("hunkIndex"));
        Assert.assertEquals(0, mismatch.result().get("matchCount"));
        Assert.assertEquals(List.of("not present"), ((Map<?, ?>) mismatch.result().get("expected")).get("contextLines"));
        Assert.assertTrue(((Map<?, ?>) mismatch.result().get("actual")).containsKey("lines"));
        Assert.assertTrue(mismatch.result().get("recovery").toString().contains("Read the current file"));
    }

    @Test
    public void preservesRegexGlobAndPatchSizeDiagnostics() throws Exception {
        AiAgentWorkspaceService service = service("parser-and-size-errors");
        AiAgentWorkspaceService.WorkspaceException regex = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.searchWorkspaceFiles(1L, new AiAgentWorkspaceService.SearchRequest(
                        "[", "", AiAgentWorkspaceService.SearchMode.REGEX,
                        AiAgentWorkspaceService.CaseMode.SENSITIVE, List.of(), false, true, 10)));
        Assert.assertEquals("[", regex.result().get("actualValue"));
        Assert.assertNotNull(regex.result().get("parserReason"));
        Assert.assertEquals(0, regex.result().get("parserIndex"));

        AiAgentWorkspaceService.SearchRequest badGlob = new AiAgentWorkspaceService.SearchRequest(
                "x", "", AiAgentWorkspaceService.SearchMode.LITERAL,
                AiAgentWorkspaceService.CaseMode.SENSITIVE, List.of("*.txt", "["), false, true, 10);
        AiAgentWorkspaceService.WorkspaceException glob = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class, () -> service.searchWorkspaceFiles(1L, badGlob));
        Assert.assertEquals("globs[1]", glob.result().get("fieldPath"));
        Assert.assertEquals("[", glob.result().get("actualValue"));
        Assert.assertNotNull(glob.result().get("parserReason"));
        Assert.assertNotNull(glob.result().get("parserIndex"));

        String oversizedPatch = "*** Begin Patch\n" + "x".repeat(AiAgentWorkspaceService.MAX_PATCH_BYTES);
        AiAgentWorkspaceService.WorkspaceException size = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 0L, oversizedPatch));
        Assert.assertEquals((long) oversizedPatch.getBytes(StandardCharsets.UTF_8).length, size.result().get("actualBytes"));
        Assert.assertEquals((long) AiAgentWorkspaceService.MAX_PATCH_BYTES, size.result().get("maxBytes"));
        Assert.assertEquals("patch", size.result().get("fieldPath"));
    }

    @Test
    public void reportsFileSizeInBytesAndMaximum() throws Exception {
        AiAgentWorkspaceService service = service("file-size-details");
        Path projectRoot = temporaryFolder.getRoot().toPath().resolve("file-size-details/agent-project-workspaces/1");
        service.workspaceRevision(1L);
        Path oversized = projectRoot.resolve("large.txt");
        Files.write(oversized, new byte[(int) AiAgentWorkspaceService.MAX_FILE_BYTES + 1]);

        AiAgentWorkspaceService.WorkspaceException size = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "large.txt", 1, 1));
        Assert.assertEquals("large.txt", size.result().get("path"));
        Assert.assertEquals((long) AiAgentWorkspaceService.MAX_FILE_BYTES + 1, size.result().get("actualValue"));
        Assert.assertEquals((long) AiAgentWorkspaceService.MAX_FILE_BYTES + 1, size.result().get("actualBytes"));
        Assert.assertEquals(AiAgentWorkspaceService.MAX_FILE_BYTES, size.result().get("maxBytes"));
    }

    @Test
    public void repairArtifactReportsEditIndexMatchCountAndLocations() throws Exception {
        AiAgentWorkspaceService service = service("repair-edit-details");
        AiAgentWorkspaceService.RepairArtifact created = service.beginCanvasArtifact(1L, "run", "create_canvas_components");
        AiAgentWorkspaceService.RepairArtifact artifact = service.appendCanvasArtifact(1L, "run",
                created.path(), created.workspaceRevision(), "{\"value\":\"same same\"}");

        AiAgentWorkspaceService.WorkspaceException ambiguous = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.patchRepairArtifact(1L, "run", artifact.path(), artifact.workspaceRevision(),
                        List.of(new AiAgentWorkspaceService.RepairEdit("same", "other"))));
        Assert.assertEquals(0, ambiguous.result().get("editIndex"));
        Assert.assertEquals(1, ambiguous.result().get("editNumber"));
        Assert.assertEquals("edits[0].oldText", ambiguous.result().get("fieldPath"));
        Assert.assertEquals(2, ambiguous.result().get("matchCount"));
        Assert.assertEquals(2, ((List<?>) ambiguous.result().get("matchLocations")).size());
        Assert.assertEquals(artifact.path(), ambiguous.result().get("path"));

        AiAgentWorkspaceService.WorkspaceException missing = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.patchRepairArtifact(1L, "run", artifact.path(), artifact.workspaceRevision(),
                        List.of(new AiAgentWorkspaceService.RepairEdit("absent", "other"))));
        Assert.assertEquals(0, missing.result().get("matchCount"));
        Assert.assertEquals(List.of(), missing.result().get("matchLocations"));
        Assert.assertTrue(missing.result().get("recovery").toString().contains("current artifact"));
    }

    @Test
    public void validatesJsonAndTracksPerFileRevision() throws Exception {
        AiAgentWorkspaceService service = service("json-revision");
        String invalidJson = " ".repeat(600) + "{bad}";
        AiAgentWorkspaceService.WorkspaceException jsonError = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 0L,
                        "*** Begin Patch\n*** Add File: invalid.json\n+" + invalidJson + "\n*** End Patch"));
        Assert.assertEquals("content", jsonError.result().get("fieldPath"));
        Assert.assertEquals(invalidJson + "\n", jsonError.result().get("actualValue"));
        Assert.assertFalse(jsonError.result().containsKey("actualValueTruncated"));
        Assert.assertNotNull(jsonError.result().get("parserIndex"));
        Assert.assertNotNull(jsonError.result().get("line"));
        Assert.assertNotNull(jsonError.result().get("column"));
        AiAgentWorkspaceService.MutationResult added = service.applyWorkspacePatch(
                1L, 0L,
                "*** Begin Patch\n*** Add File: a.json\n+{\"a\":1}\n*** Add File: b.txt\n+b\n*** End Patch"
        );
        Assert.assertTrue(added.diagnostics().isEmpty());
        Assert.assertEquals(1L, service.readWorkspaceFile(1L, "a.json").modifiedRevision());
        service.applyWorkspacePatch(1L, added.workspaceRevision(),
                "*** Begin Patch\n*** Update File: b.txt\n@@\n-b\n+b2\n*** End Patch");
        Assert.assertEquals(1L, service.readWorkspaceFile(1L, "a.json").modifiedRevision());
        Assert.assertEquals(2L, service.readWorkspaceFile(1L, "b.txt").modifiedRevision());
        Assert.assertEquals(1L, service.listWorkspaceFiles(1L, "", 2, 0, 20).entries().stream()
                .filter(entry -> entry.path().equals("a.json"))
                .findFirst().orElseThrow().modifiedRevision());
    }

    @Test
    public void rejectsDesktopUnsafePortablePathForms() throws Exception {
        AiAgentWorkspaceService service = service("portable-paths");
        for (String path : List.of("a\\b.txt", "bad*.txt", "CON.txt", "trailing.", "control\u0001.txt", ".datavisool-tmp-file")) {
            Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                    () -> service.applyWorkspacePatch(1L, 0L,
                            "*** Begin Patch\n*** Add File: " + path + "\n+x\n*** End Patch"));
        }
        String longPath = "a/" + "x".repeat(1020) + ".txt";
        Assert.assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 0L,
                        "*** Begin Patch\n*** Add File: " + longPath + "\n+x\n*** End Patch"));
    }

    @Test
    public void searchesPathAndContentAndReportsTruncationSemantics() throws Exception {
        AiAgentWorkspaceService service = service("search-contract");
        service.applyWorkspacePatch(1L, 0L,
                "*** Begin Patch\n*** Add File: needle-path.txt\n+other\n*** Add File: other.txt\n+needle\n*** End Patch");
        AiAgentWorkspaceService.SearchResult complete = service.searchWorkspaceFiles(
                1L, new AiAgentWorkspaceService.SearchRequest(
                        "needle", "", AiAgentWorkspaceService.SearchMode.LITERAL,
                        AiAgentWorkspaceService.CaseMode.SENSITIVE, List.of(), false, true, 2));
        Assert.assertEquals(1L, complete.searchedRevision());
        Assert.assertEquals(1L, complete.workspaceRevision());
        Assert.assertFalse(complete.truncated());
        Assert.assertFalse(complete.hasMore());
        Assert.assertEquals(2, complete.matches().size());
        Assert.assertTrue(complete.matches().stream().anyMatch(match -> "path".equals(match.matchKind())));
        Assert.assertTrue(complete.matches().stream().anyMatch(match -> "content".equals(match.matchKind())));
        Assert.assertEquals(2, complete.matchedFiles());
        Assert.assertEquals(1, complete.matchedLines());

        AiAgentWorkspaceService.SearchResult truncated = service.searchWorkspaceFiles(
                1L, new AiAgentWorkspaceService.SearchRequest(
                        "needle", "", AiAgentWorkspaceService.SearchMode.LITERAL,
                        AiAgentWorkspaceService.CaseMode.SENSITIVE, List.of(), false, true, 1));
        Assert.assertTrue(truncated.truncated());
        Assert.assertEquals("resultLimit", truncated.truncationReason());

        AiAgentWorkspaceService.SearchResult excluded = service.searchWorkspaceFiles(
                1L, new AiAgentWorkspaceService.SearchRequest(
                        "needle", "", AiAgentWorkspaceService.SearchMode.LITERAL,
                        AiAgentWorkspaceService.CaseMode.SENSITIVE, List.of("*.txt", "!other.txt"), false, true, 10));
        Assert.assertTrue(excluded.matches().stream().allMatch(match -> match.path().equals("needle-path.txt")));
    }

    @Test
    public void trimsSearchResponseToSerializedOutputBudget() throws Exception {
        AiAgentWorkspaceService service = service("search-response-limit");
        service.workspaceRevision(1L);
        Path projectRoot = temporaryFolder.getRoot().toPath().resolve("search-response-limit/agent-project-workspaces/1");
        StringBuilder content = new StringBuilder();
        for (int index = 0; index < 100; index++) {
            content.append("needle-").append("x".repeat(7_500)).append('\n');
        }
        Files.writeString(projectRoot.resolve("large-search.txt"), content, StandardCharsets.UTF_8);

        AiAgentWorkspaceService.SearchResult result = service.searchWorkspaceFiles(
                1L, new AiAgentWorkspaceService.SearchRequest(
                        "needle", "", AiAgentWorkspaceService.SearchMode.LITERAL,
                        AiAgentWorkspaceService.CaseMode.SENSITIVE, List.of("*.txt"), false, true, 100));
        Assert.assertTrue(result.truncated());
        Assert.assertEquals("responseLimit", result.truncationReason());
        Assert.assertTrue(result.matches().size() < 100);
    }

    @Test
    public void enforcesWorkspaceTotalAndSerializedOutputLimits() throws Exception {
        AiAgentWorkspaceService service = service("workspace-limits");
        Path projectRoot = temporaryFolder.getRoot().toPath().resolve("workspace-limits/agent-project-workspaces/1");
        service.workspaceRevision(1L);
        Files.createDirectories(projectRoot.resolve("bulk"));
        for (int i = 0; i < AiAgentWorkspaceService.MAX_WORKSPACE_FILES + 1; i++) {
            Files.createFile(projectRoot.resolve("bulk").resolve("f" + i + ".txt"));
        }
        AiAgentWorkspaceService.WorkspaceException fileCount = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.applyWorkspacePatch(1L, 0L,
                        "*** Begin Patch\n*** Add File: another.txt\n+x\n*** End Patch"));
        Assert.assertEquals("workspace.fileCount", fileCount.result().get("fieldPath"));
        Assert.assertEquals(AiAgentWorkspaceService.MAX_WORKSPACE_FILES + 2, fileCount.result().get("actualValue"));
        Assert.assertEquals("integer <= " + AiAgentWorkspaceService.MAX_WORKSPACE_FILES, fileCount.result().get("expected"));

        Files.deleteIfExists(projectRoot.resolve("bulk").resolve("f0.txt"));
        Files.writeString(projectRoot.resolve("large.txt"), "x".repeat(600 * 1024), StandardCharsets.UTF_8);
        AiAgentWorkspaceService.WorkspaceException outputLimit = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readWorkspaceFile(1L, "large.txt", 1, 1));
        Assert.assertEquals("result.byteLength", outputLimit.result().get("fieldPath"));
        Assert.assertTrue(((Number) outputLimit.result().get("actualValue")).longValue()
                > AiAgentWorkspaceService.MAX_OUTPUT_BYTES);
        Assert.assertEquals("at most " + AiAgentWorkspaceService.MAX_OUTPUT_BYTES + " bytes",
                outputLimit.result().get("expected"));
    }

    @Test
    public void reportsListBoundsAndNonDirectoryPathState() throws Exception {
        AiAgentWorkspaceService service = service("list-diagnostics");
        service.applyWorkspacePatch(1L, 0L,
                "*** Begin Patch\n*** Add File: file.txt\n+x\n*** End Patch");

        AiAgentWorkspaceService.WorkspaceException depth = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.listWorkspaceFiles(1L, "", AiAgentWorkspaceService.MAX_LIST_DEPTH + 1, 0, 10));
        Assert.assertEquals("depth", depth.result().get("fieldPath"));
        Assert.assertEquals(AiAgentWorkspaceService.MAX_LIST_DEPTH + 1, depth.result().get("actualValue"));
        Assert.assertEquals("integer between 1 and " + AiAgentWorkspaceService.MAX_LIST_DEPTH, depth.result().get("expected"));

        AiAgentWorkspaceService.WorkspaceException offset = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.listWorkspaceFiles(1L, "", 1, -1, 10));
        Assert.assertEquals("offset", offset.result().get("fieldPath"));
        Assert.assertEquals(-1, offset.result().get("actualValue"));

        AiAgentWorkspaceService.WorkspaceException notDirectory = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.listWorkspaceFiles(1L, "file.txt", 1, 0, 10));
        Assert.assertEquals("path", notDirectory.result().get("fieldPath"));
        Assert.assertEquals("file.txt", notDirectory.result().get("actualValue"));
        Assert.assertEquals(true, ((Map<?, ?>) notDirectory.result().get("actualState")).get("regularFile"));
    }

    @Test
    public void reportsArtifactChunkHashRunAndPathFailuresPrecisely() throws Exception {
        AiAgentWorkspaceService service = service("artifact-diagnostics");
        AiAgentWorkspaceService.WorkspaceException unsupportedTool = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.beginCanvasArtifact(1L, "run", "unknown_tool"));
        Assert.assertEquals("toolName", unsupportedTool.result().get("fieldPath"));
        Assert.assertEquals("unknown_tool", unsupportedTool.result().get("actualValue"));
        Assert.assertTrue(((List<?>) unsupportedTool.result().get("expected")).contains("render_draft"));

        AiAgentWorkspaceService.RepairArtifact artifact = service.beginCanvasArtifact(1L, "run", "render_draft");
        String oversizedChunk = "x".repeat(AiAgentWorkspaceService.MAX_CANVAS_ARTIFACT_CHUNK_BYTES + 1);
        AiAgentWorkspaceService.WorkspaceException chunk = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.appendCanvasArtifact(1L, "run", artifact.path(), artifact.workspaceRevision(), oversizedChunk));
        Assert.assertEquals("content.byteLength", chunk.result().get("fieldPath"));
        Assert.assertEquals((long) oversizedChunk.getBytes(StandardCharsets.UTF_8).length, chunk.result().get("actualValue"));
        Assert.assertEquals((long) AiAgentWorkspaceService.MAX_CANVAS_ARTIFACT_CHUNK_BYTES, chunk.result().get("maxBytes"));
        Assert.assertEquals(artifact.path(), chunk.result().get("path"));

        AiAgentWorkspaceService.WorkspaceException badHash = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.recordArtifactValidation(1L, "run", artifact.path(), "BAD"));
        Assert.assertEquals("contentSha256", badHash.result().get("fieldPath"));
        Assert.assertEquals("BAD", badHash.result().get("actualValue"));
        Assert.assertEquals("64 lowercase hexadecimal characters", badHash.result().get("expected"));

        AiAgentWorkspaceService.WorkspaceException mismatchedHash = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.recordArtifactValidation(1L, "run", artifact.path(), "0".repeat(64)));
        Assert.assertEquals("contentSha256", mismatchedHash.result().get("fieldPath"));
        Assert.assertEquals("0".repeat(64), mismatchedHash.result().get("actualValue"));
        Assert.assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                mismatchedHash.result().get("expected"));

        AiAgentWorkspaceService.WorkspaceException wrongRun = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readRepairArtifact(1L, "other-run", artifact.path()));
        Assert.assertEquals("runId", wrongRun.result().get("fieldPath"));
        Assert.assertEquals("other-run", wrongRun.result().get("actualValue"));
        Assert.assertEquals("run", wrongRun.result().get("expected"));

        AiAgentWorkspaceService.WorkspaceException badPath = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.readRepairArtifact(1L, "run", "agent-repairs/nope.txt"));
        Assert.assertEquals("path", badPath.result().get("fieldPath"));
        Assert.assertEquals("agent-repairs/nope.txt", badPath.result().get("actualValue"));
        Assert.assertTrue(badPath.result().get("expected").toString().contains("36-character UUID"));

        AiAgentWorkspaceService.RepairArtifact legacy = service.beginCanvasArtifact(1L, "run", "render_draft");
        String id = Path.of(legacy.path()).getFileName().toString().replace(".txt", ".json");
        Path descriptor = temporaryFolder.getRoot().toPath().resolve("artifact-diagnostics/agent-project-workspaces/1/.datavisool-agent-workspace/repairs").resolve(id);
        var metadata = com.alibaba.fastjson2.JSON.parseObject(Files.readString(descriptor));
        metadata.remove("staged");
        Files.writeString(descriptor, metadata.toJSONString());
        AiAgentWorkspaceService.WorkspaceException notStaged = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.appendCanvasArtifact(1L, "run", legacy.path(), legacy.workspaceRevision(), "x"));
        Assert.assertEquals("staged", notStaged.result().get("fieldPath"));
        Assert.assertTrue(notStaged.result().containsKey("actualValue"));
        Assert.assertNull(notStaged.result().get("actualValue"));
        Assert.assertEquals("missing", notStaged.result().get("actualType"));
        Assert.assertEquals(false, ((Map<?, ?>) notStaged.result().get("metadataState")).get("staged"));
        Assert.assertEquals(true, notStaged.result().get("expected"));

        service.recordRepairSubmission(1L, "run", artifact.path(), Map.of("status", "submitted"));
        AiAgentWorkspaceService.WorkspaceException submitted = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.appendCanvasArtifact(1L, "run", artifact.path(), service.workspaceRevision(1L), "x"));
        Assert.assertEquals("submitted", submitted.result().get("fieldPath"));
        Assert.assertEquals(Map.of("status", "submitted"), submitted.result().get("actualValue"));
        Assert.assertEquals("no submitted result", submitted.result().get("expected"));
    }

    @Test
    public void reportsMoveAndDeleteTargetState() throws Exception {
        AiAgentWorkspaceService service = service("path-target-diagnostics");
        service.applyWorkspacePatch(1L, 0L,
                "*** Begin Patch\n*** Add File: source.txt\n+source\n*** Add File: target.txt\n+target\n*** End Patch");

        AiAgentWorkspaceService.WorkspaceException occupied = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.moveWorkspacePath(1L, "source.txt", "target.txt", 1L));
        Assert.assertEquals("to", occupied.result().get("fieldPath"));
        Assert.assertEquals("target.txt", occupied.result().get("actualValue"));
        Assert.assertEquals("source.txt", occupied.result().get("from"));
        Assert.assertEquals(true, ((Map<?, ?>) occupied.result().get("actualState")).get("exists"));

        AiAgentWorkspaceService.WorkspaceException missing = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.deleteWorkspacePath(1L, "missing.txt", 1L));
        Assert.assertEquals("path", missing.result().get("fieldPath"));
        Assert.assertEquals("missing.txt", missing.result().get("actualValue"));
        Assert.assertEquals(false, ((Map<?, ?>) missing.result().get("actualState")).get("exists"));
    }

    @Test
    public void reportsRevisionAndFileRevisionMetadataContents() throws Exception {
        AiAgentWorkspaceService service = service("revision-metadata-diagnostics");
        service.workspaceRevision(1L);
        Path metadata = temporaryFolder.getRoot().toPath()
                .resolve("revision-metadata-diagnostics/agent-project-workspaces/1/.datavisool-agent-workspace");
        Files.writeString(metadata.resolve("revision"), "not-a-revision", StandardCharsets.UTF_8);
        AiAgentWorkspaceService.WorkspaceException revision = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class, () -> service.workspaceRevision(1L));
        Assert.assertEquals("workspace.revision", revision.result().get("fieldPath"));
        Assert.assertEquals("not-a-revision", revision.result().get("actualValue"));
        Assert.assertEquals("non-negative base-10 integer", revision.result().get("expected"));
        Assert.assertNotNull(revision.result().get("parserReason"));

        Files.writeString(metadata.resolve("revision"), "0", StandardCharsets.UTF_8);
        Files.writeString(metadata.resolve("file-revisions"), "not-an-entry", StandardCharsets.UTF_8);
        AiAgentWorkspaceService.WorkspaceException fileRevision = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class,
                () -> service.listWorkspaceFiles(1L, "", 1, 0, 10));
        Assert.assertEquals("workspace.fileRevisions.lines[0]", fileRevision.result().get("fieldPath"));
        Assert.assertEquals("not-an-entry", fileRevision.result().get("actualValue"));
        Assert.assertEquals(1, fileRevision.result().get("line"));
        Assert.assertTrue(fileRevision.result().get("expected").toString().contains("base64url(path)"));
    }

    @Test
    public void reportsWorkspaceByteTotalAndMaximum() throws Exception {
        Path root = temporaryFolder.newFolder("workspace-byte-total").toPath();
        Path large = root.resolve("large.bin");
        try (FileChannel channel = FileChannel.open(large, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            channel.position(AiAgentWorkspaceService.MAX_WORKSPACE_BYTES);
            channel.write(ByteBuffer.wrap(new byte[]{1}));
        }

        Method enforceLimits = AiAgentWorkspaceService.class.getDeclaredMethod("enforceWorkspaceLimits", Path.class);
        enforceLimits.setAccessible(true);
        InvocationTargetException invocation = Assert.assertThrows(InvocationTargetException.class,
                () -> enforceLimits.invoke(null, root));
        Assert.assertTrue(invocation.getCause() instanceof AiAgentWorkspaceService.WorkspaceException);
        AiAgentWorkspaceService.WorkspaceException size =
                (AiAgentWorkspaceService.WorkspaceException) invocation.getCause();
        Assert.assertEquals("workspace.byteCount", size.result().get("fieldPath"));
        Assert.assertEquals(AiAgentWorkspaceService.MAX_WORKSPACE_BYTES + 1, size.result().get("actualValue"));
        Assert.assertEquals("integer <= " + AiAgentWorkspaceService.MAX_WORKSPACE_BYTES, size.result().get("expected"));
        Assert.assertEquals(AiAgentWorkspaceService.MAX_WORKSPACE_BYTES, size.result().get("maxBytes"));
    }

    @Test
    public void reportsInvalidRecoveryArtifactState() throws Exception {
        AiAgentWorkspaceService service = service("recovery-diagnostics");
        Path workspaces = temporaryFolder.getRoot().toPath()
                .resolve("recovery-diagnostics/agent-project-workspaces");
        Files.createDirectories(workspaces);
        Path candidate = workspaces.resolve(".1.staging-corrupt");
        Files.writeString(candidate, "not a directory", StandardCharsets.UTF_8);

        AiAgentWorkspaceService.WorkspaceException recovery = Assert.assertThrows(
                AiAgentWorkspaceService.WorkspaceException.class, () -> service.workspaceRevision(1L));
        Assert.assertEquals("workspace.recoveryArtifact", recovery.result().get("fieldPath"));
        Assert.assertEquals(false, ((Map<?, ?>) recovery.result().get("actualValue")).get("directory"));
        Assert.assertEquals(".1.staging-corrupt", recovery.result().get("artifactName"));
        Assert.assertTrue(recovery.result().get("expected").toString().contains("staging or backup directory"));
    }

    @Test
    public void restoresBackupAfterInterruptedDirectorySwap() throws Exception {
        AiAgentWorkspaceService service = service("recovery");
        service.applyWorkspacePatch(1L, 0L,
                "*** Begin Patch\n*** Add File: stable.txt\n+stable\n*** End Patch");
        Path root = temporaryFolder.getRoot().toPath().resolve("recovery/agent-project-workspaces/1");
        Path backup = root.resolveSibling(".1.backup-crashed");
        Files.move(root, backup);

        Assert.assertEquals(1L, service.workspaceRevision(1L));
        Assert.assertEquals("stable", service.readWorkspaceFile(1L, "stable.txt").content());
        Assert.assertTrue(Files.isDirectory(root));
        Assert.assertFalse(Files.exists(backup));
    }

    private AiAgentWorkspaceService service(String name) throws IOException {
        return new AiAgentWorkspaceService(temporaryFolder.newFolder(name).toPath());
    }
}
