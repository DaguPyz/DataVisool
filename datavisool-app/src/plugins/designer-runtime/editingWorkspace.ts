/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerEditingScene, DesignerEditingWorkspace, DesignerWorkspaceIdentity} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {DesignerBlueprintChangeEvent} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import type {DesignerLayerModelChangedEvent} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import {DesignerMode, DesignerScene, type IDesignerManager} from '@datavisool/sdk/types';
import {runInAction} from 'mobx';
import baseApi from '@/api/engineering/BaseApi.ts';
import type DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import {createEditingScene, disposeEditingScene} from './editingScene.ts';

export function createEditingWorkspace(
    loader: DesignerLoader,
    ownsEditor: () => boolean,
    onChanged: (workspace: DesignerWorkspaceIdentity) => void,
    onBlueprintChanged: (event: DesignerBlueprintChangeEvent) => void,
    onLayerChanged: (event: DesignerLayerModelChangedEvent) => void,
    canWrite: () => boolean = () => true,
    trackOperation: <T>(operation: Promise<T>) => Promise<T> = operation => operation,
): DesignerEditingWorkspace & {dispose(): void} {
    const {managerStore} = loader.runtimeContext;
    let pending: AbortController | undefined;
    let scene: DesignerEditingScene | undefined;

    const disposeCurrentScene = () => {
        disposeEditingScene(scene);
        scene = undefined;
    };

    const read = () => {
        if (!ownsEditor() || !loader.loaded) return;
        const rootId = loader.designerManager.id;
        const activeId = managerStore.currentFinalManager?.id;
        const nested = managerStore.currentManager !== managerStore.currentFinalManager;
        const stack = managerStore.managerStack;
        const finalIndex = stack.lastIndexOf(managerStore.currentFinalManager!);
        const currentIndex = stack.lastIndexOf(managerStore.currentManager!);
        const loopPath: string[] = [];
        if (nested) {
            if (finalIndex < 0 || currentIndex <= finalIndex) return;
            for (let index = finalIndex + 1; index <= currentIndex; index++) {
                const parent = stack[index - 1];
                const child = stack[index];
                const layerId = Object.entries(parent?.layerManager.controllers ?? {})
                    .find(([, controller]) => (controller as {manager?: DesignerManager} | undefined)?.manager === child)?.[0];
                if (!layerId) return;
                loopPath.push(layerId);
            }
        }
        if (rootId && activeId) return {rootId, activeId, nested, loopPath: Object.freeze(loopPath)};
    };

    const dispose = (manager: DesignerManager) => {
        try {
            manager.destroy();
        } catch (error) {
            console.error('释放旧工作空间失败', error);
        }
    };

    const exposeCurrentManager = (manager: DesignerManager) => {
        const environment = window.DATAVISOOL_ENV;
        environment.mainManger = loader.designerManager;
        environment.currentManager = manager;
        environment.controllers = manager.layerManager.controllers;
    };

    const notifyChange = () => {
        const workspace = read();
        if (workspace) onChanged(workspace);
    };

    const activate = (manager: DesignerManager, workspace: DesignerWorkspaceIdentity) => {
        if (!canWrite()) return;
        const root = loader.designerManager;
        const previous = managerStore.currentFinalManager;
        const previousStack = managerStore.managerStack;
        const isRoot = manager.id === workspace.rootId;
        runInAction(() => {
            if (isRoot) loader.designerManager = manager;
            exposeCurrentManager(manager);
            managerStore.resetManagerStack(manager, isRoot, isRoot ? DesignerScene.DEFAULT : DesignerScene.SUB_PROJECT);
        });
        const version = managerStore.sceneVersion;
        disposeCurrentScene();
        scene = createEditingScene(manager, version, () => ownsEditor() && loader.loaded
            && managerStore.currentManager === manager && managerStore.sceneVersion === version, onBlueprintChanged, onLayerChanged, canWrite);
        notifyChange();
        if (previous && previous !== root && previous !== manager) dispose(previous);
        if (isRoot && root !== manager) dispose(root);
        if (previous && previous !== manager && (previous !== root || isRoot)) {
            for (const nested of previousStack) {
                if (nested.scene === DesignerScene.LOOP_CONTAINER) dispose(nested);
            }
        }
    };

    const install = (id: string, name: string | undefined, data: IDesignerManager, workspace: DesignerWorkspaceIdentity) => {
        const scene = id === workspace.rootId ? DesignerScene.DEFAULT : DesignerScene.SUB_PROJECT;
        const manager = new DesignerManager(scene, loader.runtimeContext);
        try {
            runInAction(() => manager.init({...data, id, name}, DesignerMode.EDIT));
        } catch (error) {
            dispose(manager);
            throw error;
        }
        activate(manager, workspace);
        return true;
    };

    const cancelLoad = () => {
        pending?.abort();
        pending = undefined;
    };

    const load = async (getWorkspace: (workspace: DesignerWorkspaceIdentity, signal: AbortSignal) => Promise<boolean>) => {
        if (!canWrite()) return false;
        cancelLoad();
        const workspace = read();
        if (!workspace) return false;
        const request = new AbortController();
        pending = request;
        try {
            const result = await trackOperation(getWorkspace(workspace, request.signal));
            return canWrite() && result;
        } catch (error) {
            if (request.signal.aborted) return false;
            throw error;
        } finally {
            if (pending === request) pending = undefined;
        }
    };

    return {
        read,
        readScene() {
            if (!read()) return;
            const manager = managerStore.currentManager;
            if (!manager) return;
            const version = managerStore.sceneVersion;
            if (scene?.version !== version) {
                disposeCurrentScene();
                scene = createEditingScene(manager, version, () => ownsEditor() && loader.loaded && managerStore.sceneVersion === version, onBlueprintChanged, onLayerChanged, canWrite);
            }
            return scene;
        },
        enterLoopContainer(layerId) {
            if (!canWrite() || !read()) return false;
            const layerManager = managerStore.currentManager?.layerManager;
            if (layerManager?.layerConfigs[layerId]?.type !== 'LoopContainer') return false;
            const controller = layerManager.controllers[layerId] as {manager?: DesignerManager; seedEditSampleData?(): void} | undefined;
            const nested = controller?.manager;
            if (!nested || managerStore.managerStack.includes(nested)) return false;
            cancelLoad();
            controller?.seedEditSampleData?.();
            runInAction(() => {
                exposeCurrentManager(nested);
                managerStore.pushManager(nested);
                managerStore.setCurrentManager(nested, false, DesignerScene.LOOP_CONTAINER);
            });
            disposeCurrentScene();
            notifyChange();
            return true;
        },
        leaveLoopContainer() {
            if (!canWrite() || !read() || managerStore.managerStack.length <= 1) return false;
            const parent = managerStore.managerStack.at(-2);
            if (!parent) return false;
            cancelLoad();
            runInAction(() => {
                exposeCurrentManager(parent);
                managerStore.popManager();
                managerStore.setCurrentManager(parent);
            });
            disposeCurrentScene();
            notifyChange();
            return true;
        },
        cancelLoad,
        dispose() {
            cancelLoad();
            disposeCurrentScene();
        },
        open(id, {refresh = false} = {}) {
            return load(async (workspace, signal) => {
                if (!refresh) {
                    if (id === workspace.activeId && !workspace.nested) return true;
                    if (id === workspace.rootId) {
                        activate(loader.designerManager, workspace);
                        return true;
                    }
                }
                const target = await baseApi.getProjectData(id, {signal});
                if (signal.aborted || !read() || target?.id !== id || !target.data) return false;
                return install(id, target.name, target.data, workspace);
            });
        },
        restore(id, data) {
            return load(async (workspace, signal) => {
                if (id === workspace.rootId)
                    return install(id, loader.designerManager.name ?? undefined, data, workspace);
                const children = await baseApi.getSubProjectList(workspace.rootId, {signal});
                const target = children.find(project => project.id === id);
                if (signal.aborted || !read() || !target) return false;
                return install(id, target.name, data, workspace);
            });
        },
        rename(id, name) {
            if (!canWrite() || read()?.activeId !== id) return;
            runInAction(() => { managerStore.currentFinalManager!.name = name; });
        },
    };
}
