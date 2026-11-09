/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable} from "mobx";
import AbstractManager from "@/designer/manager/core/AbstractManager.ts";
import {IThemeItem} from "@datavisool/sdk/types";

class ThemeManager extends AbstractManager<Array<IThemeItem>> {
    constructor() {
        super();
        makeObservable(this, {
            themeConfig: observable,
            updateThemeConfig: action,
        })
    }

    /**
     * 主题
     */
    themeConfig: Array<IThemeItem> | null = [
        {
            id: "0",
            name: "科技风格(默认主题)",
            colors: {main: "#00dfff", mainText: "#62edff", subText: "#4ca4b1", background: "#00dfff33", supplementFirst: "#38929f", supplementSecond: "#1790a2",},
        },
        {
            id: "1",
            name: "烈焰战区",
            colors: { main: "#FF5500", mainText: "#FFFFFF", subText: "#B34A1E", background: "#1A1412", supplementFirst: "#33221B", supplementSecond: "#4D2D22" }
        },
        {
            id: "3",
            name: "复古工业",
            colors: { main: "#FFC107", mainText: "#FDF5E6", subText: "#B39547", background: "#2B2620", supplementFirst: "#423A2F", supplementSecond: "#594E3F" }
        },
        {
            id: "4",
            name: "数字森林",
            colors: { main: "#00FF41", mainText: "#D0FFD0", subText: "#4E9A5E", background: "#0A1A0F", supplementFirst: "#14331E", supplementSecond: "#1E4D2D" }
        },
        {
            id: "5",
            name: "星际远航",
            colors: { main: "#AEE9FF", mainText: "#E6F7FF", subText: "#8BB9D9", background: "#1B2429", supplementFirst: "#2B3A42", supplementSecond: "#3D525C" }
        },
        {
            id: "9",
            name: "未来主义",
            colors: { main: "#1677FF", mainText: "#FFFFFF", subText: "#A6C5F7", background: "#24292F", supplementFirst: "#37414B", supplementSecond: "#4B5966" }
        },
        {
            id: "10",
            name: "核能核心",
            colors: { main: "#722ED1", mainText: "#F9F0FF", subText: "#B391D9", background: "#121226", supplementFirst: "#23234D", supplementSecond: "#343473" }
        }
    ];

    updateThemeConfig = (data: Array<IThemeItem>) => this.themeConfig = data;

    destroy(): void {
    }

    getData(): Array<IThemeItem> {
        return this.themeConfig!;
    }

    init(data: Array<IThemeItem>): void {
        this.themeConfig = data || this.themeConfig;
    }

}

export default ThemeManager;
