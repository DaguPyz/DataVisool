/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {lazy, useEffect, type ReactNode} from 'react';
import {observable, runInAction} from 'mobx';
import {IdGenerate} from '@datavisool/sdk';
import {cloneDeep} from 'lodash';
import type {PluginContext} from '@datavisool/sdk/plugin';
import {
    editorAiDraftChangedKey, editorLayerDoubleClickedKey, editorLayerUiEventKey, editorSelectionChangedKey,
    type EditorAiCanvasSnapshot, type EditorAiEditingSession,
    type EditorCanvasRepairService, type EditorCanvasService, type EditorLayerDomain,
    type EditorLayerUiEvent, type EditorSelection,
} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {
    editorInspectorChangedKey, type EditorInspectorChange, type EditorInspectorChangeDetail,
    type EditorInspectorDomain,
} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {EditorCanvasProps} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {EditorCanvasContribution} from '@datavisool/sdk/plugin/contracts/editorShell';
import type {} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {} from '@datavisool/sdk/plugin/contracts/editorCommands';
import {
    designerLayerModelChangedKey, designerWorkspaceChangedKey,
    type DesignerAiDraftChange, type DesignerAiDraftRenderer,
    type DesignerEditingScene, type DesignerProjectSession, type DesignerWorkspaceIdentity,
} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {ILayerItem} from '@datavisool/sdk/types';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';
import {createUndoRedoMap} from '@/plugins/editor-canvas/history/core/index.ts';
import {createLegacyCanvasModelAdapter} from '@/plugins/editor-canvas/history/LegacyCanvasModelAdapter.ts';
import {CanvasContextMenuStore} from '@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts';
import {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';
import {ViewportStore} from '@/plugins/editor-canvas/viewport/ViewportStore.ts';
import {EditorCanvasActivationState} from '@/plugins/editor-canvas/state/EditorCanvasActivationState.ts';
import {EditorCanvasSceneStore} from '@/plugins/editor-canvas/state/CanvasSceneStore.ts';
import {
    isSceneModelChangeForScene,
    recordSceneModelChange,
    rollbackUnrecordedSceneModelChange,
} from '@/plugins/editor-canvas/state/SceneModelChangeGuard.ts';
import {createSelectionCommands} from '@/plugins/editor-canvas/selection/SelectionCommands.ts';
import {createCanvasActions} from '@/plugins/editor-canvas/commands/CanvasActions.ts';
import type {LegacyCanvasCommands} from '@/plugins/editor-canvas/selection/LegacyCanvasSelection.ts';
import {registerCanvasCommands} from './canvasCommands.ts';
import type {EditorCanvasShortcutInput} from './shortcutInput.ts';
import {EditorCanvasActivationProvider, type EditorCanvasActivation} from './EditorCanvasActivationContext.tsx';

const deepFreeze = <T,>(value: T, seen = new WeakSet<object>()): T => {
    if (!value || typeof value !== 'object' || seen.has(value as object)) return value;
    seen.add(value as object);
    Object.values(value as Record<string, unknown>).forEach(item => deepFreeze(item, seen));
    return Object.freeze(value);
};

const sameWorkspace = (left: DesignerWorkspaceIdentity | undefined, right: DesignerWorkspaceIdentity | undefined) => Boolean(
    left && right && left.rootId === right.rootId && left.activeId === right.activeId && left.nested === right.nested
    && JSON.stringify(left.loopPath ?? []) === JSON.stringify(right.loopPath ?? []),
);

const abortError = (message: string) => new DOMException(message, 'AbortError');

export interface EditorCanvasRuntime {
    readonly service: EditorCanvasService;
    readonly contribution: EditorCanvasContribution;
    pause(): void;
    prepare(): Promise<void>;
    cancel(): void;
    withdraw(): void;
    dispose(): void;
}

/** Construct the full edit runtime only after the editor canvas is requested. */
export function createEditorCanvasRuntime(context: PluginContext, shortcutInput: EditorCanvasShortcutInput): EditorCanvasRuntime {
    const cleanups: Array<() => void> = [];
    try {
        return createEditorCanvasRuntimeImpl(context, shortcutInput, cleanups);
    } catch (error) {
        const cleanupErrors: unknown[] = [];
        for (const cleanup of [...cleanups].reverse()) {
            try { cleanup(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
        }
        cleanups.length = 0;
        if (cleanupErrors.length)
            throw new AggregateError([error, ...cleanupErrors], '初始化画布运行时失败并且清理部分资源时出错。');
        throw error;
    }
}

function createEditorCanvasRuntimeImpl(
    context: PluginContext,
    shortcutInput: EditorCanvasShortcutInput,
    cleanups: Array<() => void>,
): EditorCanvasRuntime {
    let pluginActive = true;
    let disposed = false;
    const lifecycle = new EditorCanvasActivationState();
    const pendingTasks = new Set<Promise<unknown>>();
    const own = (cleanup: () => void) => { cleanups.push(cleanup); return cleanup; };
    const trackTask = <T,>(task: Promise<T>): Promise<T> => {
        pendingTasks.add(task);
        void task.then(() => pendingTasks.delete(task), () => pendingTasks.delete(task));
        return task;
    };
    let repairPreparation: {
        readonly scene: DesignerEditingScene;
        readonly sceneIdentity: object;
        readonly sceneVersion: number;
        readonly promise: Promise<EditorCanvasRepairService>;
    } | undefined;
    let inspectorPreparation: {readonly scene: DesignerEditingScene; readonly sceneVersion: number; readonly pending: Promise<EditorInspectorDomain>} | undefined;
    let activeProject: DesignerProjectSession | undefined;
    let boundScene: DesignerEditingScene | undefined;
    let boundSceneVersion = -1;
    let selectionSceneVersion = -1;
    let sceneStore: EditorCanvasSceneStore;
    let readTemplateSnapshot: typeof import('./selectionTemplateSnapshot.ts').readSelectionTemplateSnapshot | undefined;
    let resolveDrop: typeof import('./viewport/ArtboardDropTarget.ts').getMainCanvasDropPoint | undefined;
    type AiEditingSessionOwner = {
        readonly project: DesignerProjectSession;
        readonly scene: DesignerEditingScene;
        readonly sceneIdentity: object;
        readonly sceneVersion: number;
        readonly scope: DesignerWorkspaceIdentity;
    };
    const aiEditingSessions = new Set<EditorAiEditingSession>();
    const aiEditingSessionOwners = new WeakMap<EditorAiEditingSession, AiEditingSessionOwner>();

    const selection = observable.box<EditorSelection>({ids: Object.freeze([]), source: 'system'}, {deep: false});
    const auxiliaryBorder = observable.box(false);
    const readSelection = () => selection.get();
    const isActive = () => Boolean(pluginActive && boundScene
        && boundScene.isActive()
        && boundScene.version === boundSceneVersion
        && activeProject?.editing?.readScene() === boundScene);
    const canEdit = () => lifecycle.canEdit(isActive);
    const readScene = (): DesignerEditingScene | undefined => isActive() ? boundScene : undefined;
    const readWorkspace = (): DesignerWorkspaceIdentity | undefined => isActive() ? activeProject?.editing?.read() : undefined;
    const disposeAiEditingSessions = (
        shouldDispose: (owner: AiEditingSessionOwner) => boolean = () => true,
    ) => {
        const errors: unknown[] = [];
        for (const session of [...aiEditingSessions]) {
            const owner = aiEditingSessionOwners.get(session);
            if (owner && !shouldDispose(owner)) continue;
            try { session.dispose(); }
            catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, '释放 AI 画布会话失败。');
    };
    const bindProject = (project: DesignerProjectSession | undefined) => {
        activeProject = project;
        boundScene = project?.editing?.readScene();
        boundSceneVersion = boundScene?.version ?? -1;
        selectionSceneVersion = boundSceneVersion;
        try {
            disposeAiEditingSessions(owner => owner.project !== project || owner.scene !== boundScene
                || owner.sceneIdentity !== boundScene?.identity || owner.sceneVersion !== boundScene?.version
                || !sameWorkspace(owner.scope, project?.editing?.read()) || !owner.scene.isActive());
        } catch (error) { console.error('释放失效 AI 画布会话失败', error); }
        sceneStore?.refresh();
    };
    sceneStore = new EditorCanvasSceneStore(readScene, isActive, canEdit);
    const emitLayerUi = (event: EditorLayerUiEvent) => {
        const scene = readScene();
        if (!scene || event.sceneVersion !== scene.version) return;
        void context.emit(editorLayerUiEventKey, event)
            .catch(error => console.error('通知图层面板变化失败', error));
    };
    const emitInspector = (change: EditorInspectorChangeDetail) => {
        const scene = readScene();
        if (!scene?.identity) return;
        const snapshot = deepFreeze({
            ...cloneDeep(change),
            sceneIdentity: scene.identity,
            sceneVersion: scene.version,
        } as EditorInspectorChange);
        void context.emit(editorInspectorChangedKey, snapshot)
            .catch(error => console.error('通知属性面板变化失败', error));
    };

    const viewportStore = new ViewportStore(canEdit);
    const contextMenuStore = new CanvasContextMenuStore(canEdit);
    const history = new HistoryOperator(
        () => readSelection().ids,
        () => {
            sceneStore.refresh();
            const scene = readScene();
            if (scene) emitLayerUi({kind: 'refresh', sceneVersion: scene.version});
        },
        canEdit,
    );
    const eventOperateStore = new EventOperateStore({
        history,
        contextMenu: contextMenuStore,
        isActive: canEdit,
        readScene,
        readLegacyModel() {
            const snapshot = readScene()?.layers.read();
            return snapshot ? createLegacyCanvasModelAdapter(snapshot).manager : undefined;
        },
        readLayerConfigs: () => ({...sceneStore.readLayerConfigs()}),
        readSelection,
        writeSelection(next) {
            const scene = readScene();
            if (!canEdit() || !scene) return;
            const snapshot = Object.freeze({ids: Object.freeze([...next.ids]), source: next.source});
            runInAction(() => selection.set(snapshot));
            const interaction = next.interaction && Object.freeze({...next.interaction});
            void context.emit(editorSelectionChangedKey, Object.freeze({...snapshot, interaction}))
                .catch(error => console.error('通知画布选区变化失败', error));
        },
        publishLayerUi: emitLayerUi,
        publishInspector: emitInspector,
    });
    const historyProxy = new HistoryRecordOperateProxy({eventOperateStore, history, readScene, isActive: canEdit});
    const undoRedoMap = createUndoRedoMap(eventOperateStore);
    const selectionCommands = createSelectionCommands({eventOperateStore, historyProxy, readScene, isActive: canEdit, trackTask});
    const createLoopContainer = () => {
        const scene = readScene();
        if (!canEdit() || !scene) return;
        const pending = context.designerCatalog.prepare().then(catalog => {
            if (!canEdit() || readScene() !== scene) return;
            const component = catalog.getComponent('LoopContainer');
            const config = catalog.createInitialConfig('LoopContainer');
            const canvasConfig = sceneStore.readCanvasConfig();
            if (!component || !config || !canvasConfig) return;
            const configBase = config.base;
            if (!configBase || typeof configBase !== 'object') return;
            const width = 640;
            const height = 400;
            const id = IdGenerate.generateId();
            config.base = {...configBase, id, name: '循环容器', type: 'LoopContainer'};
            const layer: ILayerItem = {
                id,
                name: '循环容器',
                type: 'LoopContainer',
                width,
                height,
                x: (canvasConfig.width ?? 0) / 2 - width / 2,
                y: (canvasConfig.height ?? 0) / 2 - height / 2,
                lock: false,
                hide: false,
                rotate: 0,
            };
            canvas.insertLayer(layer, config);
            if (canEdit() && readScene() === scene) eventOperateStore.setTargetIds([id], 'system');
        });
        void trackTask(pending).catch(error => console.error('新建循环容器失败', error));
    };
    const toggleAuxiliaryBorder = () => {
        if (canEdit()) runInAction(() => auxiliaryBorder.set(!auxiliaryBorder.get()));
    };
    const actions = createCanvasActions({
        viewportStore, eventOperateStore, historyProxy, selectionCommands, readScene, isActive: canEdit,
        createLoopContainer, toggleAuxiliaryBorder,
    });
    const legacyCommands: LegacyCanvasCommands = {
        select(ids, source, interaction) { eventOperateStore.setTargetIds(ids, source, interaction); },
        getLayerType(id) { return sceneStore.readLayerConfigs()[id]?.type; },
        focus() { if (canEdit()) eventOperateStore.focusDesignerCanvas(); },
        insertLayer(layer, config) {
            if (!canEdit() || !layer.id) return;
            eventOperateStore.setAddRecordCompId(layer.id);
            try { historyProxy.doAdd(layer, config); }
            finally { eventOperateStore.setAddRecordCompId(null); }
        },
        insertTemplate(template) { if (canEdit()) historyProxy.doUseTemplate(template); },
        insertTemplateAtomically(template, requiredSourceIds) {
            if (!canEdit()) return undefined;
            return historyProxy.doUseTemplateAtomically(template, requiredSourceIds);
        },
        renameLayer(id, name, sceneVersion) { return canvas.renameLayer(id, name, sceneVersion); },
        applyHistory(record, direction) {
            if (!canEdit()) return;
            for (const operation of record.actions)
                undoRedoMap.get(operation.type)?.[direction](operation);
        },
    };

    const activation: EditorCanvasActivation = {
        eventOperateStore, contextMenuStore, viewportStore, history, historyProxy,
        legacyCommands, selectionCommands, actions, sceneStore,
        isActive, canEdit, readWorkspace, readScene,
        readAuxiliaryBorder: () => auxiliaryBorder.get(),
    };

    const canvas: EditorCanvasService = {
        readInputContext() {
            return Object.freeze({
                pointerTarget: isActive() ? contextMenuStore.pointerTarget : null,
                contextMenuOpen: isActive() && contextMenuStore.canvasMenuVisible,
            });
        },
        closeContextMenu() { if (isActive()) contextMenuStore.updateCanvasMenuVisible(false); },
        registerShortcutInput: shortcutInput.register,
        prepareInspectorDomain(signal?: AbortSignal) {
            const scene = readScene();
            if (signal?.aborted)
                return Promise.reject(new DOMException('属性面板消费者已停止。', 'AbortError'));
            if (!scene || !canEdit())
                return Promise.reject(new Error('只有可编辑的活动场景可以读取属性面板数据。'));
            const sceneVersion = scene.version;
            if (!signal && inspectorPreparation?.scene === scene && inspectorPreparation.sceneVersion === sceneVersion)
                return inspectorPreparation.pending;
            const domainIsActive = () => !signal?.aborted && isActive()
                && readScene() === scene && scene.version === sceneVersion;
            const domainCanWrite = () => canEdit() && domainIsActive();
            const pending = trackTask(context.designerRuntime.prepareInspectorDomain({
                canWrite: domainCanWrite,
                recordChange(change) {
                    if (!domainCanWrite() || !isSceneModelChangeForScene(scene, change)
                        || change.sceneVersion !== sceneVersion) {
                        rollbackUnrecordedSceneModelChange(change);
                        return false;
                    }
                    return recordSceneModelChange(change, item => history.recordChange(item));
                },
                emit(change) {
                    if (domainCanWrite() && change.sceneIdentity === scene.identity)
                        void context.emit(editorInspectorChangedKey, change)
                        .catch(error => console.error('通知属性面板变化失败', error));
                },
                select(ids) {
                    if (domainCanWrite()) eventOperateStore.setTargetIds(ids, 'layer-list');
                },
            }, signal).then(domain => {
                if (!domainIsActive()) throw new DOMException('属性面板场景已切换、暂停或消费者已停止。', 'AbortError');
                return domain;
            }).catch(error => {
                if (!signal && inspectorPreparation?.pending === pending) inspectorPreparation = undefined;
                throw error;
            }));
            if (!signal) inspectorPreparation = {scene, sceneVersion, pending};
            return pending;
        },
        prepareLayerDomain(signal?: AbortSignal): Promise<EditorLayerDomain> {
            const scene = readScene();
            if (signal?.aborted)
                return Promise.reject(new DOMException('图层面板消费者已停止。', 'AbortError'));
            if (!scene || !canEdit())
                return Promise.reject(new Error('只有可编辑的活动场景可以读取图层数据。'));
            const sceneVersion = scene.version;
            const domainIsActive = () => canEdit() && !signal?.aborted
                && readScene() === scene && scene.version === sceneVersion;
            return trackTask(import('./layer-domain.ts').then(({createEditorLayerDomain}) => {
                if (!domainIsActive()) throw new DOMException('图层场景已切换、暂停或消费者已停止。', 'AbortError');
                return createEditorLayerDomain({scene, history: historyProxy, isActive: domainIsActive});
            }));
        },
        readSelection,
        readAiWorkspace(): EditorAiCanvasSnapshot | undefined {
            const project = activeProject;
            const scene = readScene();
            const scope = readWorkspace();
            if (!canEdit() || !project || !scene?.identity || !scope || !scene.isActive()) return;
            const snapshot = scene.layers.read();
            if (!snapshot || snapshot.sceneIdentity !== scene.identity || snapshot.sceneVersion !== scene.version) return;
            const components = Object.values(snapshot.layers).flatMap(layer => {
                if (!layer?.id) return [];
                const rawConfig = snapshot.configs[layer.id];
                const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
                    ? cloneDeep(rawConfig as Record<string, unknown>)
                    : undefined;
                return [deepFreeze({
                    id: layer.id,
                    type: layer.type,
                    name: layer.name,
                    layer: cloneDeep(layer) as Record<string, unknown>,
                    ...(config ? {config} : {}),
                })];
            });
            const rawWidth = Number(snapshot.canvas?.width);
            const rawHeight = Number(snapshot.canvas?.height);
            const scopeSnapshot = deepFreeze({...scope, loopPath: [...(scope.loopPath ?? [])]});
            return deepFreeze({
                sceneVersion: scene.version,
                scope: scopeSnapshot,
                managerId: scopeSnapshot.loopPath?.[scopeSnapshot.loopPath.length - 1] ?? scopeSnapshot.activeId,
                width: Number.isFinite(rawWidth) ? rawWidth : 0,
                height: Number.isFinite(rawHeight) ? rawHeight : 0,
                components,
            });
        },
        async prepareAiEditing(scope, signal) {
            const pending = (async (): Promise<EditorAiEditingSession> => {
                const project = activeProject;
                const scene = readScene();
                const workspace = readWorkspace();
                if (signal.aborted || !canEdit() || !project || !scene?.identity || !workspace
                    || !scene.isActive() || !sameWorkspace(workspace, scope))
                    throw abortError('AI 编辑工作空间不可用或已切换。');

                const sceneIdentity = scene.identity;
                const sceneVersion = scene.version;
                const scopeSnapshot = deepFreeze({...scope, loopPath: [...(scope.loopPath ?? [])]});
                const isSceneActive = () => pluginActive && activeProject === project
                    && project.editing?.readScene() === scene
                    && scene.identity === sceneIdentity && scene.version === sceneVersion && scene.isActive()
                    && sameWorkspace(project.editing?.read(), scopeSnapshot);
                const isActive = () => canEdit() && !signal.aborted && isSceneActive();
                let renderer: DesignerAiDraftRenderer | undefined;
                let session: EditorAiEditingSession | undefined;
                let exposedSession: EditorAiEditingSession | undefined;
                let disposed = false;
                let rendererDisposed = false;
                const disposeRenderer = () => {
                    if (!renderer || rendererDisposed) return;
                    renderer.dispose();
                    rendererDisposed = true;
                };
                const dispose = () => {
                    if (disposed) return;
                    disposed = true;
                    signal.removeEventListener('abort', onAbort);
                    if (exposedSession) {
                        aiEditingSessions.delete(exposedSession);
                        aiEditingSessionOwners.delete(exposedSession);
                    }
                    if (!session) {
                        disposeRenderer();
                        return;
                    }
                    try {
                        session.dispose();
                        rendererDisposed = true;
                    } catch (error) {
                        try { disposeRenderer(); }
                        catch (rendererError) {
                            throw new AggregateError([error, rendererError], '释放 AI 会话和草稿渲染器失败。');
                        }
                        throw error;
                    }
                };
                const onAbort = () => {
                    try { dispose(); }
                    catch (error) { console.error('取消 AI 画布会话时释放资源失败', error); }
                };
                signal.addEventListener('abort', onAbort, {once: true});
                if (signal.aborted) {
                    dispose();
                    throw abortError('AI 编辑请求已取消。');
                }

                try {
                    renderer = await context.designerRuntime.prepareAiDraftRenderer(
                        scopeSnapshot,
                        sceneVersion,
                        signal,
                        (change: DesignerAiDraftChange) => {
                            if (!canEdit() || signal.aborted || !isSceneActive()
                                || change.sceneVersion !== sceneVersion
                                || !sameWorkspace(change.scope, scopeSnapshot)) return;
                            void context.emit(editorAiDraftChangedKey, change)
                                .catch(error => console.error('通知 AI 草稿变化失败', error));
                        },
                    );
                    if (disposed) {
                        disposeRenderer();
                        throw abortError('AI 编辑请求已取消。');
                    }
                    if (!isActive() || !renderer.isActive()) {
                        dispose();
                        throw abortError('AI 编辑工作空间在初始化期间已失效。');
                    }

                    const {createAiEditingSession} = await import('./aiEditing.ts');
                    if (disposed || !isActive() || !renderer.isActive()) {
                        dispose();
                        throw abortError('AI 编辑工作空间在初始化期间已失效。');
                    }
                    session = createAiEditingSession({
                        scene,
                        scope: scopeSnapshot,
                        isActive,
                        isSceneActive,
                        readSelection: () => isActive()
                            ? readSelection()
                            : {ids: Object.freeze([]), source: 'system'},
                        recordChange: change => canvas.recordChange(change),
                        draftRenderer: renderer,
                        insertTemplateAtomically: (template, requiredSourceIds) =>
                            canvas.insertTemplateAtomically(template, requiredSourceIds),
                    });
                    exposedSession = {...session, dispose};
                    aiEditingSessions.add(exposedSession);
                    aiEditingSessionOwners.set(exposedSession, {
                        project,
                        scene,
                        sceneIdentity,
                        sceneVersion,
                        scope: scopeSnapshot,
                    });
                    if (!isActive()) {
                        dispose();
                        throw abortError('AI 编辑工作空间在初始化期间已失效。');
                    }
                    return exposedSession;
                } catch (error) {
                    if (!disposed) dispose();
                    throw error;
                }
            })();
            return trackTask(pending);
        },
        isSceneActive(sceneVersion) {
            const scene = readScene();
            return Boolean(scene && scene.version === sceneVersion);
        },
        async performAction(action) {
            const scene = readScene();
            if (!canEdit() || !scene) return;
            actions[action]();
            if (readScene() === scene) emitLayerUi({kind: 'refresh', sceneVersion: scene.version});
        },
        async paste(data) {
            const scene = readScene();
            if (!canEdit() || !scene) return;
            actions.doPaste(data);
            if (readScene() === scene) emitLayerUi({kind: 'refresh', sceneVersion: scene.version});
        },
        readSelectionTemplate() {
            if (!readScene()) return undefined;
            return readTemplateSnapshot?.(readSelection(), selectionSceneVersion, readScene());
        },
        select(ids, source, interaction) { legacyCommands.select(ids, source, interaction); },
        getLayerType(id) { return legacyCommands.getLayerType(id); },
        focus() { legacyCommands.focus(); },
        resolveDrop(event) {
            const surface = document.getElementById('designer-ds-content');
            const config = sceneStore.readCanvasConfig();
            if (!canEdit() || !surface || !config || !resolveDrop) return null;
            return resolveDrop({x: event.clientX, y: event.clientY}, surface, viewportStore.camera, config, event.target);
        },
        insertLayer(layer, config) {
            legacyCommands.insertLayer(layer, config);
            const scene = readScene();
            if (scene) emitLayerUi({kind: 'refresh', sceneVersion: scene.version});
        },
        insertTemplate(template) {
            legacyCommands.insertTemplate(template);
            const scene = readScene();
            if (scene) emitLayerUi({kind: 'refresh', sceneVersion: scene.version});
        },
        insertTemplateAtomically(template, requiredSourceIds) {
            const scene = readScene();
            if (!scene) return undefined;
            const result = legacyCommands.insertTemplateAtomically(template, requiredSourceIds);
            if (result && readScene() === scene)
                emitLayerUi({kind: 'refresh', sceneVersion: scene.version});
            return result;
        },
        renameLayer(id, name, sceneVersion) {
            const scene = readScene();
            if (!canEdit() || !scene || scene.version !== sceneVersion) return false;
            const change = scene.layers.rename(id, name.trim());
            if (!change) return false;
            if (!canEdit() || readScene() !== scene || !isSceneModelChangeForScene(scene, change)
            ) {
                rollbackUnrecordedSceneModelChange(change);
                return false;
            }
            return recordSceneModelChange(change, item => history.recordChange(item));
        },
        updateBaseTextContent(id, value, sceneVersion) {
            const scene = readScene();
            if (!canEdit() || !scene || scene.version !== sceneVersion) return false;
            const expected = scene.layers.read();
            if (!expected || expected.sceneVersion !== sceneVersion) return false;
            const change = scene.layers.updateBaseTextContent(expected, id, value);
            if (!change) return false;
            if (!canEdit() || readScene() !== scene || !isSceneModelChangeForScene(scene, change)
            ) {
                rollbackUnrecordedSceneModelChange(change);
                return false;
            }
            return recordSceneModelChange(change, item => history.recordChange(item));
        },
        undo() {
            history.undo(record => legacyCommands.applyHistory(record, 'undo'));
        },
        redo() {
            history.redo(record => legacyCommands.applyHistory(record, 'redo'));
        },
        recordChange(change) {
            const scene = readScene();
            if (!canEdit() || !isSceneModelChangeForScene(scene, change)) return false;
            const recorded = history.recordChange(change);
            if (recorded) sceneStore.refresh();
            return recorded;
        },
        prepareRepair() {
            const scene = readScene();
            const sceneVersion = scene?.version ?? -1;
            if (!scene || !canEdit())
                return Promise.reject(new DOMException('画布场景已暂停、切换或插件已停用。', 'AbortError'));
            if (repairPreparation?.scene === scene
                && repairPreparation.sceneIdentity === scene.identity
                && repairPreparation.sceneVersion === sceneVersion)
                return repairPreparation.promise;
            const promise = trackTask(import('./canvas-repair.ts')
                .then(({createCanvasRepairService}) => {
                    if (!canEdit() || readScene() !== scene || scene.version !== sceneVersion)
                        throw new DOMException('画布场景已暂停、切换或插件已停用。', 'AbortError');
                    return createCanvasRepairService({
                        history: historyProxy,
                        scene,
                        readScene,
                        canEdit,
                        select(ids, interaction) { if (canEdit()) eventOperateStore.setTargetIds(ids, 'layer-list', interaction); },
                        deleteLayersByIds(ids) { return canEdit() && selectionCommands.deleteLayersByIds(ids); },
                    });
                })
                .catch(error => {
                    if (repairPreparation?.promise === promise)
                        repairPreparation = undefined;
                    throw error;
                }));
            repairPreparation = {scene, sceneIdentity: scene.identity, sceneVersion, promise};
            return promise;
        },
    };

    const resetState = () => {
        pluginActive = false;
        lifecycle.deactivate();
        historyProxy.dispose();
        repairPreparation = undefined;
        inspectorPreparation = undefined;
        readTemplateSnapshot = undefined;
        resolveDrop = undefined;
        bindProject(undefined);
        eventOperateStore.reset(false);
        contextMenuStore.setCanvasMenuPrepare(null);
        runInAction(() => selection.set({ids: Object.freeze([]), source: 'system'}));
        contextMenuStore.reset();
        viewportStore.reset();
        sceneStore.reset();
    };
    // Keep state reset first so event/toolbar registrations are withdrawn before stores.
    cleanups.unshift(resetState);
    own(context.on(designerWorkspaceChangedKey, () => {
        if (!pluginActive) return;
        const project = activeProject;
        bindProject(project);
        inspectorPreparation = undefined;
        repairPreparation = undefined;
        eventOperateStore.reset(false, true);
        runInAction(() => selection.set({ids: Object.freeze([]), source: 'system'}));
        contextMenuStore.reset();
        history.reset();
        sceneStore.refresh();
        viewportStore.reset();
    }));
    own(context.on(designerLayerModelChangedKey, event => {
        const scene = readScene();
        if (!scene || !scene.identity || scene.identity !== event.sceneIdentity
            || scene.version !== event.sceneVersion) return;
        sceneStore.refresh();
        const layerConfigs = sceneStore.readLayerConfigs();
        if (canEdit() && readSelection().ids.some(id => !layerConfigs[id])) {
            eventOperateStore.setTargetIds([], 'system', {kind: 'clear-inspector'});
            eventOperateStore.focusDesignerCanvas();
        }
        eventOperateStore.interactionRef?.refreshLayerGeometry?.([...event.ids]);
        eventOperateStore.interactionRef?.refreshOverlay?.();
        emitLayerUi({kind: 'refresh', sceneVersion: event.sceneVersion});
    }));

    own(context.editorShell.registerToolbarItem({
        id: 'canvas-tools', group: 'tools', order: 10,
        View: lazy(async () => {
            const {CanvasToolButtons} = await import('./CanvasToolbar.tsx');
            return {default: () => <EditorCanvasActivationProvider value={activation}><CanvasToolButtons/></EditorCanvasActivationProvider>};
        }),
    }));
    own(context.editorShell.registerToolbarItem({
        id: 'canvas-quick-add', group: 'add', order: 21,
        View: lazy(async () => {
            const [{CanvasQuickAddButtons}, catalog] = await Promise.all([
                import('./CanvasToolbar.tsx'), context.designerCatalog.prepare(),
            ]);
            return {default: () => <EditorCanvasActivationProvider value={activation}><CanvasQuickAddButtons canvas={canvas} catalog={catalog}/></EditorCanvasActivationProvider>};
        }),
    }));
    own(context.editorShell.registerToolbarItem({
        id: 'canvas-loop', group: 'scene', order: 30,
        groupClassName: 'workspace-toolbar-secondary', dividerClassName: 'workspace-toolbar-secondary',
        View: lazy(async () => {
            const {CanvasLoopButton} = await import('./CanvasToolbar.tsx');
            return {default: () => <EditorCanvasActivationProvider value={activation}><CanvasLoopButton/></EditorCanvasActivationProvider>};
        }),
    }));
    own(context.editorShell.registerToolbarItem({
        id: 'canvas-history', group: 'history', order: 50,
        groupClassName: 'workspace-toolbar-history', dividerClassName: 'workspace-toolbar-history-divider',
        View: lazy(async () => {
            const {CanvasHistoryButtons} = await import('./CanvasToolbar.tsx');
            return {default: () => <EditorCanvasActivationProvider value={activation}><CanvasHistoryButtons canvas={canvas}/></EditorCanvasActivationProvider>};
        }),
    }));
    const contribution: EditorCanvasContribution = {
        Canvas: lazy(async () => {
            const [{default: DesignerCanvas}, {readSelectionTemplateSnapshot}, {getMainCanvasDropPoint}] = await Promise.all([
                import('./DesignerCanvas.tsx'), import('./selectionTemplateSnapshot.ts'), import('./viewport/ArtboardDropTarget.ts'),
            ]);
            readTemplateSnapshot = readSelectionTemplateSnapshot;
            resolveDrop = getMainCanvasDropPoint;
            const onLayerDoubleClick = (id: string | null) => {
                if (!canEdit()) return;
                void context.emit(editorLayerDoubleClickedKey, id)
                    .catch(error => console.error('通知画布双击失败', error));
            };
            const Canvas = (props: EditorCanvasProps) => {
                const projectScene = props.project.editing?.readScene();
                if (activeProject !== props.project || boundScene !== projectScene
                    || boundSceneVersion !== (projectScene?.version ?? -1)) {
                    bindProject(props.project);
                    selectionSceneVersion = boundSceneVersion;
                }
                useEffect(() => {
                    bindProject(props.project);
                    selectionSceneVersion = boundSceneVersion;
                    eventOperateStore.reset(true, true);
                    contextMenuStore.reset();
                    viewportStore.reset();
                    const unregister = registerCanvasCommands(context.editorCommands, props.project, canvas);
                    return () => {
                        unregister();
                        if (activeProject === props.project) bindProject(undefined);
                    };
                }, [props.project]);
                return <EditorCanvasActivationProvider value={activation}>
                    <DesignerCanvas {...props} canvas={canvas} input={shortcutInput.query} onLayerDoubleClick={onLayerDoubleClick}/>
                </EditorCanvasActivationProvider>;
            };
            return {default: Canvas};
        }),
        ZoomControls: lazy(async () => {
            const {default: ZoomControls} = await import('./WorkspaceZoomControls.tsx');
            return {default: () => <EditorCanvasActivationProvider value={activation}><ZoomControls/></EditorCanvasActivationProvider>};
        }),
        Footer: lazy(async () => {
            const {default: Footer} = await import('./DesignerFooter.tsx');
            const CanvasFooter = (props: {inspectorAction?: ReactNode}) =>
                <EditorCanvasActivationProvider value={activation}><Footer {...props}/></EditorCanvasActivationProvider>;
            return {default: CanvasFooter};
        }),
        history: {undo: canvas.undo, redo: canvas.redo},
    };

    return {
        service: canvas,
        contribution,
        pause() {
            if (!pluginActive) return;
            lifecycle.pause();
            shortcutInput.pause();
            viewportStore.pause();
            eventOperateStore.pause();
            contextMenuStore.pause();
            historyProxy.pause();
        },
        async prepare() {
            while (pendingTasks.size > 0) await Promise.allSettled([...pendingTasks]);
        },
        cancel() {
            if (!pluginActive) return;
            lifecycle.resume();
            shortcutInput.resume();
        },
        withdraw() {
            if (!pluginActive) return;
            lifecycle.pause();
            shortcutInput.pause();
            viewportStore.pause();
            eventOperateStore.pause();
            contextMenuStore.pause();
            historyProxy.pause();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            const errors: unknown[] = [];
            for (const cleanup of [...cleanups].reverse()) {
                try { cleanup(); } catch (error) { errors.push(error); }
            }
            cleanups.length = 0;
            if (errors.length) throw new AggregateError(errors, '释放画布运行时资源失败。');
        },
    };
}
