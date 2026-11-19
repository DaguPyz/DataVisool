/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from 'vitest';
import {cleanup, fireEvent, render} from '@testing-library/react';

vi.mock('@/shared/designer/EditorCommandContext.ts', () => ({useEditorCommands: () => ({has: () => false})}));
vi.mock('@/shared/designer/EditorShellContext.ts', () => ({useEditorShell: () => ({readShortcutHint: () => undefined})}));
vi.mock('@/shared/designer/EditorWorkspaceContext.ts', () => ({useEditorWorkspace: () => undefined}));
vi.mock('@/framework/context-menu/ContextMenu.tsx', () => ({default: () => null}));
vi.mock('@/plugins/editor-canvas/selection/SelectionPolicy.ts', () => ({getSelectionLockState: () => ({hasLocked: false, hasUnlocked: false})}));

import CanvasContextMenu from '@/plugins/editor-canvas/context-menu/CanvasContextMenu.tsx';
import {CanvasContextMenuStore} from '@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts';
import {EditorCanvasActivationProvider} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';

const contextMenuStore = new CanvasContextMenuStore(() => true);
const activation = {
    contextMenuStore,
    eventOperateStore: {targetIds: []},
    actions: {},
    sceneStore: {readLayerConfigs: () => ({})},
    readScene: () => undefined,
    canEdit: () => true,
} as never;

describe('canvas context menu event lifecycle', () => {
    afterEach(() => {
        cleanup();
        contextMenuStore.reset();
        document.body.replaceChildren();
    });

    test('releases document handlers when the canvas view unmounts', () => {
        const canvas = document.createElement('div');
        canvas.className = 'datavisool-event-container';
        document.body.append(canvas);
        const view = render(<EditorCanvasActivationProvider value={activation}><CanvasContextMenu/></EditorCanvasActivationProvider>);

        fireEvent.contextMenu(canvas, {clientX: 18, clientY: 27});
        expect(contextMenuStore.canvasMenuVisible).toBe(true);
        fireEvent.pointerUp(canvas);
        expect(contextMenuStore.pointerTarget).toBe(canvas);

        view.unmount();
        contextMenuStore.reset();
        fireEvent.contextMenu(canvas, {clientX: 30, clientY: 40});
        fireEvent.pointerUp(canvas);

        expect(contextMenuStore.canvasMenuVisible).toBe(false);
        expect(contextMenuStore.pointerTarget).toBeNull();
    });

    test('renders while an undone layer is still present in the previous selection', () => {
        const staleSelection = {
            ...activation as object,
            eventOperateStore: {targetIds: ['removed-loop']},
            readScene: () => ({isActive: () => true}),
        } as never;
        expect(() => render(<EditorCanvasActivationProvider value={staleSelection}>
            <CanvasContextMenu/>
        </EditorCanvasActivationProvider>)).not.toThrow();
    });
});
