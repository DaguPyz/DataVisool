/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React, {useEffect, useRef} from "react";
import bpRightStore from "@/designer/blueprint/right/BPRightStore";
import bpWorkspaceUIStore from "@/designer/blueprint/workspace/BPWorkspaceUIStore";
import './BPNodeContainer.less';
import {BPNodeLayoutType} from "@datavisool/sdk/types";
import DesignerLoader from "@/designer/loader/DesignerLoader.ts";
import {BPPopupBoxNodeConfigType} from "@/designer/blueprint/node/core/impl/popup-box/BPPopupBoxNodeController.ts";
import {normalizeBlueprintNodeConfig} from "@/designer/blueprint/util/BPNodeEnableUtil.ts";
import ComponentUtil from "@/util/ComponentUtil";

export interface BPNodeContainerProps {
    layout: BPNodeLayoutType;
}

export const BPNodeContainer: React.FC<BPNodeContainerProps> = React.memo(({layout}) => {
    const ref = useRef<HTMLDivElement>(null);

    const activeNodeConfig = (id: string) => {
        const {setActiveNode} = bpRightStore;
        setActiveNode(id);
        bpWorkspaceUIStore.openRight();
    }

    const calculateApUsed = (nodeConfig: BPPopupBoxNodeConfigType) => {
        const {input, output} = nodeConfig;
        const {bpAPMap} = window.DATAVISOOL_ENV.currentManager.bluePrintManager.currentPageManager!;
        [...input!, ...output!].forEach(ap => {
            const anchorId = ap.id!;
            // 首先检查是否作为key存在（最快）
            if (bpAPMap[anchorId] !== undefined) {
                ap.used = true;
                return; // 立即结束当前锚点的校验
            }
            // 然后在value中查找
            for (const value of Object.values(bpAPMap)) {
                if (Array.isArray(value)) {
                    if (value.includes(anchorId)) {
                        ap.used = true;
                        return; // 找到就立即结束
                    }
                } else if (value === anchorId) {
                    // 如果value是单个ID而不是数组
                    ap.used = true;
                    return; // 找到就立即结束
                }
            }
            // 如果都没找到，标记为未使用
            ap.used = false;
        });
    }

    useEffect(() => {
        const NodeController = DesignerLoader.bpControllerMap[layout.type!];
        if (!NodeController) {
            console.warn(`[BPNodeContainer] missing blueprint controller for type="${layout.type}"`);
            return;
        }
        const {currPageNodeControllers, currentPageManager} = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        if (!currentPageManager)
            return;
        const ncIns = new NodeController();
        if (!ncIns) return;
        const {bpNodeConfigMap} = currentPageManager;
        //获取节点配置，优先从bpNodeControllerInsMap中获取，没有则从bpStore.bpNodeConfigMap中获取【上一次保存的配置】，没有的，则最终调用controller的getNodeConfig方法获取【默认配置】
        let nodeConfig;
        const prevNodeController = currPageNodeControllers[layout.id!];
        if (prevNodeController)
            nodeConfig = prevNodeController.getConfig();
        else if (bpNodeConfigMap[layout.id!])
            nodeConfig = bpNodeConfigMap[layout.id!];
        else
            nodeConfig = ncIns.getNodeInfo(layout.id!);
        nodeConfig = normalizeBlueprintNodeConfig(nodeConfig) as any;
        calculateApUsed(nodeConfig);
        const container = ref.current!;
        ncIns.create(container, nodeConfig);
        currPageNodeControllers[layout.id!] = ncIns;
        return () => ComponentUtil.release(container);
    }, [layout.id, layout.type]);
    const {position, id} = layout;
    return (
        <div ref={ref} className={'bp-node-container'}
             data-nid={id}
             onDoubleClick={() => activeNodeConfig(id!)}
             style={{transform: 'translate(' + position!.x + 'px,' + position!.y + 'px)'}}
        />
    )
})
