/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {IHistoryRecord, IRotateOperateData} from "@/plugins/editor-canvas/history/OperateType";
import DomUtil from "@/util/DomUtil.ts";

export class RotateRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {setTargetIds} = this.eventOperateStore;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager;
        const {next} = record!;
        const nextRecordData = next! as IRotateOperateData[];
        setTargetIds([]);
        //执行反向操作,React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        updateLayer(nextRecordData, false);
        nextRecordData.forEach((item) => {
            const {id, rotate, x, y} = item;
            DomUtil.updateDomStyle(document.getElementById(id!)!, {transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`})
        })
        this.eventOperateStore.interactionRef?.refreshLayerGeometry?.(nextRecordData.map((item) => item.id));
        this.afterScene(scene, () => setTargetIds(record.selectionIds ?? nextRecordData.map((item) => item.id)));
    }

    undo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {setTargetIds} = this.eventOperateStore;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager;
        const {prev} = record!;
        const prevRecordData = prev! as IRotateOperateData[];
        //选中目标元素
        setTargetIds([]);
        //执行反向操作,React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        updateLayer(prevRecordData, false);
        prevRecordData.forEach((item) => {
            const {id, rotate, x, y} = item;
            DomUtil.updateDomStyle(document.getElementById(id!)!, {transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`})
        })
        this.eventOperateStore.interactionRef?.refreshLayerGeometry?.(prevRecordData.map((item) => item.id));
        this.afterScene(scene, () => setTargetIds(record.selectionIds ?? prevRecordData.map((item) => item.id)));
    }

}

