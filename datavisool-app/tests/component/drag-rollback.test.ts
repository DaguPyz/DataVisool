/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {OperateType} from "@/designer/operate-provider/undo-redo/OperateType.ts";

const storeMocks = vi.hoisted(() => ({
    setTargetIds: vi.fn(),
    refreshLayerGeometry: vi.fn(),
}));

const domMocks = vi.hoisted(() => ({
    updateDomStyle: vi.fn(),
}));

vi.mock("@/designer/operate-provider/EventOperateStore", () => ({
    default: {
        setTargetIds: storeMocks.setTargetIds,
        interactionRef: {
            refreshLayerGeometry: storeMocks.refreshLayerGeometry,
        },
    },
}));

vi.mock("@/util/DomUtil.ts", () => ({
    default: {
        updateDomStyle: domMocks.updateDomStyle,
    },
}));

import {DragRollbackImpl} from "@/designer/operate-provider/undo-redo/core/DragRollbackImpl.ts";
import {ResizeRollbackImpl} from "@/designer/operate-provider/undo-redo/core/ResizeRollbackImpl.ts";
import {RotateRollbackImpl} from "@/designer/operate-provider/undo-redo/core/RotateRollbackImpl.ts";

describe("DragRollbackImpl", () => {
    const updateLayer = vi.fn();
    const rollback = new DragRollbackImpl();
    const record = {
        type: OperateType.DRAG,
        prev: [{id: "component-a", x: 10, y: 20, width: 100, height: 80, rotate: 0}],
        next: [{id: "component-a", x: 210, y: 120, width: 100, height: 80, rotate: 0}],
    };

    beforeEach(() => {
        (window as any).DATAVISOOL_ENV = {
            currentManager: {
                layerManager: {updateLayer},
            },
        };
        updateLayer.mockClear();
        storeMocks.setTargetIds.mockClear();
        storeMocks.refreshLayerGeometry.mockClear();
        domMocks.updateDomStyle.mockClear();
    });

    afterEach(() => {
        delete (window as any).DATAVISOOL_ENV;
    });

    test("refreshes interaction geometry at the previous position after undo", async () => {
        rollback.undo(record);

        expect(updateLayer).toHaveBeenCalledWith(record.prev, false);
        expect(storeMocks.refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        expect(updateLayer.mock.invocationCallOrder[0])
            .toBeLessThan(storeMocks.refreshLayerGeometry.mock.invocationCallOrder[0]);
        expect(storeMocks.setTargetIds).toHaveBeenCalledWith([]);

        await Promise.resolve();

        expect(storeMocks.setTargetIds).toHaveBeenLastCalledWith(["component-a"]);
    });

    test("refreshes interaction geometry at the next position after redo", async () => {
        rollback.redo(record);

        expect(updateLayer).toHaveBeenCalledWith(record.next, false);
        expect(storeMocks.refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        expect(updateLayer.mock.invocationCallOrder[0])
            .toBeLessThan(storeMocks.refreshLayerGeometry.mock.invocationCallOrder[0]);
        expect(storeMocks.setTargetIds).toHaveBeenCalledWith([]);

        await Promise.resolve();

        expect(storeMocks.setTargetIds).toHaveBeenLastCalledWith(["component-a"]);
    });

    test("restores the canonical selection captured by a group transform", async () => {
        rollback.undo({...record, selectionIds: ["group-a"]});
        await Promise.resolve();

        expect(storeMocks.setTargetIds).toHaveBeenLastCalledWith(["group-a"]);
    });

    test.each([
        ["resize", new ResizeRollbackImpl(), OperateType.RESIZE],
        ["rotate", new RotateRollbackImpl(), OperateType.ROTATE],
    ])("%s rollback refreshes geometry and restores the canonical selection", async (_name, implementation, type) => {
        implementation.undo({...record, type, selectionIds: ["group-a"]});

        expect(storeMocks.refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        await Promise.resolve();
        expect(storeMocks.setTargetIds).toHaveBeenLastCalledWith(["group-a"]);
    });

    test.each([
        ["resize", new ResizeRollbackImpl(), OperateType.RESIZE, true],
        ["rotate", new RotateRollbackImpl(), OperateType.ROTATE, false],
    ])("%s redo refreshes geometry and restores the canonical selection", async (_name, implementation, type, reRender) => {
        implementation.redo({...record, type, selectionIds: ["group-a"]});

        expect(updateLayer).toHaveBeenCalledWith(record.next, reRender);
        expect(storeMocks.refreshLayerGeometry).toHaveBeenCalledWith(["component-a"]);
        await Promise.resolve();
        expect(storeMocks.setTargetIds).toHaveBeenLastCalledWith(["group-a"]);
    });
});
