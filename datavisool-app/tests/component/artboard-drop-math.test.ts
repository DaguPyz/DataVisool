/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from 'vitest';
import {resolveArtboardDropPoint} from '@/designer/workspace/viewport/ArtboardDropMath.ts';
import {worldToScreen} from '@/designer/workspace/viewport/ViewportMath.ts';

describe('artboard drag-drop coordinates', () => {
    const viewportRect = {left: 180, top: 64};
    const camera = {translationX: -236, translationY: 91, scale: 1.75};
    const artboard = {x: 420, y: -130, width: 1280, height: 720};

    test('converts a viewport-transformed client point into active-artboard local coordinates', () => {
        const expected = {x: 214, y: 516};
        const screen = worldToScreen({x: artboard.x + expected.x, y: artboard.y + expected.y}, camera);
        const client = {x: viewportRect.left + screen.x, y: viewportRect.top + screen.y};

        const result = resolveArtboardDropPoint(client, viewportRect, camera, artboard);

        expect(result.within).toBe(true);
        expect(result.position.x).toBeCloseTo(expected.x);
        expect(result.position.y).toBeCloseTo(expected.y);
    });

    test('rejects drops outside the finite artboard after pan and zoom', () => {
        const screen = worldToScreen({x: artboard.x - 1, y: artboard.y + 24}, camera);
        const result = resolveArtboardDropPoint(
            {x: viewportRect.left + screen.x, y: viewportRect.top + screen.y},
            viewportRect,
            camera,
            artboard,
        );

        expect(result.within).toBe(false);
        expect(result.position.x).toBeCloseTo(-1);
    });
});
