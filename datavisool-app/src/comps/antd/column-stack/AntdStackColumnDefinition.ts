/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import stackColumnImg from "./stack-column.webp";
import AbstractColumnDefinition from "@/comps/antd-common/column/AbstractColumnDefinition";
import {AntdColumnProps} from "@/comps/antd-common/column/AntdCommonColumnController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdStackColumnDefinition extends AbstractColumnDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd堆叠柱状图",
            compKey: "AntdStackColumn",
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdStackColumn",
            compName: "Antd堆叠柱状图",
            summary: "Antd堆叠柱状图，用于展示分类内部组成和累计结果。",
            featureTags: ["Antd堆叠柱状图", "堆叠柱状图", "累计展示", "纵向堆叠", "组成分析", "数据可视化"],
            applicableScenes: ["构成分析", "累计比较", "结构展示", "业务拆分"],
            capabilities: ["支持纵向堆叠展示", "支持累计值表达", "支持系列组成分析"],
            constraints: ["适合展示组成关系", "不适合超多系列"],
            aliases: ["Column Chart", "Column", "Stacked Column"],
            categorize: "chart",
            subCategorize: "column",
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
        return stackColumnImg;
    }

    getInitConfig(): AntdColumnProps {
        const data = [
            {
                year: "1991",
                value: 3.4,
                type: "Lon"
            },
            {
                year: "1992",
                value: 4,
                type: "Lon"
            },
            {
                year: "1993",
                value: 3.5,
                type: "Lon"
            },
            {
                year: "1991",
                value: 3,
                type: "Bor"
            },
            {
                year: "1992",
                value: 4,
                type: "Bor"
            },
            {
                year: "1993",
                value: 3.5,
                type: "Bor"
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd堆叠柱状图',
                type: 'AntdStackColumn',
            },
            style: {
                data: data,
                xField: "year",
                yField: "value",
                seriesField: "type",
                isStack: true,
                maxColumnWidth: 16,
                supportCSSTransform: true,
                color: [
                    "#9000ff",
                    "#298aff"
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
                            stroke: "#9e9e9e75",
                            lineWidth: 1
                        }
                    },
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
                            fontSize: 14
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

export default AntdStackColumnDefinition;
