/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import BaseVideoController, {BaseVideoComponentProps} from "./BaseVideoController.ts";
import baseVideo from './baseVideo.webp';
import {MenuInfo} from "../../../designer/right/MenuType";
import React, {lazy} from "react";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";

const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const BaseVideoStyleConfig = lazy(() => import("./BaseVideoConfig.tsx").then((module) => ({default: module.BaseVideoStyleConfig})));

export default class BaseVideoDefinition extends AbstractDesignerDefinition<BaseVideoController, BaseVideoComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "视频",
            compKey: "BaseVideo",
            categorize: "media",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "BaseVideo",
            compName: "视频",
            summary: "视频，用于播放视频内容和媒体素材。",
            featureTags: ["视频", "媒体展示", "内容播放", "可视化"],
            applicableScenes: ["视频播放", "素材展示", "监控预览", "媒体看板"],
            capabilities: ["支持视频播放", "支持媒体承载", "支持内容预览"],
            constraints: [],
            aliases: ["Video", "Player"],
            categorize: "media",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    /**
     * 视频资源地址。
     * 通常填写可访问的视频 URL，组件会据此渲染 <video> 标签的 source。
     */
    src?: string;
    /**
     * 是否自动播放。
     * 为 true 时视频在可播放条件满足后自动开始播放。
     */
    autoPlay?: boolean;
    /**
     * 是否显示播放器控制条。
     * 为 true 时展示播放、暂停、进度条、音量等控制能力。
     */
    controls?: boolean;
    /**
     * 是否循环播放。
     * 为 true 时视频播放结束后自动回到开头并再次播放。
     */
    loop?: boolean;
    /**
     * 是否默认静音。
     * 为 true 时播放器以静音状态启动，适合自动播放场景。
     */
    muted?: boolean;
    /**
     * 视频封面图地址。
     * 用于视频未播放前的封面展示，也可在视频加载前提升视觉占位效果。
     */
    poster?: string;
    /**
     * 视频内容填充方式。
     * contain 适合完整展示，cover 适合铺满容器，fill 会强制拉伸，none 保持原尺寸，scale-down 会在原尺寸和 contain 中取较小结果。
     */
    objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}`.trim();
    }
    getChartImg(): string | null {
        return baseVideo;
    }

    getController(): ClazzTemplate<BaseVideoController> | null {
        return BaseVideoController;
    }

    getInitConfig(): BaseVideoComponentProps {
        return {
            base: {
                id: "",
                name: '视频',
                type: 'BaseVideo',
            },
            style: {
                src: undefined,
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
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'theme' && item.key !== 'data'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseVideoStyleConfig,
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