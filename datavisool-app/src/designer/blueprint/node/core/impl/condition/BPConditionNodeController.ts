/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import BPNode, {NodeProps} from "@/designer/blueprint/node/BPNode";
import React from "react";
import {ConditionNodeConfig} from "./ConditionNodeConfig";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {Fork} from "@icon-park/react";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";

export interface IConditionNodeConfig extends NodeInfoType {
    handler?: string;
}

export default class BPConditionNodeController extends AbstractBPNodeController<IConditionNodeConfig> {

    // eslint-disable-next-line @typescript-eslint/ban-types
    private handler: Function | null = null;

    async create(container: HTMLElement, config: IConditionNodeConfig): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleChanger: (v) => this.config!.name = v,
            titleBgColor: "#247ba6",
            icon: Fork
        });
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, anchorType, task, designerManager} = taskInfo;
        //输出类型节点不执行
        if (anchorType === 1)
            return;
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
        const result = this.handler!(params);
        if (result) {
            const anchorId = nodeId + ":satisfy:" + AnchorPointType.OUTPUT;
            task.run(anchorId, task, designerManager, params);
        } else {
            const anchorId = nodeId + ':unSatisfy:' + AnchorPointType.OUTPUT;
            task.run(anchorId, task, designerManager, params);
        }
    }

    getConfig(): IConditionNodeConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId?: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "条件判断",
            type: "BPConditionNode",
            input: [
                {
                    id: nodeId + ':judge:' + AnchorPointType.INPUT,
                    name: "判断",
                    type: AnchorPointType.INPUT
                }
            ],
            output: [
                {
                    id: nodeId + ":satisfy:" + AnchorPointType.OUTPUT,
                    name: "满足",
                    type: AnchorPointType.OUTPUT
                },
                {
                    id: nodeId + ':unSatisfy:' + AnchorPointType.OUTPUT,
                    name: "不满足",
                    type: AnchorPointType.OUTPUT
                }
            ]
        };
    }

    public getConfigComponent(): React.ComponentType | null {
        return ConditionNodeConfig;
    }

}
