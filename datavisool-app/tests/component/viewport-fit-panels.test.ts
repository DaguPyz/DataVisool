/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

vi.mock('@/framework/core/ScaleAction.ts', () => ({default: {doScale: vi.fn()}}));
vi.mock('@/designer/event/ContextMenuStore.ts', () => ({default: {}}));
vi.mock('@/designer/operate-provider/EventOperateStore.ts', () => ({default: {setScale: vi.fn(), setRatio: vi.fn()}}));
vi.mock('@/designer/operate-provider/hot-key/ShortcutStore.ts', () => ({
    default: {isActiveWithExactModifiers: () => false},
}));

import ViewportController from '@/designer/workspace/viewport/ViewportController.ts';
import viewportStore from '@/designer/workspace/viewport/ViewportStore.ts';

describe('fit artboard around floating panels', () => {
    let controller: ViewportController;
    let viewport: HTMLDivElement;
    let artboardBounds: {x: number; y: number; width: number; height: number};
    let frameId: number;
    let frames: Map<number, FrameRequestCallback>;

    const nextFrame = () => {
        const pending = Array.from(frames.entries());
        pending.forEach(([id]) => frames.delete(id));
        pending.forEach(([, callback]) => callback(0));
    };

    beforeEach(() => {
        artboardBounds = {x: 0, y: 0, width: 1920, height: 1080};
        frameId = 0;
        frames = new Map();
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            frames.set(++frameId, callback);
            return frameId;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
        viewportStore.setCamera({translationX: 0, translationY: 0, scale: 1});
        viewport = document.createElement('div');
        const artboard = document.createElement('div');
        viewport.append(artboard);
        document.body.append(viewport);
        Object.defineProperties(viewport, {
            clientWidth: {value: 900},
            clientHeight: {value: 800},
        });
        viewport.getBoundingClientRect = () => new DOMRect(100, 40, 900, 800);
        controller = new ViewportController({viewport, artboard, getArtboardBounds: () => artboardBounds});
        nextFrame();
        nextFrame();
    });

    afterEach(() => {
        controller.destroy();
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    const panel = (side: 'left' | 'right', x: number, width: number) => {
        const element = document.createElement('div');
        element.dataset.workspaceOcclusion = side;
        element.getBoundingClientRect = () => new DOMRect(100 + x, 160, width, 595);
        document.body.append(element);
        return element;
    };

    const expectArtboardBetween = (left: number, right: number) => {
        const {translationX, scale} = viewportStore;
        expect(scale).toBeGreaterThan(0.05);
        expect(translationX).toBeGreaterThanOrEqual(left + 48);
        expect(translationX + artboardBounds.width * scale).toBeLessThanOrEqual(right - 48);
    };

    test('fits to the left of a right panel crossing the viewport midpoint', () => {
        panel('right', 407, 425);
        controller.fitArtboard();

        expectArtboardBetween(0, 407 - 16);
    });

    test('keeps a resized right panel and its status list on the right', () => {
        panel('right', 187, 645);
        controller.fitArtboard();

        // The remaining space is narrow, but the artboard must never be pushed off-screen.
        expect(viewportStore.translationX).toBeGreaterThanOrEqual(0);
        expect(viewportStore.translationX + artboardBounds.width * viewportStore.scale).toBeLessThan(187);
    });

    test('still fits between left and right panels when both are visible', () => {
        panel('left', 84, 320);
        panel('right', 740, 92);
        controller.fitArtboard();

        expectArtboardBetween(404 + 16, 740 - 16);
    });

    test('resets against the layout after the old property panel unmounts', () => {
        const leftPanel = panel('left', 0, 180);
        const rightPanel = panel('right', 407, 425);
        controller.fitArtboard();

        // Scene switching requests a reset before React removes the old property panel.
        controller.reset();
        nextFrame();
        rightPanel.remove();
        nextFrame();

        expectArtboardBetween(196, 900);
        expect(viewportStore.translationX + artboardBounds.width * viewportStore.scale / 2).toBeCloseTo(548);
        expect(leftPanel.isConnected).toBe(true);
    });

    test('repeated scene resets fit the latest canvas bounds after layout updates', () => {
        const rightPanel = panel('right', 407, 425);
        controller.reset();
        nextFrame();
        artboardBounds = {x: 0, y: 0, width: 600, height: 300};
        controller.reset();
        nextFrame();
        rightPanel.remove();
        nextFrame();

        expect(viewportStore.camera).toEqual({translationX: 48, translationY: 201, scale: 1.34});
        viewportStore.panBy(10, 20);
        nextFrame();
        expect(viewportStore.camera).toEqual({translationX: 58, translationY: 221, scale: 1.34});
    });

    test.each([false, true])('cancels a destroyed controller reset (first frame ran: %s)', (firstFrameRan) => {
        controller.reset();
        if (firstFrameRan) nextFrame();
        controller.destroy();
        const nextCamera = {translationX: 200, translationY: 100, scale: 0.7};
        viewportStore.setCamera(nextCamera);
        nextFrame();
        nextFrame();

        expect(viewportStore.camera).toEqual(nextCamera);
    });
});
