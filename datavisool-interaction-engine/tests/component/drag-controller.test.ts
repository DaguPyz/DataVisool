/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {DragController, type LayerBox} from '../../src/main';

function createLayer(id: string, x: number, y: number): LayerBox {
    return {
        id,
        x,
        y,
        width: 40,
        height: 30,
        rotate: 0,
    };
}

describe('DragController', () => {
    it('batch writes active element transforms once per RAF flush', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const controller = new DragController({
            requestFrame: (callback) => {
                frameCallbacks.push(callback);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layerA = createLayer('a', 10, 20);
        const layerB = createLayer('b', 100, 120);
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [layerA, layerB],
            activeElements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 3, y: 4});
        controller.move({x: 5, y: 8});

        expect(elementA.style.transform).toBe('');
        expect(frameCallbacks).toHaveLength(1);

        frameCallbacks[0](16);

        expect(elementA.style.transform).toBe('translate(15px, 28px) rotate(0deg)');
        expect(elementB.style.transform).toBe('translate(105px, 128px) rotate(0deg)');
        expect(controller.getPerfSnapshot().frameFlushes).toBe(1);
        expect(controller.getPerfSnapshot().domWrites).toBe(2);
    });

    it('commits final positions for all active ids', () => {
        const controller = new DragController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layerA = createLayer('a', 10, 20);
        const layerB = createLayer('b', 100, 120);

        controller.start({
            hitId: 'a',
            activeLayers: [layerA, layerB],
            activeElements: new Map([
                ['a', document.createElement('div')],
                ['b', document.createElement('div')],
            ]),
            pointer: {x: 2, y: 3},
        });

        const items = controller.end({x: 12, y: 9});

        expect(items).toEqual([
            {id: 'a', x: 20, y: 26},
            {id: 'b', x: 110, y: 126},
        ]);
        expect(controller.isDragging()).toBe(false);
        expect(controller.getPerfSnapshot().dragCommits).toBe(1);
    });

    it('does not write or commit targets removed during an active drag session', () => {
        const controller = new DragController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layerA = createLayer('a', 10, 20);
        const layerB = createLayer('b', 100, 120);
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        let removed = false;

        controller.start({
            hitId: 'a',
            activeLayers: [layerA, layerB],
            activeElements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            filterActiveTargets: (targets) => new Set(
                targets
                    .filter((target) => !(removed && target.id === 'b'))
                    .map((target) => target.id),
            ),
            pointer: {x: 0, y: 0},
        });

        removed = true;
        const items = controller.end({x: 10, y: 10});

        expect(items).toEqual([{id: 'a', x: 20, y: 30}]);
        expect(elementA.style.transform).toBe('translate(20px, 30px) rotate(0deg)');
        expect(elementB.style.transform).toBe('');
    });

    it('uses a preview element during multi-layer drag flush and commits real layer positions on end', () => {
        const controller = new DragController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const previewElement = document.createElement('div');
        const layers = [
            createLayer('a', 10, 20),
            createLayer('b', 100, 120),
        ];

        controller.start({
            hitId: 'a',
            activeLayers: layers,
            activeElements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            previewElement,
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 20, y: 10});
        controller.flush();

        expect(previewElement.style.transform).toBe('translate(30px, 30px) rotate(0deg)');
        expect(elementA.style.transform).toBe('');
        expect(elementB.style.transform).toBe('');

        const items = controller.end({x: 20, y: 10});

        expect(items).toEqual([
            {id: 'a', x: 30, y: 30},
            {id: 'b', x: 120, y: 130},
        ]);
        expect(previewElement.style.transform).toBe('');
        expect(elementA.style.transform).toBe('translate(30px, 30px) rotate(0deg)');
        expect(elementB.style.transform).toBe('translate(120px, 130px) rotate(0deg)');
    });

    it('snaps drag distance by configured step from the start position', () => {
        const controller = new DragController({
            dragStep: 10,
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layer = createLayer('a', 13, 27);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [layer],
            activeElements: new Map([['a', element]]),
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 14, y: 26});

        expect(element.style.transform).toBe('translate(23px, 57px) rotate(0deg)');

        const items = controller.end({x: 16, y: 24});

        expect(items).toEqual([{id: 'a', x: 33, y: 47}]);
    });

    it('locks movement to the dominant axis when requested', () => {
        const controller = new DragController({
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layer = createLayer('a', 10, 20);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [layer],
            activeElements: new Map([['a', element]]),
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 30, y: 10}, {axisLocked: true});
        expect(element.style.transform).toBe('translate(40px, 20px) rotate(0deg)');

        const items = controller.end({x: 40, y: 35}, {axisLocked: true});
        expect(items).toEqual([{id: 'a', x: 50, y: 20}]);
    });

    it('locks vertical movement when vertical delta dominates first', () => {
        const controller = new DragController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layer = createLayer('a', 10, 20);

        controller.start({
            hitId: 'a',
            activeLayers: [layer],
            activeElements: new Map([['a', document.createElement('div')]]),
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 10, y: 30}, {axisLocked: true});
        const items = controller.end({x: 40, y: 50}, {axisLocked: true});

        expect(items).toEqual([{id: 'a', x: 10, y: 70}]);
    });

    it('does not lock axis from tiny initial pointer jitter', () => {
        const controller = new DragController({
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layer = createLayer('a', 10, 20);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [layer],
            activeElements: new Map([['a', element]]),
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 1, y: 2}, {axisLocked: true});
        expect(element.style.transform).toBe('translate(10px, 20px) rotate(0deg)');

        controller.move({x: 80, y: 5}, {axisLocked: true});
        const items = controller.end({x: 90, y: 8}, {axisLocked: true});

        expect(items).toEqual([{id: 'a', x: 100, y: 20}]);
    });

    it('applies snap corrections before writing transforms and committing positions', () => {
        const snapResults: unknown[] = [];
        const controller = new DragController({
            onSnap: (result) => snapResults.push(result),
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const active = createLayer('a', 10, 20);
        const target = createLayer('b', 100, 20);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [active],
            activeElements: new Map([['a', element]]),
            snapCandidates: [target],
            snapOptions: {mode: 'all', threshold: 5},
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 46, y: 0});
        const items = controller.end({x: 46, y: 0});

        expect(element.style.transform).toBe('translate(60px, 20px) rotate(0deg)');
        expect(items).toEqual([{id: 'a', x: 60, y: 20}]);
        expect(snapResults).toHaveLength(3);
        expect(snapResults.at(-1)).toBeNull();
    });

    it('resolves snap guides from stepped drag distance', () => {
        const snapResults: Array<{guides: unknown[]} | null> = [];
        const controller = new DragController({
            dragStep: 10,
            onSnap: (result) => snapResults.push(result),
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const active = createLayer('a', 10, 20);
        const target = createLayer('b', 80, 20);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [active],
            activeElements: new Map([['a', element]]),
            snapCandidates: [target],
            snapOptions: {mode: 'all', threshold: 2},
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 26, y: 0});

        expect(element.style.transform).toBe('translate(40px, 20px) rotate(0deg)');
        expect(snapResults[0]?.guides.length).toBeGreaterThan(0);

        const items = controller.end({x: 26, y: 0});

        expect(items).toEqual([{id: 'a', x: 40, y: 20}]);
    });

    it('lets guideline snapping override stepped drag distance while preserving stepped fallback', () => {
        const snapResults: Array<{dx: number; dy: number; snappedX: boolean; snappedY: boolean; guides: Array<{axis: string}>} | null> = [];
        const controller = new DragController({
            dragStep: 10,
            onSnap: (result) => snapResults.push(result),
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const active = createLayer('a', 10, 20);
        const target = createLayer('b', 33, 40);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [active],
            activeElements: new Map([['a', element]]),
            snapCandidates: [target],
            snapOptions: {mode: 'all', threshold: 5},
            pointer: {x: 0, y: 0},
        });

        controller.move({x: 20, y: 20});

        expect(element.style.transform).toBe('translate(33px, 40px) rotate(0deg)');
        expect(snapResults[0]).toMatchObject({
            dx: 23,
            dy: 20,
            snappedX: true,
            snappedY: true,
        });
        expect(snapResults[0]?.guides.map((guide) => guide.axis)).toEqual(['x', 'y']);

        const items = controller.end({x: 20, y: 20});

        expect(items).toEqual([{id: 'a', x: 33, y: 40}]);
    });

    it('rolls back active element transforms on cancel', () => {
        const controller = new DragController({
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
            now: () => 0,
        });
        const layer = createLayer('a', 10, 20);
        const element = document.createElement('div');

        controller.start({
            hitId: 'a',
            activeLayers: [layer],
            activeElements: new Map([['a', element]]),
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 20, y: 30});

        expect(element.style.transform).toBe('translate(30px, 50px) rotate(0deg)');

        controller.cancel();

        expect(element.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(controller.isDragging()).toBe(false);
        expect(controller.getPerfSnapshot().dragCancels).toBe(1);
    });
});
