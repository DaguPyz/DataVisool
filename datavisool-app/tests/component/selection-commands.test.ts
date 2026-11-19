/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import type {ILayerItem} from "@datavisool/sdk/types";
import type {DesignerEditingScene} from "@datavisool/sdk/plugin/contracts/designerRuntime";
import type {EventOperateStore, SelectionSource} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import type {HistoryRecordOperateProxy} from "@/plugins/editor-canvas/history/HistoryRecordOperateProxy.ts";

const historyMocks = {
    doClone: vi.fn(),
    doDelete: vi.fn(),
    doHideUpd: vi.fn(),
    doLockUpd: vi.fn(),
    doDrag: vi.fn(),
    doLayerToTop: vi.fn(),
    doLayerToBottom: vi.fn(),
    doLayerMoveUp: vi.fn(),
    doLayerMoveDown: vi.fn(),
};

const externalMocks = vi.hoisted(() => ({
    copyToClipboard: vi.fn(async () => undefined),
}));

vi.mock("@/util/TextUtil.ts", () => ({
    default: {copyToClipboard: externalMocks.copyToClipboard},
}));

vi.mock("@datavisool/ui", () => ({
    globalMessage: {messageApi: {success: vi.fn()}},
}));

import {createSelectionCommands} from "@/plugins/editor-canvas/selection/SelectionCommands.ts";

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
    let selection: {ids: string[]; source: SelectionSource};
    let scene: DesignerEditingScene;
    let commands: ReturnType<typeof createSelectionCommands>;
    let deletedLayerSnapshots: ILayerItem[];
    const reRenderLayer = vi.fn();
    const identity = {};
    const sceneChange = {
        sceneIdentity: identity,
        sceneVersion: 1,
        pageIds: [],
        rollback: vi.fn(() => true),
        undo: vi.fn(() => true),
        redo: vi.fn(() => true),
    };
    const eventOperateStore = {
        get targetIds() { return selection.ids; },
        get selectionSource() { return selection.source; },
        setTargetIds: vi.fn((ids: readonly string[], source: SelectionSource = "system") => {
            selection = {ids: [...ids], source};
        }),
        interactionRef: {
            refreshOverlay: vi.fn(),
            refreshLayerGeometry: vi.fn(),
        },
    };

    const select = (ids: string[], source: SelectionSource = "canvas") => { selection = {ids, source}; };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        layers = createLayers();
        selection = {ids: [], source: "canvas"};
        deletedLayerSnapshots = [];
        sceneChange.rollback.mockClear();
        sceneChange.undo.mockClear();
        sceneChange.redo.mockClear();

        scene = {
            identity,
            version: 1,
            isActive: () => true,
            readLayerConfigs: () => layers,
            layers: {
                read: () => ({sceneIdentity: identity, sceneVersion: 1, canvas: {width: 1280, height: 720},
                    layers, configs: {childA: {kind: "a"}, childB: {kind: "b"}}}),
            },
            blueprints: {
                removeNodes: vi.fn(() => sceneChange),
            },
        } as unknown as DesignerEditingScene;

        historyMocks.doClone.mockImplementation(() => {
            layers.cloneGroup = {id: "cloneGroup", type: "group", order: 7};
            layers.cloneChild = {id: "cloneChild", type: "rect", pid: "cloneGroup", order: 8};
            return ["cloneGroup", "cloneChild"];
        });
        historyMocks.doDelete.mockImplementation((ids: string[]) => {
            deletedLayerSnapshots = ids.map(id => ({...layers[id]}));
            ids.forEach(id => delete layers[id]);
        });

        commands = createSelectionCommands({
            eventOperateStore: eventOperateStore as unknown as EventOperateStore,
            historyProxy: historyMocks as unknown as HistoryRecordOperateProxy,
            readScene: () => scene,
            isActive: () => true,
        });
    });

    afterEach(() => { vi.useRealTimers(); });

    test("select all keeps only roots that have a canvas-selectable object", () => {
        layers.childA.lock = true;
        layers.childB.hide = true;

        commands.selectAll();

        expect(eventOperateStore.setTargetIds).toHaveBeenCalledWith(["free"], "canvas");
        expect(selection).toEqual({ids: ["free"], source: "canvas"});
    });

    test("locked trees require an explicit management selection source", () => {
        select(["locked"]);
        expect(commands.resolveSelectedCommandTargetIds()).toEqual([]);

        select(["locked"], "layer-list");
        expect(commands.resolveSelectedCommandTargetIds()).toEqual(["locked"]);
    });

    test("clone, copy, delete and hide all operate on the expanded group tree", async () => {
        vi.useFakeTimers();
        select(["group"], "layer-list");

        commands.doClone();
        expect(historyMocks.doClone).toHaveBeenCalledWith(["group", "childA", "childB"]);
        await vi.advanceTimersByTimeAsync(10);
        expect(eventOperateStore.setTargetIds).toHaveBeenCalledWith(["cloneGroup", "cloneChild"], "system");

        select(["group"], "layer-list");
        commands.doCopy();
        await Promise.resolve();
        const copied = JSON.parse(externalMocks.copyToClipboard.mock.calls.at(-1)?.[0] as string);
        expect(Object.keys(copied.layers)).toEqual(["group", "childA", "childB"]);

        commands.doHide();
        expect(historyMocks.doHideUpd).toHaveBeenCalledWith(["group", "childA", "childB"], true);
        expect(eventOperateStore.setTargetIds).toHaveBeenLastCalledWith([]);

        select(["group"], "layer-list");
        commands.doDelete();
        expect(layers.group).toBeUndefined();
        expect(layers.childA).toBeUndefined();
        expect(layers.childB).toBeUndefined();
        expect(historyMocks.doDelete).toHaveBeenCalledWith(["group", "childA", "childB"]);
        expect(scene.blueprints.removeNodes).not.toHaveBeenCalled();
        expect(deletedLayerSnapshots.map(layer => layer.id)).toEqual(["group", "childA", "childB"]);
    });

    test("locking expands the tree and retains the canonical selection", () => {
        select(["group"], "context-menu");

        commands.doLock();

        expect(historyMocks.doLockUpd).toHaveBeenCalledWith([
            {id: "group", lock: true},
            {id: "childA", lock: true},
            {id: "childB", lock: true},
        ]);
        expect(eventOperateStore.setTargetIds).toHaveBeenCalledWith(["group"], "context-menu");
        expect(eventOperateStore.interactionRef.refreshOverlay).toHaveBeenCalledTimes(1);
    });

    test("explicit management deletion removes a hidden layer and passes its hidden DTO to history", () => {
        select(["hidden"], "layer-list");

        commands.doDelete();

        expect(layers.hidden).toBeUndefined();
        expect(deletedLayerSnapshots).toEqual([expect.objectContaining({id: "hidden", hide: true})]);
        expect(historyMocks.doDelete).toHaveBeenCalledWith(["hidden"]);
        expect(scene.blueprints.removeNodes).not.toHaveBeenCalled();
    });

    test("alignment treats a group as one object and excludes locked objects", () => {
        select(["group", "free", "locked"], "layer-list");

        commands.groupLeftAligned();

        expect(historyMocks.doDrag).toHaveBeenCalledWith([
            {id: "childA", x: 10, y: 10},
            {id: "childB", x: 25, y: 10},
            {id: "free", x: 10, y: 20},
        ]);
        expect(historyMocks.doDrag.mock.calls[0][0].some((item: {id: string}) => item.id === "locked")).toBe(false);
        expect(eventOperateStore.interactionRef.refreshLayerGeometry).toHaveBeenCalledWith(["childA", "childB", "free"]);
    });
});
