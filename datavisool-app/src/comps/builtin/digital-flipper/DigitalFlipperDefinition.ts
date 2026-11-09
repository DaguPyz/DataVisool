/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import digitalFlipperImg from './digital-flipper.webp';
import {DigitalFlipperController} from "./DigitalFlipperController";
import {DigitalFlipperComponentProps} from "./DigitalFlipperComponent";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import {lazy} from "react";

const DigitalFlipperConfig = lazy(() => import("./DigitalFlipperConfig").then((module) => ({default: module.DigitalFlipperConfig})));

export default class DigitalFlipperDefinition extends AbstractDesignerDefinition<DigitalFlipperController, DigitalFlipperComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "数字翻牌器",
            compKey: "DigitalFlipper",
            categorize: "info",
            width: 200,
            height: 50,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "DigitalFlipper",
            compName: "数字翻牌器",
            summary: "数字翻牌器，用于展示实时数值增长、KPI 和动态统计。",
            featureTags: ["数字翻牌器", "数值展示", "实时统计", "信息组件"],
            applicableScenes: ["KPI看板", "实时数据", "指标展示", "大屏统计"],
            capabilities: ["支持数字翻牌动画", "支持动态数值刷新", "支持KPI展示"],
            constraints: [],
            aliases: ["Flipper", "Counter"],
            categorize: "info",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    color?: string;
    type?: 'slide' | 'caper';
    alignItems?: string;
    justifyContent?: string;
    prefix?: string;
    suffix?: string;
    decimalPlaces?: number;
    separator?: string;
    duration?: number;
    backgroundImage?: string;
    backgroundClip?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return digitalFlipperImg;
    }

    getController(): ClazzTemplate<DigitalFlipperController> | null {
        return DigitalFlipperController;
    }

    getInitConfig(): DigitalFlipperComponentProps {
        return {
            base: {
                id: "",
                name: '数字翻牌器',
                type: 'DigitalFlipper',
            },
            style: {
                fontSize: 20,
                fontWeight: 500,
                fontFamily: 'Microsoft YaHei',
                color: '#ffffff',
                type: 'caper',
                justifyContent: 'center',
                alignItems: 'center',
                prefix: '',
                suffix: '',
                decimalPlaces: 0,
                separator: ',',
                duration: 1,
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
                value: 123456789
            }
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuMapping = super.getMenuToConfigContentMap();
        menuMapping['style'] = DigitalFlipperConfig;
        return menuMapping;
    }


    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "click",
                name: "点击时",
            },
            {
                id: "dataChange",
                name: "数据变化时"
            }
        ]);
    }
}