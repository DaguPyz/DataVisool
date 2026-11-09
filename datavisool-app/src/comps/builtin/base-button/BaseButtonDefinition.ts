/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import {MenuInfo} from "../../../designer/right/MenuType";
import BaseButtonImg from './base-button.webp';
import {BaseButtonController} from "./BaseButtonController.ts";
import {BaseButtonComponentProps} from "./BaseButtonComponent.tsx";
import React from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const BaseButtonStyleConfig = React.lazy(() => import("./BaseButtonConfig.tsx").then((module) => ({default: module.BaseButtonStyleConfig})));


export default class BaseButtonDefinition extends AbstractDesignerDefinition<BaseButtonController, BaseButtonComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "按钮",
            compKey: "BaseButton",
            categorize: "web",
            width: 140,
            height: 45,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseButton",
            compName: "按钮",
            summary: "按钮，用于触发操作、提交动作或绑定交互事件。",
            featureTags: ["按钮", "交互触发", "页面操作", "页面控件"],
            applicableScenes: ["表单提交", "页面操作", "弹窗触发", "流程入口"],
            capabilities: ["支持点击触发", "支持事件绑定", "支持操作入口"],
            constraints: [],
            aliases: ["Button"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    content: string;
    color: string;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    letterSpacing: number;
    backgroundColor: string;
    borderRadius: number;
    borderWidth: number;
    borderColor: string;
    borderStyle: string;
    speed: number;
    scannerColor: string;
    hoverShadow: string;
    hoverBackgroundColor: string;
}`.trim();
    }

    getChartImg(): string | null {
        return BaseButtonImg;
    }

    getController(): ClazzTemplate<BaseButtonController> | null {
        return BaseButtonController;
    }

    getInitConfig(): BaseButtonComponentProps {
        return {
            base: {
                id: "",
                name: '按钮',
                type: 'BaseButton',
            },
            style: {
                content: '按钮',
                color: '#FFFFFF', // 主要文本使用纯白
                fontSize: 16, // 保留原有大小，适合按钮文字
                fontWeight: 500, // 按钮文字使用Medium字重，符合导航/小标题规范
                fontFamily: '"Poppins", "Roboto", "Helvetica Neue", Arial, sans-serif', // 使用规范字体家族
                letterSpacing: 2, // 保留原有字间距
                backgroundColor: '#FD5D93', // 主色调（粉红）用于主要按钮
                borderRadius: 4, // 按钮标准圆角（实心按钮使用4px）
                borderWidth: 0, // 实心按钮无边框（或使用渐变）
                borderColor: 'transparent', // 透明边框
                borderStyle: 'solid',
                speed: 0.3, // 保留动画速度
                scannerColor: '#FFFFFF', // 扫描效果颜色使用白色
                hoverShadow: 'rgba(253, 93, 147, 0.4)', // 使用主色调的透明版本作为悬停阴影
                hoverBackgroundColor: '#EC250D', // 使用主色调渐变中的深色部分作为悬停背景
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
                value: ""
            }
        };
    }

    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'data'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseButtonStyleConfig,
            animation: AnimationConfig,
            theme: ThemeConfig,
            filter: FilterConfig,
        };
    }


    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "click",
                name: "点击时",
            }
        ]);
    }
}