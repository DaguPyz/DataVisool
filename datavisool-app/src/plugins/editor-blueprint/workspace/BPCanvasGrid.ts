/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {IPoint} from "@datavisool/sdk/types";

const WORLD_GRID_STEP = 24;

export interface BPCanvasGridStyle {
    spacing: number;
    offsetX: number;
    offsetY: number;
}

export function getBPCanvasGridStyle(position: IPoint, scale: number): BPCanvasGridStyle {
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const density = safeScale < 0.1 ? 8 : safeScale < 0.2 ? 4 : safeScale < 0.4 ? 2 : 1;
    const spacing = WORLD_GRID_STEP * safeScale * density;

    return {
        spacing,
        offsetX: modulo(position.x, spacing),
        offsetY: modulo(position.y, spacing),
    };
}

export function syncBPCanvasGrid(viewport: HTMLElement, position: IPoint, scale: number) {
    const style = getBPCanvasGridStyle(position, scale);
    viewport.style.setProperty("--bp-grid-size", `${style.spacing}px`);
    viewport.style.setProperty("--bp-grid-x", `${style.offsetX}px`);
    viewport.style.setProperty("--bp-grid-y", `${style.offsetY}px`);
}

function modulo(value: number, divisor: number) {
    const finiteValue = Number.isFinite(value) ? value : 0;
    return ((finiteValue % divisor) + divisor) % divisor;
}
