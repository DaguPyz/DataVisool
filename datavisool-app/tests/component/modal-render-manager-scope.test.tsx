/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {AnchorPointType, DesignerMode} from '@datavisool/sdk/types';
import {BaseButtonController} from '@/comps/builtin/base-button/BaseButtonController';
import {SwitchController} from '@/comps/builtin/base-switch/BaseSwitchController';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';

const state = vi.hoisted(() => ({definitionMap: {} as Record<string, any>, created: [] as any[], instances: [] as any[], createManagers: [] as any[], loadedManagers: [] as any[]}));
vi.mock('@/designer/loader/DesignerLoader.ts', () => ({default: {definitionMap: state.definitionMap}}));
vi.mock('@datavisool/ui', () => ({
    Dialog: ({children}: any) => <div>{children}</div>,
    DataVisoolUIProvider: ({children}: any) => <div>{children}</div>,
    Switch: ({value, onChange}: any) => <button type="button" role="switch" aria-checked={value}
        onClick={() => onChange(!value)}>Toggle</button>,
}));

import {ModalWrapper} from '@/designer/blueprint/node/core/impl/popup-box/ModalRenderUtil';

afterEach(() => {
    cleanup();
    state.created.length = 0;
    state.instances.length = 0;
    state.createManagers.length = 0;
    state.loadedManagers.length = 0;
    Object.keys(state.definitionMap).forEach(key => delete state.definitionMap[key]);
    delete (window as any).DATAVISOOL_ENV;
});

it('loads popup group children and source configs from the owning project manager', async () => {
    class ModalController {
        designerManager: unknown = null;
        constructor() {
            state.instances.push(this);
        }
        create = vi.fn(async (_container: HTMLElement, config: unknown) => {
            state.created.push(config);
            state.createManagers.push(this.designerManager);
        });
        loadComponentData = vi.fn(() => state.loadedManagers.push(this.designerManager));
        updateFilter = vi.fn();
        getConfig = vi.fn(() => ({filter: {enable: false}}));
        setVisible = vi.fn();
        registerEvent = vi.fn();
        destroy = vi.fn();
    }
    state.definitionMap.widget = {getController: () => ModalController};

    const ownerGroup = {id: 'group', type: 'group', childHeader: 'owner-subgroup'};
    const ownerSubgroup = {id: 'owner-subgroup', type: 'group', pid: 'group', childHeader: 'owner-widget'};
    const ownerWidget = {id: 'owner-widget', type: 'widget', pid: 'owner-subgroup', order: 1, x: 5, y: 6, width: 20, height: 10};
    const ownerController = {config: {base: {id: 'owner-widget'}, data: {sourceType: 'static', value: 'from-owner'}}};
    const ownerManager = {
        layerManager: {
            layerConfigs: {group: ownerGroup, 'owner-subgroup': ownerSubgroup, 'owner-widget': ownerWidget},
            controllers: {'owner-widget': ownerController},
        },
    } as any;

    const ambientGroup = {id: 'group', type: 'group', childHeader: 'ambient-subgroup'};
    const ambientSubgroup = {id: 'ambient-subgroup', type: 'group', pid: 'group', childHeader: 'ambient-widget'};
    const ambientChild = {id: 'ambient-widget', type: 'widget', pid: 'ambient-subgroup', order: 1, x: 100, y: 200, width: 20, height: 10};
    const ambientController = {config: {base: {id: 'ambient-widget'}, data: {sourceType: 'static', value: 'from-ambient'}}};
    const ambientManager = {
        layerManager: {
            layerConfigs: {group: ambientGroup, 'ambient-subgroup': ambientSubgroup, 'ambient-widget': ambientChild},
            controllers: {'owner-widget': {config: {data: {sourceType: 'static', value: 'wrong-project'}}}, 'ambient-widget': ambientController},
        },
    };
    (window as any).DATAVISOOL_ENV = {currentManager: ambientManager, mode: 'preview'};

    render(<ModalWrapper
        options={{nodeId: 'group'}}
        designerManager={ownerManager}
        size={{width: 100, height: 100, x: 5, y: 6}}
        onDestroy={vi.fn()}
    />);

    await waitFor(() => expect(state.created).toHaveLength(1));
    expect(state.created[0]).toBe(ownerController.config);
    expect(state.created[0]).toEqual(expect.objectContaining({data: expect.objectContaining({value: 'from-owner'})}));
    expect(state.instances[0].designerManager).toBe(ownerManager);
    expect(state.createManagers).toEqual([ownerManager]);
    expect(state.loadedManagers).toEqual([ownerManager]);
    expect(window.DATAVISOOL_ENV.currentManager).toBe(ambientManager);
});

it('loads popup component data in edit mode without registering runtime events', async () => {
    class EditModeController {
        constructor() { state.instances.push(this); }
        create = vi.fn(async () => undefined);
        setVisible = vi.fn();
        registerEvent = vi.fn();
        loadComponentData = vi.fn();
        updateFilter = vi.fn();
        getConfig = vi.fn(() => ({}));
        destroy = vi.fn();
        changeData = vi.fn();
    }
    state.definitionMap.widget = {getController: () => EditModeController};
    const triggerComponentEvent = vi.fn();
    const config = {base: {id: 'widget'}, data: {sourceType: 'static', value: 1}};
    const manager: any = {
        layerManager: {
            layerConfigs: {widget: {id: 'widget', type: 'widget', x: 0, y: 0, width: 10, height: 10}},
            controllers: {widget: {config}},
        },
        bpExecutor: {triggerComponentEvent},
    };
    (window as any).DATAVISOOL_ENV = {currentManager: manager, mode: DesignerMode.EDIT};

    render(<ModalWrapper options={{nodeId: 'widget'}} designerManager={manager}
        size={{width: 20, height: 20, x: 0, y: 0}} onDestroy={vi.fn()}/>);

    const controller = state.instances.at(-1) as EditModeController;
    await waitFor(() => expect(controller.loadComponentData).toHaveBeenCalledOnce());
    expect(controller.registerEvent).not.toHaveBeenCalled();
    controller.changeData('edit-data');
    expect(triggerComponentEvent).not.toHaveBeenCalled();
});

it('routes a real popup button click to the owning project blueprint executor and destroys its controller on unmount', async () => {
    const executed: any[] = [];
    const destroy = vi.spyOn(BaseButtonController.prototype, 'destroy');
    state.definitionMap.button = {getController: () => BaseButtonController};

    const buttonLayer = {
        id: 'owner-button', type: 'button', order: 1, x: 5, y: 6, width: 80, height: 30,
        hide: false,
    };
    const config = {
        base: {id: 'owner-button', type: 'button'},
        data: {sourceType: 'static', staticData: {value: {}}},
        style: {content: 'Owner button', color: '#fff', fontSize: 14, fontWeight: 400,
            fontFamily: 'Arial', letterSpacing: 0, backgroundColor: '#333', borderRadius: 0,
            borderWidth: 0, borderColor: '#333', borderStyle: 'solid', speed: 1,
            scannerColor: '#fff', hoverShadow: '', hoverBackgroundColor: '#333'},
    };
    const eventNodeId = 'popup-event-node';
    const clickAnchor = `owner-button:click:${AnchorPointType.OUTPUT}`;
    const nextAnchor = `${eventNodeId}:run:${AnchorPointType.INPUT}`;
    const ownerManager: any = {
        id: 'owner-project',
        layerManager: {
            layerConfigs: {group: {id: 'group', type: 'group', childHeader: 'owner-button'}, 'owner-button': buttonLayer},
            controllers: {'owner-button': {config}},
        },
        bluePrintManager: {bpPageMangers: [{
            bpAPMap: {[clickAnchor]: [nextAnchor]},
            bpNodeControllers: {[eventNodeId]: {
                isEnabled: () => true,
                execute: (taskInfo: unknown, params: unknown) => executed.push({taskInfo, params}),
            }},
        }]},
    };
    ownerManager.bpExecutor = new BPExecutor(ownerManager);
    const ambientManager: any = {
        id: 'ambient-project',
        layerManager: {
            layerConfigs: {group: {id: 'group', type: 'group', childHeader: 'ambient-button'}, 'ambient-button': {...buttonLayer, id: 'ambient-button'}},
            controllers: {'owner-button': {config: {...config, style: {...config.style, content: 'Wrong project'}}}},
        },
        bluePrintManager: {bpPageMangers: []},
    };
    (window as any).DATAVISOOL_ENV = {currentManager: ambientManager, mode: 'preview'};

    const view = render(<ModalWrapper
        options={{nodeId: 'group'}}
        designerManager={ownerManager}
        size={{width: 100, height: 100, x: 5, y: 6}}
        onDestroy={vi.fn()}
    />);

    const button = await screen.findByRole('button', {name: 'Owner button'});
    fireEvent.click(button);
    await waitFor(() => expect(executed).toHaveLength(1));
    expect(executed[0].taskInfo).toEqual(expect.objectContaining({
        nodeId: eventNodeId,
        designerManager: ownerManager,
    }));
    expect(executed[0].params).toBe(config);
    expect(destroy).not.toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(destroy).toHaveBeenCalledOnce());
    expect(window.DATAVISOOL_ENV.currentManager).toBe(ambientManager);
    destroy.mockRestore();
});

it('routes one popup changeData event through the owning blueprint executor without wrapping the source controller', async () => {
    const executed: any[] = [];
    state.definitionMap.switch = {getController: () => SwitchController};
    const layer = {id: 'owner-switch', type: 'switch', order: 1, x: 5, y: 6, width: 80, height: 30, hide: false};
    const config = {
        base: {id: 'owner-switch', type: 'switch'},
        data: {sourceType: 'static', value: false},
        style: {token: {}, components: {}, props: {}, label: {}},
    };
    const sourceChangeData = vi.fn();
    const sourceController = {config, changeData: sourceChangeData};
    const eventNodeId = 'popup-data-change-node';
    const dataChangeAnchor = `owner-switch:dataChange:${AnchorPointType.OUTPUT}`;
    const nextAnchor = `${eventNodeId}:run:${AnchorPointType.INPUT}`;
    const ownerManager: any = {
        layerManager: {
            layerConfigs: {group: {id: 'group', type: 'group', childHeader: 'owner-switch'}, 'owner-switch': layer},
            controllers: {'owner-switch': sourceController},
        },
        bluePrintManager: {bpPageMangers: [{
            bpAPMap: {[dataChangeAnchor]: [nextAnchor]},
            bpNodeControllers: {[eventNodeId]: {
                isEnabled: () => true,
                execute: (taskInfo: unknown, params: unknown) => executed.push({taskInfo, params}),
            }},
        }]},
    };
    ownerManager.bpExecutor = new BPExecutor(ownerManager);
    const ambientManager: any = {
        layerManager: {layerConfigs: {}, controllers: {}},
        bluePrintManager: {bpPageMangers: []},
    };
    (window as any).DATAVISOOL_ENV = {currentManager: ambientManager, mode: 'preview'};

    render(<ModalWrapper options={{nodeId: 'group'}} designerManager={ownerManager}
        size={{width: 100, height: 100, x: 5, y: 6}} onDestroy={vi.fn()}/>);

    const toggle = await screen.findByRole('switch');
    await act(async () => {
        fireEvent.click(toggle);
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(executed).toHaveLength(1));
    expect(executed[0].taskInfo).toEqual(expect.objectContaining({
        nodeId: eventNodeId,
        designerManager: ownerManager,
    }));
    expect(executed[0].params).toBe(true);
    expect(sourceController.changeData).toBe(sourceChangeData);
    expect(sourceChangeData).not.toHaveBeenCalled();
    expect(window.DATAVISOOL_ENV.currentManager).toBe(ambientManager);
});

it('skips controller creation when the popup unmounts before its creation task starts', async () => {
    class DeferredController {
        constructor() { state.instances.push(this); }
        create = vi.fn();
        destroy = vi.fn();
        setVisible = vi.fn();
        loadComponentData = vi.fn();
        updateFilter = vi.fn();
        getConfig = vi.fn(() => ({}));
    }
    state.definitionMap.widget = {getController: () => DeferredController};
    const manager: any = {
        layerManager: {
            layerConfigs: {widget: {id: 'widget', type: 'widget', x: 0, y: 0, width: 10, height: 10}},
            controllers: {widget: {config: {base: {id: 'widget'}}}},
        },
        bpExecutor: {triggerComponentEvent: vi.fn()},
    };
    (window as any).DATAVISOOL_ENV = {currentManager: manager, mode: 'preview'};

    const view = render(<ModalWrapper options={{nodeId: 'widget'}} designerManager={manager}
        size={{width: 20, height: 20, x: 0, y: 0}} onDestroy={vi.fn()}/>);
    const controller = state.instances.at(-1) as DeferredController;
    view.unmount();

    await waitFor(() => expect(controller.destroy).toHaveBeenCalledOnce());
    expect(controller.create).not.toHaveBeenCalled();
    expect(controller.loadComponentData).not.toHaveBeenCalled();
});

it('destroys a controller after pending creation resolves following popup unmount', async () => {
    let finishCreate!: () => void;
    const creation = new Promise<void>(resolve => { finishCreate = resolve; });
    class DeferredController {
        constructor() { state.instances.push(this); }
        create = vi.fn(() => creation);
        destroy = vi.fn();
        setVisible = vi.fn();
        loadComponentData = vi.fn();
        updateFilter = vi.fn();
        getConfig = vi.fn(() => ({}));
    }
    state.definitionMap.widget = {getController: () => DeferredController};
    const manager: any = {
        layerManager: {
            layerConfigs: {widget: {id: 'widget', type: 'widget', x: 0, y: 0, width: 10, height: 10}},
            controllers: {widget: {config: {base: {id: 'widget'}}}},
        },
        bpExecutor: {triggerComponentEvent: vi.fn()},
    };
    (window as any).DATAVISOOL_ENV = {currentManager: manager, mode: 'preview'};

    const view = render(<ModalWrapper options={{nodeId: 'widget'}} designerManager={manager}
        size={{width: 20, height: 20, x: 0, y: 0}} onDestroy={vi.fn()}/>);
    const controller = state.instances.at(-1) as DeferredController;
    await waitFor(() => expect(controller.create).toHaveBeenCalledOnce());
    view.unmount();
    finishCreate();

    await waitFor(() => expect(controller.destroy).toHaveBeenCalledOnce());
    expect(controller.loadComponentData).not.toHaveBeenCalled();
});

it('contains controller destroy errors during popup cleanup', async () => {
    class ThrowingDestroyController {
        constructor() { state.instances.push(this); }
        create = vi.fn(async () => undefined);
        destroy = vi.fn(() => { throw new Error('destroy failed'); });
        setVisible = vi.fn();
        registerEvent = vi.fn();
        loadComponentData = vi.fn();
        updateFilter = vi.fn();
        getConfig = vi.fn(() => ({}));
    }
    state.definitionMap.widget = {getController: () => ThrowingDestroyController};
    const manager: any = {
        layerManager: {
            layerConfigs: {widget: {id: 'widget', type: 'widget', x: 0, y: 0, width: 10, height: 10}},
            controllers: {widget: {config: {base: {id: 'widget'}}}},
        },
        bpExecutor: {triggerComponentEvent: vi.fn()},
    };
    (window as any).DATAVISOOL_ENV = {currentManager: manager, mode: 'preview'};
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = render(<ModalWrapper options={{nodeId: 'widget'}} designerManager={manager}
        size={{width: 20, height: 20, x: 0, y: 0}} onDestroy={vi.fn()}/>);
    const controller = state.instances.at(-1) as ThrowingDestroyController;
    await waitFor(() => expect(controller.loadComponentData).toHaveBeenCalledOnce());
    view.unmount();

    await waitFor(() => expect(controller.destroy).toHaveBeenCalledOnce());
    expect(logError).toHaveBeenCalledWith('popup component controller destroy failed', expect.any(Error));
    logError.mockRestore();
});
