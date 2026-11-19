/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {
    AiDrivenItemStatus,
    IAiDrivenItem,
    IAiDrivenThreadEvent,
} from "./AiDrivenThreadTypes.ts";

const ITEM_TERMINAL_STATUSES = new Set<AiDrivenItemStatus>([
    "completed",
    "failed",
    "cancelled",
    "declined",
]);

const ITEM_STATUSES = new Set<AiDrivenItemStatus>([
    "created",
    "inProgress",
    "waiting",
    "completed",
    "failed",
    "cancelled",
    "declined",
]);

export const isAiDrivenItemTerminal = (status: AiDrivenItemStatus) => {
    return ITEM_TERMINAL_STATUSES.has(status);
};

/** 将持久化快照与活动事件投影合并，始终保留较新的 threadSequence。 */
export const mergeAiDrivenItems = (
    current: IAiDrivenItem[],
    incoming: IAiDrivenItem[],
): IAiDrivenItem[] => {
    const byId = new Map(current.map((item) => [item.itemId, item]));
    incoming.forEach((item) => {
        const previous = byId.get(item.itemId);
        if (!previous || item.lastEventSequence >= previous.lastEventSequence)
            byId.set(item.itemId, item);
    });
    return sortItems([...byId.values()]);
};

/** 应用单个 Item 生命周期事件；未知事件不会改变状态。 */
export const reduceAiDrivenItemEvent = (
    items: IAiDrivenItem[],
    event: IAiDrivenThreadEvent,
): IAiDrivenItem[] => {
    if (!event.kind.startsWith("item."))
        return items;

    const snapshot = parseItemSnapshot(event.payload.item, event);
    if (snapshot)
        return mergeSnapshot(items, snapshot, event.threadSequence);

    if (event.kind !== "item.delta" || !event.itemId)
        return items;

    const delta = stringValue(event.payload.delta);
    if (!delta)
        return items;

    const current = items.find((item) => item.itemId === event.itemId);
    if (current) {
        if (event.threadSequence <= current.lastEventSequence || isAiDrivenItemTerminal(current.status))
            return items;
        const next: IAiDrivenItem = {
            ...current,
            status: current.status === "created" ? "inProgress" : current.status,
            payload: {
                ...current.payload,
                text: `${stringValue(current.payload.text)}${delta}`,
            },
            lastEventSequence: event.threadSequence,
            rowVersion: Math.max(current.rowVersion, numberValue(event.payload.rowVersion, current.rowVersion)),
            updatedAt: event.createdAt,
        };
        return replaceItem(items, next);
    }

    const itemType = stringValue(event.payload.itemType);
    if (!itemType)
        return items;
    return sortItems([...items, {
        itemId: event.itemId,
        turnId: event.turnId,
        itemSequence: numberValue(event.payload.itemSequence, Number.MAX_SAFE_INTEGER),
        sourceRunId: event.runId,
        logicalKey: null,
        itemType,
        status: "inProgress",
        schemaVersion: event.schemaVersion,
        payload: {text: delta},
        lastEventSequence: event.threadSequence,
        rowVersion: numberValue(event.payload.rowVersion, 0),
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        completedAt: null,
    }]);
};

const mergeSnapshot = (
    items: IAiDrivenItem[],
    snapshot: IAiDrivenItem,
    threadSequence: number,
) => {
    const current = items.find((item) => item.itemId === snapshot.itemId);
    if (current && threadSequence <= current.lastEventSequence)
        return items;
    if (current && isAiDrivenItemTerminal(current.status))
        return items;
    return replaceItem(items, {
        ...snapshot,
        lastEventSequence: Math.max(snapshot.lastEventSequence, threadSequence),
    });
};

const replaceItem = (items: IAiDrivenItem[], next: IAiDrivenItem) => {
    const index = items.findIndex((item) => item.itemId === next.itemId);
    if (index < 0)
        return sortItems([...items, next]);
    const result = [...items];
    result[index] = next;
    return sortItems(result);
};

const sortItems = (items: IAiDrivenItem[]) => {
    return items.sort((left, right) => left.itemSequence - right.itemSequence
        || left.createdAt - right.createdAt
        || left.itemId.localeCompare(right.itemId));
};

const parseItemSnapshot = (value: unknown, event: IAiDrivenThreadEvent): IAiDrivenItem | null => {
    const item = asRecord(value);
    const itemId = stringValue(item?.itemId);
    const itemType = stringValue(item?.itemType);
    const status = itemStatus(item?.status);
    const payload = asRecord(item?.payload);
    if (!item || !itemId || !itemType || !status || !payload)
        return null;

    return {
        itemId,
        turnId: stringValue(item.turnId) || event.turnId,
        itemSequence: numberValue(item.itemSequence, Number.MAX_SAFE_INTEGER),
        sourceRunId: nullableString(item.sourceRunId) ?? event.runId,
        logicalKey: nullableString(item.logicalKey),
        itemType,
        status,
        schemaVersion: numberValue(item.schemaVersion, event.schemaVersion),
        payload,
        lastEventSequence: numberValue(item.lastEventSequence, event.threadSequence),
        rowVersion: numberValue(item.rowVersion, 0),
        createdAt: numberValue(item.createdAt, event.createdAt),
        updatedAt: numberValue(item.updatedAt, event.createdAt),
        completedAt: nullableNumber(item.completedAt)
            ?? (isAiDrivenItemTerminal(status) ? event.createdAt : null),
    };
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
};

const stringValue = (value: unknown) => typeof value === "string" ? value : "";
const nullableString = (value: unknown) => typeof value === "string" && value ? value : null;
const numberValue = (value: unknown, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};
const nullableNumber = (value: unknown) => {
    if (value === null || value === undefined)
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};
const itemStatus = (value: unknown): AiDrivenItemStatus | null => {
    return typeof value === "string" && ITEM_STATUSES.has(value as AiDrivenItemStatus)
        ? value as AiDrivenItemStatus
        : null;
};
