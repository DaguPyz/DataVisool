/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {AnchorPointType, DesignerMode, DesignerScene} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({releaseData: null as any}));
vi.mock('@/util/FetchUtil.ts', () => ({default: {post: vi.fn(async () => state.releaseData)}}));
vi.mock('@/util/EnvUtil.ts', () => ({default: {getModeByUrl: () => DesignerMode.RELEASE}}));
vi.mock('@datavisool/ui', () => ({
    Loading: () => <div>loading release page</div>,
    DataVisoolUIProvider: ({children}: {children: React.ReactNode}) => children,
    globalMessage: {messageApi: {error: vi.fn(), success: vi.fn()}},
}));
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:release-reference', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

import ScreenReferenceComponent from '@/comps/builtin/screen-reference/ScreenReferenceComponent';
import DesignerLoader from '@/designer/loader/DesignerLoader';
import ReleaseDesignerLoader from '@/designer/loader/ReleaseDesignerLoader';
import DesignerManager from '@/designer/manager/DesignerManager';
import BPGlobalVariableNodeController from '@/designer/blueprint/node/core/impl/global-variable/BPGlobalVariableNodeController';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
const originalDefinitions = {...DesignerLoader.definitionMap};
const originalBlueprintControllers = {...DesignerLoader.bpControllerMap};
const output = (source: string, event: string) => `${source}:${event}:${AnchorPointType.OUTPUT}`;
const input = (node: string, action: string) => `${node}:${action}:${AnchorPointType.INPUT}`;

afterEach(async () => {
    await act(async () => {
        cleanup();
        await Promise.resolve();
    });
    state.releaseData = null;
    Object.keys(DesignerLoader.definitionMap).forEach(key => delete DesignerLoader.definitionMap[key]);
    Object.assign(DesignerLoader.definitionMap, originalDefinitions);
    Object.keys(DesignerLoader.bpControllerMap).forEach(key => delete DesignerLoader.bpControllerMap[key]);
    Object.assign(DesignerLoader.bpControllerMap, originalBlueprintControllers);
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
    vi.restoreAllMocks();
});

it('runs a published referenced page with its own global variables and blueprint executor', async () => {
    const {default: BaseTextDefinition} = await import('@/comps/builtin/base-text/BaseTextDefinition');
    DesignerLoader.definitionMap.BaseText = new BaseTextDefinition();
    DesignerLoader.bpControllerMap.BPGlobalVariableNode = BPGlobalVariableNodeController;

    const pageB = {
        id: 'page-b',
        name: 'Page B',
        canvasManager: {width: 320, height: 180},
        layerManager: {
            layerHeader: 'text-b',
            layerTail: 'text-b',
            layerConfigs: {
                'text-b': {id: 'text-b', name: 'B text', type: 'BaseText', width: 220, height: 32, x: 0, y: 0, transform: {}},
            },
            elemConfigs: {
                'text-b': {
                    base: {id: 'text-b', name: 'B text', type: 'BaseText'},
                    data: {sourceType: 'globalVariable', value: 'default', globalVariable: {gvId: 'shared-source'}},
                },
            },
        },
        globalVariableManager: {
            globalVariables: {
                'shared-source': {id: 'shared-source', key: 'message', value: 'from published page B', bindTarget: [], reRender: false},
                result: {id: 'result', key: 'result', value: 'B result initial', bindTarget: [], reRender: false},
            },
        },
        bluePrintManager: [{
            pageId: 'bp-page-b',
            pageName: 'B blueprints',
            bpAPMap: {[output('text-b', 'dataChange')]: [input('result', 'gvUpdateData')]},
            bpNodeConfigMap: {result: {id: 'result', name: 'B result', type: 'BPGlobalVariableNode'}},
            bpNodeLayoutMap: {result: {id: 'result', type: 'BPGlobalVariableNode', x: 0, y: 0}},
        }],
    };
    state.releaseData = {
        name: 'Published B',
        dataJson: JSON.stringify({projectJson: JSON.stringify(pageB), dynamicScripts: [], components: [], fonts: []}),
    };

    const pageAManager = new DesignerManager(DesignerScene.DEFAULT);
    pageAManager.init({
        globalVariableManager: {globalVariables: {
            'shared-source': {id: 'shared-source', key: 'message', value: 'from parent page A', bindTarget: [], reRender: false},
            result: {id: 'result', key: 'result', value: 'A result initial', bindTarget: [], reRender: false},
        }},
    } as any, DesignerMode.RELEASE);
    new ReleaseDesignerLoader(DesignerMode.RELEASE).initializeRuntimeEnv('page-a', pageAManager);

    expect(window.DATAVISOOL_ENV.currentManager).toBe(pageAManager);
    render(<ScreenReferenceComponent base={{id: 'reference-b'} as any} style={{screenId: 'page-b'}}/>);

    await waitFor(() => expect(screen.getByText('from published page B')).toBeInTheDocument());
    const pageBManager = window.DATAVISOOL_ENV.managers['reference-b'] as DesignerManager;
    expect(pageBManager).toBeDefined();
    expect(pageBManager).not.toBe(pageAManager);
    expect(window.DATAVISOOL_ENV.currentManager).toBe(pageAManager);
    await waitFor(() => expect(pageBManager.globalVariableManager.globalVariableInstance.result.value).toBe('from published page B'));

    await act(async () => {
        pageBManager.layerManager.controllers['text-b'].changeData('updated by B blueprint');
    });
    await waitFor(() => expect(pageBManager.globalVariableManager.globalVariableInstance.result.value).toBe('updated by B blueprint'));
    expect(pageAManager.globalVariableManager.globalVariableInstance['shared-source'].value).toBe('from parent page A');
    expect(pageAManager.globalVariableManager.globalVariableInstance.result.value).toBe('A result initial');
    expect(screen.getByText('updated by B blueprint')).toBeInTheDocument();
});
