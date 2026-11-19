/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import type {ILayerItem} from "@datavisool/sdk/types";
import type {DesignerEditingScene, DesignerSceneLayerSnapshot} from "@datavisool/sdk/plugin/contracts/designerRuntime";
import {EventOperateStore} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import type {SelectionSource} from "@/plugins/editor-canvas/state/EventOperateStore.ts";
import {CanvasContextMenuStore} from "@/plugins/editor-canvas/context-menu/CanvasContextMenuStore.ts";
import HistoryOperator from "@/plugins/editor-canvas/history/HistoryOperator.ts";
import {createLegacyCanvasModelAdapter} from "@/plugins/editor-canvas/history/LegacyCanvasModelAdapter.ts";
import {OperateType} from "@/plugins/editor-canvas/history/OperateType.ts";

const domMocks = vi.hoisted(() => ({updateDomStyle: vi.fn()}));

vi.mock("@/util/DomUtil.ts", () => ({default: {updateDomStyle: domMocks.updateDomStyle}}));
vi.mock("@/plugins/editor-canvas/layers/LayerUtil.ts", async () => {
    const actual = await vi.importActual<typeof import("@/plugins/editor-canvas/layers/LayerUtil.ts")>("@/plugins/editor-canvas/layers/LayerUtil.ts");
    return {default: {...actual.default, setSelectBoxColor: vi.fn()}};
});

import {DragRollbackImpl} from "@/plugins/editor-canvas/history/core/DragRollbackImpl.ts";
import {ResizeRollbackImpl} from "@/plugins/editor-canvas/history/core/ResizeRollbackImpl.ts";
import {RotateRollbackImpl} from "@/plugins/editor-canvas/history/core/RotateRollbackImpl.ts";

describe("DragRollbackImpl", () => {
    const layers: Record<string, ILayerItem> = {
        "component-a": {id: "component-a", type: "rect", x: 10, y: 20, width: 100, height: 80, rotate: 0},
        "group-a": {id: "group-a", type: "group"},
    };
    const identity = {};
    const scene = {identity, version: 1, isActive: () => true} as DesignerEditingScene;
    const snapshot = {
        sceneIdentity: identity,
        sceneVersion: 1,
        canvas: {width: 800, height: 600},
        layers,
        configs: {},
    } as unknown as DesignerSceneLayerSnapshot;
    const adapter = createLegacyCanvasModelAdapter(snapshot);
    const updateLayer = vi.spyOn(adapter.manager.layerManager, "updateLayer");
    let selection: {ids: string[]; source: SelectionSource} = {ids: [], source: "system"};
    const writeSelection = vi.fn((next: {ids: readonly string[]; source: SelectionSource}) => {
        selection = {ids: [...next.ids], source: next.source};
    });
    const history = new HistoryOperator(() => selection.ids);
    const eventOperateStore = new EventOperateStore({
        history,
        contextMenu: new CanvasContextMenuStore(() => true),
        isActive: () => true,
        readScene: () => scene,
        readLegacyModel: () => adapter.manager,
        readLayerConfigs: () => adapter.readSnapshot().layers as Record<string, ILayerItem>,
        readSelection: () => selection,
        writeSelection,
        publishLayerUi: () => undefined,
        publishInspector: () => undefined,
    } as never);
    const refreshLayerGeometry = vi.fn();
    const rollback = new DragRollbackImpl(eventOperateStore);
    const record = {
        type: OperateType.DRAG,
        prev: [{id: "component-a", x: 10, y: 20, width: 100, height: 80, rotate: 0}],
        next: [{id: "component-a", x: 210, y: 120, width: 100, height: 80, rotate: 0}],
    };

    beforeEach(() => {
        selection = {ids: [], source: "system"};
        updateLayer.mockClear();
        writeSelection.mockClear();
        refreshLayerGeometry.mockClear();
        domMocks.updateDomStyle.mockClear();
        eventOperateStore.interactionRef = {refreshLayerGeometry};
    });

    afterEach(() => eventOperateStore.pause());

    test("refreshes interaction geometry at the previous position after undo", async () => {
        rollback.undo(record);

        expect(updateLayer).toHaveBeenCalledWith(record.prev, false);
        expect(refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        expect(updateLayer.mock.invocationCallOrder[0]).toBeLessThan(refreshLayerGeometry.mock.invocationCallOrder[0]);
        expect(writeSelection.mock.calls[0]?.[0].ids).toEqual([]);

        await Promise.resolve();

        expect(writeSelection.mock.calls.at(-1)?.[0].ids).toEqual(["component-a"]);
    });

    test("refreshes interaction geometry at the next position after redo", async () => {
        rollback.redo(record);

        expect(updateLayer).toHaveBeenCalledWith(record.next, false);
        expect(refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        expect(updateLayer.mock.invocationCallOrder[0]).toBeLessThan(refreshLayerGeometry.mock.invocationCallOrder[0]);
        expect(writeSelection.mock.calls[0]?.[0].ids).toEqual([]);

        await Promise.resolve();

        expect(writeSelection.mock.calls.at(-1)?.[0].ids).toEqual(["component-a"]);
    });

    test("restores the canonical selection captured by a group transform", async () => {
        rollback.undo({...record, selectionIds: ["group-a"]});
        await Promise.resolve();

        expect(writeSelection.mock.calls.at(-1)?.[0].ids).toEqual(["group-a"]);
    });

    test.each([
        ["resize", new ResizeRollbackImpl(eventOperateStore), OperateType.RESIZE],
        ["rotate", new RotateRollbackImpl(eventOperateStore), OperateType.ROTATE],
    ])("%s rollback refreshes geometry and restores the canonical selection", async (_name, implementation, type) => {
        implementation.undo({...record, type, selectionIds: ["group-a"]});

        expect(refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        await Promise.resolve();
        expect(writeSelection.mock.calls.at(-1)?.[0].ids).toEqual(["group-a"]);
    });

    test.each([
        ["resize", new ResizeRollbackImpl(eventOperateStore), OperateType.RESIZE, true],
        ["rotate", new RotateRollbackImpl(eventOperateStore), OperateType.ROTATE, false],
    ])("%s redo refreshes geometry and restores the canonical selection", async (_name, implementation, type, reRender) => {
        implementation.redo({...record, type, selectionIds: ["group-a"]});

        expect(updateLayer).toHaveBeenCalledWith(record.next, reRender);
        expect(refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        await Promise.resolve();
        expect(writeSelection.mock.calls.at(-1)?.[0].ids).toEqual(["group-a"]);
    });
});
