/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {Point, PointerLike} from './types';

export interface CoordinateSnapshot {
    scale: number;
    containerLeft: number;
    containerTop: number;
}

export function createCoordinateSnapshot(container: HTMLElement, scale: number): CoordinateSnapshot {
    const rect = container.getBoundingClientRect();

    return {
        scale: scale || 1,
        containerLeft: rect.left,
        containerTop: rect.top,
    };
}

export function clientPointToCanvasPoint(event: PointerLike, snapshot: CoordinateSnapshot): Point {
    return {
        x: (event.clientX - snapshot.containerLeft) / snapshot.scale,
        y: (event.clientY - snapshot.containerTop) / snapshot.scale,
    };
}
