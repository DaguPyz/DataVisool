/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {Controller} from "./controller";
import {BaseButtonComponentProps} from "./component";
import {BaseButtonStyleConfig} from "./config";
import BaseButtonImg from './base-button.png';
import {AbstractDesignerDefinition, AnimationConfig, BaseInfo, FilterConfig, ThemeConfig} from "@datavisool/sdk";
import {BaseInfoType, ClazzTemplate, EventInfo} from "@datavisool/sdk/types";
import type {MenuInfo, MenuToConfigMappingType} from "@datavisool/sdk/core";

export default class Definition extends AbstractDesignerDefinition<Controller, BaseButtonComponentProps> {
    /**
     * 获取组件基础信息
     * compKey必须唯一
     * source: 'remote'必须保留，否则无法识别
     */
    getBaseInfo(): BaseInfoType {
        return {
            compName: "远程按钮",
            compKey: "RemoteButton",
            categorize: "web",
            width: 85,
            height: 35,
            source: 'remote'
        };
    }

    /**
     * 获取组件预览图，该预览图将直接显示在组件列表中
     */
    getChartImg(): string | null {
        return BaseButtonImg;
    }

    /**
     * 获取组件控制器
     */
    getController(): ClazzTemplate<Controller> | null {
        return Controller;
    }

    /**
     * 获取组件初始配置
     */
    getInitConfig(): BaseButtonComponentProps {
        return {
            base: {
                id: "",
                name: '远程按钮',
                type: 'RemoteButton',
            },
            style: {
                content: '按钮',
                color: '#fff',
                fontSize: 16,
                fontWeight: 500,
                fontFamily: 'DouyinSansBold',
                letterSpacing: 2,
                backgroundColor: '#3d6aff',
                borderRadius: 3,
                borderWidth: 1,
                borderColor: '#668cff',
                borderStyle: 'solid',
                speed: 0.3,
                scannerColor: '#fff',
                hoverShadow: '#319bff',
                hoverBackgroundColor: '#1969b8',
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
                value: []
            }
        };
    }

    /**
     * 获取组件右侧菜单列表
     */
    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'theme' && item.key !== 'data'));
    }

    /**
     * 获取组件右侧菜单与实际配置面板对应关系
     */
    getMenuToConfigContentMap(): MenuToConfigMappingType {
        return {
            base: BaseInfo,
            style: BaseButtonStyleConfig,
            animation: AnimationConfig,
            theme: ThemeConfig,
            filter: FilterConfig,
        };
    }

    /**
     * 获取组件可触发的事件列表，该事件列表将直接在蓝图中显示
     */
    getEventList(): EventInfo[] {
        const events = super.getEventList();
        return events.concat([
            {
                id: "click",
                name: "点击时",
            }
        ]);
    }
}