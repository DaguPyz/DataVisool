/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import LoopContainerController, {LoopContainerProps} from "./LoopContainerController.ts";
import type {AbstractController} from "@datavisool/sdk/core";
import {Data, Optimize, SettingOne} from "@icon-park/react";
import React from "react";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import AbstractDesignerDefinition, {ActionInfo} from "@/framework/core/AbstractDesignerDefinition.ts";
import {EventInfo} from "@datavisool/sdk/types";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController.ts";

const DataConfig = React.lazy(() => import("@/comps/common-component/data-config/DataConfig.tsx"));
const LoopContainerConfig = React.lazy(() => import("./LoopContainerConfig.tsx"));

export default class LoopContainerDefinition extends AbstractDesignerDefinition<LoopContainerController, LoopContainerProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "循环容器",
            compKey: "LoopContainer",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "LoopContainer",
            compName: "循环容器",
            summary: "循环容器组件。",
            featureTags: ["循环容器", "基础组件"],
            applicableScenes: ["通用组件场景"],
            capabilities: ["支持基础展示", "支持无限轮播"],
            constraints: [],
            aliases: [],
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    /**
     * 容器溢出处理方式。
     * 控制循环项超出可视区域后的表现，常见值为 hidden、auto、scroll。
     */
    overflow?: string;
    /**
     * 是否启用无限轮播。
     * 启用后循环容器将以单向平移的方式持续轮播展示内容。
     */
    enableCarousel?: boolean;
    /**
     * 轮播方向。
     * 决定内容沿横向还是纵向轮播，常见值为 row 或 column。
     */
    carouselDirection?: string;
    /**
     * 轮播速度。
     * 数值越大轮播越快，建议使用正数。
     */
    carouselSpeed?: number;
    /**
     * 每轮轮播结束后的停顿时长，单位为秒。
     * 数值越大，轮播切换间隔越明显。
     */
    carouselPauseSeconds?: number;
    /**
     * 主轴排列方向。
     * 决定循环项横向排列还是纵向排列，通常对应 flexDirection。
     */
    flexDirection?: string;
    /**
     * 是否换行。
     * 决定循环项在主轴空间不足时是否换行，对应 flex-wrap 的语义。
     */
    flexWrap?: string;
    /**
     * 循环项左右间距。
     * 控制每个重复项在横向上的排布距离，数值越大项目之间越疏。
     */
    horizontalGap?: number;
    /**
     * 循环项上下间距。
     * 控制每个重复项在纵向上的排布距离，数值越大项目之间越疏。
     */
    verticalGap?: number;
}`.trim();
    }

    getChartImg(): string | null {
        return null;
    }

    getController(): ClazzTemplate<LoopContainerController> | null {
        return LoopContainerController;
    }

    getInitConfig(): LoopContainerProps {
        return {
            base: {
                id: "",
                name: '循环容器',
                type: 'LoopContainer',
            },
            style: {
                overflow: 'auto',
                flexDirection: 'column',
                flexWrap: 'nowrap',
                horizontalGap: 10,
                verticalGap: 10,
                enableCarousel: false,
                carouselDirection: 'column',
                carouselSpeed: 3,
                carouselPauseSeconds: 0.08,
            },
            data: {
                sourceType: 'static',
                value: [],
            },
            managerData: {}
        };
    }

    getMenuList(): Array<MenuInfo> {
        return [
            {
                icon: SettingOne,
                key: 'base',
                name: '基础',
            },
            {
                icon: Optimize,
                key: 'style',
                name: '样式',
            },
            {
                icon: Data,
                name: '数据',
                key: 'data',
            },
        ];
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            style: LoopContainerConfig,
            data: DataConfig
        };
    }

    getEventList(): EventInfo[] {
        return [
            ...super.getEventList(),
            {
                id: "click",
                name: "点击时",
            }
        ];
    }

    getActionList(): ActionInfo[] {
        return [
            {
                name: "显示",
                id: "show",
                handler: (controller: AbstractController) => {
                    (controller as LoopContainerController).setVisible(true);
                }
            },
            {
                name: "隐藏",
                id: "hide",
                handler: (controller: AbstractController) => {
                    (controller as LoopContainerController).setVisible(false);
                }
            },
            {
                name: "更新组件数据",
                id: "updateData",
                handler: (controller: AbstractDesignerController, params?: object) => {
                    controller.changeData(params);
                }
            },
        ];
    }

}
