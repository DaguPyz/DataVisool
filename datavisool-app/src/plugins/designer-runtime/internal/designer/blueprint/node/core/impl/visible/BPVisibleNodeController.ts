/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import type {BPVisibleNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';

import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";


export default class BPVisibleNodeController extends AbstractBPNodeController<BPVisibleNodeConfig> {


    execute(taskInfo: IBPTaskInfo, params: any): void {
        if (!params)
            return;
        const {designerManager} = taskInfo;
        const {nodeIds} = this.config?.nodeConfig ?? {};
        const controllers = designerManager.layerManager?.controllers;
        if (!controllers)
            return;
        nodeIds?.forEach((nodeId) => {
            const controller = controllers[nodeId];
            if (controller)
                controller.setVisible(false);
        });
        if (typeof params === 'string')
            params = [params];
        if (Array.isArray(params)) {
            params?.forEach((nodeId) => {
                const controller = controllers[nodeId];
                if (controller)
                    controller.setVisible(true);
            })
        }
    }

    getConfig(): BPVisibleNodeConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "显示隐藏",
            type: "BPVisibleNode",
            input: [
                {
                    id: nodeId + ':changeVisible:' + AnchorPointType.INPUT,
                    name: "切换显隐",
                    type: AnchorPointType.INPUT
                }
            ],
            output: []
        };
    }


}
