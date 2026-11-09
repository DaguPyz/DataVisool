/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';
import {markComponentPending, markComponentReady} from '@/designer/blueprint/util/ComponentLoadTracker';

vi.mock('@/designer/left/layer-list/CanvasRender.ts', () => ({default: {buildCanvasComponents: () => null}}));
import LoopContainer from '@/comps/loop-container/LoopContainer';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it('waits for a loop child to finish even after the polling limit', () => {
    vi.useFakeTimers();
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    const triggerComponentEvent = vi.fn();
    const controller = {config: {base: {id: 'child', type: 'BaseText'}}, index: 2};
    const manager: any = {
        layerManager: {controllers: {child: controller, child_2: controller}},
        canvasManager: {canvasConfig: {}}, globalFilterManger: {getFilterStyle: () => ({})},
        bpExecutor: {triggerComponentEvent},
    };
    markComponentPending(controller as any);
    const view = render(<LoopContainer {...({base: {id: 'loop'}, data: {value: []}, style: {}, manager} as any)}/>);
    act(() => vi.advanceTimersByTime(5200));
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    act(() => markComponentReady(manager, controller as any));
    expect(triggerComponentEvent.mock.calls).toEqual([['child', 'loaded', controller.config, 2]]);
    act(() => markComponentReady(manager, controller as any));
    expect(triggerComponentEvent).toHaveBeenCalledOnce();
    view.unmount();
});
