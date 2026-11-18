/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {createExpandedRect, createUnionRect, normalizeSnapOptions, type SnapResult} from './SnapEngine';
import {SpatialIndex} from './SpatialIndex';
import type {LayerBox, SnapOptions} from './types';
import {SnapOverlay} from '../dom/SnapOverlay';

export interface SnapCoordinatorOptions {
    getScale: () => number;
    resolveSnapCandidateIds?: (input: {
        activeIds: string[];
        candidateIds: string[];
    }) => string[];
    getSnapReferencePoints?: () => SnapOptions['referencePoints'];
    getSnapOptions?: () => SnapOptions;
    getSnapGuideColor?: () => string;
    snapMode?: SnapOptions['mode'];
    snapThreshold?: number;
    snapCandidateRange?: number;
    snapReferencePoints?: SnapOptions['referencePoints'];
    snapGuideColor?: string;
}

export class SnapCoordinator {
    private readonly options: SnapCoordinatorOptions;

    private readonly overlay: SnapOverlay;

    constructor(options: SnapCoordinatorOptions, overlay = new SnapOverlay()) {
        this.options = options;
        this.overlay = overlay;
    }

    attach(container: HTMLElement) {
        this.overlay.attach(container);
    }

    detach() {
        this.overlay.detach();
    }

    resolveOptions(): SnapOptions {
        const dynamicOptions = this.options.getSnapOptions?.() ?? {};
        const mode = dynamicOptions.mode ?? this.options.snapMode ?? 'off';
        const referencePoints = dynamicOptions.referencePoints
            ?? this.options.getSnapReferencePoints?.()
            ?? this.options.snapReferencePoints;
        const rawScale = this.options.getScale();
        const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
        const defaultThreshold = 5 / scale;
        const defaultCandidateRange = 360 / scale;

        return {
            mode,
            threshold: dynamicOptions.threshold ?? this.options.snapThreshold ?? defaultThreshold,
            candidateRange: dynamicOptions.candidateRange ?? this.options.snapCandidateRange ?? defaultCandidateRange,
            referencePoints,
        };
    }

    resolveCandidates(
        activeLayers: LayerBox[],
        layers: LayerBox[],
        spatialIndex: SpatialIndex,
        options: SnapOptions,
    ) {
        const snapOptions = normalizeSnapOptions(options);

        if (snapOptions.mode === 'off') {
            return [];
        }

        if (snapOptions.mode === 'all') {
            return this.resolveCandidateLayers(activeLayers, layers);
        }

        const movingRect = createUnionRect(activeLayers);

        if (!movingRect) {
            return [];
        }

        return this.resolveCandidateLayers(
            activeLayers,
            spatialIndex.queryRect(createExpandedRect(movingRect, snapOptions.candidateRange)),
        );
    }

    render(result: SnapResult | null) {
        if (!result || result.guides.length === 0) {
            this.overlay.hide();
            return;
        }

        this.overlay.setGuideColor(this.options.getSnapGuideColor?.() ?? this.options.snapGuideColor);
        this.overlay.render(result.guides);
    }

    private resolveCandidateLayers(activeLayers: LayerBox[], candidates: LayerBox[]) {
        const activeIds = activeLayers.map((layer) => layer.id);
        const candidateIds = candidates.map((layer) => layer.id);
        const resolved = this.options.resolveSnapCandidateIds?.({
            activeIds,
            candidateIds,
        });

        if (!resolved) {
            return candidates;
        }

        const candidatesById = new Map(candidates.map((layer) => [layer.id, layer]));

        return resolved
            .map((id) => candidatesById.get(id))
            .filter((layer): layer is LayerBox => Boolean(layer));
    }
}
