/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';
useMemoryLocalStorage();
import {beforeEach, describe, expect, test, vi} from "vitest";
import {cloneDeep} from "lodash";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import {CanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";
import {serializeFrontendEffectError} from "@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts";
import {runDeleteCanvasComponentsTool} from "@/plugins/editor-ai/frontend-effect/tools/DeleteCanvasComponentsTool.ts";

function makeSession() {
    const state = new Map([
        ["first", {id: "first", type: "BaseText", name: "First"}],
        ["second", {id: "second", type: "BaseText", name: "Second"}],
    ]);
    const readComponents = vi.fn((ids: readonly string[]) => ({
        components: ids.flatMap(id => state.has(id) ? [{id, type: "BaseText", name: state.get(id)?.name, layer: cloneDeep(state.get(id))}] : []),
        missingComponentIds: ids.filter(id => !state.has(id)),
    }));
    const deleteComponents = vi.fn((targets: readonly {componentId: string; componentType: string}[]) => {
        targets.forEach(target => state.delete(target.componentId));
        return {applied: targets.map(target => ({componentId: target.componentId, componentType: target.componentType})), failed: []};
    });
    const session = {isActive: () => true, readComponents, deleteComponents} as unknown as EditorAiEditingSession;
    return {session, state, readComponents, deleteComponents};
}

function payload(targets = ["first", "second"]) {
    return {
        operationId: `delete-${crypto.randomUUID()}`,
        operationFingerprint: "delete-fingerprint",
        approvalTicket: {approvalId: "approval-delete", nonce: "nonce-delete"},
        targets: targets.map(componentId => ({componentId, componentType: "BaseText"})),
        expectedSnapshots: targets.map(componentId => ({componentId, componentType: "BaseText",
            layer: {id: componentId, type: "BaseText", name: componentId === "first" ? "First" : "Second"}})),
    };
}

describe("delete canvas components tool", () => {
    let session: EditorAiEditingSession;
    let state: Map<string, {id: string; type: string; name: string}>;
    let deleteComponents: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        const fixture = makeSession();
        session = fixture.session;
        state = fixture.state;
        deleteComponents = fixture.deleteComponents;
    });

    test("records a partial deletion and replays the receipt without deleting again", async () => {
        deleteComponents.mockImplementationOnce((targets: Array<{componentId: string; componentType: string}>) => {
            state.delete(targets[0].componentId);
            return {
                applied: [targets[0]],
                failed: [{componentId: "second", code: "delete_failed", message: "cleanup failed"}],
            };
        });
        const request = payload();
        const journal = new CanvasOperationJournal();

        const first = await runDeleteCanvasComponentsTool(request, session, journal);
        const replay = await runDeleteCanvasComponentsTool(request, session, journal);

        expect(first).toMatchObject({
            deletedComponentIds: ["first"],
            failed: [{componentId: "second", code: "delete_failed", actualState: "present"}],
            partial: true,
            actualStateUnknown: false,
            actualState: [{componentId: "first", state: "deleted"}, {componentId: "second", state: "present"}],
        });
        expect(replay).toEqual(first);
        expect(deleteComponents).toHaveBeenCalledTimes(1);
    });

    test("requires an approval ticket and reports exact malformed target input", async () => {
        const emptyTargets = await runDeleteCanvasComponentsTool({approvalTicket: {approvalId: "a", nonce: "n"}, targets: []}, session, new CanvasOperationJournal())
            .catch(serializeFrontendEffectError);
        expect(emptyTargets).toMatchObject({fieldPath: "targets", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1, maxItems: 100}});

        await expect(runDeleteCanvasComponentsTool(payload(), session, new CanvasOperationJournal()))
            .resolves.toMatchObject({deletedComponentIds: ["first", "second"]});
    });

    test("reports cleanup failure even if the model snapshot shows all targets deleted", async () => {
        deleteComponents.mockImplementationOnce((targets: Array<{componentId: string; componentType: string}>) => {
            targets.forEach(target => state.delete(target.componentId));
            throw Object.assign(new Error("global variable cleanup failed"), {code: "cleanup_failed"});
        });
        const result = await runDeleteCanvasComponentsTool(payload(), session, new CanvasOperationJournal());

        expect(result.deletedComponentIds).toEqual(["first", "second"]);
        expect(result.failed).toEqual([expect.objectContaining({componentId: "$operation", code: "delete_execution_failed"})]);
        expect(result.cleanupStateUnknown).toBe(true);
        expect(result.operationError).toMatchObject({code: "cleanup_failed", message: "global variable cleanup failed"});
    });

    test("rejects a missing layer baseline before asking the canvas to delete", async () => {
        const request = {...payload(["first"]), expectedSnapshots: [{componentId: "first", componentType: "BaseText"}]};
        const error = await runDeleteCanvasComponentsTool(request, session, new CanvasOperationJournal()).catch(serializeFrontendEffectError);

        expect(error).toMatchObject({fieldPath: "expectedSnapshots[0].layer", actualValue: null,
            presentFields: ["componentId", "componentType"], expectedValue: "layer 快照字段"});
        expect(deleteComponents).not.toHaveBeenCalled();
    });

    test("does not delete a component whose layer changed after the expected snapshot", async () => {
        const request = payload(["first"]);
        request.expectedSnapshots[0].layer.name = "stale-name";
        const result = await runDeleteCanvasComponentsTool(request, session, new CanvasOperationJournal());

        expect(result.deletedComponentIds).toEqual([]);
        expect(result.failed[0]).toMatchObject({componentId: "first", code: "component_revision_conflict"});
        expect(deleteComponents).not.toHaveBeenCalled();
    });
});
