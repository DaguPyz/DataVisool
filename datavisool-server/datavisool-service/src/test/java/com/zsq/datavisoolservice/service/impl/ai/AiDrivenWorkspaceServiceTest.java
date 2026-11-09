/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.global.AppException;
import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public class AiDrivenWorkspaceServiceTest {

    @Rule
    public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void createsIndependentWorkspaceAndPersistsTaskState() throws Exception {
        Path storageRoot = temporaryFolder.newFolder("ai-storage").toPath();
        AiDrivenWorkspaceService service = new AiDrivenWorkspaceService(storageRoot);
        long now = System.currentTimeMillis();

        service.createWorkspace(
                new AiDrivenWorkspaceService.WorkspaceManifest(
                        "ai-driven-run-1",
                        "ai-request-1",
                        "user-1",
                        "project-1",
                        "session-1",
                        now
                ),
                "{\"requestId\":\"ai-request-1\"}"
        );
        service.persistTask(
                "ai-driven-run-1",
                "{\"status\":\"running\"}",
                "[{\"code\":\"sample\"}]",
                null
        );
        service.createWorkspace(
                new AiDrivenWorkspaceService.WorkspaceManifest(
                        "ai-driven-run-2",
                        "ai-request-2",
                        "user-2",
                        "project-2",
                        "session-2",
                        now
                ),
                "{\"requestId\":\"ai-request-2\"}"
        );
        service.persistTask(
                "ai-driven-run-2",
                "{\"status\":\"completed\"}",
                "[]",
                "{\"status\":\"completed\"}"
        );

        Path workspace = storageRoot.resolve("workspaces").resolve("ai-driven-run-1");
        Path secondWorkspace = storageRoot.resolve("workspaces").resolve("ai-driven-run-2");
        Assert.assertTrue(Files.isRegularFile(workspace.resolve("manifest.json")));
        Assert.assertTrue(Files.isRegularFile(workspace.resolve("input").resolve("task.json")));
        Assert.assertTrue(Files.isDirectory(workspace.resolve("input").resolve("attachments")));
        Assert.assertTrue(Files.isDirectory(workspace.resolve("artifacts")));
        Assert.assertTrue(Files.isDirectory(workspace.resolve("diagnostics")));
        Assert.assertTrue(Files.isDirectory(workspace.resolve("final")));
        Assert.assertEquals(
                "{\"status\":\"completed\"}",
                Files.readString(
                        secondWorkspace.resolve("artifacts").resolve("task-state.json"),
                        StandardCharsets.UTF_8
                )
        );

        List<AiDrivenWorkspaceService.WorkspaceStateFile> states = service.loadTaskStates();
        Assert.assertEquals(2, states.size());
        AiDrivenWorkspaceService.WorkspaceStateFile first = states.stream()
                .filter(state -> "ai-driven-run-1".equals(state.runId()))
                .findFirst()
                .orElseThrow();
        Assert.assertEquals("{\"status\":\"running\"}", first.taskStateJson());
    }

    @Test
    public void keepsTaskAttachmentAfterStagingEntryIsDeleted() throws Exception {
        Path storageRoot = temporaryFolder.newFolder("attachment-storage").toPath();
        AiDrivenWorkspaceService service = new AiDrivenWorkspaceService(storageRoot);
        long now = System.currentTimeMillis();
        byte[] content = "image-content".getBytes(StandardCharsets.UTF_8);

        service.createWorkspace(
                new AiDrivenWorkspaceService.WorkspaceManifest(
                        "ai-driven-run-2",
                        "ai-request-2",
                        "user-1",
                        "project-1",
                        "session-1",
                        now
                ),
                "{}"
        );
        service.stageAttachment("ai-attachment-1", "{\"id\":\"ai-attachment-1\"}", content);
        service.bindAttachment("ai-driven-run-2", "ai-attachment-1");
        service.deleteStagedAttachment("ai-attachment-1");

        Assert.assertTrue(service.loadStagedAttachments().isEmpty());
        AiDrivenWorkspaceService.AttachmentFile restored =
                service.loadWorkspaceAttachment("ai-driven-run-2", "ai-attachment-1");
        Assert.assertNotNull(restored);
        Assert.assertArrayEquals(content, restored.content());
    }

    @Test
    public void rejectsUnsafeWorkspaceAndAttachmentNames() throws Exception {
        AiDrivenWorkspaceService service = new AiDrivenWorkspaceService(
                temporaryFolder.newFolder("safe-storage").toPath()
        );
        long now = System.currentTimeMillis();

        Assert.assertThrows(
                AppException.class,
                () -> service.createWorkspace(
                        new AiDrivenWorkspaceService.WorkspaceManifest(
                                "../other",
                                "request-1",
                                "user-1",
                                "project-1",
                                "session-1",
                                now
                        ),
                        "{}"
                )
        );
        Assert.assertThrows(
                AppException.class,
                () -> service.stageAttachment("../other", "{}", new byte[]{1})
        );
    }

    @Test
    public void versionsPatchesAndValidatesModelArtifacts() throws Exception {
        Path storageRoot = temporaryFolder.newFolder("artifact-storage").toPath();
        AiDrivenWorkspaceService service = new AiDrivenWorkspaceService(storageRoot);
        service.createWorkspace(
                new AiDrivenWorkspaceService.WorkspaceManifest(
                        "ai-driven-run-artifact",
                        "ai-request-artifact",
                        "user-1",
                        "project-1",
                        "session-1",
                        System.currentTimeMillis()
                ),
                "{}"
        );

        AiDrivenWorkspaceService.ArtifactSnapshot created = service.createArtifact(
                "ai-driven-run-artifact",
                "result-1",
                "json",
                "{\"items\":[1],\"title\":\"old\"}"
        );
        AiDrivenWorkspaceService.ArtifactSnapshot patched = service.applyJsonPatch(
                "ai-driven-run-artifact",
                "result-1",
                created.revision(),
                List.of(
                        new AiDrivenWorkspaceService.JsonPatchOperation("add", "/items/-", 2),
                        new AiDrivenWorkspaceService.JsonPatchOperation("replace", "/title", "new")
                )
        );

        Assert.assertEquals(2L, patched.revision());
        Assert.assertEquals(
                Map.of("items", List.of(1, 2), "title", "new"),
                com.alibaba.fastjson2.JSON.parseObject(patched.content(), Map.class)
        );
        Assert.assertTrue(
                service.validateArtifact(
                        "ai-driven-run-artifact",
                        "result-1",
                        patched.revision()
                ).valid()
        );
        AiDrivenWorkspaceService.ArtifactSnapshot invalid = service.updateArtifactStatus(
                "ai-driven-run-artifact",
                "result-1",
                patched.revision(),
                "invalid"
        );
        AiDrivenWorkspaceService.ArtifactSnapshot valid = service.updateArtifactStatus(
                "ai-driven-run-artifact",
                "result-1",
                invalid.revision(),
                "valid"
        );
        AiDrivenWorkspaceService.ArtifactSnapshot accepted = service.updateArtifactStatus(
                "ai-driven-run-artifact",
                "result-1",
                valid.revision(),
                "accepted"
        );
        Assert.assertEquals(patched.revision(), accepted.revision());
        Assert.assertEquals("accepted", accepted.status());
        Assert.assertEquals(patched.content(), accepted.content());
        Assert.assertThrows(
                AppException.class,
                () -> service.replaceArtifact(
                        "ai-driven-run-artifact",
                        "result-1",
                        created.revision(),
                        "{}"
                )
        );
        Assert.assertThrows(
                AppException.class,
                () -> service.applyTextPatch(
                        "ai-driven-run-artifact",
                        "result-1",
                        patched.revision(),
                        1,
                        1,
                        patched.content(),
                        "{}"
                )
        );
        Assert.assertTrue(Files.isRegularFile(
                storageRoot.resolve("workspaces")
                        .resolve("ai-driven-run-artifact")
                        .resolve("artifacts")
                        .resolve("model")
                        .resolve("result-1")
                        .resolve("content-2.txt")
        ));
        AiDrivenWorkspaceService.ArtifactSnapshot blocked = service.saveArtifactRevision(
                "ai-driven-run-artifact",
                "result-1",
                "json",
                "",
                "blocked"
        );
        Assert.assertEquals("blocked", blocked.status());
    }

    @Test
    public void repairsInvalidJsonWithRevisionCheckedTextPatch() throws Exception {
        Path storageRoot = temporaryFolder.newFolder("text-patch-storage").toPath();
        AiDrivenWorkspaceService service = new AiDrivenWorkspaceService(storageRoot);
        service.createWorkspace(
                new AiDrivenWorkspaceService.WorkspaceManifest(
                        "ai-driven-run-text",
                        "ai-request-text",
                        "user-1",
                        "project-1",
                        "session-1",
                        System.currentTimeMillis()
                ),
                "{}"
        );
        AiDrivenWorkspaceService.ArtifactSnapshot created = service.createArtifact(
                "ai-driven-run-text",
                "result-2",
                "json",
                "{\n\"value\": 1,\n}"
        );
        Assert.assertFalse(
                service.validateArtifact(
                        "ai-driven-run-text",
                        "result-2",
                        created.revision()
                ).valid()
        );

        AiDrivenWorkspaceService.ArtifactSnapshot repaired = service.applyTextPatch(
                "ai-driven-run-text",
                "result-2",
                created.revision(),
                2,
                3,
                "\"value\": 1,\n}",
                "\"value\": 1\n}"
        );
        Assert.assertTrue(
                service.validateArtifact(
                        "ai-driven-run-text",
                        "result-2",
                        repaired.revision()
                ).valid()
        );
    }
}
