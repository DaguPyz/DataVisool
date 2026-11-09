/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AuthFetchUtil, {type AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import type {
    IAiDrivenItem,
    IAiDrivenItemListPayload,
    IAiDrivenItemListResult,
    IAiDrivenItemReadPayload,
    AiDrivenItemStatus,
} from "@/designer/ai-driven/thread/AiDrivenThreadTypes.ts";

interface WebItemResponse {
    itemId: string;
    threadId: string;
    turnId: string;
    type: string;
    content?: Record<string, unknown>;
    sequence: number;
    createdAt?: number;
}

const normalizeItemType = (value: string): string => {
    const mapping: Record<string, string> = {
        user_message: "userMessage",
        assistant_message: "agentMessage",
        tool_call: "toolCall",
        tool_result: "toolCall",
        input_required: "userInput",
        frontend_effect: "canvasOperation",
        progress_log: "agentMessage",
        diagnostic: "error",
    };
    return mapping[value] ?? value;
};

const toItem = (value: WebItemResponse): IAiDrivenItem => ({
    itemId: value.itemId,
    turnId: value.turnId,
    itemSequence: value.sequence,
    sourceRunId: null,
    logicalKey: value.itemId,
    itemType: normalizeItemType(value.type),
    status: "completed" as AiDrivenItemStatus,
    schemaVersion: 1,
    payload: value.content ?? {},
    lastEventSequence: value.sequence,
    rowVersion: 1,
    createdAt: value.createdAt ?? Date.now(),
    updatedAt: value.createdAt ?? Date.now(),
    completedAt: value.createdAt ?? Date.now(),
});

export const listAiDrivenItems = async (
    payload: IAiDrivenItemListPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenItemListResult | null> => {
    const values = await AuthFetchUtil.post<WebItemResponse[]>(
        "/api/aiDriven/item/list",
        {projectId: payload.projectId, turnId: payload.turnId, limit: payload.limit},
        options,
    );
    if (!values)
        return null;
    return {data: values.map(toItem), nextCursor: null};
};

export const readAiDrivenItem = async (
    payload: IAiDrivenItemReadPayload,
    options?: AuthRequestInit,
): Promise<IAiDrivenItem | null> => {
    const value = await AuthFetchUtil.post<WebItemResponse>(
        "/api/aiDriven/item/read",
        {projectId: payload.projectId, itemId: payload.itemId},
        options,
    );
    return value ? toItem(value) : null;
};
