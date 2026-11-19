/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy} from 'react';
import type {Plugin} from '@datavisool/sdk/plugin';
import {editorLayerDoubleClickedKey, editorSelectionChangedKey} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {editorInspectorChangedKey, type EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import {designerWorkspaceChangedKey} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {} from '@datavisool/sdk/plugin/contracts/editorShell';
import {createInspectorStore} from './InspectorStore.ts';
import {createInspectorConsumerDomain} from './consumer-domain.ts';

const aborted = () => new DOMException('属性面板读取已取消。', 'AbortError');

const waitForAbortableRead = <T,>(read: Promise<T>, signal: AbortSignal): Promise<T> => {
    if (signal.aborted) return Promise.reject(aborted());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(aborted());
        };
        signal.addEventListener('abort', onAbort, {once: true});
        read.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
};

export function createEditorInspectorPlugin(): Plugin {
    return {
        id: 'editor-inspector',
        requires: ['designerRuntime', 'editorCanvas', 'editorShell'],
        provides: [],
        activate(context) {
            const {designerRuntime, editorCanvas, editorShell} = context;
            const store = createInspectorStore();
            let active = true;
            let accepting = true;
            let lifecycleEpoch = 0;
            let dataUpdaterAbortController = new AbortController();
            let inspection: Promise<typeof import('./InspectorSelection.ts')> | undefined;
            let currentDomain: EditorInspectorDomain | undefined;
            let currentDomainController: AbortController | undefined;
            let pendingDomainController: AbortController | undefined;
            let pendingDomain: Promise<EditorInspectorDomain> | undefined;
            const pendingReads = new Set<Promise<unknown>>();
            const pendingTasks = new Set<Promise<unknown>>();
            const pendingOperations = new Set<AbortController>();

            const track = <T,>(promise: Promise<T>, pending: Set<Promise<unknown>>): Promise<T> => {
                pending.add(promise);
                const remove = () => pending.delete(promise);
                void promise.then(remove, remove);
                return promise;
            };
            const trackTask = <T,>(task: Promise<T>) => track(task, pendingTasks);
            const prepareInspection = () => {
                if (!inspection) {
                    inspection = import('./InspectorSelection.ts').catch(error => {
                        inspection = undefined;
                        throw error;
                    });
                }
                return inspection;
            };
            const prepareInspectionFor = (signal: AbortSignal) =>
                track(waitForAbortableRead(prepareInspection(), signal), pendingReads);
            const prepareDomain = () => {
                if (!active || !accepting) return Promise.reject(aborted());
                if (currentDomain?.isActive()) return Promise.resolve(currentDomain);
                if (pendingDomain) return pendingDomain;
                const requestEpoch = lifecycleEpoch;
                const requestController = new AbortController();
                pendingDomainController = requestController;
                const ownerRead = editorCanvas.prepareInspectorDomain(requestController.signal);
                const request = track(waitForAbortableRead(ownerRead, requestController.signal).then(ownerDomain => {
                    if (!active || !accepting || requestController.signal.aborted || requestEpoch !== lifecycleEpoch || !ownerDomain.isActive())
                        throw aborted();
                    const consumerDomain = createInspectorConsumerDomain(ownerDomain, {
                        isActive: () => active,
                        canEdit: () => active && accepting,
                        readSignal: () => dataUpdaterAbortController.signal,
                    });
                    currentDomain = consumerDomain;
                    currentDomainController = requestController;
                    return consumerDomain;
                }).catch(error => {
                    if (pendingDomainController === requestController) pendingDomainController = undefined;
                    throw error;
                }).finally(() => {
                    if (pendingDomain === request) pendingDomain = undefined;
                }), pendingReads);
                pendingDomain = request;
                return request;
            };
            const closePanel = (restoreFocus: boolean) => store.setContentVisible(false, restoreFocus);
            const disposeCurrentDomain = () => {
                pendingDomainController?.abort();
                currentDomainController?.abort();
                pendingDomainController = undefined;
                currentDomainController = undefined;
                pendingDomain = undefined;
                currentDomain = undefined;
            };
            const abortPendingOperations = () => {
                for (const operation of pendingOperations) operation.abort();
                pendingOperations.clear();
            };

            context.onStop({
                pause() {
                    if (!active || !accepting) return;
                    accepting = false;
                    lifecycleEpoch++;
                    store.setAccepting(false);
                    abortPendingOperations();
                    dataUpdaterAbortController.abort();
                    pendingDomainController?.abort();
                    pendingDomainController = undefined;
                    pendingDomain = undefined;
                },
                async prepare() {
                    await Promise.allSettled([...pendingReads, ...pendingTasks]);
                },
                cancel() {
                    if (!active || accepting) return;
                    accepting = true;
                    dataUpdaterAbortController = new AbortController();
                    store.setAccepting(true);
                },
            });

            context.onDispose(designerRuntime.registerHostConfigPanels({
                AnimationConfig: lazy(async () => ({default: (await import('./config-panels/AnimationConfigImpl.tsx')).default})),
                ThemeConfig: lazy(async () => ({default: (await import('./config-panels/ThemeConfigImpl.tsx')).default})),
                BaseInfo: lazy(async () => ({default: (await import('./BaseInfoImpl.tsx')).default})),
                DataConfig: lazy(async () => ({default: (await import('./config-panels/DataConfigImpl.tsx')).default})),
                FilterConfig: lazy(async () => ({default: (await import('./config-panels/FilterConfigImpl.tsx')).default})),
            }));
            store.setPanelOrderProvider(editorShell.nextPanelOpenOrder);
            context.onDispose(editorShell.registerSidePanel({
                id: 'inspector',
                side: 'right',
                readState: () => ({open: store.panelOpen, order: store.panelOpenOrder}),
                close: closePanel,
            }));
            context.onDispose(context.on(editorSelectionChangedKey, async selection => {
                if (!active || !accepting) return;
                if (selection.interaction?.kind === 'clear-inspector') {
                    store.clearTarget();
                    return;
                }
                if (!selection.interaction) return;
                const operation = new AbortController();
                pendingOperations.add(operation);
                const requestEpoch = lifecycleEpoch;
                try {
                    const [domain, {applySelectionChange}] = await Promise.all([
                        waitForAbortableRead(prepareDomain(), operation.signal),
                        prepareInspectionFor(operation.signal),
                    ]);
                    if (active && accepting && requestEpoch === lifecycleEpoch && domain.isActive())
                        applySelectionChange(selection, domain, store);
                } catch (error) {
                    if ((error as Error)?.name !== 'AbortError') throw error;
                } finally {
                    pendingOperations.delete(operation);
                }
            }));
            context.onDispose(context.on(editorLayerDoubleClickedKey, async id => {
                if (!active || !accepting) return;
                const operation = new AbortController();
                pendingOperations.add(operation);
                const requestEpoch = lifecycleEpoch;
                try {
                    const [domain, {applyCanvasDoubleClick}] = await Promise.all([
                        waitForAbortableRead(prepareDomain(), operation.signal),
                        prepareInspectionFor(operation.signal),
                    ]);
                    if (active && accepting && requestEpoch === lifecycleEpoch && domain.isActive())
                        applyCanvasDoubleClick(id, domain, store);
                } catch (error) {
                    if ((error as Error)?.name !== 'AbortError') throw error;
                } finally {
                    pendingOperations.delete(operation);
                }
            }));
            context.onDispose(context.on(editorInspectorChangedKey, change => {
                const domain = currentDomain;
                if (!active || !accepting || !domain || !domain.isActive()
                    || change.sceneIdentity !== domain.sceneIdentity || change.sceneVersion !== domain.sceneVersion) return;
                if (change.kind === 'targets-deleted') {
                    if (store.activeElem.id && change.ids.includes(store.activeElem.id)) store.clearTarget();
                } else if (change.kind === 'layers-updated') {
                    store.applyLayerUpdates(change.layers);
                } else if (store.activeElem.id && change.ids.includes(store.activeElem.id)) {
                    store.remountConfigDetailsPanel();
                }
            }));
            context.onDispose(context.on(designerWorkspaceChangedKey, () => {
                lifecycleEpoch++;
                abortPendingOperations();
                disposeCurrentDomain();
                store.resetForSceneChange();
            }));
            context.onDispose(context.editorShell.registerView('inspector', lazy(async () => {
                const {default: InspectorRoot} = await import('./InspectorRoot.tsx');
                return {default: () => <InspectorRoot prepareDomain={prepareDomain} closePanel={closePanel} store={store} trackTask={trackTask}/>};
            })));
            context.onDispose(context.editorShell.registerView('inspectorAction', lazy(async () => {
                const {default: InspectorCodeAction} = await import('./InspectorCodeAction.tsx');
                return {default: () => <InspectorCodeAction canvas={editorCanvas} prepareDomain={prepareDomain} store={store}/>};
            })));
            context.onDispose(() => {
                active = false;
                accepting = false;
                lifecycleEpoch++;
                abortPendingOperations();
                dataUpdaterAbortController.abort();
                disposeCurrentDomain();
                store.dispose();
                inspection = undefined;
            });
        },
    };
}
