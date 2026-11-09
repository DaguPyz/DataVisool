/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable} from "mobx";
import {ObjectUtil} from "@datavisool/sdk";
import {GroupCoordinateType} from "@datavisool/sdk/types";
import contextMenuStore from "@/designer/event/ContextMenuStore.ts";
import LayerUtil from "@/designer/left/layer-list/util/LayerUtil.ts";
import rightStore from "@/designer/right/RightStore.ts";
import {
    isEffectivelyLocked,
    normalizeSelectionIds,
    resolveTransformLeafIds,
} from "@/designer/operate-provider/selection/SelectionPolicy.ts";
import {calculateLayerIdsBounds} from "@/designer/operate-provider/selection/SelectionGeometry.ts";
import {setHistorySelectionProvider} from "@/designer/operate-provider/selection/SelectionHistoryContext.ts";

export type DesignerInteractionRequestAble = "draggable" | "resizable";

export type SelectionSource = "canvas" | "layer-list" | "search" | "context-menu" | "system";

export interface DesignerInteractionRequestParams {
    x?: number;
    y?: number;
    offsetWidth?: number;
    offsetHeight?: number;
    direction?: number[];
}

export interface DesignerInteractionRef {
    request: (ableName: DesignerInteractionRequestAble, params: DesignerInteractionRequestParams, isInstant?: boolean) => void;
    isInteractionElement?: (target: Element) => boolean;
    dragStart?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
    refreshOverlay?: () => void;
    refreshLayerGeometry?: (ids?: string[]) => void;
}

/**
 * 设计器画布及元素操作控制store，用于协调缩放、拖拽、选择，右键操作菜单操作之间的数据传递
 * Designer canvas and element operation control store, used to coordinate data transmission between zoom, drag, selection, right-click operation menu operation
 */
class EventOperateStore {
    constructor() {
        makeObservable(this, {
            targetIds: observable,
            directSelectedIds: computed,
            selectionSource: observable,
            scale: observable,
            setScale: action,
            setTargetIds: action,
            reset: action,
        })
    }

    /**
     * 拖拽框架实例引用
     * Drag and drop framework instance reference
     */
    interactionRef: DesignerInteractionRef | null = null;
    /**
     * 设计器画布拖拽缩放内容dom实例引用（用于同步标尺的缩放）
     */
    dsContentRef: HTMLDivElement | null = null;

    /** 用户直接选择的规范图层 ID；分组选择不会展开子元素。 */
    targetIds: string[] = [];

    /** 旧调用点的只读兼容别名，不维护第二份选择状态。 */
    get directSelectedIds(): string[] {
        return this.targetIds;
    }

    selectionSource: SelectionSource = "system";

    /**
     * 组合框选时的坐标信息
     */
    groupCoordinate: GroupCoordinateType = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };

    /**
     * 用于记录当前手动（双击或拖拽）新添加的组件id,实际渲染时根据该id读取组件数据并记录操作日志。非手动添加的组件不会记录操作日志
     */
    addRecordCompId: string | null = null;

    /**
     * 当前画布的缩放比例，作为响应式变量，再缩放画布时，实时调整控制点的大小
     */
    scale = 1;

    /**
     * 设计器画布缩放比例
     */
    ratio = 1;

    setDsContentRef = (ref: HTMLDivElement | null) => this.dsContentRef = ref;

    setRatio = (ratio: number) => this.ratio = ratio;

    setScale = (scale: number) => this.scale = scale;

    setAddRecordCompId = (id: string | null) => this.addRecordCompId = id;

    setInteractionRef = (ref: DesignerInteractionRef | null) => this.interactionRef = ref;

    reset = () => {
        this.targetIds = [];
        this.selectionSource = "system";
        this.scale = 1;
        this.ratio = 1;
        this.groupCoordinate = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        };
        this.addRecordCompId = null;
        this.interactionRef = null;
        this.dsContentRef = null;
        rightStore.activeConfig(null, "");
    }

    setTargetIds = (ids: string[], source: SelectionSource = "system") => {
        //存储之前一次的选中组件id，用于清空图层列表的上一次选中状态
        const oldTargetIds = [...this.directSelectedIds];
        const layerConfigs = window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs ?? {};
        const validIds = normalizeSelectionIds(ids, layerConfigs);
        this.targetIds = validIds;
        this.selectionSource = source;
        const _targets: HTMLElement[] = [];
        validIds.forEach(id => {
            const target = document.getElementById(id);
            target && _targets.push(target);
        });

        //更新图层列表状态
        LayerUtil.reRenderLayerList(oldTargetIds, this.directSelectedIds);
        //设置选中的图层边框颜色
        const timer = setTimeout(() => {
            const locked = validIds.length > 0 && validIds.every(id => isEffectivelyLocked(id, layerConfigs));
            LayerUtil.setSelectBoxColor(validIds, locked)
            clearTimeout(timer);
        }, 0)
        const transformIds = resolveTransformLeafIds(validIds, layerConfigs);
        const coordinate = calculateLayerIdsBounds(transformIds, layerConfigs);
        if (coordinate) {
            this.setGroupCoordinate(coordinate);
        } else {
            this.groupCoordinate = {
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity
            };
        }
    }

    setGroupCoordinate = (coordinate: GroupCoordinateType) => {
        this.groupCoordinate = ObjectUtil.merge(this.groupCoordinate, coordinate);
    }

    /**
     * 让鼠标重新聚焦到设计器画布上
     */
    focusDesignerCanvas = () => {
        const enforcementCap = document.querySelector('.datavisool-ruler-content');
        //删除组件后，重新聚焦鼠标指针到容器上，避免鼠标失去焦点导致其他快捷键失效。
        contextMenuStore.setPointerTarget(enforcementCap!);
    }

}

const eventOperateStore = new EventOperateStore();
setHistorySelectionProvider(() => eventOperateStore.targetIds);
export default eventOperateStore;
