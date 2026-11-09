/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useCallback, useLayoutEffect, useRef, useState, type RefObject} from "react";

export interface BPCanvasMetrics {
    left: number;
    top: number;
    width: number;
    height: number;
    resolution: number;
}

export type BPCanvasMetricsListener = (
    metrics: BPCanvasMetrics,
    previous: BPCanvasMetrics | null
) => void;

export function measureBPCanvasViewport(
    viewport: Pick<HTMLElement, "getBoundingClientRect">,
    resolution = window.devicePixelRatio || 1
): BPCanvasMetrics {
    const rect = viewport.getBoundingClientRect();
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        resolution,
    };
}

export function useBPCanvasMetrics(
    viewportRef: RefObject<HTMLElement | null>,
    onMetricsChange?: BPCanvasMetricsListener
) {
    const [metrics, setMetrics] = useState<BPCanvasMetrics | null>(null);
    const metricsRef = useRef<BPCanvasMetrics | null>(null);
    const listenerRef = useRef(onMetricsChange);
    listenerRef.current = onMetricsChange;

    const refresh = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport)
            return null;

        const next = measureBPCanvasViewport(viewport, window.devicePixelRatio || 1);
        const previous = metricsRef.current;
        const changed = !sameMetrics(previous, next);

        const manager = window.DATAVISOOL_ENV.currentManager?.bluePrintManager;
        if (manager)
            manager.canvasOffset = {x: next.left, y: next.top};

        if (changed) {
            metricsRef.current = next;
            setMetrics(next);
            listenerRef.current?.(next, previous);
        }
        return next;
    }, [viewportRef]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport)
            return undefined;

        let active = true;
        const measure = () => {
            if (active)
                refresh();
        };
        const observer = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(measure);
        const mutationObserver = typeof MutationObserver === "undefined"
            ? null
            : new MutationObserver(measure);

        observer?.observe(viewport);
        for (let ancestor = viewport.parentElement; ancestor; ancestor = ancestor.parentElement)
            mutationObserver?.observe(ancestor, {attributes: true, attributeFilter: ["class", "style"]});
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        window.addEventListener("transitionend", measure, true);
        window.visualViewport?.addEventListener("resize", measure);
        window.visualViewport?.addEventListener("scroll", measure);
        measure();

        return () => {
            active = false;
            observer?.disconnect();
            mutationObserver?.disconnect();
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
            window.removeEventListener("transitionend", measure, true);
            window.visualViewport?.removeEventListener("resize", measure);
            window.visualViewport?.removeEventListener("scroll", measure);
        };
    }, [refresh, viewportRef]);

    return {metrics, refresh};
}

function sameMetrics(previous: BPCanvasMetrics | null, next: BPCanvasMetrics) {
    return previous !== null &&
        previous.left === next.left &&
        previous.top === next.top &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.resolution === next.resolution;
}
