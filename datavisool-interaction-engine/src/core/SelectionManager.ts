/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox} from './types';

function unique(ids: string[]) {
    return Array.from(new Set(ids));
}

export interface ResolvePointSelectionInput {
    hitLayer: LayerBox | null;
    selectedIds: string[];
    additive?: boolean;
}

export interface ResolveBoxSelectionInput {
    hitLayers: LayerBox[];
    selectedIds: string[];
    additive?: boolean;
}

export class SelectionManager {
    resolvePointSelection({hitLayer, selectedIds, additive = false}: ResolvePointSelectionInput) {
        if (!hitLayer) {
            return additive ? unique(selectedIds) : [];
        }

        if (!additive) {
            return [hitLayer.id];
        }

        if (selectedIds.includes(hitLayer.id)) {
            return selectedIds.filter((id) => id !== hitLayer.id);
        }

        return unique([...selectedIds, hitLayer.id]);
    }

    resolveBoxSelection({hitLayers, selectedIds, additive = false}: ResolveBoxSelectionInput) {
        const hitIds = hitLayers.map((layer) => layer.id);

        if (!additive) {
            return unique(hitIds);
        }

        return unique([...selectedIds, ...hitIds]);
    }
}
