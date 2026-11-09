/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {
    isInsideArtboard,
    screenToArtboardLocal,
    type ArtboardBounds,
    type ViewportCamera,
    type ViewportPoint,
} from './ViewportMath.ts';

export interface ViewportClientRectOrigin {
    left: number;
    top: number;
}

export interface ArtboardDropPoint {
    position: ViewportPoint;
    within: boolean;
}

/** Convert a browser client point through viewport space into active-artboard local coordinates. */
export const resolveArtboardDropPoint = (
    clientPoint: ViewportPoint,
    viewportRect: ViewportClientRectOrigin,
    camera: ViewportCamera,
    artboard: ArtboardBounds,
): ArtboardDropPoint => {
    const position = screenToArtboardLocal({
        x: clientPoint.x - viewportRect.left,
        y: clientPoint.y - viewportRect.top,
    }, camera, artboard);
    return {position, within: isInsideArtboard(position, artboard)};
};
