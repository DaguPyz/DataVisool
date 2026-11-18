/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
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
    init: {altKey?: boolean} = {},
) {
    const event = new Event(type, {bubbles: true, cancelable: true});

    Object.defineProperties(event, {
        button: {value: 0},
        clientX: {value: clientX},
        clientY: {value: clientY},
        pointerId: {value: 1},
        altKey: {value: Boolean(init.altKey)},
    });

    return event;
}

function createEngine(options: {
    getBoxSelectionMode?: () => BoxSelectionMode;
    withShortcut?: boolean;
    withStartShortcut?: boolean;
    onResolveBoxSelection?: (mode: BoxSelectionMode) => void;
    onSelect: (ids: string[]) => void;
    onDragEnd?: (items: DragCommitItem[]) => void;
}) {
    const container = document.createElement('div');
    const layerElement = document.createElement('div');
    const layers: LayerBox[] = [
        {
            id: 'layer',
            x: 10,
            y: 10,
            width: 60,
            height: 40,
            rotate: 0,
        },
        {
            id: 'target',
            x: 80,
            y: 80,
            width: 60,
            height: 40,
            rotate: 0,
        },
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
    container.append(layerElement);

    const engine = new InteractionEngine({
        container,
        getScale: () => 1,
        getLayers: () => layers,
        getSelectedIds: () => [],
        getElementById: () => layerElement,
        getBoxSelectionMode: options.getBoxSelectionMode,
        boxSelectionModeShortcut: options.withShortcut
            ? {modifier: 'alt', mode: 'contain'}
            : undefined,
        boxSelectionStartShortcut: options.withStartShortcut
            ? {modifier: 'alt'}
            : undefined,
        resolveBoxSelectionIds: options.onResolveBoxSelection
            ? (input) => {
                options.onResolveBoxSelection?.(input.boxSelectionMode);
                return input.candidateIds;
            }
            : undefined,
        onSelect: options.onSelect,
        onDragEnd: options.onDragEnd,
    });

    engine.mount();
    return {container, engine};
}

function selectPartialArea(container: HTMLElement, altKey = false) {
    container.dispatchEvent(createPointerEvent('pointerdown', 0, 0));
    window.dispatchEvent(createPointerEvent('pointermove', 30, 30, {altKey}));
    window.dispatchEvent(createPointerEvent('pointerup', 30, 30, {altKey}));
}

describe('box selection mode', () => {
    it('uses the caller-configured shortcut as a temporary mode override', () => {
        const selected: string[][] = [];
        const resolvedModes: BoxSelectionMode[] = [];
        const {container, engine} = createEngine({
            withShortcut: true,
            onResolveBoxSelection: (mode) => resolvedModes.push(mode),
            onSelect: (ids) => selected.push(ids),
        });

        selectPartialArea(container);
        selectPartialArea(container, true);

        expect(selected).toEqual([['layer'], []]);
        expect(resolvedModes).toEqual(['intersect', 'contain']);
        engine.destroy();
    });

    it('reads the current mode when box selection ends', () => {
        const selected: string[][] = [];
        let mode: BoxSelectionMode = 'intersect';
        const {container, engine} = createEngine({
            getBoxSelectionMode: () => mode,
            onSelect: (ids) => selected.push(ids),
        });

        container.dispatchEvent(createPointerEvent('pointerdown', 0, 0));
        window.dispatchEvent(createPointerEvent('pointermove', 30, 30));
        mode = 'contain';
        window.dispatchEvent(createPointerEvent('pointerup', 30, 30));

        expect(selected).toEqual([[]]);
        engine.destroy();
    });

    it('starts box selection instead of dragging a hit layer when the configured shortcut is active', () => {
        const selected: string[][] = [];
        const dragCommits: DragCommitItem[][] = [];
        const {container, engine} = createEngine({
            withShortcut: true,
            withStartShortcut: true,
            onSelect: (ids) => selected.push(ids),
            onDragEnd: (items) => dragCommits.push(items),
        });

        container.dispatchEvent(createPointerEvent('pointerdown', 20, 20, {altKey: true}));
        window.dispatchEvent(createPointerEvent('pointermove', 160, 160, {altKey: true}));

        expect(selected).toEqual([]);

        window.dispatchEvent(createPointerEvent('pointerup', 160, 160, {altKey: true}));

        expect(selected).toEqual([['target']]);
        expect(dragCommits).toEqual([]);
        engine.destroy();
    });
});
