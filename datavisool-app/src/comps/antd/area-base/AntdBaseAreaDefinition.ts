/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import baseAreaImg from "./base-area.webp";
import AbstractAreaDefinition from "@/comps/antd-common/area/AbstractAreaDefinition";
import {AntdAreaProps} from "@/comps/antd-common/area/AntdCommonAreaController";
import React from "react";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";

const AntdBaseAreaStyleConfig = React.lazy(() => import("./AntdBaseAreaConfig").then((module) => ({default: module.AntdBaseAreaStyleConfig})));
const AntdBaseAreaFieldMapping = React.lazy(() => import("./AntdBaseAreaConfig").then((module) => ({default: module.AntdBaseAreaFieldMapping})));

class AntdBaseAreaDefinition extends AbstractAreaDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd基础面积图",
            compKey: "AntdBaseArea",
            categorize: "chart",
            subCategorize: "area"
        };
    }

        getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdBaseArea",
            compName: "Antd基础面积图",
            summary: "Antd基础面积图，用于展示趋势变化、累计走势和连续数据分布。",
            featureTags: ["Antd基础面积图", "基础面积图", "趋势分析", "连续数据", "累计展示", "数据可视化"],
            applicableScenes: ["趋势分析", "时间序列展示", "运营看板", "累计走势观察"],
            capabilities: ["支持平滑曲线", "支持面积填充", "支持点标记", "支持X/Y字段映射", "支持标签显示"],
            constraints: ["更适合连续数值型数据", "不适合离散分类过多的场景"],
            aliases: ["Area Chart", "Area"],
            categorize: "chart",
            subCategorize: "area",
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
  /** 文本/标签配置。 */
  label?: {
    /** 位置。 */
    position?: string;
    /** Y 偏移。 */
    offsetY?: any;
    /** style 配置。 */
    style?: {
      /** 文字颜色。 */
      fill?: string;
      /** 字号。 */
      fontSize?: number;
    };
  };
  /** 是否平滑。 */
  smooth?: boolean;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** isStack 配置。 */
  isStack?: boolean;
  /** startOnZero 配置。 */
  startOnZero?: boolean;
  /** 数据点配置。 */
  point?: {
    /** size 配置。 */
    size?: number;
    /** style 配置。 */
    style?: {
      /** 填充颜色。 */
      fill?: string;
      /** 描边颜色。 */
      stroke?: string;
      /** 线宽。 */
      lineWidth?: number;
    };
  };
  /** 线条配置。 */
  line?: {
    /** 颜色。 */
    color?: string;
    /** size 配置。 */
    size?: number;
  };
  /** 面积填充样式。 */
  areaStyle?: {
    /** fillOpacity 配置。 */
    fillOpacity?: number;
    /** 填充颜色。 */
    fill?: string;
  };
  /** X 轴配置。 */
  xAxis?: {
    /** range 配置。 */
    range?: number[];
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
    /** 标题配置。 */
    title?: any;
    /** 位置。 */
    position?: string;
  };
  /** Y 轴配置。 */
  yAxis?: {
    /** tickCount 配置。 */
    tickCount?: number;
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
        return baseAreaImg;
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuToConfigContentMap = super.getMenuToConfigContentMap();
        menuToConfigContentMap!['style'] = AntdBaseAreaStyleConfig;
        menuToConfigContentMap!['mapping'] = AntdBaseAreaFieldMapping;
        return menuToConfigContentMap;
    }

    getInitConfig(): AntdAreaProps {
        const data = [
            {
                name: "Q1",
                value: 12
            },
            {
                name: "Q2",
                value: 30
            },
            {
                name: "Q3",
                value: 45
            },
            {
                name: "Q4",
                value: 60
            },
            {
                name: "Q5",
                value: 230
            },
            {
                name: "Q6",
                value: 84
            },
            {
                name: "Q7",
                value: 160
            },
            {
                name: "Q8",
                value: 76
            },
            {
                name: "Q9",
                value: 50
            },
            {
                name: "Q10",
                value: 48
            },
            {
                name: "Q11",
                value: 83
            },
            {
                name: "Q12",
                value: 75
            },
            {
                name: "Q13",
                value: 77
            },
            {
                name: "Q14",
                value: 82
            },
            {
                name: "Q15",
                value: 47
            },
            {
                name: "Q16",
                value: 86
            },
            {
                name: "Q17",
                value: 54
            },
            {
                name: "Q18",
                value: 45
            },
            {
                name: "Q19",
                value: 25
            },
            {
                name: "Q20",
                value: 22
            }
        ];
        return {
            base: {
                id: "",
                name: '基础面积图',
                type: 'AntdBaseArea',
            },
            style: {
                data: data,
                xField: "name",
                yField: "value",
                label: {
                    position: "top",
                    offsetY: -4,
                    style: {
                        fill: "#ffffff",
                        fontSize: 14
                    },
                },
                smooth: true,
                supportCSSTransform: true,
                isStack: false,
                isPercent: false,
                startOnZero: false,
                point: {
                    size: 0,
                    style: {
                        fill: "#205e9a",
                        stroke: "#ffffff",
                        lineWidth: 0
                    }
                },
                line: {
                    color: "r(0.5,0.5,1) 0.55:#00aaff 1:#004074",
                    size: 1.5
                },
                areaStyle: {
                    fillOpacity: 1,
                    fill: "l(90) 0:#016eb7 0.85:#0964a133"
                },
                xAxis: {
                    range: [0, 1],
                    grid: null,
                    label: {
                        style: {
                            fill: "#fff",
                            fontSize: 10
                        }
                    },
                    line: {
                        style: {
                            stroke: "#c7c7c76e",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    title: null,
                    position: "bottom"
                },
                yAxis: {
                    tickCount: 3,
                    grid: null,
                    label: {
                        style: {
                            fill: "#fff",
                            fontSize: 10
                        }
                    },
                    line: null,
                    tickLine: null,
                    subTickLine: null,
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

export default AntdBaseAreaDefinition;
