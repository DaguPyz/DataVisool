/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {ILayerItem} from "@datavisool/sdk/types";
import type {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import type {ViewportStore} from "@/plugins/editor-canvas/viewport/ViewportStore.ts";
import type {HistoryRecordOperateProxy} from "@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts";
import LayerUtil from "@/plugins/editor-canvas/layers/LayerUtil.ts";
import type {createSelectionCommands} from "@/plugins/editor-canvas/selection/SelectionCommands.ts";
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';

type SelectionCommands = ReturnType<typeof createSelectionCommands>;

export function createCanvasActions({
    viewportStore,
    eventOperateStore,
    historyProxy,
    selectionCommands,
    readScene,
    isActive,
    createLoopContainer,
    toggleAuxiliaryBorder,
}: {
    readonly viewportStore: ViewportStore;
    readonly eventOperateStore: EventOperateStore;
    readonly historyProxy: HistoryRecordOperateProxy;
    readonly selectionCommands: SelectionCommands;
    readScene(): DesignerEditingScene | undefined;
    isActive(): boolean;
    createLoopContainer(): void;
    toggleAuxiliaryBorder(): void;
}) {
const requireScene = () => isActive() ? readScene() : undefined;
const selectAll = selectionCommands.selectAll;


/**
 * 克隆组件
 */
const doClone = selectionCommands.doClone;

/**
 * 粘贴
 */
const doPaste = (data: string) => {
    if (!data || !data.includes('DATAVISOOL_COPY'))
        return;
    const template = JSON.parse(data);
    if (template && template.flag === 'DATAVISOOL_COPY' && template.layers) {
        const scene = requireScene();
        if (!scene) return;
        const canvasConfig = scene.readCanvasConfig();
        //恢复组件位置
        Object.keys(template.layers).forEach(layerId => {
            const layer = template.layers[layerId];
            const {width = 0, height = 0} = canvasConfig ?? {width: 0, height: 0};
            if (layer && layer.type !== 'group') {
                layer.x = Math.round((width / 2) + (layer?.x ?? 0));
                layer.y = Math.round((height / 2) + (layer?.y ?? 0));
            }
        });
        historyProxy.doUseTemplate(template);
    }
}

/**
 * 复制
 */
const doCopy = selectionCommands.doCopy;
const doLock = selectionCommands.doLock;
const doUnLock = selectionCommands.doUnLock;
const layerToTop = selectionCommands.layerToTop;
const layerToBottom = selectionCommands.layerToBottom;
const layerMoveUp = selectionCommands.layerMoveUp;
const layerMoveDown = selectionCommands.layerMoveDown;
const deleteLayersByIds = selectionCommands.deleteLayersByIds;
const doDelete = selectionCommands.doDelete;

const doHide = selectionCommands.doHide;

/**
 * 图层编组,
 * 编组时候，如果都是普通组件图层，则直接编组
 * 如果包含了已经分组的图层，则将将已经编组的这个组作为基本图层和其他图层进行编组，
 * 比如有A,B,C三个普通图层，则编组的时候可直接生成编组G
 * 如果A,B已经编组为G1，此时再选中A,C或B,C，或者A,B,C，则编组的时候，G1作为基本图层，和C进行编组，生成G2
 */
const doGrouping = () => {
    if (selectionCommands.canManageSelectedObjects())
        historyProxy.doGrouping();
}

const doUnGrouping = () => {
    if (selectionCommands.canManageSelectedObjects())
        historyProxy.doUnGrouping();
}


const removeFromGroup = () => {
    if (selectionCommands.canManageSelectedObjects())
        historyProxy.doRemoveFromGroup();
}

const cleanEmptyGroupings = () => {
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    if (!layerConfigs) return;
    const emptyGroupIdArr = LayerUtil.findEmptyGrouping(Object.values(layerConfigs));
    deleteLayersByIds(emptyGroupIdArr);
}

/*************************快捷键控制移动组件的位置*************************/

const isSingleTransformLayer = (ids: string[], layers: Record<string, ILayerItem>) => {
    return ids.length === 1 && layers[ids[0]]?.type !== "group";
};

const doMoveUp = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const dragStep = scene?.readCanvasConfig()?.dragStep ?? 1;
    if (!scene || !layerConfigs) return;
    let yPos;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        yPos = (layerConfigs[id].y || 0) - dragStep;
    } else {
        yPos = (groupCoordinate?.minY || 0) - dragStep;
    }
    interactionRef?.request("draggable", {y: yPos}, true);
}

const doMoveDown = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const dragStep = scene?.readCanvasConfig()?.dragStep ?? 1;
    if (!scene || !layerConfigs) return;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        const yPos = layerConfigs[id].y! + dragStep;
        interactionRef?.request("draggable", {y: yPos}, true);
    } else {
        const yPos = (groupCoordinate?.minY ?? Infinity) + dragStep;
        interactionRef?.request("draggable", {y: yPos}, true);
    }
}

const doMoveLeft = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const dragStep = scene?.readCanvasConfig()?.dragStep ?? 1;
    if (!scene || !layerConfigs) return;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        const xPos = layerConfigs[id].x!;
        interactionRef?.request("draggable", {x: xPos - dragStep}, true);
    } else {
        const xPos = (groupCoordinate?.minX ?? Infinity) - dragStep;
        interactionRef?.request("draggable", {x: xPos}, true);
    }
}

const doMoveRight = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const dragStep = scene?.readCanvasConfig()?.dragStep ?? 1;
    if (!scene || !layerConfigs) return;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        const xPos = layerConfigs[id].x!;
        interactionRef?.request("draggable", {x: xPos + dragStep}, true);
    } else {
        const xPos = (groupCoordinate?.minX ?? Infinity) + dragStep;
        interactionRef?.request("draggable", {x: xPos}, true);
    }
}

/*************************快捷键控制缩放组件尺寸*************************/

/**
 * 以底部为基准向上扩大
 */
const doBaseBottomEnlargeUp = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        height = layerConfigs[id].height! + resizeStep;
    } else {
        height = groupCoordinate.height! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, -1]}, true);
}

/**
 * 以顶部为基准向下扩大
 */
const doBaseUpEnlargeDown = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        height = layerConfigs[id].height! + resizeStep;
    } else {
        height = groupCoordinate.height! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, 1]}, true);
}

/**
 * 以右边为基准向左扩大
 */
const doBaseRightEnlargeLeft = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! + resizeStep;
    } else {
        width = groupCoordinate.width! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [-1, 1]}, true);
}

/**
 * 以左边为基准向右扩大
 */
const doBaseLeftEnlargeRight = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! + resizeStep;
    } else {
        width = groupCoordinate.width! + resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [1, 1]}, true);
}


/**
 * 以底部为基准向上缩小
 */
const doBaseBottomDecreaseUp = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        height = layerConfigs[targetIds[0]].height! - resizeStep;
    } else {
        height = groupCoordinate.height! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, -1]}, true);
}

/**
 * 以顶部为基准向下缩小
 */
const doBaseUpDecreaseDown = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let height;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        height = layerConfigs[id].height! - resizeStep;
    } else {
        height = groupCoordinate.height! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetHeight: height, direction: [1, 1]}, true);
}

/**
 * 以右边为基准向左缩小
 */
const doBaseRightDecreaseLeft = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! - resizeStep;
    } else {
        width = groupCoordinate.width! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [-1, 1]}, true);
}

/**
 * 以左边为基准向右缩小
 */
const doBaseLeftDecreaseRight = () => {
    const {targetIds, interactionRef, groupCoordinate} = eventOperateStore;
    if (!targetIds || targetIds.length === 0) return;
    const scene = requireScene();
    const layerConfigs = scene?.readLayerConfigs();
    const resizeStep = scene?.readCanvasConfig()?.resizeStep ?? 1;
    if (!scene || !layerConfigs) return;
    let width;
    if (isSingleTransformLayer(targetIds, layerConfigs)) {
        const id = targetIds[0];
        width = layerConfigs[id].width! - resizeStep;
    } else {
        width = groupCoordinate.width! - resizeStep;
    }
    interactionRef?.request("resizable", {offsetWidth: width, direction: [1, 1]}, true);
}

/**
 * 组内左对齐
 */
const groupLeftAligned = selectionCommands.groupLeftAligned;

/**
 * 组内右对齐
 */
const groupRightAligned = selectionCommands.groupRightAligned;

/**
 * 组内上对齐
 */
const groupTopAligned = selectionCommands.groupTopAligned;

/**
 * 组内下对齐
 */
const groupBottomAligned = selectionCommands.groupBottomAligned;

/*************************运行时配置快捷键*************************/

/**
 * 切换辅助线展示
 */
const toggleSecondaryBorder = () => toggleAuxiliaryBorder();

const addLoopContainer = () => createLoopContainer();


const selectTool = () => viewportStore.setToolMode('select');
const handTool = () => viewportStore.setToolMode('hand');

    const actions = {
        selectAll,
        doClone,
        doPaste,
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
        doGrouping,
        doUnGrouping,
        removeFromGroup,
        cleanEmptyGroupings,
        doMoveUp,
        doMoveDown,
        doMoveLeft,
        doMoveRight,
        doBaseBottomEnlargeUp,
        doBaseUpEnlargeDown,
        doBaseRightEnlargeLeft,
        doBaseLeftEnlargeRight,
        doBaseBottomDecreaseUp,
        doBaseUpDecreaseDown,
        doBaseRightDecreaseLeft,
        doBaseLeftDecreaseRight,
        groupLeftAligned,
        groupRightAligned,
        groupTopAligned,
        groupBottomAligned,
        toggleSecondaryBorder,
        createLoopContainer: addLoopContainer,
        selectTool,
        handTool,
    };
    return new Proxy(actions, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => isActive() ? value.apply(receiver, args) : undefined;
        },
    });
}
