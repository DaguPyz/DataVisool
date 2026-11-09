/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {MenuInfo} from "../../../designer/right/MenuType";
import FlvPlayerImg from './flv-player.webp';
import {FlvPlayerController} from "./FlvPlayerController.ts";
import {FlvPlayerComponentProps} from "./FlvPlayerComponent.tsx";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {lazy} from "react";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";

const BaseInfo = lazy(() => import("../../common-component/base-info/BaseInfo"));
const AnimationConfig = lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const FlvPlayerConfig = lazy(() => import("./FlvPlayerConfig.tsx").then((module) => ({default: module.FlvPlayerConfig})));

export default class FlvPlayerDefinition extends AbstractDesignerDefinition<FlvPlayerController, FlvPlayerComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "FLV视频流",
            compKey: "FlvPlayer",
            categorize: "media",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "FlvPlayer",
            compName: "FLV视频流",
            summary: "FLV视频流，用于播放 FLV 协议的视频流内容。",
            featureTags: ["FLV视频流", "流媒体", "视频播放", "媒体内容"],
            applicableScenes: ["直播播放", "监控预览", "流媒体展示", "视频看板"],
            capabilities: ["支持 FLV 流播放", "支持视频控制", "支持流媒体承载"],
            constraints: [],
            aliases: ["FLV Player"],
            categorize: "media",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    url?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return FlvPlayerImg;
    }

    getController(): ClazzTemplate<FlvPlayerController> | null {
        return FlvPlayerController;
    }

    getInitConfig(): FlvPlayerComponentProps {
        return {
            base: {
                id: "",
                name: 'FLV视频流',
                type: 'FlvPlayer',
            },
            style: {
                url: ''
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
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'theme' && item.key !== 'data' && item.key !== 'mapping'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: FlvPlayerConfig,
            animation: AnimationConfig,
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