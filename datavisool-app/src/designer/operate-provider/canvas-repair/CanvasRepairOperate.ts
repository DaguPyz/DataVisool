/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import LayerRepairUtil, {ICanvasRepairAnalysis} from "@/designer/left/layer-list/util/LayerRepairUtil.ts";
import {deleteLayersByIds} from "@/designer/operate-provider/hot-key/HotKeyImpl.ts";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";

const getCurrentLayerManager = () => window.DATAVISOOL_ENV?.currentManager?.layerManager ?? null;

const normalizeTargetIds = (analysis: ICanvasRepairAnalysis, orphanIds?: string[]) => {
    const targetIdSet = new Set<string>((orphanIds && orphanIds.length > 0 ? orphanIds : analysis.orphanIds).filter(Boolean));
    return analysis.orphanIds.filter(id => targetIdSet.has(id));
}

export const scanCanvasRepairAnalysis = (): ICanvasRepairAnalysis => {
    return LayerRepairUtil.scanCanvasRepairAnalysis(getCurrentLayerManager());
}

export const deleteCanvasOrphans = (orphanIds?: string[]) => {
    const analysis = scanCanvasRepairAnalysis();
    const targetIds = normalizeTargetIds(analysis, orphanIds);
    if (targetIds.length === 0)
        return analysis;
    deleteLayersByIds(targetIds);
    return analysis;
}

export const prependCanvasOrphans = (orphanIds?: string[]) => {
    const analysis = scanCanvasRepairAnalysis();
    const targetIds = normalizeTargetIds(analysis, orphanIds);
    if (targetIds.length === 0)
        return analysis;
    historyRecordOperateProxy.doRepairOrphansPrepend(targetIds);
    return analysis;
}

export const repairCanvasTailPointer = () => {
    const analysis = scanCanvasRepairAnalysis();
    if (!analysis.renderTailId || analysis.layerTail === analysis.renderTailId)
        return analysis;
    historyRecordOperateProxy.doRepairTailPointer(analysis.renderTailId);
    return analysis;
}
