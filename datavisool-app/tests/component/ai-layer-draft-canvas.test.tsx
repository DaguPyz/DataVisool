/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";

const draftMocks = vi.hoisted(() => ({
    runtime: {
        activeDraft: {
            draftId: "draft-1",
            revision: 2,
            layerCount: 2,
            interactive: true,
            batches: [
                {
                    batchId: "batch-A",
                    sequence: 1,
                    layerCount: 1,
                    bounds: {x: 10, y: 20, width: 100, height: 80},
                    manager: {},
                },
                {
                    batchId: "batch-B",
                    sequence: 2,
                    layerCount: 1,
                    bounds: {x: 200, y: 40, width: 120, height: 90},
                    manager: {},
                },
            ],
        },
        acceptBatch: vi.fn(),
        discardBatch: vi.fn(),
        clear: vi.fn(),
    },
}));

vi.mock("@/designer/ai-driven/AiLayerDraftRuntime.ts", () => ({
    aiLayerDraftRuntime: draftMocks.runtime,
}));

vi.mock("@/designer/left/layer-list/CanvasRender.ts", () => ({
    default: {
        buildCanvasComponents: vi.fn(() => []),
    },
}));

import AiLayerDraftCanvas from "@/designer/canvas/AiLayerDraftCanvas.tsx";

describe("AI layer draft canvas", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        draftMocks.runtime.activeDraft.interactive = true;
    });

    test("renders independent controls and routes actions to the hovered batch", () => {
        const {container, unmount} = render(<AiLayerDraftCanvas/>);
        const batches = container.querySelectorAll<HTMLElement>(".ai-layer-draft-batch-hit-area");
        const acceptButtons = screen.getAllByRole("button", {name: "接受"});
        const discardButtons = screen.getAllByRole("button", {name: "丢弃"});
        const designerPointerDown = vi.fn();

        container.addEventListener("pointerdown", designerPointerDown);

        expect(batches).toHaveLength(2);
        expect(batches[0].style.cssText).toContain("left: 10px");
        expect(batches[0].style.cssText).toContain("width: 100px");

        fireEvent.pointerDown(acceptButtons[0], {button: 0});
        fireEvent.click(acceptButtons[0]);
        fireEvent.pointerDown(discardButtons[1], {button: 0});
        fireEvent.click(discardButtons[1]);

        expect(designerPointerDown).not.toHaveBeenCalled();
        expect(draftMocks.runtime.acceptBatch).toHaveBeenCalledWith("batch-A");
        expect(draftMocks.runtime.discardBatch).toHaveBeenCalledWith("batch-B");

        unmount();
        expect(draftMocks.runtime.clear).toHaveBeenCalledOnce();
    });

    test("hides batch actions for agent-controlled preview", () => {
        draftMocks.runtime.activeDraft.interactive = false;

        const {container} = render(<AiLayerDraftCanvas/>);

        expect(container.querySelectorAll(".ai-layer-draft-batch-hit-area")).toHaveLength(2);
        expect(screen.queryByRole("button", {name: "接受"})).toBeNull();
        expect(screen.queryByRole("button", {name: "丢弃"})).toBeNull();
    });
});
