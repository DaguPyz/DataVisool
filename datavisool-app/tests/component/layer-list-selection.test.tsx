/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import type {ILayerItem} from "@datavisool/sdk/types";

const selectionMocks = vi.hoisted(() => ({
    targetIds: [] as string[],
    selectionSource: "system",
    setTargetIds: vi.fn((ids: string[], source = "system") => {
        selectionMocks.targetIds = ids;
        selectionMocks.selectionSource = source;
    }),
}));

const rightMocks = vi.hoisted(() => ({
    activeElem: {id: null as string | null},
    activeConfig: vi.fn(),
}));

vi.mock("@/designer/operate-provider/EventOperateStore", () => ({
    default: {
        get targetIds() {
            return selectionMocks.targetIds;
        },
        get selectionSource() {
            return selectionMocks.selectionSource;
        },
        setTargetIds: selectionMocks.setTargetIds,
        interactionRef: null,
    },
}));

vi.mock("@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy", () => ({
    default: {doLockUpd: vi.fn(), doHideUpd: vi.fn()},
}));

vi.mock("@/designer/right/RightStore.ts", () => ({default: rightMocks}));

import layerListStore, {LayerListStore} from "@/designer/left/layer-list/LayerListStore.ts";
import LayerItem from "@/designer/left/layer-list/item/LayerItem.tsx";

const createLayers = (): Record<string, ILayerItem> => ({
    a: {id: "a", type: "rect", name: "A", order: 3, next: "b"},
    b: {id: "b", type: "rect", name: "B", order: 2, prev: "a", next: "c", hide: true},
    c: {id: "c", type: "rect", name: "C", order: 1, prev: "b", lock: true},
});

const mouseEvent = (overrides: Partial<{ctrlKey: boolean; metaKey: boolean; shiftKey: boolean}> = {}) => ({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
}) as any;

describe("layer-list selection", () => {
    let store: LayerListStore;
    let layers: Record<string, ILayerItem>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        selectionMocks.targetIds = [];
        selectionMocks.selectionSource = "system";
        rightMocks.activeElem.id = null;
        layers = createLayers();
        (window as any).DATAVISOOL_ENV = {
            currentManager: {layerManager: {layerConfigs: layers}},
        };
        store = new LayerListStore();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        delete (window as any).DATAVISOOL_ENV;
    });

    test("single and Command/Ctrl clicks write canonical management selections", () => {
        store.selectedChange("b", mouseEvent());
        vi.runAllTimers();
        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["b"], "layer-list");

        store.selectedChange("c", mouseEvent({metaKey: true}));
        vi.runAllTimers();
        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["b", "c"], "layer-list");

        store.selectedChange("b", mouseEvent({ctrlKey: true}));
        vi.runAllTimers();
        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["c"], "layer-list");
    });

    test("Shift range includes hidden and locked rows as management selections", () => {
        store.selectedChange("a", mouseEvent());
        vi.runAllTimers();

        store.selectedChange("c", mouseEvent({shiftKey: true}));
        vi.runAllTimers();

        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["a", "b", "c"], "layer-list");
    });

    test("a stale range anchor falls back to the current selection", () => {
        store.selectedChange("a", mouseEvent());
        vi.runAllTimers();
        delete layers.a;
        selectionMocks.targetIds = ["b"];

        store.selectedChange("c", mouseEvent({shiftKey: true}));
        vi.runAllTimers();

        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["b", "c"], "layer-list");
    });

    test("Shift range continues past an empty group", () => {
        layers.a.order = 4;
        layers.a.next = "empty";
        layers.empty = {id: "empty", type: "group", order: 3, prev: "a", next: "b"};
        layers.b.prev = "empty";

        store.selectedChange("a", mouseEvent());
        vi.runAllTimers();
        store.selectedChange("c", mouseEvent({shiftKey: true}));
        vi.runAllTimers();

        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["a", "empty", "b", "c"], "layer-list");
    });

    test("Shift range continues when its upper endpoint is an empty group", () => {
        layers.empty = {id: "empty", type: "group", order: 4, next: "b"};
        layers.b.order = 3;
        layers.b.prev = "empty";
        layers.b.next = "c";
        layers.c.order = 2;
        layers.c.prev = "b";
        delete layers.a;

        store.selectedChange("empty", mouseEvent());
        vi.runAllTimers();
        store.selectedChange("c", mouseEvent({shiftKey: true}));
        vi.runAllTimers();

        expect(selectionMocks.setTargetIds).toHaveBeenLastCalledWith(["empty", "b", "c"], "layer-list");
    });

    test("hidden rows remain clickable, sync the property panel, and double-click enters rename", () => {
        const selectedSpy = vi.spyOn(layerListStore, "selectedChange").mockImplementation(() => ["b"]);
        render(<LayerItem compId="b" name="B" type="rect" hide/>);

        const row = screen.getByTitle("B");
        fireEvent.click(row);
        expect(selectedSpy).toHaveBeenCalledTimes(1);
        expect(rightMocks.activeConfig).toHaveBeenCalledWith("b", "rect", "layer-list");

        fireEvent.doubleClick(row);
        expect(screen.getByRole("textbox")).toHaveValue("B");
        selectedSpy.mockRestore();
    });

    test("cancelling the clicked row keeps the property panel on a remaining selection", () => {
        rightMocks.activeElem.id = "b";
        const selectedSpy = vi.spyOn(layerListStore, "selectedChange").mockImplementation(() => ["c"]);
        render(<LayerItem compId="b" name="B" type="rect" selected/>);

        fireEvent.click(screen.getByTitle("B"), {metaKey: true});

        expect(rightMocks.activeConfig).toHaveBeenCalledWith("c", "rect", "layer-list");
        selectedSpy.mockRestore();
    });
});
