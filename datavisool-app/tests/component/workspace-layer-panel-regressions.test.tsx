/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import type {EditorLayerNode} from '@datavisool/sdk/plugin/contracts/editorCanvas';

const selection = vi.hoisted(() => ({
    targetIds: [] as string[],
    setTargetIds: (ids: string[]) => { selection.targetIds = ids; },
}));

vi.mock('@/plugins/editor-canvas/state/EventOperateStore', () => ({default: selection}));
vi.mock('@/plugins/editor-canvas/history/HistoryRecordOperateProxy', () => ({default: {}}));
vi.mock('@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: {}}}));
vi.mock('@/plugins/editor-inspector/ConfigContent', () => ({default: () => <div role="region" aria-label="组件属性"/>}));

import LayerItem from '@/plugins/editor-layers/item/LayerItem.tsx';
import {DesignerDockState} from '@/plugins/editor-shell/dock/DesignerDockState.ts';
const designerLeftStore = new DesignerDockState(() => 1);
import DesignerRight from '@/plugins/editor-inspector/DesignerRight.tsx';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {tx} from '@/i18n/miniI18n.ts';
import type {EditorCanvasService} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import {applySelectionChange} from '@/plugins/editor-inspector/InspectorSelection.ts';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';
import {EditorLayersState} from '@/plugins/editor-layers/EditorLayersState.ts';

const {domain} = createInspectorTestDomain(['a', 'b'].map(id => createInspectorTarget(id, 'rect', id.toUpperCase())));
const inspectorStore = createInspectorStore();
const closePanel = (restoreFocus: boolean) => inspectorStore.setContentVisible(false, restoreFocus);

let layerState: EditorLayersState;
let layerNodes: EditorLayerNode[];
const canvas: Pick<EditorCanvasService, 'readSelection' | 'select' | 'closeContextMenu'> = {
    readSelection: () => ({ids: selection.targetIds, source: 'layer-list'}),
    closeContextMenu() {},
    select(ids, source = 'system', interaction) {
        selection.setTargetIds([...ids]);
        applySelectionChange({ids, source, interaction}, domain, inspectorStore);
    },
};

const LayerPanel = observer(() => designerLeftStore.panelOpen ? <div className="layer-items">
    <LayerItem compId="a" name="A" type="rect" canvas={canvas} onSelect={(id, event) => layerState.selectLayer(id, event, canvas, layerNodes)}/>
    <LayerItem compId="b" name="B" type="rect" canvas={canvas} onSelect={(id, event) => layerState.selectLayer(id, event, canvas, layerNodes)}/>
</div> : null);

describe('layer selection with responsive panels', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('innerWidth', 900);
        selection.targetIds = [];
        layerState = new EditorLayersState();
        layerState.setScene(1);
        layerNodes = [
            {id: 'a', type: 'rect', name: 'A', order: 2, effectiveHidden: false, effectiveLocked: false},
            {id: 'b', type: 'rect', name: 'B', order: 1, effectiveHidden: false, effectiveLocked: false},
        ];
        inspectorStore.clearTarget();
        inspectorStore.setPanelOrderProvider(() => 1);
        designerLeftStore.setActiveModule('layer-list');
    });

    afterEach(() => {
        cleanup();
        layerState.dispose();
        designerLeftStore.closePanel(false);
        inspectorStore.clearTarget();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const mountPanels = () => render(<><LayerPanel/><DesignerRight domain={domain} closePanel={closePanel} store={inspectorStore} trackTask={task => task}/></>);
    const flushSelection = () => act(() => { vi.runAllTimers(); });

    test('keeps the clicked row mounted so a double click can enter rename', () => {
        mountPanels();
        const row = screen.getByTitle('A');
        fireEvent.click(row);
        flushSelection();

        expect(row).toBeInTheDocument();
        expect(inspectorStore.activeElem.id).toBe('a');
        expect(screen.queryByRole('region', {name: '组件属性'})).not.toBeInTheDocument();
        fireEvent.doubleClick(row);
        expect(screen.getByRole('textbox')).toHaveValue('A');
    });

    test.each(['ctrlKey', 'metaKey', 'shiftKey'])('keeps the list available for consecutive %s selection', (modifier) => {
        mountPanels();
        fireEvent.click(screen.getByTitle('A'));
        flushSelection();
        fireEvent.click(screen.getByTitle('B'), {[modifier]: true});
        flushSelection();

        expect(selection.targetIds).toEqual(['a', 'b']);
        expect(inspectorStore.activeElem.id).toBe('b');
        expect(screen.getByTitle('A')).toBeInTheDocument();
        expect(screen.getByTitle('B')).toBeInTheDocument();
        expect(designerLeftStore.panelOpen).toBe(true);
        expect(inspectorStore.panelOpen).toBe(false);
    });

    test('still switches to properties when their menu is explicitly clicked', () => {
        mountPanels();
        fireEvent.click(screen.getByTitle('A'));
        flushSelection();
        fireEvent.click(screen.getByRole('button', {name: tx('基础')}));

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(inspectorStore.panelOpen).toBe(true);
    });

    test('still opens properties for canvas activation on a narrow screen', () => {
        mountPanels();
        act(() => inspectorStore.activateTarget(createInspectorTarget('a')));

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(designerLeftStore.panelOpen).toBe(true);
    });

    test('keeps both list and properties visible for selection on a wide screen', () => {
        vi.stubGlobal('innerWidth', 960);
        mountPanels();
        fireEvent.click(screen.getByTitle('A'));
        flushSelection();

        expect(screen.getByTitle('A')).toBeInTheDocument();
        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
    });
});
