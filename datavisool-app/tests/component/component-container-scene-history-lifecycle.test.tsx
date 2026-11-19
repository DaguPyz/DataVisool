/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, waitFor} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cloneDeep} from 'lodash';
import {runInAction} from 'mobx';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';

import ComponentContainer from '@/plugins/designer-runtime/internal/framework/core/ComponentContainer';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager';
import {createEditingScene, disposeEditingScene} from '@/plugins/designer-runtime/editingScene';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator';
import {HistoryRecordOperateProxy} from '@/plugins/editor-canvas/history/HistoryRecordOperateProxy';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
let runtime: DesignerRuntimeContext | undefined;
let manager: DesignerManager | undefined;
let scene: ReturnType<typeof createEditingScene> | undefined;
let historyProxy: HistoryRecordOperateProxy | undefined;
let releaseFirstCreate: (() => void) | undefined;

const CanvasHost = observer(({value}: {value: DesignerManager}) => <>
    {Object.values(value.layerManager.layerConfigs).map(layer => {
        const key = value.layerManager.getRenderKey(layer.id!);
        return <ComponentContainer key={`${layer.id}:${key}`} layer={layer} designerManager={value}/>;
    })}
</>);

function createFixture(options: {delayFirstCreate?: boolean} = {}) {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT};
    runtime = new DesignerRuntimeContext();
    manager = new DesignerManager(DesignerScene.DEFAULT, runtime);
    const firstLayer = {id: 'first', type: 'fixture', name: 'First', x: 0, y: 0, width: 100, height: 40, rotate: 0, transform: {}};
    manager.init({
        canvasManager: {width: 800, height: 600} as any,
        layerManager: {
            layerHeader: 'first',
            layerTail: 'first',
            layerConfigs: {first: firstLayer},
            elemConfigs: {},
        } as any,
    } as any, DesignerMode.EDIT);

    let delayedOnce = false;
    class FixtureController {
        config: any;
        index?: number;
        create = vi.fn(() => {
            if (options.delayFirstCreate && this.config?.base?.id === 'first' && !delayedOnce) {
                delayedOnce = true;
                return new Promise<void>(resolve => { releaseFirstCreate = resolve; });
            }
            return Promise.resolve();
        });
        destroy = vi.fn();
        setVisible = vi.fn();
        updateFilter = vi.fn();
        registerEvent = vi.fn();
        loadComponentData = vi.fn();
        getConfig = () => this.config;
        changeData = vi.fn();
    }
    runtime.registry.definitions.fixture = {
        getController: () => FixtureController,
        getInitConfig: () => ({base: {}, data: {}}),
    } as any;
    runtime.registry.definitions.alternate = {
        getController: () => FixtureController,
        getInitConfig: () => ({base: {type: 'alternate'}, data: {}}),
    } as any;

    runtime.managerStore.resetManagerStack(manager, true, DesignerScene.DEFAULT);
    scene = createEditingScene(manager, runtime.managerStore.sceneVersion, () => manager!.isRuntimeActive());
    const history = new HistoryOperator(() => []);
    const eventOperateStore = {
        addRecordCompId: 'second',
        setAddRecordCompId: vi.fn(),
    } as any;
    historyProxy = new HistoryRecordOperateProxy({
        eventOperateStore,
        history,
        readScene: () => scene,
        isActive: () => Boolean(manager?.isRuntimeActive()),
    });
    return {manager, scene, history, historyProxy, firstLayer};
}

afterEach(async () => {
    if (releaseFirstCreate) {
        await act(async () => {
            releaseFirstCreate?.();
            await Promise.resolve();
        });
        releaseFirstCreate = undefined;
    }
    cleanup();
    historyProxy?.dispose();
    historyProxy = undefined;
    if (scene) disposeEditingScene(scene);
    scene = undefined;
    manager?.destroy();
    manager = undefined;
    runtime?.dispose();
    runtime = undefined;
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

describe('ComponentContainer controller identity and scene history', () => {
    it('keeps an initializing neighbor controller stable so a second insertion can undo and redo', async () => {
        const fixture = createFixture({delayFirstCreate: true});
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        const firstController = fixture.manager.layerManager.controllers.first;

        act(() => fixture.historyProxy.doAdd({
            id: 'second', type: 'fixture', name: 'Second', x: 10, y: 0, width: 100, height: 40,
            rotate: 0, transform: {}, lock: false, hide: false,
        } as any));
        await waitFor(() => expect(Object.keys(fixture.manager.layerManager.layerConfigs)).toHaveLength(2));
        await waitFor(() => expect(fixture.manager.layerManager.controllers.second).toBeTruthy());

        const sameController = fixture.manager.layerManager.controllers.first === firstController;
        let undone = false;
        act(() => { undone = fixture.history.undo(() => { throw new Error('Expected scene-model history'); }); });
        const afterUndo = Object.keys(fixture.manager.layerManager.layerConfigs).length;
        expect({sameController, undone, afterUndo}).toEqual({sameController: true, undone: true, afterUndo: 1});

        await act(async () => {
            releaseFirstCreate?.();
            releaseFirstCreate = undefined;
            await Promise.resolve();
        });
        await waitFor(() => expect(firstController.setVisible).toHaveBeenCalled());
        let redone = false;
        act(() => { redone = fixture.history.redo(() => { throw new Error('Expected scene-model history'); }); });
        expect(redone).toBe(true);
        expect(Object.keys(fixture.manager.layerManager.layerConfigs)).toHaveLength(2);
        expect(fixture.manager.layerManager.controllers.first).toBe(firstController);
        view.unmount();
    });

    it('updates layout styles without replacing a settled controller', async () => {
        const fixture = createFixture();
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first.create).toHaveResolved());
        const controller = fixture.manager.layerManager.controllers.first;
        const before = fixture.scene.layers.read()!;
        const next = {...cloneDeep(before), sceneIdentity: before.sceneIdentity};
        next.layers.first = {...next.layers.first, x: 42, y: 13, width: 180};

        let change: ReturnType<typeof fixture.scene.layers.replace>;
        act(() => { change = fixture.scene.layers.replace(before, next as any); });
        expect(change!).toBeTruthy();
        expect(fixture.manager.layerManager.controllers.first).toBe(controller);
        expect(controller.destroy).not.toHaveBeenCalled();
        expect(document.getElementById('first')?.style.transform).toBe('translate(42px, 13px) rotate(0deg)');

        act(() => expect(change!.undo()).toBe(true));
        expect(fixture.manager.layerManager.controllers.first).toBe(controller);
        expect(document.getElementById('first')?.style.transform).toBe('translate(0px, 0px) rotate(0deg)');
        act(() => expect(change!.redo()).toBe(true));
        expect(fixture.manager.layerManager.controllers.first).toBe(controller);
        expect(document.getElementById('first')?.style.transform).toBe('translate(42px, 13px) rotate(0deg)');
        view.unmount();
    });

    it('rebuilds the controller when the layer render generation changes', async () => {
        const fixture = createFixture();
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        const original = fixture.manager.layerManager.controllers.first;

        act(() => fixture.manager.layerManager.addItem({...fixture.firstLayer, x: 25} as any));
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).not.toBe(original));
        expect(original.destroy).toHaveBeenCalledOnce();
        expect(fixture.manager.layerManager.controllers.first.create).toHaveBeenCalledOnce();
        view.unmount();
    });

    it('rebuilds for real type and id changes without double-destroying the old controller', async () => {
        const fixture = createFixture();
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first?.setVisible).toHaveBeenCalled());
        const original = fixture.manager.layerManager.controllers.first;

        const beforeType = fixture.scene.layers.read()!;
        const nextType = {...cloneDeep(beforeType), sceneIdentity: beforeType.sceneIdentity};
        nextType.layers.first = {...nextType.layers.first, type: 'alternate'};
        nextType.configs.first = {
            ...(nextType.configs.first as any),
            base: {...(nextType.configs.first as any).base, type: 'alternate'},
        };
        act(() => { fixture.scene.layers.replace(beforeType, nextType as any); });
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).not.toBe(original));
        const alternate = fixture.manager.layerManager.controllers.first;
        expect(original.destroy).toHaveBeenCalledOnce();

        const beforeId = fixture.scene.layers.read()!;
        const nextId = {...cloneDeep(beforeId), sceneIdentity: beforeId.sceneIdentity};
        nextId.layers = {
            second: {id: 'second', type: 'alternate', name: 'Second', x: 0, y: 0, width: 100, height: 40, rotate: 0, transform: {}},
        } as any;
        nextId.configs = {
            second: {base: {id: 'second', type: 'alternate', name: 'Second'}, data: {}},
        };
        nextId.layerHeader = 'second';
        nextId.layerTail = 'second';
        act(() => { fixture.scene.layers.replace(beforeId, nextId as any); });
        await waitFor(() => expect(fixture.manager.layerManager.controllers.second).toBeTruthy());
        expect(fixture.manager.layerManager.controllers.first).toBeUndefined();
        expect(alternate.destroy).toHaveBeenCalledOnce();
        expect(fixture.manager.layerManager.controllers.second.getConfig().base.id).toBe('second');
        view.unmount();
    });

    it('rebuilds controllers when their index identity changes', async () => {
        const fixture = createFixture();
        const IndexedHost = observer(({index}: {index: number}) => <ComponentContainer
            layer={fixture.manager.layerManager.layerConfigs.first}
            designerManager={fixture.manager}
            index={index}
        />);
        const view = render(<IndexedHost index={0}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first_0).toBeTruthy());
        const original = fixture.manager.layerManager.controllers.first_0;

        view.rerender(<IndexedHost index={1}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first_1).toBeTruthy());
        expect(fixture.manager.layerManager.controllers.first_1).not.toBe(original);
        expect(fixture.manager.layerManager.controllers.first_0).toBeUndefined();
        expect(original.destroy).toHaveBeenCalledOnce();
    });

    it('destroys a detached pending controller without deleting or destroying its replacement', async () => {
        const fixture = createFixture({delayFirstCreate: true});
        const view = render(<CanvasHost value={fixture.manager}/>);
        await waitFor(() => expect(fixture.manager.layerManager.controllers.first).toBeTruthy());
        const pendingController = fixture.manager.layerManager.controllers.first;
        const replacementConfig = cloneDeep(pendingController.getConfig());
        const replacement = {
            config: replacementConfig,
            getConfig: () => replacementConfig,
            destroy: vi.fn(),
        } as any;
        act(() => runInAction(() => { fixture.manager.layerManager.controllers.first = replacement; }));

        view.unmount();
        expect(pendingController.destroy).toHaveBeenCalledOnce();
        expect(fixture.manager.layerManager.controllers.first).toBe(replacement);
        expect(replacement.destroy).not.toHaveBeenCalled();

        await act(async () => {
            releaseFirstCreate?.();
            releaseFirstCreate = undefined;
            await Promise.resolve();
        });
        expect(pendingController.destroy).toHaveBeenCalledOnce();
        expect(fixture.manager.layerManager.controllers.first).toBe(replacement);
    });
});
