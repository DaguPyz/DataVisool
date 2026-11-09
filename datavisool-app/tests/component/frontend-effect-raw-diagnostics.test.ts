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
import {serializeFrontendEffectError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {runApplyComponentPatchTool} from "@/frontend-effect/tools/ApplyComponentPatchTool.ts";
import {runApplyComponentStylePatchTool} from "@/frontend-effect/tools/ApplyComponentStylePatchTool.ts";
import {runGetComponentDataContractTool} from "@/frontend-effect/tools/GetComponentDataContractTool.ts";
import {normalizeComponentSelectionPayload} from "@/frontend-effect/tools/PreviewInteractionTools.ts";
import {runRenderDraftTool} from "@/frontend-effect/tools/RenderDraftTool.ts";
import {runUserInputTool} from "@/frontend-effect/tools/UserInputTool.ts";

describe("frontend tool raw input diagnostics", () => {
    test("preserves the actual arrays and reports their type separately from their count", async () => {
        const patchError = await runApplyComponentPatchTool({patches: []}).catch(serializeFrontendEffectError);
        expect(patchError).toMatchObject({
            fieldPath: "patches", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        const styleError = capture(() => runApplyComponentStylePatchTool({patches: []}));
        expect(styleError).toMatchObject({
            fieldPath: "patches", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        const draftError = capture(() => runRenderDraftTool({components: []}));
        expect(draftError).toMatchObject({
            fieldPath: "components", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        const candidatesError = capture(() => normalizeComponentSelectionPayload({message: "选择一个", candidates: []}));
        expect(candidatesError).toMatchObject({
            fieldPath: "candidates", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1, maxItems: 30},
        });

        const questionsError = capture(() => runUserInputTool("补充输入", {questions: []}));
        expect(questionsError).toMatchObject({
            fieldPath: "questions", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1, maxItems: 3},
        });
    });

    test("keeps data contract componentIds and count as distinct diagnostics", () => {
        const ids = ["one", "two", "three", "four", "five"];
        const error = capture(() => runGetComponentDataContractTool({componentIds: ids}));
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
