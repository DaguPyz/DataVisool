/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {IAddOperateData, IHistoryRecord} from "@/plugins/editor-canvas/history/OperateType";
import {cloneDeep} from "lodash";
export class AddRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        if (!record || !this.eventOperateStore.isActive()) return;
        if (!this.eventOperateStore.isActive()) return;
        const {layerManager} = this.eventOperateStore.readLegacyModel()!;
        const {next} = record!;
        //执行正向操作添加元素
        const {addItem} = layerManager;
        const compIds: string[] = [];
        (next as IAddOperateData[]).forEach((item) => {
            if ('id' in item) {
                compIds.push(item.id!);
                addItem(cloneDeep(item.layerConfig!));
                if ('elemConfig' in item)
                    layerManager.elemConfigs![item.id!] = cloneDeep(item.elemConfig!);
            }
            if ('layerHeader' in item)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item)
                layerManager.layerTail = item.layerTail;
        });

    }

    undo(record: IHistoryRecord): void {
        if (!record || !this.eventOperateStore.isActive())
            return;
        if (!this.eventOperateStore.isActive()) return;
        const {layerManager} = this.eventOperateStore.readLegacyModel()!;
        const {setTargetIds, focusDesignerCanvas} = this.eventOperateStore;
        const {prev, next} = record!;
        //执行反向操作删除元素
        const {delItem} = layerManager;
        const delIds: string[] = [];
        next && (next! as IAddOperateData[]).forEach((item) => delIds.push(item.id!));
        delItem(delIds);
        this.eventOperateStore.emitInspectorChange({kind: 'targets-deleted', ids: delIds});
        prev && (prev as IAddOperateData[]).forEach((item) => {
            if ('layerHeader' in item!)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item!)
                layerManager.layerTail = item.layerTail;
        });


        //清空框选状态,避免空框选
        setTargetIds([]);
        //删除元素后重新聚焦画布
        focusDesignerCanvas();
    }

}

