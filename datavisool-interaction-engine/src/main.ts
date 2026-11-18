/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
export {createHelloWorldPage, renderHelloWorldPage} from './pages/HelloWorldPage';
export type {HelloWorldPageOptions} from './pages/HelloWorldPage';
export {resolveDragActiveTargets} from './core/ActiveTargetResolver';
export type {ResolveDragActiveTargetsInput, ResolveDragActiveTargetsResult} from './core/ActiveTargetResolver';
export {createCoordinateSnapshot, clientPointToCanvasPoint} from './core/Coordinate';
export type {CoordinateSnapshot} from './core/Coordinate';
export {createBoundsLayer, createSelectionBounds} from './core/Bounds';
export {
    containsLayerRect,
    getLayerBounds,
    getLayerCorners,
    intersectsLayerRect,
} from './core/Geometry';
export {DragController} from './core/DragController';
export type {DragControllerOptions, StartDragInput} from './core/DragController';
export {findTopLayerAtPoint} from './core/HitTest';
export {InteractionEngine} from './core/InteractionEngine';
export type {InteractionEngineDependencies} from './core/InteractionEngine';
export {InteractionPerfMonitor} from './core/InteractionPerfMonitor';
export type {InteractionPerfSnapshot} from './core/InteractionPerfMonitor';
export {ResizeController} from './core/ResizeController';
export type {
    ResizeControllerOptions,
    ResizeHandle,
    ResizeMoveOptions,
    StartResizeInput,
    StartResizeManyInput,
} from './core/ResizeController';
export {RotateController} from './core/RotateController';
export type {
    RotateControllerOptions,
    RotateMoveOptions,
    StartRotateInput,
    StartRotateManyInput,
} from './core/RotateController';
export {SelectionBoxController} from './core/SelectionBoxController';
export type {SelectionBoxControllerOptions, SelectionBoxResult} from './core/SelectionBoxController';
export {SelectionManager} from './core/SelectionManager';
export type {ResolveBoxSelectionInput, ResolvePointSelectionInput} from './core/SelectionManager';
export {SnapEngine, createExpandedRect, createUnionRect, normalizeSnapOptions} from './core/SnapEngine';
export type {
    ResolveSnapOptions,
    ResolveSnapLinesInput,
    SnapAxis,
    SnapGuide,
    SnapLine,
    SnapLineType,
    SnapRelationDirection,
    SnapResult,
    SnapSession,
    StartSnapInput,
} from './core/SnapEngine';
export {SpatialIndex} from './core/SpatialIndex';
export type {SpatialIndexOptions} from './core/SpatialIndex';
export {SelectionOverlay} from './dom/SelectionOverlay';
export {ReadonlySelectionOverlay} from './dom/ReadonlySelectionOverlay';
export {getResizeHandleFromEventTarget, isRotateHandleEventTarget, ResizeOverlay} from './dom/ResizeOverlay';
export type {ResizeOverlayRenderOptions} from './dom/ResizeOverlay';
export {SnapOverlay} from './dom/SnapOverlay';
export type {SnapOverlayOptions} from './dom/SnapOverlay';
export {TransformWriter} from './dom/TransformWriter';
export type {TransformEntry} from './dom/TransformWriter';
export type {
    ApplyGeometryOptions,
    BoxSelectionMode,
    BoxSelectionModeResolver,
    BoxSelectionModeShortcut,
    BoxSelectionModifier,
    BoxSelectionStartShortcut,
    DragCommitItem,
    InteractionEngineFeatureSwitches,
    InteractionEngineOptions,
    InteractionShortcutEvent,
    InteractionShortcutPredicate,
    LayerBox,
    LayerGeometryPatch,
    Point,
    PointerLike,
    Rect,
    ResizeCommitItem,
    RotateCommitItem,
    SelectedLayerOutlineStyle,
    SnapMode,
    SnapOptions,
    SnapReferencePoints,
    TransformTargetFilter,
    TransformTargetValidationInput,
} from './core/types';

export const DATAVISOOL_INTERACTION_ENGINE_PACKAGE = '@datavisool/interaction-engine';
