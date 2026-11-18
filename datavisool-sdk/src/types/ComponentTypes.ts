/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {DataConfigType} from "./DataSourceTypes.ts";
import {IFilterConfigType} from "./FilterTypes.ts";


/**
 * 组件基础信息
 */
export interface BaseInfoType {
    /**
     * 组件显示名称
     */
    compName: string;
    /**
     * 组件标识
     */
    compKey: string;
    /**
     * 主分类
     */
    categorize?: string;
    /**
     * 子分类
     */
    subCategorize?: string;
    /**
     * 版本
     */
    version?: string;
    /**
     * 初始宽度
     */
    width?: number;
    /**
     * 初始高度
     */
    height?: number;
    /**
     * 来源 标准组件 | 服务器组件
     */
    source?: string;
}

/**
 * 组件特征信息，用于 AI 提示词构建和组件语义理解。
 */
export interface ComponentAiFeatureInfo {
    /**
     * 组件唯一类型 key，与 BaseInfoType.compKey 保持一致
     */
    compKey: string;
    /**
     * 组件名称
     */
    compName: string;
    /**
     * 一句话说明这个组件能做什么
     */
    summary: string;
    /**
     * 特征标签，适合做语义检索或提示词压缩
     */
    featureTags: string[];
    /**
     * 适用场景
     */
    applicableScenes: string[];
    /**
     * 能力点描述
     */
    capabilities?: string[];
    /**
     * 使用限制或前置条件
     */
    constraints?: string[];
    /**
     * 别名或同义词
     */
    aliases?: string[];
    /**
     * 主分类
     */
    categorize?: string;
    /**
     * 子分类
     */
    subCategorize?: string;
    /**
     * 来源 标准组件 | 服务器组件
     */
    source?: string;
    /**
     * 版本
     */
    version?: string;
}

/**
 * DataVisool组件的公共基础配置类型
 */
export interface ComponentBaseProps<C = any> {
    base?: ComponentInfoType;
    style?: Record<string, any>;
    data?: DataConfigType;
    filter?: IFilterConfigType;
    status?: C;
}

export interface ComponentInfoType {
    id: string;
    name: string;
    type: string;
}

/**
 * 组件controller更新菜蔬
 */
export interface UpdateOptions {
    reRender: boolean;
}
