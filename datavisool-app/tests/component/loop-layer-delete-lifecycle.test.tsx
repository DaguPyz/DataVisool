/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({definitions: {} as Record<string, any>, controllers: [] as any[]}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitions}}));
vi.mock('@/designer/store/RuntimeStore.ts', () => ({default: {auxiliaryBorder: false}}));

import ComponentContainer from '@/framework/core/ComponentContainer';
import LayerManager from '@/designer/manager/LayerManager';

afterEach(() => {
    cleanup();
    state.controllers.length = 0;
    state.definitions = {};
    delete (window as any).DATAVISOOL_ENV;
});

it('destroys every rendered loop row when its layer is deleted, without touching a similarly prefixed layer', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    class Controller {
        config: any;
        index?: number;
        destroy = vi.fn();
        constructor() { state.controllers.push(this); }
        create() { return Promise.resolve(); }
        changeData() {}
        loadComponentData() {}
        registerEvent() {}
        setVisible() {}
        updateFilter() {}
        getConfig() { return this.config; }
    }
    state.definitions.row = {getController: () => Controller, getInitConfig: () => ({base: {}, data: {}})};

    const layerManager = new LayerManager();
    const row = {id: 'child', type: 'row', name: 'Row', width: 100, height: 30, x: 0, y: 0, transform: {}} as any;
    layerManager.layerConfigs = {child: row, 'childish_0': {...row, id: 'childish_0'}};
    const unrelated = {config: {base: {id: 'childish_0'}}, destroy: vi.fn()};
    layerManager.controllers = {childish_0: unrelated as any};
    const manager = {
        layerManager,
        bpExecutor: {triggerComponentEvent: vi.fn()},
        globalVariableManager: {globalVariableInstance: {}},
    } as any;

    const view = render(<>
        <ComponentContainer layer={row} designerManager={manager} index={0}/>
        <ComponentContainer layer={row} designerManager={manager} index={1}/>
    </>);
    await waitFor(() => expect(state.controllers).toHaveLength(2));
    const [firstRow, secondRow] = state.controllers;
    expect(layerManager.controllers.child).toBe(secondRow);
    expect(layerManager.controllers.child_0).toBe(firstRow);
    expect(layerManager.controllers.child_1).toBe(secondRow);

    layerManager.delItem(['child']);

    expect(firstRow.destroy).toHaveBeenCalledOnce();
    expect(secondRow.destroy).toHaveBeenCalledOnce();
    expect(layerManager.controllers.child).toBeUndefined();
    expect(layerManager.controllers.childish_0).toBe(unrelated);
    expect(layerManager.controllers.child_1).toBeUndefined();
    expect(layerManager.layerConfigs.child).toBeUndefined();
    view.unmount();
});
