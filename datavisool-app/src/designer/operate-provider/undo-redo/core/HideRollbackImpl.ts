/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import {IHideOperateData, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import layerListStore from "@/designer/left/layer-list/LayerListStore";
import designerLeftStore from "@/designer/left/DesignerLeftStore";
import {BaseLayer} from "@/designer/left/layer-list/item/BaseLayer.tsx";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";

/**
 * hide, lock, order的撤销与回滚操作实现
 */
export class HideRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        if (!record) return;
        const {next} = record;
        const {updateLayer, controllers} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (next)
            updateLayer(next as IHideOperateData[]);
        const {layerInstances} = layerListStore;
        const {menu} = designerLeftStore;
        (next as IHideOperateData[])?.forEach((item) => {
            const {id, hide} = item;
            const controller = controllers[id];
            if (controller)
                controller.setVisible(!hide);
            if (menu === 'layer-list')
                (layerInstances[id] as BaseLayer).changeHide(hide);
        })
        this.refreshSelection();
    }

    undo(record: IHistoryRecord): void {
        if (!record) return;
        const {prev} = record;
        const {updateLayer, controllers} = window.DATAVISOOL_ENV.currentManager.layerManager
        if (prev)
            updateLayer(prev as IHideOperateData[]);
        const {layerInstances} = layerListStore;
        const {menu} = designerLeftStore;
        (prev as IHideOperateData[])?.forEach((item) => {
            const {id, hide} = item;
            const controller = controllers[id];
            if (controller)
                controller.setVisible(!hide);
            if (menu === 'layer-list')
                (layerInstances[id] as BaseLayer).changeHide(hide);
        })
        this.refreshSelection();
    }

    private refreshSelection = () => {
        eventOperateStore.setTargetIds(eventOperateStore.targetIds, eventOperateStore.selectionSource);
        eventOperateStore.interactionRef?.refreshOverlay?.();
    };

}

const hideRollbackImpl = new HideRollbackImpl();
export default hideRollbackImpl;
