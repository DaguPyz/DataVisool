/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import groupBarImg from "./group-bar.webp";
import {AntdBarProps} from "@/comps/antd-common/bar/AntdCommonBarController";
import AbstractBarDefinition from "@/comps/antd-common/bar/AbstractBarDefinition";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdGroupBarDefinition extends AbstractBarDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd分组条形图",
            compKey: "AntdGroupBar",
            categorize: "chart",
            subCategorize: "bar",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdGroupBar",
            compName: "Antd分组条形图",
            summary: "Antd分组条形图，用于同一分类下多个系列的横向并列对比。",
            featureTags: ["Antd分组条形图", "分组条形图", "分组对比", "横向多系列", "分类比较", "数据可视化"],
            applicableScenes: ["多系列对比", "分类比较", "分组统计", "业务分析"],
            capabilities: ["支持多系列横向并列展示", "支持图例区分", "支持分类比较"],
            constraints: ["适合少量系列的分类对比", "系列过多时可读性下降"],
            aliases: ["Bar Chart", "Bar", "Horizontal Grouped Bar"],
            categorize: "chart",
            subCategorize: "bar",
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
        return groupBarImg;
    }

    getInitConfig(): AntdBarProps {
        const data = [
            {
                label: "Mon.",
                type: "series1",
                value: 2120
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
                name: "Antd分组条形图",
                type: "AntdGroupBar",
            },
            style: {
                data: data,
                isGroup: true,
                xField: "value",
                yField: "label",
                seriesField: "type",
                color: [
                    "#00a6ffff",
                    "#5dd1ffff"
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
                            stroke: "#a2a2a273",
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
                maxBarWidth: 11,
                supportCSSTransform: true,
                animation: {
                    appear: {
                        animation: "scale-in-x",
                        duration: 3000
                    }
                },
                label: {
                    position: "right",
                    style: {
                        fill: "#efefef",
                        fontSize: 10
                    }
                }
            },
            filter: {
                enable: false,
                blur: 0,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 0
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdGroupBarDefinition;
