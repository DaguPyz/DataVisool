/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import BaseImageController, {BaseImageComponentProps} from "./BaseImageController";
import baseImage from './baseImage.webp';
import {MenuInfo} from "../../../designer/right/MenuType";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const DataConfig = React.lazy(() => import("../../common-component/data-config/DataConfig.tsx"));
const BaseImageStyleConfig = lazy(() => import("./BaseImageConfig").then((module) => ({default: module.BaseImageStyleConfig})));

export default class BaseImageDefinition extends AbstractDesignerDefinition<BaseImageController, BaseImageComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "基础图片",
            compKey: "BaseImage",
            categorize: "media",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseImage",
            compName: "基础图片",
            summary: "基础图片，用于展示图片素材、静态视觉内容和数据源驱动的图片。",
            featureTags: ["基础图片", "图片", "媒体展示", "视觉素材", "可视化"],
            applicableScenes: ["素材展示", "图文看板", "图片预览", "内容展示"],
            capabilities: ["支持图片展示", "支持预览与缩放", "支持静态素材承载", "支持数据源驱动"],
            constraints: [],
            aliases: ["Image"],
            categorize: "media",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    /**
     * 图片来源模式。
     * online 表示使用在线链接，local 表示使用本地上传资源。
     * 这个字段会决定 onLineUrl 和 localUrl 中哪一个作为当前图片地址来源。
     */
    type?: 'online' | 'local';
    /**
     * 在线图片地址。
     * 仅在 type = 'online' 时生效，通常填写可直接访问的图片 URL。
     */
    onLineUrl?: string;
    /**
     * 本地图片地址。
     * 仅在 type = 'local' 时生效，通常由上传组件或本地资源转换流程写入。
     */
    localUrl?: string;
    /**
     * 图片内容 hash。
     * 用于资源去重、重复图片识别和本地资源复用。
     */
    hash?: string;
    /**
     * 图片透明度。
     * 取值通常在 0 到 1 之间，数值越小图片越透明。
     */
    opacity?: number;
}`.trim();
    }
    getChartImg(): string | null {
        return baseImage;
    }

    getController(): ClazzTemplate<BaseImageController> | null {
        return BaseImageController;
    }

    getInitConfig(): BaseImageComponentProps {
        return {
            base: {
                id: "",
                name: '基础图片',
                type: 'BaseImage',
            },
            style: {
                type: 'online',
                localUrl: '',
                onLineUrl: '',
                opacity: 1,
            },
            data: {
                sourceType: 'static',
                value: ''
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
        return super.getMenuList().filter((item: MenuInfo) => item.key !== 'theme');
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseImageStyleConfig,
            data: DataConfig,
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
