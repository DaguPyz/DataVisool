/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import percentColumnImg from "./percent-column.webp";
import AbstractColumnDefinition from "@/comps/antd-common/column/AbstractColumnDefinition";
import {AntdColumnProps} from "@/comps/antd-common/column/AntdCommonColumnController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdPercentColumnDefinition extends AbstractColumnDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd百分比柱状图",
            compKey: "AntdPercentColumn",
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdPercentColumn",
            compName: "Antd百分比柱状图",
            summary: "Antd百分比柱状图，用于展示各分类在总量中的占比。",
            featureTags: ["Antd百分比柱状图", "百分比柱状图", "占比分析", "百分比归一化", "纵向对比", "数据可视化"],
            applicableScenes: ["占比分析", "转化率比较", "结构对比", "比例展示"],
            capabilities: ["支持百分比归一化", "支持纵向百分比展示", "支持占比表达"],
            constraints: ["适合比例型数据", "需要统一口径的总量基准"],
            aliases: ["Column Chart", "Column", "Percent Column"],
            categorize: "chart",
            subCategorize: "column",
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
  /** 最大柱宽。 */
  maxColumnWidth?: number;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** 颜色。 */
  color?: string[];
  /** 柱体样式。 */
  columnStyle?: {
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
  /** 文本/标签配置。 */
  label?: {
    /** 位置。 */
    position?: string;
    /** style 配置。 */
    style?: {
      /** 字号。 */
      fontSize?: number;
    };
  };
}`.trim();
    }


    getChartImg(): string {
        return percentColumnImg;
    }

    getInitConfig(): AntdColumnProps {
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
                name: 'Antd百分比柱状图',
                type: 'AntdPercentColumn',
            },
            style: {
                data: data,
                xField: "year",
                yField: "value",
                seriesField: "country",
                isPercent: true,
                isStack: true,
                maxColumnWidth: 18,
                supportCSSTransform: true,
                color: [
                    "#59bfff",
                    "#298aff",
                    "#004294"
                ],
                columnStyle: {
                    radius: 6
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
                            stroke: "#7c7c7c",
                            lineWidth: 1
                        }
                    },
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
                    line: null,
                    tickLine: null,
                    subTickLine: null,
                    position: "left",
                    title: null,
                    tickCount: 3
                },
                legend: {
                    position: "top",
                    layout: "horizontal",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 13
                        }
                    }
                },
                animation: {
                    appear: {
                        animation: "scale-in-y",
                        duration: 3000
                    }
                },
                label: {
                    position: "left",
                    style: {
                        fontSize: 0
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

export default AntdPercentColumnDefinition;
