/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import percentBarImg from "./percent-bar.webp";
import {AntdBarProps} from "@/comps/antd-common/bar/AntdCommonBarController";
import AbstractBarDefinition from "@/comps/antd-common/bar/AbstractBarDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import {ClazzTemplate} from "@datavisool/sdk/types";
import AntdPercentBarController from "./AntdPercentBarController.ts";

class AntdPercentBarDefinition extends AbstractBarDefinition {

    getController(): ClazzTemplate<AntdPercentBarController> | null {
        return AntdPercentBarController;
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd百分比条形图",
            compKey: "AntdPercentBar",
            categorize: "chart",
            subCategorize: "bar",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdPercentBar",
            compName: "Antd百分比条形图",
            summary: "Antd百分比条形图，用于展示各分类在总量中的占比。",
            featureTags: ["Antd百分比条形图", "百分比条形图", "占比分析", "百分比归一化", "横向对比", "数据可视化"],
            applicableScenes: ["占比分析", "转化率比较", "结构对比", "比例展示"],
            capabilities: ["支持百分比归一化", "支持横向百分比展示", "支持占比表达"],
            constraints: ["适合比例型数据", "需要统一口径的总量基准"],
            aliases: ["Bar Chart", "Bar", "Percent Bar"],
            categorize: "chart",
            subCategorize: "bar",
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
  /** isStack 配置。 */
  isStack?: boolean;
  /** 颜色。 */
  color?: string[];
  /** 条形样式。 */
  barStyle?: {
    /** 半径/圆角。 */
    radius?: number;
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
  /** 最大条宽。 */
  maxBarWidth?: number;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
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
        return percentBarImg;
    }

    getInitConfig(): AntdBarProps {
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
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd百分比条形图',
                type: 'AntdPercentBar',
            },
            style: {
                data: data,
                xField: "value",
                yField: "year",
                seriesField: "country",
                isPercent: true,
                isStack: true,
                color: [
                    "#59bfff",
                    "#298aff",
                    "#004294"
                ],
                barStyle: {
                    radius: 5
                },
                xAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 12
                        }
                    },
                    line: {
                        style: {
                            stroke: "#a4a4a473",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "right",
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
                    line: null,
                    tickLine: null,
                    subTickLine: null,
                    position: "bottom",
                    title: null
                },
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
                maxBarWidth: 14,
                supportCSSTransform: true,
                animation: {
                    appear: {
                        animation: "scale-in-x",
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

export default AntdPercentBarDefinition;
