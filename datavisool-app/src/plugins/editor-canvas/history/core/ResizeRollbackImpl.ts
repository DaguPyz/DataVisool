/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {IGraphicalTransform, IHistoryRecord} from "@/plugins/editor-canvas/history/OperateType";
import DomUtil from "@/util/DomUtil.ts";

export class ResizeRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    redo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {setTargetIds} = this.eventOperateStore;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager;
        const {next} = record!;
        const nextResizeData = next! as IGraphicalTransform[];
        //选中目标元素
        setTargetIds([]);
        //执行反向操作，React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        updateLayer(nextResizeData, true);
        nextResizeData.forEach((item) => {
            const {id, x, y, width, height, rotate} = item;
            DomUtil.updateDomStyle(document.getElementById(id!)!, {transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`, width: `${width}px`, height: `${height}px`})
        })
        this.eventOperateStore.interactionRef?.refreshLayerGeometry?.(nextResizeData.map((item) => item.id));
        this.afterScene(scene, () => setTargetIds(record.selectionIds ?? nextResizeData.map((item) => item.id)));
    }

    undo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {setTargetIds} = this.eventOperateStore;
        const {updateLayer} = this.eventOperateStore.readLegacyModel()!.layerManager;
        const {prev} = record!;
        const prevResizeData = prev! as IGraphicalTransform[];
        //选中目标元素
        setTargetIds([]);
        //执行反向操作,React18推出了新的批处理和并发执行机制，导致之前17版本中部分逻辑代码的执行顺序发生了变化，因此这里需要将反向执行操作放到下一个事件循环中执行
        updateLayer(prevResizeData, true);
        prevResizeData.forEach((item) => {
            const {id, x, y, width, height, rotate} = item;
            DomUtil.updateDomStyle(document.getElementById(id!)!, {transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`, width: `${width}px`, height: `${height}px`})
        })
        this.eventOperateStore.interactionRef?.refreshLayerGeometry?.(prevResizeData.map((item) => item.id));
        this.afterScene(scene, () => setTargetIds(record.selectionIds ?? prevResizeData.map((item) => item.id)));
    }

}

