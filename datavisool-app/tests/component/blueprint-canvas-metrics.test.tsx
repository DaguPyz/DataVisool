/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from 'vitest';
import {act, cleanup, render} from '@testing-library/react';
import {useRef} from 'react';
import {EditorBlueprintSessionProvider} from '@/plugins/editor-blueprint/session/EditorBlueprintSessionContext.tsx';
import {getBPCanvasGridStyle, syncBPCanvasGrid} from '@/plugins/editor-blueprint/workspace/BPCanvasGrid.ts';
import {useBPCanvasMetrics} from '@/plugins/editor-blueprint/workspace/useBPCanvasMetrics.ts';

let resizeObserverCallback: ResizeObserverCallback | null = null;
let viewportRect = {left: 361, top: 50, width: 900, height: 600};
let restoreBoundingClientRect: PropertyDescriptor | undefined;

class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}

const session = {
    canvasOffset: {x: -1, y: -1},
    setCanvasOffset(offset: {x: number; y: number}) { this.canvasOffset = offset; },
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

import type {BPCanvasMetrics} from '@/plugins/editor-blueprint/workspace/useBPCanvasMetrics.ts';

describe('blueprint canvas metrics and grid', () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        resizeObserverCallback = null;
        viewportRect = {left: 361, top: 50, width: 900, height: 600};
        if (restoreBoundingClientRect)
            Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', restoreBoundingClientRect);
        restoreBoundingClientRect = undefined;
    });

    function setupMetricsHarness() {
        session.canvasOffset = {x: -1, y: -1};
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
        render(<EditorBlueprintSessionProvider value={session as any}>
            <MetricsHarness onMetricsChange={onMetricsChange} exposeRefresh={(next) => { refresh = next; }}/>
        </EditorBlueprintSessionProvider>);
        return {onMetricsChange, refresh: () => refresh()};
    }

    test('measures the actual viewport origin and updates renderer metrics on resize', () => {
        const {onMetricsChange} = setupMetricsHarness();
        expect(session.canvasOffset).toEqual({x: 361, y: 50});
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

        expect(session.canvasOffset).toEqual({x: 42, y: 81});
        expect(onMetricsChange).toHaveBeenCalledTimes(previousCallCount + 1);
        expect(onMetricsChange).toHaveBeenLastCalledWith(expect.objectContaining({left: 42, top: 81}), expect.objectContaining({left: 361, top: 50}));
    });

    test('disconnects resize observation so late callbacks cannot update a closed view', () => {
        const {onMetricsChange} = setupMetricsHarness();
        const lateResize = resizeObserverCallback;
        const oldOffset = {...session.canvasOffset};
        const callCount = onMetricsChange.mock.calls.length;
        cleanup();
        viewportRect = {left: 1, top: 2, width: 300, height: 200};

        act(() => lateResize?.([], {} as ResizeObserver));

        expect(session.canvasOffset).toEqual(oldOffset);
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
