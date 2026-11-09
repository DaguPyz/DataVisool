/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({definitions: {} as Record<string, any>}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitions}}));
vi.mock('@/designer/store/RuntimeStore.ts', () => ({default: {auxiliaryBorder: false}}));

import ComponentContainer from '@/framework/core/ComponentContainer';
import EventUtil from '@/designer/blueprint/util/EventUtil';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    cleanup();
    vi.useRealTimers();
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
    state.definitions.example = {getController: () => Controller, getInitConfig: () => ({base: {}})};
    const layer = {id: 'example-1', type: 'example', name: 'Example'};
    const triggerComponentEvent = vi.fn();
    const manager = {
        layerManager: {layerConfigs: {'example-1': layer}, elemConfigs: {}, controllers: {}, enableEvent: false},
        bluePrintManager: {bpPageMangers: []}, bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    render(<ComponentContainer layer={layer as any} designerManager={manager as any}/>);
    EventUtil.triggerGlobalEvent(manager as any);
    act(() => vi.advanceTimersByTime(500));
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    await act(async () => { finishCreate(); await creation; });
    act(() => vi.advanceTimersByTime(50));
    expect(triggerComponentEvent).toHaveBeenCalledOnce();
    expect(triggerComponentEvent).toHaveBeenCalledWith('example-1', 'loaded',
        expect.objectContaining({base: expect.objectContaining({id: 'example-1'})}), undefined);
});
