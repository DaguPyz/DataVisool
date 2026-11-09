/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import type {ILayerItem} from "@datavisool/sdk/types";
import {
    expandSelectionTreeIds,
    filterCanvasSelectableIds,
    filterManagementSelectableIds,
    getSelectionLockState,
    getEffectiveLayerState,
    normalizeSelectionIds,
    resolveBoxSelectionIds,
    resolveCommandTargetIds,
    resolveContextMenuSelectionIds,
    resolvePointSelectionIds,
    resolveTopLevelSelectionIds,
    resolveTransformLeafIds,
    toggleSelectionIds,
} from "@/designer/operate-provider/selection/SelectionPolicy.ts";

const createLayers = (): Record<string, ILayerItem> => ({
    rootGroup: {id: "rootGroup", type: "group", order: 1},
    nestedGroup: {id: "nestedGroup", type: "group", pid: "rootGroup", order: 2},
    childA: {id: "childA", type: "rect", pid: "nestedGroup", order: 3},
    childB: {id: "childB", type: "rect", pid: "nestedGroup", order: 4},
    rootLeaf: {id: "rootLeaf", type: "rect", order: 5},
});

describe("SelectionPolicy", () => {
    test("filters invalid IDs, removes duplicates, and lets a selected parent represent its descendants", () => {
        const layers = createLayers();

        expect(normalizeSelectionIds([
            "childA",
            "missing",
            "rootGroup",
            "childA",
            "rootLeaf",
        ], layers)).toEqual(["rootGroup", "rootLeaf"]);
    });

    test("resolves effective hidden and locked state through safe ancestor traversal", () => {
        const layers = createLayers();
        layers.rootGroup.hide = true;
        layers.nestedGroup.lock = true;
        layers.broken = {id: "broken", type: "rect", pid: "missing", lock: true};
        layers.cycleA = {id: "cycleA", type: "group", pid: "cycleB", hide: true};
        layers.cycleB = {id: "cycleB", type: "group", pid: "cycleA", lock: true};

        expect(getEffectiveLayerState("childA", layers)).toEqual({hidden: true, locked: true});
        expect(getEffectiveLayerState("broken", layers)).toEqual({hidden: false, locked: true});
        expect(getEffectiveLayerState("cycleA", layers)).toEqual({hidden: true, locked: true});
    });

    test("uses the same group-depth policy for point and box selection", () => {
        const layers = createLayers();

        expect(resolvePointSelectionIds("childA", layers)).toEqual(["rootGroup"]);
        expect(resolveBoxSelectionIds(["childA", "childB"], layers)).toEqual(["rootGroup"]);
        expect(resolvePointSelectionIds("childA", layers, {deep: true})).toEqual(["childA"]);
        expect(resolveBoxSelectionIds(["childA", "childB"], layers, {deep: true})).toEqual(["childA", "childB"]);
    });

    test("excludes effectively hidden and locked candidates from canvas selection but keeps management selection", () => {
        const layers = createLayers();
        layers.nestedGroup.lock = true;
        layers.rootLeaf.hide = true;

        expect(filterCanvasSelectableIds(["childA", "rootLeaf"], layers)).toEqual([]);
        expect(filterManagementSelectableIds(["childA", "rootLeaf", "missing"], layers)).toEqual(["childA", "rootLeaf"]);
        expect(resolveBoxSelectionIds(["childA", "rootLeaf"], layers)).toEqual([]);
    });

    test("toggles every hit and replaces conflicting group depth", () => {
        const layers = createLayers();

        expect(toggleSelectionIds(["rootLeaf", "childA"], ["rootLeaf", "childB"], layers)).toEqual(["childA", "childB"]);
        expect(toggleSelectionIds(["rootGroup"], ["childA", "childB"], layers)).toEqual(["childA", "childB"]);
        expect(toggleSelectionIds(["childA", "childB"], ["rootGroup"], layers)).toEqual(["rootGroup"]);
    });

    test("right-click selects a new target, preserves a current multi-selection, and clears on blank", () => {
        const layers = createLayers();

        expect(resolveContextMenuSelectionIds(["childA"], ["rootLeaf"], layers)).toEqual(["rootGroup"]);
        expect(resolveContextMenuSelectionIds(["childA"], ["rootGroup", "rootLeaf"], layers)).toBeNull();
        expect(resolveContextMenuSelectionIds([], ["rootLeaf"], layers)).toEqual([]);
    });

    test("right-click skips an unselected locked top layer but keeps it available for explicit management", () => {
        const layers = createLayers();
        layers.childA.lock = true;

        expect(resolveContextMenuSelectionIds(["childA", "rootLeaf"], [], layers)).toEqual(["rootLeaf"]);
        expect(resolveContextMenuSelectionIds(["childA"], [], layers)).toEqual([]);
        expect(filterManagementSelectableIds(["childA"], layers)).toEqual(["childA"]);
    });

    test("expands nested groups once and resolves transformable leaves", () => {
        const layers = createLayers();
        layers.childA.lock = true;
        layers.childB.hide = true;

        expect(expandSelectionTreeIds(["rootGroup", "childA"], layers)).toEqual([
            "rootGroup",
            "nestedGroup",
            "childA",
            "childB",
        ]);
        expect(resolveTransformLeafIds(["rootGroup", "rootLeaf"], layers)).toEqual(["rootLeaf"]);
    });

    test("selects only effective canvas roots and treats a broken parent as a root", () => {
        const layers = createLayers();
        layers.rootGroup.lock = true;
        layers.broken = {id: "broken", type: "rect", pid: "missing", order: 6};

        expect(resolveTopLevelSelectionIds(layers)).toEqual(["rootLeaf", "broken"]);
    });

    test("does not select a root group when none of its descendants can participate on canvas", () => {
        const layers = createLayers();
        layers.childA.lock = true;
        layers.childB.hide = true;
        layers.rootLeaf.hide = true;

        expect(resolveTopLevelSelectionIds(layers)).toEqual([]);
        layers.childA.lock = false;
        expect(resolveTopLevelSelectionIds(layers)).toEqual(["rootGroup"]);
    });

    test("keeps structural command targets complete and only allows locked trees for management commands", () => {
        const layers = createLayers();
        layers.childB.lock = true;

        expect(resolveCommandTargetIds(["rootGroup", "rootLeaf"], layers)).toEqual(["rootLeaf"]);
        expect(resolveCommandTargetIds(["rootGroup"], layers, {allowLockedManagement: true})).toEqual([
            "rootGroup",
            "nestedGroup",
            "childA",
            "childB",
        ]);
    });

    test("reports both lock actions for a mixed selection tree", () => {
        const layers = createLayers();
        layers.childB.lock = true;

        expect(getSelectionLockState(["rootGroup"], layers)).toEqual({
            hasLocked: true,
            hasUnlocked: true,
        });
        layers.rootGroup.lock = true;
        expect(getSelectionLockState(["rootGroup"], layers)).toEqual({
            hasLocked: true,
            hasUnlocked: false,
        });
    });
});
