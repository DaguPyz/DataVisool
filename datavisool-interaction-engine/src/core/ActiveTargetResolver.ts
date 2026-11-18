/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox} from './types';

export interface ResolveDragActiveTargetsInput {
    hitLayer: LayerBox;
    selectedIds: string[];
    layersById: Map<string, LayerBox>;
}

export interface ResolveDragActiveTargetsResult {
    activeIds: string[];
    selectIds?: string[];
}

function unique(ids: string[]) {
    return Array.from(new Set(ids));
}

export function resolveDragActiveTargets({
    hitLayer,
    selectedIds,
    layersById,
}: ResolveDragActiveTargetsInput): ResolveDragActiveTargetsResult {
    const normalizedSelectedIds = unique(selectedIds);
    const hitSelected = normalizedSelectedIds.includes(hitLayer.id);
    const candidateIds = hitSelected ? normalizedSelectedIds : [hitLayer.id];
    const activeIds = candidateIds.filter((id) => {
        const layer = layersById.get(id);
        return Boolean(layer);
    });

    return {
        activeIds,
        selectIds: hitSelected ? undefined : [hitLayer.id],
    };
}
