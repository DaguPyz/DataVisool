/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AnchorPointType} from "@datavisool/sdk/types";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import BluePrintPageManger from "@/designer/blueprint/manager/BluePrintPageManager.ts";

export default class BPTask {
    /**
     * 单次逻辑链路执行次数统计，防止死循环
     */
    private executeCount: number = 0;

    /**
     * 组件实例索引（循环渲染时使用）
     */
    public index?: number;

    /**
     * 蓝图节点执行器，蓝图网络的执行入口
     * @param apId 蓝图锚点id
     * @param task 当前执行器
     * @param designerManager 运行环境
     * @param params 节点间传递的参数
     */
    public run(apId: string, task: BPTask, designerManager: DesignerManager, params: any): void {
        //执行逻辑保护，一条路径执行的中间节点次数超过1000次，说明可能出现了死循环，直接终止
        if (task.executeCount > 10000) {
            console.warn("蓝图单条路径执行次数超过1000，请检查是否出现死循环逻辑！")
            return;
        }
        task.executeCount++;

        if (!apId || apId === "")
            return;
        const anchorInfoArr = apId.split(":");
        if (anchorInfoArr.length !== 3)
            return;
        const {bpPageMangers} = designerManager.bluePrintManager!;
        bpPageMangers?.forEach((bpPageManager: BluePrintPageManger) => {
            const {bpAPMap, bpNodeControllers} = bpPageManager;
            const nextAnchorIds = bpAPMap[apId];
            if (!nextAnchorIds)
                return;
            //分发执行已链接的下一个节点
            nextAnchorIds.forEach((nextAnchorId: string) => {
                const [nodeId, apId, anchorType] = nextAnchorId.split(":");
                const nodeController = bpNodeControllers[nodeId!];
                if (!nodeController) {
                    console.warn("蓝图节点控制器不存在，跳过执行", {nodeId, apId, anchorType});
                    return;
                }
                if (!nodeController.isEnabled()) {
                    console.warn("蓝图节点已禁用，跳过执行", {nodeId, apId, anchorType});
                    return;
                }
                nodeController.execute({
                    apId,
                    nodeId,
                    anchorType: parseInt(anchorType) as AnchorPointType,
                    task,
                    designerManager
                }, params);
            });
        })
    }
}
