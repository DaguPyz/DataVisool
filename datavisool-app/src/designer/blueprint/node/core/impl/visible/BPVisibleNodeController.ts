/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController";
import BPNode, {NodeProps} from "@/designer/blueprint/node/BPNode";
import React from "react";

import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {PreviewOpen} from "@icon-park/react";
import {VisibleNodeConfig} from "./VisibleNodeConfig.tsx";

export interface BPVisibleNodeConfigType extends NodeInfoType {
    nodeConfig: {
        nodeIds: string[];
    }
}

export default class BPVisibleNodeController extends AbstractBPNodeController<BPVisibleNodeConfigType> {

    async create(container: HTMLElement, config: BPVisibleNodeConfigType): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleBgColor: "#8c5f5f",
            titleChanger: (v) => this.config!.name = v,
            icon: PreviewOpen
        });
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        if (!params)
            return;
        const {designerManager} = taskInfo;
        const {nodeIds} = this.config?.nodeConfig ?? {};
        if (!window.DATAVISOOL_ENV.currentManager.layerManager?.controllers)
            return;
        nodeIds?.forEach((nodeId) => {
            const controller = designerManager.layerManager.controllers![nodeId];
            if (controller)
                controller.setVisible(false);
        });
        if (typeof params === 'string')
            params = [params];
        if (Array.isArray(params)) {
            params?.forEach((nodeId) => {
                const controller = designerManager.layerManager.controllers![nodeId];
                if (controller)
                    controller.setVisible(true);
            })
        }
    }

    getConfig(): BPVisibleNodeConfigType | null {
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

    getConfigComponent(): React.ComponentType | null {
        return VisibleNodeConfig;
    }

}
