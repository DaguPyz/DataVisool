/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import scatterBubble from "./scatter-bubble.webp";
import AbstractScatterDefinition from "@/comps/antd-common/scatter/AbstractScatterDefinition";
import {AntdScatterProps} from "@/comps/antd-common/scatter/AntdCommonScatterController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdScatterBubbleDefinition extends AbstractScatterDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd气泡图",
            compKey: "AntdScatterBubble",
            categorize: "chart",
            subCategorize: "scatter",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdScatterBubble",
            compName: "Antd气泡图",
            summary: "Antd气泡图，用于展示数据分布、相关性和气泡大小映射。",
            featureTags: ["Antd气泡图", "气泡图", "分布分析", "相关性分析", "数据可视化"],
            applicableScenes: ["分布分析", "相关性分析", "异常点识别", "多变量观察"],
            capabilities: ["支持点大小映射", "支持分布观察", "支持异常点展示"],
            constraints: ["更适合数值型数据", "不适合纯文本或单值指标"],
            aliases: ["Scatter Plot", "Bubble Chart"],
            categorize: "chart",
            subCategorize: "scatter",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** x 配置。 */
      x?: number;
      /** y 配置。 */
      y?: number;
      /** size 配置。 */
      size?: number;
      /** genre 配置。 */
      genre?: string;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** colorField 配置。 */
  colorField?: string;
  /** sizeField 配置。 */
  sizeField?: string;
  /** size 配置。 */
  size?: number[];
  /** shape 配置。 */
  shape?: string;
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
  };
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
  /** 颜色。 */
  color?: string[];
  /** pointStyle 配置。 */
  pointStyle?: {
    /** 线宽。 */
    lineWidth?: number;
  };
}`.trim();
    }


    getChartImg(): string {
        return scatterBubble;
    }

    getInitConfig(): AntdScatterProps {
        const data = [
            {
                x: 42,
                y: 38,
                size: 20,
                genre: "female"
            },
            {
                x: 6,
                y: 18,
                size: 1,
                genre: "female"
            },
            {
                x: 58,
                y: 24,
                size: 20,
                genre: "male"
            },
            {
                x: 78,
                y: 37,
                size: 34,
                genre: "male"
            },
            {
                x: 55,
                y: 56,
                size: 53,
                genre: "male"
            },
            {
                x: 18,
                y: 45,
                size: 70,
                genre: "male"
            },
            {
                x: 42,
                y: 44,
                size: 28,
                genre: "male"
            },
            {
                x: 3,
                y: 52,
                size: 59,
                genre: "male"
            },
            {
                x: 31,
                y: 18,
                size: 97,
                genre: "male"
            },
            {
                x: 79,
                y: 91,
                size: 63,
                genre: "male"
            },
            {
                x: 93,
                y: 23,
                size: 23,
                genre: "male"
            },
            {
                x: 44,
                y: 83,
                size: 22,
                genre: "male"
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd气泡图',
                type: 'AntdScatterBubble',
            },
            style: {
                data,
                xField: "x",
                yField: "y",
                colorField: "genre",
                sizeField: "size",
                size: [
                    5,
                    20
                ],
                shape: "circle",
                xAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 12
                        },
                        offset: 16
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
                        },
                        offset: 5
                    },
                    line: {
                        style: {
                            stroke: "#a2a2a275",
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
                    }
                },
                supportCSSTransform: true,
                animation: {
                    appear: {
                        animation: "fade-in",
                        duration: 3000
                    }
                },
                color: [
                    "l(90) 0:#35b5ff 1:#0073ff",
                    "l(90) 0:#d296ff 1:#008cff"
                ],
                pointStyle: {
                    lineWidth: 0
                }
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdScatterBubbleDefinition;
