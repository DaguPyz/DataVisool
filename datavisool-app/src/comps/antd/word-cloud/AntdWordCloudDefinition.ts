/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import baseWordCloudImg from "./word-cloud.webp";
import AntdWordCloudController, {AntdWordCloudProps} from "./AntdWordCloudController.ts";
import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {Deeplink} from "@icon-park/react";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {EventInfo} from "@datavisool/sdk/types";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {lazy} from "react";

const AntdWordCloudStyle = lazy(() => import("./AntdWordCloudConfig.tsx").then((module) => ({default: module.AntdWordCloudStyle})));
const AntdWordCloudFieldMapping = lazy(() => import("./AntdWordCloudConfig.tsx").then((module) => ({default: module.AntdWordCloudFieldMapping})));

class AntdWordCloudDefinition extends AbstractDesignerDefinition<AntdWordCloudController, AntdWordCloudProps> {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd词云图",
            compKey: "AntdWordCloud",
            categorize: "chart",
            subCategorize: "wordCloud",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdWordCloud",
            compName: "Antd词云图",
            summary: "Antd词云图，用于展示关键词热度和文本频次分布。",
            featureTags: ["Antd词云图", "词云图", "文本热度", "关键词分析", "数据可视化"],
            applicableScenes: ["舆情分析", "关键词统计", "文本热度", "标签聚合"],
            capabilities: ["支持词频权重映射", "支持热点突出", "支持文本热度表达"],
            constraints: ["更适合文本频次数据", "不适合精确数值比较"],
            aliases: ["Word Cloud"],
            categorize: "chart",
            subCategorize: "wordCloud",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** 值。 */
      value?: number;
      /** 名称。 */
      name?: string;
    }>;
  /** wordField 配置。 */
  wordField?: string;
  /** weightField 配置。 */
  weightField?: string;
  /** colorField 配置。 */
  colorField?: string;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** spiral 配置。 */
  spiral?: string;
  /** 颜色。 */
  color?: string[];
  /** wordStyle 配置。 */
  wordStyle?: {
    /** 字体族。 */
    fontFamily?: string;
    /** 字重。 */
    fontWeight?: number;
    /** 字号。 */
    fontSize?: number[];
    /** rotation 配置。 */
    rotation?: number;
    /** 内边距。 */
    padding?: number;
  };
}`.trim();
    }



    getEventList(): EventInfo[] {
        const eventList = super.getEventList();
        eventList.push(...[
            {
                id: "dataChange",
                name: "数据变更时",
            },
            {
                id: "globalClick",
                name: "点击整个组件时",
            },
            {
                id: "elementClick",
                name: "点击图形数据元素时",
            },
        ])
        return eventList;
    }

    getController(): ClazzTemplate<AntdWordCloudController> | null {
        return AntdWordCloudController
    }

    getMenuList(): MenuInfo[] {
        const menus = super.getMenuList();
        menus.splice(3, 0, {
            icon: Deeplink,
            name: '映射',
            key: 'mapping',
        })
        return menus;
    }

    getChartImg(): string {
        return baseWordCloudImg;
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuMapping = super.getMenuToConfigContentMap();
        menuMapping['style'] = AntdWordCloudStyle;
        menuMapping['mapping'] = AntdWordCloudFieldMapping;
        return menuMapping;
    }

    getInitConfig(): AntdWordCloudProps {
        const data = [
            {
                value: 9,
                name: "AntV"
            },
            {
                value: 8,
                name: "F2"
            },
            {
                value: 8,
                name: "G2"
            },
            {
                value: 8,
                name: "G6"
            },
            {
                value: 8,
                name: "DataSet"
            },
            {
                value: 8,
                name: "墨者学院"
            },
            {
                value: 6,
                name: "Analysis"
            },
            {
                value: 6,
                name: "Data Mining"
            },
            {
                value: 6,
                name: "Data Vis"
            },
            {
                value: 6,
                name: "Design"
            },
            {
                value: 6,
                name: "Grammar"
            },
            {
                value: 6,
                name: "Graphics"
            },
            {
                value: 6,
                name: "Graph"
            },
            {
                value: 6,
                name: "Hierarchy"
            },
            {
                value: 6,
                name: "Labeling"
            },
            {
                value: 6,
                name: "Layout"
            },
            {
                value: 6,
                name: "Quantitative"
            },
        ];
        return {
            base: {
                id: "",
                name: 'Antd词云图',
                type: 'AntdWordCloud',
            },
            style: {
                data,
                wordField: "name",
                weightField: "value",
                colorField: "name",
                supportCSSTransform: true,
                spiral: "rectangular",
                color: [
                    "#2294ff",
                    "#ff8934",
                    "#f370ff"
                ],
                wordStyle: {
                    fontFamily: "DingTalk JinBuTi",
                    fontWeight: 500,
                    fontSize: [
                        14,
                        37
                    ],
                    rotation: 0,
                    padding: 7
                }
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
                value: data
            },
        };
    }
}

export default AntdWordCloudDefinition;
