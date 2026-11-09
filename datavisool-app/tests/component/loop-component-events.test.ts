/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});
import {AnchorPointType, DesignerMode} from '@datavisool/sdk/types';
import GroupLayerController from '@/comps/group-layer/GroupLayerController';
import {SwitchController} from '@/comps/builtin/base-switch/BaseSwitchController';
import {AntdBaseDesignerController} from '@/comps/antd-common/AntdBaseDesignerController';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';
import BPLayerNodeController from '@/designer/blueprint/node/core/impl/layer/BPLayerNodeController';
import DesignerLoader from '@/designer/loader/DesignerLoader';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

describe('events from components in a loop', () => {
    it('forwards the group index for loaded and click, including zero', async () => {
        (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
        const executor = {triggerComponentEvent: vi.fn()};
        const instance = {setEventHandler: vi.fn()};
        const config = {base: {id: 'group'}};
        const controller = new GroupLayerController();
        await controller.createGroupLayerInstance(document.createElement('div'), config as any, instance as any, executor as any, 0);
        instance.setEventHandler.mock.calls[0][0].click();
        expect(executor.triggerComponentEvent.mock.calls).toEqual([
            ['group', 'loaded', config, 0],
            ['group', 'click', config, 0],
        ]);
    });

    it('forwards switch values and the correct index; outside loops the index stays undefined', () => {
        for (const index of [2, undefined]) {
            const controller = new SwitchController() as any;
            const executor = {triggerComponentEvent: vi.fn()};
            const instance = {setEventHandler: vi.fn()};
            controller.index = index;
            controller.config = {base: {id: 'switch'}};
            controller.bpExecutor = executor;
            controller.instance = instance;
            controller.registerEvent();
            const handlers = instance.setEventHandler.mock.calls[0][0];
            handlers.change(true);
            handlers.off();
            expect(executor.triggerComponentEvent.mock.calls).toEqual([
                ['switch', 'change', true, index],
                ['switch', 'off', controller.config, index],
            ]);
        }
    });

    it('forwards chart element data and its loop index', () => {
        const controller = new (AntdBaseDesignerController as any)();
        const executor = {triggerComponentEvent: vi.fn()};
        const handlers: Record<string, (...args: any[]) => void> = {};
        controller.index = 3;
        controller.config = {base: {id: 'chart'}};
        controller.bpExecutor = executor;
        controller.instance = {on: (event: string, handler: (...args: any[]) => void) => { handlers[event] = handler; }};
        controller.registerEvent();
        handlers['element:click']({data: {data: {value: 42}}});
        expect(executor.triggerComponentEvent).toHaveBeenCalledWith('chart', 'elementClick',
            {selectedData: {value: 42}, base: {id: 'chart'}}, 3);
    });

    it('executes the blueprint action on the matching loop instance', () => {
        const oldDefinitions = DesignerLoader.definitionMap;
        try {
            const action = vi.fn();
            DesignerLoader.definitionMap = {example: {getActionList: () => [{id: 'update', handler: action}]}} as any;
            const node = new BPLayerNodeController();
            vi.spyOn(node, 'isEnabled').mockReturnValue(true);
            const target0 = {name: 'first'}, target2 = {name: 'third'};
            const manager = {
                layerManager: {controllers: {target_0: target0, target_2: target2}, layerConfigs: {target: {type: 'example'}}},
                bluePrintManager: {bpPageMangers: [{
                    bpAPMap: {[`switch:change:${AnchorPointType.OUTPUT}`]: [`target:update:${AnchorPointType.INPUT}`]},
                    bpNodeControllers: {target: node},
                }]},
            };
            const switchController = new SwitchController() as any;
            const instance = {setEventHandler: vi.fn()};
            Object.assign(switchController, {index: 2, config: {base: {id: 'switch'}},
                bpExecutor: new BPExecutor(manager as any), instance});
            switchController.registerEvent();
            instance.setEventHandler.mock.calls[0][0].change(true);
            expect(action).toHaveBeenCalledOnce();
            expect(action).toHaveBeenCalledWith(target2, true);
        } finally {
            DesignerLoader.definitionMap = oldDefinitions;
        }
    });
});
