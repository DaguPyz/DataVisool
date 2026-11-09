/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import rangeColumnImg from "./range-column.webp";
import {AntdColumnProps} from "@/comps/antd-common/column/AntdCommonColumnController";
import AbstractColumnDefinition from "@/comps/antd-common/column/AbstractColumnDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdRangeColumnDefinition extends AbstractColumnDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd区间柱状图",
            compKey: "AntdRangeColumn",
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdRangeColumn",
            compName: "Antd区间柱状图",
            summary: "Antd区间柱状图，用于展示数值范围、起止区间和跨度比较。",
            featureTags: ["Antd区间柱状图", "区间柱状图", "区间展示", "范围分析", "纵向范围", "数据可视化"],
            applicableScenes: ["价格区间", "工期范围", "跨度比较", "范围观察"],
            capabilities: ["支持起止区间表达", "支持纵向范围比较", "支持跨度分析"],
            constraints: ["需要明确的起止值", "不适合单值指标"],
            aliases: ["Column Chart", "Column", "Range Column"],
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** 类型。 */
      type?: string;
      /** values 配置。 */
      values?: number[];
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** isRange 配置。 */
  isRange?: boolean;
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
    /** itemSpacing 配置。 */
    itemSpacing?: number;
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
      /** 文字颜色。 */
      fill?: string;
      /** 字号。 */
      fontSize?: number;
    };
  };
}`.trim();
    }


    getChartImg(): string {
        return rangeColumnImg;
    }

    getInitConfig(): AntdColumnProps {
        const data = [
            {
                type: "sort1",
                values: [
                    30,
                    150
                ]
            },
            {
                type: "sort2",
                values: [
                    40,
                    160
                ]
            },
            {
                type: "sort3",
                values: [
                    50,
                    165
                ]
            },
            {
                type: "sort4",
                values: [
                    60,
                    120
                ]
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd区间柱状图',
                type: 'AntdRangeColumn',
            },
            style: {
                data: [
                    {
                        type: "sort1",
                        values: [
                            30,
                            150
                        ]
                    },
                    {
                        type: "sort2",
                        values: [
                            40,
                            160
                        ]
                    },
                    {
                        type: "sort3",
                        values: [
                            50,
                            165
                        ]
                    },
                    {
                        type: "sort4",
                        values: [
                            60,
                            120
                        ]
                    }
                ],
                xField: "type",
                yField: "values",
                seriesField: "type",
                isRange: true,
                maxColumnWidth: 16,
                supportCSSTransform: true,
                color: [
                    "l(90) 0:#6e86ff 1:#007ccf"
                ],
                columnStyle: {
                    radius: 10
                },
                xAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 14
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
                            fontSize: 14
                        }
                    },
                    line: {
                        style: {
                            stroke: "#9e9e9e91",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "left",
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
                    },
                    itemSpacing: 7
                },
                animation: {
                    appear: {
                        animation: "scale-in-y",
                        duration: 3000
                    }
                },
                label: {
                    position: "middle",
                    style: {
                        fill: "#ffffff",
                        fontSize: 10
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

export default AntdRangeColumnDefinition;
