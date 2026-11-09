/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import baseRoseImg from "./base-rose.webp";
import AbstractRoseDefinition from "@/comps/antd-common/rose/AbstractRoseDefinition";
import {AntdRoseProps} from "@/comps/antd-common/rose/AntdCommonRoseController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdBaseRoseDefinition extends AbstractRoseDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd基础玫瑰图",
            compKey: "AntdBaseRose",
            categorize: "chart",
            subCategorize: "rose",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdBaseRose",
            compName: "Antd基础玫瑰图",
            summary: "Antd基础玫瑰图，用于展示极坐标下的分类占比和视觉对比。",
            featureTags: ["Antd基础玫瑰图", "玫瑰图", "占比分析", "极坐标", "数据可视化"],
            applicableScenes: ["占比分析", "分类对比", "周期性分布", "视觉化比较"],
            capabilities: ["支持极坐标布局", "支持分类占比表达", "支持视觉对比"],
            constraints: ["适合分类占比型数据", "不适合维度过多的数值分析"],
            aliases: ["Rose Chart", "Polar Chart"],
            categorize: "chart",
            subCategorize: "rose",
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
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** 半径/圆角。 */
  radius?: number;
  /** 内半径。 */
  innerRadius?: number;
  /** 内边距。 */
  padding?: number[];
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** sectorStyle 配置。 */
  sectorStyle?: {
    /** 描边颜色。 */
    stroke?: string;
    /** 线宽。 */
    lineWidth?: number;
  };
  /** 文本/标签配置。 */
  label?: {
    /** style 配置。 */
    style?: {
      /** 文字颜色。 */
      fill?: string;
      /** 字号。 */
      fontSize?: number;
    };
    /** 是否自动旋转。 */
    autoRotate?: boolean;
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
    /** itemSpacing 配置。 */
    itemSpacing?: number;
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


    getChartImg(): string {
        return baseRoseImg;
    }

    getInitConfig(): AntdRoseProps {
        const data = [
            {type: 'sort1', value: 27},
            {type: 'sort2', value: 25},
            {type: 'sort3', value: 18},
            {type: 'sort4', value: 15}
        ];
        return {
            base: {
                id: "",
                name: 'Antd基础玫瑰图',
                type: 'AntdBaseRose',
            },
            style: {
                data,
                xField: "type",
                yField: "value",
                seriesField: "type",
                radius: 1,
                innerRadius: 0,
                padding: [
                    50,
                    0,
                    0,
                    0
                ],
                supportCSSTransform: true,
                sectorStyle: {
                    stroke: "#fff",
                    lineWidth: 0
                },
                label: {
                    style: {
                        fill: "#ffffff",
                        fontSize: 16
                    },
                    autoRotate: true
                },
                legend: {
                    position: "left",
                    layout: "vertical",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 14
                        }
                    },
                    itemSpacing: 0
                },
                animation: {
                    appear: {
                        animation: "grow-in-xy",
                        duration: 3000
                    }
                },
                color: [
                    "#0091ffff",
                    "#68beffff",
                    "#b4e0ffff",
                    "#408ec9ff"
                ]
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdBaseRoseDefinition;
