/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {AnchorPointType, DesignerMode} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({definitions: {} as Record<string, any>}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitions}}));
vi.mock('@/designer/store/RuntimeStore.ts', () => ({default: {auxiliaryBorder: false}}));
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:host-integration', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

import ComponentContainer from '@/framework/core/ComponentContainer';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';
import BPGlobalVariableNodeController from '@/designer/blueprint/node/core/impl/global-variable/BPGlobalVariableNodeController';
import BaseButtonDefinition from '@/comps/builtin/base-button/BaseButtonDefinition';
import BaseInputDefinition from '@/comps/builtin/base-input/BaseInputDefinition';
import GlobalVariable from '@/designer/left/global-variable/GlobalVariable';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');

afterEach(() => {
    cleanup();
    Object.keys(state.definitions).forEach(key => delete state.definitions[key]);
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

const route = (source: string, event: string) =>
    `${source}:${event}:${AnchorPointType.OUTPUT}`;
const inputAnchor = (node: string, action: string) => `${node}:${action}:${AnchorPointType.INPUT}`;

it('routes a real BaseInput click and valueChange through the hosted BPExecutor with loop index', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    state.definitions.BaseInput = new BaseInputDefinition();
    const seen: Array<{anchor: string; value: unknown; index?: number}> = [];
    const probe = {
        isEnabled: () => true,
        execute: (taskInfo: any, value: unknown) => seen.push({anchor: taskInfo.apId, value, index: taskInfo.task.index}),
    };
    const page = {
        bpAPMap: {
            [route('input-1', 'click')]: [inputAnchor('probe', 'click')],
            [route('input-1', 'valueChange')]: [inputAnchor('probe', 'value')],
        },
        bpNodeControllers: {probe},
    };
    const manager: any = {
        layerManager: {layerConfigs: {}, elemConfigs: {}, controllers: {}, enableEvent: false},
        globalVariableManager: {globalVariableInstance: {}},
        bluePrintManager: {bpPageMangers: [page]},
    };
    manager.bpExecutor = new BPExecutor(manager);
    const layer = {id: 'input-1', type: 'BaseInput', name: 'Input', width: 180, height: 30, x: 0, y: 0, transform: {}};

    render(<ComponentContainer layer={layer as any} designerManager={manager} index={3}/>);
    const input = await screen.findByRole('textbox');
    await waitFor(() => expect(manager.layerManager.controllers['input-1']).toBeTruthy());
    fireEvent.click(input);
    fireEvent.change(input, {target: {value: '设备 42'}});

    expect(seen).toEqual([
        {anchor: 'click', value: expect.objectContaining({base: {id: 'input-1', name: '输入框', type: 'BaseInput'}}), index: 3},
        {anchor: 'value', value: '设备 42', index: 3},
    ]);
});

it('routes a real BaseButton click through an actual global-variable blueprint node', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    state.definitions.BaseButton = new BaseButtonDefinition();
    const globalVariable = new GlobalVariable('global-1', 'lastAction', null, false, []);
    const observed: unknown[] = [];
    const observeNode = {
        isEnabled: () => true,
        execute: (_taskInfo: any, value: unknown) => observed.push(value),
    };
    const globalNode = new BPGlobalVariableNodeController({id: 'global-1'} as any);
    const page = {
        bpAPMap: {
            [route('button-1', 'click')]: [inputAnchor('global-1', 'gvUpdateData')],
            [route('global-1', 'gvDataChange')]: [inputAnchor('observer', 'changed')],
        },
        bpNodeControllers: {['global-1']: globalNode, observer: observeNode},
    };
    const manager: any = {
        layerManager: {layerConfigs: {}, elemConfigs: {}, controllers: {}, enableEvent: false},
        globalVariableManager: {globalVariableInstance: {'global-1': globalVariable}},
        bluePrintManager: {bpPageMangers: [page]},
    };
    manager.bpExecutor = new BPExecutor(manager);
    globalVariable.start({controllers: {}, manager}, manager.bpExecutor);
    const layer = {id: 'button-1', type: 'BaseButton', name: 'Run', width: 140, height: 45, x: 0, y: 0, transform: {}};
    render(<ComponentContainer layer={layer as any} designerManager={manager} index={2}/>);
    const button = await screen.findByRole('button', {name: '按钮'});
    await waitFor(() => expect(manager.layerManager.controllers['button-1']).toBeTruthy());

    await act(async () => { fireEvent.click(button); });

    expect(observed).toEqual([expect.objectContaining({base: expect.objectContaining({id: 'button-1'})})]);
    expect(globalVariable.value).toEqual(manager.layerManager.controllers['button-1'].getConfig());
    globalVariable.stop();
});
