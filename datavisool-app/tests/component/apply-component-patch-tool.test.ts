/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from "vitest";
import {runApplyComponentPatchTool} from "@/frontend-effect/tools/ApplyComponentPatchTool.ts";

describe("applyComponentPatch tool", () => {
    afterEach(() => {
        delete (window as any).DATAVISOOL_ENV;
    });

    test("captures the current baseline immediately when the server does not provide one", async () => {
        const config: any = {
            base: {type: "BaseText"},
            style: {color: "#336699", optional: undefined},
        };
        const update = vi.fn((patch: any) => {
            config.style = patch.style;
        });
        (window as any).DATAVISOOL_ENV = {
            currentManager: {
                layerManager: {
                    layerConfigs: {text: {id: "text", type: "BaseText"}},
                    controllers: {text: {getConfig: () => config, update}},
                },
            },
        };

        const result = await runApplyComponentPatchTool({
            patches: [{
                componentId: "text",
                componentType: "BaseText",
                stylePatch: {style: {color: "#ff5722"}},
            }],
        });

        expect(result.failed).toEqual([]);
        expect(update).toHaveBeenCalledWith({style: {color: "#ff5722", optional: undefined}}, {reRender: true});
    });

    test("allows an existing component data patch without an approval ticket", async () => {
        const result = await runApplyComponentPatchTool({
            patches: [{
                componentId: "missing",
                componentType: "BaseText",
                dataPatch: {sourceType: "static", staticData: {value: []}},
            }],
        });

        expect(result.failed).toEqual([expect.objectContaining({
            componentId: "missing",
            code: "controller_not_found",
        })]);
    });

    test("updates data configuration and refreshes component data", async () => {
        const config: any = {
            base: {type: "BaseText"},
            data: {sourceType: "static", staticData: {value: [{name: "old", value: 1}]}, value: [{name: "old", value: 1}]},
        };
        const update = vi.fn((patch: any) => {
            config.data = patch.data;
        });
        const changeData = vi.fn();
        (window as any).DATAVISOOL_ENV = {
            currentManager: {
                layerManager: {
                    layerConfigs: {text: {id: "text", type: "BaseText"}},
                    controllers: {text: {getConfig: () => config, update, changeData}},
                },
            },
        };

        const data = [{name: "new", value: 2}];
        const result = await runApplyComponentPatchTool({
            patches: [{
                componentId: "text",
                componentType: "BaseText",
                dataPatch: {sourceType: "static", staticData: {value: data}},
            }],
        });

        expect(result.failed).toEqual([]);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({sourceType: "static", staticData: {value: data}, value: data}),
        }), {reRender: true});
        expect(changeData).toHaveBeenCalledWith(data);
        expect(update.mock.invocationCallOrder[0]).toBeLessThan(changeData.mock.invocationCallOrder[0]);
    });

    test("reports unknown layer and filter fields with actual values and allowed names", async () => {
        const approvalTicket = {approvalId: "approval-1", nonce: "nonce-1"};
        await expect(runApplyComponentPatchTool({
            approvalTicket,
            patches: [{componentId: "text", componentType: "BaseText", layerPatch: {zIndex: 12} as any}],
        })).rejects.toMatchObject({
            code: "invalid_patch",
            fieldPath: "patches[0].layerPatch.zIndex",
            actualValue: 12,
            allowedValues: ["x", "y", "width", "height", "name"],
        });
        await expect(runApplyComponentPatchTool({
            approvalTicket,
            patches: [{componentId: "text", componentType: "BaseText", filterPatch: {gamma: 2} as any}],
        })).rejects.toMatchObject({
            code: "invalid_patch",
            fieldPath: "patches[0].filterPatch.gamma",
            actualValue: 2,
            allowedValues: ["enable", "blur", "brightness", "contrast", "opacity", "saturate", "hueRotate"],
        });
    });

    test("reports an out-of-range filter value and its accepted range", async () => {
        await expect(runApplyComponentPatchTool({
            approvalTicket: {approvalId: "approval-1", nonce: "nonce-1"},
            patches: [{componentId: "text", componentType: "BaseText", filterPatch: {opacity: 1.5}}],
        })).rejects.toMatchObject({
            code: "invalid_patch",
            fieldPath: "patches[0].filterPatch.opacity",
            actualValue: 1.5,
            expectedValue: {type: "finite number", minimum: 0, maximum: 1},
        });
    });

    test("identifies a missing baseline field for the exact component", async () => {
        await expect(runApplyComponentPatchTool({
            patches: [{componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "red"}}}],
            expectedSnapshots: [{componentId: "text", componentType: "BaseText"}],
        })).rejects.toMatchObject({
            code: "invalid_payload",
            componentId: "text",
            fieldPath: "expectedSnapshots[0].style",
            actualValue: undefined,
            presentFields: ["componentId", "componentType"],
            expectedValue: ["expectedSnapshots[0].style"],
        });
    });

    test("returns current and expected field values on a baseline conflict", async () => {
        const config: any = {base: {type: "BaseText"}, style: {color: "blue", fontSize: 12}};
        (window as any).DATAVISOOL_ENV = {
            currentManager: {
                layerManager: {
                    layerConfigs: {text: {id: "text", type: "BaseText"}},
                    controllers: {text: {getConfig: () => config, update: vi.fn()}},
                },
            },
        };

        const result = await runApplyComponentPatchTool({
            patches: [{componentId: "text", componentType: "BaseText", stylePatch: {style: {color: "red"}}}],
            expectedSnapshots: [{componentId: "text", componentType: "BaseText", style: {color: "black", fontSize: 12}}],
        });

        expect(result.failed[0]).toMatchObject({
            code: "component_revision_conflict",
            fieldPath: "style.color",
            changedPaths: [{fieldPath: "style.color", expectedValue: "black", currentValue: "blue"}],
        });
    });
});
