/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import type {SceneModelChange} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
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
    manager.id = 'project';
    const definition = new BaseTextDefinition();
    runtime.registry.definitions.BaseText = definition;
    const id = 'tracked-text';
    const layer = {
        id, type: 'BaseText', name: 'Original text',
        x: 12, y: 18, width: 160, height: 36, rotate: 0, transform: {},
    };
    manager.init({
        canvasManager: {width: 800, height: 600},
        layerManager: {
            layerHeader: undefined,
            layerTail: undefined,
            layerConfigs: {},
            elemConfigs: {},
        },
    } as any, DesignerMode.EDIT);
    runtime.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    scene = createEditingScene(manager, runtime.managerStore.sceneVersion, () => manager!.isRuntimeActive());
    const history = new HistoryOperator(() => []);
    return {id, manager, runtime, scene, history, layer};
}

function recordChange(
    fixture: ReturnType<typeof createFixture>,
    createChange: () => SceneModelChange | undefined,
) {
    let change: SceneModelChange | undefined;
    let recorded = false;
    act(() => {
        change = createChange();
        recorded = Boolean(change && fixture.history.recordChange(change));
    });
    expect(recorded).toBe(true);
    return change!;
}

function insertTrackedText(fixture: ReturnType<typeof createFixture>) {
    let inserted: SceneModelChange | undefined;
    let recorded = false;
    act(() => {
        const before = fixture.scene.layers.read()!;
        inserted = fixture.scene.layers.replace(before, {
            ...cloneDeep(before),
            layerHeader: fixture.id,
            layerTail: fixture.id,
            layers: {[fixture.id]: cloneDeep(fixture.layer)},
            configs: {},
        });
        recorded = Boolean(inserted && fixture.history.recordChange(inserted));
    });
    expect(recorded).toBe(true);
    return inserted!;
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

describe('scene layer entity identity across delete history', () => {
    it('preserves rename history across remove, undo remove, undo rename, and both redos', async () => {
        const fixture = createFixture();
        const insertion = insertTrackedText(fixture);
        const destroy = vi.spyOn(BaseTextController.prototype, 'destroy');
        const view = render(<CanvasHost value={fixture.manager}/>);
        await screen.findByText('基础文本');
        const originalController = fixture.manager.layerManager.controllers[fixture.id];
        expect(originalController).toBeInstanceOf(BaseTextController);

        recordChange(fixture, () => fixture.scene.layers.rename(fixture.id, 'Renamed text'));
        expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Renamed text');
        expect(fixture.manager.layerManager.controllers[fixture.id]).toBe(originalController);

        let remove: SceneModelChange | undefined;
        act(() => {
            const snapshot = fixture.scene.layers.read()!;
            remove = fixture.scene.layers.remove(snapshot, [fixture.id]);
            expect(remove).toBeTruthy();
            expect(fixture.history.recordChange(remove!)).toBe(true);
        });
        expect(fixture.scene.layers.read()?.layers[fixture.id]).toBeUndefined();
        expect(fixture.manager.layerManager.controllers[fixture.id]).toBeUndefined();
        expect(destroy).toHaveBeenCalledTimes(1);

        let removeUndone = false;
        act(() => { removeUndone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(removeUndone).toBe(true);
        await screen.findByText('基础文本');
        await waitFor(() => {
            expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Renamed text');
            expect(fixture.manager.layerManager.controllers[fixture.id]).toBeTruthy();
            expect(fixture.manager.layerManager.controllers[fixture.id]).not.toBe(originalController);
        });
        const restoredController = fixture.manager.layerManager.controllers[fixture.id];

        let renameUndone = false;
        act(() => { renameUndone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(renameUndone).toBe(true);
        expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Original text');
        expect(fixture.manager.layerManager.controllers[fixture.id]).toBe(restoredController);

        let insertionUndone = false;
        act(() => { insertionUndone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(insertionUndone).toBe(true);
        expect(fixture.scene.layers.read()?.layers[fixture.id]).toBeUndefined();
        expect(fixture.manager.layerManager.controllers[fixture.id]).toBeUndefined();

        let renameRedone = false;
        let insertionRedone = false;
        act(() => { insertionRedone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(insertionRedone).toBe(true);
        await screen.findByText('基础文本');
        await waitFor(() => expect(fixture.manager.layerManager.controllers[fixture.id]).toBeTruthy());
        act(() => { renameRedone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(renameRedone).toBe(true);
        expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Renamed text');

        let removeRedone = false;
        act(() => { removeRedone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(removeRedone).toBe(true);
        expect(fixture.scene.layers.read()?.layers[fixture.id]).toBeUndefined();
        expect(fixture.manager.layerManager.controllers[fixture.id]).toBeUndefined();
        expect(destroy).toHaveBeenCalledTimes(3);
        expect(insertion).toBeTruthy();
        act(() => view.unmount());
    });

    it('rejects older history after an external delete and same-id re-add creates a new entity', async () => {
        const fixture = createFixture();
        insertTrackedText(fixture);
        const view = render(<CanvasHost value={fixture.manager}/>);
        await screen.findByText('基础文本');
        const originalController = fixture.manager.layerManager.controllers[fixture.id];

        recordChange(fixture, () => fixture.scene.layers.rename(fixture.id, 'Renamed text'));
        act(() => {
            fixture.manager.layerManager.delItem([fixture.id]);
            fixture.manager.layerManager.addItem({...fixture.layer, name: 'Renamed text'} as any);
            fixture.manager.layerManager.reRenderLayer();
        });
        await waitFor(() => {
            expect(fixture.manager.layerManager.controllers[fixture.id]).toBeTruthy();
            expect(fixture.manager.layerManager.controllers[fixture.id]).not.toBe(originalController);
        });

        let undone = true;
        act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(undone).toBe(false);
        expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Renamed text');
        act(() => view.unmount());
    });

    it('restores the original entity token when a model change is rolled back before history registration', async () => {
        const fixture = createFixture();
        insertTrackedText(fixture);
        const view = render(<CanvasHost value={fixture.manager}/>);
        await screen.findByText('基础文本');
        const originalController = fixture.manager.layerManager.controllers[fixture.id];
        recordChange(fixture, () => fixture.scene.layers.rename(fixture.id, 'Renamed text'));
        const originalToken = fixture.manager.layerManager.getRuntimeEntityToken(fixture.id);

        let removal: SceneModelChange | undefined;
        act(() => {
            removal = fixture.scene.layers.remove(fixture.scene.layers.read()!, [fixture.id]);
        });
        expect(removal).toBeTruthy();
        expect(fixture.manager.layerManager.getRuntimeEntityToken(fixture.id)).toBeUndefined();

        let rolledBack = false;
        act(() => { rolledBack = removal!.rollback(); });
        expect(rolledBack).toBe(true);
        await screen.findByText('基础文本');
        await waitFor(() => {
            expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Renamed text');
            expect(fixture.manager.layerManager.controllers[fixture.id]).toBeTruthy();
            expect(fixture.manager.layerManager.controllers[fixture.id]).not.toBe(originalController);
            expect(fixture.manager.layerManager.getRuntimeEntityToken(fixture.id)).toBe(originalToken);
        });

        let undone = false;
        act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(undone).toBe(true);
        expect(fixture.scene.layers.read()?.layers[fixture.id]?.name).toBe('Original text');
        act(() => view.unmount());
    });
});
