/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from 'vitest';
import {
    fitArtboard,
    isInsideArtboard,
    screenToArtboardLocal,
    screenToWorld,
    visibleWorldBounds,
    worldToScreen,
    zoomAtPoint,
} from '@/designer/workspace/viewport/ViewportMath.ts';

describe('workspace viewport coordinates', () => {
    test('round trips screen, world and artboard local coordinates', () => {
        const camera = {translationX: -163, translationY: 84, scale: 1.75};
        const artboard = {x: 320, y: -120, width: 1280, height: 720};
        const local = {x: 240, y: 170};
        const world = {x: artboard.x + local.x, y: artboard.y + local.y};
        const screen = worldToScreen(world, camera);

        expect(screenToWorld(screen, camera)).toEqual(world);
        expect(screenToArtboardLocal(screen, camera, artboard)).toEqual(local);
        expect(isInsideArtboard(local, artboard)).toBe(true);
        expect(isInsideArtboard({x: -0.01, y: 0}, artboard)).toBe(false);
        expect(isInsideArtboard({x: artboard.width + 0.01, y: 0}, artboard)).toBe(false);
    });

    test('keeps an arbitrary mouse anchor fixed while zooming and clamps scale', () => {
        const before = {translationX: -440, translationY: 230, scale: 0.6};
        const anchor = {x: 791, y: 312};
        const world = screenToWorld(anchor, before);
        const after = zoomAtPoint(before, anchor, 2.4);

        expect(worldToScreen(world, after).x).toBeCloseTo(anchor.x);
        expect(worldToScreen(world, after).y).toBeCloseTo(anchor.y);
        expect(zoomAtPoint(before, anchor, 100).scale).toBe(5);
        expect(zoomAtPoint(before, anchor, 0.001).scale).toBe(0.05);
    });

    test('fits a finite artboard inside available viewport, accounting for panels', () => {
        const viewport = {width: 1440, height: 900};
        const artboard = {x: 500, y: -300, width: 1280, height: 720};
        const insets = {left: 360, top: 76, right: 416, bottom: 72};
        const camera = fitArtboard(viewport, artboard, insets, 24);
        const topLeft = worldToScreen({x: artboard.x, y: artboard.y}, camera);
        const bottomRight = worldToScreen({x: artboard.x + artboard.width, y: artboard.y + artboard.height}, camera);

        expect(topLeft.x).toBeGreaterThanOrEqual(insets.left);
        expect(topLeft.y).toBeGreaterThanOrEqual(insets.top);
        expect(bottomRight.x).toBeLessThanOrEqual(viewport.width - insets.right);
        expect(bottomRight.y).toBeLessThanOrEqual(viewport.height - insets.bottom);
        expect(camera.scale).toBeGreaterThanOrEqual(0.05);
    });

    test('visible world bounds invert camera transform', () => {
        expect(visibleWorldBounds({translationX: -100, translationY: 50, scale: 2}, {width: 800, height: 600}))
            .toEqual({x: 50, y: -25, width: 400, height: 300});
    });
});
