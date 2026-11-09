/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from 'vitest';
import {act, cleanup, render} from '@testing-library/react';
import {useRef} from 'react';
import {getBPCanvasGridStyle, syncBPCanvasGrid} from '@/designer/blueprint/workspace/BPCanvasGrid.ts';
import {useBPCanvasMetrics} from '@/designer/blueprint/workspace/useBPCanvasMetrics.ts';

let resizeObserverCallback: ResizeObserverCallback | null = null;
let viewportRect = {left: 361, top: 50, width: 900, height: 600};
let restoreEnv: PropertyDescriptor | undefined;
let restoreBoundingClientRect: PropertyDescriptor | undefined;

class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}

const bluePrintManager = {
    canvasOffset: {x: -1, y: -1},
};

function MetricsHarness({onMetricsChange, exposeRefresh}: {
    onMetricsChange: ReturnType<typeof vi.fn>;
    exposeRefresh: (refresh: () => BPCanvasMetrics | null) => void;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const {refresh} = useBPCanvasMetrics(viewportRef, onMetricsChange);
    exposeRefresh(refresh);
    return <div ref={viewportRef} className="bp-metrics-test"/>;
}

import type {BPCanvasMetrics} from '@/designer/blueprint/workspace/useBPCanvasMetrics.ts';

describe('blueprint canvas metrics and grid', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resizeObserverCallback = null;
        viewportRect = {left: 361, top: 50, width: 900, height: 600};
        if (restoreEnv)
            Object.defineProperty(window, 'DATAVISOOL_ENV', restoreEnv);
        else
            delete (window as Window & {DATAVISOOL_ENV?: unknown}).DATAVISOOL_ENV;
        restoreEnv = undefined;
        if (restoreBoundingClientRect)
            Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', restoreBoundingClientRect);
        restoreBoundingClientRect = undefined;
    });

    function setupMetricsHarness() {
        restoreEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
        Object.defineProperty(window, 'DATAVISOOL_ENV', {
            configurable: true,
            value: {currentManager: {bluePrintManager}},
        });
        vi.stubGlobal('ResizeObserver', TestResizeObserver);

        restoreBoundingClientRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('bp-metrics-test')) {
                const {left, top, width, height} = viewportRect;
                return {
                    x: left,
                    y: top,
                    left,
                    top,
                    width,
                    height,
                    right: left + width,
                    bottom: top + height,
                    toJSON: () => ({}),
                } as DOMRect;
            }
            return restoreBoundingClientRect?.value?.call(this) ?? new DOMRect();
        });

        const onMetricsChange = vi.fn();
        let refresh: () => BPCanvasMetrics | null = () => null;
        render(<MetricsHarness onMetricsChange={onMetricsChange} exposeRefresh={(next) => { refresh = next; }}/>);
        return {onMetricsChange, refresh: () => refresh()};
    }

    test('measures the actual viewport origin and updates renderer metrics on resize', () => {
        const {onMetricsChange} = setupMetricsHarness();
        expect(bluePrintManager.canvasOffset).toEqual({x: 361, y: 50});
        expect(onMetricsChange).toHaveBeenLastCalledWith({
            left: 361,
            top: 50,
            width: 900,
            height: 600,
            resolution: window.devicePixelRatio || 1,
        }, null);

        viewportRect = {left: 361, top: 50, width: 1200, height: 700};
        act(() => resizeObserverCallback?.([], {} as ResizeObserver));

        expect(onMetricsChange).toHaveBeenLastCalledWith(expect.objectContaining({width: 1200, height: 700}), expect.objectContaining({width: 900, height: 600}));
    });

    test('explicit refresh updates a changed origin even when the viewport size stays the same', () => {
        const {onMetricsChange, refresh} = setupMetricsHarness();
        const previousCallCount = onMetricsChange.mock.calls.length;
        viewportRect = {left: 42, top: 81, width: 900, height: 600};

        act(() => refresh());

        expect(bluePrintManager.canvasOffset).toEqual({x: 42, y: 81});
        expect(onMetricsChange).toHaveBeenCalledTimes(previousCallCount + 1);
        expect(onMetricsChange).toHaveBeenLastCalledWith(expect.objectContaining({left: 42, top: 81}), expect.objectContaining({left: 361, top: 50}));
    });

    test('disconnects resize observation so late callbacks cannot update a closed view', () => {
        const {onMetricsChange} = setupMetricsHarness();
        const lateResize = resizeObserverCallback;
        const oldOffset = {...bluePrintManager.canvasOffset};
        const callCount = onMetricsChange.mock.calls.length;
        cleanup();
        viewportRect = {left: 1, top: 2, width: 300, height: 200};

        act(() => lateResize?.([], {} as ResizeObserver));

        expect(bluePrintManager.canvasOffset).toEqual(oldOffset);
        expect(onMetricsChange).toHaveBeenCalledTimes(callCount);
    });

    test('keeps the world origin on the dot lattice and reduces density at low zoom', () => {
        const position = {x: -40, y: 32};
        const normal = getBPCanvasGridStyle(position, 1);
        const zoomedOut = getBPCanvasGridStyle(position, 0.05);

        expect(normal.spacing).toBe(24);
        expect(zoomedOut.spacing).toBeCloseTo(9.6);
        for (const grid of [normal, zoomedOut]) {
            const xLatticeIndex = Math.round((position.x - grid.offsetX) / grid.spacing);
            const yLatticeIndex = Math.round((position.y - grid.offsetY) / grid.spacing);
            expect(grid.offsetX + xLatticeIndex * grid.spacing).toBeCloseTo(position.x);
            expect(grid.offsetY + yLatticeIndex * grid.spacing).toBeCloseTo(position.y);
        }

        const viewport = document.createElement('div');
        syncBPCanvasGrid(viewport, position, 0.05);
        expect(viewport.style.getPropertyValue('--bp-grid-size')).toBe('9.600000000000001px');
        expect(viewport.style.getPropertyValue('--bp-grid-x')).toBe(`${zoomedOut.offsetX}px`);
    });
});
