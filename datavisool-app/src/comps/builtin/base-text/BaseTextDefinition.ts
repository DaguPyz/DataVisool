/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import baseTextImg from './base-text.webp';
import {BaseTextController} from "./BaseTextController";
import {BaseTextComponentProps} from "./BaseTextComponent";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const DataConfig = React.lazy(() => import("../../common-component/data-config/DataConfig.tsx"));
const BaseTextStyleConfig = lazy(() => import("./BaseTextConfig").then((module) => ({default: module.BaseTextStyleConfig})));

export default class BaseTextDefinition extends AbstractDesignerDefinition<BaseTextController, BaseTextComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "基础文本",
            compKey: "BaseText",
            categorize: "info",
            width: 64,
            height: 26,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseText",
            compName: "基础文本",
            summary: "基础文本，用于展示静态文案、说明文字和标签信息。",
            featureTags: ["基础文本", "文本", "文案展示", "说明信息", "信息组件"],
            applicableScenes: ["说明文本", "标签展示", "文案排版", "内容说明"],
            capabilities: ["支持静态文案展示", "支持富文本排版", "支持标签说明"],
            constraints: [],
            aliases: ["Text"],
            categorize: "info",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    alignItems?: string;
    justifyContent?: string;
    strokeWidth?: number;
    strokeColor?: string;
    letterSpacing?: number;
    lineHeight?: number;
    textAlign?: string;
    backgroundImage?: string;
    backgroundClip?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
    cursor?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return baseTextImg;
    }

    getController(): ClazzTemplate<BaseTextController> | null {
        return BaseTextController;
    }

    getInitConfig(): BaseTextComponentProps {
        return {
            base: {
                id: "",
                name: '基础文本',
                type: 'BaseText',
            },
            style: {
                color: '#a7a7a7',
                fontSize: 16,
                alignItems: 'center',
                justifyContent: 'center',
                strokeColor: '#ffffff',
                strokeWidth: 0,
                lineHeight: 1,
                letterSpacing: 0,
                textAlign: 'left'
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
                value: "基础文本"
            },
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseTextStyleConfig,
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
            }
        ]);
    }
}