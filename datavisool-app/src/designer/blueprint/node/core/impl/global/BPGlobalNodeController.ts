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
import {Globe} from "@icon-park/react";


export default class BPGlobalNodeController extends AbstractBPNodeController<NodeInfoType> {

    async create(container: HTMLElement, config: NodeInfoType): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleBgColor: "#2d8e00",
            titleChanger: (v) => this.config!.name = v,
            icon: Globe
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execute(taskInfo: IBPTaskInfo, params: any): void {
    }

    getConfig(): NodeInfoType | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "全局节点",
            type: "BPGlobal",
            input: [],
            output: [
                {
                    id: nodeId + ":allLoaded:" + AnchorPointType.OUTPUT,
                    name: "所有组件加载完成时",
                    type: AnchorPointType.OUTPUT
                },
            ]
        };
    }

    getConfigComponent(): React.ComponentType | null {
        return null;
    }

}
