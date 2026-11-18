/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {LayerBox, Point, Rect} from './types';

const GEOMETRY_EPSILON = 1e-9;

export function intersectsRect(a: Rect, b: Rect) {
    return a.x <= b.x + b.width
        && a.x + a.width >= b.x
        && a.y <= b.y + b.height
        && a.y + a.height >= b.y;
}

export function containsRect(outer: Rect, inner: Rect) {
    return inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height;
}

export function containsRectPoint(rect: Rect, point: Point) {
    return point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height;
}

export function containsLayerPoint(layer: LayerBox, point: Point) {
    if (normalizeRotate(layer.rotate) === 0) {
        return containsRectPoint(layer, point);
    }

    return containsRectPoint(layer, inverseRotatePointInLayer(layer, point));
}

export function intersectsLayerRect(layer: LayerBox, rect: Rect) {
    if (normalizeRotate(layer.rotate) === 0) {
        return intersectsRect(layer, rect);
    }

    if (!intersectsRect(getLayerBounds(layer), rect)) {
        return false;
    }

    const layerCorners = getLayerCorners(layer);
    const rectCorners = getRectCorners(rect);
    const radians = layer.rotate * Math.PI / 180;
    const axes = [
        {x: 1, y: 0},
        {x: 0, y: 1},
        {x: Math.cos(radians), y: Math.sin(radians)},
        {x: -Math.sin(radians), y: Math.cos(radians)},
    ];

    return axes.every((axis) => projectionsOverlap(
        projectPoints(layerCorners, axis),
        projectPoints(rectCorners, axis),
    ));
}

export function containsLayerRect(rect: Rect, layer: LayerBox) {
    return getLayerCorners(layer).every((point) => {
        return point.x >= rect.x - GEOMETRY_EPSILON
            && point.x <= rect.x + rect.width + GEOMETRY_EPSILON
            && point.y >= rect.y - GEOMETRY_EPSILON
            && point.y <= rect.y + rect.height + GEOMETRY_EPSILON;
    });
}

export function getLayerCorners(layer: LayerBox): Point[] {
    const center = getLayerCenter(layer);

    return getRectCorners(layer).map((corner) => rotatePoint(
        center,
        corner,
        normalizeRotate(layer.rotate),
    ));
}

export function getLayerBounds(layer: LayerBox): Rect {
    if (normalizeRotate(layer.rotate) === 0) {
        return {
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
        };
    }

    const corners = getLayerCorners(layer);
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function getRectCorners(rect: Rect): Point[] {
    return [
        {x: rect.x, y: rect.y},
        {x: rect.x + rect.width, y: rect.y},
        {x: rect.x + rect.width, y: rect.y + rect.height},
        {x: rect.x, y: rect.y + rect.height},
    ];
}

function projectPoints(points: Point[], axis: Point) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        const projection = point.x * axis.x + point.y * axis.y;
        min = Math.min(min, projection);
        max = Math.max(max, projection);
    }

    return {min, max};
}

function projectionsOverlap(a: {min: number; max: number}, b: {min: number; max: number}) {
    return a.max >= b.min - GEOMETRY_EPSILON
        && b.max >= a.min - GEOMETRY_EPSILON;
}

function inverseRotatePointInLayer(layer: LayerBox, point: Point) {
    return rotatePoint(getLayerCenter(layer), point, -layer.rotate);
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

function getLayerCenter(layer: LayerBox): Point {
    return {
        x: layer.x + layer.width / 2,
        y: layer.y + layer.height / 2,
    };
}

function normalizeRotate(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return ((value % 360) + 360) % 360;
}
