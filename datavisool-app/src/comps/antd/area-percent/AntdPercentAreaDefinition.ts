/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import percentAreaImg from "./percent-area.webp";
import AbstractAreaDefinition from "@/comps/antd-common/area/AbstractAreaDefinition";
import {AntdAreaProps} from "@/comps/antd-common/area/AntdCommonAreaController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdPercentAreaDefinition extends AbstractAreaDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd百分比面积图",
            compKey: "AntdPercentArea",
            categorize: "chart",
            subCategorize: "area",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdPercentArea",
            compName: "Antd百分比面积图",
            summary: "Antd百分比面积图，用于展示各分类在总量中的占比变化。",
            featureTags: ["Antd百分比面积图", "百分比面积图", "占比分析", "百分比归一化", "数据可视化"],
            applicableScenes: ["占比分析", "转化率变化", "结构对比", "趋势观察"],
            capabilities: ["支持百分比归一化", "支持面积填充", "支持趋势变化表达"],
            constraints: ["适合比例型趋势数据", "需要统一口径的总量基准"],
            aliases: ["Area Chart", "Percent Area"],
            categorize: "chart",
            subCategorize: "area",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** country 配置。 */
      country?: string;
      /** year 配置。 */
      year?: string;
      /** 值。 */
      value?: number;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** isPercent 配置。 */
  isPercent?: boolean;
  /** 是否平滑。 */
  smooth?: boolean;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** 颜色。 */
  color?: string[];
  /** 数据点配置。 */
  point?: {
    /** size 配置。 */
    size?: number;
    /** 颜色。 */
    color?: string[];
    /** style 配置。 */
    style?: {
      /** 描边颜色。 */
      stroke?: string;
      /** 线宽。 */
      lineWidth?: number;
    };
    /** shape 配置。 */
    shape?: string;
  };
  /** 线条配置。 */
  line?: {
    /** style 配置。 */
    style?: {
      /** 线宽。 */
      lineWidth?: number;
    };
    /** 颜色。 */
    color?: string[];
  };
  /** 面积填充样式。 */
  areaStyle?: {
    /** fillOpacity 配置。 */
    fillOpacity?: number;
  };
  /** X 轴配置。 */
  xAxis?: {
    /** 位置。 */
    position?: string;
    /** range 配置。 */
    range?: number[];
    /** 网格线配置。 */
    grid?: any;
    /** 文本/标签配置。 */
    label?: {
      /** style 配置。 */
      style?: {
        /** 文字颜色。 */
        fill?: string;
        /** 字号。 */
        fontSize?: number;
      };
    };
    /** 轴线配置。 */
    line?: any;
    /** 刻度线配置。 */
    tickLine?: any;
    /** 子刻度线配置。 */
    subTickLine?: any;
    /** 标题配置。 */
    title?: any;
  };
  /** Y 轴配置。 */
  yAxis?: {
    /** 位置。 */
    position?: string;
    /** 网格线配置。 */
    grid?: any;
    /** 文本/标签配置。 */
    label?: {
      /** style 配置。 */
      style?: {
        /** 文字颜色。 */
        fill?: string;
        /** 字号。 */
        fontSize?: number;
      };
    };
    /** 轴线配置。 */
    line?: any;
    /** 刻度线配置。 */
    tickLine?: any;
    /** 子刻度线配置。 */
    subTickLine?: any;
    /** 标题配置。 */
    title?: any;
    /** tickCount 配置。 */
    tickCount?: number;
  };
  /** 图例配置。 */
  legend?: {
    /** 位置。 */
    position?: string;
    /** 布局方向。 */
    layout?: string;
    /** itemName 配置。 */
    itemName?: {
      /** style 配置。 */
      style?: {
        /** 文字颜色。 */
        fill?: string;
        /** 字号。 */
        fontSize?: number;
      };
    };
  };
  /** 动画配置。 */
  animation?: {
    /** appear 配置。 */
    appear?: {
      /** 动画配置。 */
      animation?: string;
      /** duration 配置。 */
      duration?: number;
    };
  };
}`.trim();
    }


    getChartImg(): string {
        return percentAreaImg;
    }

    getInitConfig(): AntdAreaProps {
        const data = [
            {
                country: "Asia",
                year: "1750",
                value: 502
            },
            {
                country: "Asia",
                year: "1800",
                value: 635
            },
            {
                country: "Asia",
                year: "1850",
                value: 809
            },
            {
                country: "Asia",
                year: "1900",
                value: 947
            },
            {
                country: "Asia",
                year: "1950",
                value: 1402
            },
            {
                country: "Asia",
                year: "1999",
                value: 3634
            },
            {
                country: "Asia",
                year: "2050",
                value: 5268
            },
            {
                country: "Africa",
                year: "1750",
                value: 106
            },
            {
                country: "Africa",
                year: "1800",
                value: 107
            },
            {
                country: "Africa",
                year: "1850",
                value: 111
            },
            {
                country: "Africa",
                year: "1900",
                value: 133
            },
            {
                country: "Africa",
                year: "1950",
                value: 221
            },
            {
                country: "Africa",
                year: "1999",
                value: 767
            },
            {
                country: "Africa",
                year: "2050",
                value: 1766
            },
            {
                country: "Europe",
                year: "1750",
                value: 163
            },
            {
                country: "Europe",
                year: "1800",
                value: 203
            },
            {
                country: "Europe",
                year: "1850",
                value: 276
            },
            {
                country: "Europe",
                year: "1900",
                value: 408
            },
            {
                country: "Europe",
                year: "1950",
                value: 547
            },
            {
                country: "Europe",
                year: "1999",
                value: 729
            },
            {
                country: "Europe",
                year: "2050",
                value: 628
            }
        ];
        return {
            base: {
                id: "",
                name: '百分比面积图',
                type: 'AntdPercentArea',
            },
            style: {
                data: data,
                xField: "year",
                yField: "value",
                seriesField: "country",
                isPercent: true,
                smooth: true,
                supportCSSTransform: true,
                color: [
                    "l(90) 0:#016eb7 0.42:#016eb700",
                    "l(90) 0:#016eb7 0.53:#016eb700",
                    "l(90) 0:#016eb7 0.72:#016eb700"
                ],
                point: {
                    size: 0,
                    color: [
                        "#4fa3ff67",
                        "#009aff67",
                        "#006d7f67"
                    ],
                    style: {
                        stroke: "#ffffff",
                        lineWidth: 0
                    },
                    shape: "circle"
                },
                line: {
                    style: {
                        lineWidth: 2
                    },
                    color: [
                        "r(0.5,0.5,1) 0.24:#0099ff 1:#005c9936"
                    ]
                },
                areaStyle: {
                    fillOpacity: 1
                },
                xAxis: {
                    position: "bottom",
                    range: [
                        0,
                        1
                    ],
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 10
                        }
                    },
                    line: null,
                    tickLine: null,
                    subTickLine: null,
                    title: null
                },
                yAxis: {
                    position: "left",
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 12
                        }
                    },
                    line: null,
                    tickLine: null,
                    subTickLine: null,
                    title: null,
                    tickCount: 4
                },
                legend: {
                    position: "top",
                    layout: "horizontal",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 12
                        }
                    }
                },
                animation: {
                    appear: {
                        animation: "wave-in",
                        duration: 3000
                    }
                }
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdPercentAreaDefinition;
