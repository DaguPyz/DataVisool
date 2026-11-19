/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test, vi} from 'vitest';
import {CanvasContextMenuStore} from '@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts';

describe('CanvasContextMenuStore preparation', () => {
    test('prepares the canvas target before opening a menu', () => {
        const store = new CanvasContextMenuStore();
        const prepare = vi.fn(() => [{
            id: 'layer-a',
            name: 'A',
            type: 'BaseText',
            locked: false,
        }]);
        store.setCanvasMenuPrepare(prepare);

        store.requestCanvasMenu([20, 30]);

        expect(prepare).toHaveBeenCalledWith([20, 30]);
        expect(store.canvasMenuVisible).toBe(true);
        expect(store.canvasMenuCandidates.map((item) => item.id)).toEqual(['layer-a']);
    });

    test('defers target preparation until a right-button click is confirmed', () => {
        const store = new CanvasContextMenuStore();
        const prepare = vi.fn(() => []);
        store.setCanvasMenuPrepare(prepare);

        store.beginRightDrag();
        store.requestCanvasMenu([40, 50]);
        expect(prepare).not.toHaveBeenCalled();

        store.endRightDrag(false);
        expect(prepare).toHaveBeenCalledWith([40, 50]);
        expect(store.canvasMenuVisible).toBe(true);
    });

    test('does not prepare or open a menu after a right-button drag', () => {
        const store = new CanvasContextMenuStore();
        const prepare = vi.fn(() => []);
        store.setCanvasMenuPrepare(prepare);

        store.beginRightDrag();
        store.requestCanvasMenu([40, 50]);
        store.startRightDrag();
        store.endRightDrag(true);

        expect(prepare).not.toHaveBeenCalled();
        expect(store.canvasMenuVisible).toBe(false);
    });

    test('reset releases gesture state while keeping the active canvas menu builder', () => {
        const store = new CanvasContextMenuStore();
        const prepare = vi.fn(() => []);
        store.setCanvasMenuPrepare(prepare);
        store.setPointerTarget(document.createElement('button'));
        store.beginRightDrag();
        store.requestCanvasMenu([10, 20]);
        store.startRightDrag();
        const pendingDismissVersion = store.getDismissVersion();

        store.reset();

        expect(store.isDismissVersionCurrent(pendingDismissVersion)).toBe(false);
        expect(store.canvasMenuVisible).toBe(false);
        expect(store.pendingMenu).toBeNull();
        expect(store.pointerTarget).toBeNull();
        expect(store.rightPointerDown).toBe(false);
        expect(store.rightDragActive).toBe(false);
        expect(store.consumeSuppressedContextMenu()).toBe(false);
        store.requestCanvasMenu([30, 40]);
        expect(prepare).toHaveBeenCalledWith([30, 40]);
        expect(store.canvasMenuVisible).toBe(true);
    });
});
