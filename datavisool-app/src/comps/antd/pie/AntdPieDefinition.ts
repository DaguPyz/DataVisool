/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";
import pieImg from './pie.webp';
import AntdPieController, {AntdPieProps} from "./AntdPieController";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdPieConfig = React.lazy(() => import("./AntdPieStyleConfig"));
const AntdPieFieldMapping = React.lazy(() => import("./AntdPieStyleConfig").then((module) => ({default: module.AntdPieFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

class AntdPieDefinition extends AntdCommonDefinition<AntdPieController, AntdPieProps> {

    getController(): ClazzTemplate<AntdPieController> | null {
        return AntdPieController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdPieConfig,
            animation: AnimationConfig,
            mapping: AntdPieFieldMapping
        };
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd饼图",
            compKey: "AntdPie",
            categorize: "chart",
            subCategorize: "pie",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdPie",
            compName: "Antd饼图",
            summary: "Antd饼图，用于图表数据展示和可视化分析。",
            featureTags: ["Antd饼图", "图表", "数据可视化", "指标分析"],
            applicableScenes: ["数据分析", "可视化看板", "趋势观察"],
            capabilities: ["支持数据映射", "支持图表渲染"],
            constraints: [],
            aliases: [],
            categorize: "chart",
            subCategorize: "pie",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** 类型。 */
      type?: string;
      /** 值。 */
      value?: number;
    }>;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** angleField 配置。 */
  angleField?: string;
  /** colorField 配置。 */
  colorField?: string;
  /** 半径/圆角。 */
  radius?: number;
  /** 内半径。 */
  innerRadius?: number;
  /** 起始角度。 */
  startAngle?: number;
  /** 结束角度。 */
  endAngle?: number;
  /** pieStyle 配置。 */
  pieStyle?: {
    /** 描边颜色。 */
    stroke?: string;
    /** 线宽。 */
    lineWidth?: number;
  };
  /** 文本/标签配置。 */
  label?: {
    /** 类型。 */
    type?: string;
    /** offset 配置。 */
    offset?: number;
    /** 显示文案。 */
    content?: string;
    /** 是否自动旋转。 */
    autoRotate?: boolean;
    /** rotate 配置。 */
    rotate?: number;
    /** style 配置。 */
    style?: {
      /** textAlign 配置。 */
      textAlign?: string;
      /** 字号。 */
      fontSize?: number;
      /** 字重。 */
      fontWeight?: number;
      /** 文字颜色。 */
      fill?: string;
      /** 描边颜色。 */
      stroke?: string;
    };
    /** 引导线配置。 */
    labelLine?: boolean;
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
  /** interactions 配置。 */
  interactions?: Array<{
      /** 类型。 */
      type?: string;
    }>;
  /** 统计信息配置。 */
  statistic?: {
    /** 标题配置。 */
    title?: {
      /** style 配置。 */
      style?: {
        /** 字号。 */
        fontSize?: string;
        /** 颜色。 */
        color?: string;
        /** 字重。 */
        fontWeight?: number;
      };
      /** 显示文案。 */
      content?: string;
      /** Y 偏移。 */
      offsetY?: any;
    };
    /** 显示文案。 */
    content?: {
      /** style 配置。 */
      style?: {
        /** 字号。 */
        fontSize?: string;
        /** 颜色。 */
        color?: string;
        /** 字重。 */
        fontWeight?: number;
      };
      /** 显示文案。 */
      content?: string;
      /** Y 偏移。 */
      offsetY?: number;
      /** X 偏移。 */
      offsetX?: any;
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
  /** 颜色。 */
  color?: string[];
}`.trim();
    }


    getChartImg(): string | null {
        return pieImg;
    }

    getInitConfig(): AntdPieProps {
        const data = [
            {type: 'sort1', value: 30},
            {type: 'sort2', value: 25},
            {type: 'sort3', value: 20},
            {type: 'sort4', value: 25}
        ];
        return {
            base: {
                id: "",
                name: 'Antd饼图',
                type: 'AntdPie',
            },
            style: {
                data: data,
                supportCSSTransform: true,
                angleField: "value",
                colorField: "type",
                radius: 0.7,
                innerRadius: 0.6,
                startAngle: 0,
                endAngle: 6.283185307179586,
                pieStyle: {
                    stroke: "#fff",
                    lineWidth: 0,
                },
                label: {
                    type: "outer",
                    offset: 27,
                    content: "{name} {percentage}",
                    autoRotate: true,
                    rotate: 0,
                    style: {
                        textAlign: "center",
                        fontSize: 12,
                        fontWeight: 400,
                        fill: "#ffffff",
                        stroke: "#f10d0d"
                    },
                    labelLine: false
                },
                legend: {
                    position: "right",
                    layout: "vertical",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 14
                        }
                    }
                },
                interactions: [
                    {
                        type: "element-selected"
                    },
                    {
                        type: "element-active"
                    }
                ],
                statistic: {
                    title: {
                        style: {
                            fontSize: '12',
                            color: "#ffffff",
                            fontWeight: 300
                        },
                        content: "总计",
                        offsetY: -6
                    },
                    content: {
                        style: {
                            fontSize: "16px",
                            color: "#ffffff",
                            fontWeight: 400
                        },
                        content: "100",
                        offsetY: 2,
                        offsetX: -2
                    }
                },
                animation: {
                    appear: {
                        animation: "wave-in",
                        duration: 3000
                    }
                },
                color: [
                    "l(90) 0:#4ca9ff 1:#0082d9",
                    "l(90) 0:#8f4dff 1:#f0b3fc",
                    "l(90) 0:#ff5e62 1:#ff9966",
                    "l(90) 0:#28f7ac 1:#348ac7"
                ]
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdPieDefinition;
