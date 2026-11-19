/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {IDelOperateData, IHistoryRecord} from "@/plugins/editor-canvas/history/OperateType";
import {cloneDeep} from "lodash";

export class DelRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {layerManager} = this.eventOperateStore.readLegacyModel()!;
        const {prev, next} = record!;
        const layerData: IDelOperateData[] = [];
        (prev as IDelOperateData[]).forEach((item) => {
            if ('id' in item)
                layerData.push(item);
        });

        //执行正向操作删除元素
        const {delItem} = layerManager;
        const delIds: string[] = [];
        layerData.forEach((item) => delIds.push(item.id!));
        delItem(delIds);
        //恢复下一个状态的头尾指针指向
        next && (next as IDelOperateData[]).forEach((item) => {
            if ('layerHeader' in item)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item)
                layerManager.layerTail = item.layerTail;
        });

        const {setTargetIds, focusDesignerCanvas} = this.eventOperateStore;
        //清空框选状态,避免空框选
        setTargetIds([]);
        //删除元素后重新聚焦画布
        focusDesignerCanvas();
    }

    undo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {layerManager} = this.eventOperateStore.readLegacyModel()!;
        const {setTargetIds} = this.eventOperateStore;
        const {prev} = record!;
        //区分开图层数据和指针数据
        const layerData: IDelOperateData[] = [];
        const pointerData: IDelOperateData[] = [];
        (prev as IDelOperateData[]).forEach((item) => {
            if ('id' in item)
                layerData.push(item);
            else
                pointerData.push(item);
        });

        //执行反向操作添加元素
        const {addItem, elemConfigs} = layerManager;
        const targetIds: string[] = [];
        layerData.forEach((item) => {
            addItem(cloneDeep(item.layerConfig!));
            if (item.elemConfig !== undefined)
                elemConfigs![item.id!] = item.elemConfig;
            else
                delete elemConfigs![item.id!];
            targetIds.push(item.id!);
        });

        //恢复上一个状态的头尾指针指向
        pointerData.forEach((item) => {
            if ('layerHeader' in item)
                layerManager.layerHeader = item.layerHeader;
            if ('layerTail' in item)
                layerManager.layerTail = item.layerTail;
        });

        //选中目标元素，React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        this.afterScene(scene, () => setTargetIds(targetIds));

    }

}

