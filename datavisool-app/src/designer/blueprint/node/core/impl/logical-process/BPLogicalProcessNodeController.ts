/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import BPNode, {NodeProps} from "@/designer/blueprint/node/BPNode";
import React from "react";
import {LogicalProcessNodeConfig} from "./LogicalProcessNodeConfig";
import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {Ring} from "@icon-park/react";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";

export interface LogicalProcessNodeConfigType extends NodeInfoType {
    handler?: string;
}

export default class BPLogicalProcessNodeController extends AbstractBPNodeController<LogicalProcessNodeConfigType> {

    // eslint-disable-next-line @typescript-eslint/ban-types
    private handler: Function | null = null;

    async create(container: HTMLElement, config: LogicalProcessNodeConfigType): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleBgColor: "#a62469",
            titleChanger: (v) => this.config!.name = v,
            icon: Ring
        });
    }

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

    getConfig(): LogicalProcessNodeConfigType | null {
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

    getConfigComponent(): React.ComponentType | null {
        return LogicalProcessNodeConfig;
    }

}
