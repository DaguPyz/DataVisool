/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import AntdGaugeController, {AntdGaugeProps} from "./AntdGaugeController";
import gaugeImg from './gauge.webp';
import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {EventInfo} from "@datavisool/sdk/types";

const AntdGaugeConfig = React.lazy(() => import("./AntdGaugeConfig"));


class AntdGaugeDefinition extends AbstractDesignerDefinition<AntdGaugeController, AntdGaugeProps> {
    getController(): ClazzTemplate<AntdGaugeController> | null {
        return AntdGaugeController;
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menus = super.getMenuToConfigContentMap();
        menus['style'] = AntdGaugeConfig;
        return menus;
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd仪表盘",
            compKey: "AntdGauge",
            categorize: "chart",
            subCategorize: "progress",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdGauge",
            compName: "Antd仪表盘",
            summary: "Antd仪表盘，用于展示单一指标的实时状态和仪表刻度。",
            featureTags: ["Antd仪表盘", "仪表盘", "状态监控", "指标预警", "数据可视化"],
            applicableScenes: ["实时监控", "KPI展示", "状态预警", "目标达成率"],
            capabilities: ["支持刻度与指针", "支持阈值状态展示", "支持单指标监控"],
            constraints: ["适合单一关键指标", "不适合多维分类对比"],
            aliases: ["Gauge", "Gauge Chart"],
            categorize: "chart",
            subCategorize: "progress",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 百分比配置。 */
  percent?: number;
  /** 半径/圆角。 */
  radius?: number;
  /** 内半径。 */
  innerRadius?: number;
  /** 起始角度。 */
  startAngle?: any;
  /** 结束角度。 */
  endAngle?: number;
  /** range 配置。 */
  range?: {
    /** 颜色。 */
    color?: string[];
  };
  /** indicator 配置。 */
  indicator?: {
    /** pointer 配置。 */
    pointer?: {
      /** style 配置。 */
      style?: {
        /** 描边颜色。 */
        stroke?: string;
        /** 线宽。 */
        lineWidth?: number;
      };
    };
    /** pin 配置。 */
    pin?: {
      /** style 配置。 */
      style?: {
        /** 描边颜色。 */
        stroke?: string;
        /** 填充颜色。 */
        fill?: string;
        /** 半径。 */
        r?: number;
        /** 线宽。 */
        lineWidth?: number;
      };
    };
  };
  /** axis 配置。 */
  axis?: {
    /** 刻度线配置。 */
    tickLine?: {
      /** style 配置。 */
      style?: {
        /** 描边/线条颜色。 */
        stroke?: string;
        /** 线宽。 */
        lineWidth?: number;
      };
      /** length 配置。 */
      length?: any;
    };
    /** 子刻度线配置。 */
    subTickLine?: {
      /** count 配置。 */
      count?: number;
      /** style 配置。 */
      style?: {
        /** 描边/线条颜色。 */
        stroke?: string;
        /** 线宽。 */
        lineWidth?: number;
      };
      /** length 配置。 */
      length?: any;
    };
    /** 文本/标签配置。 */
    label?: {
      /** style 配置。 */
      style?: {
        /** 文字颜色。 */
        fill?: string;
        /** 字号。 */
        fontSize?: number;
        /** textAlign 配置。 */
        textAlign?: string;
        /** textBaseline 配置。 */
        textBaseline?: string;
      };
    };
  };
  /** 统计信息配置。 */
  statistic?: {
    /** 显示文案。 */
    content?: {
      /** style 配置。 */
      style?: {
        /** 颜色。 */
        color?: string;
        /** 字号。 */
        fontSize?: string;
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
    /** update 配置。 */
    update?: {
      /** 动画配置。 */
      animation?: string;
      /** duration 配置。 */
      duration?: number;
    };
  };
}`.trim();
    }


    getChartImg(): string | null {
        return gaugeImg;
    }

    getInitConfig(): AntdGaugeProps {
        return {
            base: {
                id: "",
                name: 'Antd仪表盘',
                type: 'AntdGauge',
            },
            style: {
                percent: 0.75,
                radius: 0.9,
                innerRadius: 0.85,
                startAngle: -3.6651914291880923,
                endAngle: 0.5235987755982988,
                range: {
                    color: [
                        "l(128) 0:#3c90ff 1:#934bff",
                        "#5d9eff00"
                    ]
                },
                indicator: {
                    pointer: {
                        style: {
                            stroke: "#37b3ff",
                            lineWidth: 2
                        }
                    },
                    pin: {
                        style: {
                            stroke: "#37b3ff",
                            fill: "#053b5d",
                            r: 2,
                            lineWidth: 2
                        }
                    }
                },
                axis: {
                    tickLine: {
                        style: {
                            stroke: "#ffffff",
                            lineWidth: 1
                        },
                        length: -4
                    },
                    subTickLine: {
                        count: 11,
                        style: {
                            stroke: "#ffffff",
                            lineWidth: 1
                        },
                        length: -2
                    },
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 12,
                            textAlign: "center",
                            textBaseline: "bottom"
                        }
                    }
                },
                statistic: {
                    content: {
                        style: {
                            color: "#ffffff",
                            fontSize: "16"
                        }
                    }
                },
                animation: {
                    appear: {
                        animation: "grow-in-x",
                        duration: 3000
                    },
                    update: {
                        animation: "grow-in-x",
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
                value: 0.75
            },
        };
    }

    getEventList(): EventInfo[] {
        const eventList = super.getEventList();
        eventList.push(...[
            {
                id: "dataChange",
                name: "数据变更时",
            },
            {
                id: "globalClick",
                name: "点击整个组件时",
            },
            {
                id: "elementClick",
                name: "点击图形数据元素时",
            },
        ])
        return eventList;
    }
}

export default AntdGaugeDefinition;
