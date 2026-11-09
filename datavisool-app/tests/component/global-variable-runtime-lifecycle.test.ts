/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';

const updaterState = vi.hoisted(() => ({
    instances: [] as Array<{run: ReturnType<typeof vi.fn>, destroy: ReturnType<typeof vi.fn>}>,
    runHook: null as null | ((success: (value: unknown) => void, config: any) => void),
}));
vi.mock('@/framework/core/tools/ComponentDataUpdater.ts', () => ({
    default: class {
        success: (value: unknown) => void;
        run = vi.fn((config: any) => updaterState.runHook?.(this.success, config));
        destroy = vi.fn();
        constructor(success: (value: unknown) => void) {
            this.success = success;
            updaterState.instances.push(this);
        }
    },
}));

import GlobalVariable from '@/designer/left/global-variable/GlobalVariable';
import GlobalVariableManager from '@/designer/manager/GlobalVariableManager';
import EventUtil from '@/designer/blueprint/util/EventUtil';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    vi.useRealTimers();
    updaterState.instances.length = 0;
    updaterState.runHook = null;
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
});

it('restarting a manager replaces global-variable updaters and manager destruction stops the active updater', () => {
    vi.useFakeTimers();
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    const variable = new GlobalVariable('global-1', 'reading', null, false, [], {sourceType: 'webSocket'} as any);
    const firstExecutor = {triggerComponentEvent: vi.fn()} as any;
    const secondExecutor = {triggerComponentEvent: vi.fn()} as any;

    const globalVariableManager = new GlobalVariableManager();
    globalVariableManager.globalVariableInstance = {'global-1': variable};
    const manager = {
        layerManager: {layerConfigs: {}, controllers: {}},
        bluePrintManager: {bpPageMangers: []},
        globalVariableManager,
        bpExecutor: firstExecutor,
    } as any;
    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(50);
    expect(updaterState.instances).toHaveLength(1);

    manager.bpExecutor = secondExecutor;
    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(50);
    expect(updaterState.instances).toHaveLength(2);
    expect(updaterState.instances[0].destroy).toHaveBeenCalledOnce();
    expect(updaterState.instances[1].run).toHaveBeenCalledOnce();

    globalVariableManager.destroy();
    EventUtil.cancelGlobalEvent(manager);
    expect(updaterState.instances[1].destroy).toHaveBeenCalledOnce();

    variable.setValue(42);
    expect(secondExecutor.triggerComponentEvent).not.toHaveBeenCalled();
});

it('does not start later bound targets when an updater synchronously destroys the manager', () => {
    (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};
    const globalVariableManager = new GlobalVariableManager();
    const firstChangeData = vi.fn(() => globalVariableManager.destroy());
    const secondChangeData = vi.fn();
    const firstController = {getConfig: () => ({data: {target: 'first'}}), changeData: firstChangeData};
    const secondController = {getConfig: () => ({data: {target: 'second'}}), changeData: secondChangeData};
    const executor = {triggerComponentEvent: vi.fn()} as any;
    const variable = new GlobalVariable('global-2', 'reading', null, true, ['first', 'second']);
    globalVariableManager.globalVariableInstance = {'global-2': variable};
    variable.start({controllers: {first: firstController, second: secondController} as any}, executor);
    updaterState.runHook = (success, config) => {
        if (config.target === 'first') success('updated');
    };

    variable.setValue(7);

    expect(updaterState.instances).toHaveLength(1);
    expect(updaterState.instances[0].destroy).toHaveBeenCalledOnce();
    expect(firstChangeData).toHaveBeenCalledWith('updated');
    expect(secondChangeData).not.toHaveBeenCalled();
    expect(executor.triggerComponentEvent).not.toHaveBeenCalled();
});
