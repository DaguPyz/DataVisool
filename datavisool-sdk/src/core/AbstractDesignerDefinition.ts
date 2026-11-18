/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractDefinition} from "./AbstractDefinition.ts";
import AbstractController from "./AbstractController.ts";
import AbstractDesignerController from "./AbstractDesignerController.ts";
import {Data, Platte} from "@icon-park/react";
import type {MenuInfo, MenuToConfigMappingType} from "./ComponentTypes";
import {EventInfo} from "../types";

export interface ActionInfo {
    name: string;
    id: string;
    handler: (controller: AbstractDesignerController, params?: any) => void;
}

export default abstract class AbstractDesignerDefinition<C extends AbstractController = AbstractDesignerController, P = any> extends AbstractDefinition<C, P> {

    getMenuList(): Array<MenuInfo> {
        return [
            {
                icon: Platte,
                name: '样式',
                key: 'style',
            },
            {
                icon: Data,
                name: '数据',
                key: 'data',
            }
        ];
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {};
    }

    /**
     * 返回当前组件能触发的事件列表, 在蓝图图层节点中使用
     */
    getEventList(): EventInfo[] {
        return [
            {
                id: "loaded",
                name: "组件加载完成时",
            }
        ];
    }

    /**
     * 返回当前组件能接受的动作列表，在蓝图图层节点中使用。可据此实现对组件的操作
     */
    getActionList(): ActionInfo[] {
        return [
            {
                name: "显示",
                id: "show",
                handler: (controller: AbstractDesignerController) => {
                    controller.setVisible(true);
                }
            },
            {
                name: "隐藏",
                id: "hide",
                handler: (controller: AbstractDesignerController) => {
                    controller.setVisible(false);
                }
            },
            {
                name: "更新组件样式",
                id: "updateConfig",
                handler: (controller: AbstractDesignerController, params?: object) => {
                    controller.update(params);
                }
            },
            {
                name: "更新组件数据",
                id: "updateData",
                handler: (controller: AbstractDesignerController, params?: object) => {
                    controller.changeData(params);
                }
            },
            {
                name: "切换状态",
                id: "toggleStatus",
                handler: (controller: AbstractDesignerController, statusId?: string) => {
                    if (!statusId)
                        return;
                    const status = controller.config.status[statusId];
                    if (!status)
                        return;
                    controller.update(status.config);
                }
            }
        ];
    }
}
