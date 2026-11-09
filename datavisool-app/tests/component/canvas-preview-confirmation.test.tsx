/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {DesignerMode, DesignerScene} from "@datavisool/sdk/types";

const mocks = vi.hoisted(() => {
    if (!URL.createObjectURL)
        Object.defineProperty(URL, "createObjectURL", {value: vi.fn(() => "blob:vitest"), configurable: true});
    if (!globalThis.Worker) {
        Object.defineProperty(globalThis, "Worker", {
            value: class {
                public addEventListener(): void {}
                public removeEventListener(): void {}
                public postMessage(): void {}
                public terminate(): void {}
            },
            configurable: true,
        });
    }
    return {
        managerStore: {currentManager: null as any},
        useTemplate: vi.fn(),
        completeOperation: vi.fn(async () => undefined),
        modal: {confirm: vi.fn((_options: any) => "preview-modal"), destroy: vi.fn()},
    };
});

vi.mock("@/api/AiDrivenTaskApi.ts", () => ({
    completeAiDrivenFrontendOperation: mocks.completeOperation,
    steerAiDrivenTask: vi.fn(),
    getAiDrivenTaskEvents: vi.fn(),
}));
vi.mock("@datavisool/ui", () => ({globalModal: {modalApi: mocks.modal}}));
vi.mock("@/designer/manager/ManagerStore.ts", () => ({default: mocks.managerStore}));
vi.mock("@/designer/manager/DesignerManager.ts", () => ({
    default: class {
        public layerManager: any;
        public init(data: any): void {
            this.layerManager = {...data.layerManager, getData: () => data.layerManager};
        }
        public destroy(): void {}
    },
}));
vi.mock("@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts", () => ({
    default: {doUseTemplate: mocks.useTemplate},
}));
vi.mock("@/designer/left/layer-list/CanvasRender.ts", () => ({
    default: {buildCanvasComponents: () => []},
}));

import {aiLayerDraftRuntime} from "@/designer/ai-driven/AiLayerDraftRuntime.ts";
import progressStore from "@/designer/ai-driven/AiDrivenProgressTerminalStore.ts";
import {handleAiDrivenWebEvent} from "@/designer/ai-driven/AiDrivenWebEffectBridge.ts";
import AiLayerDraftCanvas from "@/designer/canvas/AiLayerDraftCanvas.tsx";
import {runShowPreviewTool} from "@/frontend-effect/tools/PreviewInteractionTools.ts";

const components = [
    {id: "title", type: "BaseText", x: 0, y: 0, width: 240, height: 40, config: {style: {color: "#FFFFFF"}}},
    {id: "subtitle", type: "BaseText", x: 0, y: 50, width: 240, height: 30, config: {style: {color: "#34E4FF"}}},
];

let nextOperation = 0;
const startCreate = () => handleAiDrivenWebEvent({
    eventId: `event-${++nextOperation}`,
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: null,
    runId: "run-1",
    requestId: "request-1",
    projectId: "project-1",
    sequence: nextOperation,
    threadSequence: nextOperation,
    kind: "agent.canvas_operation.prepared",
    payload: {
        operationId: `create-${nextOperation}`,
        operationType: "create_canvas_components",
        request: {components, agentScope: {projectId: "project-1", managerId: "manager-1"}},
    },
    dedupeKey: `event-${nextOperation}`,
    schemaVersion: 3,
    createdAt: Date.now(),
});

const startDraftOperation = (request: Record<string, unknown>, runId: string) => {
    const operationId = `partition-${++nextOperation}`;
    return handleAiDrivenWebEvent({
        eventId: `event-${nextOperation}`,
        threadId: "thread-1",
        turnId: "partition-turn",
        itemId: null,
        runId,
        requestId: `request-${nextOperation}`,
        projectId: "project-1",
        sequence: nextOperation,
        threadSequence: nextOperation,
        kind: "agent.canvas_operation.prepared",
        payload: {
            operationId,
            operationType: "render_draft",
            request: {
                ...request,
                operationId,
                agentScope: {projectId: "project-1", managerId: "manager-1"},
            },
        },
        dedupeKey: `event-${nextOperation}`,
        schemaVersion: 3,
        createdAt: Date.now(),
    });
};

describe("canvas and progress panel preview confirmation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        progressStore.reset();
        progressStore.setInlineHostAvailable(true);
        mocks.modal.destroy.mockImplementation(() => mocks.modal.confirm.mock.calls.at(-1)?.[0].afterClose());
        const layerManager = {
            elemConfigs: {} as Record<string, unknown>,
            getData: () => ({layerConfigs: {}, elemConfigs: {}}),
            init: vi.fn(),
        };
        const manager = {
            id: "manager-1",
            scene: DesignerScene.DEFAULT,
            canvasManager: {canvasConfig: {width: 1920, height: 1080}},
            layerManager,
            getData: () => ({}),
        };
        mocks.managerStore.currentManager = manager;
        (window as any).DATAVISOOL_ENV = {
            projectId: "project-1",
            currentManager: manager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}, style: {}})}},
        };
        mocks.useTemplate.mockImplementation(({layers, configs}) => {
            const layerIdMap = Object.fromEntries(Object.keys(layers).map((id, index) => [id, `canvas-${index + 1}`]));
            for (const [id, canvasId] of Object.entries(layerIdMap))
                layerManager.elemConfigs[canvasId] = configs[id];
            return {appliedLayerIds: Object.values(layerIdMap), layerIdMap};
        });
    });

    afterEach(() => {
        cleanup();
        progressStore.reset();
        progressStore.setInlineHostAvailable(false);
        aiLayerDraftRuntime.clear();
        mocks.managerStore.currentManager = null;
        delete (window as any).DATAVISOOL_ENV;
    });

    test("canvas accept clears the panel confirmation and sends one applied receipt with bindings", async () => {
        const operation = startCreate();
        await vi.waitFor(() => expect(progressStore.pendingInlineInteraction?.kind).toBe("preview"));
        const draftId = aiLayerDraftRuntime.activeDraft!.draftId;
        expect(mocks.useTemplate).not.toHaveBeenCalled();
        render(<AiLayerDraftCanvas/>);

        const accept = screen.getByRole("button", {name: "接受"});
        await act(async () => {
            fireEvent.click(accept);
            fireEvent.click(accept);
            expect(progressStore.pendingInlineInteraction).toBeNull();
            expect(progressStore.runState).toBe("running");
            await operation;
        });
        // A stale panel completion must not apply the already accepted draft again.
        progressStore.completeInlineInteraction({action: "submit", data: {confirmed: true, draftId}});

        expect(mocks.useTemplate).toHaveBeenCalledOnce();
        expect(aiLayerDraftRuntime.activeDraft).toBeNull();
        expect(mocks.completeOperation).toHaveBeenCalledOnce();
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "applied",
            resultRevision: expect.stringMatching(/^sha256:/),
            result: expect.objectContaining({
                confirmed: true,
                status: "draft-accepted",
                layerCount: 2,
                componentBindings: {title: "canvas-1", subtitle: "canvas-2"},
            }),
        }), expect.anything());
    });

    test("panel confirmation uses the same application path and removes the canvas controls", async () => {
        const operation = startCreate();
        await vi.waitFor(() => expect(progressStore.pendingInlineInteraction?.kind).toBe("preview"));
        render(<AiLayerDraftCanvas/>);
        await act(async () => {
            progressStore.completeInlineInteraction({
                action: "submit",
                data: {confirmed: true, draftId: aiLayerDraftRuntime.activeDraft!.draftId},
            });
            await operation;
        });

        expect(progressStore.pendingInlineInteraction).toBeNull();
        expect(aiLayerDraftRuntime.activeDraft).toBeNull();
        expect(mocks.useTemplate).toHaveBeenCalledOnce();
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "applied"}), expect.anything());
        await vi.waitFor(() => expect(screen.queryByRole("button", {name: "接受"})).toBeNull());
    });

    test("canvas discard resolves the panel wait as rejected without applying any layers", async () => {
        const operation = startCreate();
        await vi.waitFor(() => expect(progressStore.pendingInlineInteraction?.kind).toBe("preview"));
        render(<AiLayerDraftCanvas/>);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", {name: "丢弃"}));
            expect(progressStore.pendingInlineInteraction).toBeNull();
            await operation;
        });

        expect(aiLayerDraftRuntime.activeDraft).toBeNull();
        expect(mocks.useTemplate).not.toHaveBeenCalled();
        expect(mocks.completeOperation).toHaveBeenCalledOnce();
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "rejected",
            result: expect.objectContaining({confirmed: false, status: "draft-rejected"}),
        }), expect.anything());
    });

    test("canvas acceptance also completes and closes the fallback preview modal", async () => {
        progressStore.setInlineHostAvailable(false);
        const operation = startCreate();
        await vi.waitFor(() => expect(mocks.modal.confirm).toHaveBeenCalledOnce());
        render(<AiLayerDraftCanvas/>);
        const accept = screen.getByRole("button", {name: "接受"});
        await act(async () => {
            fireEvent.click(accept);
            fireEvent.click(accept);
            await operation;
        });

        expect(mocks.modal.destroy).toHaveBeenCalledOnce();
        expect(mocks.modal.destroy).toHaveBeenCalledWith("preview-modal");
        expect(mocks.useTemplate).toHaveBeenCalledOnce();
        expect(mocks.completeOperation).toHaveBeenCalledOnce();
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "applied"}), expect.anything());
    });

    test("moving the confirmation from the panel to a modal keeps the canvas connected", async () => {
        const operation = startCreate();
        await vi.waitFor(() => expect(progressStore.pendingInlineInteraction?.kind).toBe("preview"));
        progressStore.setInlineHostAvailable(false);
        await vi.waitFor(() => expect(mocks.modal.confirm).toHaveBeenCalledOnce());
        render(<AiLayerDraftCanvas/>);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", {name: "接受"}));
            await operation;
        });

        expect(mocks.modal.destroy).toHaveBeenCalledOnce();
        expect(mocks.useTemplate).toHaveBeenCalledOnce();
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "applied"}), expect.anything());
    });

    test("stages partitioned drafts without confirmation, rejects incomplete preview, then commits all regions once", async () => {
        const layout = [
            {id: "top", x: 0, y: 0, width: 1920, height: 360},
            {id: "middle", x: 0, y: 360, width: 1920, height: 360},
            {id: "bottom", x: 0, y: 720, width: 1920, height: 360},
        ];
        const regionComponent = (id: string, y: number) => ({
            id,
            type: "BaseText",
            x: 20,
            y,
            width: 240,
            height: 40,
            config: {style: {color: "#FFFFFF"}},
        });

        await startDraftOperation({
            action: "render", incremental: false, interactive: false,
            layout, regionId: "top", components: [regionComponent("top-title", 20)],
        }, "partition-run-1");
        const draftId = aiLayerDraftRuntime.activeDraft!.draftId;
        await startDraftOperation({
            action: "render", incremental: true, interactive: false, draftId,
            regionId: "middle", components: [regionComponent("middle-title", 380)],
        }, "partition-run-2");

        expect(aiLayerDraftRuntime.activeDraft?.batches.map((batch) => batch.regionId)).toEqual(["top", "middle"]);
        expect(aiLayerDraftRuntime.activeDraft?.layerCount).toBe(2);
        expect(progressStore.pendingInlineInteraction).toBeNull();
        expect(mocks.modal.confirm).not.toHaveBeenCalled();
        expect(mocks.useTemplate).not.toHaveBeenCalled();

        await startDraftOperation({
            action: "preview", draftId, expectedDraftRevision: 2,
        }, "partition-preview-incomplete");
        expect(progressStore.pendingInlineInteraction).toBeNull();
        expect(mocks.modal.confirm).not.toHaveBeenCalled();
        expect(mocks.useTemplate).not.toHaveBeenCalled();
        expect(mocks.completeOperation).toHaveBeenLastCalledWith(expect.objectContaining({
            status: "failed",
            result: expect.objectContaining({code: "draft_incomplete", missingRegionIds: ["bottom"]}),
        }), expect.anything());
        // A missing region blocks preview without discarding already rendered batches.
        expect(aiLayerDraftRuntime.activeDraft?.draftId).toBe(draftId);
        expect(aiLayerDraftRuntime.activeDraft?.batches.map((batch) => batch.regionId)).toEqual(["top", "middle"]);

        await startDraftOperation({
            action: "render", incremental: true, interactive: false, draftId,
            regionId: "bottom", components: [regionComponent("bottom-title", 740)],
        }, "partition-run-3");
        const preview = startDraftOperation({
            action: "preview", draftId, expectedDraftRevision: 3,
        }, "partition-preview-final");
        await vi.waitFor(() => expect(progressStore.pendingInlineInteraction?.kind).toBe("preview"));
        expect(mocks.modal.confirm).not.toHaveBeenCalled();
        expect(mocks.useTemplate).not.toHaveBeenCalled();
        expect(aiLayerDraftRuntime.activeDraft?.batches.map((batch) => batch.regionId)).toEqual(["top", "middle", "bottom"]);

        await act(async () => {
            progressStore.completeInlineInteraction({
                action: "submit",
                data: {confirmed: true, draftId},
            });
            await preview;
        });

        expect(progressStore.pendingInlineInteraction).toBeNull();
        expect(aiLayerDraftRuntime.activeDraft).toBeNull();
        expect(mocks.useTemplate).toHaveBeenCalledOnce();
        expect(Object.keys(mocks.useTemplate.mock.calls[0][0].layers)).toHaveLength(3);
        expect(mocks.completeOperation).toHaveBeenLastCalledWith(expect.objectContaining({
            status: "applied",
            result: expect.objectContaining({status: "draft-accepted", confirmed: true, layerCount: 3}),
        }), expect.anything());
    });

    test("aborting a confirmation releases its canvas binding", async () => {
        const draft = aiLayerDraftRuntime.render(components);
        const batchId = aiLayerDraftRuntime.activeDraft!.batches[0].batchId;
        const controller = new AbortController();
        const preview = runShowPreviewTool({draftId: draft.draftId}, controller.signal);
        const rejected = expect(preview).rejects.toMatchObject({code: "effect_cancelled"});
        controller.abort();
        await rejected;

        expect(progressStore.pendingInlineInteraction).toBeNull();
        expect(mocks.useTemplate).not.toHaveBeenCalled();
        // Independent previews still accept one batch directly after the wait ends.
        expect(aiLayerDraftRuntime.acceptBatch(batchId)).toEqual(["canvas-1", "canvas-2"]);
        expect(mocks.useTemplate).toHaveBeenCalledOnce();
    });

    test("a stale batch cannot complete a different draft confirmation", async () => {
        aiLayerDraftRuntime.render(components);
        const staleBatchId = aiLayerDraftRuntime.activeDraft!.batches[0].batchId;
        const operation = startCreate();
        await vi.waitFor(() => expect(progressStore.pendingInlineInteraction?.kind).toBe("preview"));

        expect(aiLayerDraftRuntime.acceptBatch(staleBatchId)).toEqual([]);
        expect(aiLayerDraftRuntime.discardBatch(staleBatchId)).toBe(false);
        expect(progressStore.pendingInlineInteraction?.kind).toBe("preview");
        expect(mocks.useTemplate).not.toHaveBeenCalled();
        aiLayerDraftRuntime.acceptBatch(aiLayerDraftRuntime.activeDraft!.batches[0].batchId);
        await operation;

        expect(progressStore.pendingInlineInteraction).toBeNull();
        expect(mocks.useTemplate).toHaveBeenCalledOnce();
    });
});
