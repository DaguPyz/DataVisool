/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';

import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import CanvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
import LoopContainerController from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerController.ts';
import LoopContainerDefinition from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerDefinition.ts';
import {createEditingWorkspace} from '@/plugins/designer-runtime/editingWorkspace.ts';
import type DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';

const previousEnvironment = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
useMemoryLocalStorage();

let runtime: DesignerRuntimeContext | undefined;
let workspace: ReturnType<typeof createEditingWorkspace> | undefined;
let rootManager: DesignerManager | undefined;

const CanvasHost = observer(() => {
    const manager = runtime?.managerStore.currentManager;
    const currentWorkspace = workspace?.read();
    const isNested = Boolean(currentWorkspace?.loopPath.length);
    return <div data-testid="canvas-host" className={isNested ? 'canvas-transparent' : ''}>
        {manager ? CanvasRender.buildCanvasComponents(manager) : null}
    </div>;
});

function createFixture() {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT};
    runtime = new DesignerRuntimeContext();
    rootManager = new DesignerManager(DesignerScene.DEFAULT, runtime);
    rootManager.id = 'root-project';
    rootManager.name = 'Root project';
    const definition = new LoopContainerDefinition();
    runtime.registry.definitions.LoopContainer = definition;

    const loopId = 'loop-owner';
    const childId = 'nested-child';
    const layer = {
        id: loopId, type: 'LoopContainer', name: 'Loop',
        x: 0, y: 0, width: 320, height: 180, rotate: 0, transform: {},
    };
    const child = {
        id: childId, type: 'TestLeaf', name: 'Before edit',
        x: 12, y: 16, width: 60, height: 40, rotate: 0, transform: {},
    };
    const config = {
        ...cloneDeep(definition.getInitConfig()),
        base: {id: loopId, name: 'Loop', type: 'LoopContainer'},
        managerData: {
            canvasManager: {canvasConfig: {width: 320, height: 180}},
            layerManager: {
                layerHeader: childId,
                layerTail: childId,
                layerConfigs: {[childId]: child},
                elemConfigs: {},
            },
        },
    };
    rootManager.init({
        canvasManager: {canvasConfig: {width: 800, height: 600}},
        layerManager: {
            layerHeader: loopId,
            layerTail: loopId,
            layerConfigs: {[loopId]: layer},
            elemConfigs: {[loopId]: config},
        },
    } as any, DesignerMode.EDIT);
    runtime.managerStore.resetManagerStack(rootManager, true, DesignerScene.DEFAULT);

    // Workspace only uses these loader fields for the edit navigation path; manager,
    // runtime registry, CanvasRender and LoopContainer are the real implementations.
    const loader = {
        runtimeContext: runtime,
        loaded: true,
        designerManager: rootManager,
    } as unknown as DesignerLoader;
    workspace = createEditingWorkspace(loader, () => true, () => undefined, () => undefined, () => undefined);
    return {loopId, childId};
}

afterEach(async () => {
    await act(async () => {
        cleanup();
        await Promise.resolve();
    });
    workspace?.dispose();
    workspace = undefined;
    try { runtime?.dispose(); } catch { /* Keep fixture cleanup independent of owner errors. */ }
    runtime = undefined;
    rootManager = undefined;
    vi.restoreAllMocks();
    if (previousEnvironment) Object.defineProperty(window, 'DATAVISOOL_ENV', previousEnvironment);
    else delete (window as any).DATAVISOOL_ENV;
});

describe('LoopContainer workspace navigation owner', () => {
    it('keeps the nested manager alive while rendering inside it, then snapshots child edits before releasing the old owner', async () => {
        const {loopId, childId} = createFixture();
        const view = render(<CanvasHost/>);
        await waitFor(() => {
            expect(rootManager!.layerManager.controllers[loopId]).toBeInstanceOf(LoopContainerController);
            expect(view.container.querySelector('.loop-container')).toBeTruthy();
        });

        const firstController = rootManager!.layerManager.controllers[loopId] as LoopContainerController;
        const firstNestedManager = firstController.manager;
        const firstControllerDestroy = vi.spyOn(firstController, 'destroy');
        const firstManagerDestroy = vi.spyOn(firstNestedManager, 'destroy');

        act(() => { expect(workspace!.enterLoopContainer(loopId)).toBe(true); });
        await waitFor(() => {
            expect(view.getByTestId('canvas-host')).toHaveClass('canvas-transparent');
            expect(workspace!.read()?.loopPath).toEqual([loopId]);
            expect(runtime!.managerStore.currentManager).toBe(firstNestedManager);
            expect(firstNestedManager.isRuntimeActive()).toBe(true);
            expect(rootManager!.layerManager.controllers[loopId]).toBe(firstController);
        });

        const nestedScene = workspace!.readScene()!;
        const before = nestedScene.layers.read()!;
        let renamed = false;
        act(() => { renamed = Boolean(nestedScene.layers.patch(before, [{id: childId, layer: {name: 'Edited child'}}])); });
        expect(renamed).toBe(true);
        expect(nestedScene.layers.read()?.layers[childId]?.name).toBe('Edited child');

        act(() => { expect(workspace!.leaveLoopContainer()).toBe(true); });
        await waitFor(() => {
            const nextController = rootManager!.layerManager.controllers[loopId] as LoopContainerController;
            expect(nextController).toBeInstanceOf(LoopContainerController);
            expect(nextController).not.toBe(firstController);
            expect(nextController.manager.layerManager.layerConfigs[childId]?.name).toBe('Edited child');
        });
        expect(firstControllerDestroy).toHaveBeenCalledTimes(1);
        expect(firstManagerDestroy).toHaveBeenCalledTimes(1);
        expect(firstNestedManager.isRuntimeActive()).toBe(false);

        const secondController = rootManager!.layerManager.controllers[loopId] as LoopContainerController;
        const secondNestedManager = secondController.manager;
        const secondControllerDestroy = vi.spyOn(secondController, 'destroy');
        const secondManagerDestroy = vi.spyOn(secondNestedManager, 'destroy');
        act(() => { expect(workspace!.enterLoopContainer(loopId)).toBe(true); });
        await waitFor(() => expect(workspace!.read()?.loopPath).toEqual([loopId]));
        expect(secondNestedManager.isRuntimeActive()).toBe(true);
        act(() => { expect(workspace!.leaveLoopContainer()).toBe(true); });
        await waitFor(() => expect(rootManager!.layerManager.controllers[loopId]).not.toBe(secondController));
        expect(secondControllerDestroy).toHaveBeenCalledTimes(1);
        expect(secondManagerDestroy).toHaveBeenCalledTimes(1);
        expect(secondNestedManager.isRuntimeActive()).toBe(false);
    });

    it('does not retain a LoopContainer controller when its nested manager is not on the editing stack', () => {
        const {loopId} = createFixture();
        const controller = new LoopContainerController();
        controller.manager.attachRuntimeContext(runtime);
        controller.config = {base: {id: loopId, type: 'LoopContainer'}} as any;
        rootManager!.layerManager.controllers[loopId] = controller;
        rootManager!.layerManager.layerConfigs[loopId] = {id: loopId, type: 'LoopContainer'} as any;

        expect(rootManager!.layerManager.retainNestedEditingController(controller, loopId, [])).toBe(false);
        expect(rootManager!.layerManager.isNestedEditingController(controller)).toBe(false);
    });

    it('recognizes a destroyed framework controller continuation only when its render binding is unchanged', () => {
        createFixture();
        const layerManager = rootManager!.layerManager;
        const definition = runtime!.registry.definitions.LoopContainer;
        const executor = rootManager!.bpExecutor;
        const previous = new LoopContainerController();
        const current = new LoopContainerController();
        const changedRender = new LoopContainerController();
        const unregistered = new LoopContainerController();
        const layerId = 'reparented-loop';
        layerManager.addItem({id: layerId, type: 'LoopContainer', name: 'Loop'} as any);
        const renderKey = layerManager.getRenderKey(layerId);

        layerManager.registerComponentControllerBinding(previous, layerId, renderKey, definition, executor, undefined);
        layerManager.registerComponentControllerBinding(current, layerId, renderKey, definition, executor, undefined);
        layerManager.registerComponentControllerBinding(changedRender, layerId, `${renderKey}:stale`, definition, executor, undefined);
        expect(layerManager.isControllerContinuation(layerId, previous, current)).toBe(false);
        layerManager.destroyController(previous);
        expect(layerManager.isControllerContinuation(layerId, previous, current)).toBe(true);
        expect(layerManager.isControllerContinuation(layerId, previous, changedRender)).toBe(false);
        expect(layerManager.isControllerContinuation(layerId, previous, unregistered)).toBe(false);

        layerManager.destroyController(current);
        layerManager.destroyController(changedRender);
        layerManager.destroyController(unregistered);
    });
});
