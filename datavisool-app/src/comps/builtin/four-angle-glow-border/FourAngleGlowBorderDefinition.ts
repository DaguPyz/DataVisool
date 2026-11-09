/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {MenuInfo} from "../../../designer/right/MenuType";
import fourAngleGlowBorderImg from './four-angle-glow-border.webp';
import {FourAngleGlowBorderController, FourAngleGlowProps} from "./FourAngleGlowBorderController";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const FourAngleGlowBorderConfig = lazy(() => import("./FourAngleGlowBorderConfig").then((module) => ({default: module.FourAngleGlowBorderConfig})));
const ThemeConfig = lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));

export default class FourAngleGlowBorderDefinition extends AbstractDesignerDefinition<FourAngleGlowBorderController, FourAngleGlowProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "四角辉光边框",
            compKey: "FourAngleGlowBorder",
            categorize: "ornament",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "FourAngleGlowBorder",
            compName: "四角辉光边框",
            summary: "四角辉光边框，用于突出区域范围和增强赛博风装饰效果。",
            featureTags: ["四角辉光边框", "装饰边框", "辉光效果", "视觉强调", "装饰组件"],
            applicableScenes: ["区域高亮", "卡片装饰", "赛博风界面", "重点区域强调"],
            capabilities: ["支持边框高亮", "支持发光装饰", "支持区域强调"],
            constraints: [],
            aliases: ["Glow Border", "Border"],
            categorize: "ornament",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    /**
     * 边框线条宽度。
     * 影响四角辉光线段的粗细和边框存在感。
     */
    width?: number;
    /**
     * 单边角光长度。
     * 决定每个角落的发光线段延伸距离，数值越大角光越长。
     */
    length?: number;
    /**
     * 辉光颜色。
     * 用于控制边框发光的主色调，通常会和整体主题色保持一致。
     */
    color?: string;
    /**
     * 圆角半径。
     * 决定边框角部弧度，影响四角辉光和容器轮廓的贴合程度。
     */
    radius?: number;
}`.trim();
    }
    getChartImg(): string | null {
        return fourAngleGlowBorderImg;
    }

    getController(): ClazzTemplate<FourAngleGlowBorderController> | null {
        return FourAngleGlowBorderController;
    }

    getInitConfig(): FourAngleGlowProps {
        return {
            base: {
                id: "",
                name: '基础色块',
                type: 'FourAngleGlowBorder',
            },
            style: {
                color: '#34e4ff',
                width: 2,
                radius: 4,
                length: 10,
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
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'data'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: FourAngleGlowBorderConfig,
            filter: FilterConfig,
            theme: ThemeConfig
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