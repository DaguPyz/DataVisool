/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {AnchorPointType, DesignerMode} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({definitions: {} as Record<string, any>}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitions}}));
vi.mock('@/designer/store/RuntimeStore.ts', () => ({default: {auxiliaryBorder: false}}));
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:data-source-page', configurable: true});
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
import BaseTextDefinition from '@/comps/builtin/base-text/BaseTextDefinition';
import GlobalVariable from '@/designer/left/global-variable/GlobalVariable';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
const output = (source: string, event: string) => `${source}:${event}:${AnchorPointType.OUTPUT}`;
const input = (node: string, action: string) => `${node}:${action}:${AnchorPointType.INPUT}`;

afterEach(() => {
    cleanup();
    Object.keys(state.definitions).forEach(key => delete state.definitions[key]);
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it('loads page-local data into a real component, runs its dataChange blueprint, and updates page state', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    state.definitions.BaseText = new BaseTextDefinition();

    const outerVariable = new GlobalVariable('shared-source', 'message', '来自 A 页面', false);
    const pageVariable = new GlobalVariable('shared-source', 'message', '来自 B 页面', false);
    const resultVariable = new GlobalVariable('result', 'loadedMessage', null, false);
    const observed: unknown[] = [];
    const observer = {
        isEnabled: () => true,
        execute: (_taskInfo: any, value: unknown) => observed.push(value),
    };
    const globalVariableNode = new BPGlobalVariableNodeController({id: 'result'} as any);
    const page = {
        bpAPMap: {
            [output('text-1', 'dataChange')]: [input('result', 'gvUpdateData')],
            [output('result', 'gvDataChange')]: [input('observer', 'changed')],
        },
        bpNodeControllers: {result: globalVariableNode, observer},
    };
    const pageManager: any = {
        layerManager: {
            layerConfigs: {},
            elemConfigs: {
                'text-1': {
                    base: {id: 'text-1', name: '页面提示', type: 'BaseText'},
                    data: {sourceType: 'globalVariable', value: '初始值', globalVariable: {gvId: 'shared-source'}},
                },
            },
            controllers: {},
            enableEvent: false,
        },
        globalVariableManager: {
            globalVariableInstance: {'shared-source': pageVariable, result: resultVariable},
        },
        bluePrintManager: {bpPageMangers: [page]},
    };
    const outerManager: any = {
        globalVariableManager: {globalVariableInstance: {'shared-source': outerVariable}},
        layerManager: {layerConfigs: {}, controllers: {}},
    };
    (window as any).DATAVISOOL_ENV.currentManager = outerManager;
    pageManager.bpExecutor = new BPExecutor(pageManager);
    resultVariable.start({controllers: {}, manager: pageManager}, pageManager.bpExecutor);

    const layer = {id: 'text-1', type: 'BaseText', name: '提示', width: 180, height: 30, x: 0, y: 0, transform: {}};
    render(<ComponentContainer layer={layer as any} designerManager={pageManager}/>);

    try {
        await waitFor(() => expect(screen.getByText('来自 B 页面')).toBeInTheDocument());
        await waitFor(() => expect(resultVariable.value).toBe('来自 B 页面'));

        expect(observed).toEqual(['来自 B 页面']);
        expect(observed).not.toContain('来自 A 页面');
    } finally {
        resultVariable.stop();
    }
});
