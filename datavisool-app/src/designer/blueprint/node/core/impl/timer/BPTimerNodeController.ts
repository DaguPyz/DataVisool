/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {AbstractBPNodeController} from "@/designer/blueprint/node/core/AbstractBPNodeController.ts";
import ComponentUtil from "@/util/ComponentUtil.ts";
import BPNode, {NodeProps} from "@/designer/blueprint/node/BPNode.tsx";
import {Stopwatch} from "@icon-park/react";
import {IBPTaskInfo} from "@/designer/blueprint/IBPTyps.ts";
import {ComponentType} from "react";
import {TimerNodeConfig} from "./TimerNodeConfig.tsx";

export interface BPTimerNodeProps extends NodeInfoType {
    interval?: number;
    loop?: boolean;
}

export default class BPTimerNodeController extends AbstractBPNodeController<BPTimerNodeProps> {

    async create(container: HTMLElement, config: BPTimerNodeProps): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleBgColor: "#302788",
            titleChanger: (v) => this.config!.name = v,
            icon: Stopwatch
        });
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        console.warn("The timer will not have input logic to execute", taskInfo, params);
    }

    getConfig(): BPTimerNodeProps | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "Timer",
            type: "BPTimerNode",
            input: [],
            output: [
                {
                    id: nodeId + ":scheduledExecute:" + AnchorPointType.OUTPUT,
                    name: "定时执行",
                    type: AnchorPointType.OUTPUT
                },
            ]
        };
    }

    getConfigComponent(): ComponentType | null {
        return TimerNodeConfig;
    }

}
