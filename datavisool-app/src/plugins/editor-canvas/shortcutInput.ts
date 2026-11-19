/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorShortcutInputQuery} from '@datavisool/sdk/plugin/contracts/editorShortcuts';

export interface EditorCanvasShortcutInput {
    readonly query: EditorShortcutInputQuery;
    pause(): void;
    resume(): void;
    register(next: EditorShortcutInputQuery): () => void;
    dispose(): void;
}

/** Owned by one canvas activation; the shortcuts plugin may attach and withdraw its input source. */
export function createCanvasShortcutInput(): EditorCanvasShortcutInput {
    let source: {query: EditorShortcutInputQuery} | undefined;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    let paused = false;
    const listeners = new Set<() => void>();
    const notify = () => {
        for (const listener of listeners) {
            try { listener(); } catch (error) { console.error('通知画布按键状态变化失败', error); }
        }
    };
    const query: EditorShortcutInputQuery = {
        isActive: (id, event) => !paused && (source?.query.isActive(id, event) ?? false),
        isActiveWithExactModifiers: (id, event) => !paused && (source?.query.isActiveWithExactModifiers(id, event) ?? false),
        subscribePressedState(listener) {
            if (disposed) return () => {};
            const subscription = () => listener();
            listeners.add(subscription);
            return () => { listeners.delete(subscription); };
        },
    };
    return {
        query,
        pause() { if (!disposed && !paused) { paused = true; notify(); } },
        resume() { if (!disposed && paused) { paused = false; notify(); } },
        register(next: EditorShortcutInputQuery) {
            if (disposed) throw new Error('Canvas shortcut input has been disposed.');
            if (source) throw new Error('Canvas shortcut input is already registered.');
            const registration = {query: next};
            source = registration;
            try {
                unsubscribe = next.subscribePressedState(() => {
                    if (source === registration) notify();
                });
            } catch (error) {
                source = undefined;
                throw error;
            }
            notify();
            return () => {
                if (source !== registration) return;
                try { unsubscribe?.(); } finally {
                    unsubscribe = undefined;
                    source = undefined;
                    notify();
                }
            };
        },
        dispose() {
            disposed = true;
            paused = true;
            try { unsubscribe?.(); } finally {
                unsubscribe = undefined;
                source = undefined;
                notify();
                listeners.clear();
            }
        },
    };
}
