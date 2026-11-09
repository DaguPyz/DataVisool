/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test, vi} from "vitest";
import {
    runGetCanvasOperationStatusTool,
    runIdempotentCanvasOperation,
} from "@/frontend-effect/CanvasOperationJournal.ts";

describe("CanvasOperationJournal", () => {
    test("keeps a failed partial result failed on resume and returns the original receipt", async () => {
        const storage = new Map<string, string>();
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => storage.set(key, value),
            },
        });
        const operationId = `partial-${crypto.randomUUID()}`;
        const payload = {operationId, operationFingerprint: "fingerprint-1"};
        const result = {
            applied: [{componentId: "one", componentType: "BaseText"}],
            failed: [{componentId: "two", code: "component_revision_conflict", message: "changed"}],
            partial: true,
        };
        const execute = vi.fn(() => result);

        await expect(runIdempotentCanvasOperation(payload, execute))
            .resolves.toEqual(result);
        await expect(runIdempotentCanvasOperation(payload, execute))
            .resolves.toEqual(result);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(runGetCanvasOperationStatusTool({operationId})).toMatchObject({
            status: "failed",
            result,
        });
    });
});
