import {describe, expect, it, vi} from 'vitest';
import {
    DragController,
    InteractionEngine,
    type DragCommitItem,
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
    it('drags selected ids when pointerdown hits one selected layer', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const elements = new Map([
            ['a', elementA],
            ['b', elementB],
        ]);
        const commits: DragCommitItem[][] = [];
        const onSelect = vi.fn();

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
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => elements.get(id) ?? null,
            onSelect,
            onDragEnd: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 30, 45));
        window.dispatchEvent(createPointerEvent('pointerup', 30, 45));

        expect(onSelect).not.toHaveBeenCalled();
        expect(commits).toEqual([
            [
                {id: 'a', x: 20, y: 35},
                {id: 'b', x: 130, y: 35},
            ],
        ]);
        expect(elementA.style.transform).toBe('translate(20px, 35px) rotate(0deg)');
        expect(elementB.style.transform).toBe('translate(130px, 35px) rotate(0deg)');

        engine.destroy();
    });

    it('does not commit a selected layer that is deleted during an active drag session', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const elements = new Map([
            ['a', elementA],
            ['b', elementB],
        ]);
        const commits: DragCommitItem[][] = [];

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
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a', 'b'],
            getElementById: (id) => elements.get(id) ?? null,
            onDragEnd: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        layers.splice(1, 1);
        elements.delete('b');
        window.dispatchEvent(createPointerEvent('pointermove', 30, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 30, 30));

        expect(commits).toEqual([[{id: 'a', x: 20, y: 20}]]);
        expect(elementA.style.transform).toBe('translate(20px, 20px) rotate(0deg)');
        expect(elementB.style.transform).toBe('');

        engine.destroy();
    });

    it('prefers onDragEnd over the deprecated onDragCommit callback', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const onDragEnd = vi.fn();
        const onDragCommit = vi.fn();

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
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onDragEnd,
            onDragCommit,
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 30, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 30, 30));

        expect(onDragEnd).toHaveBeenCalledWith([{id: 'a', x: 20, y: 20}]);
        expect(onDragCommit).not.toHaveBeenCalled();

        engine.destroy();
    });

    it('keeps the hit-test index in sync after drag commit without caller layer version churn', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        let selectedIds = ['a'];
        const selected: string[][] = [];

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
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getLayerIndexVersion: () => 1,
            getSelectedIds: () => selectedIds,
            getElementById: (id) => id === 'a' ? elementA : null,
            onSelect: (ids) => {
                selectedIds = ids;
                selected.push(ids);
            },
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 230, 130));
        window.dispatchEvent(createPointerEvent('pointerup', 230, 130));

        selectedIds = [];
        container.dispatchEvent(createPointerEvent('pointerdown', 240, 140));

        expect(selected).toEqual([['a']]);

        engine.destroy();
    });

    it('uses committed engine geometry for resize immediately after rotate', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const rotates: RotateCommitItem[] = [];
        const resizes: ResizeCommitItem[] = [];

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
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getLayerIndexVersion: () => 1,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onRotateCommit: (item) => rotates.push(item),
            onResizeCommit: (item) => resizes.push(item),
        });

        engine.mount();

        const rotateHandle = container.querySelector<HTMLElement>('.datavisool-interaction-rotate-handle')!;
        rotateHandle.dispatchEvent(createPointerEvent('pointerdown', 40, 0));
        window.dispatchEvent(createPointerEvent('pointermove', 70, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 70, 30));

        const eastHandle = container.querySelector<HTMLElement>('.datavisool-interaction-resize-handle--e')!;
        eastHandle.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointermove', 70, 60));
        window.dispatchEvent(createPointerEvent('pointerup', 70, 60));

        expect(rotates).toEqual([{id: 'a', rotate: 90}]);
        expect(resizes).toEqual([{
            id: 'a',
            x: -5,
            y: 25,
            width: 90,
            height: 40,
        }]);

        engine.destroy();
    });

    it('keeps the preview box visible and hides handles while dragging selected layers', () => {
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
            dragController: new DragController({
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
        const rotateHandle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('block');
        expect(rotateHandle?.style.display).toBe('block');

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('none');
        expect(rotateHandle?.style.display).toBe('none');
        expect(elementA.style.transform).toBe('');

        engine.refreshResizeOverlay();
        expect(handle?.style.display).toBe('none');
        expect(rotateHandle?.style.display).toBe('none');

        window.dispatchEvent(createPointerEvent('pointermove', 40, 40));
        expect(box?.style.transform).toBe('translate(30px, 30px) rotate(0deg)');
        expect(elementA.style.transform).toBe('');

        window.dispatchEvent(createPointerEvent('pointerup', 40, 40));

        expect(box?.style.display).toBe('block');
        expect(handle?.style.display).toBe('block');
        expect(rotateHandle?.style.display).toBe('block');
        expect(elementA.style.transform).toBe('translate(30px, 30px) rotate(0deg)');

        engine.destroy();
    });

    it('renders the idle transform overlay from enabled feature switches', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        let enabledFeatures = {
            drag: true,
            resize: false,
            rotate: false,
        };

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            getEnabledFeatures: () => enabledFeatures,
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const resizeHandle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');
        const rotateHandle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(box?.style.display).toBe('block');
        expect(resizeHandle?.style.display).toBe('none');
        expect(rotateHandle?.style.display).toBe('none');

        enabledFeatures = {
            drag: false,
            resize: true,
            rotate: false,
        };
        engine.refreshResizeOverlay();

        expect(box?.style.display).toBe('block');
        expect(resizeHandle?.style.display).toBe('block');
        expect(rotateHandle?.style.display).toBe('none');

        enabledFeatures = {
            drag: false,
            resize: false,
            rotate: true,
        };
        engine.refreshResizeOverlay();

        expect(box?.style.display).toBe('block');
        expect(resizeHandle?.style.display).toBe('none');
        expect(rotateHandle?.style.display).toBe('block');

        enabledFeatures = {
            drag: false,
            resize: false,
            rotate: false,
        };
        engine.refreshResizeOverlay();

        expect(box?.style.display).toBe('none');

        engine.destroy();
    });

    it('does not start drag sessions when the drag feature is disabled', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const selected: string[][] = [];
        const commits: DragCommitItem[][] = [];
        let selectedIds: string[] = [];

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
            getSelectedIds: () => selectedIds,
            getElementById: (id) => id === 'a' ? elementA : null,
            enabledFeatures: {
                drag: false,
                resize: true,
                rotate: true,
            },
            onSelect: (ids) => {
                selectedIds = ids;
                selected.push(ids);
            },
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 60, 70));
        window.dispatchEvent(createPointerEvent('pointerup', 60, 70));

        expect(selected).toEqual([['a']]);
        expect(commits).toEqual([]);
        expect(elementA.style.transform).toBe('');

        engine.destroy();
    });

    it('does not start resize or rotate sessions when those features are disabled', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const resizes: ResizeCommitItem[] = [];
        const rotates: RotateCommitItem[] = [];

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
            enabledFeatures: {
                drag: false,
                resize: false,
                rotate: false,
            },
            onResizeCommit: (item) => resizes.push(item),
            onRotateCommit: (item) => rotates.push(item),
        });

        engine.mount();

        const resizeHandle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="e"]')!;
        const rotateHandle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]')!;

        resizeHandle.dispatchEvent(createPointerEvent('pointerdown', 70, 30));
        window.dispatchEvent(createPointerEvent('pointermove', 90, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 90, 30));
        rotateHandle.dispatchEvent(createPointerEvent('pointerdown', 40, 0));
        window.dispatchEvent(createPointerEvent('pointermove', 70, 30));
        window.dispatchEvent(createPointerEvent('pointerup', 70, 30));

        expect(resizes).toEqual([]);
        expect(rotates).toEqual([]);

        engine.destroy();
    });

    it('restores idle resize handles after pointercancel during drag preview', () => {
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
        });

        engine.mount();

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');
        const rotateHandle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        expect(handle?.style.display).toBe('none');
        expect(rotateHandle?.style.display).toBe('none');

        window.dispatchEvent(createPointerEvent('pointercancel', 20, 20));
        expect(handle?.style.display).toBe('block');
        expect(rotateHandle?.style.display).toBe('block');

        engine.destroy();
    });

    it('uses dynamic drag step configuration when starting drag sessions', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 13, 27, 1)];
        const commits: DragCommitItem[][] = [];
        let dragStep = 10;

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
            getDragStep: () => dragStep,
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 30));
        window.dispatchEvent(createPointerEvent('pointermove', 34, 56));
        window.dispatchEvent(createPointerEvent('pointerup', 34, 56));

        expect(commits).toEqual([[{id: 'a', x: 23, y: 57}]]);
        expect(elementA.style.transform).toBe('translate(23px, 57px) rotate(0deg)');

        commits.length = 0;
        layers[0].x = 23;
        layers[0].y = 57;
        dragStep = 20;

        container.dispatchEvent(createPointerEvent('pointerdown', 30, 60));
        window.dispatchEvent(createPointerEvent('pointermove', 39, 71));
        window.dispatchEvent(createPointerEvent('pointerup', 39, 71));

        expect(commits).toEqual([[{id: 'a', x: 23, y: 77}]]);

        engine.destroy();
    });

    it('applies external layer geometry patches without committing business callbacks', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 20, 1)];
        const onDragCommit = vi.fn();
        const onResizeCommit = vi.fn();
        const onRotateCommit = vi.fn();

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onDragCommit,
            onResizeCommit,
            onRotateCommit,
        });

        engine.mount();

        const writeCount = engine.applyLayerGeometry([{
            id: 'a',
            x: 44,
            y: 55,
            width: 70,
            height: 90,
            rotate: 15,
        }]);
        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(writeCount).toBe(3);
        expect(elementA.style.transform).toBe('translate(44px, 55px) rotate(15deg)');
        expect(elementA.style.width).toBe('70px');
        expect(elementA.style.height).toBe('90px');
        expect(box?.style.transform).toBe('translate(44px, 55px) rotate(15deg)');
        expect(box?.style.width).toBe('70px');
        expect(box?.style.height).toBe('90px');
        expect(layers[0]).toEqual(createLayer('a', 10, 20, 1));
        expect(onDragCommit).not.toHaveBeenCalled();
        expect(onResizeCommit).not.toHaveBeenCalled();
        expect(onRotateCommit).not.toHaveBeenCalled();

        engine.destroy();
    });

    it('keeps existing position and size when geometry patches only include rotate', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 20, 1)];
        const commits: ResizeCommitItem[] = [];

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onResizeCommit: (item) => commits.push(item),
        });

        engine.mount();
        engine.rebuildLayerIndex(layers);

        const writeCount = engine.applyLayerGeometry([{
            id: 'a',
            x: undefined,
            y: undefined,
            rotate: 35,
        }]);
        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(writeCount).toBe(3);
        expect(elementA.style.transform).toBe('translate(10px, 20px) rotate(35deg)');
        expect(elementA.style.width).toBe('60px');
        expect(elementA.style.height).toBe('40px');
        expect(box?.style.transform).toBe('translate(10px, 20px) rotate(35deg)');
        expect(box?.style.width).toBe('60px');
        expect(box?.style.height).toBe('40px');

        const resizeHandle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="e"]')!;
        resizeHandle.dispatchEvent(createPointerEvent('pointerdown', 70, 40));
        window.dispatchEvent(createPointerEvent('pointerup', 90, 40));

        expect(commits[0]).toMatchObject({
            id: 'a',
        });
        expect(Number.isFinite(commits[0].x)).toBe(true);
        expect(Number.isFinite(commits[0].y)).toBe(true);

        engine.destroy();
    });

    it('ignores missing direct layer lookups during geometry refresh', () => {
        const container = document.createElement('div');
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => [],
            getLayerById: () => null,
            getSelectedIds: () => ['missing'],
            getElementById: () => null,
        });

        engine.mount();

        expect(() => {
            engine.refreshLayerGeometry(['missing']);
            engine.applyLayerGeometry([{id: 'missing', rotate: 45}]);
        }).not.toThrow();

        engine.destroy();
    });

    it('refreshes DOM geometry from the caller-owned layer data', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 10, 20, 1),
            createLayer('b', 80, 90, 2),
        ];

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : id === 'b' ? elementB : null,
        });

        engine.mount();

        layers[0] = {
            ...layers[0],
            x: 24,
            y: 36,
            width: 88,
            height: 99,
            rotate: 30,
        };
        layers[1] = {
            ...layers[1],
            x: 120,
        };

        const writeCount = engine.refreshLayerGeometry(['a']);
        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(writeCount).toBe(3);
        expect(elementA.style.transform).toBe('translate(24px, 36px) rotate(30deg)');
        expect(elementA.style.width).toBe('88px');
        expect(elementA.style.height).toBe('99px');
        expect(elementB.style.transform).toBe('');
        expect(box?.style.transform).toBe('translate(24px, 36px) rotate(30deg)');

        engine.destroy();
    });

    it('refreshes the selected layer outline from dynamic style options', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 20, 1)];
        let outlineStyle = {
            color: 'rgb(255, 0, 170)',
            width: 2,
            radius: 6,
        };

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            getSelectedOutlineStyle: () => outlineStyle,
        });

        engine.mount();

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(box?.style.borderColor).toBe('rgb(255, 0, 170)');
        expect(box?.style.borderWidth).toBe('2px');
        expect(box?.style.borderRadius).toBe('6px');

        outlineStyle = {
            color: 'rgb(17, 170, 102)',
            width: 4,
            radius: 12,
        };
        engine.refreshResizeOverlay();

        expect(box?.style.borderColor).toBe('rgb(17, 170, 102)');
        expect(box?.style.borderWidth).toBe('4px');
        expect(box?.style.borderRadius).toBe('12px');

        engine.destroy();
    });

    it('selects and drags only the hit layer when it is not selected', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const elements = new Map([
            ['a', elementA],
            ['b', elementB],
        ]);
        const selected: string[][] = [];
        const commits: DragCommitItem[][] = [];

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
            getElementById: (id) => elements.get(id) ?? null,
            onSelect: (ids) => selected.push(ids),
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 130, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 160, 50));
        window.dispatchEvent(createPointerEvent('pointerup', 160, 50));

        expect(selected).toEqual([['b']]);
        expect(commits).toEqual([[{id: 'b', x: 150, y: 40}]]);
        expect(elementA.style.transform).toBe('');
        expect(elementB.style.transform).toBe('translate(150px, 40px) rotate(0deg)');

        engine.destroy();
    });

    it('uses caller strategies for hit order and transform eligibility', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const elementB = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 10, 10, 2),
        ];
        const elements = new Map([
            ['a', elementA],
            ['b', elementB],
        ]);
        const commits: DragCommitItem[][] = [];

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
            getElementById: (id) => elements.get(id) ?? null,
            resolveHitTarget: ({candidates}) => candidates.find((candidate) => candidate.id === 'a')?.id ?? null,
            resolveTransformTargetIds: ({selectedIds}) => selectedIds.filter((id) => id !== 'b'),
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 50, 60));

        expect(commits).toEqual([[{id: 'a', x: 40, y: 50}]]);
        expect(elementA.style.transform).toBe('translate(40px, 50px) rotate(0deg)');
        expect(elementB.style.transform).toBe('');

        engine.destroy();
    });

    it('treats a null hit strategy result as no hit', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const selected: string[][] = [];
        const commits: DragCommitItem[][] = [];

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
            resolveHitTarget: () => null,
            onSelect: (ids) => selected.push(ids),
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 20, 20));

        expect(selected).toEqual([[]]);
        expect(commits).toEqual([]);
        expect(elementA.style.transform).toBe('');

        engine.destroy();
    });

});
