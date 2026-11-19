/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ReactNode, MouseEventHandler} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import type {DesignerProjectSession} from '@datavisool/sdk/plugin/contracts/designerRuntime';

const selection = vi.hoisted(() => ({targetIds: ['a']}));
vi.mock('@/plugins/editor-inspector/ConfigContent', () => ({default: () => <div role="region" aria-label="组件属性"/>}));
vi.mock('@/plugins/editor-shortcuts/HotKeyConfig', () => ({createHotkeyConfigs: () => ({})}));
vi.mock('@/plugins/editor-canvas/layers/LayerUtil', () => ({default: {findTopGroupLayer: (ids: string[]) => ids}}));
vi.mock('@/plugins/editor-canvas/DesignerRuler', () => ({default: ({children}: {children: ReactNode}) => <>{children}</>}));
vi.mock('@/plugins/editor-canvas/DesignerDragScaleContainer', () => ({default: ({children, onDoubleClick}: {children: ReactNode; onDoubleClick: MouseEventHandler}) => <div onDoubleClick={onDoubleClick}>{children}</div>}));
vi.mock('@/plugins/editor-canvas/interaction/DesignerInteractionEngine.tsx', () => ({default: ({children}: {children: ReactNode}) => <>{children}</>}));
vi.mock('@/plugins/editor-ai/AiLayerDraftCanvas.tsx', () => ({default: () => null}));
vi.mock('@/plugins/editor-canvas/ArtboardOverlay.tsx', () => ({default: () => null}));
vi.mock('@/plugins/editor-canvas/context-menu/CanvasContextMenu.tsx', () => ({default: () => null}));
vi.mock('@/plugins/editor-shortcuts/HotKey', () => ({default: () => null}));
vi.mock('@/plugins/editor-layers/search-layer/SearchLayer.tsx', () => ({default: () => null}));

vi.mock('@/shared/designer/EditorProjectContext.ts', () => ({useEditorProject: () => ({saveThrottled() {}})}));

import DesignerCanvas from '@/plugins/editor-canvas/DesignerCanvas.tsx';
import {EditorCanvasActivationProvider} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';
import {applyCanvasDoubleClick} from '@/plugins/editor-inspector/InspectorSelection.ts';
import DesignerRight from '@/plugins/editor-inspector/DesignerRight.tsx';
import {createInspectorStore} from '@/plugins/editor-inspector/InspectorStore.ts';
import {createInspectorTarget, createInspectorTestDomain} from './support/inspectorDomainFixture.ts';

const target = createInspectorTarget('a', 'rect', 'A');
const {domain} = createInspectorTestDomain([target]);
const inspectorStore = createInspectorStore();
const closePanel = (restoreFocus: boolean) => inspectorStore.setContentVisible(false, restoreFocus);

const project = {
    loaded: true,
    load: async () => {},
    close() {},
    getProjectId: () => undefined,
    getSnapshot: () => undefined,
    readRemoteComponentPaths: () => ({}),
    renderCanvas: () => ({filterStyle: {}, content: <div data-testid="canvas-layer">A</div>}),
} as unknown as DesignerProjectSession;

const activation = {
    sceneStore: {revision: 0, readLayerConfigs: () => ({a: {id: 'a', type: 'rect'}})},
    readWorkspace: () => undefined,
    readAuxiliaryBorder: () => false,
    readScene: () => ({version: 1}),
    canEdit: () => true,
} as never;

describe('canvas double-click activation', () => {
    beforeEach(() => {
        vi.stubGlobal('innerWidth', 900);
        selection.targetIds = ['a'];
        inspectorStore.clearTarget();
        inspectorStore.setPanelOrderProvider(() => 1);
    });

    afterEach(() => {
        cleanup();
        inspectorStore.clearTarget();
        vi.unstubAllGlobals();
    });

    const doubleClickLayer = async () => {
        const canvas = {
            readSelection: () => ({ids: selection.targetIds, source: 'canvas' as const}),
            renameLayer() { return false; },
            updateBaseTextContent() { return false; },
        };
        const inspect = (id: string | null) => applyCanvasDoubleClick(id, domain, inspectorStore);
        render(<EditorCanvasActivationProvider value={activation}><><DesignerCanvas input={{isActive: () => false, isActiveWithExactModifiers: () => false, subscribePressedState: () => () => {}}} project={project} canvas={canvas} onLayerDoubleClick={inspect}/><DesignerRight domain={domain} closePanel={closePanel} store={inspectorStore} trackTask={task => task}/></></EditorCanvasActivationProvider>);
        const layer = await screen.findByTestId('canvas-layer');
        act(() => fireEvent.doubleClick(layer));
    };

    test('opens properties for the same layer selected from the narrow layer list', async () => {
        inspectorStore.activateTarget(target, 'layer-list');
        expect(inspectorStore.panelOpen).toBe(false);

        await doubleClickLayer();

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(inspectorStore.activeElem.id).toBe('a');
        expect(inspectorStore.panelOpen).toBe(true);
    });

    test('reopens manually closed properties without changing the active configuration menu', async () => {
        vi.stubGlobal('innerWidth', 1440);
        inspectorStore.activateTarget(target);
        inspectorStore.setActiveMenu('filter');
        inspectorStore.setContentVisible(false, false);

        await doubleClickLayer();

        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
        expect(inspectorStore.activeMenu).toBe('filter');
    });

    test('keeps an already open editor mounted when the same component is double-clicked', async () => {
        inspectorStore.activateTarget(target);
        inspectorStore.setActiveMenu('theme');
        const revision = inspectorStore.configRevision;

        await doubleClickLayer();

        expect(inspectorStore.configRevision).toBe(revision);
        expect(inspectorStore.activeMenu).toBe('theme');
        expect(screen.getByRole('region', {name: '组件属性'})).toBeInTheDocument();
    });
});
