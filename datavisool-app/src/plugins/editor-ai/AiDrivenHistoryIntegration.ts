/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {AiDrivenHistoryStore} from "./thread/AiDrivenHistoryStore.ts";
import {AiDrivenThreadEventStream} from "./thread/AiDrivenThreadEventStream.ts";
import {aiDrivenDevWarn} from "./AiDrivenDevLogger.ts";

/** 协调历史快照加载和 Thread cursor 事件流，避免与 Run cursor 混用。 */
export class AiDrivenHistoryIntegration {
    private version = 0;
    private readonly eventStream = new AiDrivenThreadEventStream();

    constructor(private readonly historyStore: AiDrivenHistoryStore) {}

    open = async (projectId: string, threadId: string) => {
        const version = ++this.version;
        this.eventStream.stop();
        await this.historyStore.openThread(projectId, threadId);
        if (version !== this.version
            || this.historyStore.projectId !== projectId
            || this.historyStore.threadId !== threadId)
            return;

        void this.eventStream.start({
            projectId,
            threadId,
            eventCursor: this.historyStore.threadEventCursor,
        }, {
            onCursor: () => undefined,
            onEvent: this.historyStore.applyEvent,
            onError: (error) => aiDrivenDevWarn("Thread event stream unavailable:", error),
        });
    };

    close = () => {
        this.version += 1;
        this.eventStream.stop();
    };

    clear = () => {
        this.close();
        this.historyStore.clear();
    };
}
