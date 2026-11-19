/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export interface LazyCanvasRuntimeControls {
    pause?(): void;
    prepare?(): Promise<void>;
    cancel?(): void;
    withdraw?(): void;
    dispose?(): void | Promise<void>;
}

export function createLazyCanvasRuntime<Module, Runtime extends LazyCanvasRuntimeControls>(
    loadModule: () => Promise<Module>,
    createRuntime: (module: Module) => Runtime,
) {
    let active = true;
    let paused = false;
    let generation = 0;
    let runtime: Runtime | undefined;
    let pending: {readonly generation: number; readonly promise: Promise<Runtime>} | undefined;
    const pendingTasks = new Set<Promise<Runtime>>();
    let revision = 0;
    const listeners = new Set<() => void>();

    const notify = () => {
        revision += 1;
        for (const listener of [...listeners]) {
            try { listener(); } catch (error) { console.error('通知画布懒加载状态失败', error); }
        }
    };
    const isAbort = (error: unknown) => typeof error === 'object' && error !== null
        && (error as {name?: unknown}).name === 'AbortError';
    const abortError = () => new DOMException('画布运行时初始化已暂停或停用。', 'AbortError');

    const ensure = (): Promise<Runtime> => {
        if (!active || paused) return Promise.reject(abortError());
        if (runtime) return Promise.resolve(runtime);
        if (pending?.generation === generation) return pending.promise;
        const token = generation;
        let promise!: Promise<Runtime>;
        promise = Promise.resolve().then(loadModule).then(module => {
            if (!active || paused || token !== generation) throw abortError();
            const created = createRuntime(module);
            if (!active || paused || token !== generation) {
                try { created.dispose?.(); }
                finally { throw abortError(); }
            }
            runtime = created;
            notify();
            return created;
        }).catch(error => {
            if (pending?.promise === promise) pending = undefined;
            throw error;
        }).finally(() => pendingTasks.delete(promise));
        pending = {generation: token, promise};
        pendingTasks.add(promise);
        return promise;
    };

    return {
        ensure,
        get current() { return runtime; },
        get isActive() { return active; },
        get isPaused() { return paused; },
        getRevision: () => revision,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        pause() {
            if (!active || paused) return;
            paused = true;
            generation += 1;
            runtime?.pause?.();
            notify();
        },
        async prepare() {
            while (pendingTasks.size > 0) await Promise.allSettled([...pendingTasks]);
            await runtime?.prepare?.();
        },
        cancel() {
            if (!active || !paused) return;
            paused = false;
            generation += 1;
            runtime?.cancel?.();
            notify();
        },
        withdraw() {
            if (!active || paused) return;
            paused = true;
            generation += 1;
            runtime?.withdraw?.();
            notify();
        },
        async dispose() {
            if (!active) return;
            active = false;
            paused = true;
            generation += 1;
            notify();
            while (pendingTasks.size > 0) await Promise.allSettled([...pendingTasks]);
            const ownedRuntime = runtime;
            runtime = undefined;
            listeners.clear();
            if (ownedRuntime) await ownedRuntime.dispose?.();
        },
        isAbort,
    };
}
