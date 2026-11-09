/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import multiLineImg from "./multi-line.webp";
import AbstractLineDefinition from "@/comps/antd-common/line/AbstractLineDefinition";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {lazy} from "react";

const AntdMultiLineStyleConfig = lazy(() => import("./AntdMultiLineConfig.tsx"));
const AntdMultiLineFieldMapping = lazy(() => import("./AntdMultiLineConfig.tsx").then((module) => ({default: module.AntdMultiLineFieldMapping})));

class AntdMultiLineDefinition extends AbstractLineDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd多折线图",
            compKey: "AntdMultiLine",
            categorize: "chart",
            subCategorize: "line",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdMultiLine",
            compName: "Antd多折线图",
            summary: "Antd多折线图，用于同一坐标系下对比多条趋势线。",
            featureTags: ["Antd多折线图", "多折线图", "多系列对比", "趋势分析", "数据可视化"],
            applicableScenes: ["多指标比较", "趋势监控", "时间序列分析", "业务对照"],
            capabilities: ["支持多系列折线对比", "支持平滑曲线", "支持字段映射"],
            constraints: ["适合少量系列趋势比较", "系列过多时会拥挤"],
            aliases: ["Line Chart", "Multi Line"],
            categorize: "chart",
            subCategorize: "line",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** year 配置。 */
      year?: string;
      /** 值。 */
      value?: number;
      /** category 配置。 */
      category?: string;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** 颜色。 */
  color?: string[];
  /** 数据点配置。 */
  point?: {
    /** 颜色。 */
    color?: string[];
    /** size 配置。 */
    size?: number;
    /** shape 配置。 */
    shape?: string;
    /** style 配置。 */
    style?: {
      /** 描边颜色。 */
      stroke?: string;
      /** 线宽。 */
      lineWidth?: number;
    };
  };
  /** lineStyle 配置。 */
  lineStyle?: {
    /** 线宽。 */
    lineWidth?: number;
  };
  /** X 轴配置。 */
  xAxis?: {
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
    /** 位置。 */
    position?: string;
    /** 标题配置。 */
    title?: any;
  };
  /** Y 轴配置。 */
  yAxis?: {
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
    line?: {
      /** style 配置。 */
      style?: {
        /** 描边/线条颜色。 */
        stroke?: string;
        /** 线宽。 */
        lineWidth?: number;
      };
    };
    /** 刻度线配置。 */
    tickLine?: any;
    /** 子刻度线配置。 */
    subTickLine?: any;
    /** 位置。 */
    position?: string;
    /** 标题配置。 */
    title?: any;
  };
  /** 是否平滑。 */
  smooth?: boolean;
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
  /** 文本/标签配置。 */
  label?: {
    /** 位置。 */
    position?: string;
    /** style 配置。 */
    style?: {
      /** 字号。 */
      fontSize?: number;
      /** 文字颜色。 */
      fill?: string;
    };
  };
}`.trim();
    }


    getChartImg(): string {
        return multiLineImg;
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuToConfigContentMap = super.getMenuToConfigContentMap();
        menuToConfigContentMap!['style'] = AntdMultiLineStyleConfig;
        menuToConfigContentMap!['mapping'] = AntdMultiLineFieldMapping;
        return menuToConfigContentMap;
    }

    getInitConfig(): AntdLineProps {
        const data = [
            {
                year: "2011",
                value: 1523,
                category: "sort1"
            },
            {
                year: "2011",
                value: 634,
                category: "sort2"
            },
            {
                year: "2012",
                value: 1788,
                category: "sort1"
            },
            {
                year: "2012",
                value: 502,
                category: "sort2"
            },
            {
                year: "2013",
                value: 1620,
                category: "sort1"
            },
            {
                year: "2013",
                value: 715,
                category: "sort2"
            },
            {
                year: "2014",
                value: 1487,
                category: "sort1"
            },
            {
                year: "2014",
                value: 482,
                category: "sort2"
            },
            {
                year: "2015",
                value: 1690,
                category: "sort1"
            },
            {
                year: "2015",
                value: 659,
                category: "sort2"
            },
            {
                year: "2016",
                value: 1540,
                category: "sort1"
            },
            {
                year: "2016",
                value: 530,
                category: "sort2"
            },
            {
                year: "2017",
                value: 1725,
                category: "sort1"
            },
            {
                year: "2017",
                value: 685,
                category: "sort2"
            },
            {
                year: "2018",
                value: 1582,
                category: "sort1"
            },
            {
                year: "2018",
                value: 470,
                category: "sort2"
            },
            {
                year: "2019",
                value: 1667,
                category: "sort1"
            },
            {
                year: "2019",
                value: 540,
                category: "sort2"
            },
            {
                year: "2020",
                value: 1604,
                category: "sort1"
            },
            {
                year: "2020",
                value: 612,
                category: "sort2"
            }
        ]

        return {
            base: {
                id: "",
                name: '多折线图',
                type: 'AntdMultiLine',
            },
            style: {
                data: data,
                xField: "year",
                yField: "value",
                seriesField: "category",
                supportCSSTransform: true,
                color: [
                    "l(0) 0:#266bff 1:#af47ff",
                    "l(0) 0:#ff9a6e 1:#ff5e00"
                ],
                point: {
                    color: [
                        "#00a8ff",
                        "#00ffc9"
                    ],
                    size: 0,
                    shape: "circle",
                    style: {
                        stroke: "#00a8ff",
                        lineWidth: 0
                    }
                },
                lineStyle: {
                    lineWidth: 4
                },
                xAxis: {
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
                    position: "bottom",
                    title: null
                },
                yAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 12
                        }
                    },
                    line: {
                        style: {
                            stroke: "#adadad75",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "left",
                    title: null
                },
                smooth: true,
                legend: {
                    position: "top",
                    layout: "horizontal",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 14
                        }
                    }
                },
                animation: {
                    appear: {
                        animation: "wave-in",
                        duration: 3000
                    }
                },
                label: {
                    position: "middle",
                    style: {
                        fontSize: 8,
                        fill: "#ffffff"
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

export default AntdMultiLineDefinition;
