/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {Plugin} from '@datavisool/sdk/plugin';
import {designerLayerModelChangedKey, designerWorkspaceChangedKey, type DesignerInspectorDomainHost, type DesignerLayerModelChangedEvent, type DesignerRuntimeMode, type DesignerSessionFactory, type DesignerWorkspaceIdentity} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {designerBlueprintChangedKey, type DesignerBlueprintChangeEvent} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {DesignerBlueprintNodeRegistry} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import type {HostConfigPanels} from '@datavisool/sdk/host';
import {registerHostConfigPanels as registerSdkHostConfigPanels} from '@datavisool/sdk/host';
import {DesignerMode} from '@datavisool/sdk/types';
import type DesignerRuntimeContext from './internal/DesignerRuntimeContext.ts';
import type {RuntimeManagedProjectSession} from './createProjectSession.ts';

function sameWorkspace(left: DesignerWorkspaceIdentity | undefined, right: DesignerWorkspaceIdentity): boolean {
    return Boolean(left && left.rootId === right.rootId && left.activeId === right.activeId
        && left.nested === right.nested
        && JSON.stringify(left.loopPath ?? []) === JSON.stringify(right.loopPath ?? []));
}

async function prepareSessionFactory(
    mode: DesignerRuntimeMode,
    runtimeContext: DesignerRuntimeContext,
    workspaceChanged: (workspace: DesignerWorkspaceIdentity) => void,
    blueprintChanged: (event: DesignerBlueprintChangeEvent) => void,
    layerChanged: (event: DesignerLayerModelChangedEvent) => void,
) {
    const {createProjectSession} = await import('./createProjectSession.ts');
    switch (mode) {
        case DesignerMode.EDIT: {
            const [{default: EditDesignerLoader}] = await Promise.all([
                import('@/plugins/designer-runtime/internal/designer/loader/EditDesignerLoader.ts'),
                import('./internal/legacy-global/ExportEditGlobalMember.ts'),
            ]);
            return () => createProjectSession(new EditDesignerLoader(mode, runtimeContext), {workspaceChanged, blueprintChanged, layerChanged});
        }
        case DesignerMode.PREVIEW: {
            const [{default: ViewDesignerLoader}] = await Promise.all([
                import('@/plugins/designer-runtime/internal/designer/loader/ViewDesignerLoader.ts'),
                import('./internal/legacy-global/ExportViewGlobalMember.ts'),
            ]);
            return () => createProjectSession(new ViewDesignerLoader(mode, runtimeContext));
        }
        case DesignerMode.RELEASE: {
            const [{default: ReleaseDesignerLoader}] = await Promise.all([
                import('@/plugins/designer-runtime/internal/designer/loader/ReleaseDesignerLoader.ts'),
                import('./internal/legacy-global/ExportViewGlobalMember.ts'),
            ]);
            return () => {
                const loader = new ReleaseDesignerLoader(mode, runtimeContext);
                return createProjectSession(loader, {setPassword: password => { loader.pwd = password ?? null; }});
            };
        }
    }
}

function createAbortError(): Error {
    return Object.assign(new Error('Designer runtime is no longer active'), {name: 'AbortError'});
}

/** 为编辑、预览和发布提供按模式加载的项目会话。 */
export function createDesignerRuntimePlugin(): Plugin {
    return {
        id: 'designer-runtime',
        requires: [],
        provides: ['designerRuntime', 'designerCatalog'],
        async activate(context) {
            const {default: DesignerRuntimeContext} = await import('./internal/DesignerRuntimeContext.ts');
            const runtimeContext = new DesignerRuntimeContext();
            const factories = new Map<DesignerRuntimeMode, Promise<DesignerSessionFactory>>();
            const sessions = new Set<RuntimeManagedProjectSession>();
            const aiRendererDisposers = new Set<() => void>();
            let catalog: Promise<DesignerCatalog> | undefined;
            let blueprintNodes: Promise<DesignerBlueprintNodeRegistry> | undefined;
            const hostPanelDisposers = new Set<() => void>();
            let generation = 0;
            let active = true;
            let paused = false;
            const ensureActive = () => {
                if (!active)
                    throw createAbortError();
            };
            const registerHostPanels = (panels: Partial<HostConfigPanels>) => {
                ensureActive();
                if (paused) throw createAbortError();
                const unregisterPanels = registerSdkHostConfigPanels(panels);
                let registered = true;
                const unregister = () => {
                    if (!registered) return;
                    registered = false;
                    hostPanelDisposers.delete(unregister);
                    unregisterPanels();
                };
                hostPanelDisposers.add(unregister);
                return unregister;
            };
            const prepareCatalog = () => {
                if (!active || paused) return Promise.reject(createAbortError());
                const requestGeneration = generation;
                catalog ??= import('./catalog.ts').then(({createDesignerCatalog}) => {
                    if (!active || paused || generation !== requestGeneration) throw createAbortError();
                    return createDesignerCatalog(runtimeContext.registry);
                }).catch(error => {
                    if (generation === requestGeneration) catalog = undefined;
                    throw error;
                });
                return catalog;
            };
            const workspaceChanged = (workspace: DesignerWorkspaceIdentity) => {
                void context.emit(designerWorkspaceChangedKey, workspace).catch(error => console.error('通知工作空间变化失败', error));
            };
            const blueprintChanged = (event: DesignerBlueprintChangeEvent) => {
                if (!active) return;
                void context.emit(designerBlueprintChangedKey, event).catch(error => console.error('通知蓝图场景变化失败', error));
            };
            const layerChanged = (event: DesignerLayerModelChangedEvent) => {
                if (!active) return;
                void context.emit(designerLayerModelChangedKey, event).catch(error => console.error('通知图层模型变化失败', error));
            };
            context.provide('designerRuntime', {
                readEditingScene() {
                    if (!active) return;
                    for (const session of sessions) {
                        const scene = session.editing?.readScene();
                        if (scene?.isActive()) return scene;
                    }
                },
                async prepareInspectorDomain(host: DesignerInspectorDomainHost, signal?: AbortSignal) {
                    ensureActive();
                    if (paused || signal?.aborted) throw createAbortError();
                    const requestGeneration = generation;
                    const manager = runtimeContext.managerStore.currentManager;
                    const managerGeneration = manager?.getRuntimeGeneration();
                    const sceneVersion = runtimeContext.managerStore.sceneVersion;
                    const session = [...sessions].find(candidate => {
                        const candidateScene = candidate.editing?.readScene();
                        return Boolean(candidateScene?.isActive() && candidateScene.version === sceneVersion);
                    });
                    const scene = session?.editing?.readScene();
                    const workspace = session?.editing?.read();
                    if (!session || !manager || !scene || !workspace || sceneVersion === undefined
                        || manager.runtimeContext !== runtimeContext
                        || scene.version !== sceneVersion
                        || !scene.isActive())
                        throw new Error('只有活动的编辑场景可以准备属性面板。');

                    const isActive = () => active && generation === requestGeneration
                        && !signal?.aborted && sessions.has(session)
                        && runtimeContext.managerStore.currentManager === manager
                        && runtimeContext.managerStore.sceneVersion === sceneVersion
                        && managerGeneration !== undefined
                        && manager.isRuntimeActive(managerGeneration)
                        && scene.version === sceneVersion && scene.isActive()
                        && sameWorkspace(session.editing?.read(), workspace);
                    const canWrite = () => isActive() && !paused && host.canWrite();
                    const [{createInspectorDomain}, componentCatalog] = await Promise.all([
                        import('./internal/inspector/createInspectorDomain.ts'),
                        prepareCatalog(),
                    ]);
                    ensureActive();
                    if (!canWrite()) throw createAbortError();
                    return createInspectorDomain({
                        sceneVersion,
                        manager,
                        scene,
                        catalog: componentCatalog,
                        signal,
                        recordChange: host.recordChange,
                        isActive,
                        canWrite,
                        emit: host.emit,
                        select: host.select,
                    });
                },
                prepare(mode) {
                    if (!active || paused)
                        return Promise.reject(createAbortError());
                    const pending = factories.get(mode);
                    if (pending) return pending;
                    const preparation = prepareSessionFactory(mode, runtimeContext, workspaceChanged, blueprintChanged, layerChanged).then(create => {
                        ensureActive();
                        return () => {
                            ensureActive();
                            if (paused) throw createAbortError();
                            const session = create();
                            sessions.add(session);
                            const closeSession = () => { sessions.delete(session); session.close(); };
                            let unregister: () => void;
                            try {
                                unregister = context.onDispose(closeSession);
                            } catch (error) {
                                closeSession();
                                throw error;
                            }
                            return {
                                ...session,
                                get loaded() { return session.loaded; },
                                get name() { return session.name; },
                                pauseForStop() { session.pauseForStop(); },
                                prepareForStop() { return session.prepareForStop(); },
                                cancelStop() { session.cancelStop(); },
                                close() {
                                    unregister();
                                    closeSession();
                                },
                            };
                        };
                    }).catch(error => {
                        if (active)
                            factories.delete(mode);
                        throw error;
                    });
                    factories.set(mode, preparation);
                    return preparation;
                },
                prepareBlueprintNodes() {
                    if (!active || paused)
                        return Promise.reject(createAbortError());
                    const requestGeneration = generation;
                    blueprintNodes ??= import('@/plugins/designer-runtime/internal/designer/blueprint/node/BlueprintNodeRegistry.ts')
                        .then(({createDesignerBlueprintNodeRegistry}) => {
                            if (!active || paused || generation !== requestGeneration)
                                throw createAbortError();
                            return createDesignerBlueprintNodeRegistry(() => active);
                        })
                        .catch(error => {
                            if (generation === requestGeneration)
                                blueprintNodes = undefined;
                            throw error;
                        });
                    return blueprintNodes;
                },
                async prepareAiDraftRenderer(scope, sceneVersion, signal, onDraftChanged) {
                    ensureActive();
                    if (paused || signal.aborted) throw createAbortError();
                    const {managerStore} = runtimeContext;
                    ensureActive();
                    if (paused || signal.aborted) throw createAbortError();
                    const session = [...sessions].find(candidate => {
                        const candidateScene = candidate.editing?.readScene();
                        return candidateScene?.version === sceneVersion && candidateScene.isActive()
                            && sameWorkspace(candidate.editing?.read(), scope);
                    });
                    const scene = session?.editing?.readScene();
                    const manager = managerStore.currentManager;
                    if (!session || !scene || !manager || scene.version !== sceneVersion
                        || !sameWorkspace(session.editing?.read(), scope) || !scene.isActive())
                        throw createAbortError();
                    const requestGeneration = generation;
                    const [{createDesignerAiDraftRenderer}, componentCatalog] = await Promise.all([
                        import('./aiDraftRenderer.ts'), prepareCatalog(),
                    ]);
                    ensureActive();
                    if (paused || signal.aborted) throw createAbortError();
                    const isActive = () => active && !paused && generation === requestGeneration && !signal.aborted
                        && sessions.has(session)
                        && managerStore.currentManager === manager
                        && managerStore.sceneVersion === sceneVersion
                        && scene.isActive()
                        && sameWorkspace(session.editing?.read(), scope);
                    if (!isActive()) throw createAbortError();
                    const renderer = createDesignerAiDraftRenderer(manager, componentCatalog, scope, scene.identity, sceneVersion, isActive, onDraftChanged);
                    let disposed = false;
                    let unregisterDispose: () => void = () => undefined;
                    const dispose = () => {
                        if (disposed) return;
                        disposed = true;
                        signal.removeEventListener('abort', dispose);
                        aiRendererDisposers.delete(dispose);
                        const unregister = unregisterDispose;
                        unregisterDispose = () => undefined;
                        unregister();
                        renderer.dispose();
                    };
                    try {
                        unregisterDispose = context.onDispose(dispose);
                    } catch (error) {
                        try { dispose(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], '注册 AI 草稿清理失败。'); }
                        throw error;
                    }
                    aiRendererDisposers.add(dispose);
                    signal.addEventListener('abort', dispose, {once: true});
                    if (signal.aborted) {
                        dispose();
                        throw createAbortError();
                    }
                    return {
                        ...renderer,
                        dispose,
                    };
                },
                registerHostConfigPanels: registerHostPanels,
            });
            context.provide('designerCatalog', {
                prepare() {
                    return prepareCatalog();
                },
            });
            const closeSessions = () => {
                const cleanupErrors: unknown[] = [];
                [...sessions].reverse().forEach(session => {
                    try { session.close(); } catch (error) { cleanupErrors.push(error); }
                });
                sessions.clear();
                if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Failed to close designer sessions.');
            };
            const disposeOwnedResources = () => {
                const cleanupErrors: unknown[] = [];
                [...aiRendererDisposers].reverse().forEach(dispose => {
                    try { dispose(); } catch (error) { cleanupErrors.push(error); }
                });
                [...hostPanelDisposers].reverse().forEach(dispose => {
                    try { dispose(); } catch (error) { cleanupErrors.push(error); }
                });
                try { closeSessions(); } catch (error) { cleanupErrors.push(error); }
                try { runtimeContext.dispose(); } catch (error) { cleanupErrors.push(error); }
                if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Designer runtime resource cleanup failed.');
            };
            context.onStop({
                pause() {
                    paused = true;
                    const errors: unknown[] = [];
                    try { runtimeContext.pauseEffects(); } catch (error) { errors.push(error); }
                    sessions.forEach(session => {
                        try { session.pauseForStop(); } catch (error) { errors.push(error); }
                    });
                    if (errors.length) throw new AggregateError(errors, 'Failed to pause designer runtime.');
                },
                async prepare() {
                    await Promise.all([...sessions].map(session => session.prepareForStop()));
                },
                cancel() {
                    if (!active) return;
                    paused = false;
                    const errors: unknown[] = [];
                    sessions.forEach(session => {
                        try { session.cancelStop(); } catch (error) { errors.push(error); }
                    });
                    try { runtimeContext.resumeEffects(); } catch (error) { errors.push(error); }
                    if (errors.length) throw new AggregateError(errors, 'Failed to resume designer runtime.');
                },
            });
            context.onDispose(() => {
                active = false;
                generation += 1;
                factories.clear();
                catalog = undefined;
                blueprintNodes = undefined;
                disposeOwnedResources();
            });
        },
    };
}
