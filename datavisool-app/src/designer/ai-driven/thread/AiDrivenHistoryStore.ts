/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable, runInAction} from "mobx";
import {listAiDrivenItems} from "@/api/AiDrivenItemApi.ts";
import {listAiDrivenTurns, readAiDrivenTurn} from "@/api/AiDrivenTurnApi.ts";
import type {AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import {mergeAiDrivenItems, reduceAiDrivenItemEvent} from "./AiDrivenItemEventReducer.ts";
import {aiDrivenDevWarn} from "../AiDrivenDevLogger.ts";
import type {
    AiDrivenTurnStatus,
    IAiDrivenItem,
    IAiDrivenItemListPayload,
    IAiDrivenItemListResult,
    IAiDrivenThreadEvent,
    IAiDrivenTurn,
    IAiDrivenTurnListPayload,
    IAiDrivenTurnListResult,
} from "./AiDrivenThreadTypes.ts";

const TURN_PAGE_SIZE = 30;
const ITEM_PAGE_SIZE = 50;

export interface AiDrivenHistoryStoreApi {
    listTurns: (payload: IAiDrivenTurnListPayload, options?: AuthRequestInit) => Promise<IAiDrivenTurnListResult | null>;
    readTurn: (payload: {projectId: string; threadId: string; turnId: string}, options?: AuthRequestInit) => Promise<IAiDrivenTurn | null>;
    listItems: (payload: IAiDrivenItemListPayload, options?: AuthRequestInit) => Promise<IAiDrivenItemListResult | null>;
}

const defaultApi: AiDrivenHistoryStoreApi = {
    listTurns: listAiDrivenTurns,
    readTurn: readAiDrivenTurn,
    listItems: listAiDrivenItems,
};

export class AiDrivenHistoryStore {
    constructor(private readonly api: AiDrivenHistoryStoreApi = defaultApi) {
        makeObservable(this, {
            projectId: observable,
            threadId: observable,
            turns: observable.shallow,
            nextTurnCursor: observable,
            loadingTurns: observable,
            loadingMoreTurns: observable,
            turnErrorMessage: observable,
            itemsByTurn: observable.ref,
            nextItemCursorByTurn: observable.ref,
            loadedTurnIds: observable.shallow,
            loadingItemTurnIds: observable.shallow,
            itemErrorsByTurn: observable.ref,
            expandedTurnIds: observable.shallow,
            threadEventCursor: observable,
            hasMoreTurns: computed,
            openThread: action,
            loadTurns: action,
            loadItems: action,
            toggleTurn: action,
            collapseAll: action,
            applyEvent: action,
            clear: action,
            dispose: action,
        });
    }

    projectId = "";
    threadId = "";
    turns: IAiDrivenTurn[] = [];
    nextTurnCursor: number | null = null;
    loadingTurns = false;
    loadingMoreTurns = false;
    turnErrorMessage = "";
    itemsByTurn: Record<string, IAiDrivenItem[]> = {};
    nextItemCursorByTurn: Record<string, number | null> = {};
    loadedTurnIds = new Set<string>();
    loadingItemTurnIds = new Set<string>();
    itemErrorsByTurn: Record<string, string> = {};
    expandedTurnIds = new Set<string>();
    threadEventCursor = 0;

    private version = 0;
    private turnController: AbortController | null = null;
    private itemControllers = new Map<string, AbortController>();
    private missingTurnEvents = new Map<string, IAiDrivenThreadEvent>();
    private loadingMissingTurnIds = new Set<string>();

    get hasMoreTurns() {
        return this.nextTurnCursor !== null;
    }

    openThread = async (projectId: string, threadId: string) => {
        const normalizedProjectId = projectId.trim();
        const normalizedThreadId = threadId.trim();
        if (!normalizedProjectId || !normalizedThreadId) {
            this.clear();
            return;
        }
        if (this.projectId === normalizedProjectId && this.threadId === normalizedThreadId && this.turns.length > 0) {
            if (this.missingTurnEvents.size > 0)
                await this.loadTurns(true);
            return;
        }
        this.resetScope(normalizedProjectId, normalizedThreadId);
        await this.loadTurns(true);
    };

    loadTurns = async (reset = false) => {
        if (!this.projectId || !this.threadId || (!reset && (this.loadingMoreTurns || !this.hasMoreTurns)))
            return;
        if (reset)
            this.turnController?.abort();
        const controller = new AbortController();
        this.turnController = controller;
        const version = this.version;
        const projectId = this.projectId;
        const threadId = this.threadId;
        const cursor = reset ? null : this.nextTurnCursor;
        if (reset) {
            this.loadingTurns = true;
            this.nextTurnCursor = null;
        } else {
            this.loadingMoreTurns = true;
        }
        this.turnErrorMessage = "";

        try {
            const result = await this.api.listTurns({
                projectId,
                threadId,
                cursor,
                limit: TURN_PAGE_SIZE,
            }, {signal: controller.signal, suppressErrorMessage: true});
            if (!this.isTurnRequestCurrent(controller, version, projectId, threadId) || !result)
                return;
            runInAction(() => {
                const recoveredTurns = result.data.map((turn) => {
                    const latestEvent = this.missingTurnEvents.get(turn.turnId);
                    const latestStatus = latestEvent ? turnStatusFromEvent(latestEvent) : null;
                    return latestStatus ? applyTurnStatus(turn, latestStatus, latestEvent!.createdAt) : turn;
                });
                this.turns = mergeTurns(this.turns, recoveredTurns);
                this.nextTurnCursor = result.nextCursor;
                result.data.forEach((turn) => this.missingTurnEvents.delete(turn.turnId));
            });
        } catch (error) {
            if (!controller.signal.aborted && this.isCurrent(version, projectId, threadId))
                runInAction(() => this.turnErrorMessage = errorMessage(error));
        } finally {
            if (this.isTurnRequestCurrent(controller, version, projectId, threadId)) {
                runInAction(() => {
                    this.loadingTurns = false;
                    this.loadingMoreTurns = false;
                });
                this.turnController = null;
            }
        }
    };

    loadItems = async (turnId: string, reset = false) => {
        if (!this.projectId || !this.threadId || !turnId)
            return;
        if (!reset && (this.loadingItemTurnIds.has(turnId) || this.nextItemCursorByTurn[turnId] === null))
            return;
        this.itemControllers.get(turnId)?.abort();
        const controller = new AbortController();
        this.itemControllers.set(turnId, controller);
        const version = this.version;
        const projectId = this.projectId;
        const threadId = this.threadId;
        const cursor = reset ? null : this.nextItemCursorByTurn[turnId] ?? null;
        this.loadingItemTurnIds = new Set(this.loadingItemTurnIds).add(turnId);
        this.itemErrorsByTurn = {...this.itemErrorsByTurn, [turnId]: ""};

        try {
            const result = await this.api.listItems({
                projectId,
                threadId,
                turnId,
                cursor,
                limit: ITEM_PAGE_SIZE,
            }, {signal: controller.signal, suppressErrorMessage: true});
            if (!this.isItemRequestCurrent(controller, version, projectId, threadId, turnId) || !result)
                return;
            runInAction(() => {
                const current = this.itemsByTurn[turnId] ?? [];
                this.itemsByTurn = {
                    ...this.itemsByTurn,
                    [turnId]: mergeAiDrivenItems(current, result.data),
                };
                this.nextItemCursorByTurn = {
                    ...this.nextItemCursorByTurn,
                    [turnId]: result.nextCursor,
                };
                this.loadedTurnIds = new Set(this.loadedTurnIds).add(turnId);
            });
        } catch (error) {
            if (!controller.signal.aborted && this.isCurrent(version, projectId, threadId)) {
                runInAction(() => {
                    this.itemErrorsByTurn = {...this.itemErrorsByTurn, [turnId]: errorMessage(error)};
                });
            }
        } finally {
            if (this.isItemRequestCurrent(controller, version, projectId, threadId, turnId)) {
                runInAction(() => {
                    const loading = new Set(this.loadingItemTurnIds);
                    loading.delete(turnId);
                    this.loadingItemTurnIds = loading;
                });
                this.itemControllers.delete(turnId);
            }
        }
    };

    toggleTurn = (turnId: string) => {
        const expanded = new Set(this.expandedTurnIds);
        if (expanded.has(turnId)) {
            expanded.delete(turnId);
        } else {
            expanded.add(turnId);
            if (!this.loadedTurnIds.has(turnId))
                void this.loadItems(turnId, true);
        }
        this.expandedTurnIds = expanded;
    };

    collapseAll = () => {
        this.expandedTurnIds = new Set();
    };

    applyEvent = (event: IAiDrivenThreadEvent) => {
        if (!this.threadId || event.threadId !== this.threadId || event.threadSequence <= this.threadEventCursor)
            return;
        this.threadEventCursor = event.threadSequence;

        if (event.kind.startsWith("item.")) {
            const current = this.itemsByTurn[event.turnId] ?? [];
            const next = reduceAiDrivenItemEvent(current, event);
            if (next !== current)
                this.itemsByTurn = {...this.itemsByTurn, [event.turnId]: next};
        } else if (event.kind.startsWith("agent.canvas_operation.")) {
            const operationItem = canvasOperationItem(event);
            if (operationItem) {
                const current = this.itemsByTurn[event.turnId] ?? [];
                this.itemsByTurn = {...this.itemsByTurn, [event.turnId]: mergeAiDrivenItems(current, [operationItem])};
            }
        }

        const turnSnapshot = parseTurnSnapshot(event.payload.turn);
        if (turnSnapshot && turnSnapshot.threadId === this.threadId) {
            this.turns = mergeTurns(this.turns, [turnSnapshot]);
            return;
        }

        const status = turnStatusFromEvent(event);
        if (!this.turns.some((turn) => turn.turnId === event.turnId)) {
            if (event.kind === "turn.created" || status) {
                this.missingTurnEvents.set(event.turnId, event);
                void this.loadMissingTurn(event.turnId);
            }
            return;
        }
        if (!status)
            return;
        this.turns = this.turns.map((turn) => turn.turnId === event.turnId
            ? applyTurnStatus(turn, status, event.createdAt)
            : turn);
    };

    clear = () => {
        this.dispose();
        this.version += 1;
        this.projectId = "";
        this.threadId = "";
        this.turns = [];
        this.nextTurnCursor = null;
        this.turnErrorMessage = "";
        this.itemsByTurn = {};
        this.nextItemCursorByTurn = {};
        this.loadedTurnIds = new Set();
        this.loadingItemTurnIds = new Set();
        this.missingTurnEvents.clear();
        this.loadingMissingTurnIds.clear();
        this.itemErrorsByTurn = {};
        this.expandedTurnIds = new Set();
        this.threadEventCursor = 0;
    };

    dispose = () => {
        this.version += 1;
        this.turnController?.abort();
        this.itemControllers.forEach((controller) => controller.abort());
        this.turnController = null;
        this.itemControllers.clear();
        this.loadingTurns = false;
        this.loadingMoreTurns = false;
        this.loadingItemTurnIds = new Set();
    };

    private resetScope(projectId: string, threadId: string) {
        this.clear();
        this.projectId = projectId;
        this.threadId = threadId;
    }

    private async loadMissingTurn(turnId: string) {
        if (this.loadingMissingTurnIds.has(turnId))
            return;
        this.loadingMissingTurnIds.add(turnId);
        const version = this.version;
        const projectId = this.projectId;
        const threadId = this.threadId;
        try {
            const turn = await this.api.readTurn({projectId, threadId, turnId}, {suppressErrorMessage: true});
            if (!this.isCurrent(version, projectId, threadId))
                return;
            if (!turn) {
                await this.loadTurns(true);
                return;
            }
            runInAction(() => {
                const latestEvent = this.missingTurnEvents.get(turnId);
                const latestStatus = latestEvent ? turnStatusFromEvent(latestEvent) : null;
                const next = latestStatus ? applyTurnStatus(turn, latestStatus, latestEvent!.createdAt) : turn;
                this.turns = mergeTurns(this.turns, [next]);
                this.missingTurnEvents.delete(turnId);
            });
        } catch (error) {
            aiDrivenDevWarn("Missing Turn recovery failed:", error);
            if (this.isCurrent(version, projectId, threadId))
                await this.loadTurns(true);
        } finally {
            this.loadingMissingTurnIds.delete(turnId);
        }
    }

    private isCurrent(version: number, projectId: string, threadId: string) {
        return this.version === version && this.projectId === projectId && this.threadId === threadId;
    }

    private isTurnRequestCurrent(
        controller: AbortController,
        version: number,
        projectId: string,
        threadId: string,
    ) {
        return !controller.signal.aborted
            && this.turnController === controller
            && this.isCurrent(version, projectId, threadId);
    }

    private isItemRequestCurrent(
        controller: AbortController,
        version: number,
        projectId: string,
        threadId: string,
        turnId: string,
    ) {
        return !controller.signal.aborted
            && this.itemControllers.get(turnId) === controller
            && this.isCurrent(version, projectId, threadId);
    }
}

const mergeTurns = (current: IAiDrivenTurn[], incoming: IAiDrivenTurn[]) => {
    const byId = new Map(current.map((turn) => [turn.turnId, turn]));
    incoming.forEach((turn) => byId.set(turn.turnId, turn));
    return [...byId.values()].sort((left, right) => left.turnSequence - right.turnSequence
        || left.turnId.localeCompare(right.turnId));
};

const applyTurnStatus = (turn: IAiDrivenTurn, status: AiDrivenTurnStatus, createdAt: number): IAiDrivenTurn => ({
    ...turn,
    status,
    startedAt: status === "running" && turn.startedAt === null ? createdAt : turn.startedAt,
    updatedAt: Math.max(turn.updatedAt, createdAt),
    endedAt: isTerminalTurnStatus(status) ? createdAt : null,
});

const turnStatusFromEvent = (event: IAiDrivenThreadEvent): AiDrivenTurnStatus | null => {
    switch (event.kind) {
        case "turn.started":
        case "turn.resumed":
            return "running";
        case "turn.verifying":
            return "verifying";
        case "turn.waiting":
            return waitingTurnStatus(event.payload.status);
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

const waitingTurnStatus = (value: unknown): AiDrivenTurnStatus | null => {
    return value === "waitingFrontendTool"
        || value === "waitingUserInput"
        || value === "waitingUserConfirmation"
        ? value
        : null;
};

const isTerminalTurnStatus = (status: AiDrivenTurnStatus) => {
    return status === "completed" || status === "failed" || status === "cancelled" || status === "interrupted" || status === "budgetExhausted";
};

const parseTurnSnapshot = (value: unknown): IAiDrivenTurn | null => {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const turn = value as Partial<IAiDrivenTurn>;
    return typeof turn.turnId === "string"
        && typeof turn.threadId === "string"
        && typeof turn.projectId === "string"
        && typeof turn.turnSequence === "number"
        && typeof turn.status === "string"
        ? turn as IAiDrivenTurn
        : null;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "请求失败";

const canvasOperationItem = (event: IAiDrivenThreadEvent): IAiDrivenItem | null => {
    const operation = event.payload.operation;
    if (!operation || typeof operation !== "object" || Array.isArray(operation))
        return null;
    const payload = operation as Record<string, unknown>;
    const operationId = typeof payload.operationId === "string" ? payload.operationId : "";
    const status = canvasOperationItemStatus(payload.status);
    if (!operationId || !status)
        return null;
    return {
        itemId: `canvas-operation:${operationId}`,
        turnId: event.turnId,
        itemSequence: Number.MAX_SAFE_INTEGER,
        sourceRunId: event.runId,
        logicalKey: operationId,
        itemType: "canvasOperation",
        status,
        schemaVersion: event.schemaVersion,
        payload,
        lastEventSequence: event.threadSequence,
        rowVersion: 0,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        completedAt: status === "completed" || status === "failed" || status === "declined" ? event.createdAt : null,
    };
};

const canvasOperationItemStatus = (value: unknown): IAiDrivenItem["status"] | null => {
    switch (value) {
        case "prepared": return "created";
        case "applying": return "inProgress";
        case "applied": return "completed";
        case "rejected": return "declined";
        case "failed": return "failed";
        default: return null;
    }
};
