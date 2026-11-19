/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {
    EditorInspectorController,
    EditorInspectorDomain,
} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {ComponentDataUpdater, HostDataUpdaterOptions} from '@datavisool/sdk/core';

export interface InspectorConsumerGate {
    isActive(): boolean;
    canEdit(): boolean;
    readSignal?(): AbortSignal;
}

function linkAbortSignals(signals: readonly (AbortSignal | undefined)[]) {
    const controller = new AbortController();
    const listeners: Array<{signal: AbortSignal; listener: () => void}> = [];
    let disposed = false;
    const abort = () => {
        if (!controller.signal.aborted) controller.abort();
    };
    signals.forEach(signal => {
        if (!signal) return;
        if (signal.aborted) {
            abort();
            return;
        }
        const listener = () => abort();
        signal.addEventListener('abort', listener, {once: true});
        listeners.push({signal, listener});
        if (signal.aborted) abort();
    });
    return {
        signal: controller.signal,
        abort,
        dispose() {
            if (disposed) return;
            disposed = true;
            listeners.forEach(({signal, listener}) => signal.removeEventListener('abort', listener));
            listeners.length = 0;
        },
    };
}

/** Keeps the canvas-owned domain readable while preventing this inspector activation from writing during stop. */
export function createInspectorConsumerDomain(
    owner: EditorInspectorDomain,
    gate: InspectorConsumerGate,
): EditorInspectorDomain {
    const current = () => gate.isActive() && owner.isActive();
    const canWrite = () => current() && gate.canEdit();
    const createControllerFacade = (id: string, statusId?: string | null): EditorInspectorController | undefined => {
        const facade = owner.createControllerFacade(id, statusId);
        if (!facade) return;
        const createHostDataUpdater = (
            success: (data?: any) => void,
            fail: () => void,
            options?: HostDataUpdaterOptions,
        ): ComponentDataUpdater | null => {
            const createUpdater = facade.createHostDataUpdater;
            if (typeof createUpdater !== 'function' || !canWrite() || !facade.isCurrent()) return null;
            const linked = linkAbortSignals([gate.readSignal?.(), options?.signal]);
            let disposed = false;
            const cleanup = () => {
                if (disposed) return;
                disposed = true;
                linked.dispose();
                options?.onDispose?.();
            };
            let updater: ComponentDataUpdater | null;
            try {
                updater = createUpdater.call(facade, success, fail, {
                    signal: linked.signal,
                    onDispose: cleanup,
                });
            } catch (error) {
                cleanup();
                throw error;
            }
            if (!updater) {
                cleanup();
                return null;
            }

            const destroy = updater.destroy.bind(updater);
            const guarded: ComponentDataUpdater = {
                run(config, singleTrigger) {
                    if (!disposed && !linked.signal.aborted) updater?.run(config, singleTrigger);
                },
                pauseRuntimeEffects() {
                    if (!disposed) updater?.pauseRuntimeEffects?.();
                },
                resumeRuntimeEffects() {
                    if (!disposed && !linked.signal.aborted) updater?.resumeRuntimeEffects?.();
                },
                destroy() {
                    if (disposed) return;
                    const errors: unknown[] = [];
                    try { destroy(); } catch (error) { errors.push(error); }
                    try { cleanup(); } catch (error) { errors.push(error); }
                    if (errors.length) throw new AggregateError(errors, 'Failed to dispose an inspector data updater.');
                },
            };
            return guarded;
        };
        const consumerFacade: EditorInspectorController = {
            get config() { return facade.config; },
            getConfig: () => facade.getConfig(),
            isCurrent: () => current() && facade.isCurrent(),
            update: (config, options) => {
                if (canWrite() && facade.isCurrent()) facade.update(config, options);
            },
            changeData: data => {
                if (canWrite() && facade.isCurrent()) facade.changeData(data);
            },
            createHostDataUpdater,
            renameLayer: name => canWrite() && facade.isCurrent() && facade.renameLayer(name),
        };
        return Object.freeze(consumerFacade);
    };

    const domain: EditorInspectorDomain = {
        sceneIdentity: owner.sceneIdentity,
        sceneVersion: owner.sceneVersion,
        isActive: current,
        readTarget: (id: string) => current() ? owner.readTarget(id) : undefined,
        createControllerFacade,
        readStatuses: (id: string) => current() ? owner.readStatuses(id) : undefined,
        applyStatusChange: (id, change) => canWrite() && owner.applyStatusChange(id, change),
        applyLayerEdit: (id, edit) => canWrite() && owner.applyLayerEdit(id, edit),
        resetConfig: (id, statusId) => canWrite() && owner.resetConfig(id, statusId),
        readDataSourceContext: id => current() ? owner.readDataSourceContext(id) : undefined,
        prepareDataSourceTest: (id, kind, config) => canWrite() ? owner.prepareDataSourceTest(id, kind, config) : undefined,
        applyTheme: (id, theme) => canWrite() && owner.applyTheme(id, theme),
        applyFilter: (id, filter) => canWrite() && owner.applyFilter(id, filter),
    };
    return Object.freeze(domain);
}
