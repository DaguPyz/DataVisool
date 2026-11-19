/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test, vi} from "vitest";

vi.hoisted(() => {
    if (!URL.createObjectURL)
        Object.defineProperty(URL, "createObjectURL", {value: vi.fn(() => "blob:vitest"), configurable: true});
    if (!globalThis.Worker)
        Object.defineProperty(globalThis, "Worker", {
            value: class {
                public addEventListener(): void {}
                public removeEventListener(): void {}
                public postMessage(): void {}
                public terminate(): void {}
            },
            configurable: true,
        });
});
import {serializeFrontendEffectError} from "@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts";
import {runApplyComponentPatchTool} from "@/plugins/editor-ai/frontend-effect/tools/ApplyComponentPatchTool.ts";
import {runApplyComponentStylePatchTool} from "@/plugins/editor-ai/frontend-effect/tools/ApplyComponentStylePatchTool.ts";
import {runGetComponentDataContractTool} from "@/plugins/editor-ai/frontend-effect/tools/GetComponentDataContractTool.ts";
import {normalizeComponentSelectionPayload} from "@/plugins/editor-ai/frontend-effect/tools/PreviewInteractionTools.ts";
import {runRenderDraftTool} from "@/plugins/editor-ai/frontend-effect/tools/RenderDraftTool.ts";
import {runUserInputTool} from "@/plugins/editor-ai/frontend-effect/tools/UserInputTool.ts";
import {CanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";

describe("frontend tool raw input diagnostics", () => {
    test("preserves the actual arrays and reports their type separately from their count", async () => {
        const patchError = await runApplyComponentPatchTool({patches: []}, {} as any, new CanvasOperationJournal()).catch(serializeFrontendEffectError);
        expect(patchError).toMatchObject({
            fieldPath: "patches", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        const styleError = capture(() => runApplyComponentStylePatchTool({patches: []}, {} as any));
        expect(styleError).toMatchObject({
            fieldPath: "patches", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        const draftError = await captureAsync(() => runRenderDraftTool({components: []}, {} as any, new CanvasOperationJournal()));
        expect(draftError).toMatchObject({
            fieldPath: "components", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        const candidatesError = capture(() => normalizeComponentSelectionPayload({message: "选择一个", candidates: []}));
        expect(candidatesError).toMatchObject({
            fieldPath: "candidates", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1, maxItems: 30},
        });

        const questionsError = await captureAsync(() => runUserInputTool("补充输入", {questions: []}, {} as any));
        expect(questionsError).toMatchObject({
            fieldPath: "questions", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1, maxItems: 3},
        });
    });

    test("keeps data contract componentIds and count as distinct diagnostics", () => {
        const ids = ["one", "two", "three", "four", "five"];
        const error = capture(() => runGetComponentDataContractTool({componentIds: ids}, {} as any, {} as any));
        expect(error).toMatchObject({
            fieldPath: "componentIds", actualValue: ids, actualType: "array", actualCount: 5,
            expectedValue: {type: "array", minItems: 1, maxItems: 4},
        });
    });
});

function capture(action: () => unknown): Record<string, unknown> {
    try {
        action();
    } catch (error) {
        return serializeFrontendEffectError(error);
    }
    throw new Error("Expected the tool input to be rejected");
}

async function captureAsync(action: () => Promise<unknown>): Promise<Record<string, unknown>> {
    try {
        await action();
    } catch (error) {
        return serializeFrontendEffectError(error);
    }
    throw new Error("Expected the tool input to be rejected");
}
