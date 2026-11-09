/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {SwitchController} from "./BaseSwitchController.ts";
import {SwitchComponentProps} from "./BaseSwitchComponent.tsx";
import SwitchImg from './base-switch.webp';
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";

// 懒加载配置组件
const BaseInfo = React.lazy(() => import("../../common-component/base-info/BaseInfo"));
const ThemeConfig = React.lazy(() => import("../../common-component/theme-config/ThemeConfig.tsx"));
const AnimationConfig = React.lazy(() => import("../../common-component/animation-config/AnimationConfig.tsx"));
const DataConfig = React.lazy(() => import("../../common-component/data-config/DataConfig.tsx"));
const FilterConfig = React.lazy(() => import("../../common-component/filter-config/FilterConfig.tsx"));
const SwitchStyleConfig = React.lazy(() => import("./BaseSwitchStyleConfig.tsx").then((module) => ({default: module.SwitchStyleConfig})));

export default class SwitchDefinition extends AbstractDesignerDefinition<SwitchController, SwitchComponentProps> {

    getBaseInfo(): BaseInfoType {
        return {
            compName: "开关组件",
            compKey: "Switch",
            categorize: "web",
            width: 120,
            height: 32,
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "Switch",
            compName: "开关组件",
            summary: "开关组件，用于切换布尔状态和启用关闭行为。",
            featureTags: ["开关组件", "开关", "状态切换", "布尔控制", "页面控件"],
            applicableScenes: ["功能启停", "状态切换", "权限配置", "布尔表单"],
            capabilities: ["支持开关切换", "支持状态绑定", "支持布尔表达"],
            constraints: [],
            aliases: ["Switch", "Toggle"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    token?: {
        colorPrimary?: string;
        colorPrimaryHover?: string;
        colorPrimaryBorder?: string;
        colorText?: string;
        colorTextLightSolid?: string;
        fontSize?: number;
    },
    components?: {
        handleSize?: number;
        trackHeight?: number;
        trackMinWidth?: number;
        trackPadding?: number;
        handleBg?: string;
        colorBgContainer?: string;
    },
    props: {
        size?: 'default' | 'small';
        loading?: boolean;
        disabled?: boolean;
        checkedChildren?: string;
        unCheckedChildren?: string;
    },
    label?: {
        // 标签样式
        content?: string;
        position?: 'left' | 'right';
        color?: string;
        fontSize?: number;
        fontWeight?: number;
        fontFamily?: string;
    }
}`.trim();
    }

    getChartImg(): string | null {
        return SwitchImg;
    }

    getController(): ClazzTemplate<SwitchController> | null {
        return SwitchController;
    }

    getInitConfig(): SwitchComponentProps {
        return {
            base: {
                id: "",
                name: '开关组件',
                type: 'Switch',
            },
            style: {
                token: {
                    colorPrimary: "#4FB8FF",                  // 主高亮色
                    colorPrimaryHover: "#7ACDFF",             // 悬停亮度提升10%（#4FB8FF亮度提升）
                    colorPrimaryBorder: "#4FB8FF",            // 主色边框
                    colorText: "#FFFFFF",                     // 主要文字
                    colorTextLightSolid: "#FFFFFF",           // 主按钮文字
                    fontSize: 14,                             // 字体大小 14px
                },
                components: {
                    handleSize: 20,                           // 开关把手大小
                    trackHeight: 24,                          // 开关轨道高度
                    trackMinWidth: 44,                        // 轨道最小宽度
                    trackPadding: 2,                          // 轨道内边距
                    handleBg: "#FFFFFF",                      // 把手背景色
                    colorBgContainer: "#2C2C3E",              // 容器背景色
                },
                props: {
                    checkedChildren: "开",
                    unCheckedChildren: "关",
                    loading: false,                               // 非加载状态
                    disabled: false,                              // 非禁用状态
                    size: 'default',                        // 默认尺寸
                },
                label: {
                    content: "",
                    position: 'left',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 400,
                    fontFamily: "",
                },
            },
            data: {
                sourceType: 'static',
                value: false
            },
            filter: {
                enable: false,
                blur: 0,
                brightness: 1,
                contrast: 1,
                opacity: 1,
                saturate: 1,
                hueRotate: 0
            }
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: SwitchStyleConfig,
            animation: AnimationConfig,
            theme: ThemeConfig,
            filter: FilterConfig,
            data: DataConfig
        };
    }

    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "change",
                name: "状态改变时",
            },
            {
                id: "click",
                name: "点击时",
            },
            {
                id: "on",
                name: "开启时",
            },
            {
                id: "off",
                name: "关闭时",
            },
            {
                id: "toggle",
                name: "切换时",
            },
            {
                id: "valueChange",
                name: "值变化时",
            }
        ]);
    }
}