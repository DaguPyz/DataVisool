/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ReactNode, MouseEventHandler} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

const selection = vi.hoisted(() => ({targetIds: ['a'], setTargetIds: vi.fn()}));
vi.mock('@/designer/operate-provider/EventOperateStore', () => ({default: selection}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: {}}}));
vi.mock('@/designer/right/status-list/StatusListStore.ts', () => ({default: {init: vi.fn()}}));
vi.mock('@/designer/right/ConfigContent', () => ({default: () => <div role="region" aria-label="组件属性"/>}));
vi.mock('@/designer/operate-provider/hot-key/HotKeyConfig', () => ({hotkeyConfigs: {}}));
vi.mock('@/designer/left/layer-list/util/LayerUtil', () => ({default: {findTopGroupLayer: (ids: string[]) => ids}}));
vi.mock('@/designer/left/layer-list/CanvasRender.ts', () => ({default: {buildCanvasComponents: () => <div data-testid="canvas-layer">A</div>}}));
vi.mock('@/designer/manager/ManagerStore.ts', () => ({default: {currentManager: {}}}));
vi.mock('@/designer/canvas/DesignerRuler', () => ({default: ({children}: {children: ReactNode}) => <>{children}</>}));
vi.mock('@/designer/canvas/DesignerDragScaleContainer', () => ({default: ({children, onDoubleClick}: {children: ReactNode; onDoubleClick: MouseEventHandler}) => <div onDoubleClick={onDoubleClick}>{children}</div>}));
vi.mock('@/designer/operate-provider/interaction/DesignerInteractionEngine.tsx', () => ({default: ({children}: {children: ReactNode}) => <>{children}</>}));
vi.mock('@/designer/canvas/AiLayerDraftCanvas.tsx', () => ({default: () => null}));
vi.mock('@/designer/workspace/artboard/ArtboardOverlay.tsx', () => ({default: () => null}));
vi.mock('@/designer/operate-provider/canvas-context-menu/CanvasContextMenu.tsx', () => ({default: () => null}));
vi.mock('@/designer/operate-provider/hot-key/HotKey', () => ({default: () => null}));
vi.mock('@/designer/left/layer-list/search-layer/SearchLayer.tsx', () => ({default: () => null}));

import DesignerCanvas from '@/designer/canvas/DesignerCanvas.tsx';
import DesignerRight from '@/designer/right/DesignerRight.tsx';
import designerLeftStore from '@/designer/left/DesignerLeftStore.ts';
import rightStore from '@/designer/right/RightStore.ts';

describe('canvas double-click activation', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;

    beforeEach(() => {
        vi.stubGlobal('innerWidth', 900);
        selection.targetIds = ['a'];
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: {a: {id: 'a', type: 'rect'}}}}} as typeof window.DATAVISOOL_ENV;
        rightStore.activeConfig(null, '');
        designerLeftStore.closePanel(false);
    });

    afterEach(() => {
        cleanup();
        designerLeftStore.closePanel(false);
        rightStore.activeConfig(null, '');
        window.DATAVISOOL_ENV = previousEnvironment;
        vi.unstubAllGlobals();
    });

    const doubleClickLayer = async () => {
        render(<><DesignerCanvas/><DesignerRight/></>);
        const layer = await screen.findByTestId('canvas-layer');
        act(() => fireEvent.doubleClick(layer));
    };

    test('opens properties for the same layer selected from the narrow layer list', async () => {
        designerLeftStore.setActiveModule('layer-list');
        rightStore.activeConfig('a', 'rect', 'layer-list');
        expect(rightStore.panelOpen).toBe(false);
        expect(designerLeftStore.panelOpen).toBe(true);

        await doubleClickLayer();

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(rightStore.activeElem.id).toBe('a');
        expect(designerLeftStore.panelOpen).toBe(false);
    });

    test('reopens manually closed properties without changing the active configuration menu', async () => {
        vi.stubGlobal('innerWidth', 1440);
        rightStore.activeConfig('a', 'rect');
        rightStore.setActiveMenu('filter');
        rightStore.setContentVisible(false, false);

        await doubleClickLayer();

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(rightStore.activeMenu).toBe('filter');
    });

    test('keeps an already open editor mounted when the same component is double-clicked', async () => {
        rightStore.activeConfig('a', 'rect');
        rightStore.setActiveMenu('theme');
        const revision = rightStore.configRevision;

        await doubleClickLayer();

        expect(rightStore.configRevision).toBe(revision);
        expect(rightStore.activeMenu).toBe('theme');
        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
    });
});
