/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import CanvasRender from '@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts';
import GroupLayerDefinition from '@/plugins/designer-runtime/internal/builtin/group-layer/GroupLayerDefinition.ts';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts';
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';

useMemoryLocalStorage();

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
let runtime: DesignerRuntimeContext | undefined;
let manager: DesignerManager | undefined;
let scene: ReturnType<typeof createEditingScene> | undefined;
let historyProxy: HistoryRecordOperateProxy | undefined;

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
    const first = {id: 'first', type: 'fixture', name: 'First', x: 0, y: 0, width: 100, height: 40, rotate: 0, transform: {}, order: 1, next: 'second'};
    const second = {id: 'second', type: 'fixture', name: 'Second', x: 0, y: 50, width: 100, height: 40, rotate: 0, transform: {}, order: 2, prev: 'first'};
    const config = (id: string) => ({base: {id, type: 'fixture', name: id}, data: {value: id}});
    manager.init({
        canvasManager: {width: 800, height: 600},
        layerManager: {
            layerHeader: first.id,
            layerTail: second.id,
            layerConfigs: {first, second},
            elemConfigs: {first: config('first'), second: config('second')},
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
    runtime.registry.definitions.group = new GroupLayerDefinition();
    runtime.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    scene = createEditingScene(manager, runtime.managerStore.sceneVersion, () => manager!.isRuntimeActive());
    const history = new HistoryOperator(() => []);
    let selectedIds = ['first', 'second'];
    const eventOperateStore = {
        get directSelectedIds() { return [...selectedIds]; },
        setTargetIds(ids: string[]) { selectedIds = [...ids]; },
        setAddRecordCompId: vi.fn(),
        focusDesignerCanvas: vi.fn(),
    } as never;
    historyProxy = new HistoryRecordOperateProxy({
        eventOperateStore,
        history,
        readScene: () => scene,
        isActive: () => Boolean(manager?.isRuntimeActive()),
    });
    return {manager, scene, history, historyProxy};
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
    vi.restoreAllMocks();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

describe('CanvasRender grouping controller identity history', () => {
    it('keeps rename history valid across group reparent, undo, and redo', async () => {
        const fixture = createFixture();
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        await waitFor(() => expect(fixture.manager.layerManager.controllers.second).toBeTruthy());
        const originalFirst = fixture.manager.layerManager.controllers.first;
        const originalSecond = fixture.manager.layerManager.controllers.second;

        let renameChange: ReturnType<typeof fixture.scene.layers.rename>;
        act(() => {
            renameChange = fixture.scene.layers.rename('first', 'Renamed first');
            expect(renameChange).toBeTruthy();
            expect(fixture.history.recordChange(renameChange!)).toBe(true);
        });
        expect(fixture.scene.layers.read()?.layers.first.name).toBe('Renamed first');
        expect(fixture.manager.layerManager.controllers.first).toBe(originalFirst);

        act(() => fixture.historyProxy.doGrouping());
        await waitFor(() => expect(Object.values(fixture.manager.layerManager.layerConfigs).some(layer => layer.type === 'group')).toBe(true));
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).not.toBe(originalFirst));
        await waitFor(() => expect(fixture.manager.layerManager.controllers.second).not.toBe(originalSecond));
        expect(originalFirst.destroy).toHaveBeenCalledOnce();
        expect(originalSecond.destroy).toHaveBeenCalledOnce();

        let undone = false;
        act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(undone).toBe(true);
        await waitFor(() => expect(Object.values(fixture.manager.layerManager.layerConfigs).some(layer => layer.type === 'group')).toBe(false));
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        await waitFor(() => expect(fixture.manager.layerManager.controllers.second).toBeTruthy());
        expect(fixture.scene.layers.read()?.layers.first.name).toBe('Renamed first');

        let renameUndone = false;
        act(() => { renameUndone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        expect(renameUndone).toBe(true);
        expect(fixture.scene.layers.read()?.layers.first.name).toBe('First');

        let renameRedone = false;
        act(() => { renameRedone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(renameRedone).toBe(true);
        expect(fixture.scene.layers.read()?.layers.first.name).toBe('Renamed first');

        let redone = false;
        act(() => { redone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(redone).toBe(true);
        await waitFor(() => expect(Object.values(fixture.manager.layerManager.layerConfigs).some(layer => layer.type === 'group')).toBe(true));
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        await waitFor(() => expect(fixture.manager.layerManager.controllers.second).toBeTruthy());
        view.unmount();
    });
});
