/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";
import AntdRingProgressController, {AntdRingProgressProps} from "./AntdRingProgressController";
import ringProgressImg from './ring-progress.webp';
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));
const AntdRingProgressStyleConfig = React.lazy(() => import("./AntdRingProgressConfig").then((module) => ({default: module.AntdRingProgressStyleConfig})));


class AntdRingProgressDefinition extends AntdCommonDefinition<AntdRingProgressController, AntdRingProgressProps> {

    getController(): ClazzTemplate<AntdRingProgressController> | null {
        return AntdRingProgressController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList().filter((menuInfo) => menuInfo.key !== "mapping");
    }

    getEventList(): EventInfo[] {
        return [
            {
                id: "loaded",
                name: "组件加载完成时",
            },
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
        ];
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdRingProgressStyleConfig,
            animation: AnimationConfig
        };
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd迷你环图",
            compKey: "AntdRingProgress",
            categorize: "chart",
            subCategorize: "progress",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdRingProgress",
            compName: "Antd迷你环图",
            summary: "Antd迷你环图，用于展示环形完成率和进度状态。",
            featureTags: ["Antd迷你环图", "环形进度", "完成率", "状态监控", "数据可视化"],
            applicableScenes: ["进度监控", "完成率展示", "指标状态", "仪表化看板"],
            capabilities: ["支持环形进度展示", "支持百分比表达", "支持中心文案展示"],
            constraints: ["适合单一进度值", "不适合复杂维度分析"],
            aliases: ["Ring Progress", "Progress Ring"],
            categorize: "chart",
            subCategorize: "progress",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 百分比配置。 */
  percent?: number;
  /** 颜色。 */
  color?: string[];
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
        /** 字重。 */
        fontWeight?: number;
        /** 颜色。 */
        color?: string;
      };
      /** Y 偏移。 */
      offsetY?: number;
      /** X 偏移。 */
      offsetX?: number;
    };
    /** 标题配置。 */
    title?: {
      /** style 配置。 */
      style?: {
        /** 字号。 */
        fontSize?: string;
        /** 字重。 */
        fontWeight?: number;
        /** 颜色。 */
        color?: string;
      };
      /** 显示文案。 */
      content?: string;
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
  /** progressStyle 配置。 */
  progressStyle?: {
    /** 线宽。 */
    lineWidth?: number;
    /** 描边颜色。 */
    stroke?: string;
  };
}`.trim();
    }


    getChartImg(): string | null {
        return ringProgressImg;
    }

    getInitConfig(): AntdRingProgressProps {
        return {
            base: {
                id: "",
                name: 'Antd迷你环图',
                type: 'AntdRingProgress',
            },
            style: {
                percent: 0.7,
                color: [
                    "l(140) 0:#9cd1ff 0.81:#0084ff",
                    "#a9a9a900"
                ],
                statistic: {
                    content: {
                        style: {
                            fill: "#fff",
                            fontSize: '21',
                            fontWeight: 500,
                            color: "#ffffff"
                        },
                        offsetY: 7,
                        offsetX: 0
                    },
                    title: {
                        style: {
                            fontSize: '15',
                            fontWeight: 500,
                            color: "#ffffff"
                        },
                        content: "指标1",
                        offsetY: -11
                    }
                },
                animation: {
                    appear: {
                        animation: "wave-in",
                        duration: 3000
                    }
                },
                progressStyle: {
                    lineWidth: 0,
                    stroke: "l(90) 0:#78cdff 1:#a481ff"
                }
            },
            data: {
                sourceType: 'static',
                value: 0.7,
            },
        };
    }
}

export default AntdRingProgressDefinition;
