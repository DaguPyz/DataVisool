/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import groupColumnImg from "./group-column.webp";
import AbstractColumnDefinition from "@/comps/antd-common/column/AbstractColumnDefinition";
import {AntdColumnProps} from "@/comps/antd-common/column/AntdCommonColumnController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdGroupColumnDefinition extends AbstractColumnDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd分组柱状图",
            compKey: "AntdGroupColumn",
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdGroupColumn",
            compName: "Antd分组柱状图",
            summary: "Antd分组柱状图，用于同一分类下多个系列的纵向并列对比。",
            featureTags: ["Antd分组柱状图", "分组柱状图", "分组对比", "纵向多系列", "分类比较", "数据可视化"],
            applicableScenes: ["多系列对比", "分类比较", "分组统计", "业务分析"],
            capabilities: ["支持多系列纵向并列展示", "支持图例区分", "支持分类比较"],
            constraints: ["适合少量系列的分类对比", "系列过多时可读性下降"],
            aliases: ["Column Chart", "Column", "Grouped Column"],
            categorize: "chart",
            subCategorize: "column",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** 文本/标签配置。 */
      label?: string;
      /** 类型。 */
      type?: string;
      /** 值。 */
      value?: number;
    }>;
  /** isGroup 配置。 */
  isGroup?: boolean;
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
    /** itemMarginBottom 配置。 */
    itemMarginBottom?: number;
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
      /** 字号。 */
      fontSize?: number;
      /** 文字颜色。 */
      fill?: string;
    };
    /** X 偏移。 */
    offsetX?: number;
    /** Y 偏移。 */
    offsetY?: number;
  };
}`.trim();
    }


    getChartImg(): string {
        return groupColumnImg;
    }

    getInitConfig(): AntdColumnProps {
        const data = [
            {
                label: "Mon.",
                type: "series1",
                value: 1860
            },
            {
                label: "Mon.",
                type: "series2",
                value: 2260
            },
            {
                label: "Tues.",
                type: "series1",
                value: 1800
            },
            {
                label: "Tues.",
                type: "series2",
                value: 1300
            },
            {
                label: "Wed.",
                type: "series1",
                value: 950
            },
            {
                label: "Wed.",
                type: "series2",
                value: 900
            }
        ];
        return {
            base: {
                id: "",
                name: "Antd分组柱状图",
                type: "AntdGroupColumn",
            },
            style: {
                data: data,
                isGroup: true,
                xField: "label",
                yField: "value",
                seriesField: "type",
                maxColumnWidth: 16,
                supportCSSTransform: true,
                color: [
                    "l(90) 0:#51aeff 1:#006fb4",
                    "l(90) 0:#9f5fff 1:#535eff"
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
                    position: "left",
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
                            stroke: "#b3b3b37d",
                            lineWidth: 1
                        }
                    },
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
                            fill: "#fdfdfd",
                            fontSize: 14
                        }
                    },
                    itemMarginBottom: 0
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
                        fontSize: 10,
                        fill: "#ffffff"
                    },
                    offsetX: 0,
                    offsetY: 8
                }
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdGroupColumnDefinition;
