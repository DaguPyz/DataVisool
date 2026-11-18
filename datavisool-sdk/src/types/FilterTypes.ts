/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 组件滤镜类型
 */
export interface IFilterConfigType {
    enable?: boolean;
    blur?: number;
    brightness?: number;
    contrast?: number;
    opacity?: number;
    saturate?: number;
    hueRotate?: number;
}

/**
 * 全局滤镜管理器
 */
export interface IGlobalFilterManger {
    config?: IFilterConfigType;
}
