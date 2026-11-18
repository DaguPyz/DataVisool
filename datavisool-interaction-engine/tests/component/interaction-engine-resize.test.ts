import {describe, expect, it} from 'vitest';
import {
    InteractionEngine,
    ResizeController,
    type LayerBox,
    type ResizeCommitItem,
} from '../../src/main';

function createPointerEvent(
    type: string,
    clientX: number,
    clientY: number,
    init: {shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean} = {},
) {
    const event = new Event(type, {bubbles: true, cancelable: true});

    Object.defineProperties(event, {
        button: {value: 0},
        clientX: {value: clientX},
        clientY: {value: clientY},
        pointerId: {value: 1},
        shiftKey: {value: Boolean(init.shiftKey)},
        ctrlKey: {value: Boolean(init.ctrlKey)},
        metaKey: {value: Boolean(init.metaKey)},
    });

    return event;
}

function createLayer(id: string, x: number, y: number, _order: number): LayerBox {
    return {
        id,
        x,
        y,
        width: 60,
        height: 40,
        rotate: 0,
    };
}

describe('InteractionEngine', () => {
    it('snaps resized layer edges to nearby candidate guidelines when enabled', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 95, 10, 2),
        ];
        const commits: ResizeCommitItem[] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            snapMode: 'all',
            snapThreshold: 5,
            onResizeCommit: (item) => commits.push(item),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="e"]');

        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointermove', 92, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 92, 30));

        expect(commits).toEqual([{
            id: 'a',
            x: 10,
            y: 10,
            width: 85,
            height: 40,
        }]);

        engine.destroy();
    });

    it('snaps resized layer edges to external x reference points', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
        ];
        const commits: ResizeCommitItem[] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            snapMode: 'all',
            snapThreshold: 5,
            snapReferencePoints: {x: [100]},
            onResizeCommit: (item) => commits.push(item),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="e"]');

        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointermove', 97, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 97, 30));

        expect(commits).toEqual([{
            id: 'a',
            x: 10,
            y: 10,
            width: 90,
            height: 40,
        }]);

        engine.destroy();
    });

    it('resizes the single selected unrotated layer from overlay handles', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const commits: ResizeCommitItem[] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            resizeStep: 5,
            onResizeCommit: (item) => {
                commits.push(item);
                layers[0].x = item.x;
                layers[0].y = item.y;
                layers[0].width = item.width;
                layers[0].height = item.height;
            },
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 50));
        window.dispatchEvent(createPointerEvent('pointermove', 93, 71));
        window.dispatchEvent(createPointerEvent('pointerup', 93, 71));

        expect(commits).toEqual([{
            id: 'a',
            x: 10,
            y: 10,
            width: 85,
            height: 60,
        }]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(elementA.style.width).toBe('85px');
        expect(elementA.style.height).toBe('60px');

        engine.destroy();
    });

    it('uses the overlay box for single resize preview when the real element has non-default transform origin', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        elementA.style.transformOrigin = '12px 18px';
        const layers = [createLayer('a', 10, 10, 1)];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
        }, {
            resizeController: new ResizeController({
                requestFrame: (callback) => {
                    callback(16);
                    return 1;
                },
                cancelFrame: () => undefined,
            }),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 50));
        window.dispatchEvent(createPointerEvent('pointermove', 93, 71));

        expect(box?.style.display).toBe('block');
        expect(box?.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(box?.style.width).toBe('83px');
        expect(box?.style.height).toBe('61px');
        expect(elementA.style.transform).toBe('');
        expect(elementA.style.transformOrigin).toBe('12px 18px');

        window.dispatchEvent(createPointerEvent('pointerup', 93, 71));

        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(elementA.style.transformOrigin).toBe('');

        engine.destroy();
    });

    it('does not fall back to real-element resize preview for non-default transform origin', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        elementA.style.transformOrigin = '12px 18px';
        const layers = [createLayer('a', 10, 10, 1)];
        const commits: ResizeCommitItem[] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onResizeCommit: (item) => commits.push(item),
        }, {
            resizeController: new ResizeController({
                requestFrame: (callback) => {
                    callback(16);
                    return 1;
                },
                cancelFrame: () => undefined,
            }),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 50));
        window.dispatchEvent(createPointerEvent('pointermove', 93, 71));

        expect(elementA.style.transform).toBe('');
        expect(elementA.style.transformOrigin).toBe('12px 18px');

        window.dispatchEvent(createPointerEvent('pointerup', 93, 71));

        expect(commits).toEqual([{
            id: 'a',
            x: 10,
            y: 10,
            width: 83,
            height: 61,
        }]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(elementA.style.transformOrigin).toBe('');

        engine.destroy();
    });

    it('keeps the preview box visible and hides handles while resizing selected layers', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
        }, {
            resizeController: new ResizeController({
                requestFrame: (callback) => {
                    callback(16);
                    return 1;
                },
                cancelFrame: () => undefined,
            }),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        expect(box?.style.display).toBe('block');
        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 50));

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('none');
        expect(elementA.style.transform).toBe('');

        window.dispatchEvent(createPointerEvent('pointermove', 90, 70));
        expect(box?.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(box?.style.width).toBe('80px');
        expect(box?.style.height).toBe('60px');
        expect(elementA.style.transform).toBe('');

        window.dispatchEvent(createPointerEvent('pointerup', 90, 70));

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('block');
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');

        engine.destroy();
    });

    it('keeps aspect ratio during resize when command is held', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const commits: ResizeCommitItem[] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onResizeCommit: (item) => commits.push(item),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 50, {metaKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 130, 55, {metaKey: true}));

        expect(commits).toEqual([{
            id: 'a',
            x: 10,
            y: 10,
            width: 120,
            height: 80,
        }]);

        engine.destroy();
    });

    it('renders transform handles around multi-selection bounds', () => {
        const container = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 400,
            bottom: 300,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: () => document.createElement('div'),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const resizeHandle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');
        const rotateHandle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(box?.style.display).toBe('block');
        expect(box?.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(box?.style.width).toBe('170px');
        expect(box?.style.height).toBe('40px');
        expect(resizeHandle?.style.display).toBe('block');
        expect(rotateHandle?.style.display).toBe('block');

        engine.destroy();
    });

    it('renders rotated transform handles when multi-selected layers share a rotation', () => {
        const container = document.createElement('div');
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

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 600,
            bottom: 300,
            width: 600,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: () => document.createElement('div'),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(box?.style.transform).toBe('translate(90px, -90px) rotate(90deg)');
        expect(box?.style.width).toBe('105px');
        expect(box?.style.height).toBe('235px');

        engine.destroy();
    });

    it('resizes multi-selected layers from the shared bounds handles', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const commits: ResizeCommitItem[][] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 500,
            bottom: 300,
            width: 500,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => id === 'a' ? elementA : id === 'b' ? elementB : null,
            onResizeBatchCommit: (items) => commits.push(items),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 180, 50));
        window.dispatchEvent(createPointerEvent('pointerup', 350, 90));

        expect(commits).toEqual([[
            {
                id: 'a',
                x: 10,
                y: 10,
                width: 120,
                height: 80,
            },
            {
                id: 'b',
                x: 230,
                y: 10,
                width: 120,
                height: 80,
            },
        ]]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(elementA.style.width).toBe('120px');
        expect(elementB.style.transform).toBe('translate(230px, 10px) rotate(0deg)');
        expect(elementB.style.width).toBe('120px');

        engine.destroy();
    });

    it('uses the overlay box when any resized group layer has non-default transform origin', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        elementB.style.transformOrigin = '12px 18px';
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const commits: ResizeCommitItem[][] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 500,
            bottom: 300,
            width: 500,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => id === 'a' ? elementA : id === 'b' ? elementB : null,
            onResizeBatchCommit: (items) => commits.push(items),
        }, {
            resizeController: new ResizeController({
                requestFrame: (callback) => {
                    callback(16);
                    return 1;
                },
                cancelFrame: () => undefined,
            }),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 180, 50));
        window.dispatchEvent(createPointerEvent('pointermove', 350, 90));

        expect(box?.style.display).toBe('block');
        expect(box?.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(box?.style.width).toBe('340px');
        expect(box?.style.height).toBe('80px');
        expect(elementA.style.transform).toBe('');
        expect(elementB.style.transform).toBe('');
        expect(elementB.style.transformOrigin).toBe('12px 18px');

        window.dispatchEvent(createPointerEvent('pointerup', 350, 90));

        expect(commits).toEqual([[
            {
                id: 'a',
                x: 10,
                y: 10,
                width: 120,
                height: 80,
            },
            {
                id: 'b',
                x: 230,
                y: 10,
                width: 120,
                height: 80,
            },
        ]]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(elementB.style.transform).toBe('translate(230px, 10px) rotate(0deg)');
        expect(elementB.style.transformOrigin).toBe('');

        engine.destroy();
    });

    it('does not fall back to real-element group resize preview when a selected layer has non-default transform origin', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        elementB.style.transformOrigin = '12px 18px';
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const commits: ResizeCommitItem[][] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 500,
            bottom: 300,
            width: 500,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => id === 'a' ? elementA : id === 'b' ? elementB : null,
            onResizeBatchCommit: (items) => commits.push(items),
        }, {
            resizeController: new ResizeController({
                requestFrame: (callback) => {
                    callback(16);
                    return 1;
                },
                cancelFrame: () => undefined,
            }),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 180, 50));
        window.dispatchEvent(createPointerEvent('pointermove', 350, 90));

        expect(elementA.style.transform).toBe('');
        expect(elementB.style.transform).toBe('');
        expect(elementB.style.transformOrigin).toBe('12px 18px');

        window.dispatchEvent(createPointerEvent('pointerup', 350, 90));

        expect(commits).toEqual([[
            {
                id: 'a',
                x: 10,
                y: 10,
                width: 120,
                height: 80,
            },
            {
                id: 'b',
                x: 230,
                y: 10,
                width: 120,
                height: 80,
            },
        ]]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(0deg)');
        expect(elementB.style.transform).toBe('translate(230px, 10px) rotate(0deg)');
        expect(elementB.style.transformOrigin).toBe('');

        engine.destroy();
    });

    it('resizes multi-selected layers by regular layer rects when overlay uses rotated AABB', () => {
        const container = document.createElement('div');
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
        const commits: ResizeCommitItem[][] = [];

        container.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 600,
            bottom: 300,
            width: 600,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => id === 'a' ? elementA : id === 'b' ? elementB : null,
            onResizeBatchCommit: (items) => commits.push(items),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="e"]');

        expect(box?.style.transform).toBe('translate(0px, 0px) rotate(0deg)');
        expect(box?.style.width).toBe('260px');
        expect(box?.style.height).toBe('80px');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 260, 40));
        window.dispatchEvent(createPointerEvent('pointerup', 520, 40));

        expect(commits).toEqual([[
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
        ]]);
        expect(elementB.style.transform).toBe('translate(400px, 20px) rotate(90deg)');
        expect(elementB.style.width).toBe('160px');
        expect(elementB.style.height).toBe('40px');

        engine.destroy();
    });

});
