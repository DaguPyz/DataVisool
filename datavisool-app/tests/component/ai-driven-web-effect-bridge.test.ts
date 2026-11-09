/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

const bridgeMocks = vi.hoisted(() => ({
    completeOperation: vi.fn(async () => undefined),
    steerTask: vi.fn(async () => undefined),
    renderDraft: vi.fn(),
    showPreview: vi.fn(),
    acceptDraft: vi.fn(),
    resolveSpecs: vi.fn(),
    patchCanvas: vi.fn(),
    projectSnapshot: vi.fn(),
    componentCatalog: vi.fn(),
    userInput: vi.fn(),
    operationJournal: new Map<string, {fingerprint: string; result: Promise<unknown>}>(),
    draftRuntime: {
        clearOwnedDraft: vi.fn(),
        isOwnedDraftCurrent: vi.fn(() => true),
    },
}));

vi.mock("@/api/AiDrivenTaskApi.ts", () => ({
    completeAiDrivenFrontendOperation: bridgeMocks.completeOperation,
    steerAiDrivenTask: bridgeMocks.steerTask,
}));

vi.mock("@/frontend-effect/tools/ApplyComponentPatchTool.ts", () => ({
    runApplyComponentPatchTool: bridgeMocks.patchCanvas,
}));

vi.mock("@/frontend-effect/tools/ApplyComponentStylePatchTool.ts", () => ({
    runApplyComponentStylePatchTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/GetComponentCatalogTool.ts", () => ({
    runGetComponentCatalogTool: bridgeMocks.componentCatalog,
}));

vi.mock("@/frontend-effect/tools/GetComponentDataContractTool.ts", () => ({
    runGetComponentDataContractTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/GetComponentSnapshotsTool.ts", () => ({
    runGetComponentSnapshotsTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/GetCurrentCanvasSelectionTool.ts", () => ({
    runGetCurrentCanvasSelectionTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/ComponentDocumentationTools.ts", () => ({
    runGetComponentDocumentTool: vi.fn(),
    runResolveComponentSpecsTool: bridgeMocks.resolveSpecs,
    runSearchAvailableComponentsTool: vi.fn(),
    runSearchComponentDocumentsTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/CanvasContextTools.ts", () => ({
    runGetCurrentCanvasRevisionTool: vi.fn(),
    runGetProjectSnapshotTool: bridgeMocks.projectSnapshot,
}));

vi.mock("@/frontend-effect/tools/ConfirmCanvasPatchTool.ts", () => ({
    runConfirmCanvasPatchTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/DeleteCanvasComponentsTool.ts", () => ({
    runDeleteCanvasComponentsTool: vi.fn(),
}));

vi.mock("@/frontend-effect/tools/PreviewInteractionTools.ts", () => ({
    runRequestComponentSelectionTool: vi.fn(),
    runShowPreviewTool: bridgeMocks.showPreview,
}));

vi.mock("@/frontend-effect/tools/RenderDraftTool.ts", () => ({
    acceptRenderedDraftAfterUserConfirmation: bridgeMocks.acceptDraft,
    runRenderDraftTool: bridgeMocks.renderDraft,
}));

vi.mock("@/designer/ai-driven/AiLayerDraftRuntime.ts", () => ({
    aiLayerDraftRuntime: bridgeMocks.draftRuntime,
}));

vi.mock("@/frontend-effect/CanvasOperationJournal.ts", () => ({
    hasCanvasOperationIdentity: (payload: Record<string, unknown>) =>
        typeof payload.operationId === "string" && !!payload.operationId
        && typeof payload.operationFingerprint === "string" && !!payload.operationFingerprint,
    runIdempotentCanvasOperation: async (
        payload: Record<string, unknown>,
        execute: () => Promise<unknown> | unknown,
    ) => {
        const operationId = String(payload.operationId);
        const fingerprint = String(payload.operationFingerprint);
        const existing = bridgeMocks.operationJournal.get(operationId);
        if (existing) {
            if (existing.fingerprint !== fingerprint)
                throw new Error("operation_fingerprint_conflict");
            return existing.result;
        }
        const result = Promise.resolve().then(execute);
        bridgeMocks.operationJournal.set(operationId, {fingerprint, result});
        return result;
    },
    canvasRevision: vi.fn(() => "revision-test"),
}));

vi.mock("@/frontend-effect/tools/UserInputTool.ts", () => ({
    runUserInputTool: bridgeMocks.userInput,
}));

vi.mock("@/designer/ai-driven/AiDrivenDevLogger.ts", () => ({
    aiDrivenDevWarn: vi.fn(),
}));

import {handleAiDrivenWebEvent} from "@/designer/ai-driven/AiDrivenWebEffectBridge.ts";

const eventFor = (operationType: string, request: Record<string, unknown> = {}) => ({
    eventId: "event-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: null,
    runId: "run-1",
    requestId: "request-1",
    projectId: "project-1",
    sequence: 4,
    threadSequence: 4,
    kind: "agent.canvas_operation.prepared",
    payload: {
        operationId: "operation-1",
        operationType,
        request,
    },
    dedupeKey: "event-1",
    schemaVersion: 3,
    createdAt: Date.now(),
});

const operationScope = {
    agentScope: {projectId: "project-1", managerId: "manager-1"},
};

describe("Web Agent frontend effect bridge", () => {
    test("resolves full component specs through the host and returns stable errors", async () => {
        const result = {corpusVersion: "version", specs: [{componentType: "BaseText"}], commonFragments: {}};
        bridgeMocks.resolveSpecs.mockReturnValueOnce(result);
        await handleAiDrivenWebEvent(eventFor("resolve_component_specs", {componentTypes: ["BaseText"], intent: "create"}));
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "applied", result}), expect.anything());
        const {FrontendEffectClientError} = await import("@/frontend-effect/FrontendEffectClientError.ts");
        bridgeMocks.resolveSpecs.mockImplementationOnce(() => { throw new FrontendEffectClientError("agent.component_specs.output_limit_exceeded", "减少组件数量"); });
        await handleAiDrivenWebEvent(eventFor("resolve_component_specs", {componentTypes: ["BaseText"], intent: "create"}));
        expect(bridgeMocks.completeOperation).toHaveBeenLastCalledWith(expect.objectContaining({
            status: "failed", result: {
                code: "agent.component_specs.output_limit_exceeded", message: "减少组件数量",
                name: "FrontendEffectClientError", exceptionType: "FrontendEffectClientError",
            },
        }), expect.anything());
    });

    test.each([
        ["user_cancelled", "cancelled"],
        ["modal_unavailable", "failed"],
    ])("returns %s to the Agent without inventing answers", async (code, status) => {
        const {FrontendEffectClientError} = await import("@/frontend-effect/FrontendEffectClientError.ts");
        const diagnostic = code === "modal_unavailable"
            ? {fieldPath: "globalModal.modalApi", actualValue: null, actualType: "null", expectedValue: "initialized modal API"}
            : {};
        bridgeMocks.userInput.mockRejectedValueOnce(new FrontendEffectClientError(code, "input interaction ended", diagnostic));
        const event = {
            ...eventFor("", {}),
            kind: "turn.waiting",
            payload: {
                status: "waitingUserInput",
                questions: [{id: "region", header: "区域", question: "选哪个区域？", options: []}],
            },
        } as any;

        await handleAiDrivenWebEvent(event);

        const steerRequest = bridgeMocks.steerTask.mock.calls[0][0] as {inputId: string; input: string};
        const returnedInput = JSON.parse(steerRequest.input);
        expect(steerRequest.inputId).toBe("web-user-input-event-1");
        expect(returnedInput).toEqual(expect.objectContaining({
            interaction: "userInput",
            status,
            code,
            inputId: "web-user-input-event-1",
            eventId: "event-1",
            questionIds: ["region"],
            interactionState: {status, answers: "absent"},
            recovery: expect.stringContaining("不要自动重复提问"),
        }));
        if (code === "modal_unavailable") {
            expect(returnedInput).toMatchObject({
                fieldPath: "globalModal.modalApi",
                actualValue: null,
                actualType: "null",
                expectedValue: "initialized modal API",
            });
        } else {
            expect(returnedInput).toMatchObject({
                actualValue: {status, answers: "absent"},
                actualType: "object",
                expectedValue: {status: "submitted", answers: {region: {answers: ["非空字符串"]}}},
            });
        }
        expect(returnedInput).not.toHaveProperty("answers");
    });

    test("preserves an expected-only input diagnostic without adding a conflicting answer template", async () => {
        const {FrontendEffectClientError} = await import("@/frontend-effect/FrontendEffectClientError.ts");
        bridgeMocks.userInput.mockRejectedValueOnce(new FrontendEffectClientError("modal_unavailable", "input UI missing", {
            fieldPath: "globalModal.modalApi", actualValue: null, expected: "initialized modal API",
        }));
        const event = {
            ...eventFor("", {}),
            kind: "turn.waiting",
            payload: {status: "waitingUserInput", questions: [{id: "region", header: "区域", question: "选哪个？", options: []}]},
        } as any;

        await handleAiDrivenWebEvent(event);

        const returnedInput = JSON.parse((bridgeMocks.steerTask.mock.calls[0][0] as {input: string}).input);
        expect(returnedInput).toMatchObject({fieldPath: "globalModal.modalApi", actualValue: null, expected: "initialized modal API"});
        expect(returnedInput).not.toHaveProperty("expectedValue");
    });

    test("completes a partially applied write as failed while preserving its receipt", async () => {
        const applied = [{componentId: "one", componentType: "BaseText"}];
        const failed = [{componentId: "two", code: "component_revision_conflict", message: "revision changed"}];
        bridgeMocks.patchCanvas.mockResolvedValueOnce({applied, failed, partial: true});

        await handleAiDrivenWebEvent(eventFor("patch_canvas_components", operationScope));

        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "failed",
            result: {applied, failed, partial: true},
        }), {suppressErrorMessage: true});
    });
    beforeEach(() => {
        vi.resetAllMocks();
        bridgeMocks.operationJournal.clear();
        bridgeMocks.draftRuntime.isOwnedDraftCurrent.mockReturnValue(true);
        (window as any).DATAVISOOL_ENV = {
            projectId: "project-1",
            currentManager: {id: "manager-1"},
        };
    });

    afterEach(() => {
        delete (window as any).DATAVISOOL_ENV;
    });

    test("create_canvas_components accepts a confirmed preview and completes as applied", async () => {
        bridgeMocks.renderDraft.mockResolvedValue({
            status: "draft-rendered",
            draftId: "draft-1",
            layerCount: 2,
        });
        bridgeMocks.showPreview.mockResolvedValue({confirmed: true, draftId: "draft-1"});
        bridgeMocks.acceptDraft.mockReturnValue({
            status: "draft-accepted",
            draftId: "draft-1",
            layerCount: 2,
            componentBindings: {"draft-A": "layer-A"},
            resultRevision: "revision-2",
        });

        const request = {
            ...operationScope,
            message: "创建首页",
            components: [{type: "BaseColorBlock", x: 0, y: 0, width: 100, height: 80}],
        };
        await handleAiDrivenWebEvent(eventFor("create_canvas_components", request));

        expect(bridgeMocks.renderDraft).toHaveBeenCalledWith(
            expect.objectContaining({...request, action: "render"}),
        );
        expect(bridgeMocks.showPreview).toHaveBeenCalledWith(
            {draftId: "draft-1", message: "创建首页"},
            expect.any(AbortSignal),
        );
        expect(bridgeMocks.acceptDraft).toHaveBeenCalledWith("draft-1");
        expect(bridgeMocks.renderDraft).toHaveBeenCalledTimes(1);
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId: "operation-1",
                status: "applied",
                projectId: "project-1",
                threadId: "thread-1",
                turnId: "turn-1",
                runId: "run-1",
                resultRevision: "revision-2",
                result: expect.objectContaining({
                    status: "draft-accepted",
                    confirmed: true,
                }),
            }),
            {suppressErrorMessage: true},
        );
    });

    test("preserves direct approved render_draft accept without nesting operation journals", async () => {
        bridgeMocks.renderDraft.mockReturnValue({
            status: "draft-accepted",
            draftId: "approved-draft",
            layerCount: 1,
            componentBindings: {},
            resultRevision: "revision-approved",
        });
        const request = {
            ...operationScope,
            action: "accept",
            draftId: "approved-draft",
            approvalTicket: {approvalId: "approval-1", nonce: "nonce-1"},
            operationId: "approved-accept-op",
            operationFingerprint: "approved-accept-fingerprint",
        };
        await handleAiDrivenWebEvent(eventFor("render_draft", request));

        expect(bridgeMocks.renderDraft).toHaveBeenCalledWith(request, expect.any(AbortSignal));
        expect(bridgeMocks.operationJournal.has("approved-accept-op")).toBe(false);
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "applied"}), {suppressErrorMessage: true});
    });

    test("create_canvas_components rejects a declined preview and clears the draft", async () => {
        bridgeMocks.renderDraft.mockResolvedValue({
            status: "draft-rendered",
            draftId: "draft-2",
            layerCount: 1,
        });
        bridgeMocks.showPreview.mockResolvedValue({confirmed: false, draftId: "draft-2"});

        await handleAiDrivenWebEvent(eventFor("create_canvas_components", {
            ...operationScope,
            components: [{type: "BaseColorBlock", x: 10, y: 20, width: 120, height: 80}],
        }));

        expect(bridgeMocks.renderDraft).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({action: "render"}),
        );
        expect(bridgeMocks.renderDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({action: "clear", ownerKey: expect.any(String)}));
        expect(bridgeMocks.acceptDraft).not.toHaveBeenCalled();
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId: "operation-1",
                status: "rejected",
                result: expect.objectContaining({
                    status: "draft-rejected",
                    confirmed: false,
                    draftId: "draft-2",
                }),
            }),
            {suppressErrorMessage: true},
        );
    });

    test("stages three regions across resumed runs and confirms the complete page only once", async () => {
        bridgeMocks.renderDraft
            .mockResolvedValueOnce({status: "draft-rendered", draftId: "partition-draft", revision: 1, layerCount: 1})
            .mockResolvedValueOnce({status: "draft-rendered", draftId: "partition-draft", revision: 2, layerCount: 2})
            .mockResolvedValueOnce({status: "draft-rendered", draftId: "partition-draft", revision: 3, layerCount: 3})
            .mockResolvedValueOnce({status: "draft-preview-ready", draftId: "partition-draft", revision: 3, layerCount: 3});
        bridgeMocks.showPreview.mockResolvedValue({confirmed: true, draftId: "partition-draft"});
        bridgeMocks.acceptDraft.mockReturnValue({
            status: "draft-accepted", draftId: "partition-draft", layerCount: 3,
            componentBindings: {}, resultRevision: "revision-9",
        });
        const layout = [
            {id: "left", x: 0, y: 0, width: 640, height: 1080},
            {id: "center", x: 640, y: 0, width: 640, height: 1080},
            {id: "right", x: 1280, y: 0, width: 640, height: 1080},
        ];
        const requests = [
            {action: "render", incremental: false, interactive: false, layout, regionId: "left", components: [{id: "left-title"}]},
            {action: "render", incremental: true, interactive: false, draftId: "partition-draft", regionId: "center", components: [{id: "center-title"}]},
            {action: "render", incremental: true, interactive: false, draftId: "partition-draft", regionId: "right", components: [{id: "right-title"}]},
        ];
        for (const [index, request] of requests.entries()) {
            const base = eventFor("render_draft", {...operationScope, ...request});
            await handleAiDrivenWebEvent({
                ...base,
                runId: `partition-resume-${index}`,
                turnId: "partitioned-page-turn",
                eventId: `partition-event-${index}`,
                payload: {...base.payload, operationId: `partition-op-${index}`},
            });
        }

        expect(bridgeMocks.showPreview).not.toHaveBeenCalled();
        expect(bridgeMocks.acceptDraft).not.toHaveBeenCalled();
        expect(bridgeMocks.renderDraft).toHaveBeenCalledTimes(3);
        const ownerKey = JSON.stringify(["project-1", "thread-1", "partitioned-page-turn"]);
        expect(bridgeMocks.renderDraft).toHaveBeenNthCalledWith(1, expect.objectContaining({ownerKey, regionId: "left"}), expect.any(AbortSignal));
        expect(bridgeMocks.renderDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({ownerKey, draftId: "partition-draft", regionId: "center"}), expect.any(AbortSignal));
        expect(bridgeMocks.renderDraft).toHaveBeenNthCalledWith(3, expect.objectContaining({ownerKey, draftId: "partition-draft", regionId: "right"}), expect.any(AbortSignal));

        const previewBase = eventFor("render_draft", {
            ...operationScope, action: "preview", draftId: "partition-draft", expectedDraftRevision: 3,
        });
        await handleAiDrivenWebEvent({
            ...previewBase,
            runId: "partition-preview-run",
            turnId: "partitioned-page-turn",
            eventId: "partition-preview-event",
            payload: {...previewBase.payload, operationId: "partition-preview-op"},
        });

        expect(bridgeMocks.renderDraft).toHaveBeenCalledTimes(4);
        expect(bridgeMocks.renderDraft).toHaveBeenLastCalledWith(expect.objectContaining({
            action: "preview", draftId: "partition-draft", expectedDraftRevision: 3, ownerKey,
        }));
        expect(bridgeMocks.showPreview).toHaveBeenCalledTimes(1);
        expect(bridgeMocks.acceptDraft).toHaveBeenCalledTimes(1);
        expect(bridgeMocks.acceptDraft).toHaveBeenCalledWith("partition-draft", 3);
        expect(bridgeMocks.completeOperation).toHaveBeenLastCalledWith(
            expect.objectContaining({status: "applied"}), {suppressErrorMessage: true},
        );
    });

    test("replayed operation identities reuse staged region and confirmed preview receipts", async () => {
        bridgeMocks.renderDraft
            .mockResolvedValueOnce({status: "draft-rendered", draftId: "replay-draft", revision: 1, layerCount: 1})
            .mockResolvedValueOnce({status: "draft-rendered", draftId: "replay-draft", revision: 2, layerCount: 2})
            .mockResolvedValueOnce({status: "draft-rendered", draftId: "replay-draft", revision: 3, layerCount: 3})
            .mockResolvedValueOnce({status: "draft-preview-ready", draftId: "replay-draft", revision: 3, layerCount: 3});
        bridgeMocks.showPreview.mockResolvedValue({confirmed: true, draftId: "replay-draft"});
        bridgeMocks.acceptDraft.mockReturnValue({
            status: "draft-accepted", draftId: "replay-draft", layerCount: 3,
            componentBindings: {}, resultRevision: "revision-replay",
        });
        const layout = [
            {id: "top", x: 0, y: 0, width: 1000, height: 300},
            {id: "middle", x: 0, y: 300, width: 1000, height: 300},
            {id: "bottom", x: 0, y: 600, width: 1000, height: 300},
        ];
        const first = eventFor("render_draft", {
            ...operationScope,
            action: "render", incremental: false, interactive: false,
            layout, regionId: "top", components: [{id: "top-title"}],
            operationId: "partition-first-op", operationFingerprint: "fingerprint-first",
        });
        const stage = async (event: ReturnType<typeof eventFor>, runId: string, eventId: string) => {
            await handleAiDrivenWebEvent({
                ...event,
                runId,
                turnId: "replay-turn",
                eventId,
                payload: {...event.payload, operationId: String(event.payload.request.operationId)},
            });
        };
        await stage(first, "replay-run-1", "first-event");
        const second = eventFor("render_draft", {
            ...operationScope, action: "render", incremental: true, interactive: false,
            draftId: "replay-draft", regionId: "middle", components: [{id: "middle-title"}],
            operationId: "partition-middle-op", operationFingerprint: "fingerprint-middle",
        });
        const third = eventFor("render_draft", {
            ...operationScope, action: "render", incremental: true, interactive: false,
            draftId: "replay-draft", regionId: "bottom", components: [{id: "bottom-title"}],
            operationId: "partition-bottom-op", operationFingerprint: "fingerprint-bottom",
        });
        await stage(second, "replay-run-2", "middle-event");
        await stage(third, "replay-run-3", "bottom-event");

        // Backend replay can deliver an already-prepared first operation in a later run.
        await stage(first, "replay-run-4", "first-event-replayed");
        expect(bridgeMocks.renderDraft).toHaveBeenCalledTimes(3);

        const preview = eventFor("render_draft", {
            ...operationScope, action: "preview", draftId: "replay-draft", expectedDraftRevision: 3,
            operationId: "partition-preview-op", operationFingerprint: "fingerprint-preview",
        });
        await stage(preview, "preview-run-1", "preview-event");
        await stage(preview, "preview-run-2", "preview-event-replayed");
        expect(bridgeMocks.renderDraft).toHaveBeenCalledTimes(4);
        expect(bridgeMocks.showPreview).toHaveBeenCalledTimes(1);
        expect(bridgeMocks.acceptDraft).toHaveBeenCalledTimes(1);
    });

    test("does not accept a newer partition revision after preview confirmation", async () => {
        bridgeMocks.renderDraft.mockResolvedValue({
            status: "draft-preview-ready", draftId: "stale-draft", revision: 4, layerCount: 3,
        });
        bridgeMocks.showPreview.mockResolvedValue({confirmed: true, draftId: "stale-draft"});
        bridgeMocks.draftRuntime.isOwnedDraftCurrent.mockReturnValue(false);
        await handleAiDrivenWebEvent(eventFor("render_draft", {
            ...operationScope, action: "preview", draftId: "stale-draft", expectedDraftRevision: 4,
        }));
        expect(bridgeMocks.acceptDraft).not.toHaveBeenCalled();
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "failed",
            result: expect.objectContaining({code: "draft_revision_conflict"}),
        }), {suppressErrorMessage: true});
    });

    test("ordinary incremental render remains legacy and interactive=false is completed by explicit preview", async () => {
        bridgeMocks.renderDraft
            .mockResolvedValueOnce({
            status: "draft-rendered", draftId: "legacy-incremental", revision: 1, layerCount: 1,
            })
            .mockResolvedValueOnce({
                status: "draft-preview-ready", draftId: "legacy-incremental", revision: 1, layerCount: 1,
            });
        bridgeMocks.showPreview.mockResolvedValue({confirmed: true, draftId: "legacy-incremental"});
        bridgeMocks.acceptDraft.mockReturnValue({
            status: "draft-accepted", draftId: "legacy-incremental", layerCount: 1,
            componentBindings: {}, resultRevision: "revision-10",
        });
        const renderEvent = eventFor("render_draft", {
            ...operationScope,
            action: "render",
            incremental: true,
            interactive: false,
            components: [{id: "legacy-id"}],
        });
        await handleAiDrivenWebEvent({
            ...renderEvent,
            runId: "ordinary-staged-run",
            turnId: "ordinary-staged-turn",
            payload: {...renderEvent.payload, operationId: "ordinary-staged-op"},
        });

        expect(bridgeMocks.renderDraft).toHaveBeenCalledWith(expect.objectContaining({
            action: "render", incremental: true, interactive: false, ownerKey: expect.any(String),
        }));
        expect(bridgeMocks.showPreview).not.toHaveBeenCalled();
        expect(bridgeMocks.acceptDraft).not.toHaveBeenCalled();

        const previewEvent = eventFor("render_draft", {
            ...operationScope,
            action: "preview",
            draftId: "legacy-incremental",
            expectedDraftRevision: 1,
        });
        await handleAiDrivenWebEvent({
            ...previewEvent,
            runId: "ordinary-preview-run",
            turnId: "ordinary-staged-turn",
            payload: {...previewEvent.payload, operationId: "ordinary-preview-op"},
        });
        expect(bridgeMocks.showPreview).toHaveBeenCalledTimes(1);
        expect(bridgeMocks.acceptDraft).toHaveBeenCalledWith("legacy-incremental", 1);
    });

    test("scopes render_draft clear to the current turn", async () => {
        await handleAiDrivenWebEvent(eventFor("render_draft", {...operationScope, action: "clear"}));

        expect(bridgeMocks.renderDraft).toHaveBeenCalledWith(expect.objectContaining({
            action: "clear",
            ownerKey: JSON.stringify(["project-1", "thread-1", "turn-1"]),
        }));
    });

    test("returns failed terminal state when the agent scope belongs to another project", async () => {
        await handleAiDrivenWebEvent(eventFor("create_canvas_components", {
            agentScope: {projectId: "project-from-another-tab", managerId: "manager-1"},
            components: [{type: "BaseColorBlock", x: 0, y: 0, width: 10, height: 10}],
        }));

        expect(bridgeMocks.renderDraft).not.toHaveBeenCalled();
        expect(bridgeMocks.showPreview).not.toHaveBeenCalled();
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId: "operation-1",
                status: "failed",
                result: expect.objectContaining({
                    code: "agent_scope_project_changed",
                    message: expect.stringContaining("项目已切换"),
                }),
            }),
            {suppressErrorMessage: true},
        );
    });

    test("returns failed terminal state for an unknown frontend tool", async () => {
        await handleAiDrivenWebEvent(eventFor("tool_not_registered", operationScope));

        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId: "operation-1",
                status: "failed",
                result: expect.objectContaining({
                    code: "tool_not_supported",
                    message: "Web 端未注册前端工具：tool_not_registered",
                    fieldPath: "operationType",
                    actualValue: "tool_not_registered",
                    actualType: "string",
                    expectedValue: expect.arrayContaining(["patch_canvas_components", "render_draft"]),
                    allowedTools: expect.arrayContaining(["patch_canvas_components", "render_draft"]),
                }),
            }),
            {suppressErrorMessage: true},
        );
    });

    test("snapshot and catalog start together and return independently", async () => {
        let snapshotDone!: (value: unknown) => void;
        let catalogDone!: (value: unknown) => void;
        bridgeMocks.projectSnapshot.mockImplementationOnce(() => new Promise(resolve => {snapshotDone = resolve;}));
        bridgeMocks.componentCatalog.mockImplementationOnce(() => new Promise(resolve => {catalogDone = resolve;}));
        const first = {...eventFor("get_project_snapshot", operationScope), runId: "parallel-snapshot-run",
            payload: {...eventFor("get_project_snapshot", operationScope).payload, operationId: "snapshot-read"}};
        const second = {...eventFor("get_component_catalog", operationScope), runId: first.runId,
            payload: {...eventFor("get_component_catalog", operationScope).payload, operationId: "catalog-read"}};
        const one = handleAiDrivenWebEvent(first);
        const two = handleAiDrivenWebEvent(second);
        await vi.waitFor(() => {
            expect(bridgeMocks.projectSnapshot).toHaveBeenCalledTimes(1);
            expect(bridgeMocks.componentCatalog).toHaveBeenCalledTimes(1);
        });
        catalogDone({catalogVersion: "v5", components: []});
        await two;
        expect(bridgeMocks.completeOperation).toHaveBeenCalledTimes(1);
        expect(bridgeMocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({operationId: "catalog-read"}), expect.anything());
        snapshotDone({revision: "current"});
        await one;
        expect(bridgeMocks.completeOperation).toHaveBeenCalledTimes(2);
    });

    test("reads overlap but writes and subsequent reads wait for every preceding receipt", async () => {
        const acknowledge = new Map<string, () => void>();
        bridgeMocks.completeOperation.mockImplementation((request) => request.operationId.startsWith("parallel-read")
            ? new Promise<void>(resolve => {acknowledge.set(request.operationId, resolve);}) : Promise.resolve());
        bridgeMocks.resolveSpecs.mockResolvedValue({specs: []});
        const order: string[] = [];
        bridgeMocks.patchCanvas.mockImplementation(() => {order.push("write"); return {applied: [], failed: []};});
        bridgeMocks.componentCatalog.mockImplementation(() => {order.push("read-after-write"); return {components: []};});
        const first = {...eventFor("resolve_component_specs", operationScope), runId: "mixed-run",
            payload: {...eventFor("resolve_component_specs", operationScope).payload, operationId: "parallel-read-1"}};
        const second = {...first, eventId: "parallel-event-2", payload: {...first.payload, operationId: "parallel-read-2"}};
        const write = {...first, payload: {...first.payload, operationType: "patch_canvas_components", operationId: "write-1"}};
        const last = {...first, payload: {...first.payload, operationType: "get_component_catalog", operationId: "last-read"}};
        const one = handleAiDrivenWebEvent(first);
        const two = handleAiDrivenWebEvent(second);
        const three = handleAiDrivenWebEvent(write);
        const four = handleAiDrivenWebEvent(last);
        await vi.waitFor(() => expect(acknowledge.size).toBe(2));
        expect(bridgeMocks.resolveSpecs).toHaveBeenCalledTimes(2);
        expect(bridgeMocks.patchCanvas).not.toHaveBeenCalled();
        acknowledge.get("parallel-read-2")!();
        await two;
        expect(bridgeMocks.patchCanvas).not.toHaveBeenCalled();
        expect(bridgeMocks.componentCatalog).not.toHaveBeenCalled();
        acknowledge.get("parallel-read-1")!();
        await Promise.all([one, three, four]);
        expect(order).toEqual(["write", "read-after-write"]);
        expect(bridgeMocks.completeOperation).toHaveBeenCalledTimes(4);
    });

    test("two writes remain serial through receipt acknowledgement", async () => {
        let acknowledge!: () => void;
        bridgeMocks.patchCanvas.mockResolvedValue({applied: [], failed: []});
        bridgeMocks.completeOperation.mockImplementationOnce(() => new Promise<void>(resolve => {acknowledge = resolve;}));
        const first = {...eventFor("patch_canvas_components", operationScope), runId: "serial-write-run"};
        const second = {...first, payload: {...first.payload, operationId: "write-2"}};
        const one = handleAiDrivenWebEvent(first);
        const two = handleAiDrivenWebEvent(second);
        await vi.waitFor(() => expect(bridgeMocks.completeOperation).toHaveBeenCalledTimes(1));
        expect(bridgeMocks.patchCanvas).toHaveBeenCalledTimes(1);
        acknowledge();
        await Promise.all([one, two]);
        expect(bridgeMocks.patchCanvas).toHaveBeenCalledTimes(2);
        expect(bridgeMocks.completeOperation).toHaveBeenCalledTimes(2);
    });

    test("duplicate events do not reexecute a read while another read is active", async () => {
        let finish!: (value: unknown) => void;
        bridgeMocks.resolveSpecs.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
        const first = {...eventFor("resolve_component_specs", operationScope), runId: "duplicate-read-run"};
        const one = handleAiDrivenWebEvent(first);
        await vi.waitFor(() => expect(bridgeMocks.resolveSpecs).toHaveBeenCalledTimes(1));
        const duplicate = handleAiDrivenWebEvent(first);
        const other = handleAiDrivenWebEvent({...first, payload: {...first.payload, operationType: "get_component_catalog", operationId: "other-read"}});
        await Promise.all([duplicate, other]);
        expect(bridgeMocks.resolveSpecs).toHaveBeenCalledTimes(1);
        finish({specs: []});
        await one;
        expect(bridgeMocks.completeOperation).toHaveBeenCalledTimes(2);
    });

    test("cancelled parallel reads do not submit late successful receipts", async () => {
        let finish!: (value: unknown) => void;
        bridgeMocks.resolveSpecs.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
        const first = {...eventFor("resolve_component_specs", operationScope), runId: "cancel-read-run"};
        const active = handleAiDrivenWebEvent(first);
        await vi.waitFor(() => expect(bridgeMocks.resolveSpecs).toHaveBeenCalledTimes(1));
        await handleAiDrivenWebEvent({...first, kind: "turn.cancelled"});
        finish({specs: []});
        await active;
        expect(bridgeMocks.completeOperation).not.toHaveBeenCalled();
    });

    test("cancelled runs discard queued effects and abort the current preview", async () => {
        bridgeMocks.renderDraft.mockResolvedValue({status: "draft-rendered", draftId: "queued-draft", layerCount: 1});
        bridgeMocks.showPreview.mockImplementation((_payload, signal: AbortSignal) =>
            new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true})));
        const first = {...eventFor("create_canvas_components"), runId: "cancel-queued-run"};
        const second = {...eventFor("resolve_component_specs"), runId: first.runId,
            payload: {...eventFor("resolve_component_specs").payload, operationId: "queued-read"}};
        const current = handleAiDrivenWebEvent(first);
        const queued = handleAiDrivenWebEvent(second);
        await vi.waitFor(() => expect(bridgeMocks.showPreview).toHaveBeenCalled());
        await handleAiDrivenWebEvent({...first, kind: "turn.cancelled"});
        await Promise.all([current, queued]);
        expect(bridgeMocks.resolveSpecs).not.toHaveBeenCalled();
        expect(bridgeMocks.completeOperation).not.toHaveBeenCalled();
    });

    test("aborts an active create preview and clears the draft when the turn ends", async () => {
        bridgeMocks.renderDraft.mockResolvedValue({
            status: "draft-rendered",
            draftId: "draft-active",
            layerCount: 1,
        });
        bridgeMocks.showPreview.mockImplementation((_payload, signal: AbortSignal) =>
            new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true})),
        );

        const active = handleAiDrivenWebEvent(eventFor("create_canvas_components", {
            ...operationScope,
            components: [{type: "BaseColorBlock", x: 0, y: 0, width: 10, height: 10}],
        }));
        await vi.waitFor(() => expect(bridgeMocks.showPreview).toHaveBeenCalled());
        await handleAiDrivenWebEvent({
            ...eventFor("create_canvas_components"),
            kind: "turn.cancelled",
        });
        await active;

        expect(bridgeMocks.renderDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({action: "clear", ownerKey: expect.any(String)}));
        expect(bridgeMocks.completeOperation).not.toHaveBeenCalled();
    });
});
