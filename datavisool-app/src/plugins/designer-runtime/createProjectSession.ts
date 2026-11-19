/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerProjectRenderActions, DesignerProjectSession, DesignerWorkspaceIdentity} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerBlueprintChangeEvent} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {DesignerLayerModelChangedEvent} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {DesignerMode} from '@datavisool/sdk/types';
import {Fragment, createElement} from 'react';
import canvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {createEditingWorkspace} from './editingWorkspace.ts';

export interface RuntimeManagedProjectSession extends DesignerProjectSession {
    pauseForStop(): void;
    prepareForStop(): Promise<void>;
    cancelStop(): void;
}

export function createProjectSession(
    loader: DesignerLoader,
    options: {
        setPassword?(password?: string): void;
        workspaceChanged?(workspace: DesignerWorkspaceIdentity): void;
        blueprintChanged?(event: DesignerBlueprintChangeEvent): void;
        layerChanged?(event: DesignerLayerModelChangedEvent): void;
    } = {},
): RuntimeManagedProjectSession {
    const {managerStore, registry} = loader.runtimeContext;
    let closed = false;
    let writesPaused = false;
    let hasEnvironmentSnapshot = false;
    let previousEnvironmentDescriptor: PropertyDescriptor | undefined;
    const inFlight = new Set<Promise<unknown>>();
    const trackOperation = <T,>(operation: Promise<T>): Promise<T> => {
        const tracked = operation.finally(() => inFlight.delete(tracked));
        inFlight.add(tracked);
        return tracked;
    };
    const canWrite = () => !closed && !writesPaused;
    const ownsEditor = () => window.DATAVISOOL_ENV?.editorLoader === loader;
    const editing = options.workspaceChanged && createEditingWorkspace(
        loader,
        () => !closed && ownsEditor(),
        options.workspaceChanged,
        options.blueprintChanged ?? (() => undefined),
        options.layerChanged ?? (() => undefined),
        () => canWrite() && (loader.mode !== DesignerMode.EDIT || ownsEditor()),
        trackOperation,
    );
    const renderKeys = new WeakMap<DesignerManager, number>();
    let nextRenderKey = 0;
    const getPersistableManager = (scope: 'active' | 'root' = 'active') => {
        if (closed || !loader.loaded || (editing && !ownsEditor())) return;
        return editing && scope === 'active' ? managerStore.currentFinalManager : loader.designerManager;
    };
    return {
        get loaded() { return loader.loaded; },
        get name() { return loader.projectInfo.name; },
        editing,
        load(id, password) {
            if (closed) throw new Error('Designer project session is closed.');
            if (!canWrite()) throw Object.assign(new Error('Designer project session is paused.'), {name: 'AbortError'});
            editing?.cancelLoad();
            options.setPassword?.(password);
            if (!hasEnvironmentSnapshot) {
                hasEnvironmentSnapshot = true;
                previousEnvironmentDescriptor = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
            }
            if (loader.mode === DesignerMode.EDIT) {
                window.DATAVISOOL_ENV = {...window.DATAVISOOL_ENV, editorLoader: loader};
            }
            return trackOperation(loader.load(id));
        },
        getProjectId() {
            return getPersistableManager()?.id ?? undefined;
        },
        getSnapshot(scope) {
            const manager = getPersistableManager(scope);
            if (manager?.id) return {id: manager.id, name: manager.name ?? undefined, data: manager.getData()};
        },
        readRemoteComponentPaths() {
            if (!getPersistableManager()) return {};
            const paths: Record<string, string> = {};
            for (const [type, remote] of Object.entries(registry.remoteComponents)) {
                if (registry.definitions[type]?.getBaseInfo().source === 'remote') paths[type] = remote.script;
            }
            return paths;
        },
        renderCanvas(actions?: DesignerProjectRenderActions) {
            const manager = editing && ownsEditor()
                ? managerStore.currentManager ?? loader.designerManager
                : loader.designerManager;
            const {width, height, adaptationType} = manager.canvasManager.canvasConfig;
            let renderKey = renderKeys.get(manager);
            if (renderKey === undefined) {
                renderKey = nextRenderKey++;
                renderKeys.set(manager, renderKey);
            }
            const sceneVersion = editing?.readScene()?.version;
            const runtimeActions = actions && sceneVersion !== undefined ? {
                auxiliaryBorder: actions.auxiliaryBorder,
                renameLayer: (id: string, name: string) => actions.renameLayer(id, name, sceneVersion),
                updateBaseTextContent: (id: string, value: unknown) => actions.updateBaseTextContent(id, value, sceneVersion),
            } : undefined;
            return {
                width, height, adaptationType,
                filterStyle: manager.globalFilterManger.getFilterStyle(),
                content: createElement(Fragment, {key: renderKey}, canvasRender.buildCanvasComponents(manager, undefined, undefined, runtimeActions)),
            };
        },
        close() {
            if (closed) return;
            closed = true;
            const errors: unknown[] = [];
            try { editing?.dispose(); } catch (error) { errors.push(error); }
            try { loader.cancelLoad(); } catch (error) { errors.push(error); }
            const environment = window.DATAVISOOL_ENV;
            const managers = new Set([loader.designerManager]);
            const ownsLegacyEnvironment = Boolean(environment && (
                environment.editorLoader === loader || managers.has(environment.currentManager as DesignerManager)
            ));
            if (ownsEditor()) {
                try {
                    managerStore.managerStack.forEach(manager => managers.add(manager));
                    if (managerStore.currentManager) managers.add(managerStore.currentManager);
                    if (managerStore.currentFinalManager) managers.add(managerStore.currentFinalManager);
                    managerStore.clear();
                } catch (error) {
                    errors.push(error);
                }
            }

            for (const manager of managers) {
                try {
                    manager.destroy();
                } catch (error) {
                    errors.push(error);
                }
            }
            if (ownsLegacyEnvironment && hasEnvironmentSnapshot) {
                try {
                    if (previousEnvironmentDescriptor)
                        Object.defineProperty(window, 'DATAVISOOL_ENV', previousEnvironmentDescriptor);
                    else
                        Reflect.deleteProperty(window, 'DATAVISOOL_ENV');
                } catch (error) {
                    errors.push(error);
                }
            }
            if (errors.length) throw new AggregateError(errors, 'Failed to close the designer project.');
        },
        pauseForStop() {
            writesPaused = true;
            editing?.cancelLoad();
        },
        async prepareForStop() {
            while (inFlight.size) await Promise.allSettled([...inFlight]);
        },
        cancelStop() {
            if (closed) return;
            writesPaused = false;
        },
    };
}
