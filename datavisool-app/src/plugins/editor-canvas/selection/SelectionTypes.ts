/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {ILayerItem} from "@datavisool/sdk/types";

export type LayerConfigMap = Readonly<Record<string, ILayerItem>>;

export interface EffectiveLayerState {
    hidden: boolean;
    locked: boolean;
}

export interface SelectionResolveOptions {
    deep?: boolean;
}

export interface CommandTargetResolveOptions {
    allowLockedManagement?: boolean;
}

export interface SelectionBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export interface SelectionObjectGeometry {
    id: string;
    targetIds: string[];
    bounds: SelectionBounds;
}

export type SelectionAlignment = "left" | "right" | "top" | "bottom" | "horizontalCenter" | "verticalCenter";

export interface SelectionAlignmentMove extends SelectionObjectGeometry {
    dx: number;
    dy: number;
}
