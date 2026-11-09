/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import stackAreaImg from "./stack-area.webp";
import AbstractAreaDefinition from "@/comps/antd-common/area/AbstractAreaDefinition";
import {AntdAreaProps} from "@/comps/antd-common/area/AntdCommonAreaController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";

class AntdStackAreaDefinition extends AbstractAreaDefinition {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd堆叠面积图",
            compKey: "AntdStackArea",
            categorize: "chart",
            subCategorize: "area",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdStackArea",
            compName: "Antd堆叠面积图",
            summary: "Antd堆叠面积图，用于展示多个系列随时间的累计变化。",
            featureTags: ["Antd堆叠面积图", "堆叠面积图", "累计展示", "多系列对比", "数据可视化"],
            applicableScenes: ["累计趋势", "多系列变化", "运营看板", "时间序列分析"],
            capabilities: ["支持堆叠展示", "支持连续趋势表达", "支持多系列对比"],
            constraints: ["适合展示组成变化", "不适合离散分类过多的场景"],
            aliases: ["Area Chart", "Stacked Area"],
            categorize: "chart",
            subCategorize: "area",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** country 配置。 */
      country?: string;
      /** year 配置。 */
      year?: number;
      /** 值。 */
      value?: number;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** seriesField 配置。 */
  seriesField?: string;
  /** 是否平滑。 */
  smooth?: boolean;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** 颜色。 */
  color?: string[];
  /** 数据点配置。 */
  point?: {
    /** size 配置。 */
    size?: number;
    /** 颜色。 */
    color?: string[];
    /** style 配置。 */
    style?: {
      /** 描边颜色。 */
      stroke?: string;
      /** 线宽。 */
      lineWidth?: number;
    };
    /** shape 配置。 */
    shape?: string;
  };
  /** 线条配置。 */
  line?: {
    /** style 配置。 */
    style?: {
      /** 线宽。 */
      lineWidth?: number;
    };
    /** 颜色。 */
    color?: string[];
  };
  /** 面积填充样式。 */
  areaStyle?: {
    /** fillOpacity 配置。 */
    fillOpacity?: number;
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
    /** 标题配置。 */
    title?: any;
    /** 位置。 */
    position?: string;
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
    /** 标题配置。 */
    title?: any;
    /** 位置。 */
    position?: string;
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
}`.trim();
    }


    getChartImg(): string {
        return stackAreaImg;
    }

    getInitConfig(): AntdAreaProps {
        const data = [
            {
                country: "北美",
                year: 1965,
                value: 1390.5
            },
            {
                country: "北美",
                year: 1966,
                value: 1469.5
            },
            {
                country: "北美",
                year: 1967,
                value: 1521.7
            },
            {
                country: "北美",
                year: 1968,
                value: 1615.9
            },
            {
                country: "北美",
                year: 1969,
                value: 1703.7
            },
            {
                country: "中南美",
                year: 1965,
                value: 1109.2
            },
            {
                country: "中南美",
                year: 1966,
                value: 615.7
            },
            {
                country: "中南美",
                year: 1967,
                value: 720.5
            },
            {
                country: "中南美",
                year: 1968,
                value: 1128
            },
            {
                country: "中南美",
                year: 1969,
                value: 434.4
            },
            {
                country: "欧洲",
                year: 1965,
                value: 1058.1
            },
            {
                country: "欧洲",
                year: 1966,
                value: 1089.7
            },
            {
                country: "欧洲",
                year: 1967,
                value: 1121.7
            },
            {
                country: "欧洲",
                year: 1968,
                value: 1196.6
            },
            {
                country: "欧洲",
                year: 1969,
                value: 1285.5
            }
        ];
        return {
            base: {
                id: "",
                name: '堆叠面积图',
                type: 'AntdStackArea',
            },
            style: {
                data: data,
                xField: "year",
                yField: "value",
                seriesField: "country",
                smooth: true,
                supportCSSTransform: true,
                color: [
                    "l(90) 0:#016eb7 1:#016eb700",
                    "l(90) 0:#0489e2 1:#016eb700",
                    "l(90) 0:#0099ff 1:#016eb700"
                ],
                point: {
                    size: 0,
                    color: [
                        "#4fa3ff67",
                        "#009aff67",
                        "#006d7f67"
                    ],
                    style: {
                        stroke: "#ffffff",
                        lineWidth: 0
                    },
                    shape: "circle"
                },
                line: {
                    style: {
                        lineWidth: 2
                    },
                    color: [
                        "#0099ff"
                    ]
                },
                areaStyle: {
                    fillOpacity: 1
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
                    title: null,
                    position: "bottom",
                    tickCount: 3
                },
                yAxis: {
                    grid: null,
                    label: {
                        style: {
                            fill: "#f9f9f9",
                            fontSize: 12
                        }
                    },
                    line: {
                        style: {
                            stroke: "#9e9e9e6e",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    subTickLine: null,
                    title: null,
                    position: "left",
                    tickCount: 3
                },
                legend: {
                    position: "top",
                    layout: "horizontal",
                    itemName: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 10
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

export default AntdStackAreaDefinition;
