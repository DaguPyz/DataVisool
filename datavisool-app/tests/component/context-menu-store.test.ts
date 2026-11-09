/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test, vi} from 'vitest';
import {ContextMenuStore} from '@/designer/event/ContextMenuStore.ts';

describe('ContextMenuStore canvas preparation', () => {
    test('prepares the canvas target before opening a menu', () => {
        const store = new ContextMenuStore();
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
        const store = new ContextMenuStore();
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
        const store = new ContextMenuStore();
        const prepare = vi.fn(() => []);
        store.setCanvasMenuPrepare(prepare);

        store.beginRightDrag();
        store.requestCanvasMenu([40, 50]);
        store.startRightDrag();
        store.endRightDrag(true);

        expect(prepare).not.toHaveBeenCalled();
        expect(store.canvasMenuVisible).toBe(false);
    });
});
