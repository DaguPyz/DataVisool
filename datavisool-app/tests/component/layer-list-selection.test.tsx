/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import type {EditorCanvasService, EditorLayerNode, EditorSelectionSource} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {normalizeSelectionIds} from '@/plugins/editor-canvas/selection/SelectionPolicy.ts';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';
import {EditorLayersState} from '@/plugins/editor-layers/EditorLayersState.ts';
import LayerItem from '@/plugins/editor-layers/item/LayerItem.tsx';
import {applySelectionChange} from '@/plugins/editor-inspector/InspectorSelection.ts';

let inspectorStore: ReturnType<typeof createInspectorStore>;
const {domain} = createInspectorTestDomain(['a', 'b', 'c'].map(id => createInspectorTarget(id, 'rect', id.toUpperCase())));
const makeNode = (id: string, options: Partial<EditorLayerNode> = {}): EditorLayerNode => ({
    id,
    type: 'rect',
    name: id.toUpperCase(),
    order: 0,
    effectiveHidden: false,
    effectiveLocked: false,
    ...options,
});
const mouseEvent = (overrides: Partial<{ctrlKey: boolean; metaKey: boolean; shiftKey: boolean}> = {}) => ({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
}) as any;

describe('editor layers selection state', () => {
    let state: EditorLayersState;
    let selectedIds: string[];
    let selectionSource: EditorSelectionSource;
    let layers: EditorLayerNode[];
    const canvas: Pick<EditorCanvasService, 'readSelection' | 'select' | 'closeContextMenu'> = {
        readSelection: () => ({ids: selectedIds, source: selectionSource}),
        closeContextMenu() {},
        select(ids, source = 'system', interaction) {
            selectedIds = normalizeSelectionIds(ids, Object.fromEntries(flatten(layers).map(layer => [layer.id!, layer])));
            selectionSource = source;
            applySelectionChange({ids: selectedIds, source, interaction}, domain, inspectorStore);
        },
    };
    const select = (id: string, event: ReturnType<typeof mouseEvent>) =>
        state.selectLayer(id, event, canvas, layers);

    beforeEach(() => {
        inspectorStore = createInspectorStore();
        state = new EditorLayersState();
        state.setScene(1);
        selectedIds = [];
        selectionSource = 'system';
        layers = [makeNode('a', {order: 3}), makeNode('b', {order: 2, effectiveHidden: true}), makeNode('c', {order: 1, effectiveLocked: true})];
    });

    afterEach(() => {
        cleanup();
        inspectorStore.dispose();
        state.dispose();
    });

    test('single and Command/Ctrl clicks write canonical management selections', () => {
        select('b', mouseEvent());
        expect(selectedIds).toEqual(['b']);
        expect(selectionSource).toBe('layer-list');

        select('c', mouseEvent({metaKey: true}));
        expect(selectedIds).toEqual(['b', 'c']);

        select('b', mouseEvent({ctrlKey: true}));
        expect(selectedIds).toEqual(['c']);
    });

    test('Shift range includes effectively hidden and locked rows', () => {
        select('a', mouseEvent());
        select('c', mouseEvent({shiftKey: true}));
        expect(selectedIds).toEqual(['a', 'b', 'c']);
    });

    test('a stale range anchor falls back to the current selection', () => {
        select('a', mouseEvent());
        layers = layers.filter(layer => layer.id !== 'a');
        selectedIds = ['b'];
        select('c', mouseEvent({shiftKey: true}));
        expect(selectedIds).toEqual(['b', 'c']);
    });

    test('Shift range traverses nested and empty groups in persisted display order', () => {
        const a = makeNode('a', {type: 'rect', order: 4, next: 'empty'});
        const empty = makeNode('empty', {type: 'group', order: 3, children: [], next: 'b'});
        const b = makeNode('b', {pid: 'empty', order: 2, next: 'c'});
        const c = makeNode('c', {order: 1});
        layers = [a, {...empty, children: [b]}, c];
        select('a', mouseEvent());
        select('c', mouseEvent({shiftKey: true}));
        expect(selectedIds).toEqual(['a', 'empty', 'c']);
    });

    test('Shift range retains an empty group between ordinary rows', () => {
        const a = makeNode('a', {order: 4, next: 'empty'});
        const empty = makeNode('empty', {type: 'group', order: 3, next: 'b'});
        const b = makeNode('b', {order: 2, next: 'c'});
        const c = makeNode('c', {order: 1});
        layers = [a, empty, b, c];
        select('a', mouseEvent());
        select('c', mouseEvent({shiftKey: true}));
        expect(selectedIds).toEqual(['a', 'empty', 'b', 'c']);
    });

    test('Shift range continues when its upper endpoint is an empty group', () => {
        const empty = makeNode('empty', {type: 'group', order: 3, next: 'b'});
        const b = makeNode('b', {order: 2, next: 'c'});
        const c = makeNode('c', {order: 1});
        layers = [empty, b, c];
        select('empty', mouseEvent());
        select('c', mouseEvent({shiftKey: true}));
        expect(selectedIds).toEqual(['empty', 'b', 'c']);
    });

    test('hidden rows remain clickable and can enter inline rename', () => {
        const row = makeNode('b', {effectiveHidden: true});
        layers = [row];
        render(<LayerItem
            canvas={canvas}
            compId="b"
            name="B"
            type="rect"
            hide
            effectiveHide
            onSelect={(id, event) => state.selectLayer(id, event, canvas, layers)}
        />);

        const element = screen.getByTitle('B');
        fireEvent.click(element);
        expect(selectedIds).toEqual(['b']);
        expect(inspectorStore.activeElem.id).toBe('b');

        fireEvent.doubleClick(element);
        expect(screen.getByRole('textbox')).toHaveValue('B');
    });

    test('cancelling the clicked row keeps the property panel on a remaining selection', () => {
        selectedIds = ['b', 'c'];
        selectionSource = 'layer-list';
        inspectorStore.activateTarget(createInspectorTarget('b'));
        render(<LayerItem
            canvas={canvas}
            compId="b"
            name="B"
            type="rect"
            selected
            onSelect={(id, event) => state.selectLayer(id, event, canvas, layers)}
        />);

        fireEvent.click(screen.getByTitle('B'), {metaKey: true});

        expect(selectedIds).toEqual(['c']);
        expect(inspectorStore.activeElem.id).toBe('c');
    });

    test('ignores old-scene UI events and cancels delayed work on scene change or dispose', () => {
        vi.useFakeTimers();
        try {
            state.acceptUiEvent({kind: 'reveal', sceneVersion: 0, targetId: 'child', unfoldIds: ['group']});
            expect(state.isGroupExpanded('group')).toBe(false);

            const oldSceneWork = vi.fn();
            state.scheduleTimeout(oldSceneWork, 10);
            state.resetScene();
            state.setScene(2);
            vi.advanceTimersByTime(10);
            expect(oldSceneWork).not.toHaveBeenCalled();

            const disposedWork = vi.fn();
            state.scheduleTimeout(disposedWork, 10);
            state.dispose();
            vi.advanceTimersByTime(10);
            expect(disposedWork).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    test('selection state is reset when the editor scene changes', () => {
        select('a', mouseEvent());
        select('c', mouseEvent({shiftKey: true}));
        state.resetScene();
        state.setScene(2);
        layers = [makeNode('b'), makeNode('c')];
        selectedIds = ['b'];
        select('c', mouseEvent({shiftKey: true}));
        expect(selectedIds).toEqual(['b', 'c']);
    });
});

function flatten(layers: readonly EditorLayerNode[]): EditorLayerNode[] {
    return layers.flatMap(layer => [layer, ...(layer.children ? flatten(layer.children) : [])]);
}
