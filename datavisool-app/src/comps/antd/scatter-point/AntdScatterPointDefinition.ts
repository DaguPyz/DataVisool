/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import scatterPoint from "./scatter-point.webp";
import AbstractScatterDefinition from "@/comps/antd-common/scatter/AbstractScatterDefinition";
import {AntdScatterProps} from "@/comps/antd-common/scatter/AntdCommonScatterController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdScatterPointDefinition extends AbstractScatterDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd散点图",
            compKey: "AntdScatterPoint",
            categorize: "chart",
            subCategorize: "scatter",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdScatterPoint",
            compName: "Antd散点图",
            summary: "Antd散点图，用于展示数据分布、相关性和异常点。",
            featureTags: ["Antd散点图", "散点图", "分布分析", "相关性分析", "数据可视化"],
            applicableScenes: ["分布分析", "相关性分析", "异常点识别", "多变量观察"],
            capabilities: ["支持点位分布", "支持异常点观察", "支持X/Y字段映射"],
            constraints: ["更适合数值型数据", "不适合纯文本或单值指标"],
            aliases: ["Scatter Plot"],
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
      /** 类型。 */
      type?: string;
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
  size?: number;
  /** shape 配置。 */
  shape?: string;
  /** pointStyle 配置。 */
  pointStyle?: {
    /** fillOpacity 配置。 */
    fillOpacity?: number;
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
}`.trim();
    }


    getChartImg(): string {
        return scatterPoint;
    }

    getInitConfig(): AntdScatterProps {
        const data = [
            {
                x: 1,
                y: 23,
                type: "one",
            },
            {
                x: 2,
                y: 15,
                type: "two",
            },
            {
                x: 3,
                y: 17,
                type: "three",
            },
            {
                x: 4,
                y: 48,
                type: "four",
            },
            {
                x: 5,
                y: 8,
                type: "five",
            },
        ];
        return {
            base: {
                id: "",
                name: 'Antd散点图',
                type: 'AntdScatterPoint',
            },
            style: {
                data,
                xField: "x",
                yField: "y",
                colorField: "type",
                sizeField: "y",
                size: 17,
                shape: "circle",
                pointStyle: {
                    fillOpacity: 1,
                    lineWidth: 0
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
                            stroke: "#a4a4a470",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "bottom",
                    title: null,
                    tickCount: 3
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
                    tickCount: 4
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
                    "#00b7ffff",
                    "#006d98ff"
                ]
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdScatterPointDefinition;
