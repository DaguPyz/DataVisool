/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import stackRoseImg from "./stack-rose.webp";
import AbstractRoseDefinition from "@/comps/antd-common/rose/AbstractRoseDefinition";
import {AntdRoseProps} from "@/comps/antd-common/rose/AntdCommonRoseController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdStackRoseDefinition extends AbstractRoseDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd堆叠玫瑰图",
            compKey: "AntdStackRose",
            categorize: "chart",
            subCategorize: "rose",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdStackRose",
            compName: "Antd堆叠玫瑰图",
            summary: "Antd堆叠玫瑰图，用于展示极坐标下的分类组成和累计关系。",
            featureTags: ["Antd堆叠玫瑰图", "堆叠玫瑰图", "堆叠展示", "极坐标", "数据可视化"],
            applicableScenes: ["构成分析", "累计比较", "极坐标对比", "结构展示"],
            capabilities: ["支持极坐标堆叠", "支持累计展示", "支持分类组成分析"],
            constraints: ["适合少量分类的结构表达", "过多系列会影响可读性"],
            aliases: ["Rose Chart", "Stacked Rose"],
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
  /** isStack 配置。 */
  isStack?: boolean;
  /** seriesField 配置。 */
  seriesField?: string;
  /** 颜色。 */
  color?: string[];
  /** 半径/圆角。 */
  radius?: number;
  /** 内半径。 */
  innerRadius?: number;
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
    /** offset 配置。 */
    offset?: number;
    /** style 配置。 */
    style?: {
      /** 文字颜色。 */
      fill?: string;
      /** 字号。 */
      fontSize?: number;
      /** 字重。 */
      fontWeight?: number;
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
        return stackRoseImg;
    }

    getInitConfig(): AntdRoseProps {
        const data = [
            {
                type: 'sort1',
                value: 27,
                user: 'user1',
            },
            {
                type: 'sort2',
                value: 25,
                user: 'user1',
            },
            {
                type: 'sort3',
                value: 18,
                user: 'user1',
            },
            {
                type: 'sort4',
                value: 15,
                user: 'user1',
            },
            {
                type: 'sort5',
                value: 10,
                user: 'user1',
            },
            {
                type: 'sort1',
                value: 7,
                user: 'user2',
            },
            {
                type: 'sort2',
                value: 5,
                user: 'user2',
            },
            {
                type: 'sort3',
                value: 28,
                user: 'user2',
            },
            {
                type: 'sort4',
                value: 15,
                user: 'user2',
            },
            {
                type: 'sort5',
                value: 20,
                user: 'user2',
            },
        ];
        return {
            base: {
                id: "",
                name: 'Antd堆叠玫瑰图',
                type: 'AntdStackRose',
            },
            style: {
                data,
                xField: "type",
                yField: "value",
                isStack: true,
                seriesField: "user",
                color: [
                    "#00b7ffff",
                    "#8ed2ffff"
                ],
                radius: 1,
                innerRadius: 0,
                supportCSSTransform: true,
                sectorStyle: {
                    stroke: "#fff",
                    lineWidth: 0
                },
                label: {
                    offset: 0,
                    style: {
                        fill: "#ffffffff",
                        fontSize: 10,
                        fontWeight: 400
                    },
                    autoRotate: false
                },
                legend: {
                    position: "top",
                    layout: "horizontal",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 16
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
            data: {
                sourceType: 'static',
                value: data
            },
        };
    }
}

export default AntdStackRoseDefinition;
