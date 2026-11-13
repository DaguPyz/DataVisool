/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {getAiDrivenTaskStatus} from "@/api/AiDrivenTaskApi.ts";
import {readAiDrivenThread} from "@/api/AiDrivenThreadApi.ts";
import type {
    AiDrivenTaskSubmitStatus,
    IAiDrivenTaskEvent,
    IAiDrivenTaskSubmitResult,
} from "./types/AiDrivenTaskSubmitTypes.ts";
import {
    AiDrivenTaskEventStream,
    describeAiDrivenTaskEvent,
    type AiDrivenTaskEventScope,
} from "./AiDrivenTaskEventStream.ts";
import {handleAiDrivenWebEvent} from "./AiDrivenWebEffectBridge.ts";
import {aiDrivenDevError, aiDrivenDevWarn} from "./AiDrivenDevLogger.ts";

const ACTIVE_TASK_STORAGE_PREFIX = "AI_DRIVEN_ACTIVE_TASK_V1";
const PENDING_TASK_STORAGE_PREFIX = "AI_DRIVEN_PENDING_TASK_V1";
const TASK_STATUS_POLL_INITIAL_DELAY_MS = 1000;
const TASK_STATUS_POLL_MAX_DELAY_MS = 2000;
const ACTIVE_TASK_STATUSES = new Set<AiDrivenTaskSubmitStatus>([
    "created",
    "queued",
    "running",
    "verifying",
    "waitingFrontendTool",
    "waitingUserInput",
    "waitingUserConfirmation",
]);

export interface PersistedAiDrivenTaskScope {
    requestId: string;
    projectId: string;
    threadId: string;
    turnId: string;
    runId: string;
    eventCursor?: number;
    status?: AiDrivenTaskSubmitStatus;
}

/** submit 响应丢失时，用于从 Thread 活动态补齐 Turn/Run 的最小事实。 */
export interface PendingAiDrivenTaskScope {
    requestId: string;
    projectId: string;
    threadId: string;
}

interface AiDrivenTaskRunMonitorCallbacks {
    isAvailable: (scope: PersistedAiDrivenTaskScope) => boolean;
    onActive: (
        scope: PersistedAiDrivenTaskScope,
        restored: boolean,
        result?: IAiDrivenTaskSubmitResult,
    ) => void;
    onTerminal: (scope: PersistedAiDrivenTaskScope, result: IAiDrivenTaskSubmitResult) => void;
    onStopped: (scope: PersistedAiDrivenTaskScope) => void;
    onEvent: (event: IAiDrivenTaskEvent) => void;
    onProgress: (message: string, event: IAiDrivenTaskEvent) => void;
}

const eventStatus = (event: IAiDrivenTaskEvent): AiDrivenTaskSubmitStatus | null => {
    switch (event.kind) {
        case "turn.waiting":
            return typeof event.payload.status === "string"
                && ACTIVE_TASK_STATUSES.has(event.payload.status as AiDrivenTaskSubmitStatus)
                ? event.payload.status as AiDrivenTaskSubmitStatus
                : "waitingUserInput";
        case "turn.resumed":
        case "turn.started":
            return "running";
        case "turn.verifying":
            return "verifying";
        case "turn.completed":
            return "completed";
        case "turn.failed":
            return "failed";
        case "turn.cancelled":
            return "cancelled";
        case "turn.interrupted":
            return "interrupted";
        case "turn.budgetExhausted":
            return "budgetExhausted";
        default:
            return null;
    }
};

const activeTaskStorageKey = (projectId: string) => `${ACTIVE_TASK_STORAGE_PREFIX}:${projectId}`;
const pendingTaskStorageKey = (projectId: string) => `${PENDING_TASK_STORAGE_PREFIX}:${projectId}`;

export const persistActiveTaskScope = (scope: PersistedAiDrivenTaskScope) => {
    try {
        localStorage.setItem(activeTaskStorageKey(scope.projectId), JSON.stringify(scope));
    } catch (error) {
        aiDrivenDevWarn("Unable to persist task scope:", error);
    }
};

export const readActiveTaskScope = (projectId: string): PersistedAiDrivenTaskScope | null => {
    try {
        const value = localStorage.getItem(activeTaskStorageKey(projectId));
        if (!value)
            return null;
        const parsed = JSON.parse(value) as Partial<PersistedAiDrivenTaskScope>;
        if (parsed.projectId === projectId
            && parsed.requestId
            && parsed.threadId
            && parsed.turnId
            && parsed.runId)
            return parsed as PersistedAiDrivenTaskScope;
    } catch (error) {
        aiDrivenDevWarn("Invalid persisted task scope:", error);
    }
    clearActiveTaskScope(projectId);
    return null;
};

export const clearActiveTaskScope = (projectId: string) => {
    try {
        localStorage.removeItem(activeTaskStorageKey(projectId));
    } catch (error) {
        aiDrivenDevWarn("Unable to clear task scope:", error);
    }
};

export const persistPendingTaskScope = (scope: PendingAiDrivenTaskScope) => {
    try {
        localStorage.setItem(pendingTaskStorageKey(scope.projectId), JSON.stringify(scope));
    } catch (error) {
        aiDrivenDevWarn("Unable to persist pending task scope:", error);
    }
};

export const readPendingTaskScope = (projectId: string): PendingAiDrivenTaskScope | null => {
    try {
        const value = localStorage.getItem(pendingTaskStorageKey(projectId));
        if (!value)
            return null;
        const parsed = JSON.parse(value) as Partial<PendingAiDrivenTaskScope>;
        if (parsed.projectId === projectId && parsed.requestId && parsed.threadId)
            return parsed as PendingAiDrivenTaskScope;
    } catch (error) {
        aiDrivenDevWarn("Invalid pending task scope:", error);
    }
    clearPendingTaskScope(projectId);
    return null;
};

export const clearPendingTaskScope = (projectId: string) => {
    try {
        localStorage.removeItem(pendingTaskStorageKey(projectId));
    } catch (error) {
        aiDrivenDevWarn("Unable to clear pending task scope:", error);
    }
};

export const isActiveTaskStatus = (status: AiDrivenTaskSubmitStatus) => ACTIVE_TASK_STATUSES.has(status);

export const taskErrorMessage = (result: IAiDrivenTaskSubmitResult) => {
    return result.diagnostics?.error?.message ?? "提交失败";
};

/** 管理事件监听、cursor 回放和低频状态轮询兜底。 */
export class AiDrivenTaskRunMonitor {
    private version = 0;
    private restoring = false;
    private scope: PersistedAiDrivenTaskScope | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private statusController: AbortController | null = null;
    private eventStream = new AiDrivenTaskEventStream();
    private lastStatusEventCursor = 0;

    constructor(private readonly callbacks: AiDrivenTaskRunMonitorCallbacks) {}

    async restore(projectId: string): Promise<boolean> {
        if (this.restoring || this.scope)
            return Boolean(this.scope);

        let scope = readActiveTaskScope(projectId);
        if (!scope) {
            const pendingScope = readPendingTaskScope(projectId);
            if (!pendingScope)
                return false;
            scope = await this.resolvePendingScope(pendingScope);
            if (!scope)
                return false;
        }

        this.stop();
        const version = this.version;
        this.restoring = true;
        const controller = this.beginStatusRequest();
        try {
            let invalid = false;
            const result = await getAiDrivenTaskStatus(scope, {
                signal: controller.signal,
                suppressErrorMessage: (response) => {
                    invalid = response.code === 403 || response.code === 404;
                    return true;
                },
            });
            if (!this.isAttemptCurrent(scope, version))
                return false;
            if (!result) {
                if (invalid) {
                    clearActiveTaskScope(projectId);
                    clearPendingTaskScope(projectId);
                    return false;
                }
                this.activate(scope, version, false);
                return true;
            }
            if (!isTaskResultInScope(scope, result)) {
                aiDrivenDevError("Task status scope mismatch");
                clearActiveTaskScope(projectId);
                clearPendingTaskScope(projectId);
                return false;
            }
            if (isActiveTaskStatus(result.status)) {
                this.activate(scopeFromResult(scope, result), version, true, result);
                return true;
            }
            clearActiveTaskScope(projectId);
            clearPendingTaskScope(projectId);
            this.callbacks.onTerminal(scope, result);
            return true;
        } catch (error) {
            if (this.isAttemptCurrent(scope, version)) {
                aiDrivenDevError("Task status restore failed:", error);
                this.activate(scope, version, false);
                return true;
            }
            return false;
        } finally {
            this.releaseStatusRequest(controller);
            if (this.version === version)
                this.restoring = false;
        }
    }

    watch(scope: PersistedAiDrivenTaskScope) {
        this.stop();
        clearPendingTaskScope(scope.projectId);
        this.activate(scope, this.version, false);
    }

    stop() {
        this.version += 1;
        this.restoring = false;
        this.scope = null;
        this.statusController?.abort();
        this.statusController = null;
        if (this.pollTimer !== null)
            clearTimeout(this.pollTimer);
        this.pollTimer = null;
        this.eventStream.stop();
        this.lastStatusEventCursor = 0;
    }

    private activate(
        scope: PersistedAiDrivenTaskScope,
        version: number,
        restored: boolean,
        result?: IAiDrivenTaskSubmitResult,
    ) {
        if (!this.isAttemptCurrent(scope, version))
            return;
        this.scope = scope;
        persistActiveTaskScope(scope);
        this.callbacks.onActive(scope, restored, result);
        this.startEventStream(scope, version);
        this.schedulePoll(version, TASK_STATUS_POLL_INITIAL_DELAY_MS);
    }

    private startEventStream(scope: PersistedAiDrivenTaskScope, version: number) {
        const eventScope = completeEventScope(scope);
        if (!eventScope)
            return;
        void this.eventStream.start(eventScope, {
            onCursor: (sequence) => this.updateCursor(sequence, version),
            onEvent: (event) => {
                if (!this.isWatching(version))
                    return;
                void handleAiDrivenWebEvent(event);
                this.callbacks.onEvent(event);
                const message = describeAiDrivenTaskEvent(event);
                if (message)
                    this.callbacks.onProgress(message, event);
                this.applyEventStatus(event, version);
            },
            onTerminal: () => undefined,
            onError: (error) => aiDrivenDevWarn("Task event stream unavailable:", error),
        });
    }

    private schedulePoll(version: number, delayMs: number) {
        if (!this.isWatching(version)) {
            this.stopUnavailable(version);
            return;
        }
        if (this.pollTimer !== null)
            clearTimeout(this.pollTimer);
        this.pollTimer = setTimeout(() => {
            this.pollTimer = null;
            void this.poll(version, delayMs);
        }, delayMs);
    }

    private async poll(version: number, previousDelayMs: number) {
        const scope = this.scope;
        if (!scope || !this.isWatching(version)) {
            this.stopUnavailable(version);
            return;
        }
        const nextDelayMs = Math.min(previousDelayMs * 2, TASK_STATUS_POLL_MAX_DELAY_MS);
        let invalid = false;
        const controller = this.beginStatusRequest();
        try {
            const result = await getAiDrivenTaskStatus(scope, {
                signal: controller.signal,
                suppressErrorMessage: (response) => {
                    invalid = response.code === 403 || response.code === 404;
                    return true;
                },
            });
            if (!this.isWatching(version)) {
                this.stopUnavailable(version);
                return;
            }
            if (!result) {
                if (invalid) {
                    clearActiveTaskScope(scope.projectId);
                    clearPendingTaskScope(scope.projectId);
                    this.finishStopped(scope);
                    return;
                }
                this.schedulePoll(version, nextDelayMs);
                return;
            }
            if (!isTaskResultInScope(scope, result)) {
                aiDrivenDevError("Task status scope mismatch");
                clearActiveTaskScope(scope.projectId);
                clearPendingTaskScope(scope.projectId);
                this.finishStopped(scope);
                return;
            }
            if (isActiveTaskStatus(result.status)) {
                if (this.lastStatusEventCursor > (scope.eventCursor ?? 0) && this.scope?.status
                    && this.scope.status !== result.status) {
                    this.schedulePoll(version, nextDelayMs);
                    return;
                }
                const nextScope = scopeFromResult(scope, result);
                this.scope = nextScope;
                persistActiveTaskScope(nextScope);
                this.callbacks.onActive(nextScope, false, result);
                this.schedulePoll(version, nextDelayMs);
                return;
            }
            if (this.lastStatusEventCursor > (scope.eventCursor ?? 0) && this.scope?.status && isActiveTaskStatus(this.scope.status)) {
                this.schedulePoll(version, nextDelayMs);
                return;
            }
            clearActiveTaskScope(scope.projectId);
            clearPendingTaskScope(scope.projectId);
            this.stop();
            this.callbacks.onTerminal(scope, result);
        } catch (error) {
            if (this.isWatching(version)) {
                aiDrivenDevError("Task status poll failed:", error);
                this.schedulePoll(version, nextDelayMs);
            }
        } finally {
            this.releaseStatusRequest(controller);
        }
    }

    private updateCursor(sequence: number, version: number) {
        if (!this.isWatching(version) || !this.scope || sequence <= (this.scope.eventCursor ?? 0))
            return;
        this.scope = {...this.scope, eventCursor: sequence};
        persistActiveTaskScope(this.scope);
    }

    private applyEventStatus(event: IAiDrivenTaskEvent, version: number) {
        const status = eventStatus(event);
        if (!status || !this.scope || !this.isWatching(version))
            return;
        this.scope = {...this.scope, status};
        this.lastStatusEventCursor = Math.max(this.lastStatusEventCursor, event.sequence);
        persistActiveTaskScope(this.scope);
        if (isActiveTaskStatus(status)) {
            this.callbacks.onActive(this.scope, false);
            return;
        }
        // 终态事件只负责唤醒；最终快照必须再从状态接口读取，才能包含 operation journal 回执。
        this.schedulePoll(version, 0);
    }

    private stopUnavailable(version: number) {
        const scope = this.scope;
        if (this.version !== version || !scope)
            return;
        this.stop();
        this.callbacks.onStopped(scope);
    }

    private finishStopped(scope: PersistedAiDrivenTaskScope) {
        this.stop();
        this.callbacks.onStopped(scope);
    }

    private isAttemptCurrent(scope: PersistedAiDrivenTaskScope, version: number) {
        return this.version === version && this.callbacks.isAvailable(scope);
    }

    private isWatching(version: number) {
        return this.version === version && Boolean(this.scope) && this.callbacks.isAvailable(this.scope!);
    }

    private beginStatusRequest() {
        const controller = new AbortController();
        this.statusController = controller;
        return controller;
    }

    private async resolvePendingScope(
        pending: PendingAiDrivenTaskScope,
    ): Promise<PersistedAiDrivenTaskScope | null> {
        try {
            const thread = await readAiDrivenThread({
                projectId: pending.projectId,
                threadId: pending.threadId,
            }, {suppressErrorMessage: true});
            if (!thread)
                return null;
            if (thread.threadId !== pending.threadId
                || !thread.activeTurnId
                || !thread.currentRunId) {
                clearPendingTaskScope(pending.projectId);
                return null;
            }
            const scope: PersistedAiDrivenTaskScope = {
                ...pending,
                turnId: thread.activeTurnId,
                runId: thread.currentRunId,
                eventCursor: 0,
            };
            persistActiveTaskScope(scope);
            clearPendingTaskScope(pending.projectId);
            return scope;
        } catch (error) {
            aiDrivenDevWarn("Pending task recovery failed:", error);
            return null;
        }
    }

    private releaseStatusRequest(controller: AbortController) {
        if (this.statusController === controller)
            this.statusController = null;
    }
}

const scopeFromResult = (scope: PersistedAiDrivenTaskScope, result: IAiDrivenTaskSubmitResult): PersistedAiDrivenTaskScope => ({
    ...scope,
    threadId: result.threadId,
    turnId: result.turnId,
    runId: result.runId,
    eventCursor: Math.max(scope.eventCursor ?? 0, result.eventCursor ?? 0),
    status: result.status,
});

const completeEventScope = (scope: PersistedAiDrivenTaskScope): AiDrivenTaskEventScope | null => {
    return {
        projectId: scope.projectId,
        threadId: scope.threadId,
        turnId: scope.turnId,
        runId: scope.runId,
        eventCursor: scope.eventCursor ?? 0,
    };
};

const isTaskResultInScope = (scope: PersistedAiDrivenTaskScope, result: IAiDrivenTaskSubmitResult) => {
    // Java Agent 的旧 TaskView 没有 requestId；其余不可变作用域仍必须严格匹配。
    return (!result.requestId || result.requestId === scope.requestId)
        && result.projectId === scope.projectId
        && result.threadId === scope.threadId
        && result.turnId === scope.turnId
        && result.runId === scope.runId;
};
