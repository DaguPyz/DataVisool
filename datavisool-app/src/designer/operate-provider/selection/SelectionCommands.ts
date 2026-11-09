/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cloneDeep} from "lodash";
import {globalMessage} from "@datavisool/ui";
import type {ILayerItem} from "@datavisool/sdk/types";
import eventOperateStore, {type SelectionSource} from "@/designer/operate-provider/EventOperateStore.ts";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import TextUtil from "@/util/TextUtil.ts";
import {
    expandSelectionTreeIds,
    resolveCommandTargetIds,
    resolveTopLevelSelectionIds,
} from "./SelectionPolicy.ts";
import {
    calculateLayerIdsBounds,
    calculateSelectionAlignmentMoves,
} from "./SelectionGeometry.ts";
import type {SelectionAlignment} from "./SelectionTypes.ts";
import {deleteSelectionTreeWithHistory} from "./SelectionDeleteCommand.ts";

const isManagementSource = (source: SelectionSource) => {
    return source === "layer-list" || source === "search" || source === "context-menu";
};

const getLayerConfigs = () => window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs;

export const resolveSelectedCommandTargetIds = () => {
    const {targetIds, selectionSource} = eventOperateStore;
    return resolveCommandTargetIds(targetIds, getLayerConfigs(), {
        allowLockedManagement: isManagementSource(selectionSource),
    });
};

export const canManageSelectedObjects = () => {
    const {targetIds, selectionSource} = eventOperateStore;
    const layers = getLayerConfigs();
    return targetIds.length > 0 && targetIds.every((id) => {
        return resolveCommandTargetIds([id], layers, {
            allowLockedManagement: isManagementSource(selectionSource),
        }).length > 0;
    });
};

export const selectAll = () => {
    const selectedIds = resolveTopLevelSelectionIds(getLayerConfigs());
    eventOperateStore.setTargetIds(selectedIds, "canvas");
};

export const doClone = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length === 0)
        return;

    const newIds = historyRecordOperateProxy.doClone(targetIds);
    const timer = window.setTimeout(() => {
        eventOperateStore.setTargetIds(newIds, "system");
        if (newIds.length > 0)
            componentDataGvParser.bindConfigToGvById(newIds);
        window.clearTimeout(timer);
    }, 10);
};

export const doCopy = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length === 0)
        return;

    const tempData: {
        flag: string;
        layers: Record<string, ILayerItem>;
        configs: Record<string, unknown>;
    } = {flag: "DATAVISOOL_COPY", layers: {}, configs: {}};
    const {layerConfigs, controllers} = window.DATAVISOOL_ENV.currentManager.layerManager;
    const leafIds = targetIds.filter((id) => layerConfigs[id]?.type !== "group");
    const baseCoordinate = calculateLayerIdsBounds(leafIds, layerConfigs);
    if (!baseCoordinate)
        return;

    targetIds.forEach((id) => {
        const sourceLayer = layerConfigs[id];
        if (sourceLayer) {
            const layer = cloneDeep(sourceLayer);
            if (layer.type !== "group") {
                layer.x = (layer.x ?? 0) - baseCoordinate.minX;
                layer.y = (layer.y ?? 0) - baseCoordinate.minY;
            }
            layer.lock = false;
            tempData.layers[id] = layer;
        }
        const controller = controllers[id];
        if (controller)
            tempData.configs[id] = controller.getConfig();
    });

    TextUtil.copyToClipboard(JSON.stringify(tempData))
        .then(() => globalMessage.messageApi?.success("组件已复制到剪贴板"));
};

const updateLockState = (lock: boolean) => {
    const {targetIds} = eventOperateStore;
    const layers = getLayerConfigs();
    const treeIds = expandSelectionTreeIds(targetIds, layers);
    const items = treeIds
        .filter((id) => Boolean(layers[id]) && Boolean(layers[id].lock) !== lock)
        .map((id) => ({id, lock}));
    if (items.length > 0)
        historyRecordOperateProxy.doLockUpd(items);
    eventOperateStore.setTargetIds(targetIds, eventOperateStore.selectionSource);
    eventOperateStore.interactionRef?.refreshOverlay?.();
};

export const doLock = () => updateLockState(true);

export const doUnLock = () => updateLockState(false);

export const layerToTop = () => {
    if (canManageSelectedObjects())
        historyRecordOperateProxy.doLayerToTop();
};

export const layerToBottom = () => {
    if (canManageSelectedObjects())
        historyRecordOperateProxy.doLayerToBottom();
};

export const layerMoveUp = () => {
    if (canManageSelectedObjects())
        historyRecordOperateProxy.doLayerMoveUp();
};

export const layerMoveDown = () => {
    if (canManageSelectedObjects())
        historyRecordOperateProxy.doLayerMoveDown();
};

export const deleteLayersByIds = (targetIds: string[]) => {
    if (targetIds.length > 0) {
        const bluePrintManager = window.DATAVISOOL_ENV.currentManager.bluePrintManager;
        const bpNodeLayoutMap = bluePrintManager?.currentPageManager?.bpNodeLayoutMap ?? {};
        const preDeleteNodeIds = targetIds.filter((id) => Boolean(bpNodeLayoutMap[id]));
        if (preDeleteNodeIds.length > 0)
            bluePrintManager?.delNodeEveryPage(preDeleteNodeIds);
    }

    deleteSelectionTreeWithHistory(targetIds);
    componentDataGvParser.unbindFromGv(targetIds);
};

export const doDelete = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length > 0)
        deleteLayersByIds(targetIds);
};

export const doHide = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length === 0)
        return;
    historyRecordOperateProxy.doHideUpd(targetIds, true);
    eventOperateStore.setTargetIds([]);
};

const alignSelection = (alignment: SelectionAlignment) => {
    const {targetIds, selectionSource} = eventOperateStore;
    const layers = getLayerConfigs();
    const movableSelectionIds = targetIds.filter((id) => {
        return resolveCommandTargetIds([id], layers, {allowLockedManagement: false}).length > 0;
    });
    const moves = calculateSelectionAlignmentMoves(movableSelectionIds, layers, alignment);
    if (moves.length < 2)
        return;

    const patches = moves.flatMap((move) => move.targetIds.map((id) => ({
        id,
        x: (layers[id]?.x ?? 0) + move.dx,
        y: (layers[id]?.y ?? 0) + move.dy,
    })));
    if (patches.length === 0)
        return;

    historyRecordOperateProxy.doDrag(patches);
    window.DATAVISOOL_ENV.currentManager.layerManager.reRenderLayer();
    eventOperateStore.setTargetIds(targetIds, selectionSource);
    eventOperateStore.interactionRef?.refreshLayerGeometry?.(patches.map((item) => item.id));
};

export const groupLeftAligned = () => alignSelection("left");
export const groupRightAligned = () => alignSelection("right");
export const groupTopAligned = () => alignSelection("top");
export const groupBottomAligned = () => alignSelection("bottom");
