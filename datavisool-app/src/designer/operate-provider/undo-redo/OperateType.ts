/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 操作类型枚举
 */
import {ILayerItem, ILayerTransformItem} from "@datavisool/sdk/types";
import {BPNodeLayoutType, IBluePrintManager, IBPLine} from "@datavisool/sdk/types";

export enum OperateType {
    /**
     * 拖拽
     */
    DRAG,
    /**
     * 缩放
     */
    RESIZE,
    /**
     * 添加组件
     */
    ADD,
    /**
     * 删除组件
     */
    DEL,
    /**
     * 更新组件样式
     */
    UPD_STYLE,
    /**
     * 隐藏组件
     */
    HIDE,
    /**
     * 组件排序
     */
    ORDER,
    /**
     * 组件锁定
     */
    LOCK,
    /**
     * 更新图层分组
     */
    UPDATE_LAYER,
    /**
     * 旋转
     */
    ROTATE,
    BP_ADD_NODE,
    BP_DEL_NODE,
    BP_ADD_LINE,
    BP_DEL_LINE,
    BP_MOVE_NODE,
    BP_ADD_PAGE,
    BP_DEL_PAGE,
    /**
     * 变形
     */
    TRANSFORM,
}

/**
 * 记录操作对应的数据类型
 */
type RecordDataType = IDragOperateData
    | IResizeOperateData
    | IUpdStyleOperateData
    | IAddOperateData[]
    | IDelOperateData[]
    | IHideOperateData[]
    | IOrderOperateData[]
    | ILockOperateData[]
    | IUpdLayerOperateData[]
    | IUpdLayerOperateData
    | IRotateOperateData[]
    | ITransformOperateData[]
    | IGraphicalTransform[]
    | IBPAddNodeOperateData
    | IBPDelNodeOperateData
    | IBPAddLineOperateData
    | IBPDelLineOperateData
    | IBPMoveNodeOperateData
    | IBPAddPageOperateData
    | IBPDelPageOperateData
    ;

/**
 * 使用HistoriesRecordType，因为一次操作可能会涉及到多个不同维度的更新。比如：删除图层时，如果存在分组，还需要更新分组的子图层id
 * 此场景同时要删除图层和更新图层。视为两个动作
 */
export interface IHistoryRecords {
    actions: IHistoryRecord[];
}

/**
 * 历史记录类型
 */
export interface IHistoryRecord {
    type: OperateType;
    prev: RecordDataType | null;
    next: RecordDataType | null;
    selectionIds?: string[];
}


/**
 * 拖拽数据类型
 */
export interface IDragOperateData {
    ids: string[];
    x: number;
    y: number;
}

/**
 * 拖拽数据类型
 */
export interface IRotateOperateData {
    id: string;
    rotate: number;
    x: number;
    y: number;
}

export interface ITransformOperateData {
    id: string;
    transform: ILayerTransformItem;
}

export interface IGraphicalTransform {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotate: number;
}

export interface IHideOperateData {
    id: string;
    hide: boolean;
}

export interface ILockOperateData {
    id: string;
    lock: boolean;
}

export interface IOrderOperateData {
    id: string;
    order: number;
}


/**
 * 缩放数据类型
 */
export interface IResizeOperateData {
    ids: string[];
    width: number;
    height: number;
    direction: [number, number];
}

/**
 * 添加数据类型
 */
export interface IAddOperateData {
    id?: string;
    layerConfig?: ILayerItem;
    elemConfig?: Record<string, any>;
    layerHeader?: string;
    layerTail?: string;
}

/**
 * 删除数据类型
 */
export interface IDelOperateData {
    id?: string;
    layerConfig?: ILayerItem;
    elemConfig?: Record<string, any>;
    layerHeader?: string;
    layerTail?: string;
}

/**
 * 样式数据类型
 */
export interface IUpdStyleOperateData {
    id: string;
    data: Record<string, any>;
    replaceKeys?: string[];
    status?: IUpdStyleStatusOperateData;
}

export interface IUpdStyleStatusOperateData {
    id: string;
    data: Record<string, any>;
    replaceKeys?: string[];
    replaceAll?: boolean;
}

export interface IUpdLayerOperateData extends ILayerItem {
    layerHeader?: string;
    layerTail?: string;
}

export interface IBPAddNodeOperateData {
    pageId: string;
    layout: BPNodeLayoutType;
}

export interface IBPNodeSnapshot {
    layout: BPNodeLayoutType;
    config: any | null;
}

export interface IBPDelNodeOperateData {
    pageId: string;
    nodes: IBPNodeSnapshot[];
    lines: IBPLine[];
}

export interface IBPAddLineOperateData {
    pageId: string;
    line: IBPLine;
}

export interface IBPDelLineOperateData {
    pageId: string;
    lines: IBPLine[];
}

export interface IBPMoveNodeOperateData {
    pageId: string;
    nodes: Array<{ id: string; x: number; y: number }>;
}

export interface IBPAddPageOperateData {
    index: number;
    page: IBluePrintManager;
    activePageId: string | null;
}

export interface IBPDelPageOperateData {
    index: number;
    page: IBluePrintManager;
    activePageId: string | null;
}
