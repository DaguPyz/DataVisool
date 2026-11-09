/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {IGraphicalTransform, IHistoryRecord} from "@/designer/operate-provider/undo-redo/OperateType";
import DomUtil from "@/util/DomUtil.ts";

export class DragRollbackImpl extends AbstractRollback {
    redo(record: IHistoryRecord): void {
        if (!record) return;
        const {setTargetIds} = eventOperateStore;
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager;
        const {next} = record!;
        const nextRecordData = next! as IGraphicalTransform[];
        //选中目标元素
        setTargetIds([]);
        //执行反向操作,React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        updateLayer(nextRecordData, false);
        nextRecordData.forEach((item) => {
            const {id, x, y, rotate} = item;
            DomUtil.updateDomStyle(document.getElementById(id!)!, {transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`})
        })
        eventOperateStore.interactionRef?.refreshLayerGeometry?.(nextRecordData.map((item) => item.id));
        Promise.resolve().then(() => {
            setTargetIds(record.selectionIds ?? nextRecordData.map((item) => item.id));
        })
    }

    undo(record: IHistoryRecord): void {
        if (!record) return;
        const {setTargetIds} = eventOperateStore;
        const {updateLayer} = window.DATAVISOOL_ENV.currentManager.layerManager;
        const {prev} = record!;
        const prevRecordData = prev! as IGraphicalTransform[];
        //选中目标元素
        setTargetIds([]);
        //执行反向操作,React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        updateLayer(prevRecordData, false);
        prevRecordData.forEach((item) => {
            const {id, x, y, rotate} = item;
            DomUtil.updateDomStyle(document.getElementById(id!)!, {transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`})
        })
        eventOperateStore.interactionRef?.refreshLayerGeometry?.(prevRecordData.map((item) => item.id));
        Promise.resolve().then(() => {
            setTargetIds(record.selectionIds ?? prevRecordData.map((item) => item.id));
        })
    }

}

const dragRollbackImpl = new DragRollbackImpl();
export default dragRollbackImpl;
