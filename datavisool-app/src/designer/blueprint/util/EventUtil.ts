/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type DesignerManager from "@/designer/manager/DesignerManager.ts";
import {isBlueprintNodeEnabled} from "@/designer/blueprint/util/BPNodeEnableUtil.ts";
import {beginComponentLoadEvents, dispatchGlobalComponentLoads, isComponentReady} from "./ComponentLoadTracker";

type RuntimeTimers = {
    waitTimer: ReturnType<typeof setInterval> | null;
    nodeTimers: Set<ReturnType<typeof setInterval>>;
};

const runtimeTimers = new WeakMap<DesignerManager, RuntimeTimers>();

/**
 * 事件工具类
 */
export default class EventUtil {

    /** Stop delayed global startup and blueprint timer events owned by a manager. */
    public static cancelGlobalEvent = (manager: DesignerManager): void => {
        const timers = runtimeTimers.get(manager);
        if (!timers)
            return;
        if (timers.waitTimer !== null)
            clearInterval(timers.waitTimer);
        timers.nodeTimers.forEach(timer => clearInterval(timer));
        runtimeTimers.delete(manager);
    }

    /**
     * 触发全局事件
     * @param manager 设计器管理器
     */
    public static triggerGlobalEvent = (manager: DesignerManager) => {
        // A manager may be initialized again after a project reload. Only its
        // latest runtime session may emit startup or timer events.
        EventUtil.cancelGlobalEvent(manager);
        const timers: RuntimeTimers = {waitTimer: null, nodeTimers: new Set()};
        runtimeTimers.set(manager, timers);
        const isRuntimeActive = () => runtimeTimers.get(manager) === timers;
        let count = 0;
        beginComponentLoadEvents(manager);
        const disabledNodeIds = new Set<string>();
        manager.bluePrintManager?.bpPageMangers.forEach((pageManager) => {
            Object.entries(pageManager.bpNodeConfigMap ?? {}).forEach(([nodeId, config]) => {
                if (!isBlueprintNodeEnabled(config))
                    disabledNodeIds.add(nodeId);
            });
        });
        const triggerTimer = setInterval(() => {
            const controllers = manager.layerManager.controllers ?? {};
            const allReady = Object.keys(manager.layerManager.layerConfigs).every(id => !!controllers[id])
                && Object.values(controllers).every(isComponentReady);
            if (allReady || count > 100) {
                //触发组件加载完成事件
                dispatchGlobalComponentLoads(manager);
                if (!isRuntimeActive()) return;
                //触发蓝图事件
                manager.bluePrintManager?.bpPageMangers.forEach((pageManager) => {
                    if (!isRuntimeActive()) return;
                    Object.values(pageManager?.bpNodeLayoutMap ?? {}).forEach((nodeLayout) => {
                        if (!isRuntimeActive()) return;
                        const {type, id = ''} = nodeLayout;
                        if (disabledNodeIds.has(id))
                            return;
                        if (type === 'BPGlobalNode') { //全局节点事件
                            manager.bpExecutor?.triggerComponentEvent(id, 'allLoaded', null);
                        }
                        if (type === 'BPTimerNode') { //定时器节点事件
                            const {interval = 5, loop = true} = pageManager.bpNodeConfigMap[id] ?? {};
                            manager.bpExecutor?.triggerComponentEvent(id, 'scheduledExecute', null);
                            // Executing a blueprint can synchronously destroy or
                            // restart this manager, so do not create an old timer.
                            if (!isRuntimeActive()) return;
                            const timer = setInterval(() => {
                                if (!isRuntimeActive()) {
                                    clearInterval(timer);
                                    timers.nodeTimers.delete(timer);
                                    return;
                                }
                                manager.bpExecutor?.triggerComponentEvent(id, 'scheduledExecute', null);
                                if (!loop) {
                                    clearInterval(timer);
                                    timers.nodeTimers.delete(timer);
                                }
                            }, interval * 1000);
                            timers.nodeTimers.add(timer);
                        }
                    })
                })
                if (!isRuntimeActive()) return;
                //启动全局变量设定了自动更新的任务
                Object.values(manager.globalVariableManager.globalVariableInstance).forEach((gv) => {
                    if (!isRuntimeActive()) return;
                    if (disabledNodeIds.has(gv.id))
                        return;
                    gv.start(
                        {controllers: manager.layerManager.controllers, manager},
                        manager.bpExecutor
                    )
                })
                if (!isRuntimeActive()) return;
                clearInterval(triggerTimer);
                timers.waitTimer = null;
            }
            count++;
        }, 50);
        timers.waitTimer = triggerTimer;
    }
}
