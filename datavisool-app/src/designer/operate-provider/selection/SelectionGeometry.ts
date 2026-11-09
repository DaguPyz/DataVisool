/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {
    LayerConfigMap,
    SelectionAlignment,
    SelectionAlignmentMove,
    SelectionBounds,
    SelectionObjectGeometry,
} from "./SelectionTypes.ts";
import {
    expandSelectionTreeIds,
    normalizeSelectionIds,
    resolveTransformLeafIds,
} from "./SelectionPolicy.ts";

const finiteNumber = (value: number | undefined, fallback = 0): number => {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const createBounds = (minX: number, minY: number, maxX: number, maxY: number): SelectionBounds => ({
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
});

const ILL_CONDITIONED_RESIZE_THRESHOLD = 0.25;

const smoothStep = (value: number): number => {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
};

export const calculateLayerBounds = (id: string, layers: LayerConfigMap): SelectionBounds | null => {
    const layer = layers[id];
    if (!layer || layer.type === "group")
        return null;

    const x = finiteNumber(layer.x);
    const y = finiteNumber(layer.y);
    const width = Math.max(0, finiteNumber(layer.width));
    const height = Math.max(0, finiteNumber(layer.height));
    const rotate = finiteNumber(layer.rotate);
    const radians = rotate * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const corners = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    corners.forEach(([cornerX, cornerY]) => {
        const offsetX = cornerX - centerX;
        const offsetY = cornerY - centerY;
        const rotatedX = centerX + offsetX * cos - offsetY * sin;
        const rotatedY = centerY + offsetX * sin + offsetY * cos;
        minX = Math.min(minX, rotatedX);
        minY = Math.min(minY, rotatedY);
        maxX = Math.max(maxX, rotatedX);
        maxY = Math.max(maxY, rotatedY);
    });

    return createBounds(minX, minY, maxX, maxY);
};

export const combineSelectionBounds = (boundsList: readonly SelectionBounds[]): SelectionBounds | null => {
    if (boundsList.length === 0)
        return null;

    return createBounds(
        Math.min(...boundsList.map((bounds) => bounds.minX)),
        Math.min(...boundsList.map((bounds) => bounds.minY)),
        Math.max(...boundsList.map((bounds) => bounds.maxX)),
        Math.max(...boundsList.map((bounds) => bounds.maxY)),
    );
};

export const calculateLayerIdsBounds = (ids: readonly string[], layers: LayerConfigMap): SelectionBounds | null => {
    const boundsList = Array.from(new Set(ids))
        .map((id) => calculateLayerBounds(id, layers))
        .filter((bounds): bounds is SelectionBounds => Boolean(bounds));
    return combineSelectionBounds(boundsList);
};

export const calculateSingleLayerResizeToBounds = (
    id: string,
    layers: LayerConfigMap,
    targetWidth: number,
    targetHeight: number,
    direction: readonly number[],
) => {
    const layer = layers[id];
    const currentBounds = calculateLayerBounds(id, layers);
    if (!layer || layer.type === "group" || !currentBounds)
        return null;

    const width = Math.max(1, finiteNumber(layer.width, 1));
    const height = Math.max(1, finiteNumber(layer.height, 1));
    const radians = finiteNumber(layer.rotate) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const determinant = cos * cos - sin * sin;
    const widthChanged = Math.abs(targetWidth - currentBounds.width) >= Math.abs(targetHeight - currentBounds.height);
    const stableScale = widthChanged
        ? targetWidth / Math.max(currentBounds.width, 1)
        : targetHeight / Math.max(currentBounds.height, 1);
    const stableWidth = Math.max(1, width * stableScale);
    const stableHeight = Math.max(1, height * stableScale);
    let nextWidth = stableWidth;
    let nextHeight = stableHeight;

    if (Math.abs(determinant) > 1e-6) {
        const exactWidth = (cos * targetWidth - sin * targetHeight) / determinant;
        const exactHeight = (cos * targetHeight - sin * targetWidth) / determinant;
        if (exactWidth >= 1 && exactHeight >= 1 && Number.isFinite(exactWidth) && Number.isFinite(exactHeight)) {
            const exactWeight = smoothStep(Math.abs(determinant) / ILL_CONDITIONED_RESIZE_THRESHOLD);
            nextWidth = stableWidth + (exactWidth - stableWidth) * exactWeight;
            nextHeight = stableHeight + (exactHeight - stableHeight) * exactWeight;
        }
    }

    const provisionalLayer = {...layer, width: nextWidth, height: nextHeight};
    const provisionalBounds = calculateLayerBounds(id, {[id]: provisionalLayer});
    if (!provisionalBounds)
        return null;
    const desiredMinX = direction[0] === -1
        ? currentBounds.maxX - provisionalBounds.width
        : currentBounds.minX;
    const desiredMinY = direction[1] === -1
        ? currentBounds.maxY - provisionalBounds.height
        : currentBounds.minY;

    return {
        id,
        x: finiteNumber(layer.x) + desiredMinX - provisionalBounds.minX,
        y: finiteNumber(layer.y) + desiredMinY - provisionalBounds.minY,
        width: nextWidth,
        height: nextHeight,
    };
};

export const calculateSelectionObjectBounds = (id: string, layers: LayerConfigMap): SelectionBounds | null => {
    const leafIds = expandSelectionTreeIds([id], layers).filter((treeId) => layers[treeId]?.type !== "group");
    return calculateLayerIdsBounds(leafIds, layers);
};

export const resolveTransformSelectionGeometries = (
    ids: readonly string[],
    layers: LayerConfigMap,
): SelectionObjectGeometry[] => {
    return normalizeSelectionIds(ids, layers).flatMap((id) => {
        const targetIds = resolveTransformLeafIds([id], layers);
        const bounds = calculateLayerIdsBounds(targetIds, layers);
        return bounds ? [{id, targetIds, bounds}] : [];
    });
};

const calculateAlignmentDelta = (
    objectBounds: SelectionBounds,
    selectionBounds: SelectionBounds,
    alignment: SelectionAlignment,
): {dx: number; dy: number} => {
    switch (alignment) {
        case "left":
            return {dx: selectionBounds.minX - objectBounds.minX, dy: 0};
        case "right":
            return {dx: selectionBounds.maxX - objectBounds.maxX, dy: 0};
        case "top":
            return {dx: 0, dy: selectionBounds.minY - objectBounds.minY};
        case "bottom":
            return {dx: 0, dy: selectionBounds.maxY - objectBounds.maxY};
        case "horizontalCenter":
            return {
                dx: (selectionBounds.minX + selectionBounds.maxX - objectBounds.minX - objectBounds.maxX) / 2,
                dy: 0,
            };
        case "verticalCenter":
            return {
                dx: 0,
                dy: (selectionBounds.minY + selectionBounds.maxY - objectBounds.minY - objectBounds.maxY) / 2,
            };
    }
};

export const calculateSelectionAlignmentMoves = (
    ids: readonly string[],
    layers: LayerConfigMap,
    alignment: SelectionAlignment,
): SelectionAlignmentMove[] => {
    const geometries = resolveTransformSelectionGeometries(ids, layers);
    const selectionBounds = combineSelectionBounds(geometries.map((geometry) => geometry.bounds));
    if (!selectionBounds)
        return [];

    return geometries.map((geometry) => ({
        ...geometry,
        ...calculateAlignmentDelta(geometry.bounds, selectionBounds, alignment),
    }));
};
