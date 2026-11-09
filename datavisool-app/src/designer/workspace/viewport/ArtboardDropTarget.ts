/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import managerStore from '@/designer/manager/ManagerStore.ts';
import viewportStore from './ViewportStore.ts';
import {resolveArtboardDropPoint} from './ArtboardDropMath.ts';
import type {ArtboardBounds, ViewportPoint} from './ViewportMath.ts';
import type {ArtboardDropPoint} from './ArtboardDropMath.ts';

const validDimension = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const isViewportUiTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && Boolean(target.closest('[data-viewport-ui]'));

/** Resolve a client point against the current editor viewport and canvas. */
export const getMainCanvasDropPoint = (
    clientPoint: ViewportPoint,
    canvasElement: HTMLElement,
    eventTarget?: EventTarget | null,
): ArtboardDropPoint | null => {
    const viewportElement = canvasElement.closest<HTMLElement>('.designer-ds-container');
    if (!viewportElement) return null;

    const manager = managerStore.currentManager;
    const canvasConfig = manager?.canvasManager?.canvasConfig;
    const bounds: ArtboardBounds = {
        x: 0,
        y: 0,
        width: validDimension(canvasConfig?.width, canvasElement.offsetWidth),
        height: validDimension(canvasConfig?.height, canvasElement.offsetHeight),
    };

    if (isViewportUiTarget(eventTarget ?? null) || bounds.width <= 0 || bounds.height <= 0)
        return {position: {x: 0, y: 0}, within: false};

    const rect = viewportElement.getBoundingClientRect();
    return resolveArtboardDropPoint(clientPoint, rect, viewportStore.camera, bounds);
};
