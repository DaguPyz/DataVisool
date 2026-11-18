/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {
    getResizeHandleFromEventTarget,
    isRotateHandleEventTarget,
    ResizeOverlay,
    type LayerBox,
} from '../../src/main';

function createLayer(): LayerBox {
    return {
        id: 'a',
        x: 12,
        y: 24,
        width: 100,
        height: 60,
        rotate: 0,
    };
}

describe('ResizeOverlay', () => {
    it('renders the resize box and eight handles', () => {
        const container = document.createElement('div');
        const overlay = new ResizeOverlay();

        overlay.attach(container);
        overlay.render(createLayer());

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const handles = container.querySelectorAll('.datavisool-interaction-resize-handle');

        expect(box?.style.display).toBe('block');
        expect(box?.style.transform).toBe('translate(12px, 24px) rotate(0deg)');
        expect(box?.style.width).toBe('100px');
        expect(box?.style.height).toBe('60px');
        expect(handles).toHaveLength(8);
    });

    it('resolves handle from nested event targets', () => {
        const container = document.createElement('div');
        const overlay = new ResizeOverlay();

        overlay.attach(container);
        overlay.render(createLayer());

        const handle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');

        expect(getResizeHandleFromEventTarget(handle)).toBe('se');
        expect(getResizeHandleFromEventTarget(container)).toBeNull();
    });

    it('renders rotate handle and can hide resize handles for rotated layers', () => {
        const container = document.createElement('div');
        const overlay = new ResizeOverlay();

        overlay.attach(container);
        overlay.render({...createLayer(), rotate: 30}, {
            showResizeHandles: false,
            showRotateHandle: true,
        });

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');
        const resizeHandle = container.querySelector<HTMLElement>('[data-datavisool-resize-handle="se"]');
        const rotateHandle = container.querySelector<HTMLElement>('[data-datavisool-rotate-handle]');

        expect(box?.style.transform).toBe('translate(12px, 24px) rotate(30deg)');
        expect(resizeHandle?.style.display).toBe('none');
        expect(isRotateHandleEventTarget(rotateHandle)).toBe(true);
    });

    it('applies and clears custom selected outline style', () => {
        const container = document.createElement('div');
        const overlay = new ResizeOverlay();

        overlay.attach(container);
        overlay.render(createLayer(), {
            outlineStyle: {
                color: 'rgb(255, 0, 170)',
                width: 3,
                radius: 8,
            },
        });

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(box?.style.borderColor).toBe('rgb(255, 0, 170)');
        expect(box?.style.borderWidth).toBe('3px');
        expect(box?.style.borderRadius).toBe('8px');
        expect(box?.style.borderStyle).toBe('solid');

        overlay.render(createLayer());

        expect(box?.style.borderColor).toBe('');
        expect(box?.style.borderWidth).toBe('');
        expect(box?.style.borderRadius).toBe('');
        expect(box?.style.borderStyle).toBe('');
    });

    it('does not create a border when only selected outline radius is configured', () => {
        const container = document.createElement('div');
        const overlay = new ResizeOverlay();

        overlay.attach(container);
        overlay.render(createLayer(), {
            outlineStyle: {
                radius: 6,
            },
        });

        const box = container.querySelector<HTMLElement>('.datavisool-interaction-resize-box');

        expect(box?.style.borderRadius).toBe('6px');
        expect(box?.style.borderColor).toBe('');
        expect(box?.style.borderWidth).toBe('');
        expect(box?.style.borderStyle).toBe('');
    });
});
