/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {PIXEL_BOUNDARY_VALUE} from "../constant/GlobalConstant.ts";

// ----------- 重载声明 -----------
export function convergenceToInterval(value: number): number;
export function convergenceToInterval(value: number, min: number, max: number): number;

// ----------- 实现部分 -----------
export function convergenceToInterval(value: number, min?: number, max?: number): number {
    const realMin = min ?? -PIXEL_BOUNDARY_VALUE;
    const realMax = max ?? PIXEL_BOUNDARY_VALUE;

    if (value >= 0) {
        return value > realMax ? realMax : value;
    } else {
        return value < realMin ? realMin : value;
    }
}
