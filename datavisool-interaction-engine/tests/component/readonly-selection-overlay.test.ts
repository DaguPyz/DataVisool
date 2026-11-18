/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {
    InteractionEngine,
    ReadonlySelectionOverlay,
    type LayerBox,
} from '../../src/main';

function createLayer(id: string, x: number, y: number, rotate = 0): LayerBox {
    return {
        id,
        x,
        y,
        width: 80,
        height: 50,
        rotate,
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

describe('ReadonlySelectionOverlay', () => {
    it('renders lightweight outlines and removes stale entries', () => {
        const container = prepareContainer();
        const overlay = new ReadonlySelectionOverlay();
        overlay.attach(container);
        overlay.render([
            createLayer('locked-a', 10, 20),
            createLayer('locked-b', 100, 80, 30),
        ]);

        const outlines = container.querySelectorAll<HTMLElement>('.datavisool-interaction-readonly-box');
        expect(outlines).toHaveLength(2);
        expect(outlines[0].dataset.layerId).toBe('locked-a');
        expect(outlines[0].style.transform).toBe('translate(10px, 20px) rotate(0deg)');
        expect(outlines[1].style.transform).toBe('translate(100px, 80px) rotate(30deg)');
        expect(outlines[0].children).toHaveLength(0);

        overlay.render([createLayer('locked-b', 120, 90, 45)]);
        expect(container.querySelectorAll('.datavisool-interaction-readonly-box')).toHaveLength(1);
        expect(container.querySelector<HTMLElement>('.datavisool-interaction-readonly-box')?.style.transform)
            .toBe('translate(120px, 90px) rotate(45deg)');

        overlay.detach();
        expect(container.querySelector('.datavisool-interaction-readonly-box')).toBeNull();
    });
});

describe('readonly selection coordination', () => {
    it('shows a precomputed readonly group outline without transform handles', () => {
        const container = prepareContainer();
        const readonlyGroup = createLayer('group', 20, 30);
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => [],
            getSelectedIds: () => ['group'],
            getElementById: () => null,
            getReadonlySelectionLayers: () => [readonlyGroup],
        });

        engine.mount();

        expect(container.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.display)
            .toBe('none');
        expect(container.querySelector<HTMLElement>('[data-layer-id="group"]')?.style.display)
            .toBe('block');
        expect(container.querySelector('[data-datavisool-resize-handle]')).not.toBeNull();
        expect(container.querySelector<HTMLElement>('[data-datavisool-resize-handle]')?.style.display)
            .not.toBe('block');
        engine.destroy();
    });

    it('keeps mutable handles and readonly outlines visible for a mixed selection', () => {
        const container = prepareContainer();
        const mutableLayer = createLayer('mutable', 10, 10);
        const mutableElement = document.createElement('div');
        let readonlyLayers = [createLayer('locked', 140, 20)];
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => [mutableLayer],
            getSelectedIds: () => ['mutable', 'locked'],
            getElementById: (id) => id === 'mutable' ? mutableElement : null,
            resolveTransformTargetIds: () => ['mutable'],
            getReadonlySelectionLayers: () => readonlyLayers,
        });

        engine.mount();
        expect(container.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.display)
            .toBe('block');
        expect(container.querySelector<HTMLElement>('[data-layer-id="locked"]')?.style.display)
            .toBe('block');

        readonlyLayers = [];
        engine.refreshResizeOverlay();
        expect(container.querySelector('.datavisool-interaction-readonly-box')).toBeNull();
        expect(container.querySelector<HTMLElement>('.datavisool-interaction-resize-box')?.style.display)
            .toBe('block');
        engine.destroy();
    });
});
