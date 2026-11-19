/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Plugin} from '@datavisool/sdk/plugin';
import {DesignerMode} from '@datavisool/sdk/types';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

import EditDesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/EditDesignerLoader.ts';
import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import {createDesignerRuntimePlugin} from '@/plugins/designer-runtime/designerRuntimePlugin.ts';
import {PluginLifecycleError, Visloom} from '@/visloom/index.ts';

describe('designer runtime stop rollback', () => {
    const originalEnvironmentDescriptor = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalEnvironmentDescriptor)
            Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnvironmentDescriptor);
        else
            Reflect.deleteProperty(window, 'DATAVISOOL_ENV');
    });

    it('keeps the loaded editing scene when a later plugin withdraw rejects stop', async () => {
        const loadSpy = vi.spyOn(DesignerLoader.prototype, 'load').mockImplementation(async function (this: DesignerLoader, id: string) {
            const name = 'preserved project';
            await this.initDesignerManager({
                id,
                name,
                layerManager: {layerConfigs: {}, elemConfigs: {}},
            } as never);
            this.projectInfo = {id, name};
            (this as EditDesignerLoader).initializeRuntimeEnv(id, this.designerManager);
        });

        let failWithdraw = true;
        const withdrawFailure = new Error('later plugin withdraw failed');
        const blocker: Plugin = {
            id: 'late-withdraw-blocker',
            requires: [],
            provides: [],
            activate(context) {
                context.onStop({
                    withdraw() {
                        if (failWithdraw) {
                            failWithdraw = false;
                            throw withdrawFailure;
                        }
                    },
                });
            },
        };

        const runtime = new Visloom();
        let started = false;
        try {
            // Reverse stop order prepares the runtime before the later blocker fails.
            await runtime.start([blocker, createDesignerRuntimePlugin()]);
            started = true;
            const service = runtime.get('designerRuntime');
            const createSession = await service.prepare(DesignerMode.EDIT);
            const session = createSession();
            await session.load('project-before-stop');
            expect(loadSpy).toHaveBeenCalledOnce();
            expect(session.getSnapshot()?.id).toBe('project-before-stop');
            expect(service.readEditingScene()?.isActive()).toBe(true);

            const stop = runtime.stop();
            await expect(stop).rejects.toBeInstanceOf(PluginLifecycleError);
            // The lifecycle wrapper preserves the failing hook's original error as `cause`.
            await expect(stop).rejects.toMatchObject({
                pluginId: 'late-withdraw-blocker',
                phase: 'withdraw',
                cause: withdrawFailure,
            });

            expect(runtime.get('designerRuntime')).toBe(service);
            expect(session.getSnapshot()?.id).toBe('project-before-stop');
            expect(service.readEditingScene()?.isActive()).toBe(true);

            await runtime.stop();
            started = false;
        } finally {
            if (started) {
                try { await runtime.stop(); } catch { /* Preserve the assertion failure. */ }
            }
        }
    });
});
