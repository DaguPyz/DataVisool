/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, expect, it, vi} from 'vitest';
import EventUtil from '@/designer/blueprint/util/EventUtil';
import {markComponentPending, markComponentReady} from '@/designer/blueprint/util/ComponentLoadTracker';

afterEach(() => vi.useRealTimers());

it('waits for each layer and triggers loaded once per controller with its loop index', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const first = {config: {base: {id: 'first'}}, index: 1};
    const second = {config: {base: {id: 'second'}}};
    const controllers: Record<string, any> = {first, first_1: first};
    const manager = {
        layerManager: {layerConfigs: {first: {}, second: {}}, controllers},
        bluePrintManager: {bpPageMangers: []},
        bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    EventUtil.triggerGlobalEvent(manager as any);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    controllers.second = second;
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent.mock.calls).toEqual([
        ['first', 'loaded', first.config, 1],
        ['second', 'loaded', second.config, undefined],
    ]);
    expect(vi.getTimerCount()).toBe(0);
});

it('skips controllers whose configuration is unavailable after the wait limit', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const manager = {
        layerManager: {layerConfigs: {missing: {}}, controllers: {stale: {config: null}}},
        bluePrintManager: {bpPageMangers: []},
        bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    EventUtil.triggerGlobalEvent(manager as any);
    expect(() => vi.advanceTimersByTime(5200)).not.toThrow();
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
});

it('waits for an asynchronously initialized controller before emitting loaded', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const controller = {config: {base: {id: 'async'}}, index: 0};
    const manager = {
        layerManager: {layerConfigs: {async: {}}, controllers: {async: controller}},
        bluePrintManager: {bpPageMangers: []}, bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    markComponentPending(controller as any);
    EventUtil.triggerGlobalEvent(manager as any);
    vi.advanceTimersByTime(1000);
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    markComponentReady(manager as any, controller as any);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent.mock.calls).toEqual([['async', 'loaded', controller.config, 0]]);
});

it('delivers loaded once when initialization finishes after the global wait limit', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const controller = {config: {base: {id: 'slow'}}};
    const manager = {
        layerManager: {layerConfigs: {slow: {}}, controllers: {slow: controller}},
        bluePrintManager: {bpPageMangers: []}, bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    markComponentPending(controller as any);
    EventUtil.triggerGlobalEvent(manager as any);
    vi.advanceTimersByTime(5200);
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    markComponentReady(manager as any, controller as any);
    markComponentReady(manager as any, controller as any);
    expect(triggerComponentEvent.mock.calls).toEqual([['slow', 'loaded', controller.config, undefined]]);
    expect(vi.getTimerCount()).toBe(0);
});

it('waits for every indexed instance, even when the primary controller is ready', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const first = {config: {base: {id: 'loop-item'}}, index: 0};
    const second = {config: {base: {id: 'loop-item'}}, index: 1};
    const manager = {
        layerManager: {layerConfigs: {'loop-item': {}}, controllers: {'loop-item': second, 'loop-item_0': first, 'loop-item_1': second}},
        bluePrintManager: {bpPageMangers: []}, bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    markComponentPending(first as any);
    EventUtil.triggerGlobalEvent(manager as any);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent).not.toHaveBeenCalled();
    markComponentReady(manager as any, first as any);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent).toHaveBeenCalledTimes(2);
    expect(triggerComponentEvent).toHaveBeenCalledWith('loop-item', 'loaded', first.config, 0);
    expect(triggerComponentEvent).toHaveBeenCalledWith('loop-item', 'loaded', second.config, 1);
});

it('does not emit global loaded for groups and loop containers that emit it themselves', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const group = {config: {base: {id: 'group', type: 'group'}}};
    const loop = {config: {base: {id: 'loop', type: 'LoopContainer'}}};
    const normal = {config: {base: {id: 'text', type: 'BaseText'}}};
    const manager = {
        layerManager: {layerConfigs: {group: {}, loop: {}, text: {}}, controllers: {group, loop, text: normal}},
        bluePrintManager: {bpPageMangers: []}, bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    EventUtil.triggerGlobalEvent(manager as any);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent.mock.calls).toEqual([['text', 'loaded', normal.config, undefined]]);
});

it('lets an active map emit loaded itself while the empty map placeholder uses the global event', () => {
    vi.useFakeTimers();
    const triggerComponentEvent = vi.fn();
    const map = {config: {base: {id: 'map', type: 'MapLibreGis'}}, hasActiveMap: () => true};
    const empty = {config: {base: {id: 'empty', type: 'MapLibreGis'}}, hasActiveMap: () => false};
    const manager = {
        layerManager: {layerConfigs: {map: {}, empty: {}}, controllers: {map, empty}},
        bluePrintManager: {bpPageMangers: []}, bpExecutor: {triggerComponentEvent},
        globalVariableManager: {globalVariableInstance: {}},
    };
    EventUtil.triggerGlobalEvent(manager as any);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent.mock.calls).toEqual([['empty', 'loaded', empty.config, undefined]]);
});
