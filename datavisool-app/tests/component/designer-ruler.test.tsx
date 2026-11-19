/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {act, cleanup, render} from '@testing-library/react';
import type {ReactNode} from 'react';
import {runInAction} from 'mobx';
import {getRulerStep, getVisibleRulerSpan, RULER_FONT, RULER_SIZE} from '@/plugins/editor-canvas/DesignerRulerMath.ts';
import {ViewportStore} from '@/plugins/editor-canvas/viewport/ViewportStore.ts';
import {EditorCanvasActivationProvider} from '@/plugins/editor-canvas/EditorCanvasActivationContext.tsx';

const rulerHarness = {
    width: 600,
    height: 300,
};
const viewportStore = new ViewportStore();
const activation = {viewportStore, sceneStore: {revision: 0}} as any;

import DesignerRuler from '@/plugins/editor-canvas/DesignerRuler.tsx';

const renderRulerView = (children?: ReactNode) => <EditorCanvasActivationProvider value={activation}>
    <DesignerRuler canvasSize={{width: rulerHarness.width, height: rulerHarness.height}}>{children}</DesignerRuler>
</EditorCanvasActivationProvider>;

describe('artboard rulers', () => {
    const context = {
        setTransform: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        stroke: vi.fn(), measureText: vi.fn((label: string) => ({width: label.length * 6})),
        fillText: vi.fn(), save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn(),
        font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
    };

    beforeEach(() => {
        viewportStore.setCamera({translationX: 140, translationY: 80, scale: 0.5});
        act(() => runInAction(() => { viewportStore.showRulers = true; }));
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        viewportStore.setCamera({translationX: 140, translationY: 80, scale: 0.5});
        act(() => runInAction(() => { viewportStore.showRulers = true; }));
        rulerHarness.width = 600;
        rulerHarness.height = 300;
        Object.values(context).forEach(value => {
            if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
        });
    });

    test('positions all four rulers outside the scaled artboard without moving editor content', () => {
        const {container} = render(renderRulerView(<div data-testid="editor-content"/>));
        const ruler = (side: string) => container.querySelector<HTMLCanvasElement>(`[data-ruler-side="${side}"]`)!;

        expect(ruler('top')).toHaveStyle({left: '140px', top: `${80 - RULER_SIZE}px`, width: '300px', height: '20px'});
        expect(ruler('bottom')).toHaveStyle({left: '140px', top: '230px', width: '300px', height: '20px'});
        expect(ruler('left')).toHaveStyle({left: '120px', top: '80px', width: '20px', height: '150px'});
        expect(ruler('right')).toHaveStyle({left: '440px', top: '80px', width: '20px', height: '150px'});
        expect(container.querySelector('.datavisool-ruler-content [data-testid="editor-content"]')).toBeTruthy();
        expect(context.font).toBe(RULER_FONT);
        expect(context.fillText).toHaveBeenCalled();
    });

    test('updates dimensions after zoom and hides only the rulers when toggled off', () => {
        const {container, rerender} = render(renderRulerView(<span>content</span>));
        act(() => viewportStore.setCamera({translationX: -30, translationY: 25, scale: 2}));
        rerender(renderRulerView(<span>content</span>));
        expect(container.querySelector('[data-ruler-side="top"]')).toHaveStyle({left: '0px', top: '5px', width: `${window.innerWidth}px`});
        expect(container.querySelector('[data-ruler-side="right"]')).toHaveStyle({left: '1170px', height: '600px'});

        act(() => runInAction(() => { viewportStore.showRulers = false; }));
        rerender(renderRulerView(<span>content</span>));
        expect(container.querySelectorAll('[data-ruler-side]')).toHaveLength(0);
        expect(container.querySelector('.datavisool-ruler-content')?.textContent).toBe('content');
    });

    test('mounts the rulers when artboard dimensions become available', () => {
        rulerHarness.width = 0;
        const {container, rerender} = render(renderRulerView());
        expect(container.querySelectorAll('[data-ruler-side]')).toHaveLength(0);

        rulerHarness.width = 600;
        rerender(renderRulerView());
        expect(container.querySelectorAll('[data-ruler-side]')).toHaveLength(4);
    });

    test.each([[0.05, 1000], [0.5, 100], [1, 50], [5, 10]])(
        'uses readable world units at scale %s', (scale, step) => {
            expect(getRulerStep(scale)).toBe(step);
        });

    test('clips the drawing surface when an artboard extends beyond the viewport', () => {
        expect(getVisibleRulerSpan(-100, 1000, 400)).toEqual({position: 0, offset: 100, length: 400});
        expect(getVisibleRulerSpan(450, 1000, 400).length).toBe(0);
    });
});
