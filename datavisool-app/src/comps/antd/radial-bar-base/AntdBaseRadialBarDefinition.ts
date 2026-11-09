/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";
import baseRadialBarImg from './base-radial-bar.webp';
import AntdBaseRadialBarController, {AntdRadialBarProps} from "./AntdBaseRadialBarController.ts";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdRadialBarConfig = React.lazy(() => import("./AntdBaseRadialBarStyleConfig.tsx"));
const AntdRadialBarFieldMapping = React.lazy(() => import("./AntdBaseRadialBarStyleConfig.tsx").then((module) => ({default: module.AntdRadialBarFieldMapping})));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));

class AntdBaseRadialBarDefinition extends AntdCommonDefinition<AntdBaseRadialBarController, AntdRadialBarProps> {

    getController(): ClazzTemplate<AntdBaseRadialBarController> | null {
        return AntdBaseRadialBarController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdRadialBarConfig,
            animation: AnimationConfig,
            mapping: AntdRadialBarFieldMapping
        };
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd基础玉珏图",
            compKey: "AntdBaseRadialBar",
            categorize: "chart",
            subCategorize: 'radial'
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdBaseRadialBar",
            compName: "Antd基础玉珏图",
            summary: "Antd基础玉珏图，用于展示径向条形结构和环形指标对比。",
            featureTags: ["Antd基础玉珏图", "径向图", "环形指标", "径向条形", "数据可视化"],
            applicableScenes: ["环形指标展示", "径向对比", "状态监控", "可视化看板"],
            capabilities: ["支持径向布局", "支持环形/条形对比", "支持指标环展示"],
            constraints: ["更适合单组或少量指标对比"],
            aliases: ["Radial Bar", "Radial Chart"],
            categorize: "chart",
            subCategorize: "radial",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 数据列表或数据源内容。 */
  data?: Array<{
      /** 名称。 */
      name?: string;
      /** star 配置。 */
      star?: number;
    }>;
  /** xField 配置。 */
  xField?: string;
  /** yField 配置。 */
  yField?: string;
  /** maxAngle 配置。 */
  maxAngle?: number;
  /** 起始角度。 */
  startAngle?: any;
  /** 结束角度。 */
  endAngle?: number;
  /** 半径/圆角。 */
  radius?: number;
  /** 内半径。 */
  innerRadius?: number;
  /** colorField 配置。 */
  colorField?: string;
  /** 类型。 */
  type?: string;
  /** 是否支持 CSS transform。 */
  supportCSSTransform?: boolean;
  /** 最大条宽。 */
  maxBarWidth?: number;
  /** 颜色。 */
  color?: string[];
  /** 条形样式。 */
  barStyle?: {
    /** lineCap 配置。 */
    lineCap?: string;
  };
  /** X 轴配置。 */
  xAxis?: {
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
        return baseRadialBarImg;
    }

    getInitConfig(): AntdRadialBarProps {
        const data = [
            {name: 'X6', star: 297},
            {name: 'G', star: 506},
            {name: 'AVA', star: 805},
            {name: 'G2Plot', star: 1478},
            {name: 'L7', star: 2029},
            {name: 'G6', star: 7100},
            {name: 'F2', star: 7346},
            {name: 'G2', star: 10178},
        ];
        return {
            base: {
                id: "",
                name: 'Antd基础玉珏图',
                type: 'AntdBaseRadialBar',
            },
            style: {
                data,
                xField: "name",
                yField: "star",
                maxAngle: 270,
                startAngle: -1.5707963267948966,
                endAngle: 4.71238898038469,
                radius: 1,
                innerRadius: 0.1,
                colorField: "name",
                type: "",
                supportCSSTransform: true,
                maxBarWidth: 11,
                color: [
                    "l(90) 0:#3ea2ff 1:#007bff",
                    "l(90) 0:#a362ff 1:#c375ff"
                ],
                barStyle: {
                    lineCap: "round"
                },
                xAxis: {
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 14
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
                value: data,
            },
        };
    }
}

export default AntdBaseRadialBarDefinition;
