/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHistoryRecord, ILockOperateData} from "@/designer/operate-provider/undo-redo/OperateType";
import {Component} from "react";
import layerListStore from "@/designer/left/layer-list/LayerListStore";
import designerLeftStore from "@/designer/left/DesignerLeftStore";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";

/**
 * hide, lock, order的撤销与回滚操作实现
 */
export class LockRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        const {next} = record;
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (next)
            updateLayer(next as ILockOperateData[]);
        const {layerInstances} = layerListStore;
        const {menu} = designerLeftStore;
        if (menu === 'layer-list') {
            //图层列表若显示，则需要更新图层列表的组件状态
            (next as ILockOperateData[])?.forEach((item) => {
                const {id, lock} = item;
                (layerInstances[id] as Component).setState({lock});
            })
        }
        this.refreshSelection();
    }

    undo(record: IHistoryRecord): void {
        const {prev} = record;
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (prev)
            updateLayer(prev as ILockOperateData[]);
        const {layerInstances} = layerListStore;
        const {menu} = designerLeftStore;
        if (menu === 'layer-list') {
            //图层列表若显示，则需要更新图层列表的组件状态
            (prev as ILockOperateData[])?.forEach((item) => {
                const {id, lock} = item;
                (layerInstances[id] as Component).setState({lock});
            })
        }
        this.refreshSelection();
    }

    private refreshSelection = () => {
        eventOperateStore.setTargetIds(eventOperateStore.targetIds, eventOperateStore.selectionSource);
        eventOperateStore.interactionRef?.refreshOverlay?.();
    };

}

const lockRollbackImpl = new LockRollbackImpl();
export default lockRollbackImpl;
