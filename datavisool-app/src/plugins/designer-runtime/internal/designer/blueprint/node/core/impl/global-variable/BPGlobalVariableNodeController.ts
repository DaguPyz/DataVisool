/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import type {BPGlobalVariableConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";


export default class BPGlobalVariableNodeController extends AbstractBPNodeController<BPGlobalVariableConfig> {


    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, anchorType, designerManager} = taskInfo;
        //蓝图逻辑执行入口一定是从输入点开始执行
        if (anchorType !== AnchorPointType.INPUT)
            return;

        //找到全局变量
        const variableOwner = designerManager.variableOwner ?? designerManager;
        if (!variableOwner.globalVariableManager.globalVariableInstance)
            return;
        const gv = variableOwner.globalVariableManager.globalVariableInstance[nodeId];
        if (!gv)
            return;
        gv.setValue(params);
        /** 全局变量的蓝图逻辑到此结束。 当修改全局变量节点时，会单独触发蓝图节点的数据变更时事件，而不是通过这里的逻辑流转到下一个节点 **/
    }

    getConfig(): BPGlobalVariableConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return this.readSceneNodeInfo('BPGlobalVariableNode', nodeId);
    }


}
