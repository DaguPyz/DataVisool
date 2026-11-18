/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {LayerIndexManager} from './LayerIndexManager';
import type {ApplyGeometryOptions, LayerBox, LayerGeometryPatch} from './types';
import {TransformWriter, type TransformEntry} from '../dom/TransformWriter';

export interface GeometryCoordinatorOptions {
    getLayers: () => LayerBox[];
    getElementById: (id: string) => HTMLElement | null;
}

export type GeometryOverlayRenderer = (patches?: Map<string, LayerGeometryPatch>) => void;

export class GeometryCoordinator {
    private readonly options: GeometryCoordinatorOptions;

    private readonly layerIndexManager: LayerIndexManager;

    private readonly renderOverlay: GeometryOverlayRenderer;

    private readonly transformWriter: TransformWriter;

    constructor(
        options: GeometryCoordinatorOptions,
        layerIndexManager: LayerIndexManager,
        renderOverlay: GeometryOverlayRenderer,
        transformWriter = new TransformWriter(),
    ) {
        this.options = options;
        this.layerIndexManager = layerIndexManager;
        this.renderOverlay = renderOverlay;
        this.transformWriter = transformWriter;
    }

    applyLayerGeometry(patches: LayerGeometryPatch[], options: ApplyGeometryOptions = {}) {
        const writeDom = options.writeDom ?? true;
        const refreshOverlay = options.refreshOverlay ?? true;
        const normalizedPatches = patches.map(sanitizeGeometryPatch);
        let writeCount = 0;
        const layersById = this.layerIndexManager.resolvePatchLayersById(normalizedPatches);

        if (writeDom && normalizedPatches.length > 0) {
            const entries: Array<{entry: TransformEntry; patch: LayerGeometryPatch}> = [];

            for (const patch of normalizedPatches) {
                const layer = layersById.get(patch.id);
                const element = this.options.getElementById(patch.id);

                if (!layer || !element) {
                    continue;
                }

                entries.push({
                    entry: {element, box: layer},
                    patch,
                });
            }

            writeCount = this.transformWriter.writeGeometryPatches(entries);
        }

        if (refreshOverlay) {
            this.renderOverlay(new Map(normalizedPatches.map((patch) => [patch.id, patch])));
        }

        if (normalizedPatches.length > 0) {
            this.layerIndexManager.applyPatches(normalizedPatches, layersById);
        }

        return writeCount;
    }

    refreshLayerGeometry(ids?: string[], options: Pick<ApplyGeometryOptions, 'refreshOverlay'> = {}) {
        const selectedIds = ids ? new Set(ids) : null;
        const layers = selectedIds
            ? this.layerIndexManager.resolveLayersByIds(selectedIds)
            : this.options.getLayers();
        const patches = layers.map((layer) => ({
                id: layer.id,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height,
                rotate: layer.rotate,
            }));

        return this.applyLayerGeometry(patches, {
            writeDom: true,
            refreshOverlay: options.refreshOverlay,
        });
    }
}

function sanitizeGeometryPatch(patch: LayerGeometryPatch): LayerGeometryPatch {
    const sanitized: LayerGeometryPatch = {
        id: patch.id,
    };

    if (patch.x !== undefined) {
        sanitized.x = patch.x;
    }

    if (patch.y !== undefined) {
        sanitized.y = patch.y;
    }

    if (patch.width !== undefined) {
        sanitized.width = patch.width;
    }

    if (patch.height !== undefined) {
        sanitized.height = patch.height;
    }

    if (patch.rotate !== undefined) {
        sanitized.rotate = patch.rotate;
    }

    return sanitized;
}
