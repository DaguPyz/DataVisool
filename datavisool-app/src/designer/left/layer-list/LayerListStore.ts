/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {Component, MouseEvent} from "react";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy";
import LayerUtil from "./util/LayerUtil";
import {ILayerItem} from "@datavisool/sdk/types";
import {normalizeSelectionIds} from "@/designer/operate-provider/selection/SelectionPolicy.ts";

class LayerListStore {
    constructor() {
        makeObservable(this, {
            searchLayer: observable,
            setSearchLayer: action,
        });
    }

    layerInstances: Record<string, Component> = {};

    searchLayer: boolean = false;

    private selectionAnchorId: string | null = null;

    setSearchLayer = (searchLayer: boolean) => this.searchLayer = searchLayer;


    /**
     * 更新图层的锁定状态，包括普通图层和分组图层
     * 普通图层直接更新即可，分组图层要更新分组图层中的所有子图层
     */
    lockChange = (id: string, lock: boolean) => {
        const updData = [];
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager!;
        const {type} = layerConfigs[id];
        if (type === 'group') {
            //分组图层
            LayerUtil.findAllChildLayer([id]).forEach(id => updData.push({id, lock}));
        } else {
            //普通图层
            updData.push({id, lock});
        }
        historyRecordOperateProxy.doLockUpd(updData);
        eventOperateStore.setTargetIds(eventOperateStore.targetIds, eventOperateStore.selectionSource);
        eventOperateStore.interactionRef?.refreshOverlay?.();
    }

    /** 通过图层列表写入规范选择 ID。 */
    selectedChange = (id: string, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) => {
        const {targetIds, setTargetIds} = eventOperateStore;
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager!;
        const {type} = layerConfigs[id];
        if (!type)
            return [];
        let selectedLayerIds: string[] = [];
        if (event.ctrlKey || event.metaKey) { //多选
            if (targetIds.includes(id)) { //多选模式下同一图层再次点击视为取消选中
                selectedLayerIds = targetIds.filter(_id => _id !== id);
            } else {
                selectedLayerIds = [...targetIds, id];
            }
        } else if (event.shiftKey) { //选择范围
            const rememberedAnchor = this.selectionAnchorId;
            const currentAnchor = targetIds[targetIds.length - 1];
            const anchorId = rememberedAnchor && layerConfigs[rememberedAnchor]
                ? rememberedAnchor
                : currentAnchor && layerConfigs[currentAnchor] ? currentAnchor : id;
            if (anchorId && layerConfigs[anchorId]) {
                const startLayer = layerConfigs[anchorId];
                const endLayer = layerConfigs[id];
                let maxId, minId;
                if (startLayer.order! > endLayer.order!) {
                    maxId = anchorId;
                    minId = id;
                } else {
                    maxId = id;
                    minId = anchorId;
                }
                //按住shift后点击的是原图层，则不处理
                if (maxId === minId)
                    return targetIds;

                let finished = false;
                const calculateLayerIds = (selectedIds: string[], nextLayer: ILayerItem | undefined, targetId: string) => {
                    if (!nextLayer || finished)
                        return;
                    if (nextLayer.type === 'group') {
                        selectedIds.push(nextLayer.id!)
                        const childHeaderLayer = layerConfigs[nextLayer.childHeader!];
                        if (childHeaderLayer) {
                            calculateLayerIds(selectedIds, childHeaderLayer, targetId);
                            return;
                        }
                    } else {
                        selectedIds.push(nextLayer.id!);
                    }
                    if (nextLayer.id === targetId) {
                        finished = true;
                        return;
                    }
                    if (nextLayer.pid && !nextLayer.next) {
                        //查找到分组图层的最后一个元素依然没有匹配到目标图层，则跳转到父级图层往下继续匹配
                        let safeLock = 0; //防止死循环
                        let parentLayer: ILayerItem | undefined = layerConfigs[nextLayer.pid];
                        let tempNext: ILayerItem | undefined = parentLayer?.next ? layerConfigs[parentLayer.next] : undefined;
                        while (!tempNext && parentLayer && safeLock < 1000) {
                            const nextParentId: string | undefined = parentLayer.pid;
                            parentLayer = nextParentId ? layerConfigs[nextParentId] : undefined;
                            tempNext = parentLayer?.next ? layerConfigs[parentLayer.next] : undefined;
                            safeLock++;
                        }
                        //向下查找之前再次判断parentLayer是否已经是要查找的目标节点
                        if (parentLayer && parentLayer.id === targetId) {
                            finished = true;
                            return;
                        }
                        calculateLayerIds(selectedIds, tempNext, targetId);
                    } else
                        calculateLayerIds(selectedIds, layerConfigs[nextLayer.next!], targetId);
                }

                const maxLayer = layerConfigs[maxId];
                calculateLayerIds(selectedLayerIds, maxLayer, minId);
            }
        } else { //单选
            selectedLayerIds = [id];
        }
        if (!event.shiftKey)
            this.selectionAnchorId = id;
        const normalizedSelectedIds = normalizeSelectionIds([...new Set(selectedLayerIds)], layerConfigs);
        const targetTimer = setTimeout(() => {
            setTargetIds(normalizedSelectedIds, 'layer-list');
            clearTimeout(targetTimer);
        }, 0)
        return normalizedSelectedIds;
    }

    hideChange = (id: string, hide: boolean) => {
        let ids = [id];
        const {layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager!;
        const {type} = layerConfigs[id];
        if (type === 'group') {
            //分组图层
            ids = LayerUtil.findAllChildLayer([id]);
        }
        historyRecordOperateProxy.doHideUpd(ids, hide);
        eventOperateStore.setTargetIds(eventOperateStore.targetIds, eventOperateStore.selectionSource);
        eventOperateStore.interactionRef?.refreshOverlay?.();
    }
}

const layerListStore = new LayerListStore();
window.DATAVISOOL_ENV = {...window.DATAVISOOL_ENV, layerInstances: layerListStore.layerInstances};
export default layerListStore;
export {LayerListStore}
