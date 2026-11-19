/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/** The camera maps unbounded workspace coordinates into the editor viewport. */
export interface ViewportCamera {
    translationX: number;
    translationY: number;
    scale: number;
}

export interface ViewportPoint {
    x: number;
    y: number;
}

export interface ArtboardBounds extends ViewportPoint {
    width: number;
    height: number;
}

export interface ViewportInsets {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export const MIN_VIEWPORT_SCALE = 0.05;
export const MAX_VIEWPORT_SCALE = 5;

export const clampViewportScale = (scale: number): number => {
    if (!Number.isFinite(scale)) return 1;
    return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
};

export const worldToScreen = (point: ViewportPoint, camera: ViewportCamera): ViewportPoint => ({
    x: point.x * camera.scale + camera.translationX,
    y: point.y * camera.scale + camera.translationY,
});

export const screenToWorld = (point: ViewportPoint, camera: ViewportCamera): ViewportPoint => ({
    x: (point.x - camera.translationX) / camera.scale,
    y: (point.y - camera.translationY) / camera.scale,
});

export const worldToArtboardLocal = (point: ViewportPoint, artboard: ArtboardBounds): ViewportPoint => ({
    x: point.x - artboard.x,
    y: point.y - artboard.y,
});

export const screenToArtboardLocal = (
    point: ViewportPoint,
    camera: ViewportCamera,
    artboard: ArtboardBounds,
): ViewportPoint => worldToArtboardLocal(screenToWorld(point, camera), artboard);

export const isInsideArtboard = (point: ViewportPoint, artboard: ArtboardBounds): boolean =>
    point.x >= 0 && point.y >= 0 && point.x <= artboard.width && point.y <= artboard.height;

/** Keep the world point below anchor at exactly the same screen position. */
export const zoomAtPoint = (
    camera: ViewportCamera,
    anchor: ViewportPoint,
    requestedScale: number,
): ViewportCamera => {
    const scale = clampViewportScale(requestedScale);
    const world = screenToWorld(anchor, camera);
    return {
        translationX: anchor.x - world.x * scale,
        translationY: anchor.y - world.y * scale,
        scale,
    };
};

/** Center a finite artboard in the portion of the viewport not covered by panels. */
export const fitArtboard = (
    viewport: {width: number; height: number},
    artboard: ArtboardBounds,
    insets: Partial<ViewportInsets> = {},
    padding = 48,
): ViewportCamera => {
    const left = Math.max(0, insets.left ?? 0);
    const top = Math.max(0, insets.top ?? 0);
    const right = Math.max(0, insets.right ?? 0);
    const bottom = Math.max(0, insets.bottom ?? 0);
    const width = Math.max(1, viewport.width - left - right - padding * 2);
    const height = Math.max(1, viewport.height - top - bottom - padding * 2);
    const artboardWidth = Math.max(1, artboard.width);
    const artboardHeight = Math.max(1, artboard.height);
    const scale = clampViewportScale(Math.min(width / artboardWidth, height / artboardHeight));
    const centerX = left + (viewport.width - left - right) / 2;
    const centerY = top + (viewport.height - top - bottom) / 2;
    return {
        translationX: centerX - (artboard.x + artboardWidth / 2) * scale,
        translationY: centerY - (artboard.y + artboardHeight / 2) * scale,
        scale,
    };
};

export const visibleWorldBounds = (camera: ViewportCamera, viewport: {width: number; height: number}): ArtboardBounds => {
    const topLeft = screenToWorld({x: 0, y: 0}, camera);
    return {
        ...topLeft,
        width: viewport.width / camera.scale,
        height: viewport.height / camera.scale,
    };
};
