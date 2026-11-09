/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import type {ILayerItem} from "@datavisool/sdk/types";

const storeMocks = vi.hoisted(() => ({
    targetIds: [] as string[],
    selectionSource: "canvas" as "canvas" | "layer-list" | "search" | "context-menu" | "system",
    setTargetIds: vi.fn(),
    refreshOverlay: vi.fn(),
    refreshLayerGeometry: vi.fn(),
    focusDesignerCanvas: vi.fn(),
}));

const historyMocks = vi.hoisted(() => ({
    doClone: vi.fn(() => ["cloneGroup", "cloneChild"]),
    doDelete: vi.fn(),
    doHideUpd: vi.fn(),
    doLockUpd: vi.fn(),
    doDrag: vi.fn(),
    doLayerToTop: vi.fn(),
    doLayerToBottom: vi.fn(),
    doLayerMoveUp: vi.fn(),
    doLayerMoveDown: vi.fn(),
}));

const externalMocks = vi.hoisted(() => ({
    copyToClipboard: vi.fn(async () => undefined),
    bindConfigToGvById: vi.fn(),
    unbindFromGv: vi.fn(),
    putHistory: vi.fn(),
}));

vi.mock("@/designer/operate-provider/EventOperateStore.ts", () => ({
    default: {
        get targetIds() {
            return storeMocks.targetIds;
        },
        get selectionSource() {
            return storeMocks.selectionSource;
        },
        setTargetIds: storeMocks.setTargetIds,
        interactionRef: {
            refreshOverlay: storeMocks.refreshOverlay,
            refreshLayerGeometry: storeMocks.refreshLayerGeometry,
        },
        focusDesignerCanvas: storeMocks.focusDesignerCanvas,
    },
}));

vi.mock("@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts", () => ({
    default: historyMocks,
}));

vi.mock("@/designer/operate-provider/undo-redo/HistoryOperator.ts", () => ({
    historyOperator: {put: externalMocks.putHistory},
}));

vi.mock("@/designer/right/RightStore.ts", () => ({
    default: {
        activeElem: {id: null},
        setContentVisible: vi.fn(),
        activeConfig: vi.fn(),
    },
}));

vi.mock("@/designer/left/global-variable/parse/ComponentDataGvParser.ts", () => ({
    default: {
        bindConfigToGvById: externalMocks.bindConfigToGvById,
        unbindFromGv: externalMocks.unbindFromGv,
    },
}));

vi.mock("@/util/TextUtil.ts", () => ({
    default: {copyToClipboard: externalMocks.copyToClipboard},
}));

vi.mock("@datavisool/ui", () => ({
    globalMessage: {messageApi: {success: vi.fn()}},
}));

import {
    doClone,
    doCopy,
    doDelete,
    doHide,
    doLock,
    groupLeftAligned,
    resolveSelectedCommandTargetIds,
    selectAll,
} from "@/designer/operate-provider/selection/SelectionCommands.ts";

const createLayers = (): Record<string, ILayerItem> => ({
    group: {id: "group", type: "group", order: 1},
    childA: {id: "childA", type: "rect", pid: "group", order: 2, x: 10, y: 10, width: 10, height: 10},
    childB: {id: "childB", type: "rect", pid: "group", order: 3, x: 25, y: 10, width: 10, height: 10},
    free: {id: "free", type: "rect", order: 4, x: 50, y: 20, width: 10, height: 10},
    locked: {id: "locked", type: "rect", order: 5, x: 0, y: 0, width: 10, height: 10, lock: true},
    hidden: {id: "hidden", type: "rect", order: 6, x: 80, y: 20, width: 10, height: 10, hide: true},
});

describe("SelectionCommands", () => {
    let layers: Record<string, ILayerItem>;
    const reRenderLayer = vi.fn();
    const delNodeEveryPage = vi.fn();
    const delItem = vi.fn((ids: string[]) => ids.forEach((id) => delete layers[id]));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        layers = createLayers();
        storeMocks.targetIds = [];
        storeMocks.selectionSource = "canvas";
        (window as any).DATAVISOOL_ENV = {
            currentManager: {
                layerManager: {
                    layerConfigs: layers,
                    controllers: {
                        childA: {getConfig: () => ({kind: "a"})},
                        childB: {getConfig: () => ({kind: "b"})},
                    },
                    reRenderLayer,
                    delItem,
                    layerHeader: "group",
                    layerTail: "hidden",
                },
                bluePrintManager: {
                    currentPageManager: {bpNodeLayoutMap: {childA: {}}},
                    delNodeEveryPage,
                },
            },
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (window as any).DATAVISOOL_ENV;
    });

    test("select all keeps only roots that have a canvas-selectable object", () => {
        layers.childA.lock = true;
        layers.childB.hide = true;

        selectAll();

        expect(storeMocks.setTargetIds).toHaveBeenCalledWith(["free"], "canvas");
    });

    test("locked trees require an explicit management selection source", () => {
        storeMocks.targetIds = ["locked"];
        expect(resolveSelectedCommandTargetIds()).toEqual([]);

        storeMocks.selectionSource = "layer-list";
        expect(resolveSelectedCommandTargetIds()).toEqual(["locked"]);
    });

    test("clone, copy, delete and hide all operate on the expanded group tree", async () => {
        vi.useFakeTimers();
        storeMocks.targetIds = ["group"];
        storeMocks.selectionSource = "layer-list";

        doClone();
        expect(historyMocks.doClone).toHaveBeenCalledWith(["group", "childA", "childB"]);
        await vi.advanceTimersByTimeAsync(10);
        expect(storeMocks.setTargetIds).toHaveBeenCalledWith(["cloneGroup", "cloneChild"], "system");

        doCopy();
        await Promise.resolve();
        const copied = JSON.parse(externalMocks.copyToClipboard.mock.calls.at(-1)?.[0] as string);
        expect(Object.keys(copied.layers)).toEqual(["group", "childA", "childB"]);

        doHide();
        expect(historyMocks.doHideUpd).toHaveBeenCalledWith(["group", "childA", "childB"], true);
        expect(storeMocks.setTargetIds).toHaveBeenLastCalledWith([]);

        layers.childB.hide = true;
        doDelete();
        expect(layers.group).toBeUndefined();
        expect(layers.childA).toBeUndefined();
        expect(layers.childB).toBeUndefined();
        expect(externalMocks.putHistory).toHaveBeenCalledTimes(1);
        expect(delNodeEveryPage).toHaveBeenCalledWith(["childA"]);
        expect(externalMocks.unbindFromGv).toHaveBeenCalledWith(["group", "childA", "childB"]);
    });

    test("locking expands the tree and retains the canonical selection", () => {
        storeMocks.targetIds = ["group"];
        storeMocks.selectionSource = "context-menu";

        doLock();

        expect(historyMocks.doLockUpd).toHaveBeenCalledWith([
            {id: "group", lock: true},
            {id: "childA", lock: true},
            {id: "childB", lock: true},
        ]);
        expect(storeMocks.setTargetIds).toHaveBeenCalledWith(["group"], "context-menu");
        expect(storeMocks.refreshOverlay).toHaveBeenCalledTimes(1);
    });

    test("explicit management deletion removes a hidden layer and records its hidden state", () => {
        storeMocks.targetIds = ["hidden"];
        storeMocks.selectionSource = "layer-list";

        doDelete();

        expect(layers.hidden).toBeUndefined();
        const record = externalMocks.putHistory.mock.calls[0][0];
        expect(record.actions[0].prev[0].layerConfig.hide).toBe(true);
    });

    test("alignment treats a group as one object and excludes locked objects", () => {
        storeMocks.targetIds = ["group", "free", "locked"];
        storeMocks.selectionSource = "layer-list";

        groupLeftAligned();

        expect(historyMocks.doDrag).toHaveBeenCalledWith([
            {id: "childA", x: 10, y: 10},
            {id: "childB", x: 25, y: 10},
            {id: "free", x: 10, y: 20},
        ]);
        expect(historyMocks.doDrag.mock.calls[0][0].some((item: {id: string}) => item.id === "locked")).toBe(false);
        expect(storeMocks.refreshLayerGeometry).toHaveBeenCalledWith(["childA", "childB", "free"]);
    });
});
