/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import { createElement, forwardRef, lazy, Suspense } from 'react';
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition";
import { ThreeModelController } from "./ThreeModelController";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import type {ThreeModelComponentProps, ThreeModelComponentRef} from "./ThreeModelComponent";
import threeModel from './three-model.webp';

const ThreeModelStyleConfig = lazy(() => import("./ThreeModelStyleConfig"));
const LazyThreeModelComponent = lazy(() => import("./ThreeModelComponent").then(({ThreeModelComponent}) => ({default: ThreeModelComponent})));
const ThreeModelComponent = forwardRef<ThreeModelComponentRef, ThreeModelComponentProps>((props, ref) => createElement(
    Suspense,
    {fallback: null},
    createElement(LazyThreeModelComponent, {...props, ref}),
));

export default class ThreeModelDefinition extends AbstractDesignerDefinition<ThreeModelController, any> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "3D模型",
            compKey: "ThreeModel",
            categorize: "model",
            subCategorize: "3d",
            width: 400,
            height: 300,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "ThreeModel",
            compName: "3D模型",
            summary: "3D模型，用于承载三维模型和空间内容展示。",
            featureTags: ["3D模型", "三维展示", "媒体内容", "可视化"],
            applicableScenes: ["三维模型预览", "空间展示", "工业看板", "数字孪生"],
            capabilities: ["支持三维模型加载", "支持旋转缩放", "支持空间内容展示"],
            constraints: [],
            aliases: ["3D Model", "Three Model"],
            categorize: "media",
            subCategorize: "3d",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
  /** 来源。 */
  source?: {
    /** 类型。 */
    type?: string;
    /** 地址。 */
    url?: string;
    /** 格式字符串。 */
    format?: string;
  };
  /** scene 配置。 */
  scene?: {
    /** 背景配置/背景颜色。 */
    background?: {
      /** 类型。 */
      type?: string;
      /** 值。 */
      value?: string;
    };
    /** environment 配置。 */
    environment?: {
      /** preset 配置。 */
      preset?: string;
      /** intensity 配置。 */
      intensity?: number;
      /** blur 配置。 */
      blur?: number;
    };
  };
  /** 相机/视角配置。 */
  camera?: {
    /** 视场角。 */
    fov?: number;
    /** 位置。 */
    position?: number[];
    /** 是否显示控制条。 */
    controls?: {
      /** enable 配置。 */
      enable?: boolean;
      /** 是否允许交互。 */
      interactive?: boolean;
      /** 是否自动旋转。 */
      autoRotate?: boolean;
      /** 自动旋转速度。 */
      autoRotateSpeed?: number;
      /** 是否启用阻尼。 */
      enableDamping?: boolean;
    };
  };
  /** lights 配置。 */
  lights?: {
    /** ambient 配置。 */
    ambient?: {
      /** intensity 配置。 */
      intensity?: number;
      /** 颜色。 */
      color?: string;
    };
    /** directional 配置。 */
    directional?: {
      /** intensity 配置。 */
      intensity?: number;
      /** 颜色。 */
      color?: string;
      /** 位置。 */
      position?: number[];
    };
  };
  /** display 配置。 */
  display?: {
    /** 模式。 */
    mode?: string;
    /** 缩放比例。 */
    scale?: number;
    /** 是否自动居中。 */
    autoCenter?: boolean;
  };
}`.trim();
    }

    getChartImg(): string | null {
        return threeModel;
    }

    getController(): new () => ThreeModelController {
        return ThreeModelController;
    }

    getInitConfig(): any {
        return {
            base: {
                id: "",
                name: "3D模型",
                type: "ThreeModel",
            },
            style: {
                source: {
                    type: "online",
                    url: "https://threejs.org/examples/models/gltf/Parrot.glb",
                    format: "glb"
                },
                scene: {
                    background: {
                        type: "transparent",
                        value: "#f0f0f0"
                    },
                    environment: {
                        preset: "city",
                        intensity: 1,
                        blur: 0
                    }
                },
                camera: {
                    fov: 37,
                    position: [
                        0,
                        0,
                        120
                    ],
                    controls: {
                        enable: true,
                        interactive: false,
                        autoRotate: true,
                        autoRotateSpeed: 1,
                        enableDamping: true
                    }
                },
                lights: {
                    ambient: {
                        intensity: 0.5,
                        color: "#ffffff"
                    },
                    directional: {
                        intensity: 1,
                        color: "#ffffff",
                        position: [
                            5,
                            5,
                            5
                        ]
                    }
                },
                display: {
                    mode: "standard",
                    scale: 1,
                    autoCenter: false
                }
            },
        };
    }

    getReactComponent(): any {
        return ThreeModelComponent;
    }

    getMenuList() {
        // 移除默认的数据和主题菜单，因为目前不需要
        return super.getMenuList().filter(item => item.key !== 'data' && item.key !== 'theme');
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const map = super.getMenuToConfigContentMap();
        // 替换 style 菜单的内容为自定义的 ThreeModelStyleConfig
        map['style'] = ThreeModelStyleConfig;
        return map;
    }
}
