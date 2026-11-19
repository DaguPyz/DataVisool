/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import type {BPLogicalProcessNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";


export default class BPLogicalProcessNodeController extends AbstractBPNodeController<BPLogicalProcessNodeConfig> {

    // eslint-disable-next-line @typescript-eslint/ban-types
    private handler: Function | null = null;


    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, task, designerManager} = taskInfo;
        if (!this.handler) {
            if (!this.config?.handler)
                return;
            try {
                this.handler = SafeEvalUtil.run(this.config.handler);
            } catch (e) {
                console.error('解析条件函数错误，请检查你写条件判断函数');
                return;
            }
        }
        const apId = nodeId + ':afterExecute:' + AnchorPointType.OUTPUT;
        const result = this.handler && this.handler(params);
        if (result == null)
            return;
        if (result instanceof Promise) {
            result.then(params => {
                task.run(apId, task, designerManager, params);
            })
        } else {
            task.run(apId, task, designerManager, result);
        }
    }

    getConfig(): BPLogicalProcessNodeConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "逻辑处理",
            type: "BPLogicalProcessNode",
            input: [
                {
                    id: nodeId + ':execute:' + AnchorPointType.INPUT,
                    name: "执行",
                    type: AnchorPointType.INPUT
                }
            ],
            output: [
                {
                    id: nodeId + ":afterExecute:" + AnchorPointType.OUTPUT,
                    name: "执行后",
                    type: AnchorPointType.OUTPUT
                }
            ]
        };
    }


}
