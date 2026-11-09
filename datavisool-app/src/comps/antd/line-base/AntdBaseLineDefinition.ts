/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import baseLineImg from "./base-line.webp";
import AbstractLineDefinition from "@/comps/antd-common/line/AbstractLineDefinition";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";


class AntdBaseLineDefinition extends AbstractLineDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd基础折线图",
            compKey: "AntdBaseLine",
            categorize: "chart",
            subCategorize: "line",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdBaseLine",
            compName: "Antd基础折线图",
            summary: "Antd基础折线图，用于展示时间序列变化和趋势走向。",
            featureTags: ["Antd基础折线图", "基础折线图", "趋势分析", "时间序列", "数据可视化"],
            applicableScenes: ["时间序列分析", "趋势监控", "多系列对比", "运营看板"],
            capabilities: ["支持平滑曲线", "支持趋势变化", "支持X/Y字段映射"],
            constraints: ["更适合连续型数据", "不适合一次性离散分类过多的场景"],
            aliases: ["Line Chart", "Line"],
            categorize: "chart",
            subCategorize: "line",
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
  /** 是否平滑。 */
  smooth?: boolean;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** 颜色。 */
  color?: string;
  /** 数据点配置。 */
  point?: {
    /** size 配置。 */
    size?: number;
    /** 颜色。 */
    color?: string;
    /** shape 配置。 */
    shape?: string;
    /** style 配置。 */
    style?: {
      /** 线宽。 */
      lineWidth?: number;
      /** 描边颜色。 */
      stroke?: string;
    };
  };
  /** lineStyle 配置。 */
  lineStyle?: {
    /** 线宽。 */
    lineWidth?: number;
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
      /** 字重。 */
      fontWeight?: number;
    };
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
        return baseLineImg;
    }

    getInitConfig(): AntdLineProps {
        const data = [
            {
                name: "1990",
                value: 525
            },
            {
                name: "1991",
                value: 459
            },
            {
                name: "1992",
                value: 357
            },
            {
                name: "1993",
                value: 414
            },
            {
                name: "1994",
                value: 234
            },
            {
                name: "1995",
                value: 250
            },
            {
                name: "1996",
                value: 156
            }
        ];
        return {
            base: {
                id: "",
                name: '基础折线图',
                type: 'AntdBaseLine',
            },
            style: {
                data: data,
                xField: "name",
                yField: "value",
                smooth: true,
                supportCSSTransform: true,
                color: "l(90) 0:#2f82ff 1:#cd4dff",
                point: {
                    size: 6,
                    color: "l(90) 0:#4995ff 1:#d176ff",
                    shape: "circle",
                    style: {
                        lineWidth: 0,
                        stroke: "#00d7ff"
                    }
                },
                lineStyle: {
                    lineWidth: 4
                },
                label: {
                    position: "middle",
                    style: {
                        fill: "#ffffff",
                        fontSize: 10,
                        fontWeight: 400
                    }
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
                    title: null,
                    tickCount: 4
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
                            stroke: "#9e9e9e7d",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "left",
                    title: null,
                    tickCount: 4
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

export default AntdBaseLineDefinition;
