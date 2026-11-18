import {describe, expect, it, vi} from 'vitest';
import {
    InteractionEngine,
    type DragCommitItem,
    type LayerBox,
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
    it('preserves native click events for hit layers until a drag actually moves', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const commits: DragCommitItem[][] = [];
        container.setPointerCapture = vi.fn();
        container.releasePointerCapture = vi.fn();

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
            onDragEnd: (items) => commits.push(items),
        });

        engine.mount();

        const clickPointerDown = createPointerEvent('pointerdown', 20, 20);
        const clickPointerUp = createPointerEvent('pointerup', 20, 20);

        container.dispatchEvent(clickPointerDown);
        window.dispatchEvent(clickPointerUp);

        expect(clickPointerDown.defaultPrevented).toBe(false);
        expect(clickPointerUp.defaultPrevented).toBe(false);
        expect(container.setPointerCapture).not.toHaveBeenCalled();
        expect(commits).toEqual([]);

        const dragPointerDown = createPointerEvent('pointerdown', 20, 20);
        const dragPointerMove = createPointerEvent('pointermove', 40, 45);
        const dragPointerUp = createPointerEvent('pointerup', 40, 45);

        container.dispatchEvent(dragPointerDown);
        window.dispatchEvent(dragPointerMove);
        window.dispatchEvent(dragPointerUp);

        expect(dragPointerDown.defaultPrevented).toBe(false);
        expect(dragPointerMove.defaultPrevented).toBe(true);
        expect(dragPointerUp.defaultPrevented).toBe(true);
        expect(container.setPointerCapture).toHaveBeenCalledTimes(1);
        expect(container.setPointerCapture).toHaveBeenCalledWith(1);
        expect(commits).toEqual([[{id: 'a', x: 30, y: 35}]]);

        engine.destroy();
    });

    it('uses resolved selection ids as default transform targets', () => {
        const container = document.createElement('div');
        const childElement = document.createElement('div');
        const groupElement = document.createElement('div');
        const layers = [
            createLayer('child', 10, 10, 1),
            createLayer('group', 100, 10, 2),
        ];
        const elements = new Map([
            ['child', childElement],
            ['group', groupElement],
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
            getSelectedIds: () => [],
            getElementById: (id) => elements.get(id) ?? null,
            resolveHitTarget: ({candidates}) => candidates.find((candidate) => candidate.id === 'child')?.id ?? null,
            resolveSelectionIds: ({hitId}) => hitId === 'child' ? ['group'] : [],
            onSelect: (ids) => selected.push(ids),
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 50, 60));

        expect(selected).toEqual([['group']]);
        expect(commits).toEqual([[{id: 'group', x: 130, y: 50}]]);
        expect(childElement.style.transform).toBe('');
        expect(groupElement.style.transform).toBe('translate(130px, 50px) rotate(0deg)');

        engine.destroy();
    });

    it('does not reset a normal drag when lostpointercapture fires before pointerup', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
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
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 60, 70));
        container.dispatchEvent(createPointerEvent('lostpointercapture', 60, 70));
        window.dispatchEvent(createPointerEvent('pointerup', 60, 70));

        expect(commits).toEqual([[{id: 'a', x: 50, y: 60}]]);
        expect(elementA.style.transform).toBe('translate(50px, 60px) rotate(0deg)');

        engine.destroy();
    });

    it('clears selection when blank canvas is clicked without dragging', () => {
        const container = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const selected: string[][] = [];

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
            getElementById: () => null,
            onSelect: (ids) => selected.push(ids),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 250, 250));
        window.dispatchEvent(createPointerEvent('pointerup', 250, 250));

        expect(selected).toEqual([[]]);

        engine.destroy();
    });

    it('box-selects layers from the spatial index on pointerup', () => {
        const container = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
            createLayer('c', 300, 10, 3),
        ];
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

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => [],
            getElementById: () => null,
            onSelect: (ids) => selected.push(ids),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 0, 0));
        window.dispatchEvent(createPointerEvent('pointermove', 220, 80));
        window.dispatchEvent(createPointerEvent('pointerup', 220, 80));

        expect(selected).toEqual([['a', 'b']]);

        engine.destroy();
    });

    it('starts box selection from a wider event container using canvas coordinates', () => {
        const eventContainer = document.createElement('div');
        const container = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
        const selected: string[][] = [];

        eventContainer.append(container);
        eventContainer.setPointerCapture = vi.fn();
        eventContainer.releasePointerCapture = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 100,
            y: 50,
            left: 100,
            top: 50,
            right: 500,
            bottom: 350,
            width: 400,
            height: 300,
            toJSON: () => undefined,
        });

        const engine = new InteractionEngine({
            container,
            eventContainer,
            coordinateContainer: container,
            overlayContainer: container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => [],
            getElementById: () => null,
            onSelect: (ids) => selected.push(ids),
        });

        engine.mount();

        eventContainer.dispatchEvent(createPointerEvent('pointerdown', 90, 40));
        window.dispatchEvent(createPointerEvent('pointermove', 180, 110));
        window.dispatchEvent(createPointerEvent('pointerup', 180, 110));

        expect(selected).toEqual([['a']]);
        expect(eventContainer.setPointerCapture).toHaveBeenCalledWith(1);
        expect(container.querySelector('.datavisool-interaction-selection-box')).not.toBeNull();

        engine.destroy();
    });

    it('rebuilds the cached spatial index when the caller layer index version changes', () => {
        const container = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
        const selected: string[][] = [];
        let businessVersion = 1;
        let layerIndexVersion = 1;

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
            getLayersVersion: () => businessVersion,
            getLayerIndexVersion: () => layerIndexVersion,
            getSelectedIds: () => [],
            getElementById: () => null,
            onSelect: (ids) => selected.push(ids),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));

        layers[0] = {
            ...layers[0],
            x: 220,
            y: 120,
        };
        businessVersion += 1;
        layerIndexVersion += 1;

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 20, 20));
        container.dispatchEvent(createPointerEvent('pointerdown', 230, 130));

        expect(selected).toEqual([['a'], [], ['a']]);

        engine.destroy();
    });

    it('updates the spatial index incrementally when applying geometry patches', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
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

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => [],
            getElementById: (id) => id === 'a' ? elementA : null,
            onSelect: (ids) => selected.push(ids),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        engine.applyLayerGeometry([{
            id: 'a',
            x: 220,
            y: 120,
        }], {writeDom: true, refreshOverlay: false});
        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 20, 20));
        container.dispatchEvent(createPointerEvent('pointerdown', 230, 130));

        expect(selected).toEqual([['a'], [], ['a']]);

        engine.destroy();
    });

    it('adds box-selected layers when ctrl is held', () => {
        const container = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 120, 10, 2),
        ];
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

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: () => null,
            onSelect: (ids) => selected.push(ids),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 90, 0, {ctrlKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 220, 80, {ctrlKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 220, 80, {ctrlKey: true}));

        expect(selected).toEqual([['a', 'b']]);

        engine.destroy();
    });

    it('toggles a hit layer on command click without starting drag', () => {
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
            onSelect: (ids) => selected.push(ids),
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20, {metaKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 60, 70, {metaKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 60, 70, {metaKey: true}));

        expect(selected).toEqual([[]]);
        expect(commits).toEqual([]);
        expect(elementA.style.transform).toBe('');

        engine.destroy();
    });

    it('constrains drag to the dominant horizontal axis when shift is held', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
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

        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: (id) => id === 'a' ? elementA : null,
            onSelect,
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 80, 45, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 80, 45, {shiftKey: true}));

        expect(onSelect).not.toHaveBeenCalled();
        expect(commits).toEqual([[{id: 'a', x: 70, y: 10}]]);
        expect(elementA.style.transform).toBe('translate(70px, 10px) rotate(0deg)');

        engine.destroy();
    });

    it('constrains drag to the dominant vertical axis when shift is held', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
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
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 45, 90, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 45, 90, {shiftKey: true}));

        expect(commits).toEqual([[{id: 'a', x: 10, y: 80}]]);
        expect(elementA.style.transform).toBe('translate(10px, 80px) rotate(0deg)');

        engine.destroy();
    });

    it('does not choose the shift lock axis from tiny initial jitter', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [createLayer('a', 10, 10, 1)];
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
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 21, 22, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 100, 25, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 110, 28, {shiftKey: true}));

        expect(commits).toEqual([[{id: 'a', x: 100, y: 10}]]);
        expect(elementA.style.transform).toBe('translate(100px, 10px) rotate(0deg)');

        engine.destroy();
    });

    it('snaps dragged layers to nearby candidate guidelines when enabled', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
            createLayer('b', 100, 10, 2),
        ];
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
            snapMode: 'all',
            snapThreshold: 5,
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 54, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 54, 20));

        expect(commits).toEqual([[{id: 'a', x: 40, y: 10}]]);
        expect(elementA.style.transform).toBe('translate(40px, 10px) rotate(0deg)');

        engine.destroy();
    });

    it('snaps dragged layers to external x reference points', () => {
        const container = document.createElement('div');
        const elementA = document.createElement('div');
        const layers = [
            createLayer('a', 10, 10, 1),
        ];
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
            snapMode: 'all',
            snapThreshold: 5,
            snapReferencePoints: {x: [100, 300]},
            onDragCommit: (items) => commits.push(items),
        });

        engine.mount();

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 107, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 107, 20));

        expect(commits).toEqual([[{id: 'a', x: 100, y: 10}]]);
        expect(elementA.style.transform).toBe('translate(100px, 10px) rotate(0deg)');

        engine.destroy();
    });

});
