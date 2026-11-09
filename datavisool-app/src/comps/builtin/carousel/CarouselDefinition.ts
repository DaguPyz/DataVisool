/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import {MenuInfo} from "../../../designer/right/MenuType";
import carouselImg from './carousel.webp';
import {CarouselController} from "./CarouselController.ts";
import {CarouselComponentProps} from "./CarouselComponent.tsx";
import AbstractDesignerDefinition from "../../../framework/core/AbstractDesignerDefinition.ts";
import {lazy} from "react";

const CarouselConfig = lazy(() => import("./CarouselConfig.tsx").then((module) => ({default: module.CarouselConfig})));

export default class CarouselDefinition extends AbstractDesignerDefinition<CarouselController, CarouselComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "轮播图",
            compKey: "carousel",
            categorize: "web",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "carousel",
            compName: "轮播图",
            summary: "轮播图，用于轮播展示图文内容或多页展示素材。",
            featureTags: ["轮播图", "内容轮播", "图文展示", "页面控件"],
            applicableScenes: ["首页 Banner", "内容展示", "活动展示", "素材轮播"],
            capabilities: ["支持轮播切换", "支持自动播放", "支持内容分页"],
            constraints: [],
            aliases: ["Carousel", "Slider"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ComponentStyle {
    //自动播放
    autoplay?: boolean;
    //自动播放速度
    autoplaySpeed?: number;
    //显示按钮
    dots?: boolean;
    //渐变切换
    fade?: boolean;
    //切换动效时间
    speed?: number;
}`.trim();
    }

    getChartImg(): string | null {
        return carouselImg;
    }

    getController(): ClazzTemplate<CarouselController> | null {
        return CarouselController;
    }

    getInitConfig(): CarouselComponentProps {
        return {
            base: {
                id: "",
                name: '轮播图',
                type: 'carousel',
            },
            style: {
                autoplay: true,
                autoplaySpeed: 3000,
                dots: true,
                fade: false,
                speed: 500,
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
                value: [carouselImg, carouselImg]
            }
        };
    }

    getMenuList(): Array<MenuInfo> {
        return super.getMenuList().filter((item: MenuInfo) => (item.key !== 'theme'));
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuMapping = super.getMenuToConfigContentMap();
        menuMapping['style'] = CarouselConfig;
        return menuMapping;
    }


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