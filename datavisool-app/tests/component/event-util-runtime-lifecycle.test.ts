/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, expect, it, vi} from 'vitest';
import {DesignerScene} from '@datavisool/sdk/types';
vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});
import DesignerManager from '@/designer/manager/DesignerManager';
import EventUtil from '@/designer/blueprint/util/EventUtil';

afterEach(() => vi.useRealTimers());

it('cancels the component-readiness wait when its manager is destroyed', () => {
    vi.useFakeTimers();
    const manager = new DesignerManager(DesignerScene.DEFAULT);
    const triggerComponentEvent = vi.fn();
    manager.bpExecutor.triggerComponentEvent = triggerComponentEvent;
    manager.layerManager.layerConfigs = {pending: {} as any};

    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(1);

    manager.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(triggerComponentEvent).not.toHaveBeenCalled();
});

it('stops repeating blueprint timer nodes when their manager is destroyed', () => {
    vi.useFakeTimers();
    const manager = new DesignerManager(DesignerScene.DEFAULT);
    const triggerComponentEvent = vi.fn();
    manager.bpExecutor.triggerComponentEvent = triggerComponentEvent;
    manager.bluePrintManager.bpPageMangers = [{
        bpNodeLayoutMap: {timer: {id: 'timer', type: 'BPTimerNode'}},
        bpNodeConfigMap: {timer: {interval: 1, loop: true}},
        destroy() {},
    } as any];

    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent).toHaveBeenCalledWith('timer', 'scheduledExecute', null);
    expect(vi.getTimerCount()).toBe(1);

    const callsBeforeDestroy = triggerComponentEvent.mock.calls.length;
    manager.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(triggerComponentEvent).toHaveBeenCalledTimes(callsBeforeDestroy);
});

it('restarting global events replaces the previous manager timer session', () => {
    vi.useFakeTimers();
    const manager = new DesignerManager(DesignerScene.DEFAULT);
    const triggerComponentEvent = vi.fn();
    manager.bpExecutor.triggerComponentEvent = triggerComponentEvent;
    manager.bluePrintManager.bpPageMangers = [{
        bpNodeLayoutMap: {timer: {id: 'timer', type: 'BPTimerNode'}},
        bpNodeConfigMap: {timer: {interval: 1, loop: true}},
        destroy() {},
    } as any];

    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(50);
    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent.mock.calls.filter(([, event]) => event === 'scheduledExecute')).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);

    manager.destroy();
    expect(vi.getTimerCount()).toBe(0);
});

it('does not schedule a timer when a node destroys its manager during the immediate event', () => {
    vi.useFakeTimers();
    const manager = new DesignerManager(DesignerScene.DEFAULT);
    const triggerComponentEvent = vi.fn((_id: string, event: string) => {
        if (event === 'scheduledExecute') manager.destroy();
    });
    manager.bpExecutor.triggerComponentEvent = triggerComponentEvent;
    manager.bluePrintManager.bpPageMangers = [{
        bpNodeLayoutMap: {timer: {id: 'timer', type: 'BPTimerNode'}},
        bpNodeConfigMap: {timer: {interval: 1, loop: true}},
        destroy() {},
    } as any];

    EventUtil.triggerGlobalEvent(manager);
    vi.advanceTimersByTime(50);
    expect(triggerComponentEvent).toHaveBeenCalledOnce();
    expect(triggerComponentEvent).toHaveBeenCalledWith('timer', 'scheduledExecute', null);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(triggerComponentEvent).toHaveBeenCalledOnce();
});
