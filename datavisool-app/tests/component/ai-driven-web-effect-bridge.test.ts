/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';
useMemoryLocalStorage();
import {createElement} from 'react';
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    completeOperation: vi.fn(async () => undefined),
    steerTask: vi.fn(async () => undefined),
    renderDraft: vi.fn(),
    showPreview: vi.fn(),
    acceptDraft: vi.fn(),
    resolveSpecs: vi.fn(),
    patchCanvas: vi.fn(),
    catalog: vi.fn(),
    terminalLog: vi.fn(),
    warn: vi.fn(),
}));

vi.mock("@/plugins/editor-ai/api/AiDrivenTaskApi.ts", () => ({
    completeAiDrivenFrontendOperation: mocks.completeOperation,
    steerAiDrivenTask: mocks.steerTask,
}));
vi.mock("@/plugins/editor-ai/frontend-effect/component-docs/ComponentDocumentVersions.ts", () => ({assertComponentDocumentVersions: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/ApplyComponentPatchTool.ts", () => ({runApplyComponentPatchTool: mocks.patchCanvas}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/ApplyComponentStylePatchTool.ts", () => ({runApplyComponentStylePatchTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/GetComponentCatalogTool.ts", () => ({runGetComponentCatalogTool: mocks.catalog}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/GetComponentDataContractTool.ts", () => ({runGetComponentDataContractTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/GetComponentSnapshotsTool.ts", () => ({runGetComponentSnapshotsTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/GetCurrentCanvasSelectionTool.ts", () => ({runGetCurrentCanvasSelectionTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/ComponentDocumentationTools.ts", () => ({
    runGetComponentDocumentTool: vi.fn(), runResolveComponentSpecsTool: mocks.resolveSpecs,
    runSearchAvailableComponentsTool: vi.fn(), runSearchComponentDocumentsTool: vi.fn(),
}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/CanvasContextTools.ts", () => ({
    runGetCurrentCanvasRevisionTool: vi.fn(), runGetProjectSnapshotTool: vi.fn(),
}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/ConfirmCanvasPatchTool.ts", () => ({runConfirmCanvasPatchTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/DeleteCanvasComponentsTool.ts", () => ({runDeleteCanvasComponentsTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/PreviewInteractionTools.ts", () => ({
    runRequestComponentSelectionTool: vi.fn(), runShowPreviewTool: mocks.showPreview,
}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/RenderDraftTool.ts", () => ({
    acceptRenderedDraftAfterUserConfirmation: mocks.acceptDraft, runRenderDraftTool: mocks.renderDraft,
}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/UserInputTool.ts", () => ({runUserInputTool: vi.fn()}));
vi.mock("@/plugins/editor-ai/frontend-effect/tools/PushAiDrivenProgressLogTool.ts", () => ({runPushAiDrivenProgressLogTool: mocks.terminalLog}));
vi.mock("@/plugins/editor-ai/AiDrivenDevLogger.ts", () => ({aiDrivenDevWarn: mocks.warn, aiDrivenDevError: vi.fn()}));

import {createAiDrivenWebEffectBridge} from "@/plugins/editor-ai/AiDrivenWebEffectBridge.ts";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import type {DesignerWorkspaceIdentity} from "@datavisool/sdk/plugin/contracts/designerRuntime";

const stableScope: DesignerWorkspaceIdentity = Object.freeze({
    rootId: "10", activeId: "subproject-10-a", nested: true, loopPath: Object.freeze(["loop-layer-1"]),
});

function makeSession(sceneVersion = 7) {
    let active = true;
    let draft: {
        draftId: string; revision: number; layerCount: number; interactive: boolean;
        batches: Array<{batchId: string; sequence: number; layerCount: number; bounds: {x: number; y: number; width: number; height: number}}>;
    } | undefined = {
        draftId: "draft-1", revision: 1, layerCount: 1, interactive: true,
        batches: [{batchId: "batch-retained", sequence: 1, layerCount: 1, bounds: {x: 12, y: 18, width: 240, height: 90}}],
    };
    const renderedBatch = createElement("div", {"data-testid": "retained-draft-renderer"}, "retained draft");
    return {
        session: {
            sceneIdentity: {},
            sceneVersion,
            scope: stableScope,
            isActive: vi.fn(() => active),
            dispose: vi.fn(() => {active = false;}),
            clearDraft: vi.fn(() => {draft = undefined; return true;}),
            readDraft: vi.fn(() => active ? draft : undefined),
            renderDraftBatch: vi.fn((batchId: string) => batchId === "batch-retained" ? renderedBatch : null),
        } as unknown as EditorAiEditingSession,
        renderedBatch,
        isActive: () => active,
    };
}

const eventFor = (operationType: string, request: Record<string, unknown> = {}, options: {runId?: string; turnId?: string; eventId?: string} = {}) => ({
    eventId: options.eventId ?? "event-1", threadId: "thread-1", turnId: options.turnId ?? "turn-1",
    itemId: null, runId: options.runId ?? "run-1", requestId: "request-1", projectId: "10",
    sequence: 4, threadSequence: 4, kind: "agent.canvas_operation.prepared",
    payload: {operationId: "operation-1", operationFingerprint: "fingerprint-1", operationType, request},
    dedupeKey: options.eventId ?? "event-1", schemaVersion: 3, createdAt: Date.now(),
});

const operationScope = {agentScope: {projectId: "10", workspaceScope: stableScope}};

describe("Web Agent frontend effect bridge", () => {
    let currentScope: DesignerWorkspaceIdentity;
    let currentSceneVersion: number;
    let sessions: ReturnType<typeof makeSession>[];
    let bridge: ReturnType<typeof createAiDrivenWebEffectBridge>;
    let prepareAiEditing: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetAllMocks();
        currentScope = stableScope;
        currentSceneVersion = 7;
        sessions = [];
        prepareAiEditing = vi.fn(async () => {
            const next = makeSession(currentSceneVersion);
            sessions.push(next);
            return next.session;
        });
        bridge = createAiDrivenWebEffectBridge({
            canvas: {
                readAiWorkspace: () => ({scope: currentScope, sceneVersion: currentSceneVersion}),
                prepareAiEditing,
            } as any,
            catalog: {} as any,
            terminal: {appendLog: mocks.terminalLog} as any,
        });
        mocks.catalog.mockResolvedValue({components: []});
        mocks.resolveSpecs.mockResolvedValue({specs: []});
        mocks.patchCanvas.mockResolvedValue({applied: [], failed: []});
        mocks.renderDraft.mockResolvedValue({status: "draft-rendered", draftId: "draft-1", revision: 1, layerCount: 1});
        mocks.showPreview.mockResolvedValue({confirmed: true, draftId: "draft-1"});
        mocks.acceptDraft.mockReturnValue({status: "draft-accepted", draftId: "draft-1", layerCount: 1, componentBindings: {title: "layer-1"}, resultRevision: "r2"});
    });

    afterEach(async () => {
        await bridge.withdraw();
    });

    test("rejects legacy events without a durable workspace scope before preparing a canvas session", async () => {
        const request = {agentScope: {projectId: "10", managerId: "old-manager"}};
        await bridge.handleEvent(eventFor("get_component_catalog", request));

        expect(prepareAiEditing).not.toHaveBeenCalled();
        expect(mocks.catalog).not.toHaveBeenCalled();
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "failed", result: expect.objectContaining({code: "agent_scope_missing"}),
        }), {suppressErrorMessage: true});
    });

    test("reads within the exact nested loop scope", async () => {
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope));

        expect(prepareAiEditing).toHaveBeenCalledWith(stableScope, expect.any(AbortSignal));
        expect(mocks.catalog).toHaveBeenCalledTimes(1);
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "applied"}), {suppressErrorMessage: true});
    });

    test("submits partial canvas writes as failed receipts", async () => {
        const applied = [{componentId: "one", componentType: "BaseText"}];
        const failed = [{componentId: "two", code: "component_revision_conflict", message: "revision changed"}];
        mocks.patchCanvas.mockResolvedValueOnce({applied, failed, partial: true});

        await bridge.handleEvent(eventFor("patch_canvas_components", operationScope));

        expect(mocks.patchCanvas).toHaveBeenCalledWith(expect.anything(), sessions[0].session, expect.anything());
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({status: "failed", result: {applied, failed, partial: true}}), {suppressErrorMessage: true});
    });

    test("accepts a confirmed draft through the bound session and reports its revision", async () => {
        await bridge.handleEvent(eventFor("create_canvas_components", {
            ...operationScope, message: "创建首页", components: [{type: "BaseText", x: 0, y: 0, width: 100, height: 30}],
        }));

        expect(mocks.renderDraft).toHaveBeenCalledWith(expect.objectContaining({action: "render", ownerKey: expect.any(String)}), sessions[0].session, expect.anything());
        expect(mocks.showPreview).toHaveBeenCalledWith(
            {draftId: "draft-1", message: "创建首页"}, sessions[0].session, expect.anything(), expect.any(AbortSignal),
        );
        expect(mocks.acceptDraft).toHaveBeenCalledWith("draft-1", 1, sessions[0].session);
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "applied", resultRevision: "r2", result: expect.objectContaining({status: "draft-accepted", confirmed: true}),
        }), {suppressErrorMessage: true});
    });

    test("rejects a delayed result after the active loop workspace changes", async () => {
        let finish!: (result: unknown) => void;
        mocks.patchCanvas.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
        const task = bridge.handleEvent(eventFor("patch_canvas_components", operationScope));
        await vi.waitFor(() => expect(mocks.patchCanvas).toHaveBeenCalledTimes(1));
        currentScope = {...stableScope, loopPath: ["different-loop"]};
        finish({applied: [{componentId: "one", componentType: "BaseText"}], failed: []});
        await task;

        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "failed", result: expect.objectContaining({code: "agent_scope_changed_after_effect"}),
        }), {suppressErrorMessage: true});
    });

    test("late terminal events from an old run do not dispose the resumed run session", async () => {
        const first = eventFor("get_component_catalog", operationScope, {runId: "run-1"});
        await bridge.handleEvent(first);
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {runId: "run-2"}));
        expect(sessions).toHaveLength(2);
        expect(sessions[0].isActive()).toBe(false);
        expect(sessions[1].isActive()).toBe(true);

        await bridge.handleEvent({...first, kind: "turn.interrupted", payload: {}} as any);

        expect(sessions[1].isActive()).toBe(true);
        expect(bridge.readDraftSession(stableScope, 7)).toBe(sessions[1].session);
    });

    test("stop waits for active work before disposing its session", async () => {
        let finish!: (result: unknown) => void;
        mocks.patchCanvas.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
        const task = bridge.handleEvent(eventFor("patch_canvas_components", operationScope));
        await vi.waitFor(() => expect(mocks.patchCanvas).toHaveBeenCalledTimes(1));
        bridge.pause();
        const stopping = bridge.prepareStop();
        expect(sessions[0].isActive()).toBe(true);
        finish({applied: [], failed: []});
        await Promise.all([task, stopping]);

        expect(sessions[0].isActive()).toBe(true);
        expect(sessions[0].session.dispose).not.toHaveBeenCalled();
        await bridge.withdraw();
        expect(sessions[0].isActive()).toBe(false);
        expect(sessions[0].session.dispose).toHaveBeenCalledTimes(1);
    });

    test("cancelled stop preserves the detached draft session and its renderer", async () => {
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {eventId: "before-stop"}));
        const retainedSession = sessions[0].session;
        const retainedDraft = retainedSession.readDraft();
        const renderedBatch = sessions[0].renderedBatch;
        bridge.pause();
        const stopping = bridge.prepareStop();
        bridge.cancelStop();
        const resumed = bridge.handleEvent(eventFor("get_component_catalog", operationScope, {eventId: "after-cancel"}));

        await Promise.all([stopping, resumed]);

        expect(sessions).toHaveLength(1);
        expect(sessions[0].isActive()).toBe(true);
        expect(retainedSession.clearDraft).not.toHaveBeenCalled();
        expect(retainedSession.dispose).not.toHaveBeenCalled();
        const restored = bridge.readDraftSession(stableScope, 7);
        expect(restored).toBe(retainedSession);
        expect(restored?.readDraft()).toEqual(retainedDraft);
        expect(restored?.renderDraftBatch("batch-retained")).toBe(renderedBatch);
    });

    test("aborting preview confirmation keeps the existing uncommitted draft", async () => {
        mocks.showPreview.mockImplementationOnce((_payload, _session, _terminal, signal) => new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(Object.assign(new Error("stopped"), {name: "AbortError"})), {once: true});
        }));
        const task = bridge.handleEvent(eventFor("create_canvas_components", {
            ...operationScope, message: "Build a draft", components: [{type: "BaseText", x: 0, y: 0, width: 100, height: 30}],
        }));
        await vi.waitFor(() => expect(mocks.showPreview).toHaveBeenCalledOnce());
        const session = sessions[0].session;
        const before = session.readDraft();
        bridge.pause();
        const stopping = bridge.prepareStop();
        await Promise.all([task, stopping]);
        bridge.cancelStop();

        expect(session.clearDraft).not.toHaveBeenCalled();
        expect(bridge.readDraftSession(stableScope, 7)).toBe(session);
        expect(session.readDraft()).toEqual(before);
    });

    test("cancelled stop does not reattach a session after the workspace changes", async () => {
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {eventId: "before-scene-change"}));
        bridge.pause();
        currentScope = {...stableScope, loopPath: ["replaced-loop"]};
        bridge.cancelStop();

        expect(sessions[0].isActive()).toBe(false);
        expect(bridge.readDraftSession(stableScope, 7)).toBeUndefined();
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {eventId: "old-scope-after-change"}));

        expect(prepareAiEditing).toHaveBeenCalledTimes(1);
        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "failed", result: expect.objectContaining({code: "agent_scope_workspace_changed"}),
        }), {suppressErrorMessage: true});
    });

    test("withdraw continues through per-session cleanup failures and releases every turn", async () => {
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {turnId: "turn-a", runId: "run-a", eventId: "cleanup-a"}));
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {turnId: "turn-b", runId: "run-b", eventId: "cleanup-b"}));
        vi.mocked(sessions[0].session.clearDraft).mockImplementation(() => {throw new Error("clear failed");});
        vi.mocked(sessions[0].session.dispose).mockImplementation(() => {throw new Error("dispose failed");});

        await expect(bridge.withdraw()).rejects.toMatchObject({name: "AggregateError"});

        expect(prepareAiEditing.mock.calls[0][1].aborted).toBe(true);
        expect(prepareAiEditing.mock.calls[1][1].aborted).toBe(true);
        expect(sessions[0].session.clearDraft).toHaveBeenCalledOnce();
        expect(sessions[0].session.dispose).toHaveBeenCalledOnce();
        expect(sessions[1].session.clearDraft).toHaveBeenCalledOnce();
        expect(sessions[1].session.dispose).toHaveBeenCalledOnce();
        expect(bridge.readDraftSession()).toBeUndefined();
    });

    test("cancel cleans every stale turn even when one session throws during cleanup", async () => {
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {turnId: "stale-a", runId: "run-a", eventId: "stale-a"}));
        await bridge.handleEvent(eventFor("get_component_catalog", operationScope, {turnId: "stale-b", runId: "run-b", eventId: "stale-b"}));
        bridge.pause();
        currentScope = {...stableScope, loopPath: ["replaced-loop"]};
        vi.mocked(sessions[0].session.clearDraft).mockImplementation(() => {throw new Error("clear failed");});
        vi.mocked(sessions[0].session.dispose).mockImplementation(() => {throw new Error("dispose failed");});

        expect(() => bridge.cancelStop()).toThrow(AggregateError);

        expect(prepareAiEditing.mock.calls[0][1].aborted).toBe(true);
        expect(prepareAiEditing.mock.calls[1][1].aborted).toBe(true);
        expect(sessions[0].session.clearDraft).toHaveBeenCalledOnce();
        expect(sessions[0].session.dispose).toHaveBeenCalledOnce();
        expect(sessions[1].session.clearDraft).toHaveBeenCalledOnce();
        expect(sessions[1].session.dispose).toHaveBeenCalledOnce();
        expect(bridge.readDraftSession()).toBeUndefined();
    });

    test("a scene replacement aborts an effect waiting on a delayed tool result", async () => {
        let finish!: (result: unknown) => void;
        mocks.patchCanvas.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
        const task = bridge.handleEvent(eventFor("patch_canvas_components", operationScope));
        await vi.waitFor(() => expect(mocks.patchCanvas).toHaveBeenCalledTimes(1));

        currentSceneVersion = 8;
        bridge.invalidateInactiveScopes();

        expect(prepareAiEditing.mock.calls[0][1].aborted).toBe(true);
        expect(sessions[0].isActive()).toBe(false);
        finish({applied: [{componentId: "late", componentType: "BaseText"}], failed: []});
        await task;

        expect(mocks.completeOperation).toHaveBeenCalledWith(expect.objectContaining({
            status: "failed", result: expect.objectContaining({code: "effect_cancelled"}),
        }), {suppressErrorMessage: true});
    });
});
