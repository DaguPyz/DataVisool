/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {IHistoryRecord, ITransformOperateData} from "@/plugins/editor-canvas/history/OperateType";
import type {ILayerItem} from '@datavisool/sdk/types';
import DomUtil from "@/util/DomUtil.ts";
import {buildLayerTransformDomStyle, findLayerTransformTarget} from "@/util/LayerTransformUtil.ts";

export class TransformRollbackImpl extends AbstractRollback {
    constructor(eventOperateStore: EventOperateStore) { super(eventOperateStore); }

    private applyTransform = (recordData: ITransformOperateData[]) => {
        if (!recordData || recordData.length === 0)
            return;
        const {updateLayer, layerConfigs} = this.eventOperateStore.readLegacyModel()!.layerManager;
        updateLayer(recordData as any, true);
        const updatedLayers: Array<Pick<ILayerItem, 'id'> & Partial<ILayerItem>> = [];
        recordData.forEach((item) => {
            const domTarget = findLayerTransformTarget(item.id);
            if (domTarget)
                DomUtil.updateDomStyle(domTarget, buildLayerTransformDomStyle(item.transform));
            const currentLayer = layerConfigs[item.id];
            if (currentLayer)
                updatedLayers.push(currentLayer);
        });
        if (updatedLayers.length)
            this.eventOperateStore.emitInspectorChange({kind: 'layers-updated', layers: updatedLayers});
    }

    redo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {setTargetIds} = this.eventOperateStore;
        const {next} = record;
        const nextRecordData = next! as ITransformOperateData[];
        setTargetIds([]);
        this.applyTransform(nextRecordData);
        this.afterScene(scene, () => setTargetIds(nextRecordData.map((item) => item.id)));
    }

    undo(record: IHistoryRecord): void {
        const scene = this.captureScene();
        if (!record || !scene) return;
        const {setTargetIds} = this.eventOperateStore;
        const {prev} = record;
        const prevRecordData = prev! as ITransformOperateData[];
        setTargetIds([]);
        this.applyTransform(prevRecordData);
        this.afterScene(scene, () => setTargetIds(prevRecordData.map((item) => item.id)));
    }

}

