/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

const storeMocks = vi.hoisted(() => ({
    setTargetIds: vi.fn(),
    focusDesignerCanvas: vi.fn(),
    setAddRecordCompId: vi.fn(),
}));

const rightMocks = vi.hoisted(() => ({activeConfig: vi.fn()}));

vi.mock("@/designer/operate-provider/EventOperateStore.ts", () => ({
    default: storeMocks,
}));

vi.mock("@/designer/right/RightStore.ts", () => ({default: rightMocks}));

vi.mock("@/designer/loader/DesignerLoader.ts", () => ({
    default: class DesignerLoaderMock {
        static definitionMap = {};
    },
}));

vi.mock("@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts", () => ({
    default: {doAdd: vi.fn()},
}));

import layerListStore from "@/designer/left/layer-list/LayerListStore.ts";
import {SearchLayer} from "@/designer/left/layer-list/search-layer/SearchLayer.tsx";

describe("SearchLayer management selection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (window as any).DATAVISOOL_ENV = {
            currentManager: {
                layerManager: {
                    layerConfigs: {
                        group: {id: "group", name: "父分组", type: "group", hide: true, lock: true, order: 1},
                        child: {id: "child", name: "目标图层", type: "rect", pid: "group", order: 2},
                    },
                },
                canvasManager: {canvasConfig: {width: 800, height: 600}},
            },
        };
        layerListStore.setSearchLayer(true);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        layerListStore.setSearchLayer(false);
        delete (window as any).DATAVISOOL_ENV;
    });

    test("shows effective ancestor state and locates a hidden locked layer through the search source", async () => {
        render(<SearchLayer/>);

        fireEvent.change(screen.getByPlaceholderText("请输入图层名、组件名或组件 Key"), {
            target: {value: "目标"},
        });

        expect(await screen.findByText("目标图层")).toBeInTheDocument();
        expect(screen.getByText("已隐藏")).toBeInTheDocument();
        expect(screen.getByText("已锁定")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: /目标图层/}));

        await waitFor(() => {
            expect(storeMocks.setTargetIds).toHaveBeenCalledWith(["child"], "search");
        });
        expect(rightMocks.activeConfig).toHaveBeenCalledWith("child", "rect");
    });

    test("waits for two animation frames before focusing the search input", () => {
        const frameCallbacks = new Map<number, FrameRequestCallback>();
        let nextFrameId = 1;
        const requestFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            const frameId = nextFrameId++;
            frameCallbacks.set(frameId, callback);
            return frameId;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
            frameCallbacks.delete(frameId);
        });
        const flushFrame = (timestamp: number) => {
            const callbacks = [...frameCallbacks.entries()];
            callbacks.forEach(([frameId]) => frameCallbacks.delete(frameId));
            act(() => callbacks.forEach(([, callback]) => callback(timestamp)));
        };

        render(<SearchLayer/>);
        const input = screen.getByPlaceholderText("请输入图层名、组件名或组件 Key");
        const focusSpy = vi.spyOn(input, "focus");

        const initialFrameCount = requestFrameSpy.mock.calls.length;
        flushFrame(0);
        expect(requestFrameSpy.mock.calls.length).toBeGreaterThan(initialFrameCount);
        expect(focusSpy).not.toHaveBeenCalled();

        flushFrame(16);
        expect(focusSpy).toHaveBeenCalledTimes(1);
    });
});
