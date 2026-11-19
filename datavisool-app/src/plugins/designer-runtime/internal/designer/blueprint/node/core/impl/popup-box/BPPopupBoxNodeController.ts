/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractBPNodeController} from "@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController";
import type {BPPopupBoxNodeConfig} from '@datavisool/sdk/plugin/contracts/editorBlueprint';

import {IBPTaskInfo} from "@/plugins/designer-runtime/internal/designer/blueprint/IBPTyps.ts";
import {AnchorPointType, NodeInfoType} from "@datavisool/sdk/types";


export default class BPPopupBoxNodeController extends AbstractBPNodeController<BPPopupBoxNodeConfig> {


    execute(taskInfo: IBPTaskInfo, params: any): void {
        void params;
        const config = this.config;
        if (!config)
            return;
        const {title, titleColor, background, nodeId} = config;
        const {designerManager, task} = taskInfo;
        if (!task.isActiveFor(designerManager)) return;
        // Popup rendering needs React and the DOM. Keep those dependencies out
        // of the persisted-node registry until a runtime graph actually opens it.
        void import('./showModal.ts').then(({showModal}) => {
            const isActive = () => this.config === config && task.isActiveFor(designerManager);
            if (!isActive())
                return;
            showModal({titleColor, title, background, nodeId}, designerManager, isActive);
        }).catch(error => console.error('打开蓝图弹框失败', error));
    }

    getConfig(): BPPopupBoxNodeConfig | null {
        return this.config;
    }

    getNodeInfo(nodeId: string): NodeInfoType | null {
        return {
            id: nodeId,
            name: "弹框",
            type: "BPPopupBoxNode",
            input: [
                {
                    id: nodeId + ':open:' + AnchorPointType.INPUT,
                    name: "打开",
                    type: AnchorPointType.INPUT
                }
            ],
            output: []
        };
    }


}
