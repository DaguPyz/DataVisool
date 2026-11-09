/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {MenuInfo} from "../../../designer/right/MenuType";
import baseColorBlockImg from './screen-reference.webp';
import {ScreenReferenceController} from "./ScreenReferenceController.ts";
import {ScreenReferenceComponentProps} from "./ScreenReferenceComponent.tsx";
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
const ScreenReferenceConfig = lazy(() => import("./ScreenReferenceConfig.tsx").then((module) => ({default: module.ScreenReferenceConfig})));

export default class ScreenReferenceDefinition extends AbstractDesignerDefinition<ScreenReferenceController, ScreenReferenceComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "大屏引用",
            compKey: "ScreenReference",
            categorize: "other",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "ScreenReference",
            compName: "大屏引用",
            summary: "大屏引用，用于复用其他大屏页面或嵌入已有大屏内容。",
            featureTags: ["大屏引用", "页面复用", "内容嵌入", "引用组件"],
            applicableScenes: ["页面复用", "子页面嵌入", "大屏跳转", "内容聚合"],
            capabilities: ["支持引用外部大屏", "支持页面嵌入", "支持内容复用"],
            constraints: [],
            aliases: ["Screen Reference", "Screen Embed"],
            categorize: "other",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    screenId?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return baseColorBlockImg;
    }

    getController(): ClazzTemplate<ScreenReferenceController> | null {
        return ScreenReferenceController;
    }

    getInitConfig(): ScreenReferenceComponentProps {
        return {
            base: {
                id: "",
                name: '大屏引用',
                type: 'ScreenReference',
            },
            style: {},
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
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'theme' && item.key !== 'data' && item.key !== 'mapping'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: ScreenReferenceConfig,
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