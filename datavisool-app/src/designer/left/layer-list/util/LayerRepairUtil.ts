/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ILayerItem, ILayerManager} from "@datavisool/sdk/types";

export type CanvasRepairIssueType =
    | "missing-header"
    | "missing-tail"
    | "missing-layer"
    | "cycle"
    | "duplicate-layer"
    | "tail-mismatch";

export interface ICanvasRepairIssue {
    type: CanvasRepairIssueType;
    message: string;
    layerId?: string;
    relatedId?: string;
}

export interface ICanvasRepairAnalysis {
    layerCount: number;
    layerHeader?: string;
    layerTail?: string;
    reachableCount: number;
    reachableIds: string[];
    renderTailId?: string;
    orphanCount: number;
    orphanIds: string[];
    orphanLayers: ILayerItem[];
    issues: ICanvasRepairIssue[];
}

export interface ICanvasRepairLinkedListResult {
    head?: string;
    tail?: string;
    orderedLayerIds: string[];
}

class LayerRepairUtil {
    private static addIssue(
        issues: ICanvasRepairIssue[],
        issueKeys: Set<string>,
        issue: ICanvasRepairIssue
    ) {
        const key = `${issue.type}|${issue.layerId ?? ""}|${issue.relatedId ?? ""}|${issue.message}`;
        if (issueKeys.has(key))
            return;
        issueKeys.add(key);
        issues.push(issue);
    }

    private static walkRenderableLayers(
        layerMap: Record<string, ILayerItem>,
        currentLayerId: string | undefined,
        reachableIds: string[],
        reachableSet: Set<string>,
        issues: ICanvasRepairIssue[],
        issueKeys: Set<string>,
        renderPath: Set<string> = new Set()
    ): void {
        if (!currentLayerId)
            return;

        const siblingVisitedIds = new Set<string>();
        let nextLayerId: string | undefined = currentLayerId;

        while (nextLayerId) {
            if (renderPath.has(nextLayerId)) {
                LayerRepairUtil.addIssue(issues, issueKeys, {
                    type: "cycle",
                    layerId: nextLayerId,
                    message: `检测到循环渲染链路，图层 ${nextLayerId} 已出现在当前递归路径中`,
                });
                break;
            }

            if (siblingVisitedIds.has(nextLayerId)) {
                LayerRepairUtil.addIssue(issues, issueKeys, {
                    type: "cycle",
                    layerId: nextLayerId,
                    message: `检测到 next 链循环，图层 ${nextLayerId} 在同一条链路中重复出现`,
                });
                break;
            }

            if (reachableSet.has(nextLayerId)) {
                LayerRepairUtil.addIssue(issues, issueKeys, {
                    type: "duplicate-layer",
                    layerId: nextLayerId,
                    message: `检测到重复可达图层引用，图层 ${nextLayerId} 已被遍历过`,
                });
                break;
            }

            const currentLayer: ILayerItem | undefined = layerMap[nextLayerId];
            if (!currentLayer) {
                LayerRepairUtil.addIssue(issues, issueKeys, {
                    type: "missing-layer",
                    layerId: nextLayerId,
                    message: `图层引用缺失，无法继续遍历 ${nextLayerId}`,
                });
                break;
            }

            siblingVisitedIds.add(nextLayerId);
            reachableSet.add(nextLayerId);
            reachableIds.push(nextLayerId);

            const nextRenderPath = new Set(renderPath);
            nextRenderPath.add(nextLayerId);
            if (currentLayer.childHeader) {
                LayerRepairUtil.walkRenderableLayers(
                    layerMap,
                    currentLayer.childHeader,
                    reachableIds,
                    reachableSet,
                    issues,
                    issueKeys,
                    nextRenderPath
                );
            }

            nextLayerId = currentLayer.next;
        }
    }

    public static sortLayerIdsForRepair(layerIds: string[], layerMap: Record<string, ILayerItem>): string[] {
        const orderIndexMap = new Map<string, number>(layerIds.map((id, index) => [id, index]));
        return [...layerIds].filter(id => !!layerMap[id]).sort((leftId, rightId) => {
            const leftLayer = layerMap[leftId];
            const rightLayer = layerMap[rightId];
            const leftOrder = typeof leftLayer?.order === "number" ? leftLayer.order : Number.MAX_SAFE_INTEGER;
            const rightOrder = typeof rightLayer?.order === "number" ? rightLayer.order : Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder)
                return leftOrder - rightOrder;
            return (orderIndexMap.get(leftId) ?? 0) - (orderIndexMap.get(rightId) ?? 0);
        });
    }

    public static rebuildLinkedListByOrder(layers: Record<string, ILayerItem>): ICanvasRepairLinkedListResult {
        const orderedLayerIds = LayerRepairUtil.sortLayerIdsForRepair(Object.keys(layers), layers);
        orderedLayerIds.forEach((id) => {
            const layer = layers[id];
            if (layer) {
                layer.prev = undefined;
                layer.next = undefined;
            }
        });

        let head: string | undefined;
        let tail: string | undefined;

        orderedLayerIds.forEach((id) => {
            const layer = layers[id];
            if (!layer)
                return;

            if (head) {
                const currentHeadLayer = layers[head];
                if (currentHeadLayer)
                    currentHeadLayer.prev = id;
                layer.next = head;
            } else {
                tail = id;
            }
            head = id;
        });

        if (head && layers[head])
            layers[head].prev = undefined;
        if (tail && layers[tail])
            layers[tail].next = undefined;

        return {head, tail, orderedLayerIds};
    }

    public static scanCanvasRepairAnalysis(
        layerManager?: Pick<ILayerManager, "layerConfigs" | "layerHeader" | "layerTail"> | null
    ): ICanvasRepairAnalysis {
        const layerMap = layerManager?.layerConfigs ?? {};
        const layerIds = Object.keys(layerMap);
        if (layerIds.length === 0) {
            return {
                layerCount: 0,
                layerHeader: layerManager?.layerHeader,
                layerTail: layerManager?.layerTail,
                reachableCount: 0,
                reachableIds: [],
                orphanCount: 0,
                orphanIds: [],
                orphanLayers: [],
                issues: [],
            };
        }

        const issues: ICanvasRepairIssue[] = [];
        const issueKeys = new Set<string>();
        const reachableIds: string[] = [];
        const reachableSet = new Set<string>();
        const {layerHeader, layerTail} = layerManager ?? {};

        if (!layerHeader) {
            LayerRepairUtil.addIssue(issues, issueKeys, {
                type: "missing-header",
                message: "当前画布没有可用的图层头指针",
            });
        } else if (!layerMap[layerHeader]) {
            LayerRepairUtil.addIssue(issues, issueKeys, {
                type: "missing-header",
                layerId: layerHeader,
                message: `图层头指针 ${layerHeader} 对应的图层不存在`,
            });
        } else {
            LayerRepairUtil.walkRenderableLayers(
                layerMap,
                layerHeader,
                reachableIds,
                reachableSet,
                issues,
                issueKeys
            );
        }

        const renderTailId = reachableIds.length > 0 ? reachableIds[reachableIds.length - 1] : undefined;
        if (!layerTail) {
            LayerRepairUtil.addIssue(issues, issueKeys, {
                type: "missing-tail",
                message: "当前画布没有可用的图层尾指针",
            });
        } else if (!layerMap[layerTail]) {
            LayerRepairUtil.addIssue(issues, issueKeys, {
                type: "missing-tail",
                layerId: layerTail,
                message: `图层尾指针 ${layerTail} 对应的图层不存在`,
            });
        } else if (renderTailId && layerTail !== renderTailId) {
            LayerRepairUtil.addIssue(issues, issueKeys, {
                type: "tail-mismatch",
                layerId: layerTail,
                relatedId: renderTailId,
                message: `图层尾指针 ${layerTail} 与实际可达尾节点 ${renderTailId} 不一致`,
            });
        }

        const orphanIds = LayerRepairUtil.sortLayerIdsForRepair(
            layerIds.filter((id) => !reachableSet.has(id)),
            layerMap
        );
        const orphanLayers = orphanIds
            .map((id) => layerMap[id])
            .filter((layer): layer is ILayerItem => !!layer);

        return {
            layerCount: layerIds.length,
            layerHeader,
            layerTail,
            reachableCount: reachableIds.length,
            reachableIds,
            renderTailId,
            orphanCount: orphanIds.length,
            orphanIds,
            orphanLayers,
            issues,
        };
    }
}

export default LayerRepairUtil;
