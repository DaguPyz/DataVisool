/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import echartsImg from './echarts.webp';
import EChartsController, {EChartsProps} from "./EChartsController.ts";
import {Data, Optimize, SettingOne, UpdateRotation} from "@icon-park/react";
import AbstractDesignerDefinition from "../../framework/core/AbstractDesignerDefinition.ts";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";

const EChartsConfig = React.lazy(() => import("./EChartsConfig.tsx"));
const BaseInfo = React.lazy(() => import("../common-component/base-info/BaseInfo"));
const DataConfig = React.lazy(() => import("../common-component/data-config/DataConfig"));
const EChartsCustomDataUpdateConfig = React.lazy(() => import("./EChartsCustomDataUpdateConfig.tsx"));

class EChartsDefinition extends AbstractDesignerDefinition<EChartsController, EChartsProps> {

    getController(): ClazzTemplate<EChartsController> | null {
        return EChartsController;
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
                icon: UpdateRotation,
                name: '数据更新',
                key: 'updateData',
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
            base: BaseInfo,
            data: DataConfig,
            custom: EChartsConfig,
            updateData: EChartsCustomDataUpdateConfig,
        };
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Echarts自定义图表",
            compKey: "ECharts",
            categorize: "other",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "ECharts",
            compName: "Echarts自定义图表",
            summary: "Echarts自定义图表，用于接入自定义图表渲染逻辑和扩展可视化能力。",
            featureTags: ["Echarts自定义图表", "自定义图表", "可视化扩展", "图表适配器", "扩展组件"],
            applicableScenes: ["特殊图表需求", "图表扩展", "自定义渲染", "复杂可视化"],
            capabilities: ["支持自定义图表渲染", "支持外部图表配置", "支持复杂可视化扩展"],
            constraints: [],
            aliases: ["Custom Chart", "Chart Adapter"],
            categorize: "other",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    customCode?: string;
    customDataUpdateCode?: string;
}`.trim();
    }

    getChartImg(): string | null {
        return echartsImg;
    }

    getInitConfig(): EChartsProps {
        return {
            base: {
                id: "",
                name: 'Echarts自定义图表',
                type: 'ECharts',
            },
            style: {
                customCode: "function renderECharts(container, echarts, data) {\n" +
                    "    const chart = echarts.init(container, 'dark');\n" +
                    "    const series = [\n" +
                    "        {\n" +
                    "            data: [120, 200, 150, 80, 70, 110, 130],\n" +
                    "            type: 'bar',\n" +
                    "            stack: 'a',\n" +
                    "            name: 'a'\n" +
                    "        },\n" +
                    "        {\n" +
                    "            data: [10, 46, 64, '-', 0, '-', 0],\n" +
                    "            type: 'bar',\n" +
                    "            stack: 'a',\n" +
                    "            name: 'b'\n" +
                    "        },\n" +
                    "        {\n" +
                    "            data: [30, '-', 0, 20, 10, '-', 0],\n" +
                    "            type: 'bar',\n" +
                    "            stack: 'a',\n" +
                    "            name: 'c'\n" +
                    "        },\n" +
                    "        {\n" +
                    "            data: [30, '-', 0, 20, 10, '-', 0],\n" +
                    "            type: 'bar',\n" +
                    "            stack: 'b',\n" +
                    "            name: 'd'\n" +
                    "        },\n" +
                    "        {\n" +
                    "            data: [10, 20, 150, 0, '-', 50, 10],\n" +
                    "            type: 'bar',\n" +
                    "            stack: 'b',\n" +
                    "            name: 'e'\n" +
                    "        }\n" +
                    "    ];\n" +
                    "    const stackInfo = {};\n" +
                    "    for (let i = 0; i < series[0].data.length; ++i) {\n" +
                    "        for (let j = 0; j < series.length; ++j) {\n" +
                    "            const stackName = series[j].stack;\n" +
                    "            if (!stackName) {\n" +
                    "                continue;\n" +
                    "            }\n" +
                    "            if (!stackInfo[stackName]) {\n" +
                    "                stackInfo[stackName] = {\n" +
                    "                    stackStart: [],\n" +
                    "                    stackEnd: []\n" +
                    "                };\n" +
                    "            }\n" +
                    "            const info = stackInfo[stackName];\n" +
                    "            const data = series[j].data[i];\n" +
                    "            if (data && data !== '-') {\n" +
                    "                if (info.stackStart[i] == null) {\n" +
                    "                    info.stackStart[i] = j;\n" +
                    "                }\n" +
                    "                info.stackEnd[i] = j;\n" +
                    "            }\n" +
                    "        }\n" +
                    "    }\n" +
                    "    for (let i = 0; i < series.length; ++i) {\n" +
                    "        const data = series[i].data;\n" +
                    "        const info = stackInfo[series[i].stack];\n" +
                    "        for (let j = 0; j < series[i].data.length; ++j) {\n" +
                    "            // const isStart = info.stackStart[j] === i;\n" +
                    "            const isEnd = info.stackEnd[j] === i;\n" +
                    "            const topBorder = isEnd ? 20 : 0;\n" +
                    "            const bottomBorder = 0;\n" +
                    "            data[j] = {\n" +
                    "                value: data[j],\n" +
                    "                itemStyle: {\n" +
                    "                    borderRadius: [topBorder, topBorder, bottomBorder, bottomBorder]\n" +
                    "                }\n" +
                    "            };\n" +
                    "        }\n" +
                    "    }\n" +
                    "    const option = {\n" +
                    "        xAxis: {\n" +
                    "            type: 'category',\n" +
                    "            data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']\n" +
                    "        },\n" +
                    "        yAxis: {\n" +
                    "            type: 'value'\n" +
                    "        },\n" +
                    "        series: series\n" +
                    "    };\n" +
                    "\n" +
                    "    option && chart.setOption(option);\n" +
                    "    return chart;\n" +
                    "}",
                customDataUpdateCode: "function updateEChartsDate(echarts, data) {\n" +
                    "    //请结合ECharts官方文档，构建更新后的数据结构\n" +
                    "    echarts.setOption(data)\n" +
                    "}\n"
            },
            data: {
                sourceType: 'static',
                value: [],
            },
        };
    }
}

export default EChartsDefinition;

