/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";
import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController.ts";
import type {BPTimerNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";


export default class BPTimerNodeController extends AbstractBPNodeController<BPTimerNodeConfig> {


    execute(taskInfo: IBPTaskInfo, params: any): void {
        console.warn("The timer will not have input logic to execute", taskInfo, params);
    }

    getConfig(): BPTimerNodeConfig | null {
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


}
