/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {MenuInfo} from "../../../designer/right/MenuType";
import BaseInputImg from './base-input.webp';
import {BaseInputController} from "./BaseInputController.ts";
import {BaseInputComponentProps} from "./BaseInputComponent.tsx";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const BaseInputStyleConfig = lazy(() => import("./BaseInputConfig.tsx").then((module) => ({default: module.BaseInputStyleConfig})));

export default class BaseInputDefinition extends AbstractDesignerDefinition<BaseInputController, BaseInputComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "输入框",
            compKey: "BaseInput",
            categorize: "web",
            width: 320,
            height: 26,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseInput",
            compName: "输入框",
            summary: "输入框，用于输入文本、数字或搜索条件。",
            featureTags: ["输入框", "文本输入", "表单控件", "页面控件"],
            applicableScenes: ["表单录入", "搜索条件", "信息编辑", "筛选输入"],
            capabilities: ["支持文本输入", "支持表单绑定", "支持校验提示"],
            constraints: [],
            aliases: ["Input", "Text Input"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    backgroundColor?: string;
    borderRadius?: number;
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: string;
    backgroundColorHover?: string;
    borderRadiusHover?: number;
    borderWidthHover?: number;
    borderColorHover?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return BaseInputImg;
    }

    getController(): ClazzTemplate<BaseInputController> | null {
        return BaseInputController;
    }

    getInitConfig(): BaseInputComponentProps {
        return {
            base: {
                id: "",
                name: '输入框',
                type: 'BaseInput',
            },
            style: {
                // 基本样式
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 400,
                fontFamily: '"Poppins", sans-serif',

                // 背景与边框
                backgroundColor: '#27293D',
                borderRadius: 6,
                borderWidth: 0,
                borderColor: 'transparent',
                borderStyle: 'solid',

                // 交互状态
                backgroundColorHover: 'rgba(253, 93, 147, 0.1)',
                borderRadiusHover: 6,
                borderWidthHover: 1,
                borderColorHover: '#FD5D93',
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

    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((item: MenuInfo) => item.key !== 'data');
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseInputStyleConfig,
            animation: AnimationConfig,
            theme: ThemeConfig,
            filter: FilterConfig
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
                id: "valueChange",
                name: "值改变时",
            }
        ]);
    }
}