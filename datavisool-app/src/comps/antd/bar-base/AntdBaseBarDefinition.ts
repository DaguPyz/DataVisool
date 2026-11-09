/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import baseBarImg from "./base-bar.webp";
import {AntdBarProps} from "@/comps/antd-common/bar/AntdCommonBarController";
import AbstractBarDefinition from "@/comps/antd-common/bar/AbstractBarDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdBaseBarDefinition extends AbstractBarDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd基础条形图",
            compKey: "AntdBaseBar",
            categorize: "chart",
            subCategorize: "bar",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdBaseBar",
            compName: "Antd基础条形图",
            summary: "Antd基础条形图，用于横向比较不同分类的数据大小，适合排行和单指标对比。",
            featureTags: ["Antd基础条形图", "基础条形图", "横向对比", "分类统计", "排行分析", "数据可视化"],
            applicableScenes: ["排行榜", "分类对比", "单指标统计", "横向展示"],
            capabilities: ["支持横向分类比较", "支持单系列展示", "支持字段映射", "支持排序展示"],
            constraints: ["更适合分类型数据", "分类过多时标签容易拥挤"],
            aliases: ["Bar Chart", "Bar"],
            categorize: "chart",
            subCategorize: "bar",
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
  /** 文本/标签配置。 */
  label?: {
    /** style 配置。 */
    style?: {
      /** 文字颜色。 */
      fill?: string;
      /** 字重。 */
      fontWeight?: number;
    };
    /** 位置。 */
    position?: string;
  };
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** 最大条宽。 */
  maxBarWidth?: number;
  /** 颜色。 */
  color?: string[];
  /** 条形样式。 */
  barStyle?: {
    /** 半径/圆角。 */
    radius?: number;
  };
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
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
      /** offset 配置。 */
      offset?: number;
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
        return baseBarImg;
    }

    getInitConfig(): AntdBarProps {
        const data = [
            {
                name: "1951 年",
                value: 48
            },
            {
                name: "1952 年",
                value: 52
            },
            {
                name: "1956 年",
                value: 22
            }
        ]
        return {
            base: {
                id: "",
                name: '基础条形图',
                type: 'AntdBaseBar',
            },
            style: {
                data: data,
                label: {
                    style: {
                        fill: "#ffffff",
                        fontWeight: 500
                    },
                    position: "right"
                },
                xField: "value",
                yField: "name",
                seriesField: "name",
                maxBarWidth: 12,
                color: [
                    "l(135) 0:#43cbff 1:#0090d9",
                    "l(135) 0:#3e95ff 1:#256eff",
                    "l(135) 0:#428bff 1:#7e64ff"
                ],
                barStyle: {
                    radius: 6
                },
                supportCSSTransform: true,
                xAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#d9d9d9",
                            fontSize: 12
                        }
                    },
                    line: {
                        style: {
                            stroke: "#bcbcbc91",
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
                            fill: "#d6d6d6",
                            fontSize: 12
                        },
                        offset: 9
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
                            fill: "#e4e4e4",
                            fontSize: 12
                        }
                    }
                },
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

export default AntdBaseBarDefinition;
