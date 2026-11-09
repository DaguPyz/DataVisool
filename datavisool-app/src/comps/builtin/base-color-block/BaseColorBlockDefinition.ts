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
import baseColorBlockImg from './base-color-block.webp';
import {BaseColorBlockController} from "./BaseColorBlockController";
import {BaseColorBlockComponentProps} from "./BaseColorBlockComponent";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const BaseColorBlockConfig = lazy(() => import("./BaseColorBlockConfig").then((module) => ({default: module.BaseColorBlockConfig})));

export default class BaseColorBlockDefinition extends AbstractDesignerDefinition<BaseColorBlockController, BaseColorBlockComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "基础色块",
            compKey: "BaseColorBlock",
            categorize: "ornament",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseColorBlock",
            compName: "基础色块",
            summary: "基础色块，用于纯色填充、视觉占位和色彩展示。",
            featureTags: ["基础色块", "色块", "纯色填充", "视觉占位", "装饰组件"],
            applicableScenes: ["背景填充", "颜色展示", "占位布局", "视觉装饰"],
            capabilities: ["支持纯色展示", "支持视觉占位", "支持背景填充"],
            constraints: [],
            aliases: ["Color Block"],
            categorize: "ornament",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    borderRadius?: number;
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: string;
    background?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return baseColorBlockImg;
    }

    getController(): ClazzTemplate<BaseColorBlockController> | null {
        return BaseColorBlockController;
    }

    getInitConfig(): BaseColorBlockComponentProps {
        return {
            base: {
                id: "",
                name: '基础色块',
                type: 'BaseColorBlock',
            },
            style: {
                background: '#009DFF33',
                borderRadius: 0,
                borderWidth: 0,
                borderColor: '#74747400',
                borderStyle: 'none',
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
        };
    }

    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'data' && item.key !== 'mapping'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseColorBlockConfig,
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
            }
        ]);
    }
}