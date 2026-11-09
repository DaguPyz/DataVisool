/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {BaseInfoType, ComponentAiFeatureInfo} from "@datavisool/sdk/types";
import type {MenuToConfigMappingType} from "@datavisool/sdk/core";
import {ClazzTemplate} from "@datavisool/sdk/types";
import {EventInfo} from "@datavisool/sdk/types";
import baseTableImg from './base-table.webp';
import {BaseTableController} from "./BaseTableController";
import {BaseTableComponentProps} from "./BaseTableComponent";
import AbstractDesignerDefinition from "@/framework/core/AbstractDesignerDefinition.ts";
import {lazy} from "react";

const BaseTableStyleConfig = lazy(() => import("./BaseTableConfig").then((module) => ({default: module.BaseTableStyleConfig})));

export default class BaseTableDefinition extends AbstractDesignerDefinition<BaseTableController, BaseTableComponentProps> {
    getBaseInfo(): BaseInfoType {
        return {
            compName: "基础表格",
            compKey: "LcBaseTable",
            categorize: "web",
        };
    }

    getAiFeatureInfo(): ComponentAiFeatureInfo {
        return {
            compKey: "LcBaseTable",
            compName: "基础表格",
            summary: "基础表格，用于承载数据列表、批量信息展示和表格交互。",
            featureTags: ["基础表格", "表格", "数据列表", "信息展示", "页面控件"],
            applicableScenes: ["数据管理", "清单展示", "后台运营", "信息浏览"],
            capabilities: ["支持数据列表展示", "支持排序筛选", "支持表格交互"],
            constraints: ["更适合结构化列表数据"],
            aliases: ["Table", "Data Table"],
            categorize: "web",
        };
    }

    getAiStylePromptTs(): string {
        return `export interface ITableColumn {
    key: string;
    label: string;
    width?: number;
    textAlign?: 'left' | 'center' | 'right';
}

export interface ITableHeaderStyle {
    height?: number;
    background?: string;
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
}

export interface ITableBodyStyle {
    background?: string;
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    enableZebra?: boolean;
    zebraColor?: string;
    enableCarousel?: boolean;
    carouselSpeed?: number;
    carouselPauseSeconds?: number;
    pageSize?: number;
    lineBackground?: string | string[];
}

export interface ComponentStyle {
    columns?: ITableColumn[];
    data?: object[];
    header?: ITableHeaderStyle;
    body?: ITableBodyStyle;
}`.trim();
    }


    getChartImg(): string | null {
        return baseTableImg;
    }

    getController(): ClazzTemplate<BaseTableController> | null {
        return BaseTableController;
    }

    getInitConfig(): BaseTableComponentProps {
        const data = [
            {name: '张三', age: 18, sex: '男'},
            {name: '李四', age: 20, sex: '女'},
            {name: '王五', age: 22, sex: '男'}
        ];
        return {
            base: {
                id: "",
                name: '基础表格',
                type: 'LcBaseTable',
            },
            style:  {
                columns: [
                    {
                        key: "name",
                        label: "姓名",
                        textAlign: "center"
                    },
                    {
                        key: "age",
                        label: "年龄",
                        textAlign: "center"
                    },
                    {
                        key: "sex",
                        label: "性别",
                        textAlign: "center"
                    }
                ],
                data: [
                    {
                        name: "张三",
                        age: 18,
                        sex: "男"
                    },
                    {
                        name: "李四",
                        age: 20,
                        sex: "女"
                    },
                    {
                        name: "王五",
                        age: 22,
                        sex: "男"
                    },
                    {
                        name: "xx五",
                        age: 22,
                        sex: "男"
                    },
                    {
                        name: "小红",
                        age: 19,
                        sex: "女"
                    },
                    {
                        name: "小蓝",
                        age: 23,
                        sex: "男"
                    },
                    {
                        name: "小绿",
                        age: 21,
                        sex: "女"
                    },
                    {
                        name: "小黄",
                        age: 24,
                        sex: "男"
                    },
                    {
                        name: "小紫",
                        age: 25,
                        sex: "女"
                    },
                    {
                        name: "小灰",
                        age: 26,
                        sex: "男"
                    },
                    {
                        name: "小橙",
                        age: 27,
                        sex: "女"
                    },
                    {
                        name: "小白",
                        age: 28,
                        sex: "男"
                    }
                ],
                header: {
                    height: 30,
                    background: "linear-gradient(90deg,  #ff7361 0%, #ff432a 100%)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 900
                },
                body: {
                    background: "#14141400",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 500,
                    enableCarousel: false,
                    carouselSpeed: 3,
                    carouselPauseSeconds: 0.08,
                    pageSize: 5,
                    lineBackground: [
                        "linear-gradient(90deg,  #1199a3 0%, #008f99 100%)",
                        "linear-gradient(90deg,  #15bfcc 0%, #1caab4 100%)"
                    ]
                }
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
                value: data
            },
        };
    }

    getMenuToConfigContentMap(): MenuToConfigMappingType {
        const menuMapping = super.getMenuToConfigContentMap();
        menuMapping['style'] = BaseTableStyleConfig;
        return menuMapping;
    }

    getEventList(): Array<EventInfo> {
        const eventList = super.getEventList();
        eventList.push(...[
            {
                id: "dataChange",
                name: "数据变更时",
            }
        ])
        return eventList;
    }
}
