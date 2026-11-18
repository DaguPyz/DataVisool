/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export interface ILayerManager {
    //元素样式
    elemConfigs?: { [key: string]: Record<string, any> };
    //图层信息
    layerConfigs?: { [key: string]: ILayerItem };
    //图层头指针
    layerHeader?: string;
    //图层尾指针
    layerTail?: string;
}

/**
 * 图层内层内容变形参数。
 * 这组参数只作用于组件内容本身，不影响图层外层的拖拽、缩放和定位。
 */
export interface ILayerTransformItem {
    rotateZ?: number;
    rotateX?: number;
    rotateY?: number;
    skewX?: number;
    skewY?: number;
    perspective?: number;
    transformOrigin?: string;
}

/**
 * 画布内容更新模式。
 * replace: 全量替换当前画布
 * append: 增量追加到当前画布前端
 * patch: 仅更新画布中已存在图层的尺寸、位置和样式配置，不调整链表关系
 */
export type CanvasContentUpdateMode = "replace" | "append" | "patch";

/**
 * 单个画布组件的更新数据。
 * layer 只描述布局和层级信息，真正的组件 id 会在 updater 内部统一生成。
 * 如果需要在同一批次里表达 pid / prev / next 之类的引用关系，
 * layer.id 可以临时作为批次内引用键使用，最终写入画布的 id 仍由 updater 生成。
 * patch 模式下如果只想更新组件配置，可以只传 config，不传 layer。
 */
export interface ICanvasContentUpdatePayload {
    layer?: ILayerItem;
    config?: any;
}

/**
 * 画布批量更新结果。
 */
export interface ICanvasContentUpdateResult {
    //最终写入画布的图层 id 列表
    layerIds: string[];
    //输入引用键到最终写入画布的 id 的映射（replace / append 下为新生成 id，patch 下为现有 id）
    idMap: Record<string, string>;
    //replace 模式下被移除的旧图层 id 列表
    removedLayerIds: string[];
}

export interface ILayerItem {
    //唯一标识
    id?: string | undefined;
    //组件名称
    name?: string | undefined;
    //组件类型
    type?: string | undefined;
    //宽度
    width?: number;
    //高度
    height?: number;
    //坐标
    x?: number;
    //y坐标
    y?: number;
    //旋转角度
    rotate?: number;
    //内容变形参数
    transform?: ILayerTransformItem;
    //是否隐藏（仅用于编辑模式）
    hide?: boolean;
    //是否锁定（仅用于编辑模式）
    lock?: boolean;
    //顺序
    order?: number;
    //父图层id
    pid?: string;
    //子图层列表
    children?: ILayerItem[];
    //子图层头指针
    childHeader?: string;
    //子图层尾指针
    childTail?: string;
    //前指针
    prev?: string;
    //后指针
    next?: string;
}


/**
 * 多个组件下的包围盒坐标
 */
export interface GroupCoordinateType {
    /**
     * 最小X坐标
     */
    minX?: number;
    /**
     * 最小Y坐标
     */
    minY?: number;
    /**
     * 最大X坐标
     */
    maxX?: number;
    /**
     * 最大Y坐标
     */
    maxY?: number;
    /**
     * 组合框的宽度
     */
    width?: number;
    /**
     * 组合框的高度
     */
    height?: number;
}
