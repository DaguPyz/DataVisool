/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox, Point} from './types';
import {containsLayerPoint} from './Geometry';

export function findTopLayerAtPoint(layers: LayerBox[], point: Point): LayerBox | null {
    let bestLayer: LayerBox | null = null;

    for (let index = 0; index < layers.length; index += 1) {
        const layer = layers[index];

        if (!containsLayerPoint(layer, point)) {
            continue;
        }

        bestLayer = layer;
    }

    return bestLayer;
}
