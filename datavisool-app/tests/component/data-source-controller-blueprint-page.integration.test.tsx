/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {AnchorPointType, DesignerMode, DesignerScene} from '@datavisool/sdk/types';
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:data-source-page', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

import ComponentContainer from '@/plugins/designer-runtime/internal/framework/core/ComponentContainer';
import BPGlobalVariableNodeController from '@/plugins/designer-runtime/internal/designer/blueprint/node/core/impl/global-variable/BPGlobalVariableNodeController';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext';
import BaseTextDefinition from '@/comps/builtin/base-text/BaseTextDefinition';
import GlobalVariable from '@/plugins/designer-runtime/internal/designer/left/global-variable/GlobalVariable';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
const output = (source: string, event: string) => `${source}:${event}:${AnchorPointType.OUTPUT}`;
const input = (node: string, action: string) => `${node}:${action}:${AnchorPointType.INPUT}`;
const runtimeContexts = new Set<DesignerRuntimeContext>();

afterEach(() => {
    cleanup();
    runtimeContexts.forEach(runtime => runtime.dispose());
    runtimeContexts.clear();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it('loads page-local data into a real component, runs its dataChange blueprint, and updates page state', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    const pageRuntime = new DesignerRuntimeContext();
    const outerRuntime = new DesignerRuntimeContext();
    runtimeContexts.add(pageRuntime);
    runtimeContexts.add(outerRuntime);
    pageRuntime.registry.definitions.BaseText = new BaseTextDefinition();

    const outerVariable = new GlobalVariable('shared-source', 'message', '来自 A 页面', false);
    const pageVariable = new GlobalVariable('shared-source', 'message', '来自 B 页面', false);
    const resultVariable = new GlobalVariable('result', 'loadedMessage', null, false);
    const observed: unknown[] = [];
    const observer = {
        destroy: vi.fn(),
        isEnabled: () => true,
        execute: (_taskInfo: any, value: unknown) => observed.push(value),
    };
    const globalVariableNode = new BPGlobalVariableNodeController({id: 'result'} as any);
    const page = {
        pageId: 'page-local-data',
        pageName: 'Page local data',
        bpNodeLayoutMap: {},
        bpNodeConfigMap: {},
        bpAPLineMap: {},
        bpLines: {},
        bpAPMap: {
            [output('text-1', 'dataChange')]: [input('result', 'gvUpdateData')],
            [output('result', 'gvDataChange')]: [input('observer', 'changed')],
        },
    };
    const pageManager = new DesignerManager(DesignerScene.DEFAULT, pageRuntime);
    pageManager.init({
        layerManager: {
            layerConfigs: {},
            elemConfigs: {
                'text-1': {
                    base: {id: 'text-1', name: '页面提示', type: 'BaseText'},
                    data: {sourceType: 'globalVariable', value: '初始值', globalVariable: {gvId: 'shared-source'}},
                },
            },
        },
        globalVariableManager: {globalVariables: {}},
        bluePrintManager: [page],
    }, DesignerMode.PREVIEW, pageRuntime.registry.blueprintControllers);
    Object.assign(pageManager.globalVariableManager.globalVariableInstance, {'shared-source': pageVariable, result: resultVariable});
    Object.assign(pageManager.bluePrintManager.bpPageMangers[0]!.bpNodeControllers, {result: globalVariableNode, observer});
    const outerManager = new DesignerManager(DesignerScene.DEFAULT, outerRuntime);
    outerManager.globalVariableManager.globalVariableInstance['shared-source'] = outerVariable;
    (window as any).DATAVISOOL_ENV.currentManager = outerManager;
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
