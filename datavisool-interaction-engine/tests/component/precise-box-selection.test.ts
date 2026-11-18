/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {
    containsLayerRect,
    getLayerBounds,
    intersectsLayerRect,
    SpatialIndex,
    type LayerBox,
} from '../../src/main';

const rotatedLayer: LayerBox = {
    id: 'rotated',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotate: 45,
};

describe('precise rotated box selection', () => {
    it('keeps queryRect compatible while excluding an AABB-only intersection from box selection', () => {
        const index = new SpatialIndex({bucketSize: 32});
        const aabbCorner = {x: 100, y: -25, width: 5, height: 5};
        index.rebuild([rotatedLayer]);

        expect(index.queryRect(aabbCorner).map((layer) => layer.id)).toEqual(['rotated']);
        expect(index.queryBoxSelection(aabbCorner).map((layer) => layer.id)).toEqual([]);
        expect(intersectsLayerRect(rotatedLayer, aabbCorner)).toBe(false);
    });

    it('detects intersection when a small box is fully inside the rotated layer', () => {
        const index = new SpatialIndex({bucketSize: 32});
        const innerRect = {x: 48, y: 28, width: 4, height: 4};
        index.rebuild([rotatedLayer]);

        expect(index.queryBoxSelection(innerRect).map((layer) => layer.id)).toEqual(['rotated']);
        expect(intersectsLayerRect(rotatedLayer, innerRect)).toBe(true);
    });

    it('requires every rotated corner for contain mode and includes touching boundaries', () => {
        const index = new SpatialIndex({bucketSize: 32});
        const visualBounds = getLayerBounds(rotatedLayer);
        index.rebuild([rotatedLayer]);

        expect(containsLayerRect(visualBounds, rotatedLayer)).toBe(true);
        expect(index.queryBoxSelection(visualBounds, 'contain').map((layer) => layer.id))
            .toEqual(['rotated']);
        expect(index.queryBoxSelection({x: 0, y: 0, width: 100, height: 60}, 'contain'))
            .toEqual([]);
    });
});
