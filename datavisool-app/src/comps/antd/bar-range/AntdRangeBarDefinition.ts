/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import rangeBarImg from "./range-bar.webp";
import {AntdBarProps} from "@/comps/antd-common/bar/AntdCommonBarController";
import AbstractBarDefinition from "@/comps/antd-common/bar/AbstractBarDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdRangeBarDefinition extends AbstractBarDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd区间条形图",
            compKey: "AntdRangeBar",
            categorize: "chart",
            subCategorize: "bar",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdRangeBar",
            compName: "Antd区间条形图",
            summary: "Antd区间条形图，用于展示数值范围、起止区间和跨度比较。",
            featureTags: ["Antd区间条形图", "区间条形图", "区间展示", "范围分析", "横向范围", "数据可视化"],
            applicableScenes: ["价格区间", "工期范围", "跨度比较", "范围观察"],
            capabilities: ["支持起止区间表达", "支持横向范围比较", "支持跨度分析"],
            constraints: ["需要明确的起止值", "不适合单值指标"],
            aliases: ["Bar Chart", "Bar", "Range Bar"],
            categorize: "chart",
            subCategorize: "bar",
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
    /** itemSpacing 配置。 */
    itemSpacing?: number;
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
        return rangeBarImg;
    }

    getInitConfig(): AntdBarProps {
        const data =  [
            {
                type: "sort1",
                values: [
                    16,
                    130
                ]
            },
            {
                type: "sort2",
                values: [
                    26,
                    135
                ]
            },
            {
                type: "sort3",
                values: [
                    36,
                    110
                ]
            },
            {
                type: "sort4",
                values: [
                    20,
                    110
                ]
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd区间条形图',
                type: 'AntdRangeBar',
            },
            style: {
                data: [
                    {
                        type: "sort1",
                        values: [
                            16,
                            130
                        ]
                    },
                    {
                        type: "sort2",
                        values: [
                            26,
                            135
                        ]
                    },
                    {
                        type: "sort3",
                        values: [
                            36,
                            110
                        ]
                    },
                    {
                        type: "sort4",
                        values: [
                            20,
                            110
                        ]
                    }
                ],
                xField: "values",
                yField: "type",
                seriesField: "type",
                isRange: true,
                color: [
                    "#2ea4ffff",
                    "#7cdaffff",
                    "#6cc2ffff"
                ],
                barStyle: {
                    radius: 5
                },
                xAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 14
                        }
                    },
                    line: {
                        style: {
                            stroke: "#b9b9b975",
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
                            fontSize: 14
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
                    },
                    itemSpacing: 2
                },
                maxBarWidth: 12,
                supportCSSTransform: true,
                animation: {
                    appear: {
                        animation: "scale-in-x",
                        duration: 3000
                    }
                },
                label: {
                    position: "top",
                    style: {
                        fill: "#cccccc",
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

export default AntdRangeBarDefinition;
