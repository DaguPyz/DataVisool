/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import GroupLayerController, {GroupLayerProps} from "./GroupLayerController";
import type {AbstractController} from "@datavisool/sdk/core";
import {SettingOne} from "@icon-park/react";
import React from "react";
import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import AbstractDesignerDefinition, {ActionInfo} from "../../framework/core/AbstractDesignerDefinition.ts";
import {EventInfo} from "@datavisool/sdk/types";


const BaseInfo = React.lazy(() => import("../common-component/base-info/BaseInfo"));

export default class GroupLayerDefinition extends AbstractDesignerDefinition<GroupLayerController, GroupLayerProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "分组图层",
            compKey: "group",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "group",
            compName: "分组图层",
            summary: "分组图层组件。",
            featureTags: ["分组图层", "基础组件"],
            applicableScenes: ["通用组件场景"],
            capabilities: ["支持基础展示"],
            constraints: [],
            aliases: [],
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
}`.trim();
    }

    getChartImg(): string | null {
        return null;
    }

    getController(): ClazzTemplate<GroupLayerController> | null {
        return null;
    }

    getInitConfig(): GroupLayerProps {
        return {
            base: {
                id: "",
                name: '分组图层',
                type: 'group',
            }
        };
    }

    getMenuList(): Array<MenuInfo> {
        return [
            {
                icon: SettingOne,
                key: 'base',
                name: '基础',
            }
        ];
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
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
                    (controller as GroupLayerController).setVisible(true);
                }
            },
            {
                name: "隐藏",
                id: "hide",
                handler: (controller: AbstractController) => {
                    (controller as GroupLayerController).setVisible(false);
                }
            }
        ];
    }

}