/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import stepLineImg from "./step-line.webp";
import AbstractLineDefinition from "@/comps/antd-common/line/AbstractLineDefinition";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";


class AntdStepLineDefinition extends AbstractLineDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd阶梯折线图",
            compKey: "AntdStepLine",
            categorize: "chart",
            subCategorize: "line",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdStepLine",
            compName: "Antd阶梯折线图",
            summary: "Antd阶梯折线图，用于展示阶段性变化、阶梯式增长和离散跳变。",
            featureTags: ["Antd阶梯折线图", "阶梯折线图", "阶段变化", "趋势分析", "数据可视化"],
            applicableScenes: ["阶段性变化", "指标跳变", "趋势监控", "离散过程分析"],
            capabilities: ["支持阶梯曲线", "支持离散跳变表达", "支持时间序列对比"],
            constraints: ["适合离散变化场景", "不适合追求平滑趋势的场景"],
            aliases: ["Line Chart", "Step Line"],
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
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** 阶梯类型。 */
  stepType?: string;
  /** 颜色。 */
  color?: string;
  /** 是否平滑。 */
  smooth?: boolean;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
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
      /** 文字颜色。 */
      fill?: string;
      /** 字号。 */
      fontSize?: number;
    };
    /** Y 偏移。 */
    offsetY?: any;
    /** X 偏移。 */
    offsetX?: any;
  };
}`.trim();
    }


    getChartImg(): string {
        return stepLineImg;
    }


    getInitConfig(): AntdLineProps {
        const data = [
            {
                year: "1991",
                value: 3
            },
            {
                year: "1992",
                value: 4
            },
            {
                year: "1993",
                value: 3.5
            },
            {
                year: "1994",
                value: 5
            },
            {
                year: "1995",
                value: 4.9
            },
            {
                year: "1996",
                value: 6
            },
            {
                year: "1997",
                value: 7
            },
            {
                year: "1998",
                value: 9
            },
            {
                year: "1999",
                value: 13
            },
            {
                year: "1999",
                value: 8
            }
        ];
        return {
            base: {
                id: "",
                name: '阶梯折线图',
                type: 'AntdStepLine',
            },
            style: {
                data: data,
                xField: "year",
                yField: "value",
                stepType: "vh",
                color: "l(90) 0:#2e88ff 1:#b95eff",
                smooth: true,
                supportCSSTransform: true,
                point: {
                    size: 0,
                    color: "#00d7ff",
                    shape: "bowtie",
                    style: {
                        lineWidth: 0,
                        stroke: "#00d7ff"
                    }
                },
                lineStyle: {
                    lineWidth: 5
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
                    tickCount: 5
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
                            stroke: "#9a9a9a8c",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    position: "left",
                    title: null
                },
                legend: {
                    position: "right-top",
                    layout: "vertical",
                    itemName: {
                        style: {
                            fill: "#00f0ffff",
                            fontSize: 12
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
                    position: "top",
                    style: {
                        fill: "#ffffff",
                        fontSize: 10
                    },
                    offsetY: -11,
                    offsetX: -6
                }
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdStepLineDefinition;
