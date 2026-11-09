/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({definitions: {} as Record<string, any>}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitions}}));
vi.mock('@/designer/store/RuntimeStore.ts', () => ({default: {auxiliaryBorder: false}}));

import ComponentContainer from '@/framework/core/ComponentContainer';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    cleanup();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it.each([0, 2, undefined])('forwards dataChange with loop index %s', async index => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    const data = [{id: 'row'}];
    class Controller {
        config: any;
        changeData() {}
        create() { return Promise.resolve(); }
        destroy() {}
        getConfig() { return this.config; }
        loadComponentData() { this.changeData(data); }
        registerEvent() {}
        setVisible() {}
        updateFilter() {}
    }
    state.definitions.example = {getController: () => Controller, getInitConfig: () => ({base: {}, data: {}})};
    const layer = {id: 'component', type: 'example', name: 'Example', width: 100, height: 100, x: 0, y: 0, transform: {}};
    const triggerComponentEvent = vi.fn();
    const manager = {
        layerManager: {layerConfigs: {component: layer}, elemConfigs: {}, controllers: {}, enableEvent: false},
        bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };

    render(<ComponentContainer layer={layer as any} designerManager={manager as any} index={index}/>);

    await waitFor(() => expect(triggerComponentEvent).toHaveBeenCalledWith('component', 'dataChange', data, index));
});
