/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {createRef} from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

vi.mock('@/plugins/designer-runtime/internal/designer/left/layer-list/CanvasRender.ts', async () => {
    const ReactModule = await import('react');
    return {
        default: {
            buildCanvasComponents: (_manager: unknown, _source: string, index: number) =>
                ReactModule.createElement('span', {'data-testid': 'loop-child'}, `row-${index}`),
        },
    };
});

import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import LoopContainer from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainer.tsx';
import LoopContainerController from '@/plugins/designer-runtime/internal/builtin/loop-container/LoopContainerController.ts';

const previousEnvironment = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
let runtimeContext: DesignerRuntimeContext | undefined;
let rootManager: DesignerManager | undefined;
let loopController: LoopContainerController | undefined;

afterEach(() => {
    cleanup();
    if (loopController) (loopController as any).instance = undefined;
    try { runtimeContext?.dispose(); } catch { /* Continue runtime fixture cleanup. */ }
    vi.useRealTimers();
    vi.restoreAllMocks();
    loopController = undefined;
    rootManager = undefined;
    runtimeContext = undefined;
    if (previousEnvironment) Object.defineProperty(window, 'DATAVISOOL_ENV', previousEnvironment);
    else delete (window as any).DATAVISOOL_ENV;
});

const readSlotOrder = (container: HTMLElement) => Array.from(container.querySelectorAll('.loop-item'))
    .map(item => item.querySelector('[data-testid="loop-child"]')?.textContent);

it('preserves the active loop carousel slot when runtime stop is canceled', async () => {
    vi.useFakeTimers();
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    runtimeContext = new DesignerRuntimeContext();
    rootManager = new DesignerManager(DesignerScene.DEFAULT, runtimeContext);
    rootManager.init({layerManager: {layerConfigs: {}, elemConfigs: {}}} as never, DesignerMode.PREVIEW);
    loopController = new LoopContainerController();
    loopController.manager.attachRuntimeContext(runtimeContext);
    loopController.manager.init({canvasManager: {width: 100, height: 80}} as never, DesignerMode.PREVIEW);

    const config = {
        base: {id: 'loop-runtime', name: 'Loop', type: 'LoopContainer'},
        managerData: loopController.manager.getData(),
        style: {enableCarousel: true, carouselDirection: 'row', carouselSpeed: 10, carouselPauseSeconds: 0},
        data: {sourceType: 'static', value: [{id: 'a'}, {id: 'b'}, {id: 'c'}]},
    } as any;
    loopController.config = config;
    (loopController as any).initialized = true;
    rootManager.layerManager.controllers.loop = loopController as never;

    const ref = createRef<any>();
    const view = render(<LoopContainer ref={ref} {...config} manager={loopController.manager}/>);
    loopController.instance = ref.current;
    act(() => (loopController as any).refreshCarouselRuntime());

    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    const currentSlots = ['row-1', 'row-2', 'row-0'];
    expect(readSlotOrder(view.container)).toEqual(currentSlots);
    expect(loopController.config.data.value).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}]);

    act(() => runtimeContext!.pauseEffects());
    expect(readSlotOrder(view.container)).toEqual(currentSlots);

    act(() => runtimeContext!.resumeEffects());
    expect(readSlotOrder(view.container)).toEqual(currentSlots);
    expect(loopController.config.data.value).toEqual([{id: 'a'}, {id: 'b'}, {id: 'c'}]);
});
