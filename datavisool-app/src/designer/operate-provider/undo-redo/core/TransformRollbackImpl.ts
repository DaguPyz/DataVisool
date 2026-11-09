/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import AbstractRollback from "./AbstractRollback";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore";
import {IHistoryRecord, ITransformOperateData} from "@/designer/operate-provider/undo-redo/OperateType";
import DomUtil from "@/util/DomUtil.ts";
import {buildLayerTransformDomStyle, findLayerTransformTarget} from "@/util/LayerTransformUtil.ts";
import baseInfoStore from "@/comps/common-component/base-info/BaseInfoStore.ts";

export class TransformRollbackImpl extends AbstractRollback {
    private applyTransform = (recordData: ITransformOperateData[]) => {
        if (!recordData || recordData.length === 0)
            return;
        const {updateLayer, layerConfigs} = window.DATAVISOOL_ENV.currentManager.layerManager;
        updateLayer(recordData as any, true);
        recordData.forEach((item) => {
            const domTarget = findLayerTransformTarget(item.id);
            if (domTarget)
                DomUtil.updateDomStyle(domTarget, buildLayerTransformDomStyle(item.transform));
            const currentLayer = layerConfigs[item.id];
            if (currentLayer)
                baseInfoStore.updateBaseConfig(currentLayer);
        });
    }

    redo(record: IHistoryRecord): void {
        if (!record) return;
        const {setTargetIds} = eventOperateStore;
        const {next} = record;
        const nextRecordData = next! as ITransformOperateData[];
        setTargetIds([]);
        this.applyTransform(nextRecordData);
        Promise.resolve().then(() => {
            setTargetIds(nextRecordData.map((item) => item.id));
        });
    }

    undo(record: IHistoryRecord): void {
        if (!record) return;
        const {setTargetIds} = eventOperateStore;
        const {prev} = record;
        const prevRecordData = prev! as ITransformOperateData[];
        setTargetIds([]);
        this.applyTransform(prevRecordData);
        Promise.resolve().then(() => {
            setTargetIds(prevRecordData.map((item) => item.id));
        });
    }

}

const transformRollbackImpl = new TransformRollbackImpl();
export default transformRollbackImpl;
