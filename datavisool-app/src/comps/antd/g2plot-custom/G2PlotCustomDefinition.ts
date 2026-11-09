/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";

import pieImg from './g2-plot-custom.webp';
import G2PlotCustomController, {G2PlotCustomProps} from "./G2PlotCustomController.ts";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {Data, Optimize, SettingOne} from "@icon-park/react";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const G2PlotCustomConfig = React.lazy(() => import("./G2PlotCustomConfig.tsx"));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

class G2PlotCustomDefinition extends AntdCommonDefinition<G2PlotCustomController, G2PlotCustomProps> {

    getController(): ClazzTemplate<G2PlotCustomController> | null {
        return G2PlotCustomController;
    }

    getMenuList(): Array<MenuInfo> {
        return [
            {
                icon: SettingOne,
                name: '基础',
                key: 'base',
            },
            {
                icon: Optimize,
                name: '自定义',
                key: 'custom',
            },
            {
                icon: Data,
                name: '数据',
                key: 'data',
            }
        ];
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            custom: G2PlotCustomConfig,
        };
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "G2Plot自定义图表",
            compKey: "G2PlotCustom",
            categorize: "other",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "G2PlotCustom",
            compName: "G2Plot自定义图表",
            summary: "G2Plot自定义图表，用于接入自定义图表渲染逻辑和扩展可视化能力。",
            featureTags: ["G2Plot自定义图表", "自定义图表", "可视化扩展", "图表适配器", "扩展组件"],
            applicableScenes: ["特殊图表需求", "图表扩展", "自定义渲染", "复杂可视化"],
            capabilities: ["支持自定义图表渲染", "支持外部图表配置", "支持复杂可视化扩展"],
            constraints: [],
            aliases: ["Custom Chart", "Chart Adapter"],
            categorize: "other",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    customCode: string;
}`.trim();
    }


    getChartImg(): string | null {
        return pieImg;
    }

    getInitConfig(): G2PlotCustomProps {

        return {
            base: {
                id: "",
                name: 'G2Plot自定义图表',
                type: 'G2PlotCustom',
            },
            style: {
                customCode: "function renderG2Plot(container, G2Plot, data) {\n" +
                    "    const g2plot = new G2Plot.BidirectionalBar(container, {\n" +
                    "        data: data,\n" +
                    "        layout: 'vertical',\n" +
                    "        xField: 'country',\n" +
                    "        yField: ['2016年耕地总面积', '2016年转基因种植面积'],\n" +
                    "        legend: false,\n" +
                    "        appendPadding: [20, 0],\n" +
                    "        barStyle: {\n" +
                    "            lineWidth: 4\n" +
                    "        },\n" +
                    "        yAxis: {\n" +
                    "            '2016年耕地总面积': {\n" +
                    "                grid: null,\n" +
                    "                label: {\n" +
                    "                    style: {\n" +
                    "                        fill: \"#fff\",\n" +
                    "                        fontSize: 10,\n" +
                    "                    },\n" +
                    "                },\n" +
                    "\n" +
                    "            },\n" +
                    "            '2016年转基因种植面积': {\n" +
                    "                grid: null,\n" +
                    "                label: {\n" +
                    "                    style: {\n" +
                    "                        fill: \"#fff\",\n" +
                    "                        fontSize: 10,\n" +
                    "                    },\n" +
                    "                },\n" +
                    "            },\n" +
                    "        },\n" +
                    "        xAxis: {\n" +
                    "            grid: null,\n" +
                    "            label: {\n" +
                    "                style: {\n" +
                    "                    fill: \"#fff\",\n" +
                    "                    fontSize: 10,\n" +
                    "                },\n" +
                    "            },\n" +
                    "            line: {\n" +
                    "                style: {\n" +
                    "                    stroke: \"#6f6f6f91\",\n" +
                    "                    lineWidth: 1,\n" +
                    "                },\n" +
                    "            },\n" +
                    "            tickLine: null,\n" +
                    "            subTickLine: null,\n" +
                    "            title: null,\n" +
                    "        },\n" +
                    "        label: {\n" +
                    "            position: 'top',\n" +
                    "            style: {\n" +
                    "                fill: '#fff'\n" +
                    "            }\n" +
                    "        },\n" +
                    "    });\n" +
                    "    g2plot.render();\n" +
                    "    return g2plot;\n" +
                    "}",
            },
            data: {
                sourceType: 'static',
                value: [
                    {country: '乌拉圭', '2016年耕地总面积': 13.4, '2016年转基因种植面积': 12.3},
                    {country: '巴拉圭', '2016年耕地总面积': 14.4, '2016年转基因种植面积': 6.3},
                    {country: '南非', '2016年耕地总面积': 18.4, '2016年转基因种植面积': 8.3},
                    {country: '巴基斯坦', '2016年耕地总面积': 34.4, '2016年转基因种植面积': 13.8},
                    {country: '阿根廷', '2016年耕地总面积': 44.4, '2016年转基因种植面积': 19.5},
                    {country: '巴西', '2016年耕地总面积': 24.4, '2016年转基因种植面积': 18.8},
                    {country: '加拿大', '2016年耕地总面积': 54.4, '2016年转基因种植面积': 24.7},
                    {country: '中国', '2016年耕地总面积': 104.4, '2016年转基因种植面积': 5.3},
                    {country: '美国', '2016年耕地总面积': 165.2, '2016年转基因种植面积': 72.9},
                ],
            },
        };
    }
}

export default G2PlotCustomDefinition;
