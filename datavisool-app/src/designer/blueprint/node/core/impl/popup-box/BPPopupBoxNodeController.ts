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
import {MessageOne} from "@icon-park/react";
import {PopupBoxNodeConfig} from "./PopupBoxNodeConfig.tsx";
import {showModal} from "./showModal.ts";

export interface BPPopupBoxNodeConfigType extends NodeInfoType {
    nodeId: string;
    title: string;
    titleColor: string;
    background: string;
}

export default class BPPopupBoxNodeController extends AbstractBPNodeController<BPPopupBoxNodeConfigType> {

    async create(container: HTMLElement, config: BPPopupBoxNodeConfigType): Promise<void> {
        this.config = config;
        this.container = container;
        this.instance = await ComponentUtil.createAndRender<any, NodeProps>(container, BPNode, {
            ...config,
            titleBgColor: "#154f73",
            titleChanger: (v) => this.config!.name = v,
            icon: MessageOne
        });
    }

    execute(taskInfo: IBPTaskInfo, params: any): void {
        void params;
        const {title, titleColor, background, nodeId} = this.config!;
        const options = {titleColor, title, background, nodeId};
        const {designerManager} = taskInfo;
        showModal(options, designerManager);
    }

    getConfig(): BPPopupBoxNodeConfigType | null {
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

    getConfigComponent(): React.ComponentType | null {
        return PopupBoxNodeConfig;
    }

}
