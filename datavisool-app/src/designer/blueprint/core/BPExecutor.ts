/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 蓝图执行器
 * 说明：蓝图设计器中编辑的事件路径统一通过蓝图执行器进行执行，包括事件的触发、事件的执行、事件的终止等
 */
import BPTask from "./BPTask.ts";
import {AnchorPointType} from "@datavisool/sdk/types";
import DesignerManager from "@/designer/manager/DesignerManager.ts";

export default class BPExecutor {

    private readonly designerManager: DesignerManager;

    constructor(designerManager: DesignerManager) {
        this.designerManager = designerManager;
    }


    /**
     * 触发组件事件
     * @param componentId 组件id
     * @param eventId 事件id
     * @param params 事件参数
     * @param index 组件索引(循环渲染时使用)
     */
    public triggerComponentEvent(componentId: string, eventId: string, params: any, index?: number): void {
        const anchorId = componentId + ":" + eventId + ":" + AnchorPointType.OUTPUT;
        const task = new BPTask();
        task.index = index;
        task.run(anchorId, task, this.designerManager, params)
    }

}