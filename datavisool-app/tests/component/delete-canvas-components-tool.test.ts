/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

const deletion = vi.hoisted(() => ({deleteLayersByIds: vi.fn()}));
vi.mock("@/designer/operate-provider/selection/SelectionCommands.ts", () => ({
    deleteLayersByIds: deletion.deleteLayersByIds,
}));

import {runDeleteCanvasComponentsTool} from "@/frontend-effect/tools/DeleteCanvasComponentsTool.ts";
import {serializeFrontendEffectError} from "@/frontend-effect/FrontendEffectClientError.ts";

describe("delete canvas components tool", () => {
    let layers: Record<string, any>;

    beforeEach(() => {
        vi.resetAllMocks();
        const storage = new Map<string, string>();
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => storage.set(key, value),
            },
        });
        layers = {
            first: {id: "first", type: "BaseText", name: "First"},
            second: {id: "second", type: "BaseText", name: "Second"},
        };
        (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: layers}}};
    });

    afterEach(() => delete (window as any).DATAVISOOL_ENV);

    test("records partial deletion and the original exception, then replays the failed receipt without deleting again", async () => {
        deletion.deleteLayersByIds.mockImplementationOnce((ids: string[]) => {
            delete layers[ids[0]];
            throw Object.assign(new Error("second target cleanup failed"), {code: "layer_cleanup_failed", fieldPath: "layer.second"});
        });
        const payload = deletionPayload();

        const first = await runDeleteCanvasComponentsTool(payload);
        const replay = await runDeleteCanvasComponentsTool(payload);

        expect(first).toMatchObject({
            deletedComponentIds: ["first"],
            failed: [{
                componentId: "second",
                code: "delete_operation_failed",
                fieldPath: "layer.second",
                actualState: "present",
                cause: {code: "layer_cleanup_failed", message: "second target cleanup failed", fieldPath: "layer.second"},
            }],
            partial: true,
            actualStateUnknown: true,
            cleanupStateUnknown: true,
            actualState: [
                {componentId: "first", state: "deleted"},
                {componentId: "second", state: "present"},
            ],
        });
        expect(replay).toEqual(first);
        expect(deletion.deleteLayersByIds).toHaveBeenCalledTimes(1);
    });

    test("keeps an execution failure failed when all component configs were removed before cleanup threw", async () => {
        deletion.deleteLayersByIds.mockImplementationOnce((ids: string[]) => {
            ids.forEach((id) => delete layers[id]);
            throw new Error("global variable unbind failed");
        });
        const payload = deletionPayload();

        const first = await runDeleteCanvasComponentsTool(payload);
        const replay = await runDeleteCanvasComponentsTool(payload);

        expect(first).toMatchObject({
            deletedComponentIds: ["first", "second"],
            failed: [{
                componentId: "$operation",
                code: "delete_execution_failed",
                fieldPath: "execution",
                message: "global variable unbind failed",
                actualState: "targets deleted; cleanup status unknown",
                expectedValue: "所有目标删除且关联清理均完成",
            }],
            partial: true,
            actualStateUnknown: true,
            cleanupStateUnknown: true,
            operationError: {message: "global variable unbind failed"},
        });
        expect(replay).toEqual(first);
        expect(deletion.deleteLayersByIds).toHaveBeenCalledTimes(1);
    });

    test("returns raw target arrays and missing layer baselines as actual values", async () => {
        const approvalTicket = {approvalId: "approval-delete", nonce: "nonce-delete"};
        const emptyTargets = await runDeleteCanvasComponentsTool({approvalTicket, targets: []}).catch(serializeFrontendEffectError);
        expect(emptyTargets).toMatchObject({
            fieldPath: "targets", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1, maxItems: 100},
        });

        const missingLayer = await runDeleteCanvasComponentsTool({
            approvalTicket,
            targets: [{componentId: "first", componentType: "BaseText"}],
            expectedSnapshots: [{componentId: "first", componentType: "BaseText"}],
        }).catch(serializeFrontendEffectError);
        expect(missingLayer).toMatchObject({
            fieldPath: "expectedSnapshots[0].layer", actualValue: null, actualType: "missing",
            presentFields: ["componentId", "componentType"], expectedValue: "layer 快照字段",
        });
    });

    test("preserves the read-back error when the layer configuration is unavailable after deletion", async () => {
        deletion.deleteLayersByIds.mockImplementationOnce((ids: string[]) => {
            ids.forEach((id) => delete layers[id]);
            (window as any).DATAVISOOL_ENV.currentManager.layerManager = {};
        });

        const payload = deletionPayload();
        payload.targets = payload.targets.slice(0, 1);
        payload.expectedSnapshots = payload.expectedSnapshots.slice(0, 1);
        const result = await runDeleteCanvasComponentsTool(payload);

        expect(result).toMatchObject({
            deletedComponentIds: [],
            failed: [{
                componentId: "first",
                code: "delete_state_unknown",
                actualValue: "unknown",
                expectedValue: null,
                cause: {
                    code: "delete_state_unavailable",
                    fieldPath: "currentManager.layerManager.layerConfigs",
                    actualValue: null,
                    actualType: "missing",
                    expectedValue: "object containing current component configurations",
                },
                verificationError: {code: "delete_state_unavailable"},
            }],
            actualStateUnknown: true,
        });
    });
});

function deletionPayload() {
    return {
        operationId: `delete-test-${crypto.randomUUID()}`,
        operationFingerprint: "delete-fingerprint",
        approvalTicket: {approvalId: "approval-delete", nonce: "nonce-delete"},
        targets: [
            {componentId: "first", componentType: "BaseText"},
            {componentId: "second", componentType: "BaseText"},
        ],
        expectedSnapshots: [
            {componentId: "first", componentType: "BaseText", layer: {id: "first", type: "BaseText", name: "First"}},
            {componentId: "second", componentType: "BaseText", layer: {id: "second", type: "BaseText", name: "Second"}},
        ],
    };
}
