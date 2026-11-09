/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {observer} from 'mobx-react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

const selection = vi.hoisted(() => ({
    targetIds: [] as string[],
    setTargetIds: (ids: string[]) => { selection.targetIds = ids; },
}));

vi.mock('@/designer/operate-provider/EventOperateStore', () => ({default: selection}));
vi.mock('@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy', () => ({default: {}}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: {}}}));
vi.mock('@/designer/right/status-list/StatusListStore.ts', () => ({default: {init: vi.fn()}}));
vi.mock('@/designer/right/ConfigContent', () => ({default: () => <div role="region" aria-label="组件属性"/>}));

import LayerItem from '@/designer/left/layer-list/item/LayerItem.tsx';
import designerLeftStore from '@/designer/left/DesignerLeftStore.ts';
import DesignerRight from '@/designer/right/DesignerRight.tsx';
import rightStore from '@/designer/right/RightStore.ts';
import {tx} from '@/i18n/miniI18n.ts';

const LayerPanel = observer(() => designerLeftStore.panelOpen ? <div className="layer-items">
    <LayerItem compId="a" name="A" type="rect"/>
    <LayerItem compId="b" name="B" type="rect"/>
</div> : null);

describe('layer selection with responsive panels', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('innerWidth', 900);
        selection.targetIds = [];
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: {
            a: {id: 'a', type: 'rect', order: 2, next: 'b'},
            b: {id: 'b', type: 'rect', order: 1, prev: 'a'},
        }}}} as any;
        rightStore.activeConfig(null, '');
        designerLeftStore.setActiveModule('layer-list');
    });

    afterEach(() => {
        cleanup();
        designerLeftStore.closePanel(false);
        rightStore.activeConfig(null, '');
        window.DATAVISOOL_ENV = previousEnvironment;
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const mountPanels = () => render(<><LayerPanel/><DesignerRight/></>);
    const flushSelection = () => act(() => { vi.runAllTimers(); });

    test('keeps the clicked row mounted so a double click can enter rename', () => {
        mountPanels();
        const row = screen.getByTitle('A');
        fireEvent.click(row);
        flushSelection();

        expect(row).toBeInTheDocument();
        expect(rightStore.activeElem.id).toBe('a');
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
        expect(rightStore.activeElem.id).toBe('b');
        expect(screen.getByTitle('A')).toBeInTheDocument();
        expect(screen.getByTitle('B')).toBeInTheDocument();
        expect(designerLeftStore.panelOpen).toBe(true);
        expect(rightStore.panelOpen).toBe(false);
    });

    test('still switches to properties when their menu is explicitly clicked', () => {
        mountPanels();
        fireEvent.click(screen.getByTitle('A'));
        flushSelection();
        fireEvent.click(screen.getByRole('button', {name: tx('基础')}));

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(screen.queryByTitle('A')).not.toBeInTheDocument();
    });

    test('still opens properties for canvas activation on a narrow screen', () => {
        mountPanels();
        act(() => rightStore.activeConfig('a', 'rect'));

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(designerLeftStore.panelOpen).toBe(false);
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
