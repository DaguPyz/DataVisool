/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {
    findTopLayerAtPoint,
    resolveDragActiveTargets,
    type LayerBox,
} from '../../src/main';

function createLayer(partial: Partial<LayerBox> & Pick<LayerBox, 'id'>): LayerBox {
    return {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotate: 0,
        ...partial,
    };
}

describe('target resolution', () => {
    it('hit tests the last matching layer and leaves visibility/order to callers', () => {
        const bottom = createLayer({id: 'bottom'});
        const top = createLayer({id: 'top'});
        const businessHidden = createLayer({id: 'business-hidden'});

        expect(findTopLayerAtPoint([bottom, top, businessHidden], {x: 20, y: 20})?.id)
            .toBe('business-hidden');
    });

    it('hit tests a rotated layer by its visible bounds', () => {
        const layer = createLayer({
            id: 'rotated',
            width: 100,
            height: 60,
            rotate: 45,
        });

        expect(findTopLayerAtPoint([layer], {x: 50, y: -10})?.id).toBe('rotated');
        expect(findTopLayerAtPoint([layer], {x: 0, y: 0})).toBeNull();
    });

    it('resolves selected ids when the hit layer is already selected', () => {
        const layerA = createLayer({id: 'a'});
        const layerB = createLayer({id: 'b'});
        const layersById = new Map([
            ['a', layerA],
            ['b', layerB],
        ]);

        expect(resolveDragActiveTargets({
            hitLayer: layerA,
            selectedIds: ['a', 'b'],
            layersById,
        })).toEqual({activeIds: ['a', 'b'], selectIds: undefined});
    });

    it('selects only the hit layer when it is not already selected', () => {
        const layerA = createLayer({id: 'a'});
        const layerB = createLayer({id: 'b'});
        const layersById = new Map([
            ['a', layerA],
            ['b', layerB],
        ]);

        expect(resolveDragActiveTargets({
            hitLayer: layerB,
            selectedIds: ['a'],
            layersById,
        })).toEqual({activeIds: ['b'], selectIds: ['b']});
    });

    it('leaves locked-layer filtering to caller-provided transform target resolution', () => {
        const layerA = createLayer({id: 'a'});
        const layerB = createLayer({id: 'b'});
        const layersById = new Map([
            ['a', layerA],
            ['b', layerB],
        ]);

        expect(resolveDragActiveTargets({
            hitLayer: layerA,
            selectedIds: ['a', 'b'],
            layersById,
        })).toEqual({activeIds: ['a', 'b'], selectIds: undefined});
    });
});
