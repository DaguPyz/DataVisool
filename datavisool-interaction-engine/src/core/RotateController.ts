/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox, Point, RotateCommitItem, TransformTargetFilter} from './types';
import {createBoundsLayer, normalizeNumber} from './Bounds';
import {InteractionPerfMonitor} from './InteractionPerfMonitor';
import {TransformWriter, type PreviewTransformEntry} from '../dom/TransformWriter';

export interface RotateControllerOptions {
    transformWriter?: TransformWriter;
    perfMonitor?: InteractionPerfMonitor;
    snapStep?: number;
    requestFrame?: (callback: FrameRequestCallback) => number;
    cancelFrame?: (id: number) => void;
}

export interface StartRotateInput {
    layer: LayerBox;
    element: HTMLElement;
    previewElement?: HTMLElement | null;
    useRealElementPreview?: boolean;
    pointer: Point;
    snapStep?: number;
    filterActiveTargets?: TransformTargetFilter;
}

export interface StartRotateManyInput {
    layers: LayerBox[];
    elements: Map<string, HTMLElement>;
    previewElement?: HTMLElement | null;
    useRealElementPreview?: boolean;
    pointer: Point;
    snapStep?: number;
    filterActiveTargets?: TransformTargetFilter;
}

export interface RotateMoveOptions {
    snapAngle?: boolean;
}

interface RotateEntry {
    layer: LayerBox;
    element: HTMLElement;
}

interface RotateSession {
    layer: LayerBox;
    entries: RotateEntry[];
    previewEntry: PreviewTransformEntry | null;
    useRealElementPreview: boolean;
    filterActiveTargets?: TransformTargetFilter;
    previewFallbackWrites: boolean;
    center: Point;
    startAngle: number;
    latestRotate: number;
    latestBoxes: Map<string, Pick<LayerBox, 'x' | 'y' | 'rotate'>>;
    pendingPointer: Point | null;
    pendingSnapAngle: boolean;
    boxesDirty: boolean;
    snapStep: number;
    rafId: number | null;
    moved: boolean;
}

export class RotateController {
    private session: RotateSession | null = null;

    private readonly transformWriter: TransformWriter;

    private readonly perfMonitor: InteractionPerfMonitor;

    private readonly defaultSnapStep: number;

    private readonly requestFrame: (callback: FrameRequestCallback) => number;

    private readonly cancelFrame: (id: number) => void;

    constructor(options: RotateControllerOptions = {}) {
        this.transformWriter = options.transformWriter ?? new TransformWriter();
        this.perfMonitor = options.perfMonitor ?? new InteractionPerfMonitor();
        this.defaultSnapStep = normalizeSnapStep(options.snapStep);
        this.requestFrame = options.requestFrame ?? requestAnimationFrame.bind(globalThis);
        this.cancelFrame = options.cancelFrame ?? cancelAnimationFrame.bind(globalThis);
    }

    isRotating() {
        return this.session !== null;
    }

    getPerfSnapshot() {
        return this.perfMonitor.snapshot();
    }

    start({layer, element, previewElement, useRealElementPreview, pointer, snapStep, filterActiveTargets}: StartRotateInput) {
        this.cancel();

        const center = {
            x: layer.x + layer.width / 2,
            y: layer.y + layer.height / 2,
        };

        this.session = {
            layer: {...layer},
            entries: [{layer: {...layer}, element}],
            previewEntry: previewElement
                ? this.transformWriter.preparePreviewElement({element: previewElement, box: layer})
                : null,
            useRealElementPreview: useRealElementPreview ?? true,
            filterActiveTargets,
            previewFallbackWrites: false,
            center,
            startAngle: pointAngle(center, pointer),
            latestRotate: normalizeAngle(layer.rotate),
            latestBoxes: new Map([[layer.id, {x: layer.x, y: layer.y, rotate: normalizeAngle(layer.rotate)}]]),
            pendingPointer: null,
            pendingSnapAngle: false,
            boxesDirty: false,
            snapStep: normalizeSnapStep(snapStep ?? this.defaultSnapStep),
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
        pointer,
        snapStep,
        filterActiveTargets,
    }: StartRotateManyInput) {
        this.cancel();

        const entries = layers
            .map((layer) => {
                const element = elements.get(layer.id);
                return element ? {layer: {...layer}, element} : null;
            })
            .filter((entry): entry is RotateEntry => Boolean(entry));
        const boundsLayer = createBoundsLayer(entries.map((entry) => entry.layer));

        if (!boundsLayer || entries.length === 0) {
            return false;
        }

        const center = {
            x: boundsLayer.x + boundsLayer.width / 2,
            y: boundsLayer.y + boundsLayer.height / 2,
        };

        this.session = {
            layer: boundsLayer,
            entries,
            previewEntry: previewElement
                ? this.transformWriter.preparePreviewElement({element: previewElement, box: boundsLayer})
                : null,
            useRealElementPreview: useRealElementPreview ?? true,
            filterActiveTargets,
            previewFallbackWrites: false,
            center,
            startAngle: pointAngle(center, pointer),
            latestRotate: 0,
            latestBoxes: new Map(entries.map((entry) => [
                entry.layer.id,
                {x: entry.layer.x, y: entry.layer.y, rotate: normalizeAngle(entry.layer.rotate)},
            ])),
            pendingPointer: null,
            pendingSnapAngle: false,
            boxesDirty: false,
            snapStep: normalizeSnapStep(snapStep ?? this.defaultSnapStep),
            rafId: null,
            moved: false,
        };

        return true;
    }

    move(pointer: Point, options: RotateMoveOptions = {}) {
        const session = this.session;

        if (!session) {
            return false;
        }

        session.pendingPointer = pointer;
        session.pendingSnapAngle = Boolean(options.snapAngle);
        this.scheduleFlush();
        return true;
    }

    flush() {
        const session = this.session;

        if (!session) {
            return 0;
        }

        this.resolvePendingRotate(session, false);

        const activeEntries = this.resolveActiveRotateEntries(session);
        let writeCount = 0;

        if (activeEntries.length === 0) {
            writeCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        } else if (session.previewEntry && activeEntries.length === session.entries.length) {
            writeCount = this.transformWriter.writeTransform(
                session.previewEntry,
                {
                    x: session.previewEntry.box.x,
                    y: session.previewEntry.box.y,
                    rotate: session.latestRotate,
                },
            );
        } else if (!session.useRealElementPreview) {
            writeCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        } else {
            this.resolveLatestBoxes(session);
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            const activeWriteCount = this.transformWriter.writeTransformMany(
                this.createRotateItems(session, activeEntries),
            );
            session.previewFallbackWrites = session.previewFallbackWrites || Boolean(session.previewEntry);
            writeCount = restoreCount + activeWriteCount;
        }
        this.perfMonitor.recordFrameFlush();
        this.perfMonitor.recordDomWrites(writeCount);

        return writeCount;
    }

    end(pointer?: Point, options: RotateMoveOptions = {}): RotateCommitItem | RotateCommitItem[] | null {
        const session = this.session;

        if (!session) {
            return null;
        }

        if (pointer) {
            session.pendingPointer = pointer;
            session.pendingSnapAngle = Boolean(options.snapAngle);
        }

        this.cancelScheduledFlush(session);
        this.resolvePendingRotate(session, true);
        this.resolveLatestBoxes(session);

        if (!session.moved) {
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            this.perfMonitor.recordDomWrites(restoreCount);
            this.session = null;
            return null;
        }

        const activeEntries = this.resolveActiveRotateEntries(session);

        if (activeEntries.length === 0) {
            const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
            this.perfMonitor.recordDomWrites(restoreCount);
            this.session = null;
            return null;
        }

        const writeCount = this.transformWriter.writeTransformMany(this.createRotateItems(session, activeEntries));
        const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);
        this.perfMonitor.recordDomWrites(writeCount + restoreCount);

        const items = activeEntries.map((entry) => {
            const box = session.latestBoxes.get(entry.layer.id) ?? entry.layer;

            if (activeEntries.length === 1 && entry.layer.id === session.layer.id) {
                return {
                    id: entry.layer.id,
                    rotate: box.rotate,
                };
            }

            return {
                id: entry.layer.id,
                x: box.x,
                y: box.y,
                rotate: box.rotate,
            };
        });

        this.session = null;
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

    private cancelScheduledFlush(session: RotateSession) {
        if (session.rafId === null) {
            return;
        }

        this.cancelFrame(session.rafId);
        session.rafId = null;
    }

    private resolvePendingRotate(session: RotateSession, includeBoxes: boolean) {
        if (!session.pendingPointer) {
            return;
        }

        session.latestRotate = resolveRotate(session, session.pendingPointer, session.pendingSnapAngle);
        session.boxesDirty = true;

        if (includeBoxes || !session.previewEntry) {
            this.resolveLatestBoxes(session);
        }

        session.pendingPointer = null;
        session.moved = session.moved || hasMovedRotate(session);
    }

    private resolveLatestBoxes(session: RotateSession) {
        if (!session.boxesDirty) {
            return;
        }

        session.latestBoxes = resolveRotateBoxes(session, session.latestRotate);
        session.boxesDirty = false;
    }

    private restorePreviewSession(session: RotateSession) {
        const restoreCount = this.transformWriter.restorePreviewElement(session.previewEntry);

        if (!session.previewEntry && session.useRealElementPreview) {
            return this.transformWriter.writeTransformMany(this.createSourceRotateItems(session));
        }

        if (!session.previewFallbackWrites) {
            return restoreCount;
        }

        return restoreCount + this.transformWriter.writeTransformMany(this.createSourceRotateItems(session));
    }

    private resolveActiveRotateEntries(session: RotateSession) {
        if (!session.filterActiveTargets) {
            return session.entries;
        }

        const activeIds = session.filterActiveTargets(session.entries.map((entry) => ({
            id: entry.layer.id,
            element: entry.element,
        })));

        return session.entries.filter((entry) => activeIds.has(entry.layer.id));
    }

    private *createRotateItems(
        session: RotateSession,
        entries = this.resolveActiveRotateEntries(session),
    ): Iterable<{entry: {element: HTMLElement; box: LayerBox}; box: Pick<LayerBox, 'x' | 'y' | 'rotate'>}> {
        for (const entry of entries) {
            yield {
                entry: {element: entry.element, box: entry.layer},
                box: session.latestBoxes.get(entry.layer.id) ?? entry.layer,
            };
        }
    }

    private *createSourceRotateItems(
        session: RotateSession,
        entries = this.resolveActiveRotateEntries(session),
    ): Iterable<{entry: {element: HTMLElement; box: LayerBox}; box: Pick<LayerBox, 'x' | 'y' | 'rotate'>}> {
        for (const entry of entries) {
            yield {
                entry: {element: entry.element, box: entry.layer},
                box: entry.layer,
            };
        }
    }
}

function resolveRotate(session: RotateSession, pointer: Point, snapAngle: boolean) {
    const currentAngle = pointAngle(session.center, pointer);
    const delta = normalizeDeltaAngle(currentAngle - session.startAngle);
    const rotate = normalizeAngle(session.layer.rotate + delta);

    return snapAngle ? snapRotate(rotate, session.snapStep) : rotate;
}

function resolveRotateBoxes(session: RotateSession, rotate: number) {
    if (session.entries.length === 1 && session.entries[0].layer.id === session.layer.id) {
        return new Map([[session.layer.id, {
            x: session.layer.x,
            y: session.layer.y,
            rotate,
        }]]);
    }

    const delta = normalizeDeltaAngle(rotate - session.layer.rotate);
    const boxes = new Map<string, Pick<LayerBox, 'x' | 'y' | 'rotate'>>();

    for (const entry of session.entries) {
        const layer = entry.layer;
        const layerCenter = {
            x: layer.x + layer.width / 2,
            y: layer.y + layer.height / 2,
        };
        const nextCenter = rotatePoint(session.center, layerCenter, delta);

        boxes.set(layer.id, {
            x: normalizeNumber(nextCenter.x - layer.width / 2),
            y: normalizeNumber(nextCenter.y - layer.height / 2),
            rotate: normalizeAngle(layer.rotate + delta),
        });
    }

    return boxes;
}

function rotatePoint(center: Point, point: Point, rotate: number): Point {
    const radians = rotate * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;

    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
    };
}

function hasMovedRotate(session: RotateSession) {
    return Math.abs(normalizeDeltaAngle(session.latestRotate - session.layer.rotate)) > 0.000001;
}

function pointAngle(center: Point, pointer: Point) {
    return Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI;
}

function snapRotate(value: number, step: number) {
    return normalizeAngle(Math.round(value / step) * step);
}

function normalizeAngle(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return ((value % 360) + 360) % 360;
}

function normalizeDeltaAngle(value: number) {
    const normalized = ((value + 180) % 360 + 360) % 360 - 180;

    return normalized === -180 ? 180 : normalized;
}

function normalizeSnapStep(value: number | undefined) {
    if (typeof value !== 'number') {
        return 45;
    }

    return Number.isFinite(value) && value > 0 ? value : 45;
}
