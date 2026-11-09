/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import BaseSelectImg from './base-select.webp';
import {BaseSelectController} from "./BaseSelectController.ts";
import {BaseSelectComponentProps} from "./BaseSelectComponent.tsx";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const DataConfig = React.lazy(() => import("../../common-component/data-config/DataConfig.tsx"));
const BaseSelectStyleConfig = lazy(() => import("./BaseSelectConfig.tsx").then((module) => ({default: module.BaseSelectStyleConfig})));

export default class BaseSelectDefinition extends AbstractDesignerDefinition<BaseSelectController, BaseSelectComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "下拉框",
            compKey: "BaseSelect",
            categorize: "web",
            width: 320,
            height: 26,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseSelect",
            compName: "下拉框",
            summary: "下拉框，用于在多个预设选项中完成单选或联动选择。",
            featureTags: ["下拉框", "选项选择", "表单控件", "页面控件"],
            applicableScenes: ["表单录入", "条件筛选", "分类选择", "联动配置"],
            capabilities: ["支持单选选项", "支持选项联动", "支持表单绑定"],
            constraints: [],
            aliases: ["Select", "Dropdown"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `
export interface ComponentStyle {
  /**
   * 字体族。控制选择器本体、下拉选项以及弹层中文本所使用的字体名称。
   * 建议填写全局统一字体栈，避免选择器文字与页面其他输入控件风格不一致。
   */
  fontFamily: string;
  /**
   * 字号。控制选择器当前选中值在输入框区域里的显示大小。
   * 这个值会直接影响控件主体文字的视觉层级，不建议与正文标题字号混用。
   */
  fontSize: number;
  /**
   * 选择器本体背景色。
   * 指的是下拉未展开时，输入框容器的底色，不是下拉面板的底色。
   * 用于和页面卡片/面板做统一融合时，优先调整这个字段。
   */
  selectorBg: string;
  /**
   * 选择器本体文字颜色。
   * 作用于当前值文字、占位文字以及输入区域的可读性。
   * 与 selectorBg 需要保持足够对比度，否则会影响可读性。
   */
  colorText: string;
  /**
   * 选择器外框圆角。
   * 影响输入框主体的圆角曲率，与页面其他输入控件保持统一时应优先对齐这个值。
   */
  borderRadius: number;
  /**
   * 选择器边框宽度。
   * 用于控制主体外框线条粗细，通常与设计系统中的输入框边框宽度保持一致。
   */
  lineWidth: number;
  /**
   * 选择器边框颜色。
   * 默认状态下的边框颜色，决定控件在未悬浮、未聚焦时的边界存在感。
   */
  colorBorder: string;
  /**
   * 选择器悬浮边框色。
   * 鼠标悬停到选择器本体时出现的边框颜色，用来提示可交互状态。
   */
  colorPrimaryHover: string;
  /**
   * 聚焦轮廓色。
   * 当下拉框获得焦点或展开时，外部高亮和光晕通常由该字段决定。
   * 如果页面强调“输入态”一致性，这个值应尽量和同类输入控件同步。
   */
  controlOutline: string;
  /**
   * 下拉面板圆角。
   * 作用于弹出层本体，而不是选择器输入框。
   * 当你希望下拉面板显得更“浮起”时，这个值通常会比 borderRadius 更大或保持一致。
   */
  borderRadiusLG: number;
  /**
   * 下拉选项字号。
   * 控制弹层中每一行 option 的文本大小，影响密度和阅读舒适度。
   */
  optionFontSize: number;
  /**
   * 单个下拉选项的高度。
   * 控制 option 的点击热区和列表密度，过小会影响可用性，过大会导致列表过长。
   */
  optionHeight: number;
  /**
   * 下拉选中项背景色。
   * 当某个选项处于选中状态时显示的背景色，用于帮助用户快速定位当前值。
   */
  optionSelectedBg: string;
  /**
   * 下拉选中项文字颜色。
   * 选中状态下选项文字的颜色，需要和 optionSelectedBg 形成清晰对比。
   */
  optionSelectedColor: string;
  /**
   * 下拉选项悬浮背景色。
   * 鼠标移入某个 option 时显示的背景色，用于提示即将点击的目标项。
   */
  optionActiveBg: string;
  /**
   * 下拉弹层背景色。
   * 作用于下拉列表弹出面板整体，不影响选择器本体。
   * 如果下拉面板需要和页面暗色面板统一，这个字段是最关键的。
   */
  colorBgElevated: string;
}
`.trim();
    }
    getChartImg(): string | null {
        return BaseSelectImg;
    }

    getController(): ClazzTemplate<BaseSelectController> | null {
        return BaseSelectController;
    }

    getInitConfig(): BaseSelectComponentProps {
        return {
            base: {
                id: "",
                name: '下拉框',
                type: 'BaseSelect',
            },
            style: {
                fontSize: 16, // 改为规范的小标题尺寸（16-18px），原18px略大
                fontFamily: '"Poppins", "Roboto", "Helvetica Neue", Arial, sans-serif', // 使用规范字体家族
                selectorBg: '#27293D', // 改为卡片背景色
                colorText: '#FFFFFF', // 主要文本使用纯白
                lineWidth: 1,
                borderRadius: 4, // 标准圆角（从3改为4）
                colorBorder: 'rgba(255, 255, 255, 0.2)', // 使用浅色半透明边框
                colorPrimaryHover: '#FD5D93', // 使用主色调作为悬停色
                controlOutline: 'rgba(253, 93, 147, 0.3)', // 使用主色调半透明作为焦点轮廓
                borderRadiusLG: 4, // 保持一致的圆角
                optionFontSize: 14, // 选项字体使用正文尺寸
                optionHeight: 32, // 增加选项高度（从20改为32）提高可操作性
                optionSelectedBg: 'rgba(253, 93, 147, 0.15)', // 选中背景使用主色调透明版
                optionSelectedColor: '#FFFFFF', // 选中文字使用纯白
                optionActiveBg: 'rgba(29, 140, 248, 0.2)', // 活动状态使用信息色透明版
                colorBgElevated: '#1E1E2F', // 弹出层使用应用背景色
            },
            filter: {
                enable: false,
                blur: 0,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 0
            },
            data: {
                sourceType: 'static',
                value: [
                    {value: '0', label: 'Option0'},
                    {value: '1', label: 'Option1'},
                ]
            }
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseSelectStyleConfig,
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
                id: "click",
                name: "点击时",
            },
            {
                id: 'selectedChange',
                name: '选项改变时',
            }
        ]);
    }
}