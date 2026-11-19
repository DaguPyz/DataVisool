/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';
useMemoryLocalStorage();
import {describe, expect, test, vi} from "vitest";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import type {DesignerAiDraftSnapshot} from "@datavisool/sdk/plugin/contracts/designerRuntime";
import {CanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";
import {FrontendEffectClientError} from "@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts";
import {runRenderDraftTool} from "@/plugins/editor-ai/frontend-effect/tools/RenderDraftTool.ts";

const draft: DesignerAiDraftSnapshot = {
    draftId: "draft-1", revision: 3, layerCount: 1, interactive: false,
    batches: [{batchId: "batch-1", sequence: 1, regionId: "main", layerCount: 1, bounds: {x: 0, y: 0, width: 320, height: 180}}],
};

function makeSession() {
    let active = true;
    const session = {
        isActive: vi.fn(() => active),
        renderDraft: vi.fn(() => draft),
        readDraft: vi.fn(() => draft),
        prepareDraftPreview: vi.fn(() => draft),
        clearDraft: vi.fn(() => true),
        acceptDraft: vi.fn(() => ({appliedLayerIds: ["created-layer-1"], componentBindings: {title: "created-layer-1"}})),
        readComponents: vi.fn(() => ({components: [{id: "created-layer-1", type: "BaseText", name: "标题", layer: {}, config: {style: {color: "#fff"}}}], missingComponentIds: []})),
    };
    return {session: session as unknown as EditorAiEditingSession, setActive: (value: boolean) => {active = value;}, calls: session};
}

describe("renderDraft tool", () => {
    test("passes detached component data to the canvas capability", async () => {
        const {session, calls} = makeSession();
        const components = [{id: "title", type: "BaseText", x: 10, y: 20, width: 320, height: 40, config: {style: {color: "#fff"}}}];

        await expect(runRenderDraftTool({action: "render", interactive: false, ownerKey: "turn-1", components}, session, new CanvasOperationJournal()))
            .resolves.toMatchObject({status: "draft-rendered", draftId: "draft-1", revision: 3, layerCount: 1});

        expect(calls.renderDraft).toHaveBeenCalledWith(expect.objectContaining({components, interactive: false, ownerKey: "turn-1"}));
    });

    test("rejects invalid partitioned interactive drafts before calling canvas", async () => {
        const {session, calls} = makeSession();
        await expect(runRenderDraftTool({action: "render", regionId: "left", interactive: true, components: []}, session, new CanvasOperationJournal()))
            .rejects.toMatchObject({code: "invalid_payload"});
        expect(calls.renderDraft).not.toHaveBeenCalled();
    });

    test("prepares preview at the requested draft revision and scopes clear to its owner", async () => {
        const {session, calls} = makeSession();
        await expect(runRenderDraftTool({action: "preview", draftId: "draft-1", expectedDraftRevision: 3, ownerKey: "turn-1"}, session, new CanvasOperationJournal()))
            .resolves.toMatchObject({status: "draft-preview-ready", revision: 3});
        await expect(runRenderDraftTool({action: "clear", ownerKey: "turn-1"}, session, new CanvasOperationJournal()))
            .resolves.toMatchObject({status: "draft-cleared", cleared: true, draftId: "draft-1"});
        expect(calls.prepareDraftPreview).toHaveBeenCalledWith("draft-1", 3, "turn-1");
        expect(calls.clearDraft).toHaveBeenCalledWith("turn-1");
    });

    test("requires a server approval ticket before accepting a draft", async () => {
        const {session, calls} = makeSession();
        await expect(runRenderDraftTool({action: "accept", draftId: "draft-1"}, session, new CanvasOperationJournal()))
            .rejects.toMatchObject({code: "approval_ticket_missing"});
        expect(calls.acceptDraft).not.toHaveBeenCalled();
    });

    test("accepts once from the canvas snapshot and returns the component id mapping", async () => {
        const {session, calls} = makeSession();
        const journal = new CanvasOperationJournal();
        const request = {
            action: "accept", draftId: "draft-1", approvalTicket: {approvalId: "approval-1", nonce: "nonce-1"},
            operationId: "accept-1", operationFingerprint: "fingerprint-1",
        };

        const result = await runRenderDraftTool(request, session, journal);
        const replay = await runRenderDraftTool(request, session, journal);

        expect(result).toMatchObject({status: "draft-accepted", draftId: "draft-1", layerCount: 1, componentBindings: {title: "created-layer-1"}});
        expect(replay).toEqual(result);
        expect(calls.acceptDraft).toHaveBeenCalledTimes(1);
        expect(calls.acceptDraft).toHaveBeenCalledWith("draft-1", undefined);
    });

    test("refuses operations after the bound workspace is no longer active", async () => {
        const {session, setActive, calls} = makeSession();
        setActive(false);
        await expect(runRenderDraftTool({action: "render", components: []}, session, new CanvasOperationJournal()))
            .rejects.toBeInstanceOf(FrontendEffectClientError);
        expect(calls.renderDraft).not.toHaveBeenCalled();
    });
});
