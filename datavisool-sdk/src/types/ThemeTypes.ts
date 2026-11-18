/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 主题
 */
export interface ThemeColors {
    //主体色
    main?: string;
    //主文字
    mainText?: string;
    //次文字
    subText?: string;
    //背景色
    background?: string;
    //补充一
    supplementFirst?: string;
    //补充二
    supplementSecond?: string;
}

export interface IThemeItem {
    colors: ThemeColors;
    name: string;
    id: string;
}
