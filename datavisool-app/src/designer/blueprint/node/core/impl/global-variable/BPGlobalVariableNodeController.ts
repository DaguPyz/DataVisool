/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import BPNode from "@/designer/blueprint/node/BPNode";
import React from "react";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {CodeBrackets} from "@icon-park/react";

export interface BPGlobalVariableConfig extends NodeInfoType {

}

export default class BPGlobalVariableNodeController extends AbstractBPNodeController<BPGlobalVariableConfig> {

    async create(container: HTMLElement, config: BPGlobalVariableConfig): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender(container, BPNode, {
            ...config,
            titleBgColor: "#ff8200",
            icon: CodeBrackets
        });
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, anchorType, designerManager} = taskInfo;
        //蓝图逻辑执行入口一定是从输入点开始执行
        if (anchorType !== AnchorPointType.INPUT)
            return;

        //找到全局变量
        if (!designerManager.globalVariableManager.globalVariableInstance)
            return;
        const gv = designerManager.globalVariableManager.globalVariableInstance[nodeId];
        if (!gv)
            return;
        gv.setValue(params);
        /** 全局变量的蓝图逻辑到此结束。 当修改全局变量节点时，会单独触发蓝图节点的数据变更时事件，而不是通过这里的逻辑流转到下一个节点 **/
    }

    getConfig(): BPGlobalVariableConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        const {globalVariableInstance} = window.DATAVISOOL_ENV.currentManager?.globalVariableManager ?? {}
        if (!globalVariableInstance)
            return null;
        const gv = globalVariableInstance[nodeId];
        if (!gv)
            return null;
        return {
            id: nodeId,
            name: gv.key,
            type: "BPGlobalVariable",
            input: [
                {
                    id: nodeId + ':gvUpdateData:' + AnchorPointType.INPUT,
                    name: "更新数据",
                    type: AnchorPointType.INPUT
                }
            ],
            output: [
                {
                    id: nodeId + ":gvDataChange:" + AnchorPointType.OUTPUT,
                    name: "数据变更时",
                    type: AnchorPointType.OUTPUT
                }
            ]
        };
    }

    getConfigComponent(): React.ComponentType | null {
        return null;
    }

}
