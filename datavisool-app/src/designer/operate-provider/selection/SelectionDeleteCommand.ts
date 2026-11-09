/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cloneDeep} from "lodash";
import {runInAction} from "mobx";
import rightStore from "@/designer/right/RightStore.ts";
import eventOperateStore from "@/designer/operate-provider/EventOperateStore.ts";
import {historyOperator} from "@/designer/operate-provider/undo-redo/HistoryOperator.ts";
import {
    type IDelOperateData,
    type IUpdLayerOperateData,
    OperateType,
} from "@/designer/operate-provider/undo-redo/OperateType.ts";

/** 删除显式管理选择，隐藏状态不影响删除资格。 */
export const deleteSelectionTreeWithHistory = (ids: readonly string[]) => {
    const layerManager = window.DATAVISOOL_ENV.currentManager.layerManager;
    const {delItem, layerConfigs, controllers} = layerManager;
    const targetIds = Array.from(new Set(ids)).filter((id) => Boolean(layerConfigs[id]));
    if (targetIds.length === 0)
        return;

    const {setContentVisible, activeConfig, activeElem} = rightStore;
    if (targetIds.includes(activeElem.id!)) {
        setContentVisible(false);
        activeConfig(null, "");
    }

    const delPrev: IDelOperateData[] = [];
    const delNext: IDelOperateData[] = [];
    const updPrev: IUpdLayerOperateData[] = [];
    const updNext: IUpdLayerOperateData[] = [];
    const relatedLayerIds = new Set<string>();

    targetIds.forEach((id) => {
        const layer = layerConfigs[id];
        relatedLayerIds.add(id);
        if (layer.next)
            relatedLayerIds.add(layer.next);
        if (layer.prev)
            relatedLayerIds.add(layer.prev);
        if (layer.pid) {
            const parent = layerConfigs[layer.pid];
            if (parent?.childHeader === id || parent?.childTail === id)
                relatedLayerIds.add(parent.id!);
        }
    });

    const targetSet = new Set(targetIds);
    const toBeUpdated = Array.from(relatedLayerIds).filter((id) => !targetSet.has(id));
    targetIds.forEach((id) => {
        delPrev.push({
            id,
            layerConfig: cloneDeep(layerConfigs[id]),
            elemConfig: controllers[id]?.getConfig(),
        });
    });
    updPrev.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
    toBeUpdated.forEach((id) => {
        const {next, prev, childHeader, childTail, pid} = layerConfigs[id];
        updPrev.push({id, next, prev, childHeader, childTail, pid});
    });

    runInAction(() => {
        targetIds.forEach((id) => {
            const layer = layerConfigs[id];
            const previous = layerConfigs[layer.prev!];
            const next = layerConfigs[layer.next!];
            if (id === layerManager.layerHeader)
                layerManager.layerHeader = layer.next;
            if (id === layerManager.layerTail)
                layerManager.layerTail = layer.prev;
            if (previous)
                previous.next = layer.next;
            if (next)
                next.prev = layer.prev;
            if (layer.pid) {
                const parent = layerConfigs[layer.pid];
                if (parent?.childHeader === id)
                    parent.childHeader = layer.next;
                if (parent?.childTail === id)
                    parent.childTail = layer.prev;
            }
        });
        delItem(targetIds);
    });

    toBeUpdated.forEach((id) => {
        const {next, prev, childHeader, childTail, pid} = layerConfigs[id];
        updNext.push({id, next, prev, childHeader, childTail, pid});
    });
    delNext.push({layerHeader: layerManager.layerHeader, layerTail: layerManager.layerTail});
    historyOperator.put({actions: [
        {type: OperateType.DEL, prev: delPrev, next: delNext},
        {type: OperateType.UPDATE_LAYER, prev: updPrev, next: updNext},
    ]});

    eventOperateStore.setTargetIds([]);
    eventOperateStore.focusDesignerCanvas();
};
