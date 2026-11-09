/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import type {
    IAiDrivenThread,
    IAiDrivenThreadArchivePayload,
    IAiDrivenThreadCreatePayload,
    IAiDrivenThreadEventsPayload,
    IAiDrivenThreadEventsResult,
    IAiDrivenThreadListPayload,
    IAiDrivenThreadListResult,
    IAiDrivenThreadReadPayload,
    IAiDrivenThreadSummary,
    IAiDrivenThreadUpdatePayload,
    IAiDrivenThreadEvent,
} from "@/designer/ai-driven/thread/AiDrivenThreadTypes.ts";

interface WebThreadResponse {
    threadId: string;
    projectId: string;
    title: string | null;
    status: string;
    currentTurnId: string | null;
    currentRunId?: string | null;
    currentTurnStatus?: string | null;
    createdAt?: number;
    updatedAt?: number;
}

interface WebEventResponse {
    eventId: string;
    threadId: string;
    turnId: string | null;
    runId: string | null;
    sequence: number;
    type: string;
    payload?: Record<string, unknown>;
    createdAt?: number;
    requestId?: string;
    schemaVersion?: string;
}

const toThread = (value: WebThreadResponse): IAiDrivenThread => {
    const archived = value.status === "archived";
    const updatedAt = value.updatedAt ?? value.createdAt ?? Date.now();
    return {
        threadId: value.threadId,
        projectId: value.projectId,
        title: value.title,
        titleSource: "auto",
        preview: null,
        status: archived ? "archived" : "active",
        createRequestId: value.threadId,
        rowVersion: 1,
        lastActivityAt: updatedAt,
        createdAt: value.createdAt ?? updatedAt,
        updatedAt,
        archivedAt: archived ? updatedAt : null,
    };
};

const toSummary = (value: WebThreadResponse): IAiDrivenThreadSummary => ({
    ...toThread(value),
    runtimeStatus: normalizeRuntimeStatus(value.currentTurnStatus),
    activeTurnId: value.currentTurnId,
    currentRunId: value.currentRunId ?? null,
});

const normalizeRuntimeStatus = (value?: string | null): IAiDrivenThreadSummary["runtimeStatus"] => {
    switch (value) {
        case "queued": return "created";
        case "running": return "running";
        case "verifying": return "verifying";
        case "waiting_input":
        case "waiting_user_input": return "waitingUserInput";
        case "waiting_frontend_tool": return "waitingFrontendTool";
        case "waiting_user_confirmation": return "waitingUserConfirmation";
        default: return "idle";
    }
};

const toEvent = (event: WebEventResponse): IAiDrivenThreadEvent => {
    const rawPayload = event.payload ?? {};
    const kind = normalizeEventKind(event.type, rawPayload);
    const payload = normalizeEventPayload(kind, rawPayload, event);
    return {
        eventId: event.eventId,
        threadId: event.threadId,
        turnId: event.turnId ?? "",
        itemId: typeof payload.itemId === "string" ? payload.itemId : null,
        runId: event.runId ?? "",
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
        case "input.required":
        case "approval.required": return "turn.waiting";
        case "frontend.effect.requested":
            return isLiveReadOperation(payload.operationType)
                ? "agent.frontend_tool.prepared"
                : "agent.canvas_operation.prepared";
        case "frontend.effect.completed":
            return isLiveReadOperation(payload.operationType)
                ? payload.status === "applied" ? "agent.frontend_tool.applied" : "agent.frontend_tool.failed"
                : payload.status === "applied"
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
                payload: {...payload, toolName: typeof payload.name === "string" ? payload.name : ""},
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
        return {
            ...payload,
            operation: {
                ...(request ?? {}),
                operationId: payload.operationId,
                toolCallId: String(request?.toolCallId ?? payload.toolCallId ?? payload.operationId ?? event.eventId),
                projectId: scope?.projectId ?? "",
                kind: isCreateOperation(operationType) ? "createComponents" : "patchComponents",
                componentIds: Array.isArray(request?.componentIds)
                    ? request.componentIds
                    : patches.map((patch) => asRecord(patch)?.componentId).filter(Boolean),
                status: "prepared",
            },
        };
    }
    if (kind === "agent.canvas_operation.applied"
        || kind === "agent.canvas_operation.rejected"
        || kind === "agent.canvas_operation.failed") {
        const result = asRecord(payload.result);
        const operationType = typeof payload.operationType === "string" ? payload.operationType : "";
        if (isNonPersistentCanvasOperation(operationType, asRecord(payload.request), result))
            return payload;
        return {
            ...payload,
            operation: {
                operationId: payload.operationId,
                toolCallId: String(payload.toolCallId ?? payload.operationId ?? event.eventId),
                projectId: payload.projectId ?? "",
                kind: isCreateOperation(operationType) ? "createComponents" : "patchComponents",
                componentIds: Object.keys(asRecord(result?.componentBindings) ?? {}),
                status: kind === "agent.canvas_operation.applied"
                    ? "applied"
                    : kind === "agent.canvas_operation.rejected" ? "rejected" : "failed",
                error: kind === "agent.canvas_operation.failed" ? result : undefined,
            },
        };
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

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

export const createAiDrivenThread = async (
    payload: IAiDrivenThreadCreatePayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenThread | null> => {
    const value = await AuthFetchUtil.post<WebThreadResponse>(
        "/api/aiDriven/thread/create",
        {
            threadId: payload.clientRequestId,
            projectId: payload.projectId,
            title: "新建 AI 会话",
        },
        options,
    );
    return value ? toThread(value) : null;
};

export const listAiDrivenThreads = async (
    payload: IAiDrivenThreadListPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenThreadListResult | null> => {
    const values = await AuthFetchUtil.post<WebThreadResponse[]>(
        "/api/aiDriven/thread/list",
        {projectId: payload.projectId},
        options,
    );
    if (!values)
        return null;
    const threads = values
        .filter((value) => (value.status === "archived") === payload.archived)
        .slice(0, payload.limit ?? 30)
        .map(toSummary);
    return {data: threads, nextCursor: null};
};

export const readAiDrivenThread = async (
    payload: IAiDrivenThreadReadPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenThreadSummary | null> => {
    const value = await AuthFetchUtil.post<WebThreadResponse>(
        "/api/aiDriven/thread/read",
        {projectId: payload.projectId, threadId: payload.threadId},
        options,
    );
    return value ? toSummary(value) : null;
};

export const updateAiDrivenThread = async (
    payload: IAiDrivenThreadUpdatePayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenThread | null> => {
    const value = await AuthFetchUtil.post<WebThreadResponse>(
        "/api/aiDriven/thread/update",
        {projectId: payload.projectId, threadId: payload.threadId, title: payload.title},
        options,
    );
    return value ? toThread(value) : null;
};

export const archiveAiDrivenThread = async (
    payload: IAiDrivenThreadArchivePayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenThread | null> => {
    const value = await AuthFetchUtil.post<WebThreadResponse>(
        payload.archived ? "/api/aiDriven/thread/archive" : "/api/aiDriven/thread/update",
        payload.archived
            ? {projectId: payload.projectId, threadId: payload.threadId}
            : {projectId: payload.projectId, threadId: payload.threadId, status: "active"},
        options,
    );
    return value ? toThread(value) : null;
};

export const getAiDrivenThreadEvents = async (
    payload: IAiDrivenThreadEventsPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenThreadEventsResult | null> => {
    const values = await AuthFetchUtil.post<WebEventResponse[]>(
        "/api/aiDriven/thread/events",
        {
            projectId: payload.projectId,
            threadId: payload.threadId,
            cursor: payload.afterThreadSequence,
            limit: payload.limit,
        },
        options,
    );
    if (!values)
        return null;
    const data = values.map(toEvent);
    return {
        data,
        nextCursor: data.at(-1)?.threadSequence ?? payload.afterThreadSequence,
    };
};
