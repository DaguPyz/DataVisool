/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {ResizeController, type LayerBox, type SnapResult} from '../../src/main';

function createLayer(id = 'a'): LayerBox {
    return {
        id,
        x: 10,
        y: 20,
        width: 100,
        height: 60,
        rotate: 0,
    };
}

describe('ResizeController', () => {
    it('lets guideline snapping override stepped resize size while preserving stepped fallback', () => {
        const snapResults: Array<SnapResult | null> = [];
        const controller = new ResizeController({
            resizeStep: 10,
            onSnap: (result) => snapResults.push(result),
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = createLayer();
        const candidate = {
            id: 'b',
            x: 132,
            y: 20,
            width: 80,
            height: 60,
            rotate: 0,
        };

        controller.start({
            layer,
            element,
            handle: 'e',
            pointer: {x: 0, y: 0},
            snapCandidates: [candidate],
            snapOptions: {mode: 'all', threshold: 5},
        });
        controller.move({x: 20, y: 0});

        const activeSnap = snapResults.find((result) => result?.snappedX);
        expect(activeSnap?.guides).toHaveLength(1);
        expect(activeSnap?.guides[0]).toMatchObject({
            axis: 'x',
            value: 132,
        });

        expect(controller.end({x: 20, y: 0})).toEqual({
            id: 'a',
            x: 10,
            y: 20,
            width: 122,
            height: 60,
        });
        expect(snapResults.at(-1)).toBeNull();
    });

    it('writes transform-only resize preview through one RAF flush', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const controller = new ResizeController({
            requestFrame: (callback) => {
                frameCallbacks.push(callback);
                return 1;
            },
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = createLayer();

        controller.start({
            layer,
            element,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 25, y: 10});

        expect(element.style.width).toBe('');
        expect(frameCallbacks).toHaveLength(1);

        frameCallbacks[0](16);

        expect(element.style.transform).toBe('translate(22.5px, 25px) rotate(0deg) scale(1.25, 1.167)');
        expect(element.style.transformOrigin).toBe('');
        expect(element.style.width).toBe('');
        expect(element.style.height).toBe('');
        expect(controller.getPerfSnapshot().frameFlushes).toBe(1);
        expect(controller.getPerfSnapshot().domWrites).toBe(1);
    });

    it('uses a supplied preview element for single resize preview', () => {
        const controller = new ResizeController({
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const previewElement = document.createElement('div');
        element.style.transformOrigin = '12px 18px';
        previewElement.style.transformOrigin = 'left top';
        const layer = createLayer();

        controller.start({
            layer,
            element,
            previewElement,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 25, y: 10});

        expect(previewElement.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(previewElement.style.transformOrigin).toBe('center center');
        expect(previewElement.style.width).toBe('125px');
        expect(previewElement.style.height).toBe('70px');
        expect(element.style.transform).toBe('');
        expect(element.style.transformOrigin).toBe('12px 18px');

        const item = controller.end({x: 25, y: 10});

        expect(item).toEqual({
            id: 'a',
            x: 10,
            y: 20,
            width: 125,
            height: 70,
        });
        expect(previewElement.style.transform).toBe('');
        expect(previewElement.style.transformOrigin).toBe('left top');
        expect(previewElement.style.width).toBe('');
        expect(previewElement.style.height).toBe('');
        expect(element.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(element.style.transformOrigin).toBe('');
    });

    it('restores supplied preview element dimensions on cancel', () => {
        const controller = new ResizeController({
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const previewElement = document.createElement('div');
        previewElement.style.transform = 'translate(1px, 2px) rotate(0deg)';
        previewElement.style.transformOrigin = 'left top';
        previewElement.style.width = '90px';
        previewElement.style.height = '45px';
        const layer = createLayer();

        controller.start({
            layer,
            element,
            previewElement,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 25, y: 10});

        expect(previewElement.style.width).toBe('125px');
        expect(previewElement.style.height).toBe('70px');

        controller.cancel();

        expect(previewElement.style.transform).toBe('translate(1px, 2px) rotate(0deg)');
        expect(previewElement.style.transformOrigin).toBe('left top');
        expect(previewElement.style.width).toBe('90px');
        expect(previewElement.style.height).toBe('45px');
        expect(element.style.transform).toBe('');
        expect(element.style.width).toBe('');
        expect(element.style.height).toBe('');
    });

    it('does not mutate transform origin before resize commit', () => {
        const controller = new ResizeController({
            requestFrame: (callback) => {
                callback(16);
                return 1;
            },
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        element.style.transformOrigin = '12px 18px';
        const layer = createLayer();

        controller.start({
            layer,
            element,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });

        expect(controller.end({x: 0, y: 0})).toBeNull();
        expect(element.style.transformOrigin).toBe('12px 18px');

        controller.start({
            layer,
            element,
            useRealElementPreview: false,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 25, y: 10});
        expect(element.style.transform).toBe('');
        expect(element.style.transformOrigin).toBe('12px 18px');

        controller.cancel();

        expect(element.style.transform).toBe('');
        expect(element.style.transformOrigin).toBe('12px 18px');
        expect(element.style.width).toBe('');
        expect(element.style.height).toBe('');
    });

    it('coalesces multiple pointer moves into the latest RAF resize computation', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const controller = new ResizeController({
            requestFrame: (callback) => {
                frameCallbacks.push(callback);
                return frameCallbacks.length;
            },
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = createLayer();

        controller.start({
            layer,
            element,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });
        controller.move({x: 10, y: 10});
        controller.move({x: 40, y: 30});

        expect(frameCallbacks).toHaveLength(1);

        frameCallbacks[0](16);

        expect(element.style.transform).toBe('translate(30px, 35px) rotate(0deg) scale(1.4, 1.5)');
    });

    it('commits west handle resize with min width and step snapping', () => {
        const controller = new ResizeController({
            resizeStep: 10,
            minWidth: 40,
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        element.style.transformOrigin = '16px 24px';
        const layer = createLayer();

        controller.start({
            layer,
            element,
            handle: 'w',
            pointer: {x: 0, y: 0},
        });

        const item = controller.end({x: 73, y: 100});

        expect(item).toEqual({
            id: 'a',
            x: 70,
            y: 20,
            width: 40,
            height: 60,
        });
        expect(element.style.transform).toBe('translate(70px, 20px) rotate(0deg)');
        expect(element.style.transformOrigin).toBe('');
        expect(element.style.width).toBe('40px');
        expect(element.style.height).toBe('60px');
    });

    it('does not write or commit targets removed during an active resize session', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layerA = createLayer('a');
        const layerB = {...createLayer('b'), x: 160};
        let removed = false;

        controller.startMany({
            layers: [layerA, layerB],
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'se',
            pointer: {x: 0, y: 0},
            filterActiveTargets: (targets) => new Set(
                targets
                    .filter((target) => !(removed && target.id === 'b'))
                    .map((target) => target.id),
            ),
        });

        removed = true;
        const items = controller.end({x: 20, y: 10});

        expect(items).toEqual(expect.objectContaining({id: 'a'}));
        expect(elementA.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(elementA.style.width).not.toBe('');
        expect(elementB.style.transform).toBe('');
    });

    it('snaps resize size deltas by step instead of absolute dimensions', () => {
        const controller = new ResizeController({
            resizeStep: 10,
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = {
            ...createLayer(),
            width: 96,
            height: 53,
        };

        controller.start({
            layer,
            element,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });

        const item = controller.end({x: 14, y: 26});

        expect(item).toEqual({
            id: 'a',
            x: 10,
            y: 20,
            width: 106,
            height: 83,
        });
        expect(element.style.width).toBe('106px');
        expect(element.style.height).toBe('83px');
    });

    it('keeps aspect ratio when requested', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = createLayer();

        controller.start({
            layer,
            element,
            handle: 'se',
            pointer: {x: 0, y: 0},
        });

        const item = controller.end({x: 50, y: 5}, {keepRatio: true});

        expect(item).toEqual({
            id: 'a',
            x: 10,
            y: 20,
            width: 150,
            height: 90,
        });
    });

    it('resizes rotated layers in their local coordinate system', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = {...createLayer(), rotate: 90};

        controller.start({
            layer,
            element,
            handle: 'e',
            pointer: {x: 60, y: 50},
        });

        const item = controller.end({x: 60, y: 80});

        expect(item).toEqual({
            id: 'a',
            x: -5,
            y: 35,
            width: 130,
            height: 60,
        });
        expect(element.style.transform).toBe('translate(-5px, 35px) rotate(90deg)');
        expect(element.style.width).toBe('130px');
        expect(element.style.height).toBe('60px');
    });

    it('previews rotated resize around the layer center without changing transform origin', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = {...createLayer(), rotate: 90};

        controller.start({
            layer,
            element,
            handle: 'e',
            pointer: {x: 60, y: 50},
        });
        controller.move({x: 60, y: 80});
        controller.flush();

        expect(element.style.transform).toBe('translate(10px, 35px) rotate(90deg) scale(1.3, 1)');
        expect(element.style.transformOrigin).toBe('');
        expect(element.style.width).toBe('');
        expect(element.style.height).toBe('');
    });

    it('resizes multiple layers from their shared bounds', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a'),
            {...createLayer('b'), x: 120, width: 60},
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'e',
            pointer: {x: 180, y: 50},
        });

        const items = controller.end({x: 350, y: 50});

        expect(items).toEqual([
            {
                id: 'a',
                x: 10,
                y: 20,
                width: 200,
                height: 60,
            },
            {
                id: 'b',
                x: 230,
                y: 20,
                width: 120,
                height: 60,
            },
        ]);
        expect(elementA.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(elementA.style.width).toBe('200px');
        expect(elementB.style.transform).toBe('translate(230px, 20px) rotate(0deg)');
        expect(elementB.style.width).toBe('120px');
    });

    it('uses a preview element during multi-layer resize flush and commits real rects on end', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const previewElement = document.createElement('div');
        const layers = [
            createLayer('a'),
            {...createLayer('b'), x: 120, width: 60},
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            previewElement,
            handle: 'e',
            pointer: {x: 180, y: 50},
        });
        controller.move({x: 350, y: 50});
        controller.flush();

        expect(previewElement.style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(previewElement.style.width).toBe('340px');
        expect(previewElement.style.height).toBe('60px');
        expect(elementA.style.transform).toBe('');
        expect(elementB.style.transform).toBe('');

        const items = controller.end({x: 350, y: 50});

        expect(items).toEqual([
            {
                id: 'a',
                x: 10,
                y: 20,
                width: 200,
                height: 60,
            },
            {
                id: 'b',
                x: 230,
                y: 20,
                width: 120,
                height: 60,
            },
        ]);
        expect(previewElement.style.transform).toBe('');
        expect(previewElement.style.width).toBe('');
        expect(previewElement.style.height).toBe('');
        expect(elementA.style.width).toBe('200px');
        expect(elementB.style.width).toBe('120px');
    });

    it('keeps the right edge fixed when resizing a group from the west handle', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers: LayerBox[] = [
            {
                id: 'a',
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                rotate: 0,
            },
            {
                id: 'b',
                x: 200,
                y: 100,
                width: 100,
                height: 50,
                rotate: 0,
            },
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'w',
            pointer: {x: 0, y: 75},
        });

        const items = controller.end({x: -300, y: 75});

        expect(items).toEqual([
            {
                id: 'a',
                x: -300,
                y: 0,
                width: 200,
                height: 50,
            },
            {
                id: 'b',
                x: 100,
                y: 100,
                width: 200,
                height: 50,
            },
        ]);
    });

    it('keeps the bottom edge fixed when resizing a group from the north handle', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers: LayerBox[] = [
            {
                id: 'a',
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                rotate: 0,
            },
            {
                id: 'b',
                x: 200,
                y: 100,
                width: 100,
                height: 50,
                rotate: 0,
            },
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'n',
            pointer: {x: 150, y: 0},
        });

        const items = controller.end({x: 150, y: -150});

        expect(items).toEqual([
            {
                id: 'a',
                x: 0,
                y: -150,
                width: 100,
                height: 100,
            },
            {
                id: 'b',
                x: 200,
                y: 50,
                width: 100,
                height: 100,
            },
        ]);
    });

    it('resizes multiple layers by regular layer rects when selection bounds include rotated AABB', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers: LayerBox[] = [
            {
                id: 'a',
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                rotate: 0,
            },
            {
                id: 'b',
                x: 200,
                y: 20,
                width: 80,
                height: 40,
                rotate: 90,
            },
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'e',
            pointer: {x: 260, y: 40},
        });

        const items = controller.end({x: 520, y: 40});

        expect(items).toEqual([
            {
                id: 'a',
                x: 0,
                y: 0,
                width: 200,
                height: 50,
            },
            {
                id: 'b',
                x: 400,
                y: 20,
                width: 160,
                height: 40,
            },
        ]);
        expect(elementB.style.transform).toBe('translate(400px, 20px) rotate(90deg)');
        expect(elementB.style.width).toBe('160px');
        expect(elementB.style.height).toBe('40px');
    });

    it('resizes same-rotation groups in the rotated group coordinate system', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers: LayerBox[] = [
            {
                id: 'a',
                x: 0,
                y: 0,
                width: 100,
                height: 50,
                rotate: 90,
            },
            {
                id: 'b',
                x: 200,
                y: 20,
                width: 80,
                height: 40,
                rotate: 90,
            },
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'e',
            pointer: {x: 142.5, y: 80},
        });

        const items = controller.end({x: 142.5, y: 185});

        expect(items).toEqual([
            {
                id: 'a',
                x: -50,
                y: 50,
                width: 200,
                height: 50,
            },
            {
                id: 'b',
                x: 160,
                y: 85,
                width: 160,
                height: 40,
            },
        ]);
        expect(elementA.style.transform).toBe('translate(-50px, 50px) rotate(90deg)');
        expect(elementA.style.width).toBe('200px');
        expect(elementB.style.transform).toBe('translate(160px, 85px) rotate(90deg)');
        expect(elementB.style.width).toBe('160px');
    });

    it('does not offset children by rotated visual overflow during group resize', () => {
        const controller = new ResizeController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers: LayerBox[] = [
            {
                id: 'a',
                x: 100,
                y: 100,
                width: 100,
                height: 50,
                rotate: 45,
            },
            {
                id: 'b',
                x: 300,
                y: 100,
                width: 100,
                height: 50,
                rotate: 0,
            },
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            handle: 'e',
            pointer: {x: 400, y: 125},
        });

        const items = controller.end({x: 703.033009, y: 125});

        expect(items).toEqual([
            {
                id: 'a',
                x: 100,
                y: 100,
                width: 200,
                height: 50,
            },
            {
                id: 'b',
                x: 500,
                y: 100,
                width: 200,
                height: 50,
            },
        ]);
    });

    it('leaves business transform eligibility to the caller', () => {
        const controller = new ResizeController();
        const element = document.createElement('div');
        const layer = createLayer();

        expect(controller.start({
            layer,
            element,
            handle: 'e',
            pointer: {x: 0, y: 0},
        })).toBe(true);
    });
});
