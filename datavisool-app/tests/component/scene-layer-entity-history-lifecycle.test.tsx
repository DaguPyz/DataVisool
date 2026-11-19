/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';

import BaseTextDefinition from '@/comps/builtin/base-text/BaseTextDefinition.ts';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import CanvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
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
    runtime.registry.definitions.BaseText = new BaseTextDefinition();
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

describe('scene layer entity history with a real BaseText controller', () => {
    it('undoes and redoes a first insertion across runtime order/config materialization without leaking controllers', async () => {
        const fixture = createFixture();
        const destroy = vi.spyOn(BaseTextController.prototype, 'destroy');

        const before = fixture.scene.layers.read()!;
        const layer = {
            id: 'inserted-text', type: 'BaseText', name: 'Inserted text',
            x: 12, y: 18, width: 160, height: 36, rotate: 0, transform: {},
        };
        const after = {
            ...cloneDeep(before),
            layerHeader: layer.id,
            layerTail: layer.id,
            layers: {[layer.id]: layer},
            configs: {},
        };

        let change: ReturnType<typeof fixture.scene.layers.replace>;
        let registered = false;
        let immediateSnapshot: ReturnType<typeof fixture.scene.layers.read>;
        act(() => {
            change = fixture.scene.layers.replace(before, after as any);
            registered = Boolean(change && fixture.history.recordChange(change));
            immediateSnapshot = fixture.scene.layers.read();
        });

        expect(registered).toBe(true);
        expect(immediateSnapshot?.layers[layer.id].order).toBeUndefined();
        expect(immediateSnapshot?.configs[layer.id]).toBeUndefined();
        const view = render(<CanvasHost value={fixture.manager}/>);
        await screen.findByText('基础文本');
        await waitFor(() => {
            const snapshot = fixture.scene.layers.read()!;
            expect(snapshot.layers[layer.id].order).toBe(1);
            expect(snapshot.configs[layer.id]).toMatchObject({
                base: {id: layer.id, type: 'BaseText'},
                data: {value: '基础文本'},
            });
        });

        for (let cycle = 0; cycle < 2; cycle++) {
            const mountedController = fixture.manager.layerManager.controllers[layer.id];
            expect(mountedController).toBeInstanceOf(BaseTextController);

            let undone = false;
            act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
            expect(undone).toBe(true);
            expect(fixture.manager.layerManager.layerConfigs[layer.id]).toBeUndefined();
            expect(fixture.manager.layerManager.elemConfigs?.[layer.id]).toBeUndefined();
            expect(fixture.scene.layers.read()?.configs[layer.id]).toBeUndefined();
            expect(fixture.manager.layerManager.controllers[layer.id]).toBeUndefined();
            expect(destroy).toHaveBeenCalledTimes(cycle + 1);

            let redone = false;
            act(() => { redone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
            expect(redone).toBe(true);
            await screen.findByText('基础文本');
            await waitFor(() => {
                expect(fixture.manager.layerManager.controllers[layer.id]).toBeTruthy();
                const snapshot = fixture.scene.layers.read()!;
                expect(snapshot.layers[layer.id].order).toBe(1);
                expect(snapshot.configs[layer.id]).toMatchObject({base: {id: layer.id, type: 'BaseText'}});
            });
            expect(fixture.manager.layerManager.controllers[layer.id]).not.toBe(mountedController);
            expect(destroy).toHaveBeenCalledTimes(cycle + 1);
        }

        await act(async () => {
            view.unmount();
            await Promise.resolve();
        });
        expect(destroy).toHaveBeenCalledTimes(3);
        expect(fixture.manager.layerManager.controllers[layer.id]).toBeUndefined();
    });
});
