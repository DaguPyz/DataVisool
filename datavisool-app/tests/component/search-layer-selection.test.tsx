/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type {EditorCanvasService, EditorLayerDomain, EditorLayerNode, EditorSelectionSource} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {EditorLayersState} from '@/plugins/editor-layers/EditorLayersState.ts';
import {SearchLayer} from '@/plugins/editor-layers/search-layer/SearchLayer.tsx';

const stateMocks = vi.hoisted(() => ({
    targetIds: [] as string[],
    selectionSource: 'system' as EditorSelectionSource,
    setTargetIds: vi.fn((ids: readonly string[], source: EditorSelectionSource = 'system') => {
        stateMocks.targetIds = [...ids];
        stateMocks.selectionSource = source;
    }),
    focusDesignerCanvas: vi.fn(),
    insertLayer: vi.fn(),
}));

const group = {
    id: 'group', name: '父分组', type: 'group', hide: true, lock: true,
    effectiveHidden: true, effectiveLocked: true, order: 2,
    children: [{id: 'child', name: '目标图层', type: 'rect', pid: 'group', order: 1, effectiveHidden: true, effectiveLocked: true}],
} satisfies EditorLayerNode;
const layers: EditorLayerNode[] = [group];
const domain: EditorLayerDomain = {
    sceneVersion: 4,
    isActive: () => true,
    readTree: () => layers,
    readLayer: id => flatten(layers).find(layer => layer.id === id),
    readCanvasSize: () => ({width: 800, height: 600}),
    rename: () => false,
    setHidden: () => false,
    setLocked: () => false,
    reorder: () => false,
};
const catalog = {
    listCategories: () => [],
    listSubCategories: () => [],
    listComponents: () => [{
        key: 'BaseText',
        baseInfo: {compName: '文本', compKey: 'BaseText', width: 100, height: 40, categorize: '基础', subCategorize: '文本', source: '内置'},
        chartImage: null,
    }],
    getComponent: (key: string) => key === 'BaseText' ? {
        key: 'BaseText',
        baseInfo: {compName: '文本', compKey: 'BaseText', width: 100, height: 40},
        chartImage: null,
    } : undefined,
    createInitialConfig: () => ({base: {name: '文本'}}),
} satisfies DesignerCatalog;
const canvas: EditorCanvasService = {
    registerShortcutInput: () => () => undefined,
    prepareInspectorDomain: async () => { throw new Error('not used'); },
    prepareLayerDomain: async () => domain,
    readSelection: () => ({ids: stateMocks.targetIds, source: stateMocks.selectionSource}),
    readInputContext: () => ({pointerTarget: null, contextMenuOpen: false}),
    closeContextMenu: vi.fn(),
    select: stateMocks.setTargetIds,
    isSceneActive: () => true,
    performAction: async () => undefined,
    paste: async () => undefined,
    getLayerType: () => 'rect',
    focus: stateMocks.focusDesignerCanvas,
    resolveDrop: () => null,
    insertLayer: stateMocks.insertLayer,
    insertTemplate: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    prepareRepair: async () => ({
        readRepairAnalysis: vi.fn(),
        readRepairLayer: vi.fn(),
        locateRepairLayer: vi.fn(() => false),
        deleteRepairOrphans: vi.fn(() => false),
        prependRepairOrphans: vi.fn(() => false),
        repairTailPointer: vi.fn(() => false),
    }),
};

describe('search layers with public canvas and catalog data', () => {
    let state: EditorLayersState;

    beforeEach(() => {
        vi.clearAllMocks();
        state = new EditorLayersState();
        state.setScene(domain.sceneVersion);
        state.setSearchOpen(true);
    });

    afterEach(() => {
        cleanup();
        state.dispose();
        vi.restoreAllMocks();
    });

    test('shows effective ancestor state and locates a hidden locked layer through the search source', async () => {
        render(<SearchLayer canvas={canvas} state={state} catalog={catalog} prepareLayerDomain={async () => domain}/>);
        fireEvent.change(screen.getByPlaceholderText('请输入图层名、组件名或组件 Key'), {target: {value: '目标'}});
        expect(await screen.findByText('目标图层')).toBeInTheDocument();
        expect(screen.getByText('已隐藏')).toBeInTheDocument();
        expect(screen.getByText('已锁定')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: /目标图层/}));
        await waitFor(() => expect(stateMocks.setTargetIds).toHaveBeenCalledWith(['child'], 'search', {kind: 'inspect', id: 'child'}));
    });

    test('adds a catalog component centered using the active canvas size', async () => {
        render(<SearchLayer canvas={canvas} state={state} catalog={catalog} prepareLayerDomain={async () => domain}/>);
        fireEvent.change(screen.getByPlaceholderText('请输入图层名、组件名或组件 Key'), {target: {value: '文本'}});
        fireEvent.click(await screen.findByRole('button', {name: /文本/}));

        expect(stateMocks.insertLayer).toHaveBeenCalledWith(expect.objectContaining({type: 'BaseText', x: 350, y: 280, width: 100, height: 40}), {base: {name: '文本'}});
    });

    test('waits for two animation frames before focusing the search input', async () => {
        const frameCallbacks = new Map<number, FrameRequestCallback>();
        let nextFrameId = 1;
        const requestFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            const frameId = nextFrameId++;
            frameCallbacks.set(frameId, callback);
            return frameId;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frameId => { frameCallbacks.delete(frameId); });
        const flushFrame = (timestamp: number) => {
            const callbacks = [...frameCallbacks.entries()];
            callbacks.forEach(([frameId]) => frameCallbacks.delete(frameId));
            act(() => callbacks.forEach(([, callback]) => callback(timestamp)));
        };

        render(<SearchLayer canvas={canvas} state={state} catalog={catalog} prepareLayerDomain={async () => domain}/>);
        const input = await screen.findByPlaceholderText('请输入图层名、组件名或组件 Key');
        const focusSpy = vi.spyOn(input, 'focus');
        await waitFor(() => expect(requestFrameSpy).toHaveBeenCalled());
        const initialFrameCount = requestFrameSpy.mock.calls.length;
        flushFrame(0);
        expect(requestFrameSpy.mock.calls.length).toBeGreaterThan(initialFrameCount);
        expect(focusSpy).not.toHaveBeenCalled();
        flushFrame(16);
        expect(focusSpy).toHaveBeenCalledOnce();
    });
});

function flatten(items: readonly EditorLayerNode[]): EditorLayerNode[] {
    return items.flatMap(item => [item, ...(item.children ? flatten(item.children) : [])]);
}
