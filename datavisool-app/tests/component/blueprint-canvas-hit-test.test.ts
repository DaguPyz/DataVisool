/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isBPCanvasPointAvailable} from '@/designer/blueprint/workspace/BPCanvasHitTest';

describe('blueprint visible canvas hit testing', () => {
    let viewport: HTMLDivElement;
    let topElement: Element | null;
    const pointFromElement = vi.fn(() => topElement);
    const originalElementFromPoint = document.elementFromPoint;

    beforeEach(() => {
        viewport = document.createElement('div');
        viewport.className = 'blue-print-canvas';
        document.body.appendChild(viewport);
        vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 45, 1440, 855));
        topElement = viewport;
        document.elementFromPoint = pointFromElement;
        pointFromElement.mockClear();
    });

    afterEach(() => {
        document.body.replaceChildren();
        document.elementFromPoint = originalElementFromPoint;
        vi.restoreAllMocks();
    });

    it('accepts blank canvas, Pixi canvas and transformed node descendants', () => {
        expect(isBPCanvasPointAvailable(0, 45)).toBe(true);
        const pixiCanvas = document.createElement('canvas');
        viewport.appendChild(pixiCanvas);
        topElement = pixiCanvas;
        expect(isBPCanvasPointAvailable(900, 600, viewport)).toBe(true);
        const anchor = document.createElement('span');
        viewport.appendChild(anchor);
        topElement = anchor;
        expect(isBPCanvasPointAvailable(50, 90, viewport)).toBe(true);
    });

    it('rejects a body portal without relying on a particular component class or UI marker', () => {
        const overlay = document.createElement('div');
        const input = document.createElement('input');
        overlay.appendChild(input);
        document.body.appendChild(overlay);
        topElement = input;
        expect(isBPCanvasPointAvailable(240, 160, viewport)).toBe(false);
    });

    it('also rejects explicitly marked UI nested inside the viewport', () => {
        const ui = document.createElement('div');
        ui.dataset.bpUi = '';
        const child = document.createElement('span');
        ui.appendChild(child);
        viewport.appendChild(ui);
        topElement = child;
        expect(isBPCanvasPointAvailable(240, 160, viewport)).toBe(false);
    });

    it('uses the current client origin without introducing scale or world-coordinate assumptions', () => {
        vi.mocked(viewport.getBoundingClientRect).mockReturnValue(new DOMRect(-120, 80, 1000, 600));
        expect(isBPCanvasPointAvailable(10, 90, viewport)).toBe(true);
        expect(isBPCanvasPointAvailable(10, 79, viewport)).toBe(false);
        expect(isBPCanvasPointAvailable(880, 90, viewport)).toBe(false);
    });

    it('rejects points outside the viewport, missing hits and detached views', () => {
        for (const [x, y] of [[-1, 50], [1, 44], [1440, 100], [10, 900], [NaN, 90]])
            expect(isBPCanvasPointAvailable(x, y, viewport)).toBe(false);
        expect(pointFromElement).not.toHaveBeenCalled();
        topElement = null;
        expect(isBPCanvasPointAvailable(100, 100, viewport)).toBe(false);
        viewport.remove();
        expect(isBPCanvasPointAvailable(100, 100, viewport)).toBe(false);
    });
});
