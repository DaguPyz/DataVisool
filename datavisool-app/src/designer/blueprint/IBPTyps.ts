/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import BPTask from "@/designer/blueprint/core/BPTask.ts";
import {AnchorPointType} from "@datavisool/sdk/types";
import DesignerManager from "@/designer/manager/DesignerManager.ts";

export interface IBPTaskInfo {
    //蓝图锚点id
    apId: string;
    //蓝图节点id
    nodeId: string;
    //蓝图锚点类型
    anchorType: AnchorPointType;
    //当前任务
    task: BPTask;
    //当前执行环境的manager
    designerManager: DesignerManager;
}
