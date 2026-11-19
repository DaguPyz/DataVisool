/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

/** Stops plugin effects synchronously, even when React has not unmounted its views yet. */
export function createShortcutEffects() {
    type Entry = {setup: () => void | (() => void); cleanup?: () => void};
    const entries = new Set<Entry>();
    const pendingTasks = new Set<Promise<unknown>>();
    let paused = false;
    let disposed = false;
    const cleanup = (entry: Entry) => {
        const stop = entry.cleanup;
        entry.cleanup = undefined;
        stop?.();
    };
    const forEach = (run: (entry: Entry) => void) => {
        const errors: unknown[] = [];
        for (const entry of entries) {
            try { run(entry); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Shortcut effects could not be updated.');
    };
    return {
        run<T>(operation: () => T | Promise<T>): Promise<T | undefined> {
            if (paused || disposed) return Promise.resolve(undefined);
            let result: T | Promise<T>;
            try { result = operation(); } catch (error) { return Promise.reject(error); }
            const task = Promise.resolve(result).finally(() => pendingTasks.delete(task));
            pendingTasks.add(task);
            return task;
        },
        async waitForTasks() {
            await Promise.allSettled([...pendingTasks]);
        },
        register(setup: Entry['setup']) {
            if (disposed) return () => {};
            const entry: Entry = {setup};
            entries.add(entry);
            try {
                if (!paused) entry.cleanup = setup() || undefined;
            } catch (error) {
                entries.delete(entry);
                throw error;
            }
            return () => { entries.delete(entry); cleanup(entry); };
        },
        pause() {
            paused = true;
            forEach(cleanup);
        },
        resume() {
            if (disposed || !paused) return;
            paused = false;
            forEach(entry => { entry.cleanup = entry.setup() || undefined; });
        },
        dispose() {
            disposed = true;
            try { forEach(cleanup); } finally { entries.clear(); }
        },
    };
}
