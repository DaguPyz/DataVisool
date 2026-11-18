/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {createBoundsLayer} from './Bounds';
import {createCoordinateSnapshot, clientPointToCanvasPoint} from './Coordinate';
import {DragController} from './DragController';
import {GeometryCoordinator} from './GeometryCoordinator';
import {ResizeController} from './ResizeController';
import {RotateController} from './RotateController';
import {SelectionBoxController} from './SelectionBoxController';
import {SelectionManager} from './SelectionManager';
import {SelectionResolver} from './SelectionResolver';
import {SnapCoordinator} from './SnapCoordinator';
import {SpatialIndex} from './SpatialIndex';
import {LayerIndexManager} from './LayerIndexManager';
import {PointerSession} from './PointerSession';
import {TransformSelectionCoordinator} from './TransformSelectionCoordinator';
import type {
    ApplyGeometryOptions,
    InteractionEngineFeatureSwitches,
    InteractionEngineOptions,
    LayerBox,
    LayerGeometryPatch,
    PointerLike,
} from './types';
import {getResizeHandleFromEventTarget, isRotateHandleEventTarget} from '../dom/ResizeOverlay';
import type {ResizeOverlay} from '../dom/ResizeOverlay';
import type {ReadonlySelectionOverlay} from '../dom/ReadonlySelectionOverlay';
import type {SnapOverlay} from '../dom/SnapOverlay';

type ResolvedFeatureSwitches = Required<InteractionEngineFeatureSwitches>;

export interface InteractionEngineDependencies {
    dragController?: DragController;
    resizeController?: ResizeController;
    rotateController?: RotateController;
    selectionBoxController?: SelectionBoxController;
    selectionManager?: SelectionManager;
    resizeOverlay?: ResizeOverlay;
    readonlySelectionOverlay?: ReadonlySelectionOverlay;
    snapOverlay?: SnapOverlay;
}

export class InteractionEngine {
    private readonly options: InteractionEngineOptions;

    private readonly dragController: DragController;

    private readonly resizeController: ResizeController;

    private readonly rotateController: RotateController;

    private readonly selectionBoxController: SelectionBoxController;

    private readonly selectionResolver: SelectionResolver;

    private readonly transformSelectionCoordinator: TransformSelectionCoordinator;

    private readonly snapCoordinator: SnapCoordinator;

    private readonly geometryCoordinator: GeometryCoordinator;

    private readonly layerIndexManager: LayerIndexManager;

    private readonly pointerSession: PointerSession;

    private mounted = false;

    private selectionShortcutListenersActive = false;

    constructor(options: InteractionEngineOptions, dependencies: InteractionEngineDependencies = {}) {
        this.options = options;
        this.layerIndexManager = new LayerIndexManager({
            bucketSize: options.spatialIndexBucketSize,
            getLayers: options.getLayers,
            getLayerById: options.getLayerById,
            getVersion: () => options.getLayerIndexVersion?.() ?? options.getLayersVersion?.(),
        });
        this.transformSelectionCoordinator = new TransformSelectionCoordinator(
            options,
            this.layerIndexManager,
            dependencies.resizeOverlay,
            dependencies.readonlySelectionOverlay,
        );
        this.snapCoordinator = new SnapCoordinator(options, dependencies.snapOverlay);
        this.geometryCoordinator = new GeometryCoordinator(
            options,
            this.layerIndexManager,
            (patches) => this.renderResizeOverlay(patches),
        );
        this.dragController = dependencies.dragController ?? new DragController({
            axisLockThreshold: options.axisLockThreshold,
            dragStep: options.dragStep,
            onSnap: (result) => this.snapCoordinator.render(result),
        });
        this.resizeController = dependencies.resizeController ?? new ResizeController({
            resizeStep: options.resizeStep,
            minWidth: options.minResizeWidth,
            minHeight: options.minResizeHeight,
            onSnap: (result) => this.snapCoordinator.render(result),
        });
        this.rotateController = dependencies.rotateController ?? new RotateController({
            snapStep: options.rotateSnapStep,
        });
        this.selectionBoxController = dependencies.selectionBoxController
            ?? new SelectionBoxController({threshold: options.selectionThreshold});
        this.selectionResolver = new SelectionResolver(options, dependencies.selectionManager);
        this.pointerSession = new PointerSession({
            getEventContainer: () => this.resolveEventContainer(),
            onPointerMove: (event) => this.handlePointerMove(event),
            onPointerUp: (event) => this.handlePointerUp(event),
            onPointerCancel: (event) => this.handlePointerCancel(event),
        });
    }

    mount() {
        if (this.mounted) {
            return;
        }

        const eventContainer = this.resolveEventContainer();
        const overlayContainer = this.resolveOverlayContainer();

        this.selectionBoxController.attach(overlayContainer);
        this.transformSelectionCoordinator.attach(overlayContainer);
        this.snapCoordinator.attach(overlayContainer);
        eventContainer.addEventListener('pointerdown', this.handlePointerDown);
        this.refreshResizeOverlay();
        this.mounted = true;
    }

    destroy() {
        if (!this.mounted) {
            return;
        }

        this.resolveEventContainer().removeEventListener('pointerdown', this.handlePointerDown);
        this.pointerSession.destroy();
        this.dragController.cancel();
        this.resizeController.cancel();
        this.rotateController.cancel();
        this.stopSelectionShortcutListeners();
        this.selectionBoxController.destroy();
        this.transformSelectionCoordinator.detach();
        this.snapCoordinator.detach();
        this.invalidateLayerIndex();
        this.mounted = false;
    }

    getPerfSnapshot() {
        return this.dragController.getPerfSnapshot();
    }

    refreshResizeOverlay() {
        if (this.pointerSession.isTransformActive()) {
            return;
        }

        this.renderResizeOverlay();
    }

    invalidateLayerIndex() {
        this.layerIndexManager.invalidate();
    }

    rebuildLayerIndex(layers = this.options.getLayers()) {
        return this.layerIndexManager.rebuild(layers);
    }

    updateLayerIndex(layer: LayerBox) {
        this.layerIndexManager.update(layer);
    }

    removeLayerIndex(id: string) {
        this.layerIndexManager.remove(id);
    }

    queryLayersAtClientPoint(point: Pick<PointerLike, 'clientX' | 'clientY'>): LayerBox[] {
        const layers = this.options.getLayers();
        const snapshot = createCoordinateSnapshot(this.resolveCoordinateContainer(), this.options.getScale());
        const canvasPoint = clientPointToCanvasPoint(point, snapshot);

        return this.layerIndexManager.ensure(layers).spatialIndex
            .queryPoint(canvasPoint)
            .map((layer) => ({...layer}));
    }

    private renderResizeOverlay(patches?: Map<string, LayerGeometryPatch>) {
        this.transformSelectionCoordinator.renderSelection(this.resolveFeatureSwitches(), patches);
    }

    applyLayerGeometry(patches: LayerGeometryPatch[], options: ApplyGeometryOptions = {}) {
        return this.geometryCoordinator.applyLayerGeometry(patches, options);
    }

    refreshLayerGeometry(ids?: string[], options: Pick<ApplyGeometryOptions, 'refreshOverlay'> = {}) {
        return this.geometryCoordinator.refreshLayerGeometry(ids, options);
    }

    private readonly handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
            return;
        }

        const features = this.resolveFeatureSwitches();

        if (features.rotate && isRotateHandleEventTarget(event.target) && this.startRotate(event)) {
            return;
        }

        const resizeHandle = getResizeHandleFromEventTarget(event.target);
        if (features.resize && resizeHandle && this.startResize(resizeHandle, event)) {
            return;
        }

        const layers = this.options.getLayers();
        const layerIndex = this.layerIndexManager.ensure(layers);
        const layersById = layerIndex.layersById;
        const spatialIndex = layerIndex.spatialIndex;

        const snapshot = createCoordinateSnapshot(this.resolveCoordinateContainer(), this.options.getScale());
        const point = clientPointToCanvasPoint(event, snapshot);
        const additive = this.selectionResolver.isAdditiveSelectionActive(event);

        if (this.selectionResolver.isBoxSelectionStartShortcutActive(event)) {
            this.startSelection(point, snapshot, spatialIndex, additive, event);
            return;
        }

        const hitLayer = this.selectionResolver.resolveHitLayer(point, spatialIndex.queryPoint(point));

        if (additive && hitLayer) {
            this.options.onSelect?.(this.selectionResolver.resolvePointSelection(hitLayer, true, event));
            this.refreshResizeOverlay();
            event.preventDefault();
            return;
        }

        if (!hitLayer) {
            this.startSelection(point, snapshot, spatialIndex, additive, event);
            return;
        }

        const selectedIds = this.options.getSelectedIds();
        const resolvedHitSelection = this.selectionResolver.resolvePointSelection(hitLayer, false, event);
        const hitSelected = selectedIds.includes(hitLayer.id)
            || (resolvedHitSelection.length > 0
                && resolvedHitSelection.every((id) => selectedIds.includes(id)));
        const selectIds = hitSelected ? undefined : resolvedHitSelection;
        const transformSelectedIds = selectIds ?? selectedIds;
        const activeIds = this.transformSelectionCoordinator.resolveTargetIds(
            hitLayer.id,
            transformSelectedIds,
            layersById,
        );

        if (selectIds) {
            this.options.onSelect?.(selectIds);
            this.refreshResizeOverlay();
        }

        if (!features.drag) {
            event.preventDefault();
            return;
        }

        const activeLayers = activeIds
            .map((id) => layersById.get(id))
            .filter((layer): layer is LayerBox => Boolean(layer));
        const activeElements = new Map<string, HTMLElement>();

        for (const layer of activeLayers) {
            const element = this.options.getElementById(layer.id);

            if (element) {
                activeElements.set(layer.id, element);
            }
        }

        const snapOptions = this.snapCoordinator.resolveOptions();
        const previewLayer = createBoundsLayer(activeLayers);

        if (!previewLayer) {
            return;
        }

        this.transformSelectionCoordinator.renderPreview(previewLayer);
        const snapCandidates = this.snapCoordinator.resolveCandidates(activeLayers, layers, spatialIndex, snapOptions);
        const snapCandidatesVersion = this.layerIndexManager.getVersion();

        const started = this.dragController.start({
            hitId: hitLayer.id,
            activeLayers,
            activeElements,
            previewElement: this.transformSelectionCoordinator.getPreviewElement(),
            useRealElementPreview: false,
            filterActiveTargets: (targets) => this.transformSelectionCoordinator.filterActiveTargets(targets),
            snapCandidates,
            snapCandidatesVersion,
            snapOptions,
            dragStep: this.resolveDragStep(),
            pointer: point,
        });

        if (!started) {
            this.refreshResizeOverlay();
            return;
        }

        this.pointerSession.start('drag', snapshot, event.pointerId);
    };

    private resolveDragStep() {
        return this.options.getDragStep?.() ?? this.options.dragStep;
    }

    private resolveFeatureSwitches(): ResolvedFeatureSwitches {
        const configured = this.options.enabledFeatures;
        const dynamic = this.options.getEnabledFeatures?.();

        return {
            drag: dynamic?.drag ?? configured?.drag ?? true,
            resize: dynamic?.resize ?? configured?.resize ?? true,
            rotate: dynamic?.rotate ?? configured?.rotate ?? true,
        };
    }

    private resolveResizeStep() {
        return this.options.getResizeStep?.() ?? this.options.resizeStep;
    }

    private readonly handlePointerMove = (event: PointerEvent) => {
        if (!this.pointerSession.isActivePointer(event)) {
            return;
        }

        const snapshot = this.pointerSession.getSnapshot();
        const activeMode = this.pointerSession.getMode();

        if (!snapshot || !activeMode) {
            return;
        }

        const point = clientPointToCanvasPoint(event, snapshot);

        if (activeMode === 'drag') {
            this.dragController.move(point, {axisLocked: this.isAxisLockActive(event)});
            this.pointerSession.captureAfterMove(event, this.dragController.hasMoved());
        } else if (activeMode === 'resize') {
            this.resizeController.move(point, {keepRatio: this.isRatioResize(event)});
        } else if (activeMode === 'rotate') {
            this.rotateController.move(point, {snapAngle: Boolean(event.shiftKey)});
        } else {
            this.selectionBoxController.move(
                point,
                this.selectionResolver.resolveBoxSelectionMode(event),
            );
        }

        event.preventDefault();
    };

    private readonly handlePointerUp = (event: PointerEvent) => {
        if (!this.pointerSession.isActivePointer(event)) {
            return;
        }

        const snapshot = this.pointerSession.getSnapshot();
        const activeMode = this.pointerSession.getMode();

        if (!snapshot || !activeMode) {
            return;
        }

        const point = clientPointToCanvasPoint(event, snapshot);

        if (activeMode === 'drag') {
            const items = this.dragController.end(point, {axisLocked: this.isAxisLockActive(event)});
            this.pointerSession.cleanup(event);

            if (items.length > 0) {
                this.layerIndexManager.applyCommittedGeometry(items);
                (this.options.onDragEnd ?? this.options.onDragCommit)?.(items);
                event.preventDefault();
            }

            this.refreshResizeOverlay();
            return;
        }

        if (activeMode === 'resize') {
            const result = this.resizeController.end(point, {keepRatio: this.isRatioResize(event)});
            this.pointerSession.cleanup(event);

            if (result) {
                const items = Array.isArray(result) ? result : [result];
                this.layerIndexManager.applyCommittedGeometry(items);
                this.options.onResizeBatchCommit?.(items);

                if (!this.options.onResizeBatchCommit) {
                    for (const item of items) {
                        this.options.onResizeCommit?.(item);
                    }
                }
            }

            this.refreshResizeOverlay();
            event.preventDefault();
            return;
        }

        if (activeMode === 'rotate') {
            const result = this.rotateController.end(point, {snapAngle: Boolean(event.shiftKey)});
            this.pointerSession.cleanup(event);

            if (result) {
                const items = Array.isArray(result) ? result : [result];
                this.layerIndexManager.applyCommittedGeometry(items);
                this.options.onRotateBatchCommit?.(items);

                if (!this.options.onRotateBatchCommit) {
                    for (const item of items) {
                        this.options.onRotateCommit?.(item);
                    }
                }
            }

            this.refreshResizeOverlay();
            event.preventDefault();
            return;
        }

        const result = this.selectionBoxController.end(
            point,
            this.selectionResolver.resolveBoxSelectionMode(event),
        );
        this.stopSelectionShortcutListeners();

        if (result) {
            const selectedIds = result.moved
                ? this.selectionResolver.resolveBoxSelection(
                    this.pointerSession.getSelectionSpatialIndex()?.queryBoxSelection(
                        result.rect,
                        result.mode,
                    ) ?? [],
                    result.additive,
                    result.mode,
                    event,
                )
                : this.selectionResolver.resolvePointSelection(null, result.additive, event);

            this.options.onSelect?.(selectedIds);
            this.refreshResizeOverlay();
        }

        this.pointerSession.cleanup(event);
        event.preventDefault();
    };

    private startSelection(
        point: ReturnType<typeof clientPointToCanvasPoint>,
        snapshot: ReturnType<typeof createCoordinateSnapshot>,
        spatialIndex: SpatialIndex,
        additive: boolean,
        event: PointerEvent,
    ) {
        this.selectionBoxController.start(
            point,
            additive,
            this.selectionResolver.resolveBoxSelectionMode(event),
        );
        this.pointerSession.start('select', snapshot, event.pointerId, {
            capture: true,
            selectionSpatialIndex: spatialIndex,
        });
        this.startSelectionShortcutListeners();
        event.preventDefault();
    }

    private startRotate(event: PointerEvent) {
        const selection = this.transformSelectionCoordinator.resolveSelection();

        if (!selection) {
            this.transformSelectionCoordinator.hide();
            return false;
        }

        const snapshot = createCoordinateSnapshot(this.resolveCoordinateContainer(), this.options.getScale());
        const point = clientPointToCanvasPoint(event, snapshot);
        this.transformSelectionCoordinator.renderPreview(selection.overlayLayer);
        const started = selection.type === 'single'
            ? this.rotateController.start({
                layer: selection.layers[0],
                element: selection.elements.get(selection.layers[0].id)!,
                previewElement: this.transformSelectionCoordinator.getPreviewElement(),
                useRealElementPreview: false,
                pointer: point,
                snapStep: this.options.rotateSnapStep,
                filterActiveTargets: (targets) => this.transformSelectionCoordinator.filterActiveTargets(targets),
            })
            : this.rotateController.startMany({
                layers: selection.layers,
                elements: selection.elements,
                previewElement: this.transformSelectionCoordinator.getPreviewElement(),
                useRealElementPreview: false,
                pointer: point,
                snapStep: this.options.rotateSnapStep,
                filterActiveTargets: (targets) => this.transformSelectionCoordinator.filterActiveTargets(targets),
            });

        if (!started) {
            this.refreshResizeOverlay();
            return false;
        }

        this.pointerSession.start('rotate', snapshot, event.pointerId, {capture: true});
        event.preventDefault();

        return true;
    }

    private startResize(
        handle: ReturnType<typeof getResizeHandleFromEventTarget>,
        event: PointerEvent,
    ) {
        if (!handle) {
            return false;
        }

        const selection = this.transformSelectionCoordinator.resolveSelection();

        if (!selection) {
            this.transformSelectionCoordinator.hide();
            return false;
        }

        const snapshot = createCoordinateSnapshot(this.resolveCoordinateContainer(), this.options.getScale());
        const point = clientPointToCanvasPoint(event, snapshot);
        const layers = this.options.getLayers();
        const layerIndex = this.layerIndexManager.ensure(layers);
        const snapOptions = this.snapCoordinator.resolveOptions();
        const singleResizeLayer = selection.layers[0];
        const singleResizeElement = selection.type === 'single'
            ? selection.elements.get(singleResizeLayer.id)!
            : null;
        const snapCandidates = this.snapCoordinator.resolveCandidates(
            selection.layers,
            layers,
            layerIndex.spatialIndex,
            snapOptions,
        );
        this.transformSelectionCoordinator.renderPreview(selection.overlayLayer);
        const started = selection.type === 'single'
            ? this.resizeController.start({
                layer: singleResizeLayer,
                element: singleResizeElement!,
                previewElement: this.transformSelectionCoordinator.getPreviewElement(),
                useRealElementPreview: false,
                handle,
                pointer: point,
                minWidth: this.options.minResizeWidth,
                minHeight: this.options.minResizeHeight,
                resizeStep: this.resolveResizeStep(),
                snapCandidates,
                snapCandidatesVersion: this.layerIndexManager.getVersion(),
                snapOptions,
                filterActiveTargets: (targets) => this.transformSelectionCoordinator.filterActiveTargets(targets),
            })
            : this.resizeController.startMany({
                layers: selection.layers,
                elements: selection.elements,
                previewElement: this.transformSelectionCoordinator.getPreviewElement(),
                useRealElementPreview: false,
                handle,
                pointer: point,
                minWidth: this.options.minResizeWidth,
                minHeight: this.options.minResizeHeight,
                resizeStep: this.resolveResizeStep(),
                snapCandidates,
                snapCandidatesVersion: this.layerIndexManager.getVersion(),
                snapOptions,
                filterActiveTargets: (targets) => this.transformSelectionCoordinator.filterActiveTargets(targets),
            });

        if (!started) {
            this.refreshResizeOverlay();
            return false;
        }

        this.pointerSession.start('resize', snapshot, event.pointerId, {capture: true});
        event.preventDefault();

        return true;
    }

    private readonly handlePointerCancel = (event: PointerEvent) => {
        if (!this.pointerSession.isActivePointer(event)) {
            return;
        }

        this.dragController.cancel();
        this.resizeController.cancel();
        this.rotateController.cancel();
        this.selectionBoxController.cancel();
        this.stopSelectionShortcutListeners();
        this.pointerSession.cleanup(event);
        this.refreshResizeOverlay();
    };

    private isAxisLockActive(event: PointerLike) {
        return this.options.isAxisLockActive?.(event) ?? Boolean(event.shiftKey);
    }

    private readonly handleSelectionShortcutChange = (event: KeyboardEvent) => {
        if (this.pointerSession.getMode() !== 'select') {
            return;
        }

        this.selectionBoxController.updateMode(
            this.selectionResolver.resolveBoxSelectionMode(event),
        );
    };

    private startSelectionShortcutListeners() {
        if (this.selectionShortcutListenersActive) {
            return;
        }

        window.addEventListener('keydown', this.handleSelectionShortcutChange);
        window.addEventListener('keyup', this.handleSelectionShortcutChange);
        this.selectionShortcutListenersActive = true;
    }

    private stopSelectionShortcutListeners() {
        if (!this.selectionShortcutListenersActive) {
            return;
        }

        window.removeEventListener('keydown', this.handleSelectionShortcutChange);
        window.removeEventListener('keyup', this.handleSelectionShortcutChange);
        this.selectionShortcutListenersActive = false;
    }

    private isRatioResize(event: PointerLike) {
        return Boolean(event.ctrlKey || event.metaKey);
    }

    private resolveEventContainer() {
        return this.options.eventContainer ?? this.options.container;
    }

    private resolveCoordinateContainer() {
        return this.options.coordinateContainer ?? this.options.container;
    }

    private resolveOverlayContainer() {
        return this.options.overlayContainer ?? this.resolveCoordinateContainer();
    }
}
