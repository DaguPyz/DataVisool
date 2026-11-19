/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {globalMessage} from "@datavisool/ui";
import {resumeAiDrivenTask} from "@/plugins/editor-ai/api/AiDrivenTaskApi.ts";
import {tx} from "@/i18n/miniI18n.ts";
import type {AiDrivenProgressTerminalStore} from "./AiDrivenProgressTerminalStore.ts";
import type {EditorCanvasService} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import type {DesignerWorkspaceIdentity} from "@datavisool/sdk/plugin/contracts/designerRuntime";
import {
    clearActiveTaskScope,
    clearPendingTaskScope,
    isActiveTaskStatus,
    persistActiveTaskScope,
    persistPendingTaskScope,
    taskErrorMessage,
    type AiDrivenTaskRunMonitor,
    type PersistedAiDrivenTaskScope,
} from "./AiDrivenTaskRunMonitor.ts";
import type {IAiDrivenTurn} from "./thread/AiDrivenThreadTypes.ts";
import type {IAiDrivenBudgetExtension} from "./types/AiDrivenTaskSubmitTypes.ts";
import AuthTools from "@/util/AuthTools.ts";
import {getCurrentAiDrivenCanvasSnapshot, getCurrentProjectId} from "./AiDrivenUtil.ts";

export interface AiDrivenResumeHost {
    running: boolean;
    mounted: boolean;
    currentRequestId: string;
    aiDrivenSessionId: string;
    taskRunMonitor: Pick<AiDrivenTaskRunMonitor, "stop" | "watch"> & Partial<Pick<AiDrivenTaskRunMonitor, "restore">>;
    startRunningTask: (requestId: string, projectId: string, threadId: string, turnId?: string, runId?: string) => void;
    acceptRunningTask: (requestId: string, threadId: string, turnId: string, runId: string) => void;
    finishRunningTask: (requestId: string) => void;
    resumeGeneration: number;
}

/** 从历史面板显式恢复应用重启中断的任务。 */
export const resumeInterruptedTask = async (
    host: AiDrivenResumeHost,
    projectId: string | null,
    turn: IAiDrivenTurn,
    budgetExtension: IAiDrivenBudgetExtension | undefined,
    canvas: EditorCanvasService,
    terminal: AiDrivenProgressTerminalStore,
) => {
    if (host.running) {
        globalMessage.messageApi?.warning(tx("请先等待当前任务结束"));
        return;
    }
    if (!projectId || turn.projectId !== projectId || turn.recoverable === false
        || (turn.status !== "interrupted" && turn.status !== "budgetExhausted"))
        return;
    if (turn.status === "budgetExhausted" && !budgetExtension) {
        globalMessage.messageApi?.warning(tx("请先明确增加至少一项预算后继续"));
        return;
    }

    const currentSnapshot = getCurrentAiDrivenCanvasSnapshot(canvas);
    const currentWorkspace = canvas.readAiWorkspace()?.scope;
    const storedSnapshot = asRecord(turn.request.canvasSnapshot);
    const expectedWorkspace = normalizeWorkspaceIdentity(asRecord(storedSnapshot?.workspaceScope));
    if (!currentSnapshot || !currentWorkspace || !expectedWorkspace
        || !sameWorkspace(currentWorkspace, expectedWorkspace)
        || getCurrentProjectId(canvas) !== projectId) {
        terminal.appendLog({level: "warning", message: tx("此历史任务缺少可验证的工作空间身份，不能在当前画布继续")});
        return;
    }
    const canvasSnapshot = {
        ...currentSnapshot,
        ...(typeof storedSnapshot?.width === "number" ? {width: storedSnapshot.width} : {}),
        ...(typeof storedSnapshot?.height === "number" ? {height: storedSnapshot.height} : {}),
        ...(typeof storedSnapshot?.managerId === "string" ? {managerId: storedSnapshot.managerId} : {}),
        workspaceScope: expectedWorkspace,
    };
    const userId = AuthTools.getUserId();
    const sessionId = host.aiDrivenSessionId;
    const version = ++host.resumeGeneration;
    const isCurrent = () => host.resumeGeneration === version && host.currentRequestId === turn.requestId
        && host.aiDrivenSessionId === sessionId && AuthTools.getUserId() === userId
        && getCurrentProjectId(canvas) === projectId;
    const pendingScope = {requestId: turn.requestId, projectId, threadId: turn.threadId, workspaceScope: expectedWorkspace};
    host.taskRunMonitor.stop();
    clearActiveTaskScope(projectId);
    persistPendingTaskScope(pendingScope);
    host.startRunningTask(turn.requestId, projectId, turn.threadId, turn.turnId);
    terminal.appendLog({
        level: "info",
        message: turn.status === "budgetExhausted" ? tx("正在使用新增预算继续任务") : tx("正在恢复中断任务"),
    });
    try {
        const result = await resumeAiDrivenTask({
            projectId,
            threadId: turn.threadId,
            turnId: turn.turnId,
            sessionId,
            canvasSnapshot,
            previousRunId: turn.latestRun?.runId,
            ...(turn.checkpointVersion === undefined ? {} : {expectedCheckpointVersion: turn.checkpointVersion}),
            ...(budgetExtension === undefined ? {} : {budgetExtension}),
        });
        if (!isCurrent())
            return;
        clearPendingTaskScope(projectId);
        if (!result) {
            globalMessage.messageApi?.error(tx("任务恢复失败"));
            host.finishRunningTask(turn.requestId);
            return;
        }
        if (result.projectId !== projectId || result.threadId !== turn.threadId || result.turnId !== turn.turnId
            || result.requestId !== turn.requestId) {
            terminal.finishRun("failed", tx("任务作用域校验失败"));
            host.finishRunningTask(turn.requestId);
            return;
        }
        terminal.setRuntimeSnapshot(result.runtime);
        if (isActiveTaskStatus(result.status)) {
            const scope: PersistedAiDrivenTaskScope = {
                ...pendingScope,
                turnId: result.turnId,
                runId: result.runId,
                eventCursor: result.eventCursor,
                status: result.status,
            };
            persistActiveTaskScope(scope);
            host.acceptRunningTask(turn.requestId, result.threadId, result.turnId, result.runId);
            if (host.mounted)
                host.taskRunMonitor.watch(scope);
            return;
        }
        const message = taskErrorMessage(result);
        if (result.status === "budgetExhausted") {
            terminal.appendLog({level: "warning", message: tx("预算仍已用尽，请增加新的累计上限")});
            terminal.finishRun("budgetExhausted", message === "提交失败"
                ? tx("预算已用尽，可增加预算后继续")
                : message);
        } else {
            globalMessage.messageApi?.error(message);
            terminal.finishRun("failed", message);
        }
        host.finishRunningTask(turn.requestId);
    } catch (error) {
        console.error("AI driven task resume failed:", error);
        if (!isCurrent()) return;
        const hasServerRejection = error !== null && typeof error === "object" && "code" in error;
        if (hasServerRejection) clearPendingTaskScope(projectId);
        const message = error instanceof Error ? error.message : tx("任务恢复失败");
        terminal.finishRun("failed", message);
        host.finishRunningTask(turn.requestId);
        // 网络响应丢失时，服务端可能已接受恢复；保留 pending 并查询真实运行，避免重复发起。
        if (!hasServerRejection && host.mounted) await host.taskRunMonitor.restore?.(projectId);
    }
};

function sameWorkspace(left: DesignerWorkspaceIdentity, right: DesignerWorkspaceIdentity): boolean {
    return left.rootId === right.rootId && left.activeId === right.activeId && left.nested === right.nested
        && JSON.stringify(left.loopPath ?? []) === JSON.stringify(right.loopPath ?? []);
}

function normalizeWorkspaceIdentity(value: Record<string, any> | null): DesignerWorkspaceIdentity | undefined {
    if (!value || typeof value.rootId !== "string" || typeof value.activeId !== "string" || typeof value.nested !== "boolean") return;
    if (value.loopPath != null && (!Array.isArray(value.loopPath) || value.loopPath.some((id: unknown) => typeof id !== "string"))) return;
    return {rootId: value.rootId, activeId: value.activeId, nested: value.nested, loopPath: value.loopPath ?? []};
}

function asRecord(value: unknown): Record<string, any> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}
