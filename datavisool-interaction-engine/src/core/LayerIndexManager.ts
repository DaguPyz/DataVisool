/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {SpatialIndex} from './SpatialIndex';
import type {LayerBox, LayerGeometryPatch} from './types';

export interface LayerIndexManagerOptions {
    bucketSize?: number;
    getLayers: () => LayerBox[];
    getLayerById?: (id: string) => LayerBox | null;
    getVersion?: () => number | undefined;
}

export class LayerIndexManager {
    private readonly options: LayerIndexManagerOptions;

    private readonly spatialIndex: SpatialIndex;

    private indexedLayersVersion: number | null = null;

    private indexedLayersRef: LayerBox[] | null = null;

    private indexedLayersById = new Map<string, LayerBox>();

    constructor(options: LayerIndexManagerOptions) {
        this.options = options;
        this.spatialIndex = new SpatialIndex({bucketSize: options.bucketSize});
    }

    invalidate() {
        this.indexedLayersVersion = null;
        this.indexedLayersRef = null;
        this.indexedLayersById = new Map<string, LayerBox>();
    }

    rebuild(layers = this.options.getLayers()) {
        this.spatialIndex.rebuild(layers);
        this.indexedLayersById = new Map(layers.map((layer) => [layer.id, layer]));
        this.indexedLayersVersion = this.getVersion() ?? null;
        this.indexedLayersRef = layers;
        return this.spatialIndex;
    }

    update(layer: LayerBox) {
        this.spatialIndex.update(layer);
        this.indexedLayersById.set(layer.id, layer);
    }

    remove(id: string) {
        this.spatialIndex.remove(id);
        this.indexedLayersById.delete(id);
    }

    ensure(layers: LayerBox[]) {
        const version = this.getVersion();
        const hasVersion = version !== undefined;
        const versionMatches = hasVersion && this.indexedLayersVersion === version;
        const refMatches = !hasVersion && this.indexedLayersRef === layers;

        if (!versionMatches && !refMatches) {
            this.spatialIndex.rebuild(layers);
            this.indexedLayersById = new Map(layers.map((layer) => [layer.id, layer]));
            this.indexedLayersVersion = version ?? null;
            this.indexedLayersRef = layers;
        }

        return {
            spatialIndex: this.spatialIndex,
            layersById: this.indexedLayersById,
        };
    }

    getVersion() {
        return this.options.getVersion?.();
    }

    resolveLayersByIds(ids: ReadonlySet<string>) {
        const layers: LayerBox[] = [];

        if (this.options.getLayerById) {
            for (const id of ids) {
                const directLayer = this.options.getLayerById(id);

                if (directLayer) {
                    layers.push(directLayer);
                }
            }

            if (layers.length === ids.size) {
                return layers;
            }
        }

        return this.options.getLayers().filter((layer) => ids.has(layer.id));
    }

    resolvePatchLayersById(patches: LayerGeometryPatch[]) {
        const layersById = new Map<string, LayerBox>();

        for (const patch of patches) {
            const indexedLayer = this.indexedLayersById.get(patch.id);

            if (indexedLayer) {
                layersById.set(patch.id, indexedLayer);
                continue;
            }

            const directLayer = this.options.getLayerById?.(patch.id);

            if (directLayer) {
                layersById.set(patch.id, directLayer);
            }
        }

        if (layersById.size === patches.length) {
            return layersById;
        }

        const currentLayersById = this.resolveCurrentLayersById();

        for (const patch of patches) {
            if (!layersById.has(patch.id)) {
                const layer = currentLayersById.get(patch.id);

                if (layer) {
                    layersById.set(patch.id, layer);
                }
            }
        }

        return layersById;
    }

    resolveCurrentLayersById() {
        const layers = this.options.getLayers();
        const version = this.getVersion();
        const hasVersion = version !== undefined;
        const versionMatches = hasVersion && this.indexedLayersVersion === version;
        const refMatches = !hasVersion && this.indexedLayersRef === layers;

        if (this.indexedLayersById.size === 0 || (!versionMatches && !refMatches)) {
            this.spatialIndex.rebuild(layers);
            this.indexedLayersById = new Map(layers.map((layer) => [layer.id, layer]));
            this.indexedLayersVersion = version ?? null;
            this.indexedLayersRef = layers;
        }

        const layersById = new Map(layers.map((layer) => [layer.id, layer]));

        for (const [id, layer] of this.indexedLayersById) {
            if (layersById.has(id)) {
                layersById.set(id, layer);
            }
        }

        return layersById;
    }

    applyPatches(patches: LayerGeometryPatch[], layersById: Map<string, LayerBox>) {
        for (const patch of patches) {
            const layer = layersById.get(patch.id);

            if (!layer) {
                continue;
            }

            this.update(applyGeometryPatch(layer, patch));
        }

        const version = this.getVersion();
        this.indexedLayersVersion = version ?? null;

        if (version === undefined) {
            this.indexedLayersRef = this.options.getLayers();
        }
    }

    applyCommittedGeometry(patches: LayerGeometryPatch[]) {
        if (patches.length === 0) {
            return;
        }

        this.applyPatches(patches, this.resolveCurrentLayersById());
    }
}

function applyGeometryPatch(layer: LayerBox, patch: LayerGeometryPatch): LayerBox {
    return {
        id: layer.id,
        x: patch.x ?? layer.x,
        y: patch.y ?? layer.y,
        width: patch.width ?? layer.width,
        height: patch.height ?? layer.height,
        rotate: patch.rotate ?? layer.rotate,
    };
}
