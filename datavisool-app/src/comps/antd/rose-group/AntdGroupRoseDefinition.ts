/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import groupRoseImg from "./group-rose.webp";
import AbstractRoseDefinition from "@/comps/antd-common/rose/AbstractRoseDefinition";
import {AntdRoseProps} from "@/comps/antd-common/rose/AntdCommonRoseController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdGroupRoseDefinition extends AbstractRoseDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd分组玫瑰图",
            compKey: "AntdGroupRose",
            categorize: "chart",
            subCategorize: "rose",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdGroupRose",
            compName: "Antd分组玫瑰图",
            summary: "Antd分组玫瑰图，用于同一维度下多个系列的极坐标并列对比。",
            featureTags: ["Antd分组玫瑰图", "分组玫瑰图", "分组对比", "极坐标", "数据可视化"],
            applicableScenes: ["分类比较", "多系列对比", "结构分析", "视觉化比较"],
            capabilities: ["支持极坐标并列展示", "支持多系列区分", "支持分类占比表达"],
            constraints: ["适合维度较少的比较场景", "不适合过多分类"],
            aliases: ["Rose Chart", "Grouped Rose"],
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
      /** user 配置。 */
      user?: string;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** isGroup 配置。 */
  isGroup?: boolean;
  /** seriesField 配置。 */
  seriesField?: string;
  /** 内边距。 */
  padding?: number[];
  /** 半径/圆角。 */
  radius?: number;
  /** 内半径。 */
  innerRadius?: number;
  /** 起始角度。 */
  startAngle?: number;
  /** 结束角度。 */
  endAngle?: number;
  /** 文本/标签配置。 */
  label?: {
    /** offset 配置。 */
    offset?: number;
    /** style 配置。 */
    style?: {
      /** 文字颜色。 */
      fill?: string;
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
  /** sectorStyle 配置。 */
  sectorStyle?: {
    /** 线宽。 */
    lineWidth?: number;
  };
}`.trim();
    }


    getChartImg(): string {
        return groupRoseImg;
    }

    getInitConfig(): AntdRoseProps {
        const data = [
            {
                type: "sort1",
                value: 27,
                user: "user1"
            },
            {
                type: "sort2",
                value: 25,
                user: "user2"
            },
            {
                type: "sort3",
                value: 18,
                user: "user1"
            },
            {
                type: "sort4",
                value: 15,
                user: "user2"
            },
            {
                type: "sort5",
                value: 18,
                user: "user1"
            },
            {
                type: "sort6",
                value: 20,
                user: "user2"
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd分组玫瑰图',
                type: 'AntdGroupRose',
            },
            style: {
                data,
                xField: "type",
                yField: "value",
                isGroup: true,
                seriesField: "user",
                padding: [
                    60,
                    0,
                    0,
                    0
                ],
                radius: 1,
                innerRadius: 0.13,
                startAngle: 0,
                endAngle: 6.283185307179586,
                label: {
                    offset: 16,
                    style: {
                        fill: "#ffffff"
                    },
                    autoRotate: false
                },
                legend: {
                    position: "top-left",
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
                        animation: "grow-in-xy",
                        duration: 3000
                    }
                },
                color: [
                    "#00b7ffff",
                    "#81dbffff"
                ],
                sectorStyle: {
                    lineWidth: 0
                }
            },
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdGroupRoseDefinition;
