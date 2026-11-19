/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';

import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import CanvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
import LoopContainerDefinition from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerDefinition.ts';
import LoopContainerController from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerController.ts';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
useMemoryLocalStorage();

let runtime: DesignerRuntimeContext | undefined;
let manager: DesignerManager | undefined;
let scene: ReturnType<typeof createEditingScene> | undefined;

const CanvasHost = observer(({value}: {value: DesignerManager}) => <>
    {CanvasRender.buildCanvasComponents(value)}
</>);

function createFixture() {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT};
    runtime = new DesignerRuntimeContext();
    manager = new DesignerManager(DesignerScene.DEFAULT, runtime);
    manager.init({
        canvasManager: {width: 800, height: 600},
        layerManager: {layerHeader: undefined, layerTail: undefined, layerConfigs: {}, elemConfigs: {}},
    } as any, DesignerMode.EDIT);
    runtime.registry.definitions.LoopContainer = new LoopContainerDefinition();
    runtime.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    scene = createEditingScene(manager, runtime.managerStore.sceneVersion, () => manager!.isRuntimeActive());
    const history = new HistoryOperator(() => []);
    return {manager, runtime, scene, history};
}

afterEach(async () => {
    await act(async () => {
        cleanup();
        await Promise.resolve();
    });
    if (scene) disposeEditingScene(scene);
    scene = undefined;
    manager?.destroy();
    manager = undefined;
    runtime?.dispose();
    runtime = undefined;
    vi.restoreAllMocks();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

describe('scene LoopContainer entity history', () => {
    it('mounts a real LoopContainer controller and undoes/redoes its default model state', async () => {
        const fixture = createFixture();
        const destroy = vi.spyOn(LoopContainerController.prototype, 'destroy');

        const before = fixture.scene.layers.read()!;
        const definition = fixture.runtime.registry.definitions.LoopContainer as LoopContainerDefinition;
        const initConfig = definition.getInitConfig();
        const layer = {
            id: 'inserted-loop', type: 'LoopContainer', name: 'Inserted loop',
            x: 12, y: 18, width: 160, height: 80, rotate: 0, transform: {},
        };
        const after = {
            ...cloneDeep(before),
            layerHeader: layer.id,
            layerTail: layer.id,
            layers: {[layer.id]: layer},
            configs: {},
        };

        let registered = false;
        let immediateSnapshot: ReturnType<typeof fixture.scene.layers.read>;
        act(() => {
            const change = fixture.scene.layers.replace(before, after as any);
            registered = Boolean(change && fixture.history.recordChange(change));
            immediateSnapshot = fixture.scene.layers.read();
        });
        expect(registered).toBe(true);
        expect(immediateSnapshot?.layers[layer.id].order).toBeUndefined();
        expect(immediateSnapshot?.configs[layer.id]).toBeUndefined();
        render(<CanvasHost value={fixture.manager}/>);

        await waitFor(() => {
            expect(fixture.manager.layerManager.controllers[layer.id]).toBeInstanceOf(LoopContainerController);
            expect(document.querySelector('.loop-container')).toBeTruthy();
            const snapshot = fixture.scene.layers.read()!;
            expect(snapshot.layers[layer.id].order).toBe(1);
            expect(snapshot.configs[layer.id]).toMatchObject({
                base: {id: layer.id, type: 'LoopContainer'},
                data: {sourceType: initConfig.data?.sourceType, value: initConfig.data?.value},
            });
        });

        const firstController = fixture.manager.layerManager.controllers[layer.id];
        let undone = false;
        act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(undone).toBe(true);
        expect(fixture.manager.layerManager.layerConfigs[layer.id]).toBeUndefined();
        expect(fixture.manager.layerManager.elemConfigs?.[layer.id]).toBeUndefined();
        expect(fixture.manager.layerManager.controllers[layer.id]).toBeUndefined();
        expect(fixture.scene.layers.read()?.configs[layer.id]).toBeUndefined();
        expect(destroy).toHaveBeenCalledTimes(1);

        let redone = false;
        act(() => { redone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(redone).toBe(true);
        await waitFor(() => {
            expect(fixture.manager.layerManager.controllers[layer.id]).toBeTruthy();
            expect(document.querySelector('.loop-container')).toBeTruthy();
            const snapshot = fixture.scene.layers.read()!;
            expect(snapshot.layers[layer.id].order).toBe(1);
            expect(snapshot.configs[layer.id]).toMatchObject({base: {id: layer.id, type: 'LoopContainer'}});
        });
        expect(fixture.manager.layerManager.controllers[layer.id]).not.toBe(firstController);
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
