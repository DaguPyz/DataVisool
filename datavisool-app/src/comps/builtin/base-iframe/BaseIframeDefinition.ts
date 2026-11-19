/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfo} from '@datavisool/sdk/host';
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import type {MenuInfo} from "@datavisool/sdk/core";
import baseIframeImg from './base-iframe.webp';
import {BaseIframeController} from "./BaseIframeController";
import {BaseIframeComponentProps} from "./BaseIframeComponent";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const FilterConfig = React.lazy(() => import("@datavisool/sdk/host").then(({FilterConfig}) => ({default: FilterConfig})));
const BaseIframeStyleConfig = lazy(() => import("./BaseIframeConfig").then((module) => ({default: module.BaseIframeStyleConfig})));

export default class BaseIframeDefinition extends AbstractDesignerDefinition<BaseIframeController, BaseIframeComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "基础iframe",
            compKey: "BaseIframe",
            categorize: "web",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseIframe",
            compName: "基础iframe",
            summary: "基础iframe，用于嵌入外部页面或独立内容容器。",
            featureTags: ["基础iframe", "iframe", "页面嵌入", "内容承载", "页面控件"],
            applicableScenes: ["外部页面嵌入", "文档预览", "网页承载", "内容聚合"],
            capabilities: ["支持外部页面嵌入", "支持链接承载", "支持独立内容展示"],
            constraints: [],
            aliases: ["Iframe", "Embed"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    src?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return baseIframeImg;
    }

    getController(): ClazzTemplate<BaseIframeController> | null {
        return BaseIframeController;
    }

    getInitConfig(): BaseIframeComponentProps {
        return {
            base: {
                id: "",
                name: '基础iframe',
                type: 'BaseIframe',
            },
            style: {
                src: '',
            },
        };
    }

    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((menu) => menu.key !== 'data' && menu.key !== 'theme');
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseIframeStyleConfig,
            filter: FilterConfig
        };
    }

    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "load",
                name: "iframe加载完成时",
            }
        ]);
    }
}