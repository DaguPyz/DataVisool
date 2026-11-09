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
import {ActionInfo} from "@/framework/core/AbstractDesignerDefinition.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {ConnectionPoint} from "@icon-park/react";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";


export default class BPLayerNodeController extends AbstractBPNodeController<NodeInfoType> {

    async create(container: HTMLElement, config: NodeInfoType): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender(container, BPNode, {
            ...config,
            titleBgColor: "#247057",
            icon: ConnectionPoint
        });
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        const {nodeId, apId, anchorType, designerManager, task} = taskInfo;
        if (anchorType === AnchorPointType.INPUT) {
            //输入点，执行动作
            //1.获取当前组件的控制器实例
            const {controllers, layerConfigs} = designerManager.layerManager!;
            const controller = controllers[task?.index != null ? nodeId + "_" + task.index : nodeId]
            if (!controller)
                return;
            const {type} = layerConfigs[nodeId];
            const actionList = DesignerLoader.definitionMap[type!].getActionList();
            //2.获取当前组件可执行的动作列表
            const action = actionList.find((action: ActionInfo) => action.id === apId);
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
        if (!window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs)
            return null;
        const compLayout = window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs[nodeId];
        const output = DesignerLoader.definitionMap[compLayout.type!].getEventList().map((item) => {
            return {
                id: nodeId + ':' + item.id + ':' + AnchorPointType.OUTPUT,
                name: item.name,
                type: AnchorPointType.OUTPUT
            }
        });
        const input = DesignerLoader.definitionMap[compLayout.type!].getActionList().map((item) => {
            return {
                id: nodeId + ':' + item.id + ':' + AnchorPointType.INPUT,
                name: item.name,
                type: AnchorPointType.INPUT
            }
        });
        return {
            id: nodeId,
            name: compLayout.name,
            type: 'BPLayerNode',
            input,
            output
        };
    }

    getConfigComponent(): React.ComponentType | null {
        return null;
    }

}
