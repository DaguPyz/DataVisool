/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/**
 * 大屏适配方式
 */
export type AdaptationType = 'scale' | 'full-screen' | 'full-x' | 'full-y' | 'none';

export type CanvasBoxSelectionMode = 'intersect' | 'contain';

/**
 * 画布配置
 */
export interface ICanvasManager {
    //开启栅格化
    rasterize?: boolean;
    //栅格化拖拽步长
    dragStep?: number;
    //栅格化缩放步长
    resizeStep?: number;
    //画布宽
    width?: number;
    //画布高
    height?: number;
    //屏幕适配
    adaptationType?: AdaptationType;
    //框选命中模式
    boxSelectionMode?: CanvasBoxSelectionMode;
}
