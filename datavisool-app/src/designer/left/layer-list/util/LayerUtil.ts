/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ILayerItem} from "@datavisool/sdk/types";
import layerListStore from "@/designer/left/layer-list/LayerListStore.ts";
import LayerGroupItem from "@/designer/left/layer-list/item/LayerGroupItem.tsx";
import designerLeftStore from "@/designer/left/DesignerLeftStore.ts";
import {Component} from "react";
import type DesignerManager from "@/designer/manager/DesignerManager.ts";

export default class LayerUtil {

    private static getLayerConfigs(designerManager?: DesignerManager) {
        return (designerManager ?? window.DATAVISOOL_ENV.currentManager).layerManager!.layerConfigs;
    }

    /**
     * 查找layerIds对应的图层中最顶层的分组图层，例如：
     * |A
     * |-B
     * |--C
     * 传入C的id，返回A的id，未找到则返回空数组
     * @param layerIds 普通图层id
     * @param hasSelf 没有找到分组图层时，是否返回自身id
     */
    public static findTopGroupLayer = (layerIds: string[], hasSelf: boolean = false): string[] => {
        //使用set数据结构去重，多个不同的组件可能存在同一个分组内
        const groupLayerIdSet = new Set<string>();
        const layerConfigs = LayerUtil.getLayerConfigs();
        layerIds.forEach((id) => {
            if (!id || !layerConfigs[id]) {
                return;
            }
            let _id = id;
            let _pid = layerConfigs[id]?.pid;
            const visitedParentIds = new Set<string>([id]);
            let brokenParentChain = false;
            while (_pid) {
                if (visitedParentIds.has(_pid)) {
                    brokenParentChain = true;
                    break;
                }
                visitedParentIds.add(_pid);

                const parentLayer = layerConfigs[_pid];
                if (!parentLayer) {
                    brokenParentChain = true;
                    break;
                }

                const {pid, id} = parentLayer;
                _pid = pid;
                _id = id!;
            }
            if (hasSelf || _id !== id || brokenParentChain)
                groupLayerIdSet.add(_id);
        });
        return Array.from(groupLayerIdSet);
    }

    /**
     * 通过一个子图层id，查询其所在的分组下所有子图层id，包括分组图层本身id
     * @param layerIds
     * @param hasSelf 没有找到分组图层时，是否返回自身id
     */
    public static findAllChildLayerBySubId = (layerIds: string[], hasSelf: boolean = false): string[] => {
        const topGroupId = LayerUtil.findTopGroupLayer(layerIds, hasSelf);
        return LayerUtil.findAllChildLayer(topGroupId);
    }

    /**
     * 查找分组图层下的所有子图层id.
     * @param  groupIds 分组图层id
     * @param hasSelf 是否包含自身id
     */
    public static findAllChildLayer = (groupIds: string[], hasSelf: boolean = true, designerManager?: DesignerManager): string[] => {
        let layerIdArr: string[] = [];
        const layerConfigs = LayerUtil.getLayerConfigs(designerManager);
        groupIds.forEach((id) => {
            if (!id || !layerConfigs[id]) {
                return;
            }
            layerIdArr.push(id);
            const layer: ILayerItem = layerConfigs[id];
            if (layer.childHeader)
                LayerUtil.iterateLayerLink(layer.childHeader, layerIdArr, designerManager);
        });
        if (!hasSelf)
            layerIdArr = layerIdArr.filter((id) => !groupIds.includes(id));
        return [...new Set(layerIdArr)];
    }

    /**
     * 递归向下查找所有子图层id
     * @param layerHeader 分组图层ids
     * @param res 结果数组
     * @private
     */
    public static iterateLayerLink(layerHeader: string, res: string[], designerManager?: DesignerManager) {
        const layerConfigs = LayerUtil.getLayerConfigs(designerManager);
        const layer: ILayerItem | undefined = layerConfigs[layerHeader];
        if (layer) {
            res.push(layer.id!);
            if (layer.childHeader)
                LayerUtil.iterateLayerLink(layer.childHeader, res, designerManager);
            let nextLayer = layerConfigs[layer.next!];
            while (nextLayer) {
                if (nextLayer.childHeader)
                    LayerUtil.iterateLayerLink(nextLayer.childHeader, res, designerManager);
                res.push(nextLayer.id!);
                nextLayer = layerConfigs[nextLayer.next!];
            }
        }
    }

    /**
     * 判断layerIds中的图层是否已经处于同一个分组下 -- 用于判断是否可以进行图层编组
     * @param layerIds 图层id
     */
    public static hasSameGroup = (layerIds: string[]): boolean => {
        if (layerIds.length <= 1) return false;
        const layerConfigs = LayerUtil.getLayerConfigs();
        //如果layerIds中存在没有pid的图层，则说明这个图层一定没有编组，则直接返回false，说明本次可以编组
        if (layerIds.some((id) => {
            const layer = layerConfigs[id];
            return layer?.type !== 'group' && !layer?.pid;
        })) return false;
        const groupLayerIds = new Set();
        layerIds.filter((id) => layerConfigs[id]?.type !== 'group').forEach((id) => {
            LayerUtil.findTopGroupLayer([id], true).forEach((id) => groupLayerIds.add(id));
        })
        //若所有图层向上查找分组后，只有一个结果返回，则说明所有图层处于同一个分组内
        return groupLayerIds.size === 1;
    }

    /**
     * 判断targetId是否是sourceId的子图层
     * @param currentId 当前图层id
     * @param targetId 目标图层id
     */
    public static isTargetChild = (currentId: string, targetId: string): boolean => {
        if (!currentId || !targetId)
            return false;
        const layerConfigs = LayerUtil.getLayerConfigs();
        const sourceLayer = layerConfigs[currentId];
        if (!sourceLayer || !sourceLayer.pid)
            return false;
        const targetLayer = layerConfigs[targetId];
        if (!targetLayer || targetLayer.type !== 'group')
            return false;
        let parentId = sourceLayer.pid;
        const visitedParentIds = new Set<string>([currentId]);
        while (parentId) {
            if (parentId === targetId)
                return true;
            if (visitedParentIds.has(parentId))
                return false;
            visitedParentIds.add(parentId);
            const parentLayer = layerConfigs[parentId];
            if (!parentLayer)
                return false;
            parentId = parentLayer.pid as string;
        }
        return false;
    }

    /**
     * 计算图层列表中的可视化图层id
     * 保留所有独立图层id，如果存在分组id，且分组id的所有子id都存在，则只保留该分组id，排除其下所有子图层id。反之，保留所有子图层id，排除分组id
     */
    public static combineCalculationsActiveLayers(layerIds: string[]): string[] {
        const result: string[] = [];
        if (!window.DATAVISOOL_ENV.currentManager.layerManager?.layerConfigs)
            return result;

        const layerConfigs = LayerUtil.getLayerConfigs();
        const groupMapping: Record<string, string[]> = {};
        Object.values(layerConfigs).forEach(layer => {
            if (!layer)
                return;
            const {pid, id} = layer;
            if (pid) {
                if (pid in groupMapping)
                    groupMapping[pid].push(id!);
                else
                    groupMapping[pid] = [id!];
            }
        })
        const groupIdRule: Record<string, boolean> = {}; //ture 保留组id，排除子图层id，false 保留子图层id，排除组id
        const groupIds = layerIds.filter(id => layerConfigs[id]?.type === 'group');
        groupIds.forEach(groupId => {
            const childIds = groupMapping[groupId];
            groupIdRule[groupId] = childIds && childIds.every(childId => layerIds.includes(childId));
        });
        return layerIds.filter(id => {
            const layer = layerConfigs[id];
            if (!layer)
                return false;
            if (layer.id! in groupIdRule && !groupIdRule[layer.id!])
                return false;
            return !(layer.pid! in groupIdRule && groupIdRule[layer.pid!]);
        })
    }

    /**
     * 设置控制点和边框的颜色
     * @param layerIds 组件id列表
     * @param lock 是否锁定
     */
    public static setSelectBoxColor(layerIds: string[], lock: boolean) {
        //没有选中组件的情况下不会显示边框。
        if (layerIds.length === 0)
            return;
        const resizeBoxDom = document.querySelectorAll(".datavisool-interaction-resize-box");
        const pointLineDom = document.querySelectorAll(".datavisool-interaction-resize-handle,.datavisool-interaction-rotate-handle");
        if (!pointLineDom)
            return;
        if (lock) {
            resizeBoxDom.forEach((child: Element) => {
                (child as HTMLDivElement).style.setProperty('border-color', '#ff4b29', 'important');
            })
            pointLineDom.forEach((child: Element) => {
                (child as HTMLDivElement).style.setProperty('background-color', '#ff4b29', 'important');
            })
        } else {
            resizeBoxDom.forEach((child: Element) => {
                (child as HTMLDivElement).style.setProperty('border-color', '#00bbffff', 'important');
            })
            pointLineDom.forEach((child: Element) => {
                (child as HTMLDivElement).style.setProperty('background-color', '#00bbffff', 'important');
            })
        }
    }

    /**
     * 找到指定分组图层下的所有子图层中最靠前的子图层
     * @param parentId 目标分组图层
     * @param layers 代操作图层列表
     */
    public static findTopLayerInGroup(parentId: string, layers: ILayerItem[]) {
        if (!parentId || !layers)
            return;
        const childLayers = layers.filter(layer => layer.pid === parentId);
        const minOrderLayer = childLayers.reduce((pre, cur) => {
            return (pre.order ?? 0) > (cur.order ?? 0) ? pre : cur;
        }, childLayers[0]);
        return minOrderLayer?.id;
    }

    /**
     * 找到指定分组图层下的所有子图层中最靠后的子图层
     * @param parentId 目标分组图层
     * @param layers 代操作图层列表
     */
    public static findBottomLayerInGroup(parentId: string, layers: ILayerItem[]) {
        if (!parentId || !layers)
            return;
        const childLayers = layers.filter(layer => layer.pid === parentId);
        const maxOrderLayer = childLayers.reduce((pre, cur) => {
            return (pre.order ?? 0) < (cur.order ?? 0) ? pre : cur;
        }, childLayers[0]);
        return maxOrderLayer?.id;
    }

    /**
     * 找到指定图层的分组链
     * @param layerId 目标图层
     */
    public static findLayerGroupChain(layerId: string): string[] {
        if (!layerId)
            return [];
        const layerConfigs = LayerUtil.getLayerConfigs();
        const chain: string[] = [];
        let currentId = layerId;
        const visitedIds = new Set<string>();
        while (currentId) {
            if (visitedIds.has(currentId)) {
                break;
            }
            const currentLayer = layerConfigs[currentId];
            if (!currentLayer) {
                break;
            }
            visitedIds.add(currentId);
            chain.push(currentId);
            currentId = currentLayer.pid!;
        }
        return chain
    }

    /**
     * 展开指定分组图层
     * @param groupIds 目标分组图层
     * @param unfold 是否展开
     */
    public static togglesGroupingUnfold(groupIds: string[], unfold: boolean) {
        if (!groupIds || groupIds.length === 0)
            return;
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager!;
        const {layerInstances} = layerListStore;
        const failToRetry: string[] = groupIds.filter(id => layerConfigs[id].type === 'group');
        let retryCount = 0;
        const maxRetries = 100;

        const retry = () => {
            if (retryCount >= maxRetries)
                return;
            const currentFailToRetry = [...failToRetry];
            failToRetry.length = 0; // 清空数组，但引用不变
            currentFailToRetry.forEach(id => {
                const instance = layerInstances[id] as LayerGroupItem;
                if (!instance)
                    failToRetry.push(id);
                else
                    instance.setState({showContent: unfold});
            });
            if (failToRetry.length === 0)
                return;
            retryCount++;
            requestAnimationFrame(retry);
        };
        // 执行时机要晚于渲染线程
        requestAnimationFrame(retry);
    }

    /**
     * 重新渲染图层列表
     * @param oldLayerList 旧图层列表
     * @param newLayerList 新图层列表
     */
    public static reRenderLayerList(oldLayerList: string[], newLayerList: string[]) {
        const {layerInstances} = layerListStore;
        const {menu} = designerLeftStore;
        if (menu === 'layer-list') {
            //清除之前的选中
            oldLayerList.forEach(id => {
                const instance: Component = layerInstances[id];
                instance && instance.setState({selected: false});
            });

            //设置本次选中的组件id
            newLayerList.forEach(id => {
                const instance: Component = layerInstances[id];
                if (instance)
                    instance.setState({selected: true});
            })
        }
    }

    /**
     * 建立图层的双向链表
     * @param layers 待处理图层列表
     */
    public static buildADoublyLinkedListOfLayers = (layers: Record<string, ILayerItem>) => {
        let head: string | null = null, tail: string | null = null;
        //1.对图层列表排序
        const layerIds = Object.keys(layers).sort((prev, next) => {
            return layers[prev].order! - layers[next].order!
        });
        //2.清空原有指针
        layerIds.forEach(id => {
            const layer = layers[id];
            layer.prev = undefined;
            layer.next = undefined;
        });
        //3.头插法建立双向链表
        layerIds.forEach(id => {
            if (head) {
                const layer = layers[id];
                const prevHead = layers[head];
                prevHead.prev = id;
                layer.next = head;
            } else {
                tail = id;
            }
            head = id;
        })
        //4.清理头尾指针元素的prev和next指针
        if (head) {
            const headLayer = layers[head];
            headLayer.prev = undefined;
        }
        if (tail) {
            const tailLayer = layers[tail];
            tailLayer.next = undefined;
        }
        //5.返回头尾指针
        return {head, tail};
    }

    /**
     * 查找空分组
     * @param layers 所有图层
     * @returns 空分组列表
     */
    public static findEmptyGrouping(layers: ILayerItem[]): string[] {
        if (!Array.isArray(layers) || layers.length === 0)
            return [];

        // 收集所有分组 id
        const groupMap = new Map<string, number>();
        layers.forEach(layer => {
            if (layer.type === 'group')
                groupMap.set(layer.id!, 1);
        });

        // 遍历所有层，移除有子项的分组
        layers.forEach(layer => {
            if (layer.pid && groupMap.has(layer.pid))
                groupMap.delete(layer.pid);
        });

        // 返回剩余的空分组
        return Array.from(groupMap.keys());
    }

}
