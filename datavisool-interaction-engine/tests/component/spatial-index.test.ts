/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {SelectionManager, SpatialIndex, type LayerBox} from '../../src/main';

function createLayer(id: string, x: number, y: number): LayerBox {
    return {
        id,
        x,
        y,
        width: 50,
        height: 50,
        rotate: 0,
    };
}

describe('SpatialIndex', () => {
    it('returns point candidates and leaves top-layer resolution to callers', () => {
        const index = new SpatialIndex({bucketSize: 64});
        index.rebuild([
            createLayer('bottom', 10, 10),
            createLayer('top', 20, 20),
        ]);

        expect(index.queryPoint({x: 30, y: 30}).map((layer) => layer.id))
            .toEqual(['bottom', 'top']);
    });

    it('indexes rotated layer visual bounds for point queries', () => {
        const index = new SpatialIndex({bucketSize: 32});
        index.rebuild([{
            ...createLayer('rotated', 0, 0),
            width: 100,
            height: 60,
            rotate: 45,
        }]);

        expect(index.queryPoint({x: 50, y: -10}).map((layer) => layer.id)).toEqual(['rotated']);
        expect(index.queryPoint({x: 0, y: 0})).toEqual([]);
    });

    it('queries rect candidates without applying business visibility rules', () => {
        const index = new SpatialIndex({bucketSize: 64});
        index.rebuild([
            createLayer('a', 10, 10),
            createLayer('b', 120, 10),
            createLayer('business-hidden', 20, 20),
        ]);

        expect(index.queryRect({x: 0, y: 0, width: 180, height: 80}).map((layer) => layer.id))
            .toEqual(['a', 'business-hidden', 'b']);
    });

    it('requires complete containment when contain mode is enabled', () => {
        const index = new SpatialIndex({bucketSize: 64});
        index.rebuild([
            createLayer('contained', 10, 10),
            createLayer('partial', 40, 10),
        ]);
        const selectionRect = {x: 0, y: 0, width: 60, height: 60};

        expect(index.queryRect(selectionRect).map((layer) => layer.id))
            .toEqual(['contained', 'partial']);
        expect(index.queryRect(selectionRect, 'contain').map((layer) => layer.id))
            .toEqual(['contained']);
    });

    it('queries rotated layer visual bounds by rect', () => {
        const index = new SpatialIndex({bucketSize: 32});
        index.rebuild([{
            ...createLayer('rotated', 0, 0),
            width: 100,
            height: 60,
            rotate: 45,
        }]);

        expect(index.queryRect({x: 40, y: -20, width: 20, height: 12}).map((layer) => layer.id))
            .toEqual(['rotated']);
    });

    it('updates and removes layers by id', () => {
        const index = new SpatialIndex({bucketSize: 64});
        index.rebuild([createLayer('a', 10, 10)]);

        index.update(createLayer('a', 200, 10));
        expect(index.queryPoint({x: 20, y: 20})).toEqual([]);
        expect(index.queryPoint({x: 210, y: 20}).map((layer) => layer.id)).toEqual(['a']);

        index.remove('a');
        expect(index.queryPoint({x: 210, y: 20})).toEqual([]);
    });

    it('falls back to the default bucket size for invalid bucket input', () => {
        const index = new SpatialIndex({bucketSize: 0});
        index.rebuild([createLayer('a', 10, 10)]);

        expect(index.queryPoint({x: 20, y: 20}).map((layer) => layer.id)).toEqual(['a']);
    });
});

describe('SelectionManager', () => {
    it('toggles point selection in additive mode', () => {
        const manager = new SelectionManager();
        const layer = createLayer('a', 10, 10);

        expect(manager.resolvePointSelection({hitLayer: layer, selectedIds: ['a'], additive: true}))
            .toEqual([]);
        expect(manager.resolvePointSelection({hitLayer: layer, selectedIds: ['b'], additive: true}))
            .toEqual(['b', 'a']);
    });

    it('replaces or appends box selection', () => {
        const manager = new SelectionManager();
        const hitLayers = [
            createLayer('a', 10, 10),
            createLayer('b', 80, 10),
        ];

        expect(manager.resolveBoxSelection({hitLayers, selectedIds: ['x']}))
            .toEqual(['a', 'b']);
        expect(manager.resolveBoxSelection({hitLayers, selectedIds: ['x', 'a'], additive: true}))
            .toEqual(['x', 'a', 'b']);
    });
});
