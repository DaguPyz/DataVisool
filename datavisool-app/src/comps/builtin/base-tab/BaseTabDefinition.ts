/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import { BaseTabController } from "./BaseTabController.ts";
import { TabComponentProps } from "./BaseTabComponent.tsx";
// 假设这里有一个缩略图，实际项目请替换
import TabImg from './tab.webp';
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import { ClazzTemplate } from "@datavisool/sdk/types";
import { EventInfo } from "@datavisool/sdk/types";

// 懒加载配置组件
const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const DataConfig = React.lazy(() => import("../../common-component/data-config/DataConfig.tsx"));
const BaseTabStyleConfig = React.lazy(() => import("./BaseTabStyleConfig.tsx").then((module) => ({ default: module.BaseTabStyleConfig })));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));

export default class BaseTabDefinition extends AbstractDesignerDefinition<BaseTabController, TabComponentProps> {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "按钮选项卡",
            compKey: "BaseTab",
            categorize: "web",
            width: 300,
            height: 48,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseTab",
            compName: "按钮选项卡",
            summary: "按钮选项卡，用于切换内容分区和组织多个展示区域。",
            featureTags: ["按钮选项卡", "选项卡", "内容切换", "分区展示", "页面控件"],
            applicableScenes: ["内容分区", "模块切换", "页面导航", "多区域展示"],
            capabilities: ["支持分区切换", "支持状态切换", "支持内容编排"],
            constraints: [],
            aliases: ["Tabs", "Tab"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    // 基础字体
    fontFamily?: string;

    // 容器样式
    containerBgColor?: string;
    containerRadius?: number;
    containerBorderWidth?: number;
    containerBorderColor?: string;
    containerPadding?: number; // 内边距
    itemGap?: number; // 间距
    containerShadow?: string;

    // 布局配置
    layout?: 'horizontal' | 'vertical';
    justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
    flexWrap?: boolean;

    // 选项配置
    mode?: 'single' | 'multiple'; // 单选或多选

    // 未选中项样式 (默认)
    itemBgColor?: string;
    itemColor?: string;
    itemRadius?: number;
    itemBorderWidth?: number;
    itemBorderColor?: string;
    itemFontSize?: number;
    itemFontWeight?: number;
    itemHeight?: number;
    itemMinWidth?: number;
    itemPadding?: string; // e.g. "4px 12px"
    itemShadow?: string;

    // 选中项样式
    activeBgColor?: string;
    activeColor?: string;
    activeBorderColor?: string;
    activeFontWeight?: number;
    activeShadow?: string;

    // 悬停样式
    itemHoverBgColor?: string;
    itemHoverColor?: string;
    itemHoverBorderColor?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return TabImg;
    }

    getController(): ClazzTemplate<BaseTabController> | null {
        return BaseTabController;
    }

    getInitConfig(): TabComponentProps {
        return {
            base: {
                id: "",
                name: '按钮选项卡',
                type: 'BaseTab',
            },
            style: {
                fontFamily: '',

                // 容器默认
                containerBgColor: 'transparent',
                containerRadius: 8,
                containerBorderWidth: 0,
                containerBorderColor: 'transparent',
                containerPadding: 4,
                itemGap: 8,
                layout: 'horizontal',
                justifyContent: 'flex-start',
                flexWrap: false,

                // 模式与数据
                mode: 'single',

                // 默认项
                itemBgColor: '#2C2C3E',
                itemColor: '#A0A0B2',
                itemRadius: 4,
                itemBorderWidth: 1,
                itemBorderColor: '#3A3A4E', // 微弱边框
                itemFontSize: 14,
                itemFontWeight: 400,
                itemHeight: 32,
                itemMinWidth: 80,
                itemPadding: '4px 12px',

                // 选中项
                activeBgColor: '#4FB8FF',
                activeColor: '#FFFFFF',
                activeBorderColor: 'transparent',
                activeFontWeight: 600,
                activeShadow: '0 2px 8px rgba(79, 184, 255, 0.3)',

                // 悬停
                itemHoverBgColor: '#343447',
                itemHoverColor: '#FFFFFF',
                itemHoverBorderColor: '#4FB8FF',
            },
            data: {
                sourceType: 'static',
                value: [
                    {label: '选项一', value: '1'},
                    {label: '选项二', value: '2'},
                    {label: '选项三', value: '3'}
                ]
            }
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseTabStyleConfig,
            animation: AnimationConfig,
            theme: ThemeConfig,
            data: DataConfig,
            filter: FilterConfig
        };
    }

    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "change",
                name: "选中改变时",
            },
            {
                id: "valueChange",
                name: "值变化时",
            },
            {
                id: "click",
                name: "点击选项时",
            }
        ]);
    }
}