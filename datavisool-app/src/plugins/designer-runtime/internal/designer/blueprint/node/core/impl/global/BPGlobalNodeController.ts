/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";


export default class BPGlobalNodeController extends AbstractBPNodeController<NodeInfoType> {


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


}
