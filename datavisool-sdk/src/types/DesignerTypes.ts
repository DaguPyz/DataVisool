/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ICanvasManager} from "./CanvasTypes.ts";
import {IThemeItem} from "./ThemeTypes.ts";
import {ILayerManager} from "./LayerTypes.ts";
import {IBluePrintManager} from "./BluePrintTypes.ts";
import {IGlobalFilterManger} from "./FilterTypes.ts";
import {IGlobalVariableManager} from "./GlobalVariableTypes.ts";

/**
 * 设计器模式
 */
export enum DesignerMode {
    //编辑模式
    EDIT = '0',
    //展示模式
    PREVIEW = '1',
    //发布
    RELEASE = '2',
    //演示模式
    PURE_SHOW = '3',
}

/**
 * 项目状态
 */
export enum ProjectState {
    //草稿
    DRAFT = '0',
    //发布
    PUBLISH = '1',
    //封存
    SEALED = '2'
}

/**
 * 项目配置
 */
export interface IProjectInfoManager {
    //项目id
    id?: string;
    //项目名称
    name?: string;
    //项目描述
    des?: string;
    //项目状态
    state?: ProjectState;
    //创建时间
    createTime?: string;
    //更新时间
    updateTime?: string;
    //项目封面
    cover?: string;
    //项目数据json
    dataJson?: string;
}

export enum DesignerScene {
    /**
     * 默认场景（默认编辑主项目）
     */
    DEFAULT = 'DEFAULT',
    /**
     * 编辑循环容器
     */
    LOOP_CONTAINER = 'LOOP_CONTAINER',
    /**
     * 编辑子项目
     */
    SUB_PROJECT = 'SUB_PROJECT',
}

export interface IDesignerManager {
    //项目id
    id?: string;
    //项目名称
    name?: string;
    //场景
    scene?: DesignerScene;
    //画布设置
    canvasManager?: ICanvasManager;
    //项目设置
    projectManager?: IProjectInfoManager;
    //全局主题
    themeManager?: Array<IThemeItem>;
    //图层管理
    layerManager?: ILayerManager;
    //蓝图管理
    bluePrintManager?: IBluePrintManager[] | IBluePrintManager;
    //全局滤镜管理
    globalFilterManger?: IGlobalFilterManger;
    //全局变量管理
    globalVariableManager?: IGlobalVariableManager;
}

export interface IProject {
    id?: string;
    name?: string;
    data?: IDesignerManager;
}

export interface IProjectMeta {
    id: string;
    name: string;
    pid: string | null;
    data: IDesignerManager;
}

/**
 * 分页数据
 */
export interface IPage<T = unknown> {
    records: T[];
    total: number;
    size: number;
    current: number;
}

export interface IPageParam {
    current: number;
    size: number;
    searchValue?: string;
}





