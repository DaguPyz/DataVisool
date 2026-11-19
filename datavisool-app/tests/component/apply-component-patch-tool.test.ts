/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test, vi} from "vitest";
import {cloneDeep, merge} from "lodash";
import type {EditorAiEditingSession} from "@datavisool/sdk/plugin/contracts/editorCanvas";
import {CanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";
import {runApplyComponentPatchTool} from "@/plugins/editor-ai/frontend-effect/tools/ApplyComponentPatchTool.ts";

type Component = {id: string; type: string; name?: string; layer: Record<string, any>; config: Record<string, any>};

function makeSession(components: Component[]) {
    const state = new Map(components.map(component => [component.id, cloneDeep(component)]));
    const readComponents = vi.fn((ids: readonly string[]) => ({
        components: ids.flatMap(id => state.has(id) ? [cloneDeep(state.get(id)!)] : []),
        missingComponentIds: ids.filter(id => !state.has(id)),
    }));
    const applyComponentPatch = vi.fn(async (patches: readonly any[]) => {
        patches.forEach(patch => {
            const component = state.get(patch.componentId);
            if (!component) return;
            if (patch.stylePatch) component.config.style = merge({}, component.config.style ?? {}, patch.stylePatch.style);
            if (patch.dataPatch) {
                component.config.data = merge({}, component.config.data ?? {}, patch.dataPatch);
                if (patch.dataPatch.sourceType === 'static' && patch.dataPatch.staticData)
                    component.config.data.value = cloneDeep(patch.dataPatch.staticData.value);
            }
            if (patch.filterPatch) component.config.filter = merge({}, component.config.filter ?? {}, patch.filterPatch);
            if (patch.layerPatch) Object.assign(component.layer, patch.layerPatch);
        });
        return {applied: patches.map(patch => ({componentId: patch.componentId, componentType: patch.componentType})), failed: []};
    });
    const session = {
        isActive: () => true,
        readComponents,
        applyComponentPatch,
    } as unknown as EditorAiEditingSession;
    return {session, state, readComponents, applyComponentPatch};
}

const baseText = (id: string, config: Record<string, any> = {}) => ({
    id, type: "BaseText", name: id, layer: {id, type: "BaseText", name: id, x: 0, y: 0, width: 120, height: 30},
    config: {base: {type: "BaseText"}, style: {color: "#336699"}, ...config},
});

const run = (payload: unknown, session: EditorAiEditingSession) => runApplyComponentPatchTool(payload, session, new CanvasOperationJournal());

describe("applyComponentPatch tool", () => {
    test("captures a detached baseline and forwards the patch to the canvas capability", async () => {
        const {session, applyComponentPatch} = makeSession([baseText("text")]);
        const result = await run({patches: [{componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "#ff5722"}}}]}, session);

        expect(result.failed).toEqual([]);
        expect(applyComponentPatch).toHaveBeenCalledWith(
            [expect.objectContaining({componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "#ff5722"}}})],
            [expect.objectContaining({componentId: "text", style: {color: "#336699"}})],
        );
    });

    test("rejects a target missing from the bound scene", async () => {
        const {session} = makeSession([]);
        const result = await run({patches: [{componentId: "missing", componentType: "BaseText", dataPatch: {sourceType: "static", staticData: {value: []}}}]}, session);
        expect(result.failed).toEqual([expect.objectContaining({componentId: "missing", code: "controller_not_found"})]);
    });

    test("updates data through the canvas handle and returns the resulting snapshot", async () => {
        const initialData = {sourceType: "static", staticData: {value: [{name: "old", value: 1}]}, value: [{name: "old", value: 1}]};
        const {session, state} = makeSession([baseText("text", {data: initialData})]);
        const data = [{name: "new", value: 2}];
        const result = await run({patches: [{componentId: "text", componentType: "BaseText", dataPatch: {sourceType: "static", staticData: {value: data}}}]}, session);

        expect(result.failed).toEqual([]);
        expect(state.get("text")?.config.data).toMatchObject({sourceType: "static", staticData: {value: data}, value: data});
        expect(result.resultRevision).toMatch(/^sha256:/);
    });

    test("reports unknown layer and filter fields with actual values and allowed names", async () => {
        const {session} = makeSession([baseText("text")]);
        const approvalTicket = {approvalId: "approval-1", nonce: "nonce-1"};
        await expect(run({approvalTicket, patches: [{componentId: "text", componentType: "BaseText", layerPatch: {zIndex: 12}}]}, session))
            .rejects.toMatchObject({code: "invalid_patch", fieldPath: "patches[0].layerPatch.zIndex", actualValue: 12,
                allowedValues: ["x", "y", "width", "height", "name"]});
        await expect(run({approvalTicket, patches: [{componentId: "text", componentType: "BaseText", filterPatch: {gamma: 2}}]}, session))
            .rejects.toMatchObject({code: "invalid_patch", fieldPath: "patches[0].filterPatch.gamma", actualValue: 2,
                allowedValues: ["enable", "blur", "brightness", "contrast", "opacity", "saturate", "hueRotate"]});
    });

    test("reports an out-of-range filter value and its accepted range", async () => {
        const {session} = makeSession([baseText("text")]);
        await expect(run({approvalTicket: {approvalId: "approval-1", nonce: "nonce-1"},
            patches: [{componentId: "text", componentType: "BaseText", filterPatch: {opacity: 1.5}}]}, session))
            .rejects.toMatchObject({code: "invalid_patch", fieldPath: "patches[0].filterPatch.opacity", actualValue: 1.5,
                expectedValue: {type: "finite number", minimum: 0, maximum: 1}});
    });

    test("rejects an incomplete caller supplied baseline", async () => {
        const {session} = makeSession([baseText("text")]);
        await expect(run({patches: [{componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "red"}}}],
            expectedSnapshots: [{componentId: "text", componentType: "BaseText"}]}, session))
            .rejects.toMatchObject({code: "invalid_payload", componentId: "text", fieldPath: "expectedSnapshots[0].style",
                actualValue: undefined, presentFields: ["componentId", "componentType"], expectedValue: ["expectedSnapshots[0].style"]});
    });

    test("rejects duplicate targets before a batch can partially overwrite one component", async () => {
        const {session, applyComponentPatch} = makeSession([baseText("text")]);
        await expect(run({patches: [
            {componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "red"}}},
            {componentId: "text", componentType: "BaseText", stylePatch: {style: {fontSize: 20}}},
        ]}, session)).rejects.toMatchObject({code: "invalid_payload", fieldPath: "patches[].componentId"});
        expect(applyComponentPatch).not.toHaveBeenCalled();
    });

    test("returns expected and current values when a baseline conflicts", async () => {
        const {session} = makeSession([baseText("text", {style: {color: "blue", fontSize: 12}})]);
        const result = await run({patches: [{componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "red"}}}],
            expectedSnapshots: [{componentId: "text", componentType: "BaseText", style: {color: "black", fontSize: 12}}]}, session);

        expect(result.failed[0]).toMatchObject({code: "component_revision_conflict", fieldPath: "style.color",
            changedPaths: [{fieldPath: "style.color", expectedValue: "black", currentValue: "blue"}]});
    });
});
