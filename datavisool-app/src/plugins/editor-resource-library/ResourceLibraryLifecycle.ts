/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export interface ResourceLibraryLifecycle {
    isActive(): boolean;
    isAccepting(): boolean;
    registerPauseCleanup(cleanup: () => void): () => void;
    trackTask<T>(task: Promise<T>): Promise<T>;
}

export function createResourceLibraryLifecycle() {
    let active = true;
    let accepting = true;
    const pauseCleanups = new Set<() => void>();
    const tasks = new Set<Promise<unknown>>();
    const runPauseCleanups = () => {
        for (const cleanup of [...pauseCleanups]) {
            try { cleanup(); }
            catch (error) { console.error('清理资源库交互失败', error); }
        }
    };

    return {
        isActive: () => active,
        isAccepting: () => active && accepting,
        registerPauseCleanup(cleanup: () => void) {
            if (!active) {
                return () => undefined;
            }
            pauseCleanups.add(cleanup);
            if (!accepting) {
                try { cleanup(); }
                catch (error) { console.error('清理资源库交互失败', error); }
            }
            return () => { pauseCleanups.delete(cleanup); };
        },
        trackTask<T>(task: Promise<T>) {
            tasks.add(task);
            const remove = () => tasks.delete(task);
            void task.then(remove, remove);
            return task;
        },
        pause() {
            if (!active || !accepting) return;
            accepting = false;
            runPauseCleanups();
        },
        async prepare() {
            await Promise.allSettled([...tasks]);
        },
        cancel() {
            if (active) accepting = true;
        },
        dispose() {
            if (!active) return;
            accepting = false;
            runPauseCleanups();
            active = false;
            pauseCleanups.clear();
        },
    };
}
