/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LayerBox extends Rect {
    id: string;
    rotate: number;
}

export interface DragCommitItem {
    id: string;
    x: number;
    y: number;
}

export interface ResizeCommitItem extends Rect {
    id: string;
}

export interface RotateCommitItem {
    id: string;
    x?: number;
    y?: number;
    rotate: number;
}

export interface LayerGeometryPatch {
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotate?: number;
}

export interface TransformTargetValidationInput {
    id: string;
    element: HTMLElement;
}

export type TransformTargetFilter = (
    targets: readonly TransformTargetValidationInput[]
) => ReadonlySet<string>;

export interface ApplyGeometryOptions {
    writeDom?: boolean;
    refreshOverlay?: boolean;
}

export interface InteractionEngineFeatureSwitches {
    drag?: boolean;
    resize?: boolean;
    rotate?: boolean;
}

export interface SelectedLayerOutlineStyle {
    color?: string;
    width?: number | string;
    radius?: number | string;
}

export type SnapMode = 'off' | 'nearby' | 'all';

export type BoxSelectionMode = 'intersect' | 'contain';

export type BoxSelectionModifier = 'alt' | 'shift' | 'control' | 'meta';

export interface InteractionShortcutEvent {
    type?: string;
    key?: string;
    code?: string;
    altKey?: boolean;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    target?: EventTarget | null;
}

export type InteractionShortcutPredicate = (event?: InteractionShortcutEvent) => boolean;

export type BoxSelectionModeResolver = (event?: InteractionShortcutEvent) => BoxSelectionMode;

export interface BoxSelectionModeShortcut {
    modifier: BoxSelectionModifier;
    mode: BoxSelectionMode;
}

export interface BoxSelectionStartShortcut {
    modifier: BoxSelectionModifier;
}

export interface SnapReferencePoints {
    x?: readonly number[];
    y?: readonly number[];
}

export interface SnapOptions {
    mode?: SnapMode;
    threshold?: number;
    candidateRange?: number;
    referencePoints?: SnapReferencePoints;
}

export interface InteractionEngineOptions {
    /**
     * Canvas-coordinate container. Layer geometry, hit testing, transform overlay,
     * and selection boxes are resolved in this element's coordinate system.
     */
    container: HTMLElement;
    /**
     * Optional pointer event root. Use this when the interactive workspace is
     * larger than the canvas-coordinate container.
     */
    eventContainer?: HTMLElement;
    /**
     * Optional explicit coordinate root. Defaults to container.
     */
    coordinateContainer?: HTMLElement;
    /**
     * Optional overlay root. Defaults to coordinateContainer/container.
     */
    overlayContainer?: HTMLElement;
    getScale: () => number;
    getLayers: () => LayerBox[];
    getLayerById?: (id: string) => LayerBox | null;
    getLayersVersion?: () => number;
    getLayerIndexVersion?: () => number;
    getSelectedIds: () => string[];
    getReadonlySelectionLayers?: () => LayerBox[];
    getElementById: (id: string) => HTMLElement | null;
    resolveHitTarget?: (input: {
        point: Point;
        candidates: LayerBox[];
        selectedIds: string[];
    }) => string | null;
    resolveSelectionIds?: (input: {
        hitId: string | null;
        selectedIds: string[];
        additive: boolean;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
        event?: PointerLike;
    }) => string[];
    resolveBoxSelectionIds?: (input: {
        candidateIds: string[];
        selectedIds: string[];
        additive: boolean;
        boxSelectionMode: BoxSelectionMode;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
        event?: PointerLike;
    }) => string[];
    resolveTransformTargetIds?: (input: {
        hitId?: string;
        selectedIds: string[];
    }) => string[];
    resolveSnapCandidateIds?: (input: {
        activeIds: string[];
        candidateIds: string[];
    }) => string[];
    getSnapReferencePoints?: () => SnapReferencePoints | undefined;
    getSnapOptions?: () => SnapOptions;
    getSnapGuideColor?: () => string;
    getSelectedOutlineStyle?: () => SelectedLayerOutlineStyle | undefined;
    boxSelectionMode?: BoxSelectionMode;
    getBoxSelectionMode?: () => BoxSelectionMode;
    resolveBoxSelectionMode?: BoxSelectionModeResolver;
    boxSelectionModeShortcut?: BoxSelectionModeShortcut;
    boxSelectionStartShortcut?: BoxSelectionStartShortcut;
    isAdditiveSelectionActive?: InteractionShortcutPredicate;
    isBoxSelectionStartActive?: InteractionShortcutPredicate;
    isAxisLockActive?: InteractionShortcutPredicate;
    enabledFeatures?: InteractionEngineFeatureSwitches;
    getEnabledFeatures?: () => InteractionEngineFeatureSwitches;
    snapMode?: SnapMode;
    snapThreshold?: number;
    snapCandidateRange?: number;
    snapReferencePoints?: SnapReferencePoints;
    snapGuideColor?: string;
    selectedOutlineStyle?: SelectedLayerOutlineStyle;
    getDragStep?: () => number;
    getResizeStep?: () => number;
    dragStep?: number;
    resizeStep?: number;
    minResizeWidth?: number;
    minResizeHeight?: number;
    rotateSnapStep?: number;
    selectionThreshold?: number;
    axisLockThreshold?: number;
    spatialIndexBucketSize?: number;
    onSelect?: (ids: string[]) => void;
    onDragEnd?: (items: DragCommitItem[]) => void;
    /** @deprecated use onDragEnd */
    onDragCommit?: (items: DragCommitItem[]) => void;
    onResizeCommit?: (item: ResizeCommitItem) => void;
    onResizeBatchCommit?: (items: ResizeCommitItem[]) => void;
    onRotateCommit?: (item: RotateCommitItem) => void;
    onRotateBatchCommit?: (items: RotateCommitItem[]) => void;
}

export interface PointerLike extends InteractionShortcutEvent {
    clientX: number;
    clientY: number;
    button?: number;
    pointerId?: number;
    preventDefault?: () => void;
}
