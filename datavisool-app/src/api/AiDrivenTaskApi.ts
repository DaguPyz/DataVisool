/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import type {
    IAiDrivenTaskCancelPayload,
    IAiDrivenTaskCancelResult,
    IAiDrivenTaskEventsPayload,
    IAiDrivenTaskEventsResult,
    IAiDrivenTaskEvent,
    IAiDrivenTaskStatusPayload,
    IAiDrivenTaskSteerPayload,
    IAiDrivenTaskSteerResult,
    IAiDrivenTaskSubmitPayload,
    IAiDrivenTaskSubmitResult,
    IAiDrivenTaskResumePayload,
    IAiDrivenExecutionLimitsSnapshot,
    IAiDrivenTokenUsage,
    IAiDrivenCanvasOperationReceipt,
    AiDrivenTaskSubmitStatus,
} from "@/designer/ai-driven/types/AiDrivenTaskSubmitTypes.ts";

interface WebTaskResponse {
    threadId: string;
    turnId: string;
    runId: string;
    turnStatus: string;
    runStatus: string;
    createdAt?: number;
    startedAt?: number;
    endedAt?: number;
    schemaVersion?: string;
    requestId?: string;
    projectId?: string;
    clientSessionId?: string;
    eventCursor?: number;
    limits?: IAiDrivenExecutionLimitsSnapshot;
    usage?: IAiDrivenTokenUsage;
    checkpointVersion?: number;
    recoverable?: boolean;
    operations?: IAiDrivenCanvasOperationReceipt[];
}

interface WebEventResponse {
    eventId: string;
    threadId: string;
    turnId: string;
    runId: string;
    sequence: number;
    type: string;
    payload?: Record<string, unknown>;
    createdAt?: number;
    requestId?: string;
    schemaVersion?: string;
}

const toTaskResult = (
    view: WebTaskResponse,
    scope: {projectId: string; requestId?: string; sessionId?: string},
): IAiDrivenTaskSubmitResult => {
    const status = normalizeTaskStatus(view.turnStatus || view.runStatus);
    return {
        taskId: view.turnId,
        runId: view.runId,
        threadId: view.threadId,
        turnId: view.turnId,
        eventCursor: view.eventCursor ?? 0,
        requestId: view.requestId ?? scope.requestId ?? "",
        projectId: view.projectId ?? scope.projectId,
        clientSessionId: view.clientSessionId ?? scope.sessionId ?? "",
        status,
        limits: view.limits,
        checkpointVersion: view.checkpointVersion,
        recoverable: view.recoverable,
        runtime: view.usage ? {usage: view.usage, operations: view.operations ?? []} : undefined,
        createdAt: view.createdAt ?? Date.now(),
        diagnostics: status === "failed"
            ? {
                error: {code: "agent_runtime_failed", message: "Agent 运行失败"},
                eventsRecorded: 0,
            }
            : undefined,
    };
};

const normalizeTaskStatus = (value: string): AiDrivenTaskSubmitStatus => {
    switch (value) {
        case "created": return "created";
        case "queued": return "queued";
        case "running": return "running";
        case "waiting_input":
        case "waiting_frontend_tool":
        case "waitingFrontendTool": return "waitingFrontendTool";
        case "waiting_user_input":
        case "waitingUserInput": return "waitingUserInput";
        case "waiting_user_confirmation":
        case "waitingUserConfirmation": return "waitingUserConfirmation";
        case "verifying": return "verifying";
        case "completed": return "completed";
        case "cancelled": return "cancelled";
        case "interrupted": return "interrupted";
        case "budget_exhausted":
        case "budgetExhausted": return "budgetExhausted";
        default: return "failed";
    }
};

const toTaskEvent = (event: WebEventResponse, projectId: string): IAiDrivenTaskEvent => {
    const rawPayload = event.payload ?? {};
    const kind = normalizeEventKind(event.type, rawPayload);
    const payload = normalizeEventPayload(kind, rawPayload, event);
    return {
        eventId: event.eventId,
        threadId: event.threadId,
        turnId: event.turnId,
        itemId: typeof payload.itemId === "string" ? payload.itemId : null,
        runId: event.runId,
        requestId: event.requestId ?? "",
        projectId,
        sequence: event.sequence,
        threadSequence: event.sequence,
        kind,
        payload,
        dedupeKey: event.eventId,
        schemaVersion: event.schemaVersion === "ai-driven-task/v3" ? 3 : 1,
        createdAt: event.createdAt ?? Date.now(),
    };
};

const normalizeEventKind = (type: string, payload: Record<string, unknown> = {}): string => {
    switch (type) {
        case "run.completed": return "turn.completed";
        case "run.failed": return "turn.failed";
        case "run.cancelled": return "turn.cancelled";
        case "run.interrupted": return "turn.interrupted";
        case "run.budget_exhausted": return "turn.budgetExhausted";
        case "input.required":
        case "approval.required": return "turn.waiting";
        case "frontend.effect.requested":
            return isLiveReadOperation(payload.operationType)
                ? "agent.frontend_tool.prepared"
                : "agent.canvas_operation.prepared";
        case "frontend.effect.completed":
            if (isLiveReadOperation(payload.operationType)) {
                return payload.status === "applied"
                    ? "agent.frontend_tool.applied"
                    : "agent.frontend_tool.failed";
            }
            return payload.status === "applied"
                ? "agent.canvas_operation.applied"
                : payload.status === "rejected"
                    ? "agent.canvas_operation.rejected"
                    : "agent.canvas_operation.failed";
        case "assistant.message.delta": return "item.delta";
        case "assistant.message.completed": return "item.completed";
        case "plan.updated": return "item.completed";
        case "tool.requested": return "item.started";
        case "tool.completed": return "item.completed";
        default: return type;
    }
};

const normalizeEventPayload = (
    kind: string,
    payload: Record<string, unknown>,
    event: WebEventResponse,
): Record<string, unknown> => {
    if (kind === "turn.waiting") {
        return {
            ...payload,
            status: event.type === "approval.required"
                ? (payload.status === "waitingUserConfirmation" ? "waitingUserConfirmation" : "waitingFrontendTool")
                : "waitingUserInput",
        };
    }
    if (kind === "item.delta") {
        return {
            itemId: typeof payload.itemId === "string" ? payload.itemId : event.turnId + ":assistant",
            itemType: "agentMessage",
            delta: typeof payload.text === "string" ? payload.text : "",
        };
    }
    if (event.type === "assistant.message.completed") {
        return {
            ...payload,
            item: {
                itemId: String(payload.itemId ?? (event.turnId + ":assistant:" + event.sequence)),
                itemType: "agentMessage",
                status: "completed",
                payload: {text: typeof payload.text === "string" ? payload.text : ""},
            },
        };
    }
    if (event.type === "plan.updated") {
        return {
            ...payload,
            item: {
                itemId: String(payload.itemId ?? (event.turnId + ":plan:" + event.sequence)),
                itemType: "plan",
                status: "completed",
                payload,
            },
        };
    }
    if (kind === "item.started" || kind === "item.completed") {
        return {
            ...payload,
            item: {
                itemId: String(payload.requestId ?? (event.turnId + ":" + event.sequence)),
                itemType: "toolCall",
                status: toolItemStatus(kind, payload.status),
                payload: {...payload, toolName: typeof payload.name === "string" ? payload.name : "",
                    text: typeof payload.result === "string" ? payload.result : ""},
            },
        };
    }
    if (kind === "agent.canvas_operation.prepared") {
        const request = asRecord(payload.request);
        const operationType = typeof payload.operationType === "string" ? payload.operationType : "";
        if (isNonPersistentCanvasOperation(operationType, request))
            return payload;
        const scope = asRecord(request?.agentScope);
        const patches = Array.isArray(request?.patches) ? request.patches : [];
        const componentIds = Array.isArray(request?.componentIds)
            ? request.componentIds
            : patches.map((patch) => asRecord(patch)?.componentId).filter(Boolean);
        const operation = {
            ...(request ?? {}),
            operationId: payload.operationId,
            toolCallId: String(request?.toolCallId ?? payload.toolCallId ?? payload.operationId ?? event.eventId),
            projectId: payload.projectId ?? scope?.projectId ?? "",
            kind: isCreateOperation(operationType) ? "createComponents" : "patchComponents",
            componentIds,
            status: "prepared",
        };
        return {...payload, operation};
    }
    if (kind === "agent.canvas_operation.applied"
        || kind === "agent.canvas_operation.rejected"
        || kind === "agent.canvas_operation.failed") {
        const result = asRecord(payload.result);
        const operationType = typeof payload.operationType === "string" ? payload.operationType : "";
        if (isNonPersistentCanvasOperation(operationType, asRecord(payload.request), result))
            return payload;
        const operation = {
            operationId: payload.operationId,
            toolCallId: String(payload.toolCallId ?? payload.operationId ?? event.eventId),
            projectId: payload.projectId ?? "",
            kind: isCreateOperation(operationType) ? "createComponents" : "patchComponents",
            componentIds: Object.keys(asRecord(result?.componentBindings) ?? {}),
            status: kind === "agent.canvas_operation.applied"
                ? "applied"
                : kind === "agent.canvas_operation.rejected" ? "rejected" : "failed",
            error: kind === "agent.canvas_operation.failed" ? result : undefined,
        };
        return {...payload, operation};
    }
    return payload;
};

const toolItemStatus = (kind: string, status: unknown) => {
    if (kind === "item.started")
        return "inProgress";
    if (status === "failed" || status === "rejected")
        return "failed";
    if (status === "pending" || status === "waiting" || status === "deferred")
        return "waiting";
    return "completed";
};

const isLiveReadOperation = (operationType: unknown): boolean => [
    "inspect_current_page",
    "get_component_catalog",
    "get_component_snapshots",
    "get_component_data_contract",
    "get_current_canvas_selection",
    "get_project_snapshot",
    "get_current_canvas_revision",
    "get_canvas_operation_status",
    "get_component_document",
    "search_component_documents",
    "search_available_components",
].includes(String(operationType ?? ""));

const isCreateOperation = (operationType: unknown): boolean =>
    operationType === "create_canvas_components" || operationType === "render_draft";

const isNonPersistentCanvasOperation = (
    operationType: string,
    request: Record<string, unknown> | null,
    result?: Record<string, unknown> | null,
): boolean => operationType === "discard_canvas_draft"
    || operationType === "render_draft" && (
        request?.action === "clear"
        || request?.interactive === false
        || result?.status === "draft-rendered"
        || result?.status === "draft-cleared"
    );

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

export const submitAiDrivenTask = async (
    payload: IAiDrivenTaskSubmitPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTaskSubmitResult | null> => {
    const view = await AuthFetchUtil.post<WebTaskResponse>(
        "/api/aiDriven/task/submit",
        {
            schemaVersion: payload.schemaVersion,
            requestId: payload.requestId,
            sessionId: payload.sessionId,
            projectId: payload.projectId,
            threadId: payload.threadId,
            requirement: payload.requirement,
            model: payload.model,
            attachments: payload.attachments,
            inputText: payload.requirement,
            modelConfigId: payload.model.modelConfigId,
            runtimeModelId: payload.model.runtimeModelId,
            provider: payload.model.provider,
            context: {
                ...(payload.clientContext ?? {}),
                requestId: payload.requestId,
                sessionId: payload.sessionId,
                schemaVersion: payload.schemaVersion,
                shortcut: payload.shortcut,
                selection: payload.selection,
                canvasSnapshot: payload.canvasSnapshot,
                attachments: payload.attachments,
            },
        },
        options,
    );
    return view
        ? toTaskResult(view, {
            projectId: payload.projectId,
            requestId: payload.requestId,
            sessionId: payload.sessionId,
        })
        : null;
};

export const resumeAiDrivenTask = async (
    payload: IAiDrivenTaskResumePayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTaskSubmitResult | null> => {
    const view = await AuthFetchUtil.postOrThrow<WebTaskResponse>("/api/aiDriven/task/resume", payload, options);
    return view ? toTaskResult(view, {projectId: payload.projectId, sessionId: payload.sessionId}) : null;
};

export const cancelAiDrivenTask = async (
    payload: IAiDrivenTaskCancelPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTaskCancelResult | null> => {
    const view = await AuthFetchUtil.post<WebTaskResponse>(
        "/api/aiDriven/task/cancel",
        {
            projectId: payload.projectId,
            threadId: payload.threadId,
            turnId: payload.turnId,
            runId: payload.runId,
        },
        options,
    );
    return view ? toTaskResult(view, {projectId: payload.projectId}) : null;
};

export const getAiDrivenTaskStatus = async (
    payload: IAiDrivenTaskStatusPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTaskSubmitResult | null> => {
    const view = await AuthFetchUtil.post<WebTaskResponse>(
        "/api/aiDriven/task/status",
        {
            projectId: payload.projectId,
            threadId: payload.threadId,
            turnId: payload.turnId,
            runId: payload.runId,
        },
        options,
    );
    return view ? toTaskResult(view, {projectId: payload.projectId}) : null;
};

export const steerAiDrivenTask = async (
    payload: IAiDrivenTaskSteerPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTaskSteerResult | null> => {
    const view = await AuthFetchUtil.post<WebTaskResponse>(
        "/api/aiDriven/task/steer",
        {
            projectId: payload.projectId,
            threadId: payload.threadId,
            turnId: payload.expectedTurnId,
            expectedTurnId: payload.expectedTurnId,
            runId: payload.runId,
            inputId: payload.inputId,
            input: payload.input,
            inputText: payload.input,
        },
        options,
    );
    return view
        ? {threadId: view.threadId, turnId: view.turnId, acceptedInputId: payload.inputId}
        : null;
};

export const getAiDrivenTaskEvents = async (
    payload: IAiDrivenTaskEventsPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTaskEventsResult | null> => {
    const events = await AuthFetchUtil.post<WebEventResponse[]>(
        "/api/aiDriven/task/events",
        {
            projectId: payload.projectId,
            threadId: payload.threadId,
            turnId: payload.turnId,
            runId: payload.runId,
            cursor: payload.afterSequence,
            limit: payload.limit,
        },
        options,
    );
    if (!events)
        return null;
    const mapped = events.map((event) => toTaskEvent(event, payload.projectId));
    return {
        events: mapped,
        nextCursor: mapped.at(-1)?.sequence ?? payload.afterSequence,
    };
};

export const completeAiDrivenFrontendOperation = async (
    payload: {
        operationId: string;
        status: "applied" | "rejected" | "failed" | "cancelled" | "conflict";
        resultRevision?: number | string;
        result?: Record<string, unknown>;
        projectId?: string;
        threadId?: string;
        turnId?: string;
        runId?: string;
    },
    options?: AuthRequestInit,
) => await AuthFetchUtil.post<unknown>(
    "/api/aiDriven/task/operation/complete",
    payload,
    options,
);
