/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import stackBarImg from "./stack-bar.webp";
import {AntdBarProps} from "@/comps/antd-common/bar/AntdCommonBarController";
import AbstractBarDefinition from "@/comps/antd-common/bar/AbstractBarDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdStackBarDefinition extends AbstractBarDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd堆叠条形图",
            compKey: "AntdStackBar",
            categorize: "chart",
            subCategorize: "bar",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdStackBar",
            compName: "Antd堆叠条形图",
            summary: "Antd堆叠条形图，用于展示分类内部组成和累计结果。",
            featureTags: ["Antd堆叠条形图", "堆叠条形图", "累计展示", "横向堆叠", "组成分析", "数据可视化"],
            applicableScenes: ["构成分析", "累计比较", "结构展示", "业务拆分"],
            capabilities: ["支持横向堆叠展示", "支持累计值表达", "支持系列组成分析"],
            constraints: ["适合展示组成关系", "不适合超多系列"],
            aliases: ["Bar Chart", "Bar", "Stacked Bar"],
            categorize: "chart",
            subCategorize: "bar",
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
      /** 类型。 */
      type?: string;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** isStack 配置。 */
  isStack?: boolean;
  /** 最大条宽。 */
  maxBarWidth?: number;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
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
        return stackBarImg;
    }

    getInitConfig(): AntdBarProps {
        const data = [
            {
                year: "1991",
                value: 300,
                type: "Lon"
            },
            {
                year: "1992",
                value: 400,
                type: "Lon"
            },
            {
                year: "1993",
                value: 350,
                type: "Lon"
            },
            {
                year: "1991",
                value: 300,
                type: "Bor"
            },
            {
                year: "1992",
                value: 400,
                type: "Bor"
            },
            {
                year: "1993",
                value: 350,
                type: "Bor"
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd堆叠条形图',
                type: 'AntdStackBar',
            },
            style: {
                data: data,
                xField: "value",
                yField: "year",
                seriesField: "type",
                isStack: true,
                maxBarWidth: 15,
                supportCSSTransform: true,
                color: [
                    "l(180) 0:#398fff 1:#62bbff",
                    "l(180) 0:#e62dff 1:#ac40ff"
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
                            stroke: "#b9b9b980",
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

export default AntdStackBarDefinition;
