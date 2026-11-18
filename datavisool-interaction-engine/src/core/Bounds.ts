/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {getLayerBounds} from './Geometry';
import type {LayerBox, Point, Rect} from './types';

export function createBoundsLayer(layers: LayerBox[]): LayerBox | null {
    const orientedBounds = createOrientedSelectionBounds(layers);

    if (orientedBounds) {
        return orientedBounds;
    }

    const bounds = createSelectionBounds(layers);

    return bounds
        ? {
            id: '__datavisool_selection_bounds__',
            ...bounds,
            rotate: 0,
        }
        : null;
}

export function createSelectionBounds(layers: LayerBox[]): Rect | null {
    if (layers.length === 0) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const layer of layers) {
        const bounds = getLayerBounds(layer);
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    return normalizeRect({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    });
}

export function createLogicalSelectionBounds(layers: LayerBox[]): Rect | null {
    if (layers.length === 0) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const layer of layers) {
        minX = Math.min(minX, layer.x);
        minY = Math.min(minY, layer.y);
        maxX = Math.max(maxX, layer.x + layer.width);
        maxY = Math.max(maxY, layer.y + layer.height);
    }

    return normalizeRect({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    });
}

function createOrientedSelectionBounds(layers: LayerBox[]): LayerBox | null {
    if (layers.length === 0) {
        return null;
    }

    const rotate = resolveCommonRotate(layers);

    if (rotate === null) {
        return null;
    }

    const radians = rotate * Math.PI / 180;
    const axisX = {
        x: Math.cos(radians),
        y: Math.sin(radians),
    };
    const axisY = {
        x: -Math.sin(radians),
        y: Math.cos(radians),
    };
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const layer of layers) {
        for (const corner of getLayerCorners(layer)) {
            const projectedX = dot(corner, axisX);
            const projectedY = dot(corner, axisY);
            minX = Math.min(minX, projectedX);
            minY = Math.min(minY, projectedY);
            maxX = Math.max(maxX, projectedX);
            maxY = Math.max(maxY, projectedY);
        }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const center = {
        x: axisX.x * centerX + axisY.x * centerY,
        y: axisX.y * centerX + axisY.y * centerY,
    };

    return {
        id: '__datavisool_selection_bounds__',
        ...normalizeRect({
            x: center.x - width / 2,
            y: center.y - height / 2,
            width,
            height,
        }),
        rotate,
    };
}

function resolveCommonRotate(layers: LayerBox[]) {
    const rotate = normalizeRotate(layers[0].rotate);

    for (const layer of layers) {
        if (!isSameRotate(rotate, normalizeRotate(layer.rotate))) {
            return null;
        }
    }

    return rotate;
}

function getLayerCorners(layer: LayerBox): Point[] {
    const center = {
        x: layer.x + layer.width / 2,
        y: layer.y + layer.height / 2,
    };
    const corners = [
        {x: layer.x, y: layer.y},
        {x: layer.x + layer.width, y: layer.y},
        {x: layer.x + layer.width, y: layer.y + layer.height},
        {x: layer.x, y: layer.y + layer.height},
    ];

    return corners.map((corner) => rotatePoint(center, corner, layer.rotate));
}

function rotatePoint(center: Point, point: Point, rotate: number): Point {
    const radians = rotate * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;

    return {
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
    };
}

function dot(a: Point, b: Point) {
    return a.x * b.x + a.y * b.y;
}

function isSameRotate(a: number, b: number) {
    const delta = Math.abs(a - b);
    return delta < 0.000001 || Math.abs(delta - 360) < 0.000001;
}

function normalizeRotate(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    const normalized = ((value % 360) + 360) % 360;
    return Math.abs(normalized - 360) < 0.000001 ? 0 : normalizeNumber(normalized);
}

export function normalizeRect(rect: Rect): Rect {
    return {
        x: normalizeNumber(rect.x),
        y: normalizeNumber(rect.y),
        width: normalizeNumber(rect.width),
        height: normalizeNumber(rect.height),
    };
}

export function normalizeNumber(value: number) {
    return Math.abs(value) < 0.000001 ? 0 : Number(value.toFixed(6));
}
