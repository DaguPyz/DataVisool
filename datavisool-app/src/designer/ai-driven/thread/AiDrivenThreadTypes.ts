/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {IAiDrivenExecutionLimitsSnapshot} from "../types/AiDrivenTaskSubmitTypes.ts";

/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 */

export type AiDrivenThreadStatus = "active" | "archived";

export type AiDrivenTurnStatus =
    | "created"
    | "running"
    | "verifying"
    | "waitingFrontendTool"
    | "waitingUserInput"
    | "waitingUserConfirmation"
    | "completed"
    | "cancelled"
    | "failed"
    | "interrupted"
    | "budgetExhausted";

export type AiDrivenThreadRuntimeStatus =
    | "idle"
    | "created"
    | "running"
    | "verifying"
    | "waitingFrontendTool"
    | "waitingUserInput"
    | "waitingUserConfirmation";

export type AiDrivenItemStatus =
    | "created"
    | "inProgress"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled"
    | "declined";

export type AiDrivenKnownItemType =
    | "userMessage"
    | "agentMessage"
    | "plan"
    | "toolCall"
    | "canvasOperation"
    | "userInput"
    | "artifactChange"
    | "preview"
    | "approval"
    | "error";

export interface IAiDrivenPageResult<T, TCursor> {
    data: T[];
    nextCursor: TCursor | null;
}

export interface IAiDrivenThread {
    threadId: string;
    projectId: string;
    title: string | null;
    titleSource: "auto" | "user";
    preview: string | null;
    status: AiDrivenThreadStatus;
    createRequestId: string;
    rowVersion: number;
    lastActivityAt: number;
    createdAt: number;
    updatedAt: number;
    archivedAt: number | null;
}

export interface IAiDrivenThreadSummary extends IAiDrivenThread {
    runtimeStatus: AiDrivenThreadRuntimeStatus;
    activeTurnId: string | null;
    currentRunId: string | null;
}

export interface IAiDrivenThreadCursor {
    lastActivityAt: number;
    threadId: string;
}

export interface IAiDrivenThreadCreatePayload {
    projectId: string;
    clientRequestId: string;
}

export interface IAiDrivenThreadListPayload {
    projectId: string;
    archived: boolean;
    cursor?: IAiDrivenThreadCursor | null;
    limit?: number;
}

export interface IAiDrivenThreadReadPayload {
    projectId: string;
    threadId: string;
}

export interface IAiDrivenThreadUpdatePayload extends IAiDrivenThreadReadPayload {
    title: string;
    expectedVersion: number;
}

export interface IAiDrivenThreadArchivePayload extends IAiDrivenThreadReadPayload {
    archived: boolean;
    expectedVersion: number;
}

export interface IAiDrivenTurn {
    turnId: string;
    projectId: string;
    threadId: string;
    turnSequence: number;
    requestId: string;
    status: AiDrivenTurnStatus;
    request: Record<string, unknown>;
    inputSummary: string;
    modelConfigId: string;
    runtimeModelId: string;
    provider: string | null;
    entryDigest: string;
    limits?: IAiDrivenExecutionLimitsSnapshot;
    latestRun?: {runId?: string; limits?: IAiDrivenExecutionLimitsSnapshot};
    checkpointVersion?: number;
    recoverable?: boolean;
    usage: Record<string, unknown> | null;
    lastArtifactId: string | null;
    lastArtifactRevision: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    rowVersion: number;
    createdAt: number;
    startedAt: number | null;
    updatedAt: number;
    endedAt: number | null;
}

export interface IAiDrivenTurnListPayload extends IAiDrivenThreadReadPayload {
    cursor?: number | null;
    limit?: number;
}

export interface IAiDrivenTurnReadPayload extends IAiDrivenThreadReadPayload {
    turnId: string;
}

export interface IAiDrivenItem {
    itemId: string;
    turnId: string;
    itemSequence: number;
    sourceRunId: string | null;
    logicalKey: string | null;
    itemType: string;
    status: AiDrivenItemStatus;
    schemaVersion: number;
    payload: Record<string, unknown>;
    lastEventSequence: number;
    rowVersion: number;
    createdAt: number;
    updatedAt: number;
    completedAt: number | null;
}

export interface IAiDrivenItemListPayload extends IAiDrivenTurnReadPayload {
    cursor?: number | null;
    limit?: number;
}

export interface IAiDrivenItemReadPayload extends IAiDrivenTurnReadPayload {
    itemId: string;
}

export interface IAiDrivenThreadEvent {
    eventId: string;
    threadId: string;
    turnId: string;
    itemId: string | null;
    runId: string;
    sequence: number;
    threadSequence: number;
    kind: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    schemaVersion: number;
    createdAt: number;
}

export interface IAiDrivenThreadEventsPayload extends IAiDrivenThreadReadPayload {
    afterThreadSequence: number;
    limit?: number;
}

export type IAiDrivenThreadListResult = IAiDrivenPageResult<IAiDrivenThreadSummary, IAiDrivenThreadCursor>;
export type IAiDrivenTurnListResult = IAiDrivenPageResult<IAiDrivenTurn, number>;
export type IAiDrivenItemListResult = IAiDrivenPageResult<IAiDrivenItem, number>;
export type IAiDrivenThreadEventsResult = IAiDrivenPageResult<IAiDrivenThreadEvent, number>;

export interface IAiDrivenExecutionScope {
    projectId: string;
    threadId: string;
    turnId: string;
    runId: string;
}
