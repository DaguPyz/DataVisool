/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentType} from "react";

export interface MenuInfo {
    //图标
    icon: ComponentType;
    //名称
    name: string;
    //标识
    key: string;
    //点击事件
    onClick?: (menuKey: string) => void;
}