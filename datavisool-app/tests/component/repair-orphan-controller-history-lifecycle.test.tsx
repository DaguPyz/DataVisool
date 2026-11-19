/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import type {ILayerItem} from '@datavisool/sdk/types';
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import CanvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';
import {createCanvasRepairService} from '@/plugins/editor-canvas/canvas-repair.ts';

useMemoryLocalStorage();

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
let runtime: DesignerRuntimeContext | undefined;
let manager: DesignerManager | undefined;
let scene: ReturnType<typeof createEditingScene> | undefined;
let historyProxy: HistoryRecordOperateProxy | undefined;
let history: HistoryOperator | undefined;

const CanvasHost = observer(({value}: {value: DesignerManager}) => <>{CanvasRender.buildCanvasComponents(value)}</>);

class FixtureController {
    config: Record<string, any> = {};
    create = vi.fn(() => Promise.resolve());
    destroy = vi.fn();
    setVisible = vi.fn();
    updateFilter = vi.fn();
    registerEvent = vi.fn();
    loadComponentData = vi.fn();
    getConfig = () => this.config;
    changeData = vi.fn();
}

function createFixture() {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT};
    runtime = new DesignerRuntimeContext();
    manager = new DesignerManager(DesignerScene.DEFAULT, runtime);
    const first: ILayerItem = {
        id: 'first', type: 'fixture', name: 'First', x: 0, y: 0, width: 100, height: 40,
        rotate: 0, transform: {}, next: undefined,
    };
    const orphan: ILayerItem = {
        id: 'orphan', type: 'fixture', name: 'Orphan', x: 0, y: 50, width: 100, height: 40,
        rotate: 0, transform: {}, prev: undefined, next: undefined,
    };
    const config = (id: string) => ({base: {id, type: 'fixture', name: id}, data: {value: id}});
    manager.init({
        canvasManager: {width: 800, height: 600},
        layerManager: {
            layerHeader: first.id,
            layerTail: orphan.id,
            layerConfigs: {[first.id]: first, [orphan.id]: orphan},
            elemConfigs: {[first.id]: config(first.id), [orphan.id]: config(orphan.id)},
        },
    } as never, DesignerMode.EDIT);
    runtime.registry.definitions.fixture = {
        getController: () => FixtureController,
        getInitConfig: () => ({base: {}, data: {}}),
        getBaseInfo: () => ({id: 'fixture', compName: 'Fixture', type: 'fixture', version: '1.0'}),
        getMenuList: () => [],
        getMenuToConfigContentMap: () => ({}),
        getActionList: () => [],
    } as never;
    runtime.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    scene = createEditingScene(manager, runtime.managerStore.sceneVersion, () => manager!.isRuntimeActive());
    history = new HistoryOperator(() => []);
    const eventOperateStore = {
        setAddRecordCompId: vi.fn(),
        setTargetIds: vi.fn(),
        focusDesignerCanvas: vi.fn(),
    } as never;
    historyProxy = new HistoryRecordOperateProxy({
        eventOperateStore,
        history,
        readScene: () => scene,
        isActive: () => Boolean(manager?.isRuntimeActive()),
    });
    const repair = createCanvasRepairService({
        history: historyProxy,
        scene,
        readScene: () => scene,
        canEdit: () => Boolean(manager?.isRuntimeActive()),
        select: () => undefined,
        deleteLayersByIds: () => false,
    });
    return {manager, scene, history, historyProxy, repair};
}

afterEach(async () => {
    await act(async () => {
        cleanup();
        await Promise.resolve();
    });
    historyProxy?.dispose();
    historyProxy = undefined;
    if (scene) disposeEditingScene(scene);
    scene = undefined;
    manager?.destroy();
    manager = undefined;
    runtime?.dispose();
    runtime = undefined;
    history = undefined;
    vi.restoreAllMocks();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

describe('orphan repair history controller lifecycle', () => {
    it('redos prepend after undo has committed the orphan controller unmount', async () => {
        const fixture = createFixture();
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        expect(fixture.manager.layerManager.controllers.orphan).toBeUndefined();

        let prepended = false;
        act(() => { prepended = fixture.repair.prependRepairOrphans(fixture.scene.version, ['orphan']); });
        expect(prepended).toBe(true);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.orphan).toBeTruthy());
        const orphanController = fixture.manager.layerManager.controllers.orphan;
        expect(document.getElementById('orphan')).toBeInTheDocument();
        expect(fixture.scene.layers.read()?.layerHeader).toBe('orphan');

        let undone = false;
        act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(undone).toBe(true);
        await waitFor(() => expect(document.getElementById('orphan')).not.toBeInTheDocument());
        await waitFor(() => expect(fixture.manager.layerManager.controllers.orphan).toBeUndefined());
        expect(fixture.scene.layers.read()?.layerHeader).toBe('first');
        expect(orphanController.destroy).toHaveBeenCalledOnce();

        let redone = false;
        act(() => { redone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(redone).toBe(true);
        expect(fixture.scene.layers.read()?.layerHeader).toBe('orphan');
        await waitFor(() => expect(fixture.manager.layerManager.controllers.orphan).toBeTruthy());
        expect(fixture.manager.layerManager.controllers.orphan).not.toBe(orphanController);
        expect(orphanController.destroy).toHaveBeenCalledOnce();
        view.unmount();
    });
});
