/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {resolveArtboardDropPoint} from '@/plugins/editor-canvas/viewport/ArtboardDropMath.ts';
import type {ArtboardBounds, ViewportPoint} from '@/plugins/editor-canvas/viewport/ViewportMath.ts';
import type {ArtboardDropPoint} from '@/plugins/editor-canvas/viewport/ArtboardDropMath.ts';

const validDimension = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const isViewportUiTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && Boolean(target.closest('[data-viewport-ui]'));

/** Resolve a client point against the current editor viewport and canvas. */
export const getMainCanvasDropPoint = (
    clientPoint: ViewportPoint,
    canvasElement: HTMLElement,
    camera: import('./ViewportMath.ts').ViewportCamera,
    canvasSize: {readonly width?: number; readonly height?: number},
    eventTarget?: EventTarget | null,
): ArtboardDropPoint | null => {
    const viewportElement = canvasElement.closest<HTMLElement>('.designer-ds-container');
    if (!viewportElement) return null;

    const bounds: ArtboardBounds = {
        x: 0,
        y: 0,
        width: validDimension(canvasSize.width, canvasElement.offsetWidth),
        height: validDimension(canvasSize.height, canvasElement.offsetHeight),
    };

    if (isViewportUiTarget(eventTarget ?? null) || bounds.width <= 0 || bounds.height <= 0)
        return {position: {x: 0, y: 0}, within: false};

    const rect = viewportElement.getBoundingClientRect();
    return resolveArtboardDropPoint(clientPoint, rect, camera, bounds);
};
