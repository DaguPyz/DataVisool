/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox, Rect, SnapMode, SnapOptions, SnapReferencePoints} from './types';

export type SnapAxis = 'x' | 'y';
export type SnapLineType = 'start' | 'center' | 'end';
export type SnapRelationDirection = 'left' | 'right' | 'above' | 'below' | 'overlap';

const REFERENCE_LINE_LAYER_ID = '__snap_reference__';

export interface SnapLine {
    id: string;
    layerId: string;
    axis: SnapAxis;
    type: SnapLineType;
    value: number;
    spanStart: number;
    spanEnd: number;
    source?: 'reference';
}

export interface SnapGuide {
    axis: SnapAxis;
    value: number;
    segmentStart: number;
    segmentEnd: number;
    segmentDistance: number;
    relationDirection: SnapRelationDirection;
    moving: SnapLine;
    target: SnapLine;
    fullSpan?: boolean;
}

export interface SnapResult {
    dx: number;
    dy: number;
    snappedX: boolean;
    snappedY: boolean;
    guides: SnapGuide[];
}

export interface SnapSession {
    mode: SnapMode;
    threshold: number;
    candidateRange: number;
    movingLinesX: SnapLine[];
    movingLinesY: SnapLine[];
    candidateLinesX: SnapLine[];
    candidateLinesY: SnapLine[];
}

export interface StartSnapInput {
    activeLayers: LayerBox[];
    candidateLayers: LayerBox[];
    candidateLayersVersion?: number;
    options?: SnapOptions;
}

export interface ResolveSnapOptions {
    snapX?: boolean;
    snapY?: boolean;
}

export interface ResolveSnapLinesInput {
    movingLinesX?: SnapLine[];
    movingLinesY?: SnapLine[];
    dx?: number;
    dy?: number;
    options?: ResolveSnapOptions;
}

interface BestSnap {
    distance: number;
    delta: number;
    movingType: SnapLineType;
    targetType: SnapLineType;
    guides: SnapGuide[];
}

interface CandidateLineCacheEntry {
    version: number | null;
    candidateIds: Set<string>;
    linesX: SnapLine[];
    linesY: SnapLine[];
}

interface NormalizedSnapOptions {
    mode: SnapMode;
    threshold: number;
    candidateRange: number;
    referencePoints: Required<SnapReferencePoints>;
}

export class SnapEngine {
    private readonly candidateLineCache = new WeakMap<LayerBox[], CandidateLineCacheEntry>();

    start({activeLayers, candidateLayers, candidateLayersVersion, options}: StartSnapInput): SnapSession {
        const normalized = normalizeSnapOptions(options);

        if (normalized.mode === 'off') {
            return {
                mode: normalized.mode,
                threshold: normalized.threshold,
                candidateRange: normalized.candidateRange,
                movingLinesX: [],
                movingLinesY: [],
                candidateLinesX: [],
                candidateLinesY: [],
            };
        }

        const activeIds = new Set(activeLayers.map((layer) => layer.id));
        const movingLines = createMovingSnapLines(activeLayers);
        const candidateLineIndex = this.resolveCandidateLineIndex(candidateLayers, candidateLayersVersion, activeIds);
        const referenceLines = createReferenceSnapLines(normalized.referencePoints);

        return {
            mode: normalized.mode,
            threshold: normalized.threshold,
            candidateRange: normalized.candidateRange,
            movingLinesX: movingLines.filter((line) => line.axis === 'x'),
            movingLinesY: movingLines.filter((line) => line.axis === 'y'),
            candidateLinesX: mergeSortedSnapLines(candidateLineIndex.linesX, referenceLines.linesX),
            candidateLinesY: mergeSortedSnapLines(candidateLineIndex.linesY, referenceLines.linesY),
        };
    }

    resolve(session: SnapSession | null, dx: number, dy: number, options: ResolveSnapOptions = {}): SnapResult {
        return resolveSnapLines(
            session,
            session?.movingLinesX ?? [],
            session?.movingLinesY ?? [],
            dx,
            dy,
            options,
        );
    }

    resolveLines(session: SnapSession | null, input: ResolveSnapLinesInput = {}): SnapResult {
        return resolveSnapLines(
            session,
            input.movingLinesX ?? [],
            input.movingLinesY ?? [],
            input.dx ?? 0,
            input.dy ?? 0,
            input.options ?? {},
        );
    }

    private resolveCandidateLineIndex(
        candidateLayers: LayerBox[],
        version: number | undefined,
        activeIds: Set<string>,
    ) {
        if (version === undefined) {
            const entry = createCandidateLineCacheEntry(candidateLayers, null);

            if (!hasAnyActiveCandidate(entry.candidateIds, activeIds)) {
                return {
                    linesX: entry.linesX,
                    linesY: entry.linesY,
                };
            }

            return {
                linesX: entry.linesX.filter((line) => !activeIds.has(line.layerId)),
                linesY: entry.linesY.filter((line) => !activeIds.has(line.layerId)),
            };
        }

        const normalizedVersion = version ?? null;
        const cached = this.candidateLineCache.get(candidateLayers);
        const cacheHit = cached && cached.version === normalizedVersion;
        const entry = cacheHit ? cached : createCandidateLineCacheEntry(candidateLayers, normalizedVersion);

        if (!cacheHit) {
            this.candidateLineCache.set(candidateLayers, entry);
        }

        if (!hasAnyActiveCandidate(entry.candidateIds, activeIds)) {
            return {
                linesX: entry.linesX,
                linesY: entry.linesY,
            };
        }

        return {
            linesX: entry.linesX.filter((line) => !activeIds.has(line.layerId)),
            linesY: entry.linesY.filter((line) => !activeIds.has(line.layerId)),
        };
    }
}

function resolveSnapLines(
    session: SnapSession | null,
    movingLinesX: SnapLine[],
    movingLinesY: SnapLine[],
    dx: number,
    dy: number,
    options: ResolveSnapOptions = {},
): SnapResult {
    if (!session || session.mode === 'off') {
        return createPassthroughResult(dx, dy);
    }

    const snapX = options.snapX ?? true;
    const snapY = options.snapY ?? true;
    const bestX = snapX
        ? findBestSnapSorted(movingLinesX, session.candidateLinesX, dx, dy, session.threshold)
        : null;
    const nextDx = bestX ? dx + bestX.delta : dx;
    const bestY = snapY
        ? findBestSnapSorted(movingLinesY, session.candidateLinesY, dy, nextDx, session.threshold)
        : null;
    const nextDy = bestY ? dy + bestY.delta : dy;
    const guides: SnapGuide[] = [];

    if (bestX) {
        guides.push(...bestX.guides);
    }

    if (bestY) {
        guides.push(...bestY.guides);
    }

    return {
        dx: nextDx,
        dy: nextDy,
        snappedX: Boolean(bestX),
        snappedY: Boolean(bestY),
        guides,
    };
}

export function createExpandedRect(rect: Rect, range: number): Rect {
    return {
        x: rect.x - range,
        y: rect.y - range,
        width: rect.width + range * 2,
        height: rect.height + range * 2,
    };
}

export function createUnionRect(layers: LayerBox[]): Rect | null {
    if (layers.length === 0) {
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const layer of layers) {
        minX = Math.min(minX, layer.x);
        minY = Math.min(minY, layer.y);
        maxX = Math.max(maxX, layer.x + layer.width);
        maxY = Math.max(maxY, layer.y + layer.height);
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

export function normalizeSnapOptions(options: SnapOptions | undefined): NormalizedSnapOptions {
    const threshold = options?.threshold ?? 5;
    const candidateRange = options?.candidateRange ?? 360;

    return {
        mode: normalizeSnapMode(options?.mode),
        threshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : 5,
        candidateRange: Number.isFinite(candidateRange) && candidateRange >= 0 ? candidateRange : 360,
        referencePoints: normalizeReferencePoints(options?.referencePoints),
    };
}

function normalizeSnapMode(mode: SnapMode | undefined): SnapMode {
    return mode === 'nearby' || mode === 'all' || mode === 'off' ? mode : 'off';
}

function createSnapLines(layers: LayerBox[]) {
    const lines: SnapLine[] = [];

    for (const layer of layers) {
        lines.push(
            createSnapLine(layer, 'x', 'start', layer.x),
            createSnapLine(layer, 'x', 'center', layer.x + layer.width / 2),
            createSnapLine(layer, 'x', 'end', layer.x + layer.width),
            createSnapLine(layer, 'y', 'start', layer.y),
            createSnapLine(layer, 'y', 'center', layer.y + layer.height / 2),
            createSnapLine(layer, 'y', 'end', layer.y + layer.height),
        );
    }

    return lines;
}

function createCandidateLineCacheEntry(layers: LayerBox[], version: number | null): CandidateLineCacheEntry {
    const linesX: SnapLine[] = [];
    const linesY: SnapLine[] = [];
    const candidateIds = new Set<string>();

    for (const layer of layers) {
        candidateIds.add(layer.id);
        linesX.push(
            createSnapLine(layer, 'x', 'start', layer.x),
            createSnapLine(layer, 'x', 'center', layer.x + layer.width / 2),
            createSnapLine(layer, 'x', 'end', layer.x + layer.width),
        );
        linesY.push(
            createSnapLine(layer, 'y', 'start', layer.y),
            createSnapLine(layer, 'y', 'center', layer.y + layer.height / 2),
            createSnapLine(layer, 'y', 'end', layer.y + layer.height),
        );
    }

    return {
        version,
        candidateIds,
        linesX: sortSnapLinesByValue(linesX),
        linesY: sortSnapLinesByValue(linesY),
    };
}

function hasAnyActiveCandidate(candidateIds: Set<string>, activeIds: Set<string>) {
    for (const id of activeIds) {
        if (candidateIds.has(id)) {
            return true;
        }
    }

    return false;
}

function createMovingSnapLines(layers: LayerBox[]) {
    if (layers.length <= 1) {
        return createSnapLines(layers);
    }

    const bounds = createUnionRect(layers);

    if (!bounds) {
        return [];
    }

    return createSnapLines([{
        id: '__active_bounds__',
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotate: 0,
    }]);
}

function createSnapLine(layer: LayerBox, axis: SnapAxis, type: SnapLineType, value: number): SnapLine {
    return {
        id: `${layer.id}:${axis}:${type}`,
        layerId: layer.id,
        axis,
        type,
        value,
        spanStart: axis === 'x' ? layer.y : layer.x,
        spanEnd: axis === 'x' ? layer.y + layer.height : layer.x + layer.width,
    };
}

function sortSnapLinesByValue(lines: SnapLine[]) {
    return lines.sort((a, b) => a.value - b.value);
}

function createReferenceSnapLines(referencePoints: Required<SnapReferencePoints>) {
    return {
        linesX: referencePoints.x.map((value, index) => createReferenceSnapLine('x', value, index)),
        linesY: referencePoints.y.map((value, index) => createReferenceSnapLine('y', value, index)),
    };
}

function createReferenceSnapLine(axis: SnapAxis, value: number, index: number): SnapLine {
    return {
        id: `${REFERENCE_LINE_LAYER_ID}:${axis}:${index}`,
        layerId: REFERENCE_LINE_LAYER_ID,
        axis,
        type: 'start',
        value,
        spanStart: 0,
        spanEnd: 0,
        source: 'reference',
    };
}

function mergeSortedSnapLines(layerLines: SnapLine[], referenceLines: SnapLine[]) {
    if (referenceLines.length === 0) {
        return layerLines;
    }

    if (layerLines.length === 0) {
        return referenceLines;
    }

    const merged: SnapLine[] = [];
    let layerIndex = 0;
    let referenceIndex = 0;

    while (layerIndex < layerLines.length && referenceIndex < referenceLines.length) {
        if (layerLines[layerIndex].value <= referenceLines[referenceIndex].value) {
            merged.push(layerLines[layerIndex]);
            layerIndex += 1;
        } else {
            merged.push(referenceLines[referenceIndex]);
            referenceIndex += 1;
        }
    }

    while (layerIndex < layerLines.length) {
        merged.push(layerLines[layerIndex]);
        layerIndex += 1;
    }

    while (referenceIndex < referenceLines.length) {
        merged.push(referenceLines[referenceIndex]);
        referenceIndex += 1;
    }

    return merged;
}

function normalizeReferencePoints(referencePoints: SnapReferencePoints | undefined): Required<SnapReferencePoints> {
    return {
        x: normalizeReferenceValues(referencePoints?.x),
        y: normalizeReferenceValues(referencePoints?.y),
    };
}

function normalizeReferenceValues(values: readonly number[] | undefined) {
    if (!values || values.length === 0) {
        return [];
    }

    const normalized: number[] = [];

    for (const value of values) {
        if (Number.isFinite(value)) {
            normalized.push(value);
        }
    }

    normalized.sort((a, b) => a - b);

    let writeIndex = 0;

    for (let readIndex = 0; readIndex < normalized.length; readIndex += 1) {
        if (readIndex === 0 || normalized[readIndex] !== normalized[readIndex - 1]) {
            normalized[writeIndex] = normalized[readIndex];
            writeIndex += 1;
        }
    }

    normalized.length = writeIndex;
    return normalized;
}

function findBestSnapSorted(
    movingLines: SnapLine[],
    sortedCandidateLines: SnapLine[],
    offset: number,
    crossOffset: number,
    threshold: number,
): BestSnap | null {
    let best: BestSnap | null = null;

    for (const moving of movingLines) {
        const movingValue = moving.value + offset;
        const start = lowerBoundSnapValue(sortedCandidateLines, movingValue - threshold);
        const end = upperBoundSnapValue(sortedCandidateLines, movingValue + threshold);

        for (let index = start; index < end; index += 1) {
            const target = sortedCandidateLines[index];
            const delta = target.value - movingValue;
            const distance = Math.abs(delta);

            if (!best || distance < best.distance) {
                best = {
                    distance,
                    delta,
                    movingType: moving.type,
                    targetType: target.type,
                    guides: [],
                };
            }
        }
    }

    if (best) {
        best.guides = collectGuidesForBestSnapSorted(movingLines, sortedCandidateLines, offset, crossOffset, best);
    }

    return best;
}

function collectGuidesForBestSnapSorted(
    movingLines: SnapLine[],
    sortedCandidateLines: SnapLine[],
    offset: number,
    crossOffset: number,
    best: BestSnap,
) {
    const guides: SnapGuide[] = [];

    for (const moving of movingLines) {
        if (moving.type !== best.movingType) {
            continue;
        }

        const movingValue = moving.value + offset;
        const targetValue = movingValue + best.delta;
        const start = lowerBoundSnapValue(sortedCandidateLines, targetValue - 0.001);
        const end = upperBoundSnapValue(sortedCandidateLines, targetValue + 0.001);

        for (let index = start; index < end; index += 1) {
            const target = sortedCandidateLines[index];
            if (target.type !== best.targetType) {
                continue;
            }

            const delta = target.value - movingValue;

            if (Math.abs(delta - best.delta) > 0.001) {
                continue;
            }

            guides.push(createGuide(moving, target, movingValue, crossOffset, delta));
        }
    }

    return filterNearestGuidesByDirection(guides);
}

function lowerBoundSnapValue(lines: SnapLine[], value: number) {
    let low = 0;
    let high = lines.length;

    while (low < high) {
        const mid = (low + high) >>> 1;

        if (lines[mid].value < value) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return low;
}

function upperBoundSnapValue(lines: SnapLine[], value: number) {
    let low = 0;
    let high = lines.length;

    while (low < high) {
        const mid = (low + high) >>> 1;

        if (lines[mid].value <= value) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return low;
}

function createGuide(
    moving: SnapLine,
    target: SnapLine,
    movingValue: number,
    crossOffset: number,
    delta: number,
): SnapGuide {
    const movingLine = {
        ...moving,
        value: movingValue + delta,
        spanStart: moving.spanStart + crossOffset,
        spanEnd: moving.spanEnd + crossOffset,
    };

    if (target.source === 'reference') {
        return {
            axis: moving.axis,
            value: target.value,
            segmentStart: movingLine.spanStart,
            segmentEnd: movingLine.spanEnd,
            segmentDistance: 0,
            relationDirection: 'overlap',
            moving: movingLine,
            target,
            fullSpan: true,
        };
    }

    const segment = createRelationSegment(
        movingLine.spanStart,
        movingLine.spanEnd,
        target.spanStart,
        target.spanEnd,
    );

    return {
        axis: moving.axis,
        value: target.value,
        segmentStart: segment.start,
        segmentEnd: segment.end,
        segmentDistance: segment.distance,
        relationDirection: resolveRelationDirection(moving.axis, segment.position),
        moving: movingLine,
        target,
    };
}

function filterNearestGuidesByDirection(guides: SnapGuide[]) {
    const nearestByDirection = new Map<SnapRelationDirection, SnapGuide>();

    for (const guide of guides) {
        const current = nearestByDirection.get(guide.relationDirection);

        if (!current || guide.segmentDistance < current.segmentDistance) {
            nearestByDirection.set(guide.relationDirection, guide);
        }
    }

    return Array.from(nearestByDirection.values());
}

function createRelationSegment(movingStart: number, movingEnd: number, targetStart: number, targetEnd: number) {
    if (movingEnd < targetStart) {
        return {
            start: movingEnd,
            end: targetStart,
            distance: targetStart - movingEnd,
            position: 'after' as const,
        };
    }

    if (targetEnd < movingStart) {
        return {
            start: targetEnd,
            end: movingStart,
            distance: movingStart - targetEnd,
            position: 'before' as const,
        };
    }

    return {
        start: Math.min(movingStart, targetStart),
        end: Math.max(movingEnd, targetEnd),
        distance: 0,
        position: 'overlap' as const,
    };
}

function resolveRelationDirection(axis: SnapAxis, position: 'before' | 'after' | 'overlap'): SnapRelationDirection {
    if (position === 'overlap') {
        return 'overlap';
    }

    if (axis === 'y') {
        return position === 'before' ? 'left' : 'right';
    }

    return position === 'before' ? 'above' : 'below';
}

function createPassthroughResult(dx: number, dy: number): SnapResult {
    return {
        dx,
        dy,
        snappedX: false,
        snappedY: false,
        guides: [],
    };
}
