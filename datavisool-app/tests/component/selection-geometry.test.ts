/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import type {ILayerItem} from "@datavisool/sdk/types";
import {
    calculateLayerBounds,
    calculateSelectionAlignmentMoves,
    calculateSelectionObjectBounds,
    calculateSingleLayerResizeToBounds,
} from "@/designer/operate-provider/selection/SelectionGeometry.ts";

describe("SelectionGeometry", () => {
    test("calculates the axis-aligned boundary of a rotated layer", () => {
        const layers: Record<string, ILayerItem> = {
            rotated: {id: "rotated", type: "rect", x: 0, y: 0, width: 4, height: 2, rotate: 90},
        };

        const bounds = calculateLayerBounds("rotated", layers)!;
        expect(bounds.minX).toBeCloseTo(1);
        expect(bounds.minY).toBeCloseTo(-1);
        expect(bounds.maxX).toBeCloseTo(3);
        expect(bounds.maxY).toBeCloseTo(3);
        expect(bounds.width).toBeCloseTo(2);
        expect(bounds.height).toBeCloseTo(4);
    });

    test("resizes a rotated single-child group along the requested canvas axis", () => {
        const layers: Record<string, ILayerItem> = {
            rotated: {id: "rotated", type: "rect", x: 10, y: 20, width: 100, height: 20, rotate: 90},
        };
        const resized = calculateSingleLayerResizeToBounds("rotated", layers, 21, 100, [1, 1])!;
        const nextLayers = {rotated: {...layers.rotated, ...resized}};
        const bounds = calculateLayerBounds("rotated", nextLayers)!;

        expect(resized.width).toBeCloseTo(100);
        expect(resized.height).toBeCloseTo(21);
        expect(bounds.width).toBeCloseTo(21);
        expect(bounds.height).toBeCloseTo(100);
    });

    test("keeps near-45-degree single-child resize stable", () => {
        const layers: Record<string, ILayerItem> = {
            rotated: {id: "rotated", type: "rect", x: 10, y: 20, width: 100, height: 20, rotate: 46},
        };
        const currentBounds = calculateLayerBounds("rotated", layers)!;
        const resized = calculateSingleLayerResizeToBounds(
            "rotated",
            layers,
            currentBounds.width + 1,
            currentBounds.height,
            [1, 1],
        )!;
        const nextBounds = calculateLayerBounds("rotated", {rotated: {...layers.rotated, ...resized}})!;

        expect(Math.abs(resized.width - 100)).toBeLessThan(3);
        expect(Math.abs(resized.height - 20)).toBeLessThan(3);
        expect(nextBounds.width).toBeCloseTo(currentBounds.width + 1, 0);
        expect(Math.abs(nextBounds.height - currentBounds.height)).toBeLessThan(2);
    });

    test("combines all descendant leaf boundaries for a group", () => {
        const layers: Record<string, ILayerItem> = {
            group: {id: "group", type: "group"},
            rotated: {id: "rotated", type: "rect", pid: "group", x: 0, y: 0, width: 4, height: 2, rotate: 90},
            leaf: {id: "leaf", type: "rect", pid: "group", x: 10, y: 2, width: 2, height: 2},
        };

        const bounds = calculateSelectionObjectBounds("group", layers)!;
        expect(bounds.minX).toBeCloseTo(1);
        expect(bounds.minY).toBeCloseTo(-1);
        expect(bounds.maxX).toBeCloseTo(12);
        expect(bounds.maxY).toBeCloseTo(4);
        expect(bounds.width).toBeCloseTo(11);
        expect(bounds.height).toBeCloseTo(5);
    });

    test("returns one shared displacement for every transformable member of a canonical group", () => {
        const layers: Record<string, ILayerItem> = {
            group: {id: "group", type: "group", order: 1},
            groupA: {id: "groupA", type: "rect", pid: "group", x: 10, y: 0, width: 10, height: 10, order: 2},
            groupB: {id: "groupB", type: "rect", pid: "group", x: 25, y: 0, width: 5, height: 10, order: 3},
            leaf: {id: "leaf", type: "rect", x: 50, y: 0, width: 10, height: 10, order: 4},
        };

        expect(calculateSelectionAlignmentMoves(["group", "leaf"], layers, "left")).toEqual([
            expect.objectContaining({id: "group", targetIds: ["groupA", "groupB"], dx: 0, dy: 0}),
            expect.objectContaining({id: "leaf", targetIds: ["leaf"], dx: -40, dy: 0}),
        ]);
    });

    test("excludes effective locked and hidden leaves from alignment targets", () => {
        const layers: Record<string, ILayerItem> = {
            group: {id: "group", type: "group"},
            movable: {id: "movable", type: "rect", pid: "group", x: 10, y: 10, width: 10, height: 10},
            locked: {id: "locked", type: "rect", pid: "group", x: 30, y: 10, width: 10, height: 10, lock: true},
            hidden: {id: "hidden", type: "rect", x: 60, y: 10, width: 10, height: 10, hide: true},
            target: {id: "target", type: "rect", x: 100, y: 10, width: 10, height: 10},
        };

        expect(calculateSelectionAlignmentMoves(["group", "hidden", "target"], layers, "right")).toEqual([
            expect.objectContaining({id: "group", targetIds: ["movable"], dx: 90, dy: 0}),
            expect.objectContaining({id: "target", targetIds: ["target"], dx: 0, dy: 0}),
        ]);
    });
});
