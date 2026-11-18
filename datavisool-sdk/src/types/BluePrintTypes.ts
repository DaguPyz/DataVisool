/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export interface IBluePrintManager {
    //当前页面的id
    pageId?: string;
    //当前页面的名称
    pageName?: string;
    //蓝图节点布局
    bpNodeLayoutMap?: Record<string, BPNodeLayoutType>;
    //蓝图节点配置
    bpNodeConfigMap?: Record<string, any>;
    //蓝图线条
    bpLines?: Record<string, IBPLine>;
    //蓝图锚点之间的连线关系映射
    bpAPMap?: Record<string, string[]>;
    //蓝图锚点与线条之间的关系映射
    bpAPLineMap?: Record<string, string[]>;
}


export interface IBPLine {
    id?: string;
    color?: string;
    lineWidth?: number;
    startPoint?: IPoint;
    endPoint?: IPoint;
    firstCP?: IPoint;
    secondCP?: IPoint;
    //起始锚点id
    startAnchorId?: string;
    //结束锚点id
    endAnchorId?: string;
}

export type IPoint = { x: number; y: number; }

export interface BPNodeLayoutType {
    id?: string;
    type?: string;
    position?: IPoint;
}


export interface NodeInfoType {
    id?: string;
    name?: string;
    type?: string;
    /**
     * 是否启用该节点。
     * 默认启用，只有显式传 false 才视为关闭。
     */
    enabled?: boolean;
    input?: AnchorPointInfoType[];
    output?: AnchorPointInfoType[];
}

/**
 * 锚点信息
 */
export interface AnchorPointInfoType {
    id?: string;
    name?: string;
    type?: AnchorPointType;
    used?: boolean;
}

/**
 * 锚点类型
 */
export enum AnchorPointType {
    INPUT,
    OUTPUT
}

/**
 * 蓝图事件信息
 */
export interface EventInfo {
    id?: string;
    name?: string;
}
