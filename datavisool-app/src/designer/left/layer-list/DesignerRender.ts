/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {ILayerItem} from "@datavisool/sdk/types";

export enum LayerOrder {
    ASC,
    DESC,
}


export default class DesignerRender {
    /**
     * 解析函数
     */
    public parser = (layerMap: Record<string, ILayerItem>, layerHeader: string, order: LayerOrder = LayerOrder.DESC): ILayerItem[] => {
        layerMap = cloneDeep(layerMap);
        let sourceLayerArr: ILayerItem[] = [];
        const warnedMessages = new Set<string>();
        const walkedLayerIds = new Set<string>();

        Object.values(layerMap).forEach((layer) => {
            if (layer)
                layer.children = undefined;
        });

        const warnInvalidStructure = (message: string) => {
            if (warnedMessages.has(message))
                return;
            warnedMessages.add(message);
            console.warn(`[DesignerRender] ${message}`);
        }

        const iterateLayers = (currentLayerId: string | undefined, res: ILayerItem[], renderPath: Set<string> = new Set()): void => {
            if (!currentLayerId)
                return;

            const siblingVisitedIds = new Set<string>();
            let nextLayerId: string | undefined = currentLayerId;
            while (nextLayerId) {
                if (renderPath.has(nextLayerId)) {
                    warnInvalidStructure(`Detected circular layer reference in render path, layerId=${nextLayerId}`);
                    break;
                }
                if (siblingVisitedIds.has(nextLayerId)) {
                    warnInvalidStructure(`Detected circular next-chain while rendering layers, layerId=${nextLayerId}`);
                    break;
                }
                if (walkedLayerIds.has(nextLayerId)) {
                    warnInvalidStructure(`Detected duplicate layer reference while rendering layers, layerId=${nextLayerId}`);
                    break;
                }

                const currentLayer: ILayerItem | undefined = layerMap[nextLayerId];
                if (!currentLayer) {
                    warnInvalidStructure(`Layer reference missing while rendering layers, layerId=${nextLayerId}`);
                    break;
                }

                siblingVisitedIds.add(nextLayerId);
                walkedLayerIds.add(nextLayerId);
                res.push(currentLayer);

                const nextRenderPath = new Set(renderPath);
                nextRenderPath.add(nextLayerId);
                if (currentLayer.childHeader)
                    iterateLayers(currentLayer.childHeader, res, nextRenderPath);

                nextLayerId = currentLayer.next;
            }
        }

        if (!layerHeader || !layerMap[layerHeader]) {
            warnInvalidStructure(`Layer header missing while rendering layers, layerHeader=${layerHeader}`);
            return [];
        }

        iterateLayers(layerHeader, sourceLayerArr);

        if (order === LayerOrder.ASC)
            sourceLayerArr = sourceLayerArr.reverse();

        // 构建树结构
        const resData: ILayerItem[] = [];
        const rootLayerIds = new Set<string>();
        const shouldTreatAsRoot = (layerItem: ILayerItem) => {
            const {id, pid} = layerItem;
            if (!id || !pid)
                return true;
            const parent = layerMap[pid];
            if (!parent) {
                warnInvalidStructure(`Layer parent missing while building render tree, layerId=${id}, parentId=${pid}`);
                return true;
            }

            const parentPath = new Set<string>([id]);
            let currentParentId: string | undefined = pid;
            while (currentParentId) {
                if (parentPath.has(currentParentId)) {
                    warnInvalidStructure(`Detected circular parent chain while building render tree, layerId=${id}, parentId=${pid}`);
                    return true;
                }
                parentPath.add(currentParentId);
                currentParentId = layerMap[currentParentId]?.pid;
            }
            return false;
        }

        for (const layerItem of sourceLayerArr) {
            if (shouldTreatAsRoot(layerItem)) {
                // 根节点
                if (layerItem?.id && !rootLayerIds.has(layerItem.id)) {
                    resData.push(layerItem);
                    rootLayerIds.add(layerItem.id);
                }
            } else {
                // 非根节点，将其加入父节点的 children 中
                const parentId = layerItem.pid;
                if (!parentId) {
                    if (layerItem?.id && !rootLayerIds.has(layerItem.id)) {
                        resData.push(layerItem);
                        rootLayerIds.add(layerItem.id);
                    }
                    continue;
                }
                const parent = layerMap[parentId];
                if (parent) {
                    parent.children = parent.children || [];
                    if (!parent.children.some((item: ILayerItem) => item.id === layerItem.id))
                        parent.children.push(layerItem);
                }
            }
        }
        return resData;
    };

}
