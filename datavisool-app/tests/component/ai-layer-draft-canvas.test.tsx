/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import type {DesignerAiDraftSnapshot} from "@datavisool/sdk/plugin/contracts/designerRuntime";
import AiLayerDraftCanvas from "@/plugins/editor-ai/AiLayerDraftCanvas.tsx";

const makeDraft = (interactive = true): DesignerAiDraftSnapshot => ({
    draftId: "draft-1",
    revision: 2,
    layerCount: 2,
    interactive,
    batches: [
        {batchId: "batch-A", sequence: 1, regionId: "left", layerCount: 1, bounds: {x: 10, y: 20, width: 100, height: 80}},
        {batchId: "batch-B", sequence: 2, regionId: "right", layerCount: 1, bounds: {x: 200, y: 40, width: 120, height: 90}},
    ],
});

function makeSession(draft: DesignerAiDraftSnapshot) {
    return {
        isActive: vi.fn(() => true),
        readDraft: vi.fn(() => draft),
        renderDraftBatch: vi.fn((batchId: string) => <div data-rendered-batch={batchId}/>),
        acceptDraftBatch: vi.fn(() => []),
        discardDraftBatch: vi.fn(() => true),
        dispose: vi.fn(),
    } as unknown as EditorAiEditingSession;
}

describe("AI layer draft canvas", () => {
    afterEach(cleanup);

    test("renders batches through the canvas capability and routes each control to its batch", () => {
        const draft = makeDraft();
        const session = makeSession(draft);
        const {container, unmount} = render(<AiLayerDraftCanvas session={session} revision={draft.revision}/>);
        const batches = container.querySelectorAll<HTMLElement>(".ai-layer-draft-batch-hit-area");
        const acceptButtons = screen.getAllByRole("button", {name: "接受"});
        const discardButtons = screen.getAllByRole("button", {name: "丢弃"});
        const designerPointerDown = vi.fn();
        container.addEventListener("pointerdown", designerPointerDown);

        expect(batches).toHaveLength(2);
        expect(batches[0].style.cssText).toContain("left: 10px");
        expect(batches[0].style.cssText).toContain("width: 100px");
        expect(session.renderDraftBatch).toHaveBeenNthCalledWith(1, "batch-A");
        expect(session.renderDraftBatch).toHaveBeenNthCalledWith(2, "batch-B");

        fireEvent.pointerDown(acceptButtons[0], {button: 0});
        fireEvent.click(acceptButtons[0]);
        fireEvent.pointerDown(discardButtons[1], {button: 0});
        fireEvent.click(discardButtons[1]);

        expect(designerPointerDown).not.toHaveBeenCalled();
        expect(session.acceptDraftBatch).toHaveBeenCalledWith("batch-A");
        expect(session.discardDraftBatch).toHaveBeenCalledWith("batch-B");
        unmount();
        expect(session.dispose).not.toHaveBeenCalled();
    });

    test("hides batch actions for agent controlled previews", () => {
        const draft = makeDraft(false);
        const session = makeSession(draft);
        const {container} = render(<AiLayerDraftCanvas session={session} revision={draft.revision}/>);

        expect(container.querySelectorAll(".ai-layer-draft-batch-hit-area")).toHaveLength(2);
        expect(screen.queryByRole("button", {name: "接受"})).toBeNull();
        expect(screen.queryByRole("button", {name: "丢弃"})).toBeNull();
    });
});
