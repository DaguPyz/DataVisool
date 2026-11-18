import type {LayerBox, Point, ResizeCommitItem, Rect, TransformTargetFilter} from './types';
import {createBoundsLayer, createLogicalSelectionBounds} from './Bounds';
import {InteractionPerfMonitor} from './InteractionPerfMonitor';
import {
    SnapEngine,
    type SnapEngine as SnapEngineInstance,
    type SnapLine,
    type SnapResult,
    type SnapSession,
} from './SnapEngine';
import {TransformWriter, type PreviewTransformEntry} from '../dom/TransformWriter';
import type {ResizeControllerOptions, ResizeHandle, ResizeMoveOptions, StartResizeInput, StartResizeManyInput} from './ResizeControllerTypes';
export type {ResizeControllerOptions, ResizeHandle, ResizeMoveOptions, StartResizeInput, StartResizeManyInput} from './ResizeControllerTypes';

interface ResizeEntry {
    layer: LayerBox;
    element: HTMLElement;
}

interface ResizeSession {
    layer: LayerBox;
    sourceLayer: LayerBox;
    entries: ResizeEntry[];
    previewEntry: PreviewTransformEntry | null;
    useRealElementPreview: boolean;
    filterActiveTargets?: TransformTargetFilter;
    previewFallbackWrites: boolean;
    handle: ResizeHandle;
    startPointer: Point;
    latestBoundsRect: Rect;
    latestRects: Map<string, Rect>;
    pendingPointer: Point | null;
    pendingKeepRatio: boolean;
    rectsDirty: boolean;
    snapSession: SnapSession | null;
    latestSnapResult: SnapResult;
    minWidth: number;
    minHeight: number;
    resizeStep: number;
    rafId: number | null;
    moved: boolean;
}

export class ResizeController {
    private session: ResizeSession | null = null;

    private readonly transformWriter: TransformWriter;

    private readonly perfMonitor: InteractionPerfMonitor;

    private readonly snapEngine: SnapEngineInstance;

    private readonly onSnap: (result: SnapResult | null) => void;

    private readonly defaultMinWidth: number;

    private readonly defaultMinHeight: number;

    private readonly defaultResizeStep: number;

    private readonly requestFrame: (callback: FrameRequestCallback) => number;

    private readonly cancelFrame: (id: number) => void;

    constructor(options: ResizeControllerOptions = {}) {
        this.transformWriter = options.transformWriter ?? new TransformWriter();
        this.perfMonitor = options.perfMonitor ?? new InteractionPerfMonitor();
        this.snapEngine = options.snapEngine ?? new SnapEngine();
        this.onSnap = options.onSnap ?? (() => undefined);
        this.defaultMinWidth = normalizeMinSize(options.minWidth, 8);
        this.defaultMinHeight = normalizeMinSize(options.minHeight, 8);
        this.defaultResizeStep = normalizeResizeStep(options.resizeStep);
        this.requestFrame = options.requestFrame ?? requestAnimationFrame.bind(globalThis);
        this.cancelFrame = options.cancelFrame ?? cancelAnimationFrame.bind(globalThis);
    }

    isResizing() {
        return this.session !== null;
    }

    getPerfSnapshot() {
        return this.perfMonitor.snapshot();
    }

    start({
        layer,
        element,
        previewElement,
        useRealElementPreview,
        handle,
        pointer,
        minWidth,
        minHeight,
        resizeStep,
        snapCandidates = [],
        snapCandidatesVersion,
        snapOptions,
        filterActiveTargets,
    }: StartResizeInput) {
        this.cancel();

        this.session = {
            layer: {...layer},
            sourceLayer: {...layer},
            entries: [{layer: {...layer}, element}],
            previewEntry: previewElement
                ? this.transformWriter.preparePreviewElement({element: previewElement, box: layer})
                : null,
            useRealElementPreview: useRealElementPreview ?? true,
            filterActiveTargets,
            previewFallbackWrites: false,
            handle,
            startPointer: {...pointer},
            latestBoundsRect: toRect(layer),
            latestRects: new Map([[layer.id, toRect(layer)]]),
            pendingPointer: null,
            pendingKeepRatio: false,
            rectsDirty: false,
            snapSession: this.snapEngine.start({
                activeLayers: [layer],
                candidateLayers: snapCandidates,
                candidateLayersVersion: snapCandidatesVersion,
                options: snapOptions,
            }),
            latestSnapResult: createEmptySnapResult(),
            minWidth: normalizeMinSize(minWidth, this.defaultMinWidth),
            minHeight: normalizeMinSize(minHeight, this.defaultMinHeight),
            resizeStep: normalizeResizeStep(resizeStep ?? this.defaultResizeStep),
            rafId: null,
            moved: false,
        };

        return true;
    }

    startMany({
        layers,
        elements,
        previewElement,
        useRealElementPreview,
        handle,
        pointer,
        minWidth,
        minHeight,
        resizeStep,
        snapCandidates = [],
        snapCandidatesVersion,
        snapOptions,
        filterActiveTargets,
    }: StartResizeManyInput) {
        this.cancel();

        const entries = layers
            .map((layer) => {
                const element = elements.get(layer.id);
                return element ? {layer: {...layer}, element} : null;
            })
            .filter((entry): entry is ResizeEntry => Boolean(entry));
        const boundsLayer = createBoundsLayer(entries.map((entry) => entry.layer));
        const sourceBounds = createLogicalSelectionBounds(entries.map((entry) => entry.layer));

        if (!boundsLayer || !sourceBounds || entries.length === 0) {
            return false;
        }

        this.session = {
            layer: boundsLayer,
            sourceLayer: {
                id: '__datavisool_selection_source_bounds__',
                ...sourceBounds,
                rotate: 0,
            },
            entries,
            previewEntry: previewElement
                ? this.transformWriter.preparePreviewElement({element: previewElement, box: boundsLayer})
                : null,
            useRealElementPreview: useRealElementPreview ?? true,
            filterActiveTargets,
            previewFallbackWrites: false,
            handle,
            startPointer: {...pointer},
            latestBoundsRect: toRect(boundsLayer),
            latestRects: new Map(entries.map((entry) => [entry.layer.id, toRect(entry.layer)])),
            pendingPointer: null,
            pendingKeepRatio: false,
            rectsDirty: false,
            snapSession: this.snapEngine.start({
                activeLayers: entries.map((entry) => entry.layer),
                candidateLayers: snapCandidates,
                candidateLayersVersion: snapCandidatesVersion,
                options: snapOptions,
            }),
            latestSnapResult: createEmptySnapResult(),
            minWidth: normalizeMinSize(minWidth, this.defaultMinWidth),
            minHeight: normalizeMinSize(minHeight, this.defaultMinHeight),
            resizeStep: normalizeResizeStep(resizeStep ?? this.defaultResizeStep),
            rafId: null,
            moved: false,
        };

        return true;
    }

    move(pointer: Point, options: ResizeMoveOptions = {}) {
        const session = this.session;

        if (!session) {
            return false;
        }

        session.pendingPointer = pointer;
        session.pendingKeepRatio = Boolean(options.keepRatio);
        this.scheduleFlush();
        return true;
    }

    flush() {
        const session = this.session;

        if (!session) {
            return 0;
        }

        this.resolvePendingResize(session);

        const activeEntries = this.resolveActiveResizeEntries(session);
        let writeCount = 0;

        if (activeEntries.length === 0) {
            writeCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        } else if (session.previewEntry && activeEntries.length === session.entries.length) {
            writeCount = this.transformWriter.writeResizePreviewGeometry(
                session.previewEntry,
                session.latestBoundsRect,
            );
        } else if (!session.useRealElementPreview) {
            writeCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        } else {
            this.resolveLatestRects(session);
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            const activeWriteCount = this.transformWriter.writeResizePreviewMany(
                this.createResizeItems(session, activeEntries),
            );
            session.previewFallbackWrites = session.previewFallbackWrites || Boolean(session.previewEntry);
            writeCount = restoreCount + activeWriteCount;
        }

        this.onSnap(session.latestSnapResult);
        this.perfMonitor.recordFrameFlush();
        this.perfMonitor.recordDomWrites(writeCount);

        return writeCount;
    }

    end(pointer?: Point, options: ResizeMoveOptions = {}): ResizeCommitItem | ResizeCommitItem[] | null {
        const session = this.session;

        if (!session) {
            return null;
        }

        if (pointer) {
            session.pendingPointer = pointer;
            session.pendingKeepRatio = Boolean(options.keepRatio);
        }

        this.cancelScheduledFlush(session);
        this.resolvePendingResize(session);
        this.resolveLatestRects(session);

        if (!session.moved) {
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            this.perfMonitor.recordDomWrites(restoreCount);
            this.session = null;
            this.onSnap(null);
            return null;
        }

        const activeEntries = this.resolveActiveResizeEntries(session);

        if (activeEntries.length === 0) {
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            this.perfMonitor.recordDomWrites(restoreCount);
            this.session = null;
            this.onSnap(null);
            return null;
        }

        const writeCount = this.transformWriter.writeResizeMany(this.createResizeItems(session, activeEntries));
        const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        this.perfMonitor.recordDomWrites(writeCount + restoreCount);

        const items = activeEntries.map((entry) => ({
            id: entry.layer.id,
            ...(session.latestRects.get(entry.layer.id) ?? toRect(entry.layer)),
        }));

        this.session = null;
        this.onSnap(null);
        return items.length === 1 ? items[0] : items;
    }

    cancel() {
        const session = this.session;

        if (!session) {
            return;
        }

        this.cancelScheduledFlush(session);
        const writeCount = this.restorePreviewSession(session);
        this.perfMonitor.recordDomWrites(writeCount);
        this.session = null;
        this.onSnap(null);
    }

    private scheduleFlush() {
        const session = this.session;

        if (!session || session.rafId !== null) {
            return;
        }

        session.rafId = this.requestFrame(() => {
            const activeSession = this.session;

            if (!activeSession) {
                return;
            }

            activeSession.rafId = null;
            this.flush();
        });
    }

    private cancelScheduledFlush(session: ResizeSession) {
        if (session.rafId === null) {
            return;
        }

        this.cancelFrame(session.rafId);
        session.rafId = null;
    }

    private resolvePendingResize(session: ResizeSession) {
        if (!session.pendingPointer) {
            return;
        }

        const boundsRect = this.applySnap(
            session,
            resolveResizeRect(session, session.pendingPointer, session.pendingKeepRatio),
            session.pendingKeepRatio,
        );
        session.latestBoundsRect = boundsRect;
        session.rectsDirty = true;

        if (!session.previewEntry) {
            this.resolveLatestRects(session);
        }

        session.pendingPointer = null;
        session.moved = session.moved || hasMovedBounds(session);
    }

    private applySnap(session: ResizeSession, rect: Rect, keepRatio: boolean): Rect {
        if (keepRatio || normalizeRotate(session.layer.rotate) !== 0) {
            session.latestSnapResult = createEmptySnapResult();
            return rect;
        }

        let nextRect = rect;
        let snappedX = false;
        let snappedY = false;
        let snapDx = 0;
        let snapDy = 0;
        const guides: SnapResult['guides'] = [];

        if (session.handle.includes('e') || session.handle.includes('w')) {
            const xResult = this.snapEngine.resolveLines(session.snapSession, {
                movingLinesX: createResizeSnapLines(nextRect, session.handle, 'x'),
                options: {snapX: true, snapY: false},
            });

            if (xResult.snappedX) {
                const snappedRect = applyResizeSnapDelta(nextRect, session, 'x', xResult.dx);

                if (snappedRect !== nextRect) {
                    nextRect = snappedRect;
                    snappedX = true;
                    snapDx = xResult.dx;
                    guides.push(...xResult.guides);
                }
            }
        }

        if (session.handle.includes('n') || session.handle.includes('s')) {
            const yResult = this.snapEngine.resolveLines(session.snapSession, {
                movingLinesY: createResizeSnapLines(nextRect, session.handle, 'y'),
                options: {snapX: false, snapY: true},
            });

            if (yResult.snappedY) {
                const snappedRect = applyResizeSnapDelta(nextRect, session, 'y', yResult.dy);

                if (snappedRect !== nextRect) {
                    nextRect = snappedRect;
                    snappedY = true;
                    snapDy = yResult.dy;
                    guides.push(...yResult.guides);
                }
            }
        }

        session.latestSnapResult = {
            dx: snapDx,
            dy: snapDy,
            snappedX,
            snappedY,
            guides,
        };

        return nextRect;
    }

    private resolveLatestRects(session: ResizeSession) {
        if (!session.rectsDirty) {
            return;
        }

        session.latestRects = resolveResizeRectsFromBounds(session, session.latestBoundsRect);
        session.rectsDirty = false;
    }

    private restorePreviewSession(session: ResizeSession) {
        const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);

        if (!session.previewEntry && session.useRealElementPreview) {
            return this.transformWriter.resetMany(this.createSourceTransformEntries(session));
        }

        if (!session.previewFallbackWrites) {
            return restoreCount;
        }

        return restoreCount + this.transformWriter.resetMany(this.createSourceTransformEntries(session));
    }

    private resolveActiveResizeEntries(session: ResizeSession) {
        if (!session.filterActiveTargets) {
            return session.entries;
        }

        const activeIds = session.filterActiveTargets(session.entries.map((entry) => ({
            id: entry.layer.id,
            element: entry.element,
        })));

        return session.entries.filter((entry) => activeIds.has(entry.layer.id));
    }

    private *createResizeItems(
        session: ResizeSession,
        entries = this.resolveActiveResizeEntries(session),
    ): Iterable<{entry: {element: HTMLElement; box: LayerBox}; rect: Rect}> {
        for (const entry of entries) {
            yield {
                entry: {element: entry.element, box: entry.layer},
                rect: session.latestRects.get(entry.layer.id) ?? toRect(entry.layer),
            };
        }
    }

    private *createSourceTransformEntries(session: ResizeSession): Iterable<{element: HTMLElement; box: LayerBox}> {
        for (const entry of this.resolveActiveResizeEntries(session)) {
            yield {element: entry.element, box: entry.layer};
        }
    }
}

function createEmptySnapResult(): SnapResult {
    return {
        dx: 0,
        dy: 0,
        snappedX: false,
        snappedY: false,
        guides: [],
    };
}

function createResizeSnapLines(rect: Rect, handle: ResizeHandle, axis: 'x' | 'y'): SnapLine[] {
    if (axis === 'x') {
        if (handle.includes('w')) {
            return [createResizeSnapLine(rect, 'x', 'start', rect.x)];
        }

        if (handle.includes('e')) {
            return [createResizeSnapLine(rect, 'x', 'end', rect.x + rect.width)];
        }

        return [];
    }

    if (handle.includes('n')) {
        return [createResizeSnapLine(rect, 'y', 'start', rect.y)];
    }

    if (handle.includes('s')) {
        return [createResizeSnapLine(rect, 'y', 'end', rect.y + rect.height)];
    }

    return [];
}

function createResizeSnapLine(
    rect: Rect,
    axis: 'x' | 'y',
    type: 'start' | 'end',
    value: number,
): SnapLine {
    return {
        id: `__resize_bounds__:${axis}:${type}`,
        layerId: '__resize_bounds__',
        axis,
        type,
        value,
        spanStart: axis === 'x' ? rect.y : rect.x,
        spanEnd: axis === 'x' ? rect.y + rect.height : rect.x + rect.width,
    };
}

function applyResizeSnapDelta(rect: Rect, session: ResizeSession, axis: 'x' | 'y', delta: number): Rect {
    if (Math.abs(delta) < 0.000001) {
        return rect;
    }

    if (axis === 'x') {
        if (session.handle.includes('w')) {
            const width = rect.width - delta;

            if (width < session.minWidth) {
                return rect;
            }

            return normalizeRect({
                ...rect,
                x: rect.x + delta,
                width,
            });
        }

        if (session.handle.includes('e')) {
            const width = rect.width + delta;

            if (width < session.minWidth) {
                return rect;
            }

            return normalizeRect({
                ...rect,
                width,
            });
        }
    }

    if (session.handle.includes('n')) {
        const height = rect.height - delta;

        if (height < session.minHeight) {
            return rect;
        }

        return normalizeRect({
            ...rect,
            y: rect.y + delta,
            height,
        });
    }

    if (session.handle.includes('s')) {
        const height = rect.height + delta;

        if (height < session.minHeight) {
            return rect;
        }

        return normalizeRect({
            ...rect,
            height,
        });
    }

    return rect;
}

function resolveResizeRectsFromBounds(session: ResizeSession, boundsRect: Rect): Map<string, Rect> {

    if (session.entries.length === 1 && session.entries[0].layer.id === session.layer.id) {
        return new Map([[session.layer.id, boundsRect]]);
    }

    return resolveGroupResizeRects(session, boundsRect);
}

function resolveResizeRect(session: ResizeSession, pointer: Point, keepRatio: boolean): Rect {
    const delta = resolveLocalDelta(session, pointer);
    const dx = delta.x;
    const dy = delta.y;
    const start = session.layer;
    const edges = {
        left: start.x,
        right: start.x + start.width,
        top: start.y,
        bottom: start.y + start.height,
    };

    if (session.handle.includes('e')) {
        edges.right = start.x + start.width + dx;
    }

    if (session.handle.includes('w')) {
        edges.left = start.x + dx;
    }

    if (session.handle.includes('s')) {
        edges.bottom = start.y + start.height + dy;
    }

    if (session.handle.includes('n')) {
        edges.top = start.y + dy;
    }

    let rect = rectFromEdges(edges, session);

    if (keepRatio) {
        rect = applyAspectRatio(rect, session);
    }

    rect = snapRect(rect, session, keepRatio);

    if (normalizeRotate(start.rotate) === 0) {
        return rect;
    }

    return anchorRotatedRect({width: rect.width, height: rect.height}, session);
}

function resolveGroupResizeRects(session: ResizeSession, boundsRect: Rect) {
    if (isOrientedGroupResize(session)) {
        return resolveOrientedGroupResizeRects(session, boundsRect);
    }

    const controlStart = session.layer;
    const sourceStart = session.sourceLayer;
    const scaleX = controlStart.width === 0 ? 1 : boundsRect.width / controlStart.width;
    const scaleY = controlStart.height === 0 ? 1 : boundsRect.height / controlStart.height;
    const sourceRect = anchorSourceRect(sourceStart, session.handle, scaleX, scaleY);
    const rects = new Map<string, Rect>();

    for (const entry of session.entries) {
        const layer = entry.layer;
        rects.set(layer.id, normalizeRect({
            x: sourceRect.x + (layer.x - sourceStart.x) * scaleX,
            y: sourceRect.y + (layer.y - sourceStart.y) * scaleY,
            width: layer.width * scaleX,
            height: layer.height * scaleY,
        }));
    }

    return rects;
}

function resolveOrientedGroupResizeRects(session: ResizeSession, boundsRect: Rect) {
    const start = session.layer;
    const scaleX = start.width === 0 ? 1 : boundsRect.width / start.width;
    const scaleY = start.height === 0 ? 1 : boundsRect.height / start.height;
    const groupCenter = getRectCenter(boundsRect);
    const rects = new Map<string, Rect>();

    for (const entry of session.entries) {
        const layer = entry.layer;
        const localRect = getLayerRectInGroupLocal(layer, start);
        const width = localRect.width * scaleX;
        const height = localRect.height * scaleY;
        const localCenterOffset = {
            x: localRect.x * scaleX + width / 2 - boundsRect.width / 2,
            y: localRect.y * scaleY + height / 2 - boundsRect.height / 2,
        };
        const worldOffset = rotateVector(localCenterOffset, start.rotate);
        const center = {
            x: groupCenter.x + worldOffset.x,
            y: groupCenter.y + worldOffset.y,
        };

        rects.set(layer.id, normalizeRect({
            x: center.x - width / 2,
            y: center.y - height / 2,
            width,
            height,
        }));
    }

    return rects;
}

function getLayerRectInGroupLocal(layer: LayerBox, group: LayerBox): Rect {
    const groupCenter = getLayerCenter(group);
    const layerCenter = getLayerCenter(layer);
    const offset = rotateVector({
        x: layerCenter.x - groupCenter.x,
        y: layerCenter.y - groupCenter.y,
    }, -group.rotate);

    return {
        x: offset.x + group.width / 2 - layer.width / 2,
        y: offset.y + group.height / 2 - layer.height / 2,
        width: layer.width,
        height: layer.height,
    };
}

function isOrientedGroupResize(session: ResizeSession) {
    const rotate = normalizeRotate(session.layer.rotate);
    return session.entries.every((entry) => isSameRotate(rotate, normalizeRotate(entry.layer.rotate)));
}

function anchorSourceRect(sourceStart: LayerBox, handle: ResizeHandle, scaleX: number, scaleY: number): Rect {
    const width = sourceStart.width * scaleX;
    const height = sourceStart.height * scaleY;
    const right = sourceStart.x + sourceStart.width;
    const bottom = sourceStart.y + sourceStart.height;
    let x = sourceStart.x;
    let y = sourceStart.y;

    if (handle.includes('w')) {
        x = right - width;
    } else if (!handle.includes('e')) {
        x = sourceStart.x + (sourceStart.width - width) / 2;
    }

    if (handle.includes('n')) {
        y = bottom - height;
    } else if (!handle.includes('s')) {
        y = sourceStart.y + (sourceStart.height - height) / 2;
    }

    return {x, y, width, height};
}

function rectFromEdges(
    edges: {left: number; right: number; top: number; bottom: number},
    session: ResizeSession,
) {
    const start = session.layer;
    let width = edges.right - edges.left;
    let height = edges.bottom - edges.top;
    let x = edges.left;
    let y = edges.top;

    if (session.handle.includes('w') && width < session.minWidth) {
        width = session.minWidth;
        x = start.x + start.width - width;
    } else if (width < session.minWidth) {
        width = session.minWidth;
    }

    if (session.handle.includes('n') && height < session.minHeight) {
        height = session.minHeight;
        y = start.y + start.height - height;
    } else if (height < session.minHeight) {
        height = session.minHeight;
    }

    return {x, y, width, height};
}

function applyAspectRatio(rect: Rect, session: ResizeSession): Rect {
    const start = session.layer;
    const ratio = start.width / start.height;
    const widthChange = Math.abs(rect.width - start.width) / start.width;
    const heightChange = Math.abs(rect.height - start.height) / start.height;
    let width = rect.width;
    let height = rect.height;

    if (session.handle === 'e' || session.handle === 'w') {
        height = width / ratio;
    } else if (session.handle === 'n' || session.handle === 's') {
        width = height * ratio;
    } else if (widthChange >= heightChange) {
        height = width / ratio;
    } else {
        width = height * ratio;
    }

    width = Math.max(session.minWidth, width);
    height = Math.max(session.minHeight, height);

    return anchorRect({width, height}, session);
}

function anchorRect(size: {width: number; height: number}, session: ResizeSession): Rect {
    const start = session.layer;
    const right = start.x + start.width;
    const bottom = start.y + start.height;
    let x = start.x;
    let y = start.y;

    if (session.handle.includes('w')) {
        x = right - size.width;
    } else if (!session.handle.includes('e')) {
        x = start.x + (start.width - size.width) / 2;
    }

    if (session.handle.includes('n')) {
        y = bottom - size.height;
    } else if (!session.handle.includes('s')) {
        y = start.y + (start.height - size.height) / 2;
    }

    return {x, y, width: size.width, height: size.height};
}

function snapRect(rect: Rect, session: ResizeSession, keepRatio: boolean): Rect {
    if (session.resizeStep <= 1) {
        return rect;
    }

    const resizeX = keepRatio || session.handle.includes('e') || session.handle.includes('w');
    const resizeY = keepRatio || session.handle.includes('n') || session.handle.includes('s');
    const width = resizeX
        ? snapSizeDelta(rect.width, session.layer.width, session.minWidth, session.resizeStep)
        : session.layer.width;
    const height = resizeY
        ? snapSizeDelta(rect.height, session.layer.height, session.minHeight, session.resizeStep)
        : session.layer.height;

    return anchorRect({width, height}, session);
}

function snapSizeDelta(value: number, start: number, min: number, step: number) {
    return Math.max(min, start + Math.round((value - start) / step) * step);
}

function anchorRotatedRect(size: {width: number; height: number}, session: ResizeSession): Rect {
    const start = session.layer;
    const anchorWorld = localPointToWorld(start, getOppositeAnchorLocal(start.width, start.height, session.handle));
    const nextAnchorLocal = getOppositeAnchorLocal(size.width, size.height, session.handle);
    const nextCenterLocal = {
        x: size.width / 2,
        y: size.height / 2,
    };
    const rotatedAnchorOffset = rotateVector({
        x: nextAnchorLocal.x - nextCenterLocal.x,
        y: nextAnchorLocal.y - nextCenterLocal.y,
    }, start.rotate);

    return normalizeRect({
        x: anchorWorld.x - nextCenterLocal.x - rotatedAnchorOffset.x,
        y: anchorWorld.y - nextCenterLocal.y - rotatedAnchorOffset.y,
        width: size.width,
        height: size.height,
    });
}

function getOppositeAnchorLocal(width: number, height: number, handle: ResizeHandle): Point {
    let x = width / 2;
    let y = height / 2;

    if (handle.includes('e')) {
        x = 0;
    } else if (handle.includes('w')) {
        x = width;
    }

    if (handle.includes('s')) {
        y = 0;
    } else if (handle.includes('n')) {
        y = height;
    }

    return {x, y};
}

function localPointToWorld(layer: LayerBox, point: Point): Point {
    const center = {
        x: layer.x + layer.width / 2,
        y: layer.y + layer.height / 2,
    };
    const rotated = rotateVector({
        x: point.x - layer.width / 2,
        y: point.y - layer.height / 2,
    }, layer.rotate);

    return {
        x: center.x + rotated.x,
        y: center.y + rotated.y,
    };
}

function resolveLocalDelta(session: ResizeSession, pointer: Point): Point {
    const delta = {
        x: pointer.x - session.startPointer.x,
        y: pointer.y - session.startPointer.y,
    };

    if (normalizeRotate(session.layer.rotate) === 0) {
        return delta;
    }

    return rotateVector(delta, -session.layer.rotate);
}

function rotateVector(point: Point, rotate: number): Point {
    const radians = rotate * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    return {
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos,
    };
}

function getLayerCenter(layer: LayerBox): Point {
    return {
        x: layer.x + layer.width / 2,
        y: layer.y + layer.height / 2,
    };
}

function getRectCenter(rect: Rect): Point {
    return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
    };
}

function toRect(layer: LayerBox): Rect {
    return {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
    };
}

function isSameRect(a: Rect, b: Rect) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function hasMovedBounds(session: ResizeSession) {
    return !isSameRect(session.latestBoundsRect, session.layer);
}

function normalizeMinSize(value: number | undefined, fallback: number) {
    if (typeof value !== 'number') {
        return fallback;
    }

    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeResizeStep(value: number | undefined) {
    if (typeof value !== 'number') {
        return 1;
    }

    return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeRect(rect: Rect): Rect {
    return {
        x: normalizeNumber(rect.x),
        y: normalizeNumber(rect.y),
        width: normalizeNumber(rect.width),
        height: normalizeNumber(rect.height),
    };
}

function normalizeNumber(value: number) {
    return Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(6));
}

function normalizeRotate(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return ((value % 360) + 360) % 360;
}

function isSameRotate(a: number, b: number) {
    const delta = Math.abs(a - b);
    return delta < 0.000001 || Math.abs(delta - 360) < 0.000001;
}
