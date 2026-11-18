import {describe, expect, it} from 'vitest';
import {
    InteractionEngine,
    RotateController,
    type LayerBox,
    type ResizeCommitItem,
    type RotateCommitItem,
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
    it('rotates the single selected layer from the rotate handle', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const commits: RotateCommitItem[] = [];

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
            onRotateCommit: (item) => {
                commits.push(item);
                layers[0].rotate = item.rotate;
            },
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointermove', 40, 60));
        window.dispatchEvent(createPointerEvent('pointerup', 40, 60));

        expect(commits).toEqual([{
            id: 'a',
            rotate: 90,
        }]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(90deg)');

        engine.destroy();
    });

    it('keeps the preview box visible and hides handles while rotating selected layers', () => {
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
            rotateController: new RotateController({
                requestFrame: (callback) => {
                    callback(16);
                    return 1;
                },
                cancelFrame: () => undefined,
            }),
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const handle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(box?.style.display).toBe('block');
        expect(handle).not.toBeNull();

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30));

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('none');
        expect(elementA.style.transform).toBe('');

        window.dispatchEvent(createPointerEvent('pointermove', 40, 60));
        expect(box?.style.transform).toBe('translate(10px, 10px) rotate(90deg)');
        expect(elementA.style.transform).toBe('');

        window.dispatchEvent(createPointerEvent('pointerup', 40, 60));

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('block');
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(90deg)');

        engine.destroy();
    });

    it('rotates multi-selected layers around the shared bounds center', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 0, 0, 1),
            createLayer('b', 120, 0, 2),
        ];
        const commits: RotateCommitItem[][] = [];

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
            onRotateBatchCommit: (items) => commits.push(items),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 180, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 90, 110));

        expect(commits).toEqual([[
            {
                id: 'a',
                x: 60,
                y: -60,
                rotate: 90,
            },
            {
                id: 'b',
                x: 60,
                y: 60,
                rotate: 90,
            },
        ]]);
        expect(elementA.style.transform).toBe('translate(60px, -60px) rotate(90deg)');
        expect(elementB.style.transform).toBe('translate(60px, 60px) rotate(90deg)');

        engine.destroy();
    });

    it('snaps rotation angle when shift is held', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const commits: RotateCommitItem[] = [];

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
            rotateSnapStep: 45,
            onRotateCommit: (item) => commits.push(item),
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 60, 50, {shiftKey: true}));

        expect(commits).toEqual([{
            id: 'a',
            rotate: 45,
        }]);

        engine.destroy();
    });

    it('can hit-test and rotate a layer again after it has already been rotated', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [{...createLayer('a', 10, 10, 1), rotate: 45}];
        const selected: string[][] = [];
        const commits: RotateCommitItem[] = [];

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
            onSelect: (ids) => selected.push(ids),
            onRotateCommit: (item) => commits.push(item),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 40, 5));
        window.dispatchEvent(createPointerEvent('pointerup', 40, 5));

        expect(selected).toEqual([]);

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const resizeHandle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');
        const handle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(box?.style.display).toBe('block');
        expect(box?.style.transform).toBe('translate(10px, 10px) rotate(45deg)');
        expect(resizeHandle?.style.display).toBe('block');
        expect(handle).not.toBeNull();
        expect(handle?.style.display).toBe('block');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 40, 60));

        expect(commits).toEqual([{
            id: 'a',
            rotate: 135,
        }]);
        expect(elementA.style.transform).toBe('translate(10px, 10px) rotate(135deg)');

        engine.destroy();
    });

    it('can resize a layer after it has already been rotated', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [{...createLayer('a', 10, 10, 1), rotate: 90}];
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

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="e"]');

        expect(handle).not.toBeNull();
        expect(handle?.style.display).toBe('block');

        handle!.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 70, 60));

        expect(commits).toEqual([{
            id: 'a',
            x: -5,
            y: 25,
            width: 90,
            height: 40,
        }]);
        expect(elementA.style.transform).toBe('translate(-5px, 25px) rotate(90deg)');
        expect(elementA.style.width).toBe('90px');
        expect(elementA.style.height).toBe('40px');

        engine.destroy();
    });
});
