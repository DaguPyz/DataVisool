/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable, runInAction} from "mobx";
import {
    archiveAiDrivenThread,
    createAiDrivenThread,
    listAiDrivenThreads,
    readAiDrivenThread,
    updateAiDrivenThread,
} from "@/api/AiDrivenThreadApi.ts";
import type {AuthRequestInit} from "@/util/AuthFetchUtil.ts";
import type {
    IAiDrivenThread,
    IAiDrivenThreadArchivePayload,
    IAiDrivenThreadCreatePayload,
    IAiDrivenThreadCursor,
    IAiDrivenThreadListPayload,
    IAiDrivenThreadListResult,
    IAiDrivenThreadReadPayload,
    IAiDrivenThreadSummary,
    IAiDrivenThreadUpdatePayload,
} from "./AiDrivenThreadTypes.ts";

const THREAD_PAGE_SIZE = 30;
const SELECTED_THREAD_STORAGE_PREFIX = "AI_DRIVEN_SELECTED_THREAD_V1";

export interface AiDrivenThreadStoreApi {
    create: (payload: IAiDrivenThreadCreatePayload, options?: AuthRequestInit) => Promise<IAiDrivenThread | null>;
    list: (payload: IAiDrivenThreadListPayload, options?: AuthRequestInit) => Promise<IAiDrivenThreadListResult | null>;
    read: (payload: IAiDrivenThreadReadPayload, options?: AuthRequestInit) => Promise<IAiDrivenThreadSummary | null>;
    update: (payload: IAiDrivenThreadUpdatePayload, options?: AuthRequestInit) => Promise<IAiDrivenThread | null>;
    archive: (payload: IAiDrivenThreadArchivePayload, options?: AuthRequestInit) => Promise<IAiDrivenThread | null>;
}

const defaultApi: AiDrivenThreadStoreApi = {
    create: createAiDrivenThread,
    list: listAiDrivenThreads,
    read: readAiDrivenThread,
    update: updateAiDrivenThread,
    archive: archiveAiDrivenThread,
};

export class AiDrivenThreadStore {
    constructor(private readonly api: AiDrivenThreadStoreApi = defaultApi) {
        makeObservable(this, {
            projectId: observable,
            threads: observable.shallow,
            selectedThreadId: observable,
            selectedThreadSnapshot: observable.ref,
            archivedFilter: observable,
            nextCursor: observable,
            loading: observable,
            loadingMore: observable,
            creating: observable,
            mutating: observable,
            errorMessage: observable,
            selectedThread: computed,
            hasMore: computed,
            initialize: action,
            loadThreads: action,
            setArchivedFilter: action,
            selectThread: action,
            startNewConversation: action,
            ensureThread: action,
            renameThread: action,
            setThreadArchived: action,
            dispose: action,
        });
    }

    projectId = "";
    threads: IAiDrivenThreadSummary[] = [];
    selectedThreadId: string | null = null;
    selectedThreadSnapshot: IAiDrivenThreadSummary | null = null;
    archivedFilter = false;
    nextCursor: IAiDrivenThreadCursor | null = null;
    loading = false;
    loadingMore = false;
    creating = false;
    mutating = false;
    errorMessage = "";

    private version = 0;
    private draftCreateRequestId: string | null = null;
    private listController: AbortController | null = null;
    private mutationController: AbortController | null = null;

    get selectedThread() {
        return this.selectedThreadSnapshot;
    }

    get hasMore() {
        return this.nextCursor !== null;
    }

    initialize = async (projectId: string) => {
        const normalizedProjectId = projectId.trim();
        if (!normalizedProjectId)
            return;
        this.resetProject(normalizedProjectId);
        const version = this.version;
        const restoredId = readSelectedThreadId(normalizedProjectId);
        this.selectedThreadId = restoredId;

        await this.loadThreads(true);
        if (!this.isCurrent(version, normalizedProjectId))
            return;

        const restored = restoredId
            ? this.threads.find((thread) => thread.threadId === restoredId) ?? null
            : null;
        if (restored) {
            runInAction(() => this.applySelectedThread(restored));
            return;
        }

        if (restoredId) {
            const controller = new AbortController();
            this.mutationController = controller;
            try {
                const thread = await this.api.read({projectId: normalizedProjectId, threadId: restoredId}, {
                    signal: controller.signal,
                    suppressErrorMessage: true,
                });
                if (this.isCurrent(version, normalizedProjectId) && !controller.signal.aborted && thread) {
                    runInAction(() => this.applySelectedThread(toThreadSummary(thread)));
                    return;
                }
            } catch {
                // 已失效的最近选择回退到当前列表首项。
            } finally {
                if (this.mutationController === controller)
                    this.mutationController = null;
            }
        }

        if (!this.isCurrent(version, normalizedProjectId))
            return;
        runInAction(() => {
            const fallback = this.threads[0] ?? null;
            if (fallback)
                this.applySelectedThread(fallback);
            else
                this.startNewConversation();
        });
    };

    loadThreads = async (reset = false) => {
        if (!this.projectId || (!reset && (this.loadingMore || !this.hasMore)))
            return;
        if (reset)
            this.listController?.abort();
        const controller = new AbortController();
        this.listController = controller;
        const version = this.version;
        const projectId = this.projectId;
        const archived = this.archivedFilter;
        const cursor = reset ? null : this.nextCursor;
        if (reset) {
            this.loading = true;
            this.nextCursor = null;
        } else {
            this.loadingMore = true;
        }
        this.errorMessage = "";

        try {
            const result = await this.api.list({
                projectId,
                archived,
                cursor,
                limit: THREAD_PAGE_SIZE,
            }, {signal: controller.signal, suppressErrorMessage: true});
            if (!this.isListRequestCurrent(controller, version, projectId, archived) || !result)
                return;
            runInAction(() => {
                this.threads = mergeThreads(reset ? [] : this.threads, result.data);
                this.nextCursor = result.nextCursor;
                const selected = this.selectedThreadId
                    ? this.threads.find((thread) => thread.threadId === this.selectedThreadId)
                    : null;
                if (selected)
                    this.selectedThreadSnapshot = selected;
            });
        } catch (error) {
            if (!controller.signal.aborted && this.isCurrent(version, projectId))
                runInAction(() => this.errorMessage = errorMessage(error));
        } finally {
            if (this.isListRequestCurrent(controller, version, projectId, archived)) {
                runInAction(() => {
                    this.loading = false;
                    this.loadingMore = false;
                });
                this.listController = null;
            }
        }
    };

    setArchivedFilter = (archived: boolean) => {
        if (this.archivedFilter === archived)
            return;
        this.archivedFilter = archived;
        this.threads = [];
        this.nextCursor = null;
        void this.loadThreads(true);
    };

    selectThread = (threadId: string) => {
        const thread = this.threads.find((item) => item.threadId === threadId);
        if (!thread || thread.projectId !== this.projectId)
            return;
        this.applySelectedThread(thread);
        this.draftCreateRequestId = null;
    };

    startNewConversation = () => {
        this.selectedThreadId = null;
        this.selectedThreadSnapshot = null;
        this.draftCreateRequestId ??= createClientRequestId();
        persistSelectedThreadId(this.projectId, null);
    };

    /** 首次提交前幂等创建 Thread；失败时保留同一个 clientRequestId 供重试。 */
    ensureThread = async (): Promise<IAiDrivenThreadSummary | null> => {
        if (this.selectedThread)
            return this.selectedThread.status === "active" ? this.selectedThread : null;
        if (!this.projectId || this.creating)
            return null;

        const projectId = this.projectId;
        const version = this.version;
        const clientRequestId = this.draftCreateRequestId ?? createClientRequestId();
        this.draftCreateRequestId = clientRequestId;
        this.creating = true;
        this.errorMessage = "";
        const controller = new AbortController();
        this.mutationController?.abort();
        this.mutationController = controller;
        try {
            const thread = await this.api.create({projectId, clientRequestId}, {
                signal: controller.signal,
                suppressErrorMessage: true,
            });
            if (!this.isCurrent(version, projectId) || controller.signal.aborted || !thread)
                return null;
            const summary = toThreadSummary(thread);
            runInAction(() => {
                this.upsertThread(summary);
                this.applySelectedThread(summary);
                this.draftCreateRequestId = null;
            });
            return summary;
        } catch (error) {
            if (!controller.signal.aborted && this.isCurrent(version, projectId))
                runInAction(() => this.errorMessage = errorMessage(error));
            return null;
        } finally {
            if (this.isCurrent(version, projectId))
                runInAction(() => this.creating = false);
            if (this.mutationController === controller)
                this.mutationController = null;
        }
    };

    renameThread = async (threadId: string, title: string) => {
        const thread = this.resolveThread(threadId);
        const normalizedTitle = title.trim();
        if (!thread || !normalizedTitle || this.mutating)
            return null;
        return await this.mutateThread((controller) => this.api.update({
            projectId: this.projectId,
            threadId,
            title: normalizedTitle,
            expectedVersion: thread.rowVersion,
        }, {signal: controller.signal, suppressErrorMessage: true}));
    };

    setThreadArchived = async (threadId: string, archived: boolean) => {
        const thread = this.resolveThread(threadId);
        if (!thread || this.mutating || (thread.status === "archived") === archived)
            return thread;
        return await this.mutateThread((controller) => this.api.archive({
            projectId: this.projectId,
            threadId,
            archived,
            expectedVersion: thread.rowVersion,
        }, {signal: controller.signal, suppressErrorMessage: true}));
    };

    dispose = () => {
        this.version += 1;
        this.listController?.abort();
        this.mutationController?.abort();
        this.listController = null;
        this.mutationController = null;
        this.loading = false;
        this.loadingMore = false;
        this.creating = false;
        this.mutating = false;
    };

    private mutateThread = async (
        request: (controller: AbortController) => Promise<IAiDrivenThread | null>,
    ) => {
        const version = this.version;
        const projectId = this.projectId;
        const controller = new AbortController();
        this.mutationController?.abort();
        this.mutationController = controller;
        this.mutating = true;
        this.errorMessage = "";
        try {
            const thread = await request(controller);
            if (!thread || controller.signal.aborted || !this.isCurrent(version, projectId))
                return null;
            runInAction(() => this.upsertThread(toThreadSummary(thread, this.resolveThread(thread.threadId))));
            return thread;
        } catch (error) {
            if (!controller.signal.aborted && this.isCurrent(version, projectId))
                runInAction(() => this.errorMessage = errorMessage(error));
            return null;
        } finally {
            if (this.isCurrent(version, projectId))
                runInAction(() => this.mutating = false);
            if (this.mutationController === controller)
                this.mutationController = null;
        }
    };

    private resetProject(projectId: string) {
        this.dispose();
        this.version += 1;
        this.projectId = projectId;
        this.threads = [];
        this.selectedThreadId = null;
        this.selectedThreadSnapshot = null;
        this.archivedFilter = false;
        this.nextCursor = null;
        this.errorMessage = "";
        this.draftCreateRequestId = null;
    }

    private applySelectedThread(thread: IAiDrivenThreadSummary) {
        this.selectedThreadId = thread.threadId;
        this.selectedThreadSnapshot = thread;
        persistSelectedThreadId(this.projectId, thread.threadId);
    }

    private upsertThread(thread: IAiDrivenThreadSummary) {
        if (thread.projectId !== this.projectId)
            return;
        if ((thread.status === "archived") !== this.archivedFilter) {
            this.threads = this.threads.filter((item) => item.threadId !== thread.threadId);
        } else {
            this.threads = mergeThreads(this.threads, [thread]);
        }
        if (this.selectedThreadId === thread.threadId)
            this.selectedThreadSnapshot = thread;
    }

    private resolveThread(threadId: string) {
        if (this.selectedThreadSnapshot?.threadId === threadId)
            return this.selectedThreadSnapshot;
        return this.threads.find((thread) => thread.threadId === threadId) ?? null;
    }

    private isCurrent(version: number, projectId: string) {
        return this.version === version && this.projectId === projectId;
    }

    private isListRequestCurrent(
        controller: AbortController,
        version: number,
        projectId: string,
        archived: boolean,
    ) {
        return !controller.signal.aborted
            && this.listController === controller
            && this.isCurrent(version, projectId)
            && this.archivedFilter === archived;
    }
}

const mergeThreads = (current: IAiDrivenThreadSummary[], incoming: IAiDrivenThreadSummary[]) => {
    const byId = new Map(current.map((thread) => [thread.threadId, thread]));
    incoming.forEach((thread) => byId.set(thread.threadId, thread));
    return [...byId.values()].sort((left, right) => right.lastActivityAt - left.lastActivityAt
        || left.threadId.localeCompare(right.threadId));
};

const toThreadSummary = (
    thread: IAiDrivenThread,
    previous?: IAiDrivenThreadSummary | null,
): IAiDrivenThreadSummary => {
    const enriched = thread as IAiDrivenThread & Partial<IAiDrivenThreadSummary>;
    return {
        ...thread,
        runtimeStatus: enriched.runtimeStatus ?? previous?.runtimeStatus ?? "idle",
        activeTurnId: enriched.activeTurnId ?? previous?.activeTurnId ?? null,
        currentRunId: enriched.currentRunId ?? previous?.currentRunId ?? null,
    };
};

const selectedThreadStorageKey = (projectId: string) => `${SELECTED_THREAD_STORAGE_PREFIX}:${projectId}`;

const readSelectedThreadId = (projectId: string) => {
    try {
        return localStorage.getItem(selectedThreadStorageKey(projectId));
    } catch {
        return null;
    }
};

const persistSelectedThreadId = (projectId: string, threadId: string | null) => {
    if (!projectId)
        return;
    try {
        if (threadId)
            localStorage.setItem(selectedThreadStorageKey(projectId), threadId);
        else
            localStorage.removeItem(selectedThreadStorageKey(projectId));
    } catch {
        // 本地选择持久化失败不影响服务端 Thread。
    }
};

const createClientRequestId = () => {
    const randomId = globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `ai-driven-thread-create-${randomId}`;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "请求失败";
