/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {describe, expect, it, vi} from 'vitest';
import {createLazyCanvasRuntime} from '@/plugins/editor-canvas/lazyCanvasRuntime.ts';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

describe('editor canvas lazy runtime', () => {
    it('does not load until requested and retries after an import failure', async () => {
        const module = {version: 'runtime-module'};
        const loadModule = vi.fn()
            .mockRejectedValueOnce(new Error('chunk unavailable'))
            .mockResolvedValueOnce(module);
        const created = {dispose: vi.fn()};
        const createRuntime = vi.fn(() => created);
        const loader = createLazyCanvasRuntime(loadModule, createRuntime);

        expect(loadModule).not.toHaveBeenCalled();
        await expect(loader.ensure()).rejects.toThrow('chunk unavailable');
        expect(createRuntime).not.toHaveBeenCalled();

        await expect(loader.ensure()).resolves.toBe(created);
        expect(loadModule).toHaveBeenCalledTimes(2);
        expect(createRuntime).toHaveBeenCalledOnce();
        await loader.dispose();
        expect(created.dispose).toHaveBeenCalledOnce();
    });

    it('does not create a runtime when an import resolves after pause, and retries after cancel', async () => {
        const first = deferred<{attempt: number}>();
        const second = {attempt: 2};
        const loadModule = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
        const created = {pause: vi.fn(), cancel: vi.fn(), dispose: vi.fn()};
        const createRuntime = vi.fn(() => created);
        const loader = createLazyCanvasRuntime(loadModule, createRuntime);
        const staleInitialization = loader.ensure();

        loader.pause();
        const preparation = loader.prepare();
        first.resolve({attempt: 1});
        await expect(staleInitialization).rejects.toMatchObject({name: 'AbortError'});
        await preparation;
        expect(createRuntime).not.toHaveBeenCalled();

        loader.cancel();
        await expect(loader.ensure()).resolves.toBe(created);
        expect(loadModule).toHaveBeenCalledTimes(2);
        expect(createRuntime).toHaveBeenCalledOnce();
        expect(created.cancel).not.toHaveBeenCalled();
        await loader.dispose();
    });

    it('waits for a late import on dispose without creating its runtime', async () => {
        const first = deferred<{attempt: number}>();
        const loadModule = vi.fn().mockReturnValueOnce(first.promise);
        const created = {pause: vi.fn(), cancel: vi.fn(), dispose: vi.fn()};
        const createRuntime = vi.fn(() => created);
        const loader = createLazyCanvasRuntime(loadModule, createRuntime);
        const staleInitialization = loader.ensure();
        let disposed = false;
        const cleanup = loader.dispose().then(() => { disposed = true; });

        expect(disposed).toBe(false);
        first.resolve({attempt: 1});
        await expect(staleInitialization).rejects.toMatchObject({name: 'AbortError'});
        await cleanup;

        expect(disposed).toBe(true);
        expect(createRuntime).not.toHaveBeenCalled();
        expect(created.dispose).not.toHaveBeenCalled();
    });

    it('keeps the same runtime instance while paused, then disposes it once', async () => {
        const module = {attempt: 1};
        const loadModule = vi.fn().mockResolvedValue(module);
        const runtime = {pause: vi.fn(), cancel: vi.fn(), withdraw: vi.fn(), dispose: vi.fn()};
        const createRuntime = vi.fn(() => runtime);
        const loader = createLazyCanvasRuntime(loadModule, createRuntime);
        await loader.ensure();

        loader.pause();
        expect(loader.current).toBe(runtime);
        expect(runtime.pause).toHaveBeenCalledOnce();
        loader.cancel();
        expect(loader.current).toBe(runtime);
        expect(runtime.cancel).toHaveBeenCalledOnce();

        loader.withdraw();
        expect(loader.current).toBe(runtime);
        expect(runtime.withdraw).toHaveBeenCalledOnce();
        await loader.dispose();
        expect(runtime.dispose).toHaveBeenCalledOnce();
    });

    it('does not return an existing runtime while paused or disposed and recognizes cross-realm abort errors', async () => {
        const runtime = {pause: vi.fn(), cancel: vi.fn(), dispose: vi.fn()};
        const loader = createLazyCanvasRuntime(async () => ({}), () => runtime);
        await loader.ensure();
        loader.pause();
        await expect(loader.ensure()).rejects.toMatchObject({name: 'AbortError'});
        expect(loader.current).toBe(runtime);
        loader.cancel();
        await loader.dispose();
        await expect(loader.ensure()).rejects.toMatchObject({name: 'AbortError'});
        expect(loader.isAbort({name: 'AbortError'})).toBe(true);
    });
});
