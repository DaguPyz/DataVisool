/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {createBoundsLayer} from './Bounds';
import {LayerIndexManager} from './LayerIndexManager';
import type {
    LayerBox,
    LayerGeometryPatch,
    SelectedLayerOutlineStyle,
    TransformTargetValidationInput,
} from './types';
import {ResizeOverlay} from '../dom/ResizeOverlay';
import {ReadonlySelectionOverlay} from '../dom/ReadonlySelectionOverlay';

export interface TransformSelectionCoordinatorOptions {
    getLayers: () => LayerBox[];
    getSelectedIds: () => string[];
    getReadonlySelectionLayers?: () => LayerBox[];
    getElementById: (id: string) => HTMLElement | null;
    resolveTransformTargetIds?: (input: {
        hitId?: string;
        selectedIds: string[];
    }) => string[];
    getSelectedOutlineStyle?: () => SelectedLayerOutlineStyle | undefined;
    selectedOutlineStyle?: SelectedLayerOutlineStyle;
}

export interface TransformSelectionFeatures {
    drag: boolean;
    resize: boolean;
    rotate: boolean;
}

export interface TransformSelection {
    type: 'single' | 'group';
    layers: LayerBox[];
    elements: Map<string, HTMLElement>;
    overlayLayer: LayerBox;
}

export class TransformSelectionCoordinator {
    private readonly options: TransformSelectionCoordinatorOptions;

    private readonly layerIndexManager: LayerIndexManager;

    private readonly overlay: ResizeOverlay;

    private readonly readonlyOverlay: ReadonlySelectionOverlay;

    constructor(
        options: TransformSelectionCoordinatorOptions,
        layerIndexManager: LayerIndexManager,
        overlay = new ResizeOverlay(),
        readonlyOverlay = new ReadonlySelectionOverlay(),
    ) {
        this.options = options;
        this.layerIndexManager = layerIndexManager;
        this.overlay = overlay;
        this.readonlyOverlay = readonlyOverlay;
    }

    attach(container: HTMLElement) {
        this.overlay.attach(container);
        this.readonlyOverlay.attach(container);
    }

    detach() {
        this.overlay.detach();
        this.readonlyOverlay.detach();
    }

    hide() {
        this.overlay.hide();
        this.readonlyOverlay.hide();
    }

    getPreviewElement() {
        return this.overlay.getElement();
    }

    renderSelection(
        features: TransformSelectionFeatures,
        patches?: Map<string, LayerGeometryPatch>,
    ) {
        this.readonlyOverlay.render(this.options.getReadonlySelectionLayers?.() ?? []);

        if (!features.drag && !features.resize && !features.rotate) {
            this.overlay.hide();
            return;
        }

        const selection = this.resolveSelection(patches);

        if (!selection) {
            this.overlay.hide();
            return;
        }

        this.overlay.render(selection.overlayLayer, {
            showResizeHandles: features.resize,
            showRotateHandle: features.rotate,
            outlineStyle: this.resolveSelectedOutlineStyle(),
        });
    }

    renderPreview(layer: LayerBox) {
        this.overlay.render(layer, {
            showResizeHandles: false,
            showRotateHandle: false,
            outlineStyle: this.resolveSelectedOutlineStyle(),
        });
    }

    resolveTargetIds(
        hitId: string | undefined,
        selectedIds: string[],
        layersById: Map<string, LayerBox>,
    ) {
        const resolved = this.options.resolveTransformTargetIds?.({hitId, selectedIds});
        const candidateIds = resolved ?? selectedIds;
        const uniqueIds = Array.from(new Set(candidateIds));

        return uniqueIds.filter((id) => layersById.has(id));
    }

    resolveSelection(patches?: Map<string, LayerGeometryPatch>): TransformSelection | null {
        const selectedIds = this.options.getSelectedIds();

        if (selectedIds.length === 0) {
            return null;
        }

        const allLayers = this.options.getLayers();
        const layersById = this.layerIndexManager.resolveCurrentLayersById();
        const transformIds = this.resolveTargetIds(undefined, selectedIds, layersById);
        const selected = new Set(transformIds);
        const layers = allLayers
            .filter((item) => selected.has(item.id))
            .map((item) => ({
                ...(layersById.get(item.id) ?? item),
                ...patches?.get(item.id),
            }));
        const elements = new Map<string, HTMLElement>();

        for (const layer of layers) {
            const element = this.options.getElementById(layer.id);

            if (element) {
                elements.set(layer.id, element);
            }
        }

        const activeLayers = layers.filter((layer) => elements.has(layer.id));

        if (activeLayers.length === 0) {
            return null;
        }

        if (activeLayers.length === 1) {
            return {
                type: 'single',
                layers: activeLayers,
                elements,
                overlayLayer: activeLayers[0],
            };
        }

        const overlayLayer = createBoundsLayer(activeLayers);

        if (!overlayLayer) {
            return null;
        }

        return {
            type: 'group',
            layers: activeLayers,
            elements,
            overlayLayer,
        };
    }

    filterActiveTargets(targets: readonly TransformTargetValidationInput[]) {
        const layersById = this.layerIndexManager.resolveCurrentLayersById();
        const activeIds = new Set<string>();

        for (const target of targets) {
            if (!layersById.has(target.id)) {
                continue;
            }

            if (this.options.getElementById(target.id) === target.element) {
                activeIds.add(target.id);
            }
        }

        return activeIds;
    }

    private resolveSelectedOutlineStyle(): SelectedLayerOutlineStyle | undefined {
        return this.options.getSelectedOutlineStyle?.() ?? this.options.selectedOutlineStyle;
    }
}
