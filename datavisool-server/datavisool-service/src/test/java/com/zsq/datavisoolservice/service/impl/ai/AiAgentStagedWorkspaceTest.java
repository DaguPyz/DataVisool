/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AiAgentStagedWorkspaceTest {
    @Test
    void emptyStagedArtifactCanBeReadBeforeAppending(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var artifact = workspace.beginCanvasArtifact(1, "run", "create_canvas_components");

        var excerpt = workspace.readWorkspaceFile(1, artifact.path());
        assertEquals("", excerpt.content());
        assertEquals(1, excerpt.totalLines());
        assertEquals(1, excerpt.endLine());
    }

    @Test
    void appendEnforcesUtf8ChunkByteLimitAndIsAtomic(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var artifact = workspace.beginCanvasArtifact(1, "run", "create_canvas_components");
        assertTrue(artifact.staged());
        assertEquals("", artifact.content());
        String artifactPath = artifact.path();

        String exactLimit = "a".repeat(AiAgentWorkspaceService.MAX_CANVAS_ARTIFACT_CHUNK_BYTES);
        artifact = workspace.appendCanvasArtifact(1, "run", artifact.path(), artifact.workspaceRevision(), exactLimit);
        assertEquals(exactLimit, artifact.content());
        long revision = artifact.workspaceRevision();

        String tooLarge = "界".repeat(2731); // 8193 UTF-8 bytes
        assertEquals(8193, tooLarge.getBytes(StandardCharsets.UTF_8).length);
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.appendCanvasArtifact(1, "run", artifactPath, revision, tooLarge));
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.appendCanvasArtifact(1, "run", artifactPath, revision, ""));
        assertEquals(revision, workspace.workspaceRevision(1));
        assertEquals(exactLimit, workspace.readRepairArtifact(1, "run", artifactPath).content());
    }

    @Test
    void appendAndLockedReadCheckRevisionAndKeepProjectsIsolated(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var first = workspace.beginCanvasArtifact(1, "run", "create_canvas_components");
        var otherProject = workspace.beginCanvasArtifact(2, "run", "create_canvas_components");
        String firstPath = first.path();
        long firstRevision = first.workspaceRevision();

        var stale = assertThrows(AiAgentWorkspaceService.RevisionConflictException.class,
                () -> workspace.appendCanvasArtifact(1, "run", firstPath, firstRevision - 1, "{}"));
        assertEquals(firstRevision - 1, stale.expected());
        assertEquals(firstRevision, stale.actual());
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.appendCanvasArtifact(1, "run", otherProject.path(), firstRevision, "{}"));
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.appendCanvasArtifact(1, "different-run", firstPath, firstRevision, "{}"));

        first = workspace.appendCanvasArtifact(1, "run", first.path(), first.workspaceRevision(), "{}");
        assertEquals("{}", workspace.withRepairArtifact(1, "run", first.path(), first.workspaceRevision(),
                current -> current.content()));
        long currentRevision = first.workspaceRevision();
        assertThrows(AiAgentWorkspaceService.RevisionConflictException.class,
                () -> workspace.withRepairArtifact(1, "run", firstPath, currentRevision - 1, current -> current));
        assertEquals("", workspace.readRepairArtifact(2, "run", otherProject.path()).content());
    }

    @Test
    void appendAndPatchClearValidationEvidenceAndRepeatedValidationDoesNotBumpRevision(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var artifact = workspace.beginCanvasArtifact(1, "run", "create_canvas_components");
        String artifactPath = artifact.path();
        artifact = workspace.appendCanvasArtifact(1, "run", artifact.path(), artifact.workspaceRevision(), "{} ");

        String initialHash = sha256(artifact.content());
        artifact = workspace.recordArtifactValidation(1, "run", artifact.path(), initialHash);
        assertEquals(initialHash, artifact.validated().get("contentSha256"));
        long validatedRevision = artifact.workspaceRevision();
        var duplicate = workspace.recordArtifactValidation(1, "run", artifact.path(), initialHash);
        assertEquals(validatedRevision, duplicate.workspaceRevision());

        artifact = workspace.appendCanvasArtifact(1, "run", artifact.path(), artifact.workspaceRevision(), "\n");
        assertTrue(artifact.validated().isEmpty());
        artifact = workspace.recordArtifactValidation(1, "run", artifact.path(), sha256(artifact.content()));
        artifact = workspace.patchRepairArtifact(1, "run", artifact.path(), artifact.workspaceRevision(),
                List.of(new AiAgentWorkspaceService.RepairEdit("{}", "{\"patched\":true}")));
        assertTrue(artifact.validated().isEmpty());
        assertEquals("{\n  \"patched\": true\n}", artifact.content());
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.recordArtifactValidation(1, "run", artifactPath, initialHash));
    }

    @Test
    void submissionPreservesProtectedStagedMetadataAndBlocksFurtherWrites(@TempDir Path root) {
        var workspace = new AiAgentWorkspaceService(root);
        var staged = workspace.beginCanvasArtifact(1, "run", "render_draft");
        staged = workspace.appendCanvasArtifact(1, "run", staged.path(), staged.workspaceRevision(), "{}");
        staged = workspace.recordArtifactValidation(1, "run", staged.path(), sha256(staged.content()));
        workspace.recordRepairSubmission(1, "run", staged.path(), Map.of("status", "pending"));

        var submitted = workspace.readRepairArtifact(1, "run", staged.path());
        assertTrue(submitted.staged());
        assertEquals(staged.validated(), submitted.validated());
        assertEquals("pending", submitted.submitted().get("status"));
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.appendCanvasArtifact(1, "run", submitted.path(), submitted.workspaceRevision(), " "));
        assertThrows(AiAgentWorkspaceService.WorkspaceException.class,
                () -> workspace.patchRepairArtifact(1, "run", submitted.path(), submitted.workspaceRevision(),
                        List.of(new AiAgentWorkspaceService.RepairEdit("{}", "[]"))));

    }

    private static String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }
}
