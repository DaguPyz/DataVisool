/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type DesignerManager from "@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts";
import {isBlueprintNodeEnabled} from "@/plugins/designer-runtime/internal/designer/blueprint/util/BPNodeEnableUtil.ts";
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
        if (!manager.isRuntimeActive()) return;
        // A manager may be initialized again after a project reload. Only its
        // latest runtime session may emit startup or timer events.
        EventUtil.cancelGlobalEvent(manager);
        const timers: RuntimeTimers = {waitTimer: null, nodeTimers: new Set()};
        runtimeTimers.set(manager, timers);
        const isRegistered = () => runtimeTimers.get(manager) === timers && manager.isRuntimeActive();
        const isRuntimeActive = () => isRegistered() && manager.isRuntimeEffectActive();
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
            if (!isRuntimeActive()) {
                count++;
                return;
            }
            const controllers = manager.layerManager.controllers ?? {};
            const allReady = Object.keys(manager.layerManager.layerConfigs).every(id => !!controllers[id])
                && Object.values(controllers).every(isComponentReady);
            if (allReady || count > 100) {
                //触发组件加载完成事件
                dispatchGlobalComponentLoads(manager);
                if (!isRegistered()) return;
                if (!manager.isRuntimeEffectActive()) return;
                //触发蓝图事件
                manager.bluePrintManager?.bpPageMangers.forEach((pageManager) => {
                    if (!isRegistered()) return;
                    if (!manager.isRuntimeEffectActive()) return;
                    Object.values(pageManager?.bpNodeLayoutMap ?? {}).forEach((nodeLayout) => {
                        if (!isRegistered()) return;
                        if (!manager.isRuntimeEffectActive()) return;
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
                            if (!isRegistered()) {
                                    clearInterval(timer);
                                    timers.nodeTimers.delete(timer);
                                    return;
                                }
                            if (!manager.isRuntimeEffectActive()) return;
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
                if (!isRegistered() || !manager.isRuntimeEffectActive()) return;
                //启动全局变量设定了自动更新的任务
                Object.values(manager.globalVariableManager.globalVariableInstance).forEach((gv) => {
                    if (!isRegistered() || !manager.isRuntimeEffectActive()) return;
                    if (disabledNodeIds.has(gv.id))
                        return;
                    gv.start(
                        {controllers: manager.layerManager.controllers, manager},
                        manager.bpExecutor
                    )
                })
                if (!isRegistered() || !manager.isRuntimeEffectActive()) return;
                clearInterval(triggerTimer);
                timers.waitTimer = null;
            }
            count++;
        }, 50);
        timers.waitTimer = triggerTimer;
    }
}
