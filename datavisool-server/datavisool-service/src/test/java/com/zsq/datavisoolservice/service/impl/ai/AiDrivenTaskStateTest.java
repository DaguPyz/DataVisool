/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.alibaba.fastjson2.JSON;
import com.zsq.datavisoolservice.global.AppException;
import org.junit.Assert;
import org.junit.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class AiDrivenTaskStateTest {

    @Test
    public void cancelStopsActiveModelCallsAndProducesFinalSnapshot() {
        long now = System.currentTimeMillis();
        AiDrivenTaskService.TaskState state = new AiDrivenTaskService.TaskState(
                "task-1",
                "run-1",
                "request-1",
                "session-1",
                "project-1",
                "user-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of("attachment-1"),
                List.of(),
                new AiDrivenTaskService.ShortcutContext(
                        "style",
                        "styleOptimization",
                        "/style 调整颜色"
                ),
                Map.of("width", 1920, "height", 1080),
                Map.of("mode", "none", "targetIds", List.of(), "components", List.of()),
                Map.of(),
                "fingerprint-1",
                now
        );
        CompletableFuture<String> modelCall = new CompletableFuture<>();
        state.claimWorker("worker-1", now, 30_000);
        state.registerModelCall(modelCall, "worker-1", now + 1);

        state.cancel("用户取消");

        AiDrivenTaskService.TaskSnapshot snapshot = state.snapshot();
        Assert.assertTrue(modelCall.isCancelled());
        Assert.assertEquals("cancelled", snapshot.status());
        Assert.assertEquals("用户取消", snapshot.finalSnapshot().get("message"));
        Assert.assertEquals("cancelled", snapshot.progress().get(snapshot.progress().size() - 1).phase());
        Assert.assertEquals(
                "style",
                ((AiDrivenTaskService.ShortcutContext) snapshot.workflowState().get("shortcut")).command()
        );
        Assert.assertEquals(
                1920,
                ((Map<?, ?>) snapshot.workflowState().get("canvasSnapshot")).get("width")
        );
    }

    @Test
    public void runningTaskExpiresWithoutHeartbeat() {
        long now = System.currentTimeMillis();
        AiDrivenTaskService.TaskState state = new AiDrivenTaskService.TaskState(
                "task-1",
                "run-1",
                "request-1",
                "session-1",
                "project-1",
                "user-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of(),
                List.of(),
                null,
                Map.of("width", 1920, "height", 1080),
                Map.of("mode", "none", "targetIds", List.of(), "components", List.of()),
                Map.of(),
                "fingerprint-1",
                now
        );

        Assert.assertFalse(state.isHeartbeatExpired(now + 44_000));
        Assert.assertTrue(state.isHeartbeatExpired(now + 46_000));
    }

    @Test
    public void workerLeaseCanBeReclaimedAndKeepsCheckpointsForResume() {
        long now = System.currentTimeMillis();
        AiDrivenTaskService.TaskState state = new AiDrivenTaskService.TaskState(
                "task-1",
                "run-1",
                "request-1",
                "session-1",
                "project-1",
                "user-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of(),
                List.of(),
                null,
                Map.of("width", 1920, "height", 1080),
                Map.of("mode", "none", "targetIds", List.of(), "components", List.of()),
                Map.of("workflowKind", "reference-image"),
                "fingerprint-1",
                now
        );

        state.claimWorker("worker-1", now, 30_000);
        state.writeCheckpoint(
                "worker-1",
                "reference-partition",
                Map.of("regions", List.of(Map.of("id", "region_01"))),
                now + 1,
                30_000
        );
        state.writeCheckpoint(
                "worker-1",
                "region-draft:region_01",
                Map.of("regionId", "region_01", "draftComponents", List.of()),
                now + 2,
                30_000
        );
        state.recordDraftDecision("region_01", "accepted");
        CompletableFuture<String> staleWorkerCall = new CompletableFuture<>();
        state.registerModelCall(staleWorkerCall, "worker-1", now + 3);
        Assert.assertThrows(
                AppException.class,
                () -> state.registerModelCall(
                        new CompletableFuture<>(),
                        "worker-2",
                        now + 4
                )
        );

        Assert.assertThrows(
                AppException.class,
                () -> state.claimWorker("worker-2", now + 2, 30_000)
        );
        state.claimWorker("worker-2", now + 31_000, 30_000);
        Assert.assertThrows(
                AppException.class,
                () -> state.complete("failed", Map.of(), "worker-1", now + 31_001)
        );

        AiDrivenTaskService.TaskSnapshot snapshot = state.snapshot();
        Assert.assertTrue(staleWorkerCall.isCancelled());
        Assert.assertEquals("running", snapshot.status());
        Map<?, ?> checkpoints = (Map<?, ?>) snapshot.workflowState().get("checkpoints");
        Assert.assertTrue(checkpoints.containsKey("reference-partition"));
        Map<?, ?> workerLease = (Map<?, ?>) snapshot.workflowState().get("workerLease");
        Assert.assertEquals("worker-2", workerLease.get("workerId"));
        Map<?, ?> draftDecisions = (Map<?, ?>) snapshot.workflowState().get("draftDecisions");
        Assert.assertEquals("accepted", draftDecisions.get("region_01"));
        Assert.assertFalse(state.isHeartbeatExpired(now + 60_000));
    }

    @Test
    public void persistedTaskRestoresCheckpointAndReleasesPreviousWorkerLease() {
        long now = System.currentTimeMillis();
        AiDrivenTaskService.TaskState state = new AiDrivenTaskService.TaskState(
                "task-1",
                "run-1",
                "request-1",
                "session-1",
                "project-1",
                "user-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of("attachment-1"),
                List.of(),
                null,
                Map.of("width", 1920, "height", 1080),
                Map.of("mode", "none", "targetIds", List.of(), "components", List.of()),
                Map.of("workflowKind", "reference-image"),
                "fingerprint-1",
                now
        );
        state.claimWorker("worker-1", now, 30_000);
        state.writeCheckpoint(
                "worker-1",
                "reference-partition",
                Map.of("regions", List.of(Map.of("id", "region_01"))),
                now + 1,
                30_000
        );

        String json = JSON.toJSONString(state.persistent());
        AiDrivenTaskService.PersistentTaskState persisted = JSON.parseObject(
                json,
                AiDrivenTaskService.PersistentTaskState.class
        );
        AiDrivenTaskService.TaskState restored =
                AiDrivenTaskService.TaskState.restore(persisted);
        AiDrivenTaskService.TaskSnapshot snapshot = restored.snapshot();

        Assert.assertEquals("running", snapshot.status());
        Assert.assertEquals(
                List.of("attachment-1"),
                snapshot.workflowState().get("attachmentIds")
        );
        Map<?, ?> checkpoints = (Map<?, ?>) snapshot.workflowState().get("checkpoints");
        Assert.assertTrue(checkpoints.containsKey("reference-partition"));
        Map<?, ?> workerLease = (Map<?, ?>) snapshot.workflowState().get("workerLease");
        Assert.assertNull(workerLease.get("workerId"));
        Assert.assertEquals(0L, workerLease.get("leaseUntil"));
        Assert.assertEquals(2, workerLease.get("generation"));

        restored.claimWorker("worker-2", now + 2, 30_000);
        Assert.assertEquals(
                "worker-2",
                ((Map<?, ?>) restored.snapshot().workflowState().get("workerLease")).get("workerId")
        );
    }

    @Test
    public void requestIdCanOnlyBeReusedForTheSameRequestFingerprint() {
        long now = System.currentTimeMillis();
        AiDrivenTaskService.TaskState state = new AiDrivenTaskService.TaskState(
                "task-1",
                "run-1",
                "request-1",
                "session-1",
                "project-1",
                "user-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of(),
                List.of(),
                null,
                Map.of("width", 1920, "height", 1080),
                Map.of("mode", "none", "targetIds", List.of(), "components", List.of()),
                Map.of(),
                "fingerprint-1",
                now
        );

        state.requireRequestFingerprint("fingerprint-1");
        Assert.assertThrows(
                AppException.class,
                () -> state.requireRequestFingerprint("fingerprint-2")
        );

        String first = AiDrivenTaskService.createRequestFingerprint(
                "ai-driven-task/v1",
                "session-1",
                "project-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of(),
                List.of(),
                null,
                new java.util.LinkedHashMap<>(Map.of("width", 1920, "height", 1080)),
                Map.of("mode", "none", "targetIds", List.of(), "components", List.of()),
                Map.of("locale", "zh-CN", "timezone", "Asia/Shanghai")
        );
        String second = AiDrivenTaskService.createRequestFingerprint(
                "ai-driven-task/v1",
                "session-1",
                "project-1",
                "model-1",
                "runtime-model",
                "生成页面",
                List.of(),
                List.of(),
                null,
                Map.of("height", 1080, "width", 1920),
                Map.of("components", List.of(), "targetIds", List.of(), "mode", "none"),
                Map.of("timezone", "Asia/Shanghai", "locale", "zh-CN")
        );
        Assert.assertEquals(first, second);
    }
}
