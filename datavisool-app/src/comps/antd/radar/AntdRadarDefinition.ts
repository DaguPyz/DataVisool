/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import React from "react";
import {getDefaultMenuList} from "@/designer/right/util";
import radarImg from './radar.webp';
import AntdRadarController, {AntdRadarProps} from "./AntdRadarController.ts";
import {AntdCommonDefinition} from "@/comps/antd-common/AntdCommonDefinition";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

const AnimationConfig = React.lazy(() => import("@/comps/common-component/animation-config/AnimationConfig"));
const AntdRadarStyleConfig = React.lazy(() => import("./AntdRadarStyleConfig.tsx"));
const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig"));
const AntdRadarFieldMapping = React.lazy(() => import("./AntdRadarStyleConfig.tsx").then((module) => ({default: module.AntdRadarFieldMapping})));

class AntdRadarDefinition extends AntdCommonDefinition<AntdRadarController, AntdRadarProps> {

    getController(): ClazzTemplate<AntdRadarController> | null {
        return AntdRadarController;
    }

    getMenuList(): Array<MenuInfo> {
        return getDefaultMenuList();
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            data: DataConfig,
            style: AntdRadarStyleConfig,
            animation: AnimationConfig,
            mapping: AntdRadarFieldMapping
        };
    }

    getBaseInfo(): BaseInfoType {
        return {
            compName: "Antd雷达图",
            compKey: "AntdRadar",
            categorize: "chart",
            subCategorize: "radar",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "AntdRadar",
            compName: "Antd雷达图",
            summary: "Antd雷达图，用于展示多维指标对比和能力结构。",
            featureTags: ["Antd雷达图", "雷达图", "多维对比", "能力分析", "数据可视化"],
            applicableScenes: ["能力评估", "多指标比较", "画像分析", "结构对比"],
            capabilities: ["支持多维指标对比", "支持多系列对比", "支持维度结构展示"],
            constraints: ["更适合维度较少但需要横向比较的场景"],
            aliases: ["Radar Chart"],
            categorize: "chart",
            subCategorize: "radar",
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
  /** 半径/圆角。 */
  radius?: number;
  /** 是否平滑。 */
  smooth?: boolean;
  /** lineStyle 配置。 */
  lineStyle?: {
    /** 描边颜色。 */
    stroke?: string;
    /** 线宽。 */
    lineWidth?: number;
    /** 透明度。 */
    opacity?: number;
  };
  /** 数据点配置。 */
  point?: {
    /** size 配置。 */
    size?: number;
    /** shape 配置。 */
    shape?: string;
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
  /** area 配置。 */
  area?: {
    /** style 配置。 */
    style?: {
      /** 填充颜色。 */
      fill?: string;
      /** fillOpacity 配置。 */
      fillOpacity?: number;
    };
  };
  /** X 轴配置。 */
  xAxis?: {
    /** 轴线配置。 */
    line?: any;
    /** 刻度线配置。 */
    tickLine?: any;
    /** 网格线配置。 */
    grid?: {
      /** alignTick 配置。 */
      alignTick?: boolean;
      /** 线条配置。 */
      line?: {
        /** style 配置。 */
        style?: {
          /** 描边/线条颜色。 */
          stroke?: string;
          /** 线宽。 */
          lineWidth?: number;
        };
        /** 类型。 */
        type?: string;
      };
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
    };
  };
  /** Y 轴配置。 */
  yAxis?: {
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
    /** 网格线配置。 */
    grid?: {
      /** alignTick 配置。 */
      alignTick?: boolean;
      /** 线条配置。 */
      line?: {
        /** style 配置。 */
        style?: {
          /** 描边/线条颜色。 */
          stroke?: string;
          /** 线宽。 */
          lineWidth?: number;
        };
        /** 类型。 */
        type?: string;
      };
    };
    /** 文本/标签配置。 */
    label?: {
      /** style 配置。 */
      style?: {
        /** 文字颜色。 */
        fill?: string;
      };
    };
    /** tickCount 配置。 */
    tickCount?: number;
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
        return radarImg;
    }

    getInitConfig(): AntdRadarProps {
        const data = [
            {
                name: "G2",
                star: 10371
            },
            {
                name: "G6",
                star: 7380
            },
            {
                name: "F2",
                star: 7414
            },
            {
                name: "L7",
                star: 2140
            },
            {
                name: "X6",
                star: 6601
            },
            {
                name: "AVA",
                star: 8851
            },
            {
                name: "G2Plot",
                star: 1626
            }
        ];
        return {
            base: {
                id: "",
                name: 'Antd雷达图',
                type: 'AntdRadar',
            },
            style: {
                data: data,
                xField: "name",
                yField: "star",
                radius: 1,
                smooth: true,
                lineStyle: {
                    stroke: "l(90) 0:#49a4ff 1:#ff70ff",
                    lineWidth: 2,
                    opacity: 0.5
                },
                point: {
                    size: 3,
                    shape: "circle",
                    style: {
                        fill: "l(90) 0:#248eff 1:#f36fff",
                        stroke: "#64d6ff",
                        lineWidth: 0
                    }
                },
                area: {
                    style: {
                        fill: "l(90) 0:#57a3ff 1:#c041ff",
                        fillOpacity: 0.6
                    }
                },
                xAxis: {
                    line: null,
                    tickLine: null,
                    grid: {
                        alignTick: true,
                        line: {
                            style: {
                                stroke: "#a2a2a2bb",
                                lineWidth: 1
                            },
                            type: "line"
                        }
                    },
                    label: {
                        style: {
                            fill: "#ffffff",
                            fontSize: 13
                        }
                    }
                },
                yAxis: {
                    line: {
                        style: {
                            stroke: "#595959",
                            lineWidth: 1
                        }
                    },
                    tickLine: null,
                    grid: {
                        alignTick: true,
                        line: {
                            style: {
                                stroke: "l(90) 0:#f9a5ff 1:#89c6ff",
                                lineWidth: 1
                            },
                            type: "line"
                        }
                    },
                    label: {
                        style: {
                            fill: "#ffffff"
                        }
                    },
                    tickCount: 3
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

export default AntdRadarDefinition;
