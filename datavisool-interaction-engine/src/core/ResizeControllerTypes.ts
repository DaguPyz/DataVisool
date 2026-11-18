import type {LayerBox, Point, SnapOptions, TransformTargetFilter} from './types';
import type {InteractionPerfMonitor} from './InteractionPerfMonitor';
import type {SnapEngine, SnapResult} from './SnapEngine';
import type {TransformWriter} from '../dom/TransformWriter';

export type ResizeHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ResizeControllerOptions {
    transformWriter?: TransformWriter;
    perfMonitor?: InteractionPerfMonitor;
    snapEngine?: SnapEngine;
    onSnap?: (result: SnapResult | null) => void;
    minWidth?: number;
    minHeight?: number;
    resizeStep?: number;
    requestFrame?: (callback: FrameRequestCallback) => number;
    cancelFrame?: (id: number) => void;
}

export interface StartResizeInput {
    layer: LayerBox;
    element: HTMLElement;
    previewElement?: HTMLElement | null;
    useRealElementPreview?: boolean;
    handle: ResizeHandle;
    pointer: Point;
    minWidth?: number;
    minHeight?: number;
    resizeStep?: number;
    snapCandidates?: LayerBox[];
    snapCandidatesVersion?: number;
    snapOptions?: SnapOptions;
    filterActiveTargets?: TransformTargetFilter;
}

export interface StartResizeManyInput {
    layers: LayerBox[];
    elements: Map<string, HTMLElement>;
    previewElement?: HTMLElement | null;
    useRealElementPreview?: boolean;
    handle: ResizeHandle;
    pointer: Point;
    minWidth?: number;
    minHeight?: number;
    resizeStep?: number;
    snapCandidates?: LayerBox[];
    snapCandidatesVersion?: number;
    snapOptions?: SnapOptions;
    filterActiveTargets?: TransformTargetFilter;
}

export interface ResizeMoveOptions {
    keepRatio?: boolean;
}
