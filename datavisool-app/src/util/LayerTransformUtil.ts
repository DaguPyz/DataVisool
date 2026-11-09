/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {CSSProperties} from "react";
import {ILayerTransformItem} from "@datavisool/sdk/types";

const DEFAULT_TRANSFORM_ORIGIN = "50% 50%";

const normalizeNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return 0;
};

export const normalizeLayerTransform = (transform?: Partial<ILayerTransformItem> | null): Required<ILayerTransformItem> => {
    const next = transform ?? {};
    return {
        rotateZ: normalizeNumber(next.rotateZ),
        rotateX: normalizeNumber(next.rotateX),
        rotateY: normalizeNumber(next.rotateY),
        skewX: normalizeNumber(next.skewX),
        skewY: normalizeNumber(next.skewY),
        perspective: normalizeNumber(next.perspective),
        transformOrigin: typeof next.transformOrigin === "string" && next.transformOrigin.trim()
            ? next.transformOrigin.trim()
            : DEFAULT_TRANSFORM_ORIGIN,
    };
};

export const buildLayerTransformString = (transform?: Partial<ILayerTransformItem> | null): string => {
    const next = normalizeLayerTransform(transform);
    const segments: string[] = [];
    if (next.perspective > 0)
        segments.push(`perspective(${next.perspective}px)`);
    segments.push(
        `rotateZ(${next.rotateZ}deg)`,
        `rotateX(${next.rotateX}deg)`,
        `rotateY(${next.rotateY}deg)`,
        `skewX(${next.skewX}deg)`,
        `skewY(${next.skewY}deg)`
    );
    return segments.join(" ");
};

export const buildLayerTransformStyle = (transform?: Partial<ILayerTransformItem> | null): CSSProperties => {
    const next = normalizeLayerTransform(transform);
    const has3D = next.perspective > 0 || next.rotateX !== 0 || next.rotateY !== 0;
    return {
        transform: buildLayerTransformString(next),
        transformOrigin: next.transformOrigin,
        transformStyle: has3D ? "preserve-3d" : undefined,
    };
};

export const buildLayerTransformDomStyle = (transform?: Partial<ILayerTransformItem> | null): Record<string, string> => {
    const style = buildLayerTransformStyle(transform);
    return Object.entries(style).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null)
            acc[key] = String(value);
        return acc;
    }, {} as Record<string, string>);
};

export const findLayerTransformTarget = (layerId: string): HTMLElement | null => {
    if (!layerId)
        return null;
    return document.querySelector(`[data-layer-transform="${layerId}"]`) as HTMLElement | null;
};
