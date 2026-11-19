/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test, vi} from "vitest";
import {createCanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';

useMemoryLocalStorage();

describe("CanvasOperationJournal", () => {
    test("keeps a failed partial result failed on resume and returns the original receipt", async () => {
        const journal = createCanvasOperationJournal();
        const operationId = `partial-${crypto.randomUUID()}`;
        const payload = {operationId, operationFingerprint: "fingerprint-1"};
        const result = {
            applied: [{componentId: "one", componentType: "BaseText"}],
            failed: [{componentId: "two", code: "component_revision_conflict", message: "changed"}],
            partial: true,
        };
        const execute = vi.fn(() => result);

        await expect(journal.run(payload, execute))
            .resolves.toEqual(result);
        const resumed = createCanvasOperationJournal();
        await expect(resumed.run(payload, execute))
            .resolves.toEqual(result);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(resumed.readStatus({operationId})).toMatchObject({
            status: "failed",
            result,
        });
    });
});
