/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from 'react';
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {DateTimePickerController} from "./DateTimePickerController.ts";
import {DateTimePickerComponentProps} from "./DateTimePickerComponent.tsx";
import DateTimePickerImg from './datetime-picker.webp';
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";

// 懒加载配置组件
const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const DataConfig = React.lazy(() => import("../../common-component/data-config/DataConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const DateTimePickerStyleConfig = React.lazy(() => import("./DateTimePickerConfig.tsx").then((module) => ({default: module.DateTimePickerStyleConfig})));

export default class DateTimePickerDefinition extends AbstractDesignerDefinition<DateTimePickerController, DateTimePickerComponentProps> {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "日期时间选择器",
            compKey: "DateTimePicker",
            categorize: "web",
            width: 240,
            height: 32,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "DateTimePicker",
            compName: "日期时间选择器",
            summary: "日期时间选择器，用于选择和输入日期时间信息。",
            featureTags: ["日期时间选择器", "时间输入", "表单控件", "页面控件"],
            applicableScenes: ["表单录入", "时间筛选", "日期选择", "时间范围设置"],
            capabilities: ["支持日期/时间选择", "支持表单绑定", "支持范围选择"],
            constraints: [],
            aliases: ["Date Time Picker", "Datetime Picker"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    // 日期时间选择器特有样式
    pickerType?: 'date' | 'week' | 'month' | 'quarter' | 'year' | 'datetime' | 'range';
    placeholder?: string;
    showTime?: boolean;
    format?: string;
    allowClear?: boolean;
    disabled?: boolean;
    showNow?: boolean;

    token?: {
        lineWidth: number;
        fontSize: number;
        colorTextHeading: string;
        colorPrimary: string;
        colorSplit: string;
        colorText: string;
        colorBorder: string;
        colorBgContainerDisabled: string;          // 禁用状态的容器背景
        colorTextPlaceholder: string;              // 占位符文字色
        colorIcon: string;                         // 图标颜色
        colorIconHover: string;                    // 图标悬停颜色
        borderRadius: number;                              // 卡片圆角
        lineType: string;
        fontFamily: string;                         // 无衬线字体
        fontWeightStrong: number;
        padding: number;                                  // 次轴间距
        colorBgElevated: string;
    },
    components?: {
        colorBgContainer: string;                     // container 背景
        colorBorder: string;
        colorText: string;
        colorPrimary: string;                         // 主色
        colorTextHeading: string;                     // 和 colorText 一致
        colorSplit: string;
        hoverBorderColor: string;                     // 输入 hover
        activeBorderColor: string;                    // 输入 active
        hoverBg: string;                              // 输入 hover 背景（亮度提升）
        activeBg: string;                             // 输入 active 背景
        activeShadow: string;  // active 阴影
        cellActiveWithRangeBg: string;
        cellHoverBg: string;
        cellHoverWithRangeBg: string;
        cellHeight: number;
        cellWidth: number;
        withoutTimeCellHeight: number;
        textHeight: number;
        timeCellHeight: number;
        timeColumnHeight: number;
        timeColumnWidth: number;
        inputFontSize: number;
        paddingBlock: number;
        paddingInline: number;
    },
}`.trim();
    }

    getChartImg(): string | null {
        return DateTimePickerImg;
    }

    getController(): ClazzTemplate<DateTimePickerController> | null {
        return DateTimePickerController;
    }

    getInitConfig(): DateTimePickerComponentProps {
        return {
            base: {
                id: "",
                name: '日期时间选择器',
                type: 'DateTimePicker',
            },
            style: {
                // 选择器特有配置
                pickerType: 'date',
                placeholder: '请选择日期',
                showTime: false,
                format: 'YYYY-MM-DD',
                allowClear: true,
                disabled: false,
                showNow: true,

                token: {
                    lineWidth: 1,
                    fontSize: 14,
                    colorTextHeading: "#FFFFFF",           // 主要文字 - 白色
                    colorPrimary: "#4FB8FF",              // 主高亮色
                    colorSplit: "#3A3A4E",                // 分割线色
                    colorText: "#FFFFFF",                 // 主要文字色
                    colorBorder: "#3A3A4E",               // 边框色
                    colorBgContainerDisabled: "#2C2C3E",  // 禁用状态背景（容器色）
                    colorTextPlaceholder: "#A0A0B2",      // 占位符文字 - 次级文字色
                    colorIcon: "#A0A0B2",                 // 图标颜色 - 次级文字色
                    colorIconHover: "#FFFFFF",            // 图标悬停 - 主要文字色
                    borderRadius: 8,                      // 卡片圆角8px
                    lineType: "solid",                    // 实线边框
                    fontFamily: "", // 无衬线字体栈
                    fontWeightStrong: 600,                // Semibold字重
                    padding: 16,                          // 次轴间距16px
                    colorBgElevated: "#2C2C3E",           // 容器背景色
                },
                components: {
                    colorBgContainer: "#2C2C3E",          // container背景 - 容器色
                    colorBorder: "#3A3A4E",               // 边框色
                    colorText: "#FFFFFF",                 // 主要文字色
                    colorPrimary: "#4FB8FF",              // 主色 - 高亮蓝
                    colorTextHeading: "#FFFFFF",          // 标题色 - 与colorText一致
                    colorSplit: "#3A3A4E",                // 分割线色
                    hoverBorderColor: "#4FB8FF",          // 输入框悬停边框 - 主色
                    activeBorderColor: "#3CED92",         // 输入框激活边框 - 成功色
                    hoverBg: "#323247",                   // 输入框悬停背景（#2C2C3E亮度提升10%）
                    activeBg: "#282839",                  // 输入框激活背景（#2C2C3E深度10%）
                    activeShadow: "0 0 0 2px rgba(79, 184, 255, 0.2)", // 激活态阴影（主色20%透明度）
                    cellActiveWithRangeBg: "#4FB8FF",     // 范围选择激活背景 - 主色
                    cellHoverBg: "#323247",               // 单元格悬停背景（亮度提升）
                    cellHoverWithRangeBg: "#3CED92",      // 带范围单元格悬停 - 成功色
                    cellHeight: 15,                       // 标准单元格高度
                    cellWidth: 35,                        // 标准单元格宽度
                    withoutTimeCellHeight: 36,            // 无时间单元格高度
                    textHeight: 40,                       // 正文行高
                    timeCellHeight: 28,                   // 时间单元格高度
                    timeColumnHeight: 200,                // 时间列高度
                    timeColumnWidth: 120,                 // 时间列宽度
                    inputFontSize: 14,                    // 输入框字体大小
                    paddingBlock: 4,                      // 垂直内边距（对应按钮12px设计）
                    paddingInline: 11,                    // 水平内边距（对应按钮24px设计）
                }
            },
            data: {
                sourceType: 'static',
                value: new Date().toISOString().slice(0, 10)
            },
            filter: {
                enable: false,
                blur: 0,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 0
            }
        };
    }

    getMenuToConfigContentMap()
        :
        MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: DateTimePickerStyleConfig,
            animation: AnimationConfig,
            theme: ThemeConfig,
            filter: FilterConfig,
            data: DataConfig
        };
    }

    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "open",
                name: "打开时",
            },
            {
                id: "close",
                name: "关闭时",
            },
            {
                id: "change",
                name: "值改变时",
            },
            {
                id: "ok",
                name: "点击确认时",
            },
            {
                id: "valueChange",
                name: "值变化时",
            },
            {
                id: "confirm",
                name: "确认选择时",
            }
        ]);
    }
}