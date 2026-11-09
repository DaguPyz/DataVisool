/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import baseColumnImg from "./base-column.webp";
import {AntdColumnProps} from "@/comps/antd-common/column/AntdCommonColumnController";
import AbstractColumnDefinition from "@/comps/antd-common/column/AbstractColumnDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdBaseColumnDefinition extends AbstractColumnDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd基础柱状图",
            compKey: "AntdBaseColumn",
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdBaseColumn",
            compName: "Antd基础柱状图",
            summary: "Antd基础柱状图，用于纵向比较不同分类的数据大小，适合排行和单指标对比。",
            featureTags: ["Antd基础柱状图", "基础柱状图", "纵向对比", "分类统计", "排行分析", "数据可视化"],
            applicableScenes: ["排行榜", "分类对比", "单指标统计", "纵向展示"],
            capabilities: ["支持纵向分类比较", "支持单系列展示", "支持字段映射", "支持排序展示"],
            constraints: ["更适合分类型数据", "分类过多时标签容易拥挤"],
            aliases: ["Column Chart", "Column"],
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** 名称。 */
      name?: string;
      /** 值。 */
      value?: number;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
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
    /** itemSpacing 配置。 */
    itemSpacing?: number;
    /** marker 配置。 */
    marker?: {
      /** 间距。 */
      spacing?: number;
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
      /** 文字颜色。 */
      fill?: string;
    };
    /** Y 偏移。 */
    offsetY?: number;
  };
}`.trim();
    }


    getChartImg(): string {
        return baseColumnImg;
    }

    getInitConfig(): AntdColumnProps {
        const data = [
            {
                name: "1960 年",
                value: 35
            },
            {
                name: "1965 年",
                value: 42
            },
            {
                name: "1970 年",
                value: 58
            },
            {
                name: "1975 年",
                value: 50
            },
            {
                name: "1980 年",
                value: 44
            }
        ]
        return {
            base: {
                id: "",
                name: 'Antd基础柱状图',
                type: 'AntdBaseColumn',
            },
            style: {
                data: data,
                xField: "name",
                yField: "value",
                seriesField: "name",
                maxColumnWidth: 18,
                supportCSSTransform: true,
                color: [
                    "l(90) 0:#71aaff 1:#008cff"
                ],
                columnStyle: {
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
                            stroke: "#ffffffa3",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "left",
                    title: null,
                    tickCount: 4
                },
                legend: {
                    position: "top-right",
                    layout: "horizontal",
                    itemName: {
                        style: {
                            fill: "#f9f5f5",
                            fontSize: 12
                        }
                    },
                    itemSpacing: 3,
                    marker: {
                        spacing: 7
                    }
                },
                animation: {
                    appear: {
                        animation: "scale-in-y",
                        duration: 3000
                    }
                },
                label: {
                    position: "top",
                    style: {
                        fill: "#ffffff"
                    },
                    offsetY: 9
                }
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdBaseColumnDefinition;
