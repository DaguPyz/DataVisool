/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import type {ActionInfo} from "@/framework/core/AbstractDesignerDefinition.ts";


export default class BPLayerNodeController extends AbstractBPNodeController<NodeInfoType> {


    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, apId, anchorType, designerManager, task} = taskInfo;
        if (anchorType === AnchorPointType.INPUT) {
            //输入点，执行动作
            //1.获取当前组件的控制器实例
            const {controllers, layerConfigs} = designerManager.layerManager!;
            const controller = controllers[task?.index != null ? nodeId + "_" + task.index : nodeId]
            if (!controller)
                return;
            const type = layerConfigs[nodeId]?.type;
            const actionList = type ? designerManager.runtimeContext?.registry.definitions[type]?.getActionList() : undefined;
            //2.获取当前组件可执行的动作列表
            const action = actionList?.find((action: ActionInfo) => action.id === apId);
            if (!action)
                return;
            //3.执行动作
            action.handler(controller, params);
        }
        //输出点不做处理，到达图层节点的输入类型锚点后不在向下继续查找执行
    }

    getConfig(): NodeInfoType | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return this.readSceneNodeInfo('BPLayerNode', nodeId);
    }


}
