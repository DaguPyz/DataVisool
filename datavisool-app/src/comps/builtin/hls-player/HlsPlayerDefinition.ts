/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {MenuInfo} from "../../../designer/right/MenuType";
import HlsPlayerImg from './hls-player.webp';
import {HlsPlayerController} from "./HlsPlayerController.ts";
import {HlsPlayerComponentProps} from "./HlsPlayerComponent.tsx";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {lazy} from "react";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";

const BaseInfo = lazy(() => import("../../common-component/base-info/BaseInfo"));
const AnimationConfig = lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const FilterConfig = lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const HlsPlayerConfig = lazy(() => import("./HlsPlayerConfig.tsx").then((module) => ({default: module.HlsPlayerConfig})));

export default class HlsPlayerDefinition extends AbstractDesignerDefinition<HlsPlayerController, HlsPlayerComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "HLS视频流",
            compKey: "HlsPlayer",
            categorize: "media",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "HlsPlayer",
            compName: "HLS视频流",
            summary: "HLS视频流，用于播放 HLS 协议的视频流内容。",
            featureTags: ["HLS视频流", "流媒体", "视频播放", "媒体内容"],
            applicableScenes: ["直播播放", "监控预览", "流媒体展示", "视频看板"],
            capabilities: ["支持 HLS 流播放", "支持视频控制", "支持流媒体承载"],
            constraints: [],
            aliases: ["HLS Player"],
            categorize: "media",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    url?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return HlsPlayerImg;
    }

    getController(): ClazzTemplate<HlsPlayerController> | null {
        return HlsPlayerController;
    }

    getInitConfig(): HlsPlayerComponentProps {
        return {
            base: {
                id: "",
                name: 'HLS视频流',
                type: 'HlsPlayer',
            },
            style: {
                url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
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
            style: HlsPlayerConfig,
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