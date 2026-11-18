/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {DragCommitItem, LayerBox, Point, SnapOptions, TransformTargetFilter} from './types';
import {createBoundsLayer} from './Bounds';
import {InteractionPerfMonitor} from './InteractionPerfMonitor';
import {
    SnapEngine,
    type SnapEngine as SnapEngineInstance,
    type SnapResult,
    type SnapSession,
} from './SnapEngine';
import {TransformWriter, type PreviewTransformEntry, type TransformEntry} from '../dom/TransformWriter';

type LockedAxis = 'x' | 'y';

interface DragSession {
    hitId: string;
    activeIds: string[];
    activeElements: Map<string, HTMLElement>;
    transformEntries: TransformEntry[];
    previewEntry: PreviewTransformEntry | null;
    useRealElementPreview: boolean;
    filterActiveTargets?: TransformTargetFilter;
    previewFallbackWrites: boolean;
    startPointer: Point;
    currentPointer: Point;
    startBoxes: Map<string, LayerBox>;
    snapSession: SnapSession | null;
    latestSnapResult: SnapResult;
    latestDx: number;
    latestDy: number;
    lockedAxis: LockedAxis | null;
    dragStep: number;
    rafId: number | null;
    moved: boolean;
    startedAt: number;
}

export interface DragControllerOptions {
    transformWriter?: TransformWriter;
    perfMonitor?: InteractionPerfMonitor;
    snapEngine?: SnapEngineInstance;
    onSnap?: (result: SnapResult | null) => void;
    axisLockThreshold?: number;
    dragStep?: number;
    requestFrame?: (callback: FrameRequestCallback) => number;
    cancelFrame?: (id: number) => void;
    now?: () => number;
}

export interface StartDragInput {
    hitId: string;
    activeLayers: LayerBox[];
    activeElements: Map<string, HTMLElement>;
    previewElement?: HTMLElement | null;
    useRealElementPreview?: boolean;
    filterActiveTargets?: TransformTargetFilter;
    snapCandidates?: LayerBox[];
    snapCandidatesVersion?: number;
    snapOptions?: SnapOptions;
    dragStep?: number;
    pointer: Point;
}

export interface DragMoveOptions {
    axisLocked?: boolean;
}

export class DragController {
    private session: DragSession | null = null;

    private readonly transformWriter: TransformWriter;

    private readonly perfMonitor: InteractionPerfMonitor;

    private readonly snapEngine: SnapEngineInstance;

    private readonly onSnap: (result: SnapResult | null) => void;

    private readonly axisLockThreshold: number;

    private readonly defaultDragStep: number;

    private readonly requestFrame: (callback: FrameRequestCallback) => number;

    private readonly cancelFrame: (id: number) => void;

    private readonly now: () => number;

    constructor(options: DragControllerOptions = {}) {
        this.transformWriter = options.transformWriter ?? new TransformWriter();
        this.perfMonitor = options.perfMonitor ?? new InteractionPerfMonitor();
        this.snapEngine = options.snapEngine ?? new SnapEngine();
        this.onSnap = options.onSnap ?? (() => undefined);
        this.axisLockThreshold = normalizeAxisLockThreshold(options.axisLockThreshold);
        this.defaultDragStep = normalizeDragStep(options.dragStep);
        this.requestFrame = options.requestFrame ?? requestAnimationFrame.bind(globalThis);
        this.cancelFrame = options.cancelFrame ?? cancelAnimationFrame.bind(globalThis);
        this.now = options.now ?? performance.now.bind(performance);
    }

    getPerfSnapshot() {
        return this.perfMonitor.snapshot();
    }

    isDragging() {
        return this.session !== null;
    }

    hasMoved() {
        return Boolean(this.session?.moved);
    }

    start({
        hitId,
        activeLayers,
        activeElements,
        previewElement,
        useRealElementPreview,
        filterActiveTargets,
        snapCandidates = [],
        snapCandidatesVersion,
        snapOptions,
        dragStep,
        pointer,
    }: StartDragInput) {
        this.cancel();

        const startBoxes = new Map<string, LayerBox>();
        const activeIds: string[] = [];
        const activeDragLayers: LayerBox[] = [];
        const transformEntries: TransformEntry[] = [];

        for (const layer of activeLayers) {
            const element = activeElements.get(layer.id);
            if (!element) {
                continue;
            }

            startBoxes.set(layer.id, {...layer});
            activeDragLayers.push({...layer});
            activeIds.push(layer.id);
            transformEntries.push({element, box: {...layer}});
        }

        if (activeIds.length === 0) {
            return false;
        }

        this.perfMonitor.setActiveLayerCount(activeIds.length);
        this.perfMonitor.setSnapCandidateCount(snapCandidates.length);

        const previewBox = previewElement
            ? createBoundsLayer(activeDragLayers)
            : null;

        this.session = {
            hitId,
            activeIds,
            activeElements,
            transformEntries,
            previewEntry: previewBox && previewElement
                ? this.transformWriter.preparePreviewElement({element: previewElement, box: previewBox})
                : null,
            useRealElementPreview: useRealElementPreview ?? true,
            filterActiveTargets,
            previewFallbackWrites: false,
            startPointer: {...pointer},
            currentPointer: {...pointer},
            startBoxes,
            snapSession: this.snapEngine.start({
                activeLayers: activeDragLayers,
                candidateLayers: snapCandidates,
                candidateLayersVersion: snapCandidatesVersion,
                options: snapOptions,
            }),
            latestSnapResult: {
                dx: 0,
                dy: 0,
                snappedX: false,
                snappedY: false,
                guides: [],
            },
            latestDx: 0,
            latestDy: 0,
            lockedAxis: null,
            dragStep: normalizeDragStep(dragStep ?? this.defaultDragStep),
            rafId: null,
            moved: false,
            startedAt: this.now(),
        };

        return true;
    }

    move(pointer: Point, options: DragMoveOptions = {}) {
        const session = this.session;

        if (!session) {
            return false;
        }

        this.applyPointer(session, pointer, Boolean(options.axisLocked));
        session.moved = session.moved || session.latestDx !== 0 || session.latestDy !== 0;

        this.scheduleFlush();
        return true;
    }

    flush() {
        const session = this.session;

        if (!session) {
            return 0;
        }

        const activeEntries = this.resolveActiveTransformEntries(session);
        let writeCount = 0;

        if (activeEntries.length === 0) {
            writeCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        } else if (session.previewEntry && activeEntries.length === session.transformEntries.length) {
            writeCount = this.transformWriter.writeBatchTranslate([session.previewEntry], session.latestDx, session.latestDy);
        } else if (!session.useRealElementPreview) {
            writeCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        } else {
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            const activeWriteCount = this.transformWriter.writeBatchTranslate(activeEntries, session.latestDx, session.latestDy);
            session.previewFallbackWrites = session.previewFallbackWrites || Boolean(session.previewEntry);
            writeCount = restoreCount + activeWriteCount;
        }

        this.onSnap(session.latestSnapResult);
        this.perfMonitor.recordFrameFlush();
        this.perfMonitor.recordDomWrites(writeCount);

        return writeCount;
    }

    end(pointer?: Point, options: DragMoveOptions = {}): DragCommitItem[] {
        const session = this.session;

        if (!session) {
            return [];
        }

        if (pointer) {
            this.applyPointer(session, pointer, Boolean(options.axisLocked));
            session.moved = session.moved || session.latestDx !== 0 || session.latestDy !== 0;
        }

        this.cancelScheduledFlush(session);

        if (!session.moved) {
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            this.perfMonitor.recordDomWrites(restoreCount);
            this.session = null;
            this.onSnap(null);
            return [];
        }

        const activeEntries = this.resolveActiveTransformEntries(session);
        const writeCount = this.transformWriter.writeBatchTranslate(activeEntries, session.latestDx, session.latestDy);
        const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        this.perfMonitor.recordDomWrites(writeCount + restoreCount);
        this.onSnap(session.latestSnapResult);

        const items = activeEntries.map((entry) => {
            const id = entry.box.id;
            const box = session.startBoxes.get(id) ?? entry.box;
            return {
                id,
                x: box.x + session.latestDx,
                y: box.y + session.latestDy,
            };
        });

        this.perfMonitor.recordDragCommit();
        this.session = null;
        this.onSnap(null);

        return items;
    }

    cancel() {
        const session = this.session;

        if (!session) {
            return;
        }

        this.cancelScheduledFlush(session);
        const writeCount = this.restorePreviewSession(session);
        this.perfMonitor.recordDomWrites(writeCount);
        this.perfMonitor.recordDragCancel();
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

    private cancelScheduledFlush(session: DragSession) {
        if (session.rafId === null) {
            return;
        }

        this.cancelFrame(session.rafId);
        session.rafId = null;
    }

    private restorePreviewSession(session: DragSession) {
        const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);

        if (!session.previewEntry && session.useRealElementPreview) {
            return this.transformWriter.resetMany(this.resolveActiveTransformEntries(session));
        }

        if (!session.previewFallbackWrites) {
            return restoreCount;
        }

        return restoreCount + this.transformWriter.resetMany(this.resolveActiveTransformEntries(session));
    }

    private resolveActiveTransformEntries(session: DragSession) {
        if (!session.filterActiveTargets) {
            return session.transformEntries;
        }

        const activeIds = session.filterActiveTargets(session.transformEntries.map((entry) => ({
            id: entry.box.id,
            element: entry.element,
        })));

        return session.transformEntries.filter((entry) => activeIds.has(entry.box.id));
    }

    private applyPointer(session: DragSession, pointer: Point, axisLocked: boolean) {
        session.currentPointer = {...pointer};

        const rawDx = pointer.x - session.startPointer.x;
        const rawDy = pointer.y - session.startPointer.y;
        let baseDx = rawDx;
        let baseDy = rawDy;
        let snapX = true;
        let snapY = true;

        if (!axisLocked) {
            session.lockedAxis = null;
            this.applySnap(session, snapDelta(baseDx, session.dragStep), snapDelta(baseDy, session.dragStep), snapX, snapY);
            return;
        }

        if (!session.lockedAxis && Math.max(Math.abs(rawDx), Math.abs(rawDy)) < this.axisLockThreshold) {
            session.latestDx = 0;
            session.latestDy = 0;
            session.latestSnapResult = {
                dx: 0,
                dy: 0,
                snappedX: false,
                snappedY: false,
                guides: [],
            };
            return;
        }

        if (!session.lockedAxis && (rawDx !== 0 || rawDy !== 0)) {
            session.lockedAxis = Math.abs(rawDx) >= Math.abs(rawDy) ? 'x' : 'y';
        }

        baseDx = session.lockedAxis === 'y' ? 0 : rawDx;
        baseDy = session.lockedAxis === 'x' ? 0 : rawDy;
        snapX = session.lockedAxis !== 'y';
        snapY = session.lockedAxis !== 'x';
        this.applySnap(session, snapDelta(baseDx, session.dragStep), snapDelta(baseDy, session.dragStep), snapX, snapY);
    }

    private applySnap(session: DragSession, dx: number, dy: number, snapX: boolean, snapY: boolean) {
        let nextDx = dx;
        let nextDy = dy;
        let snappedX = false;
        let snappedY = false;
        const guides: SnapResult['guides'] = [];

        if (snapX) {
            const xResult = this.snapEngine.resolve(session.snapSession, dx, dy, {snapX: true, snapY: false});

            if (xResult.snappedX) {
                nextDx = xResult.dx;
                snappedX = true;
                guides.push(...xResult.guides);
            }
        }

        if (snapY) {
            const yResult = this.snapEngine.resolve(session.snapSession, nextDx, dy, {snapX: false, snapY: true});

            if (yResult.snappedY) {
                nextDy = yResult.dy;
                snappedY = true;
                guides.push(...yResult.guides);
            }
        }

        session.latestSnapResult = {
            dx: nextDx,
            dy: nextDy,
            snappedX,
            snappedY,
            guides,
        };
        session.latestDx = nextDx;
        session.latestDy = nextDy;
    }
}

function normalizeAxisLockThreshold(value: number | undefined) {
    if (typeof value !== 'number') {
        return 4;
    }

    return Number.isFinite(value) && value >= 0 ? value : 4;
}

function normalizeDragStep(value: number | undefined) {
    if (typeof value !== 'number') {
        return 1;
    }

    return Number.isFinite(value) && value > 0 ? value : 1;
}

function snapDelta(value: number, step: number) {
    if (step <= 1) {
        return value;
    }

    return Math.round(value / step) * step;
}
