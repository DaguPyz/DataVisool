/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it, vi} from 'vitest';
import {
    InteractionEngine,
    type BoxSelectionMode,
    type DragCommitItem,
    type LayerBox,
} from '../../src/main';

function createPointerEvent(
    type: string,
    clientX: number,
    clientY: number,
    init: {
        altKey?: boolean;
        shiftKey?: boolean;
        ctrlKey?: boolean;
        metaKey?: boolean;
    } = {},
) {
    const event = new Event(type, {bubbles: true, cancelable: true});

    Object.defineProperties(event, {
        button: {value: 0},
        clientX: {value: clientX},
        clientY: {value: clientY},
        pointerId: {value: 1},
        altKey: {value: Boolean(init.altKey)},
        shiftKey: {value: Boolean(init.shiftKey)},
        ctrlKey: {value: Boolean(init.ctrlKey)},
        metaKey: {value: Boolean(init.metaKey)},
    });

    return event;
}

function createLayer(id: string, x: number, y: number): LayerBox {
    return {
        id,
        x,
        y,
        width: 60,
        height: 40,
        rotate: 0,
    };
}

function prepareContainer() {
    const container = document.createElement('div');
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
    return container;
}

describe('dynamic interaction shortcut callbacks', () => {
    it('uses a caller-provided additive shortcut and does not start drag for that click', () => {
        const container = prepareContainer();
        const element = document.createElement('div');
        const layers = [createLayer('a', 10, 10)];
        let selectedIds = ['a'];
        const selected: string[][] = [];
        const commits: DragCommitItem[][] = [];
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => selectedIds,
            getElementById: () => element,
            isAdditiveSelectionActive: (event) => Boolean(event?.shiftKey),
            onSelect: (ids) => {
                selectedIds = ids;
                selected.push(ids);
            },
            onDragEnd: (items) => commits.push(items),
        });

        engine.mount();
        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 100, 80, {shiftKey: true}));
        window.dispatchEvent(createPointerEvent('pointerup', 100, 80, {shiftKey: true}));

        expect(selected).toEqual([[]]);
        expect(commits).toEqual([]);
        expect(element.style.transform).toBe('');
        engine.destroy();
    });

    it('keeps a canonical group multi-selection when dragging one of its leaf layers', () => {
        const container = prepareContainer();
        const elements = new Map([
            ['leaf', document.createElement('div')],
            ['other', document.createElement('div')],
        ]);
        const layers = [createLayer('leaf', 10, 10), createLayer('other', 100, 10)];
        const selectedIds = ['group', 'other'];
        const selected: string[][] = [];
        const commits: DragCommitItem[][] = [];
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => selectedIds,
            getElementById: (id) => elements.get(id) ?? null,
            resolveSelectionIds: ({hitId}) => hitId === 'leaf' ? ['group'] : hitId ? [hitId] : [],
            resolveTransformTargetIds: ({selectedIds: ids}) => ids.flatMap((id) => id === 'group' ? ['leaf'] : [id]),
            onSelect: (ids) => selected.push(ids),
            onDragEnd: (items) => commits.push(items),
        });

        engine.mount();
        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 40, 40));
        window.dispatchEvent(createPointerEvent('pointerup', 40, 40));

        expect(selected).toEqual([]);
        expect(commits).toEqual([[
            {id: 'leaf', x: 30, y: 30},
            {id: 'other', x: 120, y: 30},
        ]]);
        engine.destroy();
    });

    it('reads an ordinary-key box-start callback after mount and lets the callback ignore input focus', () => {
        const container = prepareContainer();
        const input = document.createElement('input');
        const layerElement = document.createElement('div');
        const layers = [
            createLayer('source', 10, 10),
            createLayer('target', 80, 80),
        ];
        let boxStartActive = false;
        let selectedIds: string[] = [];
        const selected: string[][] = [];
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => selectedIds,
            getElementById: () => layerElement,
            isBoxSelectionStartActive: () => boxStartActive && document.activeElement !== input,
            resolveBoxSelectionMode: () => 'contain',
            onSelect: (ids) => {
                selectedIds = ids;
                selected.push(ids);
            },
        });

        document.body.append(input, container);
        engine.mount();
        boxStartActive = true;
        input.focus();
        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointerup', 20, 20));

        expect(selected).toEqual([['source']]);

        input.blur();
        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 160, 160));
        window.dispatchEvent(createPointerEvent('pointerup', 160, 160));

        expect(selected.at(-1)).toEqual(['target']);
        engine.destroy();
        input.remove();
        container.remove();
    });

    it('updates the active selection-box mode on keydown and keyup only during the session', () => {
        const container = prepareContainer();
        let mode: BoxSelectionMode = 'intersect';
        const resolvedModes: BoxSelectionMode[] = [];
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => [createLayer('a', 10, 10)],
            getSelectedIds: () => [],
            getElementById: () => null,
            resolveBoxSelectionMode: () => mode,
            resolveBoxSelectionIds: (input) => {
                resolvedModes.push(input.boxSelectionMode);
                return input.candidateIds;
            },
        });

        engine.mount();
        container.dispatchEvent(createPointerEvent('pointerdown', 0, 0));
        window.dispatchEvent(createPointerEvent('pointermove', 30, 30));

        const overlay = container.querySelector<HTMLElement>('.datavisool-interaction-selection-box')!;
        expect(overlay.dataset.selectionMode).toBe('intersect');
        expect(overlay.classList.contains('datavisool-interaction-selection-box--intersect')).toBe(true);

        mode = 'contain';
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Alt', code: 'AltLeft', altKey: true}));
        expect(overlay.dataset.selectionMode).toBe('contain');
        expect(overlay.classList.contains('datavisool-interaction-selection-box--contain')).toBe(true);

        mode = 'intersect';
        window.dispatchEvent(new KeyboardEvent('keyup', {key: 'Alt', code: 'AltLeft'}));
        expect(overlay.dataset.selectionMode).toBe('intersect');

        window.dispatchEvent(createPointerEvent('pointerup', 30, 30));
        expect(resolvedModes).toEqual(['intersect']);

        mode = 'contain';
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Alt', code: 'AltLeft', altKey: true}));
        expect(overlay.dataset.selectionMode).toBe('intersect');
        engine.destroy();
    });

    it('uses a dynamic axis-lock callback after an ordinary drag has started', () => {
        const container = prepareContainer();
        const element = document.createElement('div');
        const layers = [createLayer('a', 10, 10)];
        const commits: DragCommitItem[][] = [];
        let axisLockActive = false;
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => layers,
            getSelectedIds: () => ['a'],
            getElementById: () => element,
            isAxisLockActive: () => axisLockActive,
            onDragEnd: (items) => commits.push(items),
        });

        engine.mount();
        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20));
        window.dispatchEvent(createPointerEvent('pointermove', 40, 35));
        axisLockActive = true;
        window.dispatchEvent(createPointerEvent('pointermove', 100, 55));
        window.dispatchEvent(createPointerEvent('pointerup', 100, 55));

        expect(commits).toEqual([[{id: 'a', x: 90, y: 10}]]);
        engine.destroy();
    });
});

describe('read-only client-point hit queries', () => {
    it('converts client coordinates, returns exact overlapping hits, and has no selection side effect', () => {
        const container = prepareContainer();
        const layers = [
            createLayer('bottom', 10, 10),
            {...createLayer('top', 10, 10), rotate: 45},
        ];
        const onSelect = vi.fn();
        container.getBoundingClientRect = () => ({
            x: 100,
            y: 50,
            left: 100,
            top: 50,
            right: 900,
            bottom: 650,
            width: 800,
            height: 600,
            toJSON: () => undefined,
        });
        const engine = new InteractionEngine({
            container,
            getScale: () => 2,
            getLayers: () => layers,
            getSelectedIds: () => [],
            getElementById: () => null,
            onSelect,
        });

        const first = engine.queryLayersAtClientPoint({clientX: 140, clientY: 90});
        expect(first.map((layer) => layer.id)).toEqual(['bottom', 'top']);
        first[0].x = 999;
        expect(engine.queryLayersAtClientPoint({clientX: 140, clientY: 90})[0].x).toBe(10);
        expect(onSelect).not.toHaveBeenCalled();
    });
});
