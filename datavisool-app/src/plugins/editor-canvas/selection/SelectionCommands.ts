/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cloneDeep} from "lodash";
import {globalMessage} from "@datavisool/ui";
import type {ILayerItem} from "@datavisool/sdk/types";
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EventOperateStore, SelectionSource} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import type {HistoryRecordOperateProxy} from "@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts";
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
import {createDeleteSelectionTreeWithHistory} from "./SelectionDeleteCommand.ts";

export interface SelectionCommandOptions {
    readonly eventOperateStore: EventOperateStore;
    readonly historyProxy: HistoryRecordOperateProxy;
    readScene(): DesignerEditingScene | undefined;
    isActive(): boolean;
    trackTask?<T>(task: Promise<T>): Promise<T>;
}

export function createSelectionCommands(options: SelectionCommandOptions) {
    const {eventOperateStore, historyProxy, readScene, isActive} = options;
    const deleteSelectionTreeWithHistory = createDeleteSelectionTreeWithHistory({historyProxy, readScene, isActive});
const getLayerConfigs = () => ({...(isActive() ? readScene()?.readLayerConfigs() ?? {} : {})});

const isManagementSource = (source: SelectionSource) => {
    return source === "layer-list" || source === "search" || source === "context-menu";
};

const resolveSelectedCommandTargetIds = () => {
    const {targetIds, selectionSource} = eventOperateStore;
    return resolveCommandTargetIds(targetIds, getLayerConfigs(), {
        allowLockedManagement: isManagementSource(selectionSource),
    });
};

const canManageSelectedObjects = () => {
    const {targetIds, selectionSource} = eventOperateStore;
    const layers = getLayerConfigs();
    return targetIds.length > 0 && targetIds.every((id) => {
        return resolveCommandTargetIds([id], layers, {
            allowLockedManagement: isManagementSource(selectionSource),
        }).length > 0;
    });
};

const selectAll = () => {
    const selectedIds = resolveTopLevelSelectionIds(getLayerConfigs());
    eventOperateStore.setTargetIds(selectedIds, "canvas");
};

const doClone = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length === 0)
        return;

    const scene = readScene();
    if (!scene) return;
    const newIds = historyProxy.doClone(targetIds);
    const pending = new Promise<void>((resolve, reject) => {
        window.setTimeout(() => {
            try {
                if (isActive() && readScene() === scene) {
                    const layerConfigs = getLayerConfigs();
                    const ids = newIds.filter(id => Boolean(layerConfigs[id]));
                    eventOperateStore.setTargetIds(ids, 'system');
                }
                resolve();
            } catch (error) { reject(error); }
        }, 10);
    });
    return options.trackTask ? options.trackTask(pending) : pending;
};

const doCopy = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length === 0)
        return;

    const tempData: {
        flag: string;
        layers: Record<string, ILayerItem>;
        configs: Record<string, unknown>;
    } = {flag: "DATAVISOOL_COPY", layers: {}, configs: {}};
    const snapshot = readScene()?.layers.read();
    if (!snapshot) return;
    const layerConfigs = snapshot.layers as Record<string, ILayerItem>;
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
        const config = snapshot.configs[id];
        if (config !== undefined)
            tempData.configs[id] = cloneDeep(config);
    });

    return TextUtil.copyToClipboard(JSON.stringify(tempData))
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
        historyProxy.doLockUpd(items);
    eventOperateStore.setTargetIds(targetIds, eventOperateStore.selectionSource);
    eventOperateStore.interactionRef?.refreshOverlay?.();
};

const doLock = () => updateLockState(true);

const doUnLock = () => updateLockState(false);

const layerToTop = () => {
    if (canManageSelectedObjects())
        historyProxy.doLayerToTop();
};

const layerToBottom = () => {
    if (canManageSelectedObjects())
        historyProxy.doLayerToBottom();
};

const layerMoveUp = () => {
    if (canManageSelectedObjects())
        historyProxy.doLayerMoveUp();
};

const layerMoveDown = () => {
    if (canManageSelectedObjects())
        historyProxy.doLayerMoveDown();
};

const deleteLayersByIds = (targetIds: string[]) => {
    return deleteSelectionTreeWithHistory(targetIds);
};

const doDelete = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length > 0)
        deleteLayersByIds(targetIds);
};

const doHide = () => {
    const targetIds = resolveSelectedCommandTargetIds();
    if (targetIds.length === 0)
        return;
    historyProxy.doHideUpd(targetIds, true);
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

    historyProxy.doDrag(patches);
    eventOperateStore.setTargetIds(targetIds, selectionSource);
    eventOperateStore.interactionRef?.refreshLayerGeometry?.(patches.map((item) => item.id));
};

const groupLeftAligned = () => alignSelection("left");
const groupRightAligned = () => alignSelection("right");
const groupTopAligned = () => alignSelection("top");
const groupBottomAligned = () => alignSelection("bottom");

    const commands = {
        resolveSelectedCommandTargetIds,
        canManageSelectedObjects,
        selectAll,
        doClone,
        doCopy,
        doLock,
        doUnLock,
        layerToTop,
        layerToBottom,
        layerMoveUp,
        layerMoveDown,
        deleteLayersByIds,
        doDelete,
        doHide,
        groupLeftAligned,
        groupRightAligned,
        groupTopAligned,
        groupBottomAligned,
    };
    return new Proxy(commands, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => isActive() ? value.apply(receiver, args) : undefined;
        },
    });
}
