/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';

import ComponentContainer from '@/plugins/designer-runtime/internal/framework/core/ComponentContainer';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext';
import DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
const runtimes = new Set<DesignerRuntimeContext>();
afterEach(() => {
    cleanup();
    runtimes.forEach(runtime => runtime.dispose());
    runtimes.clear();
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
    const runtime = new DesignerRuntimeContext();
    runtimes.add(runtime);
    runtime.registry.definitions.example = {getController: () => Controller, getInitConfig: () => ({base: {}, data: {}})} as any;
    const layer = {id: 'component', type: 'example', name: 'Example', width: 100, height: 100, x: 0, y: 0, transform: {}};
    const triggerComponentEvent = vi.fn();
    const manager = new DesignerManager(DesignerScene.DEFAULT, runtime);
    manager.layerManager.layerConfigs = {component: layer} as any;
    manager.layerManager.elemConfigs = {} as any;
    manager.layerManager.controllers = {} as any;
    manager.layerManager.enableEvent = false;
    vi.spyOn(manager.bpExecutor, 'triggerComponentEvent').mockImplementation(triggerComponentEvent);

    render(<ComponentContainer layer={layer as any} designerManager={manager as any} index={index}/>);

    await waitFor(() => expect(triggerComponentEvent).toHaveBeenCalledWith('component', 'dataChange', data, index));
});
