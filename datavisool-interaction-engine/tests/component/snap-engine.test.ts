/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {
    createExpandedRect,
    createUnionRect,
    normalizeSnapOptions,
    SnapEngine,
    type LayerBox,
} from '../../src/main';

function createLayer(id: string, x: number, y: number, width = 40, height = 30): LayerBox {
    return {
        id,
        x,
        y,
        width,
        height,
        rotate: 0,
    };
}

describe('SnapEngine', () => {
    it('snaps moving x lines to the nearest candidate x line within threshold', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20, 40, 30)],
            candidateLayers: [createLayer('target', 100, 20, 40, 30)],
            options: {mode: 'all', threshold: 5},
        });

        const result = engine.resolve(session, 46, 0, {snapY: false});

        expect(result.dx).toBe(50);
        expect(result.dy).toBe(0);
        expect(result.snappedX).toBe(true);
        expect(result.snappedY).toBe(false);
        expect(result.guides).toHaveLength(1);
        expect(result.guides[0]).toMatchObject({
            axis: 'x',
            value: 100,
            segmentStart: 20,
            segmentEnd: 50,
            segmentDistance: 0,
            relationDirection: 'overlap',
        });
    });

    it('snaps moving lines to external reference points per axis', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20, 40, 30)],
            candidateLayers: [],
            options: {
                mode: 'all',
                threshold: 5,
                referencePoints: {
                    x: [100, 100, Number.NaN],
                    y: [80],
                },
            },
        });

        const result = engine.resolve(session, 86, 26);

        expect(session.candidateLinesX.map((line) => line.value)).toEqual([100]);
        expect(session.candidateLinesY.map((line) => line.value)).toEqual([80]);
        expect(result).toMatchObject({
            dx: 90,
            dy: 30,
            snappedX: true,
            snappedY: true,
        });
        expect(result.guides.map((guide) => ({
            axis: guide.axis,
            value: guide.value,
            fullSpan: guide.fullSpan,
            source: guide.target.source,
        }))).toEqual([
            {
                axis: 'x',
                value: 100,
                fullSpan: true,
                source: 'reference',
            },
            {
                axis: 'y',
                value: 80,
                fullSpan: true,
                source: 'reference',
            },
        ]);
    });

    it('does not reuse stale candidate lines when caller mutates an unversioned candidate array', () => {
        const engine = new SnapEngine();
        const candidates = [createLayer('target', 100, 20, 40, 30)];

        engine.start({
            activeLayers: [createLayer('active', 10, 20, 40, 30)],
            candidateLayers: candidates,
            options: {mode: 'all', threshold: 5},
        });

        candidates[0] = createLayer('target', 200, 20, 40, 30);

        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20, 40, 30)],
            candidateLayers: candidates,
            options: {mode: 'all', threshold: 5},
        });
        const result = engine.resolve(session, 146, 0, {snapY: false});

        expect(result.dx).toBe(150);
        expect(result.guides[0]).toMatchObject({
            axis: 'x',
            value: 200,
        });
    });

    it('snaps y independently from x', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 20, 20, 40, 30)],
            candidateLayers: [createLayer('target', 20, 80, 40, 30)],
            options: {mode: 'all', threshold: 6},
        });

        const result = engine.resolve(session, 0, 24, {snapX: false});

        expect(result.dx).toBe(0);
        expect(result.dy).toBe(30);
        expect(result.snappedY).toBe(true);
        expect(result.guides[0]).toMatchObject({
            axis: 'y',
            value: 80,
            segmentStart: 20,
            segmentEnd: 60,
            segmentDistance: 0,
            relationDirection: 'overlap',
        });
    });

    it('limits horizontal guides to the relationship segment between separated layers', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20, 40, 30)],
            candidateLayers: [createLayer('target', 100, 80, 40, 30)],
            options: {mode: 'all', threshold: 6},
        });

        const result = engine.resolve(session, 0, 24, {snapX: false});

        expect(result.dy).toBe(30);
        expect(result.guides[0]).toMatchObject({
            axis: 'y',
            value: 80,
            segmentStart: 50,
            segmentEnd: 100,
            segmentDistance: 50,
            relationDirection: 'right',
        });
    });

    it('returns only the nearest relation guide per left and right direction', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 100, 20, 40, 30)],
            candidateLayers: [
                createLayer('far-left', 0, 80, 20, 30),
                createLayer('left', 10, 80, 40, 30),
                createLayer('right', 180, 80, 40, 30),
                createLayer('far-right', 250, 80, 40, 30),
            ],
            options: {mode: 'all', threshold: 6},
        });

        const result = engine.resolve(session, 0, 24, {snapX: false});

        expect(result.dy).toBe(30);
        expect(result.guides).toHaveLength(2);
        expect(result.guides.map((guide) => ({
            layerId: guide.target.layerId,
            relationDirection: guide.relationDirection,
            segmentStart: guide.segmentStart,
            segmentEnd: guide.segmentEnd,
            segmentDistance: guide.segmentDistance,
        }))).toEqual([
            {
                layerId: 'left',
                relationDirection: 'left',
                segmentStart: 50,
                segmentEnd: 100,
                segmentDistance: 50,
            },
            {
                layerId: 'right',
                relationDirection: 'right',
                segmentStart: 140,
                segmentEnd: 180,
                segmentDistance: 40,
            },
        ]);
    });

    it('returns only the nearest relation guide per above and below direction', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 40, 100, 40, 30)],
            candidateLayers: [
                createLayer('far-above', 120, 0, 40, 20),
                createLayer('above', 120, 40, 40, 30),
                createLayer('below', 120, 180, 40, 30),
                createLayer('far-below', 120, 260, 40, 30),
            ],
            options: {mode: 'all', threshold: 6},
        });

        const result = engine.resolve(session, 76, 0, {snapY: false});

        expect(result.dx).toBe(80);
        expect(result.guides).toHaveLength(2);
        expect(result.guides.map((guide) => ({
            layerId: guide.target.layerId,
            relationDirection: guide.relationDirection,
            segmentStart: guide.segmentStart,
            segmentEnd: guide.segmentEnd,
            segmentDistance: guide.segmentDistance,
        }))).toEqual([
            {
                layerId: 'above',
                relationDirection: 'above',
                segmentStart: 70,
                segmentEnd: 100,
                segmentDistance: 30,
            },
            {
                layerId: 'below',
                relationDirection: 'below',
                segmentStart: 130,
                segmentEnd: 180,
                segmentDistance: 50,
            },
        ]);
    });

    it('excludes active layers and leaves visibility filtering to callers', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 10)],
            candidateLayers: [
                createLayer('active', 10, 10),
            ],
            options: {mode: 'all', threshold: 20},
        });

        const result = engine.resolve(session, 2, 0);

        expect(result).toMatchObject({
            dx: 2,
            dy: 0,
            snappedX: false,
            snappedY: false,
        });
        expect(result.guides).toEqual([]);
    });

    it('uses the active layer union bounds as moving snap lines for multi-selection drags', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [
                createLayer('active-a', 10, 20, 40, 30),
                createLayer('active-b', 90, 60, 30, 20),
            ],
            candidateLayers: [
                createLayer('internal', 50, 20, 20, 30),
                createLayer('target', 200, 20, 40, 60),
            ],
            options: {mode: 'all', threshold: 6},
        });

        const result = engine.resolve(session, 76, 0, {snapY: false});

        expect(result.dx).toBe(80);
        expect(result.guides).toHaveLength(1);
        expect(result.guides[0]).toMatchObject({
            axis: 'x',
            value: 200,
            segmentStart: 20,
            segmentEnd: 80,
            segmentDistance: 0,
            moving: {
                layerId: '__active_bounds__',
                type: 'end',
                value: 200,
                spanStart: 20,
                spanEnd: 80,
            },
            target: {
                layerId: 'target',
                type: 'start',
            },
        });
    });

    it('can disable one snap axis for shift-axis locked drags', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20)],
            candidateLayers: [createLayer('target', 100, 24)],
            options: {mode: 'all', threshold: 10},
        });

        const result = engine.resolve(session, 46, 4, {snapX: true, snapY: false});

        expect(result.dx).toBe(50);
        expect(result.dy).toBe(4);
        expect(result.guides.map((guide) => guide.axis)).toEqual(['x']);
    });

    it('returns passthrough deltas when mode is off', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20)],
            candidateLayers: [createLayer('target', 100, 20)],
            options: {mode: 'off', threshold: 100},
        });

        expect(engine.resolve(session, 46, 9)).toEqual({
            dx: 46,
            dy: 9,
            snappedX: false,
            snappedY: false,
            guides: [],
        });
    });

    it('keeps candidate lines sorted by value for binary-search snapping', () => {
        const engine = new SnapEngine();
        const session = engine.start({
            activeLayers: [createLayer('active', 10, 20)],
            candidateLayers: [
                createLayer('right', 300, 20),
                createLayer('left', 80, 20),
                createLayer('middle', 160, 20),
            ],
            options: {mode: 'all', threshold: 6},
        });

        expect(session.candidateLinesX.map((line) => line.value)).toEqual(
            [...session.candidateLinesX.map((line) => line.value)].sort((a, b) => a - b),
        );

        const result = engine.resolve(session, 26, 0, {snapY: false});

        expect(result.dx).toBe(30);
        expect(result.snappedX).toBe(true);
    });

    it('creates union and expanded rects for nearby candidate queries', () => {
        expect(createUnionRect([
            createLayer('a', 10, 20, 40, 30),
            createLayer('b', 80, 90, 20, 10),
        ])).toEqual({
            x: 10,
            y: 20,
            width: 90,
            height: 80,
        });

        expect(createExpandedRect({x: 10, y: 20, width: 90, height: 80}, 5)).toEqual({
            x: 5,
            y: 15,
            width: 100,
            height: 90,
        });
    });

    it('normalizes invalid options to safe defaults', () => {
        expect(normalizeSnapOptions({
            mode: 'nearby',
            threshold: -1,
            candidateRange: Number.NaN,
        })).toEqual({
            mode: 'nearby',
            threshold: 5,
            candidateRange: 360,
            referencePoints: {
                x: [],
                y: [],
            },
        });
    });
});
