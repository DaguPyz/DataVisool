/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';

import ComponentContainer from '@/plugins/designer-runtime/internal/framework/core/ComponentContainer';
import EventUtil from '@/plugins/designer-runtime/internal/designer/blueprint/util/EventUtil';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
const runtimes = new Set<DesignerRuntimeContext>();
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    runtimes.forEach(runtime => runtime.dispose());
    runtimes.clear();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it('does not fire loaded while the component create promise is pending', async () => {
    vi.useFakeTimers();
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    let finishCreate!: () => void;
    const creation = new Promise<void>(resolve => { finishCreate = resolve; });
    class Controller {
        config: any;
        bpExecutor: any;
        index?: number;
        create() { return creation; }
        changeData() {}
        setVisible() {}
        registerEvent() {}
        loadComponentData() {}
        updateFilter() {}
        getConfig() { return this.config; }
        destroy() {}
    }
    const runtime = new DesignerRuntimeContext();
    runtimes.add(runtime);
    runtime.registry.definitions.example = {getController: () => Controller, getInitConfig: () => ({base: {}})} as any;
    const layer = {id: 'example-1', type: 'example', name: 'Example'};
    const triggerComponentEvent = vi.fn();
    const manager = new DesignerManager(DesignerScene.DEFAULT, runtime);
    manager.layerManager.layerConfigs = {'example-1': layer} as any;
    manager.layerManager.elemConfigs = {} as any;
    manager.layerManager.controllers = {} as any;
    manager.layerManager.enableEvent = false;
    vi.spyOn(manager.bpExecutor, 'triggerComponentEvent').mockImplementation(triggerComponentEvent);
    render(<ComponentContainer layer={layer as any} designerManager={manager}/>);
    EventUtil.triggerGlobalEvent(manager);
    act(() => vi.advanceTimersByTime(500));
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    await act(async () => { finishCreate(); await creation; });
    act(() => vi.advanceTimersByTime(50));
    expect(triggerComponentEvent).toHaveBeenCalledOnce();
    expect(triggerComponentEvent).toHaveBeenCalledWith('example-1', 'loaded',
        expect.objectContaining({base: expect.objectContaining({id: 'example-1'})}), undefined);
});
