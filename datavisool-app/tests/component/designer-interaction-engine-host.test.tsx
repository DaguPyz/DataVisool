/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const hostState = vi.hoisted(() => {
    let targetIds: string[] = [];
    let dsContentRef: HTMLDivElement | null = null;
    let layers: Record<string, any> = {};
    let interactionRef: any = null;
    let prepareCanvasMenu: ((position: [number, number]) => any[]) | null = null;
    const eventOperateStore = {
        get dsContentRef() { return dsContentRef; },
        get scale() { return 1; },
        get targetIds() { return targetIds; },
        get directSelectedIds() { return targetIds; },
        get interactionRef() { return interactionRef; },
        setDsContentRef: (value: HTMLDivElement | null) => { dsContentRef = value; },
        setTargetIds: vi.fn((ids: string[]) => { targetIds = ids; }),
        setInteractionRef: vi.fn((value: any) => { interactionRef = value; }),
        setGroupCoordinate: vi.fn(),
    };
    const historyRecordOperateProxy = {
        doDrag: vi.fn((items: Array<{id: string; x: number; y: number}>) => {
            items.forEach((item) => { if (layers[item.id]) Object.assign(layers[item.id], item); });
        }),
        doResize: vi.fn(), doRotate: vi.fn(),
    };
    return {
        eventOperateStore,
        historyRecordOperateProxy,
        setCanvasMenuPrepare: (value: typeof prepareCanvasMenu) => { prepareCanvasMenu = value; },
        getInteractionRef: () => interactionRef,
        getCanvasMenuPrepare: () => prepareCanvasMenu,
        setLayers: (value: Record<string, any>) => { layers = value; },
        getLayers: () => layers,
        setSelection: (ids: string[]) => { targetIds = ids; },
    };
});

vi.mock('@/designer/operate-provider/EventOperateStore.ts', () => ({default: hostState.eventOperateStore}));
vi.mock('@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts', () => ({default: hostState.historyRecordOperateProxy}));
vi.mock('@/comps/common-component/base-info/BaseInfoStore.ts', () => ({default: {updateBaseConfig: vi.fn()}}));
vi.mock('@/designer/left/layer-list/util/LayerUtil.ts', () => ({default: {
    togglesGroupingUnfold: vi.fn(), findLayerGroupChain: vi.fn(() => []), reRenderLayerList: vi.fn(),
}}));
vi.mock('@/designer/left/layer-list/LayerListStore.ts', () => ({default: {layerInstances: {}}}));
vi.mock('@/designer/left/DesignerLeftStore.ts', () => ({default: {menu: 'canvas'}}));
vi.mock('@/designer/right/RightStore.ts', () => ({default: {activeConfig: vi.fn()}}));
vi.mock('@/designer/left/global-variable/parse/ComponentDataGvParser.ts', () => ({default: {unbindFromGv: vi.fn()}}));
vi.mock('@/util/TextUtil.ts', () => ({default: {copyToClipboard: vi.fn(async () => undefined)}}));
vi.mock('@datavisool/ui', () => ({globalMessage: {messageApi: {success: vi.fn()}}}));
vi.mock('@/designer/operate-provider/selection/SelectionDeleteCommand.ts', () => ({deleteSelectionTreeWithHistory: vi.fn()}));
vi.mock('@/util/DomUtil.ts', () => ({default: {
    isViewInContainer: vi.fn(() => true),
    calculatesDistanceFromContainer: vi.fn(() => 0),
    updateDomStyle: (element: HTMLElement, style: Record<string, string>) => Object.assign(element.style, style),
}}));
vi.mock('@/designer/event/ContextMenuStore.ts', () => ({default: {
    setCanvasMenuPrepare: (value: ((position: [number, number]) => any[]) | null) => hostState.setCanvasMenuPrepare(value),
}}));
vi.mock('@/designer/operate-provider/hot-key/ShortcutStore.ts', () => ({default: {isActive: () => false}}));

import DesignerInteractionEngine from '@/designer/operate-provider/interaction/DesignerInteractionEngine';
import dragRollbackImpl from '@/designer/operate-provider/undo-redo/core/DragRollbackImpl';
import {groupLeftAligned} from '@/designer/operate-provider/selection/SelectionCommands';
import {DesignerMode} from '@datavisool/sdk/types';

const box = (left: number, top: number, width: number, height: number) =>
    new DOMRect(left, top, width, height);

const pointer = (target: EventTarget, type: string, init: PointerEventInit = {}) => {
    target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        ...init,
    }));
};

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');

afterEach(() => {
    cleanup();
    hostState.eventOperateStore.setDsContentRef(null);
    hostState.eventOperateStore.setTargetIds.mockClear();
    hostState.eventOperateStore.setInteractionRef.mockClear();
    hostState.setCanvasMenuPrepare(null);
    hostState.eventOperateStore.setGroupCoordinate.mockClear();
    hostState.historyRecordOperateProxy.doDrag.mockClear();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
    document.body.replaceChildren();
});

describe('designer interaction host with the published interaction engine', () => {
    it('drags a multi-selection as a unit and snaps its edge to another component', async () => {
        const layerConfigs: Record<string, any> = {
            first: {id: 'first', type: 'BaseText', x: 10, y: 10, width: 100, height: 60, rotate: 0, order: 1},
            second: {id: 'second', type: 'BaseText', x: 130, y: 10, width: 100, height: 60, rotate: 0, order: 2},
            guide: {id: 'guide', type: 'BaseText', x: 260, y: 10, width: 100, height: 60, rotate: 0, order: 3},
        };
        hostState.setLayers(layerConfigs);
        hostState.setSelection(['first', 'second']);

        const manager = {
            layerManager: {layerConfigs, enableAdsorption: true},
            canvasManager: {canvasConfig: {width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false}},
        };
        (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT, currentManager: manager};

        const workspace = document.createElement('div');
        workspace.className = 'designer-ds-container';
        const canvas = document.createElement('div');
        canvas.id = 'designer-ds-content';
        workspace.append(canvas);
        document.body.append(workspace);
        hostState.eventOperateStore.setDsContentRef(canvas);
        workspace.getBoundingClientRect = () => box(0, 0, 500, 300);
        canvas.getBoundingClientRect = () => box(0, 0, 500, 300);

        for (const layer of Object.values(layerConfigs)) {
            const element = document.createElement('div');
            element.id = layer.id;
            element.dataset.type = layer.type;
            element.style.transform = `translate(${layer.x}px, ${layer.y}px)`;
            canvas.append(element);
            element.getBoundingClientRect = () => box(layer.x, layer.y, layer.width, layer.height);
        }

        render(<DesignerInteractionEngine/>);
        await act(async () => { await Promise.resolve(); });

        const first = document.getElementById('first')!;
        act(() => {
            pointer(first, 'pointerdown', {button: 0, buttons: 1, clientX: 20, clientY: 20});
            pointer(window, 'pointermove', {buttons: 1, clientX: 48, clientY: 20});
        });

        act(() => {
            pointer(window, 'pointerup', {button: 0, clientX: 48, clientY: 20});
        });

        expect(hostState.historyRecordOperateProxy.doDrag).toHaveBeenCalledOnce();
        const committed = hostState.historyRecordOperateProxy.doDrag.mock.calls[0][0];
        expect(committed).toEqual([
            expect.objectContaining({id: 'first', x: 40, y: 10}),
            expect.objectContaining({id: 'second', x: 160, y: 10}),
        ]);
        expect(layerConfigs.first.x).toBe(40);
        expect(layerConfigs.second.x).toBe(160);
        expect(first.style.transform).toContain('translate(40px, 10px)');
    });

    it('refreshes all cached geometry after an external in-place model update', async () => {
        const layerConfigs: Record<string, any> = {
            first: {id: 'first', type: 'BaseText', name: 'First', x: 10, y: 20, width: 120, height: 90, rotate: 0, order: 1},
        };
        hostState.setLayers(layerConfigs);
        hostState.setSelection(['first']);

        const manager = {
            layerManager: {
                layerConfigs,
                enableAdsorption: false,
                updateLayer: (items: Array<{id: string; x?: number; y?: number; rotate?: number}>) => {
                    items.forEach((item) => { layerConfigs[item.id] = {...layerConfigs[item.id], ...item}; });
                },
            },
            canvasManager: {canvasConfig: {width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false}},
        };
        (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT, currentManager: manager};

        const workspace = document.createElement('div');
        workspace.className = 'designer-ds-container';
        const canvas = document.createElement('div');
        canvas.id = 'designer-ds-content';
        workspace.append(canvas);
        document.body.append(workspace);
        hostState.eventOperateStore.setDsContentRef(canvas);
        workspace.getBoundingClientRect = () => box(0, 0, 500, 300);
        canvas.getBoundingClientRect = () => box(0, 0, 500, 300);

        const first = document.createElement('div');
        first.id = 'first';
        first.dataset.type = 'BaseText';
        first.style.transform = 'translate(10px, 20px) rotate(0deg)';
        first.style.width = '120px';
        first.style.height = '90px';
        canvas.append(first);
        first.getBoundingClientRect = () => box(layerConfigs.first.x, layerConfigs.first.y, layerConfigs.first.width, layerConfigs.first.height);

        const {rerender} = render(<DesignerInteractionEngine/>);
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        const prepareMenu = hostState.getCanvasMenuPrepare();
        const interaction = hostState.getInteractionRef();
        expect(prepareMenu).toBeTruthy();
        expect(prepareMenu!([20, 30]).map((item) => item.id)).toContain('first');
        expect(canvas.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.transform)
            .toBe('translate(10px, 20px) rotate(0deg)');

        // Undo replaces a layer record in the same manager map and refreshes one id.
        await act(async () => {
            dragRollbackImpl.undo({
                prev: [{id: 'first', x: 200, y: 150, rotate: 30}],
                next: [{id: 'first', x: 10, y: 20, rotate: 0}],
                selectionIds: ['first'],
            } as any);
            await Promise.resolve();
        });
        rerender(<DesignerInteractionEngine/>);
        await act(async () => { await Promise.resolve(); });
        act(() => { interaction.refreshOverlay(); });

        expect(hostState.eventOperateStore.targetIds).toEqual(['first']);
        expect({
            transform: first.style.transform,
            width: first.style.width,
            height: first.style.height,
            overlayTransform: canvas.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.transform,
            hitNewPosition: prepareMenu!([260, 195]).map((item) => item.id),
            hitOldPosition: prepareMenu!([20, 30]).map((item) => item.id),
        }).toEqual({
            transform: 'translate(200px, 150px) rotate(30deg)',
            width: '120px',
            height: '90px',
            overlayTransform: 'translate(200px, 150px) rotate(30deg)',
            hitNewPosition: ['first'],
            hitOldPosition: [],
        });

        // Then ask the host to refresh all geometry after another external update.
        hostState.setSelection(['first']);
        layerConfigs.first = {...layerConfigs.first, x: 350, y: 220, width: 130, height: 100, rotate: 45};
        rerender(<DesignerInteractionEngine/>);
        await act(async () => { await Promise.resolve(); });
        act(() => { interaction.refreshLayerGeometry(); });

        expect({
            transform: first.style.transform,
            width: first.style.width,
            height: first.style.height,
            overlayTransform: canvas.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.transform,
            hitNewPosition: prepareMenu!([410, 270]).map((item) => item.id),
            hitOldPosition: prepareMenu!([20, 30]).map((item) => item.id),
        }).toEqual({
            transform: 'translate(350px, 220px) rotate(45deg)',
            width: '130px',
            height: '100px',
            overlayTransform: 'translate(350px, 220px) rotate(45deg)',
            hitNewPosition: ['first'],
            hitOldPosition: [],
        });
    });

    it('keeps the published spatial index and overlay in sync after the real alignment command', async () => {
        const initialLayers: Record<string, any> = {
            first: {id: 'first', type: 'BaseText', name: 'First', x: 10, y: 20, width: 100, height: 80, rotate: 0, order: 1},
            second: {id: 'second', type: 'BaseText', name: 'Second', x: 130, y: 20, width: 100, height: 80, rotate: 0, order: 2},
        };
        hostState.setLayers(initialLayers);
        hostState.setSelection(['first', 'second']);

        const layerManager: any = {
            layerConfigs: initialLayers,
            enableAdsorption: false,
            reRenderLayer() {
                this.layerConfigs = {...this.layerConfigs};
                hostState.setLayers(this.layerConfigs);
            },
        };
        const manager = {
            layerManager,
            canvasManager: {canvasConfig: {width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false}},
        };
        (window as any).DATAVISOOL_ENV = {mode: DesignerMode.EDIT, currentManager: manager};

        const workspace = document.createElement('div');
        workspace.className = 'designer-ds-container';
        const canvas = document.createElement('div');
        canvas.id = 'designer-ds-content';
        workspace.append(canvas);
        document.body.append(workspace);
        hostState.eventOperateStore.setDsContentRef(canvas);
        workspace.getBoundingClientRect = () => box(0, 0, 500, 300);
        canvas.getBoundingClientRect = () => box(0, 0, 500, 300);

        for (const layer of Object.values(initialLayers)) {
            const element = document.createElement('div');
            element.id = layer.id;
            element.dataset.type = layer.type;
            element.style.transform = `translate(${layer.x}px, ${layer.y}px) rotate(${layer.rotate}deg)`;
            element.style.width = `${layer.width}px`;
            element.style.height = `${layer.height}px`;
            canvas.append(element);
            element.getBoundingClientRect = () => box(layerManager.layerConfigs[layer.id].x, layerManager.layerConfigs[layer.id].y, layerManager.layerConfigs[layer.id].width, layerManager.layerConfigs[layer.id].height);
        }

        const {rerender} = render(<DesignerInteractionEngine/>);
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        act(() => { groupLeftAligned(); });
        rerender(<DesignerInteractionEngine/>);
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        expect(layerManager.layerConfigs.first.x).toBe(10);
        expect(layerManager.layerConfigs.second.x).toBe(10);
        expect(document.getElementById('first')?.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(document.getElementById('second')?.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(canvas.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.transform)
            .toBe('translate(10px, 20px) rotate(0deg)');
        expect(hostState.getCanvasMenuPrepare()!([20, 30]).map((item) => item.id)).toEqual(['second', 'first']);
        expect(hostState.getCanvasMenuPrepare()!([140, 30]).map((item) => item.id)).toEqual([]);
    });
});
