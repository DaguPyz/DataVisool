/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const state = vi.hoisted(() => ({definitions: {} as Record<string, any>}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitions}}));

import GroupLayer from '@/comps/group-layer/GroupLayer';
import GroupLayerController from '@/comps/group-layer/GroupLayerController';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it('cleans up a group unmounted before initialization finishes and retains its config', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    let finish!: () => void;
    const creation = new Promise<void>(resolve => { finish = resolve; });
    vi.spyOn(GroupLayerController.prototype, 'createGroupLayerInstance').mockReturnValue(creation);
    const setVisible = vi.spyOn(GroupLayerController.prototype, 'setVisible');
    const layer = {id: 'group-1', type: 'group'};
    const config = {base: {id: 'group-1', type: 'group'}, filter: {enable: false}};
    const manager: any = {layerManager: {layerConfigs: {'group-1': layer}, elemConfigs: {'group-1': config}, controllers: {}},
        bpExecutor: {triggerComponentEvent: vi.fn()}};
    state.definitions.group = {getInitConfig: () => ({base: {}})};
    const view = render(<GroupLayer layer={layer as any} designerManager={manager} index={2}/>);
    expect(manager.layerManager.controllers['group-1_2']).toBeDefined();
    view.unmount();
    expect(manager.layerManager.controllers).toEqual({});
    expect(manager.layerManager.elemConfigs['group-1']).toEqual(config);
    await act(async () => { finish(); await creation; });
    expect(setVisible).not.toHaveBeenCalled();
    expect(manager.layerManager.elemConfigs['group-1']).toEqual(config);
});

it('does not remove a replacement controller when the pending group unmounts', () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    vi.spyOn(GroupLayerController.prototype, 'createGroupLayerInstance').mockReturnValue(new Promise(() => {}));
    const layer = {id: 'group-2', type: 'group'};
    const manager: any = {layerManager: {layerConfigs: {'group-2': layer}, elemConfigs: {}, controllers: {}},
        bpExecutor: {triggerComponentEvent: vi.fn()}};
    state.definitions.group = {getInitConfig: () => ({base: {}})};
    const view = render(<GroupLayer layer={layer as any} designerManager={manager}/>);
    const replacement = {getConfig: () => ({base: {id: 'group-2'}})};
    manager.layerManager.controllers['group-2'] = replacement;
    view.unmount();
    expect(manager.layerManager.controllers['group-2']).toBe(replacement);
    expect(manager.layerManager.elemConfigs).toEqual({});
});

it('removes the pending controller if group initialization fails', async () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(GroupLayerController.prototype, 'createGroupLayerInstance').mockRejectedValue(new Error('failed'));
    const layer = {id: 'group-3', type: 'group'};
    const manager: any = {layerManager: {layerConfigs: {'group-3': layer}, elemConfigs: {}, controllers: {}},
        bpExecutor: {triggerComponentEvent: vi.fn()}};
    state.definitions.group = {getInitConfig: () => ({base: {type: 'group'}})};
    await act(async () => { render(<GroupLayer layer={layer as any} designerManager={manager}/>); });
    expect(manager.layerManager.controllers).toEqual({});
    expect(manager.layerManager.elemConfigs['group-3'].base.id).toBe('group-3');
});
