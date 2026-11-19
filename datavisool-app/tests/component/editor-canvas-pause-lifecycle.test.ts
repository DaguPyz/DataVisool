/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import {EditorCanvasActivationState} from '@/plugins/editor-canvas/state/EditorCanvasActivationState.ts';
import {CanvasContextMenuStore} from '@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts';
import {ViewportStore} from '@/plugins/editor-canvas/viewport/ViewportStore.ts';
import HistoryOperator from '@/plugins/editor-canvas/history/HistoryOperator.ts';
import AbstractRollback from '@/plugins/editor-canvas/history/core/AbstractRollback.ts';
import type {IHistoryRecord} from '@/plugins/editor-canvas/history/OperateType.ts';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EventOperateStore} from '@/plugins/editor-canvas/state/EventOperateStore.ts';
import {createEditorCanvasStateFixture} from './support/editorCanvasStateFixture.ts';

class DeferredSelectionRollback extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }
    undo(_record: IHistoryRecord): void {}
    redo(_record: IHistoryRecord): void {}
    defer(scene: DesignerEditingScene, callback: () => void) {
        this.afterScene(scene, callback);
    }
}

describe('editor canvas pause lifecycle', () => {
    it('blocks writes during pause, keeps the current viewport, and resumes the same activation', () => {
        const lifecycle = new EditorCanvasActivationState();
        const canEdit = () => lifecycle.canEdit(() => true);
        const viewport = new ViewportStore(canEdit);
        const contextMenu = new CanvasContextMenuStore(canEdit);
        const history = new HistoryOperator(() => [], () => undefined, canEdit);
        const applyLegacy = vi.fn();
        contextMenu.setCanvasMenuPrepare(() => [{id: 'layer-a', name: 'A', type: 'text', locked: false}]);

        viewport.setCamera({translationX: 48, translationY: 24, scale: 1.5});
        contextMenu.requestCanvasMenu([10, 20]);
        expect(contextMenu.canvasMenuVisible).toBe(true);
        const pendingDismissVersion = contextMenu.getDismissVersion();

        lifecycle.pause();
        viewport.pause();
        contextMenu.pause();
        viewport.setCamera({translationX: 100, translationY: 100, scale: 2});
        contextMenu.requestCanvasMenu([30, 40]);
        history.put({actions: []});

        expect(viewport.camera).toEqual({translationX: 48, translationY: 24, scale: 1.5});
        expect(contextMenu.canvasMenuVisible).toBe(false);
        expect(contextMenu.isDismissVersionCurrent(pendingDismissVersion)).toBe(false);
        expect(history.undo(applyLegacy)).toBe(false);
        expect(applyLegacy).not.toHaveBeenCalled();

        lifecycle.resume();
        expect(canEdit()).toBe(true);
        expect(viewport.camera).toEqual({translationX: 48, translationY: 24, scale: 1.5});
        contextMenu.requestCanvasMenu([50, 60]);
        expect(contextMenu.canvasMenuVisible).toBe(true);
        history.put({actions: []});
        expect(history.undo(applyLegacy)).toBe(true);
        expect(applyLegacy).toHaveBeenCalledOnce();

        lifecycle.deactivate();
        lifecycle.resume();
        viewport.setCamera({translationX: 0, translationY: 0, scale: 1});
        expect(canEdit()).toBe(false);
        expect(viewport.camera).toEqual({translationX: 48, translationY: 24, scale: 1.5});
    });

    it('drops a deferred history selection when the owning scene changes', async () => {
        const fixture = createEditorCanvasStateFixture();
        const rollback = new DeferredSelectionRollback(fixture.eventOperateStore);
        const capturedScene = fixture.eventOperateStore.captureScene()!;
        const delayedWrite = vi.fn();

        rollback.defer(capturedScene, delayedWrite);
        fixture.setScene({identity: {}, version: capturedScene.version, isActive: () => true});
        await Promise.resolve();

        expect(delayedWrite).not.toHaveBeenCalled();
    });
});
