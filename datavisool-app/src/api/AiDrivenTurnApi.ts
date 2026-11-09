/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import type {IAiDrivenExecutionLimitsSnapshot} from "@/designer/ai-driven/types/AiDrivenTaskSubmitTypes.ts";
import type {
    IAiDrivenTurn,
    IAiDrivenTurnListPayload,
    IAiDrivenTurnListResult,
    IAiDrivenTurnReadPayload,
    AiDrivenTurnStatus,
} from "@/designer/ai-driven/thread/AiDrivenThreadTypes.ts";

interface WebTurnResponse {
    turnId: string;
    threadId: string;
    projectId?: string;
    requestId?: string;
    inputText: string;
    status: string;
    steerVersion?: number;
    createdAt?: number;
    startedAt?: number;
    endedAt?: number;
    modelConfigId?: string;
    runtimeModelId?: string;
    provider?: string | null;
    usage?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    runId?: string;
    limits?: IAiDrivenExecutionLimitsSnapshot;
    checkpointVersion?: number;
    recoverable?: boolean;
}

const normalizeStatus = (value: string): AiDrivenTurnStatus => {
    switch (value) {
        case "running": return "running";
        case "verifying": return "verifying";
        case "waiting_input": return "waitingUserInput";
        case "waiting_user_input": return "waitingUserInput";
        case "waiting_frontend_tool":
        case "waitingFrontendTool": return "waitingFrontendTool";
        case "waiting_user_confirmation":
        case "waitingUserConfirmation": return "waitingUserConfirmation";
        case "completed": return "completed";
        case "cancelled": return "cancelled";
        case "failed": return "failed";
        case "interrupted": return "interrupted";
        case "budget_exhausted":
        case "budgetExhausted": return "budgetExhausted";
        default: return "created";
    }
};

const toTurn = (value: WebTurnResponse, projectId: string): IAiDrivenTurn => {
    const updatedAt = value.endedAt ?? value.startedAt ?? value.createdAt ?? Date.now();
    return {
        turnId: value.turnId,
        projectId,
        threadId: value.threadId,
        turnSequence: 0,
        requestId: value.requestId ?? "",
        status: normalizeStatus(value.status),
        request: {inputText: value.inputText},
        inputSummary: value.inputText,
        modelConfigId: value.modelConfigId ?? "",
        runtimeModelId: value.runtimeModelId ?? "",
        provider: value.provider ?? null,
        entryDigest: "",
        usage: value.usage ?? null,
        limits: value.limits,
        latestRun: {runId: value.runId, limits: value.limits},
        checkpointVersion: value.checkpointVersion,
        recoverable: value.recoverable,
        lastArtifactId: null,
        lastArtifactRevision: null,
        errorCode: value.errorCode ?? (value.status === "failed" ? "agent_runtime_failed" : null),
        errorMessage: value.errorMessage ?? (value.status === "failed" ? "Agent 运行失败" : null),
        rowVersion: value.steerVersion ?? 1,
        createdAt: value.createdAt ?? updatedAt,
        startedAt: value.startedAt ?? null,
        updatedAt,
        endedAt: value.endedAt ?? null,
    };
};

export const listAiDrivenTurns = async (
    payload: IAiDrivenTurnListPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTurnListResult | null> => {
    const values = await AuthFetchUtil.post<WebTurnResponse[]>(
        "/api/aiDriven/turn/list",
        {projectId: payload.projectId, threadId: payload.threadId},
        options,
    );
    if (!values)
        return null;
    return {
        data: values.map((value) => toTurn(value, payload.projectId)),
        nextCursor: null,
    };
};

export const readAiDrivenTurn = async (
    payload: IAiDrivenTurnReadPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenTurn | null> => {
    const value = await AuthFetchUtil.post<WebTurnResponse>(
        "/api/aiDriven/turn/read",
        {projectId: payload.projectId, turnId: payload.turnId},
        options,
    );
    return value ? toTurn(value, payload.projectId) : null;
};
