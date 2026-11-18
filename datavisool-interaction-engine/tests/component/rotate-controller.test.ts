/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {RotateController, type LayerBox} from '../../src/main';

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

describe('RotateController', () => {
    it('writes rotation through one RAF flush', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const controller = new RotateController({
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
            pointer: {x: 110, y: 50},
        });
        controller.move({x: 60, y: 100});

        expect(element.style.transform).toBe('');
        expect(frameCallbacks).toHaveLength(1);

        frameCallbacks[0](16);

        expect(element.style.transform).toBe('translate(10px, 20px) rotate(90deg)');
        expect(controller.getPerfSnapshot().frameFlushes).toBe(1);
        expect(controller.getPerfSnapshot().domWrites).toBe(1);
    });

    it('coalesces multiple pointer moves into the latest RAF rotate computation', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const controller = new RotateController({
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
            pointer: {x: 110, y: 50},
        });
        controller.move({x: 100, y: 80});
        controller.move({x: 60, y: 100});

        expect(frameCallbacks).toHaveLength(1);

        frameCallbacks[0](16);

        expect(element.style.transform).toBe('translate(10px, 20px) rotate(90deg)');
    });

    it('commits snapped rotation when requested', () => {
        const controller = new RotateController({
            snapStep: 45,
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = createLayer();

        controller.start({
            layer,
            element,
            pointer: {x: 110, y: 50},
        });

        const item = controller.end({x: 100, y: 80}, {snapAngle: true});

        expect(item).toEqual({
            id: 'a',
            rotate: 45,
        });
        expect(element.style.transform).toBe('translate(10px, 20px) rotate(45deg)');
    });

    it('keeps x and y unchanged when rotating from an existing angle', () => {
        const controller = new RotateController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const element = document.createElement('div');
        const layer = {...createLayer(), rotate: 350};

        controller.start({
            layer,
            element,
            pointer: {x: 110, y: 50},
        });

        const item = controller.end({x: 60, y: 100});

        expect(item).toEqual({
            id: 'a',
            rotate: 80,
        });
        expect(element.style.transform).toBe('translate(10px, 20px) rotate(80deg)');
    });

    it('rotates multiple layers around their shared bounds center', () => {
        const controller = new RotateController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            {...createLayer('a'), x: 0, y: 0, width: 20, height: 20},
            {...createLayer('b'), x: 40, y: 0, width: 20, height: 20},
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            pointer: {x: 60, y: 10},
        });

        const items = controller.end({x: 30, y: 40});

        expect(items).toEqual([
            {
                id: 'a',
                x: 20,
                y: -20,
                rotate: 90,
            },
            {
                id: 'b',
                x: 20,
                y: 20,
                rotate: 90,
            },
        ]);
        expect(elementA.style.transform).toBe('translate(20px, -20px) rotate(90deg)');
        expect(elementB.style.transform).toBe('translate(20px, 20px) rotate(90deg)');
    });

    it('does not write or commit targets removed during an active rotate session', () => {
        const controller = new RotateController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layerA = {...createLayer('a'), x: 0, y: 0, width: 20, height: 20};
        const layerB = {...createLayer('b'), x: 40, y: 0, width: 20, height: 20};
        let removed = false;

        controller.startMany({
            layers: [layerA, layerB],
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            pointer: {x: 60, y: 10},
            filterActiveTargets: (targets) => new Set(
                targets
                    .filter((target) => !(removed && target.id === 'b'))
                    .map((target) => target.id),
            ),
        });

        removed = true;
        const items = controller.end({x: 30, y: 40});

        expect(items).toEqual(expect.objectContaining({id: 'a', rotate: 90}));
        expect(elementA.style.transform).toBe('translate(20px, -20px) rotate(90deg)');
        expect(elementB.style.transform).toBe('');
    });

    it('uses a preview element during multi-layer rotate flush and commits real boxes on end', () => {
        const controller = new RotateController({
            requestFrame: () => 1,
            cancelFrame: () => undefined,
        });
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const previewElement = document.createElement('div');
        const layers = [
            {...createLayer('a'), x: 0, y: 0, width: 20, height: 20},
            {...createLayer('b'), x: 40, y: 0, width: 20, height: 20},
        ];

        controller.startMany({
            layers,
            elements: new Map([
                ['a', elementA],
                ['b', elementB],
            ]),
            previewElement,
            pointer: {x: 60, y: 10},
        });
        controller.move({x: 30, y: 40});
        controller.flush();

        expect(previewElement.style.transform).toBe('translate(0px, 0px) rotate(90deg)');
        expect(elementA.style.transform).toBe('');
        expect(elementB.style.transform).toBe('');

        const items = controller.end({x: 30, y: 40});

        expect(items).toEqual([
            {
                id: 'a',
                x: 20,
                y: -20,
                rotate: 90,
            },
            {
                id: 'b',
                x: 20,
                y: 20,
                rotate: 90,
            },
        ]);
        expect(previewElement.style.transform).toBe('');
        expect(elementA.style.transform).toBe('translate(20px, -20px) rotate(90deg)');
        expect(elementB.style.transform).toBe('translate(20px, 20px) rotate(90deg)');
    });

    it('leaves business transform eligibility to the caller', () => {
        const controller = new RotateController();
        const element = document.createElement('div');
        const layer = createLayer();

        expect(controller.start({
            layer,
            element,
            pointer: {x: 110, y: 50},
        })).toBe(true);
    });
});
