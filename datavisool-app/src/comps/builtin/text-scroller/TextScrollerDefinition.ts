/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import textScrollerImg from './text-scroller.webp';
import {TextScrollerController} from "./TextScrollerController.ts";
import {TextScrollerComponentProps} from "./TextScrollerComponent.tsx";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import {lazy} from "react";

const TextScrollerConfig = lazy(() => import("./TextScrollerConfig.tsx").then((module) => ({default: module.TextScrollerConfig})));

export default class TextScrollerDefinition extends AbstractDesignerDefinition<TextScrollerController, TextScrollerComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "文字弹幕",
            compKey: "TextScroller",
            categorize: "info",
            subCategorize: "text",
            width: 320,
            height: 26,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "TextScroller",
            compName: "文字弹幕",
            summary: "文字弹幕，用于展示滚动公告、跑马灯和长文本提示。",
            featureTags: ["文字弹幕", "滚动文本", "公告展示", "信息组件"],
            applicableScenes: ["公告提醒", "长文本展示", "动态提示", "消息滚动"],
            capabilities: ["支持文本滚动", "支持公告提示", "支持长文本轮播"],
            constraints: [],
            aliases: ["Ticker", "Marquee"],
            categorize: "info",
            subCategorize: "text",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    speed?: number;
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: number;
    backgroundImage?: string;
    backgroundClip?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return textScrollerImg;
    }

    getController(): ClazzTemplate<TextScrollerController> | null {
        return TextScrollerController;
    }

    getInitConfig(): TextScrollerComponentProps {
        return {
            base: {
                id: "",
                name: '文字弹幕',
                type: 'TextScroller',
            },
            style: {
                speed: 0.1,
                fontSize: 16,
                fontWeight: 500,
                color: '#fff',
                fontFamily: 'Arial',
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
                value: '文字弹幕'
            }
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuMapping = super.getMenuToConfigContentMap();
        menuMapping['style'] = TextScrollerConfig;
        return menuMapping;
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