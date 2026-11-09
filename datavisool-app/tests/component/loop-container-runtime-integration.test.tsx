/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {createRef} from 'react';
import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

vi.mock('@/designer/manager/DesignerManager.ts', () => ({
    default: class MockDesignerManager {
        public scene: unknown;
        public variableOwner: unknown;
        public id: string | null = null;
        public name: string | null = null;
        public canvasManager = {canvasConfig: {width: 100, height: 80}};
        public layerManager = {controllers: {}, layerConfigs: {}};
        public globalFilterManger = {getFilterStyle: () => ({})};
        public bpExecutor = {triggerComponentEvent: vi.fn()};
        constructor(scene: unknown) { this.scene = scene; }
        init() {}
        getData() { return {}; }
        destroy() {}
    },
}));
vi.mock('@/util/ComponentUtil.ts', () => ({default: {release: vi.fn(), unmount: vi.fn()}}));
vi.mock('@/designer/left/layer-list/CanvasRender.ts', async () => {
    const ReactModule = await import('react');
    return {
        default: {
            buildCanvasComponents: (_manager: unknown, _source: string, index: number) =>
                ReactModule.createElement('span', {'data-testid': 'loop-child'}, `row-${index}`),
        },
    };
});

import LoopContainer from '@/comps/loop-container/LoopContainer';
import LoopContainerController from '@/comps/loop-container/LoopContainerController';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
    document.body.replaceChildren();
});

const getSlotOrder = (container: HTMLElement) => Array.from(container.querySelectorAll('.loop-item'))
    .map((item) => item.querySelector('[data-testid="loop-child"]')?.textContent);

describe('loop container runtime integration', () => {
    it('rotates actual rendered slots, resets after hide/show, and preserves the parent loop index on click', async () => {
        vi.useFakeTimers();
        (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

        const ref = createRef<any>();
        const controller = new LoopContainerController();
        const config = {
            base: {id: 'loop-runtime', name: 'Loop', type: 'LoopContainer'},
            managerData: {},
            style: {
                enableCarousel: true,
                carouselDirection: 'row',
                horizontalGap: 10,
                carouselSpeed: 10,
                carouselPauseSeconds: 0,
            },
            data: {sourceType: 'static', value: [{id: 'a'}, {id: 'b'}, {id: 'c'}]},
        } as any;
        const executor = {triggerComponentEvent: vi.fn()};
        const view = render(<LoopContainer ref={ref} {...config} manager={(controller as any).manager}/>);

        Object.assign(controller, {
            config,
            bpExecutor: executor,
            index: 2,
            instance: ref.current,
        });
        (controller as any).initialized = true;
        controller.registerEvent();
        act(() => { (controller as any).refreshCarouselRuntime(); });
        await act(async () => { await Promise.resolve(); });

        expect(ref.current).toBeTruthy();
        expect(getSlotOrder(view.container)).toEqual(['row-0', 'row-1', 'row-2']);
        expect(ref.current.setCarouselState).toBeDefined();

        await act(async () => { await vi.advanceTimersByTimeAsync(120); });
        expect(getSlotOrder(view.container)).toEqual(['row-1', 'row-2', 'row-0']);

        await act(async () => {
            controller.changeData([{id: 'new-a'}, {id: 'new-b'}]);
            await vi.advanceTimersByTimeAsync(10);
        });
        expect(getSlotOrder(view.container)).toEqual(['row-0', 'row-1']);
        await act(async () => { await vi.advanceTimersByTimeAsync(120); });
        expect(getSlotOrder(view.container)).toEqual(['row-1', 'row-0']);

        await act(async () => { controller.setVisible(false); });
        expect(getSlotOrder(view.container)).toEqual([]);
        await act(async () => { await vi.advanceTimersByTimeAsync(500); });
        await act(async () => { controller.setVisible(true); });
        expect(getSlotOrder(view.container)).toEqual(['row-0', 'row-1']);

        act(() => { fireEvent.click(view.container.querySelector('.loop-container')!); });
        expect(executor.triggerComponentEvent).toHaveBeenCalledWith('loop-runtime', 'click', config, 2);

        act(() => { controller.destroy(); });
    });
});
