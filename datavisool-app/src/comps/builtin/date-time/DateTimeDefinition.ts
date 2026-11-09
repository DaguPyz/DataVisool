/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {MenuInfo} from "../../../designer/right/MenuType";
import DateTimeImg from './date-time.webp';
import {DateTimeController} from "./DateTimeController.ts";
import {DateTimeComponentProps, FormatType} from "./DateTimeComponent.tsx";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import {lazy} from "react";

const DateTimeConfig = lazy(() => import("./DateTimeConfig.tsx").then((module) => ({default: module.DateTimeConfig})));

export default class DateTimeDefinition extends AbstractDesignerDefinition<DateTimeController, DateTimeComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "当前时间",
            compKey: "DateTime",
            categorize: "info",
            subCategorize: "text",
            width: 320,
            height: 26,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "DateTime",
            compName: "当前时间",
            summary: "当前时间，用于展示实时时间、日期或时钟信息。",
            featureTags: ["当前时间", "时钟展示", "日期时间", "信息组件"],
            applicableScenes: ["时钟展示", "日期显示", "状态栏时间", "大屏时间组件"],
            capabilities: ["支持时间展示", "支持日期展示", "支持实时时钟"],
            constraints: [],
            aliases: ["Time", "Clock"],
            categorize: "info",
            subCategorize: "text",
        };
    }

    getAiStylePromptTs(): string {
        return `export enum FormatType {
    DASH = '0',
    SLASH = '1',
    CN = '2',
}

export interface ComponentStyle {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: number;
    alignItems?: string;
    justifyContent?: string;
    letterSpacing?: string;
    formatType?: FormatType;
}`.trim();
    }

    getChartImg(): string | null {
        return DateTimeImg;
    }

    getController(): ClazzTemplate<DateTimeController> | null {
        return DateTimeController;
    }

    getInitConfig(): DateTimeComponentProps {
        return {
            base: {
                id: "",
                name: '当前时间',
                type: 'DateTime',
            },
            style: {
                fontSize: 16,
                fontWeight: 500,
                color: '#fff',
                fontFamily: 'Arial',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: '1',
                formatType: FormatType.CN
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
        const menuMapping = super.getMenuToConfigContentMap();
        menuMapping['style'] = DateTimeConfig;
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