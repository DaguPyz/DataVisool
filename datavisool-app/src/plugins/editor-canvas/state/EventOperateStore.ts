/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, computed, makeObservable, observable} from "mobx";
import {ObjectUtil} from "@datavisool/sdk";
import {GroupCoordinateType} from "@datavisool/sdk/types";
import LayerUtil from "@/plugins/editor-canvas/layers/LayerUtil.ts";
import {
    isEffectivelyLocked,
    normalizeSelectionIds,
    resolveTransformLeafIds,
} from "@/plugins/editor-canvas/selection/SelectionPolicy.ts";
import {calculateLayerIdsBounds} from "@/plugins/editor-canvas/selection/SelectionGeometry.ts";
import type {EditorLayerUiEvent, EditorSelectionInteraction, EditorSelectionSource} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {EditorInspectorChangeDetail} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type HistoryOperator from '../history/HistoryOperator.ts';
import type {CanvasContextMenuStore} from '@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts';
import type {EditorSelection, EditorSelectionChange} from '@datavisool/sdk/plugin/contracts/editorCanvas';
import type {LegacyCanvasManagerFacade} from '../history/LegacyCanvasModelAdapter.ts';
import type {DesignerEditingScene} from '@datavisool/sdk/plugin/contracts/designerRuntime';

export type DesignerInteractionRequestAble = "draggable" | "resizable";

export type SelectionSource = EditorSelectionSource;

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
interface EventOperateStoreOptions {
    readonly history: HistoryOperator;
    readonly contextMenu: CanvasContextMenuStore;
    isActive(): boolean;
    readScene(): DesignerEditingScene | undefined;
    readLegacyModel(): LegacyCanvasManagerFacade | undefined;
    readLayerConfigs(): Record<string, import('@datavisool/sdk/types').ILayerItem>;
    readSelection(): EditorSelection;
    writeSelection(selection: EditorSelectionChange): void;
    publishLayerUi(event: EditorLayerUiEvent): void;
    publishInspector(change: EditorInspectorChangeDetail): void;
}

export class EventOperateStore {
    constructor(private readonly options: EventOperateStoreOptions) {
        makeObservable(this, {
            targetIds: computed,
            directSelectedIds: computed,
            selectionSource: computed,
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
    get targetIds(): string[] {
        return [...this.options.readSelection().ids];
    }

    /** 旧调用点的只读兼容别名，不维护第二份选择状态。 */
    get directSelectedIds(): string[] {
        return this.targetIds;
    }

    get selectionSource(): SelectionSource {
        return this.options.readSelection().source;
    }

    /** A detached compatibility facade; it never exposes the runtime manager. */
    readLegacyModel(): LegacyCanvasManagerFacade | undefined {
        return this.options.isActive() ? this.options.readLegacyModel() : undefined;
    }

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

    private selectionColorTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    /**
     * 当前画布的缩放比例，作为响应式变量，再缩放画布时，实时调整控制点的大小
     */
    scale = 1;

    /**
     * 设计器画布缩放比例
     */
    ratio = 1;

    setDsContentRef = (ref: HTMLDivElement | null) => {
        if (this.options.isActive() || ref === null) this.dsContentRef = ref;
    };

    setRatio = (ratio: number) => { if (this.options.isActive()) this.ratio = ratio; };

    setScale = (scale: number) => { if (this.options.isActive()) this.scale = scale; };

    setAddRecordCompId = (id: string | null) => {
        if (this.options.isActive() || id === null) this.addRecordCompId = id;
    };

    setInteractionRef = (ref: DesignerInteractionRef | null) => {
        if (this.options.isActive() || ref === null) this.interactionRef = ref;
    };

    private clearTimers() {
        if (this.selectionColorTimer !== undefined) {
            clearTimeout(this.selectionColorTimer);
            this.selectionColorTimer = undefined;
        }
        for (const timer of this.pendingTimers) clearTimeout(timer);
        this.pendingTimers.clear();
    }

    pause = () => this.clearTimers();

    reset = (publishSelection = true, preserveInteractionRefs = false) => {
        const interactionRef = preserveInteractionRefs ? this.interactionRef : null;
        const dsContentRef = preserveInteractionRefs ? this.dsContentRef : null;
        this.clearTimers();
        this.options.history.reset();
        if (publishSelection)
            this.options.writeSelection({ids: [], source: 'system', interaction: {kind: 'clear-inspector'}});
        this.scale = 1;
        this.ratio = 1;
        this.groupCoordinate = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        };
        this.addRecordCompId = null;
        this.interactionRef = interactionRef;
        this.dsContentRef = dsContentRef;
    }

    setTargetIds = (ids: readonly string[], source: SelectionSource = 'system', interaction?: EditorSelectionInteraction) => {
        if (!this.options.isActive()) return;
        const scene = this.captureScene();
        if (!scene) return;
        //存储之前一次的选中组件id，用于清空图层列表的上一次选中状态
        const layerConfigs = this.options.readLayerConfigs();
        const validIds = normalizeSelectionIds(ids, layerConfigs);
        this.options.writeSelection({ids: validIds, source, interaction});
        const _targets: HTMLElement[] = [];
        validIds.forEach(id => {
            const target = document.getElementById(id);
            target && _targets.push(target);
        });

        //设置选中的图层边框颜色
        if (this.selectionColorTimer !== undefined) clearTimeout(this.selectionColorTimer);
        this.selectionColorTimer = setTimeout(() => {
            this.selectionColorTimer = undefined;
            if (!this.isSceneCurrent(scene)) return;
            const locked = validIds.length > 0 && validIds.every(id => isEffectivelyLocked(id, layerConfigs));
            LayerUtil.setSelectBoxColor(validIds, locked)
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

    emitLayerUiEvent = (event: EditorLayerUiEvent) => {
        if (this.options.isActive()) this.options.publishLayerUi(event);
    }

    emitInspectorChange = (change: EditorInspectorChangeDetail) => {
        if (this.options.isActive()) this.options.publishInspector(change);
    }

    isActive = () => this.options.isActive();

    captureScene = () => {
        const scene = this.options.readScene();
        return scene && scene.isActive() && this.options.isActive() ? scene : undefined;
    };

    isSceneCurrent = (scene: DesignerEditingScene | undefined) => Boolean(
        scene && this.options.isActive() && scene.isActive() && this.options.readScene() === scene,
    );

    schedule = (callback: () => void, delay = 0) => {
        if (!this.options.isActive()) return;
        const scene = this.captureScene();
        if (!scene) return;
        let timer: ReturnType<typeof setTimeout>;
        timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            if (this.isSceneCurrent(scene)) callback();
        }, delay);
        this.pendingTimers.add(timer);
    }

    setGroupCoordinate = (coordinate: GroupCoordinateType) => {
        if (!this.options.isActive()) return;
        this.groupCoordinate = ObjectUtil.merge(this.groupCoordinate, coordinate);
    }

    /**
     * 让鼠标重新聚焦到设计器画布上
     */
    focusDesignerCanvas = () => {
        if (!this.options.isActive()) return;
        const enforcementCap = document.querySelector('.datavisool-ruler-content');
        //删除组件后，重新聚焦鼠标指针到容器上，避免鼠标失去焦点导致其他快捷键失效。
        this.options.contextMenu.setPointerTarget(enforcementCap!);
    }

}
