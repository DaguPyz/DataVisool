/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import AntdLiquidController, {AntdLiquidProps} from "./AntdLiquidController";
import liquidImg from './liquid.webp';
import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {EventInfo} from "@datavisool/sdk/types";

const AntdLiquidConfig = React.lazy(() => import("./AntdLiquidConfig"));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));


class AntdLiquidDefinition extends AbstractDesignerDefinition<AntdLiquidController, AntdLiquidProps> {

    getController(): ClazzTemplate<AntdLiquidController> | null {
        return AntdLiquidController;
    }

    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((item) => item.key !== 'mapping');
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdLiquidConfig
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

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd水波图",
            compKey: "AntdLiquid",
            categorize: "chart",
            subCategorize: "progress",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdLiquid",
            compName: "Antd水波图",
            summary: "Antd水波图，用于展示百分比、容量和液位状态。",
            featureTags: ["Antd水波图", "水波图", "液位效果", "百分比展示", "数据可视化"],
            applicableScenes: ["容量监控", "达成率展示", "状态监测", "可视化告警"],
            capabilities: ["支持液位填充", "支持动态波纹效果", "支持状态阈值展示"],
            constraints: ["更适合单一比例或容量类数据"],
            aliases: ["Liquid", "Liquid Chart"],
            categorize: "chart",
            subCategorize: "progress",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** shape 配置。 */
  shape?: string;
  /** 百分比配置。 */
  percent?: number;
  /** 半径/圆角。 */
  radius?: number;
  /** liquidStyle 配置。 */
  liquidStyle?: {
    /** 填充颜色。 */
    fill?: string;
    /** 描边颜色。 */
    stroke?: string;
  };
  /** shapeStyle 配置。 */
  shapeStyle?: {
    /** 填充颜色。 */
    fill?: string;
  };
  /** outline 配置。 */
  outline?: {
    /** border 配置。 */
    border?: number;
    /** distance 配置。 */
    distance?: number;
    /** style 配置。 */
    style?: {
      /** 描边颜色。 */
      stroke?: string;
    };
  };
  /** wave 配置。 */
  wave?: {
    /** length 配置。 */
    length?: number;
    /** count 配置。 */
    count?: number;
  };
  /** 统计信息配置。 */
  statistic?: {
    /** 显示文案。 */
    content?: {
      /** style 配置。 */
      style?: {
        /** 填充颜色。 */
        fill?: string;
        /** 字号。 */
        fontSize?: string;
        /** 颜色。 */
        color?: string;
        /** 字重。 */
        fontWeight?: number;
      };
    };
    /** 标题配置。 */
    title?: {
      /** 显示文案。 */
      content?: string;
      /** style 配置。 */
      style?: {
        /** 字号。 */
        fontSize?: string;
        /** 颜色。 */
        color?: string;
        /** 字重。 */
        fontWeight?: number;
      };
      /** Y 偏移。 */
      offsetY?: any;
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


    getChartImg(): string | null {
        return liquidImg;
    }

    getInitConfig(): AntdLiquidProps {
        return {
            base: {
                id: "",
                name: 'Antd水波图',
                type: 'AntdLiquid',
            },
            style: {
                shape: "circle",
                percent: 0.65,
                radius: 0.9,
                liquidStyle: {
                    fill: "l(90) 0:#45aeff 1:#0015ff",
                    stroke: "#1a75c8d6"
                },
                shapeStyle: {
                    fill: "#00fff716"
                },
                outline: {
                    border: 0,
                    distance: 0,
                    style: {
                        stroke: "#2B7DD35F"
                    }
                },
                wave: {
                    length: 150,
                    count: 3
                },
                statistic: {
                    content: {
                        style: {
                            fill: "#7de0ff",
                            fontSize: '20',
                            color: "#ffffff",
                            fontWeight: 200
                        }
                    },
                    title: {
                        content: "指标1",
                        style: {
                            fontSize: "22",
                            color: "#ffffffc2",
                            fontWeight: 500
                        },
                        offsetY: -10
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
                value: 0.65
            },
        };
    }
}

export default AntdLiquidDefinition;
