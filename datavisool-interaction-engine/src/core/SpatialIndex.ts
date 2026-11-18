/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {BoxSelectionMode, LayerBox, Point, Rect} from './types';
import {
    containsLayerPoint,
    containsLayerRect,
    containsRect,
    getLayerBounds,
    intersectsLayerRect,
    intersectsRect,
} from './Geometry';

export interface SpatialIndexOptions {
    bucketSize?: number;
}

export class SpatialIndex {
    private static readonly defaultBucketSize = 256;

    private readonly bucketSize: number;

    private readonly buckets = new Map<string, Set<string>>();

    private readonly layersById = new Map<string, LayerBox>();

    private readonly keysById = new Map<string, string[]>();

    constructor(options: SpatialIndexOptions = {}) {
        const bucketSize = options.bucketSize ?? SpatialIndex.defaultBucketSize;
        this.bucketSize = Number.isFinite(bucketSize) && bucketSize > 0
            ? bucketSize
            : SpatialIndex.defaultBucketSize;
    }

    rebuild(layers: LayerBox[]) {
        this.buckets.clear();
        this.layersById.clear();
        this.keysById.clear();

        for (const layer of layers) {
            this.update(layer);
        }
    }

    update(layer: LayerBox) {
        this.remove(layer.id);

        this.layersById.set(layer.id, {...layer});
        const keys = Array.from(this.getKeysForRect(getLayerBounds(layer)));
        this.keysById.set(layer.id, keys);

        for (const key of keys) {
            let bucket = this.buckets.get(key);

            if (!bucket) {
                bucket = new Set<string>();
                this.buckets.set(key, bucket);
            }

            bucket.add(layer.id);
        }
    }

    remove(id: string) {
        if (!this.layersById.delete(id)) {
            return;
        }

        const keys = this.keysById.get(id) ?? [];
        this.keysById.delete(id);

        for (const key of keys) {
            const bucket = this.buckets.get(key);

            if (!bucket) {
                continue;
            }

            bucket.delete(id);

            if (bucket.size === 0) {
                this.buckets.delete(key);
            }
        }
    }

    queryPoint(point: Point): LayerBox[] {
        return this.collectCandidates({
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
        }).filter((layer) => containsLayerPoint(layer, point));
    }

    queryRect(rect: Rect, mode: BoxSelectionMode = 'intersect'): LayerBox[] {
        return this.collectCandidates(rect)
            .filter((layer) => {
                const layerBounds = getLayerBounds(layer);
                return mode === 'contain'
                    ? containsRect(rect, layerBounds)
                    : intersectsRect(layerBounds, rect);
            });
    }

    queryBoxSelection(rect: Rect, mode: BoxSelectionMode = 'intersect'): LayerBox[] {
        return this.collectCandidates(rect)
            .filter((layer) => mode === 'contain'
                ? containsLayerRect(rect, layer)
                : intersectsLayerRect(layer, rect));
    }

    private collectCandidates(rect: Rect) {
        const ids = new Set<string>();

        for (const key of this.getKeysForRect(rect)) {
            const bucket = this.buckets.get(key);

            if (!bucket) {
                continue;
            }

            for (const id of bucket) {
                ids.add(id);
            }
        }

        const layers: LayerBox[] = [];

        for (const id of ids) {
            const layer = this.layersById.get(id);

            if (layer) {
                layers.push(layer);
            }
        }

        return layers;
    }

    private *getKeysForRect(rect: Rect): Iterable<string> {
        const minColumn = Math.floor(rect.x / this.bucketSize);
        const maxColumn = Math.floor((rect.x + rect.width) / this.bucketSize);
        const minRow = Math.floor(rect.y / this.bucketSize);
        const maxRow = Math.floor((rect.y + rect.height) / this.bucketSize);

        for (let row = minRow; row <= maxRow; row += 1) {
            for (let column = minColumn; column <= maxColumn; column += 1) {
                yield `${column}:${row}`;
            }
        }
    }
}
