/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {MenuInfo} from "@datavisool/sdk/core";
import {ColorFilter, Data, Deeplink, Optimize, SettingOne, Theme} from "@icon-park/react";

export const getDefaultMenuList = (): Array<MenuInfo> => {
    return [
        {
            icon: SettingOne,
            name: '基础',
            key: 'base',
        },
        {
            icon: Optimize,
            name: '样式',
            key: 'style',
        },
        {
            icon: Data,
            name: '数据',
            key: 'data',
        },
        {
            icon: Deeplink,
            name: '映射',
            key: 'mapping',
        },
        {
            icon: ColorFilter,
            name: '滤镜',
            key: 'filter',
        },
        // {
        //     icon: VideoCameraFilled,
        //     name: '动画',
        //     key: 'animation',
        // },
        {
            icon: Theme,
            name: '主题',
            key: 'theme',
        }
    ];
}
