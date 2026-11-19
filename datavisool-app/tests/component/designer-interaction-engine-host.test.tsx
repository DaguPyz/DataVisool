/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const hostState = vi.hoisted(() => {
    let targetIds: string[] = [];
    let selectionSource = 'canvas';
    let dsContentRef: HTMLDivElement | null = null;
    let layers: Record<string, any> = {};
    let canvasConfig: Record<string, any> = {width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false};
    let scene: any = {version: 1, isActive: () => true, readLayerConfigs: () => layers};
    let interactionRef: any = null;
    let prepareCanvasMenu: ((position: [number, number]) => any[]) | null = null;
    const eventOperateStore = {
        get dsContentRef() { return dsContentRef; },
        get scale() { return 1; },
        get targetIds() { return targetIds; },
        get directSelectedIds() { return targetIds; },
        get selectionSource() { return selectionSource; },
        get interactionRef() { return interactionRef; },
        setDsContentRef: (value: HTMLDivElement | null) => { dsContentRef = value; },
        setTargetIds: vi.fn((ids: string[], source = 'system') => { targetIds = ids; selectionSource = source; }),
        setInteractionRef: vi.fn((value: any) => { interactionRef = value; }),
        setGroupCoordinate: vi.fn(),
        emitLayerUiEvent: vi.fn(),
        emitInspectorChange: vi.fn(),
        captureScene: () => scene,
        isSceneCurrent: (candidate: any) => candidate === scene && candidate.isActive(),
        isActive: () => true,
        readLegacyModel: () => ({layerManager: {
            get layerConfigs() { return layers; },
            updateLayer: (items: Array<{id: string; x?: number; y?: number; rotate?: number}>) => {
                items.forEach(item => { layers[item.id] = {...layers[item.id], ...item}; });
            },
        }}),
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
        setCanvasConfig: (value: Record<string, any>) => { canvasConfig = value; },
        getCanvasConfig: () => canvasConfig,
        setScene: (value: any) => { scene = value; },
        getScene: () => scene,
        setSelection: (ids: string[]) => { targetIds = ids; selectionSource = 'canvas'; },
    };
});

vi.mock('@/plugins/editor-canvas/state/EventOperateStore.ts', () => ({default: hostState.eventOperateStore}));
vi.mock('@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts', () => ({default: hostState.historyRecordOperateProxy}));
vi.mock('@/plugins/editor-canvas/layers/LayerUtil.ts', () => ({default: {
    findLayerGroupChain: vi.fn(() => []),
}}));
vi.mock('@/plugins/designer-runtime/internal/designer/left/global-variable/parse/ComponentDataGvParser.ts', () => ({default: {unbindFromGv: vi.fn()}}));
vi.mock('@/util/TextUtil.ts', () => ({default: {copyToClipboard: vi.fn(async () => undefined)}}));
vi.mock('@datavisool/ui', () => ({globalMessage: {messageApi: {success: vi.fn()}}}));
vi.mock('@/util/DomUtil.ts', () => ({default: {
    isViewInContainer: vi.fn(() => true),
    calculatesDistanceFromContainer: vi.fn(() => 0),
    updateDomStyle: (element: HTMLElement, style: Record<string, string>) => Object.assign(element.style, style),
}}));
vi.mock('@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts', () => ({default: {
    setCanvasMenuPrepare: (value: ((position: [number, number]) => any[]) | null) => hostState.setCanvasMenuPrepare(value),
}}));

import DesignerInteractionEngine from '@/plugins/editor-canvas/interaction/DesignerInteractionEngine';
import {DragRollbackImpl} from '@/plugins/editor-canvas/history/core/DragRollbackImpl';
import {createSelectionCommands} from '@/plugins/editor-canvas/selection/SelectionCommands';
import {EditorCanvasActivationProvider} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';

const interactionInput = {isActive: () => false, isActiveWithExactModifiers: () => false, subscribePressedState: () => () => {}};

function createActivation(enableAdsorption: boolean) {
    const scene = {version: 1, isActive: () => true, readLayerConfigs: () => hostState.getLayers()};
    hostState.setScene(scene);
    const sceneStore = {
        revision: 1,
        readLayerConfigs: () => hostState.getLayers(),
        readOptions: () => ({enableAdsorption, rasterize: false, dragStep: 1, resizeStep: 1}),
        readCanvasConfig: () => hostState.getCanvasConfig(),
    };
    const selectionCommands = createSelectionCommands({
        eventOperateStore: hostState.eventOperateStore as any,
        historyProxy: hostState.historyRecordOperateProxy as any,
        readScene: () => hostState.getScene(),
        isActive: () => true,
    });
    return {
        eventOperateStore: hostState.eventOperateStore,
        contextMenuStore: {setCanvasMenuPrepare: (value: ((position: [number, number]) => any[]) | null) => hostState.setCanvasMenuPrepare(value)},
        historyProxy: hostState.historyRecordOperateProxy,
        sceneStore,
        selectionCommands,
        canEdit: () => true,
        isActive: () => true,
        readScene: () => hostState.getScene(),
    } as any;
}

const renderInteraction = (activation: any) => <EditorCanvasActivationProvider value={activation}>
    <DesignerInteractionEngine input={interactionInput}/>
</EditorCanvasActivationProvider>;

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

afterEach(() => {
    cleanup();
    hostState.eventOperateStore.setDsContentRef(null);
    hostState.eventOperateStore.setTargetIds.mockClear();
    hostState.eventOperateStore.setInteractionRef.mockClear();
    hostState.setCanvasMenuPrepare(null);
    hostState.eventOperateStore.setGroupCoordinate.mockClear();
    hostState.historyRecordOperateProxy.doDrag.mockClear();
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

        hostState.setCanvasConfig({width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false});

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

        const activation = createActivation(true);
        render(renderInteraction(activation));
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

        hostState.setCanvasConfig({width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false});

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

        const activation = createActivation(false);
        const {rerender} = render(renderInteraction(activation));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        const prepareMenu = hostState.getCanvasMenuPrepare();
        const interaction = hostState.getInteractionRef();
        expect(prepareMenu).toBeTruthy();
        expect(prepareMenu!([20, 30]).map((item) => item.id)).toContain('first');
        expect(canvas.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.transform)
            .toBe('translate(10px, 20px) rotate(0deg)');

        // Undo replaces a layer record in the same manager map and refreshes one id.
        await act(async () => {
            new DragRollbackImpl(hostState.eventOperateStore as any).undo({
                prev: [{id: 'first', x: 200, y: 150, rotate: 30}],
                next: [{id: 'first', x: 10, y: 20, rotate: 0}],
                selectionIds: ['first'],
            } as any);
            await Promise.resolve();
        });
        rerender(renderInteraction(activation));
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
        rerender(renderInteraction(activation));
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

        hostState.setCanvasConfig({width: 500, height: 300, boxSelectionMode: 'intersect', rasterize: false});

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
            element.getBoundingClientRect = () => box(hostState.getLayers()[layer.id].x, hostState.getLayers()[layer.id].y, hostState.getLayers()[layer.id].width, hostState.getLayers()[layer.id].height);
        }

        const activation = createActivation(false);
        const selectionCommands = activation.selectionCommands;
        const {rerender} = render(renderInteraction(activation));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        act(() => { selectionCommands.groupLeftAligned(); });
        rerender(renderInteraction(activation));
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

        expect(hostState.getLayers().first.x).toBe(10);
        expect(hostState.getLayers().second.x).toBe(10);
        expect(document.getElementById('first')?.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(document.getElementById('second')?.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(canvas.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.transform)
            .toBe('translate(10px, 20px) rotate(0deg)');
        expect(hostState.getCanvasMenuPrepare()!([20, 30]).map((item) => item.id)).toEqual(['second', 'first']);
        expect(hostState.getCanvasMenuPrepare()!([140, 30]).map((item) => item.id)).toEqual([]);
    });
});
