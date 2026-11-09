/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test, vi} from "vitest";
import {DesignerMode, DesignerScene} from "@datavisool/sdk/types";
import {serializeFrontendEffectError} from "@/frontend-effect/FrontendEffectClientError.ts";

const runtimeMocks = vi.hoisted(() => {
    if (!URL.createObjectURL) {
        Object.defineProperty(URL, "createObjectURL", {
            value: vi.fn(() => "blob:vitest"),
            configurable: true,
        });
    }
    if (!globalThis.Worker) {
        Object.defineProperty(globalThis, "Worker", {
            value: class {
                public addEventListener(): void {}
                public removeEventListener(): void {}
                public postMessage(): void {}
                public terminate(): void {}
            },
            configurable: true,
        });
    }
    const managerStore = {currentManager: null as any};
    class MockDesignerManager {
        public layerManager: any = {};
        public constructor(_scene: DesignerScene) {}
        public init(data: any): void {
            this.layerManager = {...data.layerManager, controllers: {}};
        }
        public destroy(): void {}
    }
    return {managerStore, MockDesignerManager};
});

vi.mock("@/designer/manager/ManagerStore.ts", () => ({default: runtimeMocks.managerStore}));
vi.mock("@/designer/manager/DesignerManager.ts", () => ({default: runtimeMocks.MockDesignerManager}));

import managerStore from "@/designer/manager/ManagerStore.ts";
import {aiLayerDraftRuntime} from "@/designer/ai-driven/AiLayerDraftRuntime.ts";
import {runRenderDraftTool} from "@/frontend-effect/tools/RenderDraftTool.ts";
import BaseButtonDefinition from "@/comps/builtin/base-button/BaseButtonDefinition.ts";

const currentManager = {
    scene: DesignerScene.DEFAULT,
    getData: () => ({}),
    canvasManager: {canvasConfig: {width: 1920, height: 1080}},
};

const pageLayout = [
    {id: "left", x: 0, y: 0, width: 640, height: 1080},
    {id: "center", x: 640, y: 0, width: 640, height: 1080},
    {id: "right", x: 1280, y: 0, width: 640, height: 1080},
];

const regionComponent = (id: string, x: number) => ({
    id,
    type: "BaseText",
    x,
    y: 0,
    width: 120,
    height: 30,
});

describe("renderDraft tool", () => {
    afterEach(() => {
        aiLayerDraftRuntime.clear();
        managerStore.currentManager = null;
        delete (window as any).DATAVISOOL_ENV;
    });

    test("uses config as the only initialization payload", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {
                BaseText: {
                    getInitConfig: () => ({
                        base: {type: "BaseText"},
                        style: {color: "#A7A7A7"},
                        data: {sourceType: "static", staticData: {value: "基础文本"}},
                    }),
                },
            },
        };

        const result = runRenderDraftTool({
            components: [{
                id: "title",
                type: "BaseText",
                x: 0,
                y: 0,
                width: 240,
                height: 30,
                config: {
                    style: {color: "#F5C9B8"},
                    data: {sourceType: "static", staticData: {value: "销量趋势"}},
                },
            }],
        });

        expect(result.status).toBe("draft-rendered");
        const config = Object.values(aiLayerDraftRuntime.activeDraft!.batches[0].manager.layerManager.elemConfigs)[0] as any;
        expect(config.style.color).toBe("#F5C9B8");
        expect(config.data.staticData.value).toBe("销量趋势");
    });

    test("allows documented default button config despite legacy placeholder data", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {
                BaseButton: new BaseButtonDefinition(),
            },
        };

        const result = runRenderDraftTool({
            components: [{
                id: "title",
                type: "BaseButton",
                x: 0,
                y: 0,
                width: 120,
                height: 30,
                useDefaultConfig: true,
            }],
        });
        expect(result.status).toBe("draft-rendered");
    });

    test("keeps ordinary incremental render on the legacy path", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };

        const result = runRenderDraftTool({
            incremental: true,
            components: [regionComponent("legacy-incremental", 10)],
        });

        expect(result).toMatchObject({status: "draft-rendered", revision: 1, layerCount: 1});
        expect(aiLayerDraftRuntime.activeDraft?.ownerKey).toBeUndefined();
        expect(aiLayerDraftRuntime.activeDraft?.layout).toBeUndefined();
    });

    test("allows an owned ordinary interactive=false draft to complete through preview", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const ownerKey = "project-1/thread-1/turn-ordinary-preview";
        const staged = runRenderDraftTool({
            action: "render", interactive: false, ownerKey,
            components: [regionComponent("ordinary-title", 10)],
        });
        expect(runRenderDraftTool({
            action: "preview", draftId: staged.draftId, expectedDraftRevision: staged.revision, ownerKey,
        })).toMatchObject({status: "draft-preview-ready", draftId: staged.draftId, revision: staged.revision});
    });

    test("preserves native button hover settings in a style-only preview", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {
                BaseButton: new BaseButtonDefinition(),
            },
        };

        const result = runRenderDraftTool({
            components: [{
                id: "metric",
                type: "BaseButton",
                x: 0,
                y: 0,
                width: 120,
                height: 30,
                config: {style: {content: "查看详情", hoverBackgroundColor: "#16C0F0", hoverShadow: "#34E4FF99", speed: 0.4}},
            }],
        });
        expect(result.status).toBe("draft-rendered");
        const config = Object.values(aiLayerDraftRuntime.activeDraft!.batches[0].manager.layerManager.elemConfigs)[0] as any;
        expect(config.style).toMatchObject({content: "查看详情", hoverBackgroundColor: "#16C0F0", hoverShadow: "#34E4FF99", speed: 0.4});
    });

    test("still rejects invalid config structure and conflicting initialization intent", () => {
        const component = {id: "button", type: "BaseButton", x: 0, y: 0, width: 180, height: 60};
        for (const config of [[], "invalid", 1]) {
            expect(() => runRenderDraftTool({components: [{...component, config}]})).toThrow("config 必须是对象");
        }
        expect(() => runRenderDraftTool({components: [{...component, config: {style: {}}, useDefaultConfig: true}]}))
            .toThrow("不能同时提供 config");
        expect(aiLayerDraftRuntime.activeDraft).toBeNull();
    });

    test("reports actual and allowed canvas coordinates for out-of-bounds components", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };

        let failure: unknown;
        try {
            runRenderDraftTool({components: [{...regionComponent("edge", 1900), width: 120}]});
        } catch (error) {
            failure = error;
        }
        expect(failure).toMatchObject({
            code: "draft_component_out_of_bounds",
            componentId: "edge",
            actualValue: {x: 1900, y: 0, width: 120, height: 30},
            expectedValue: {x: 0, y: 0, width: 1920, height: 1080},
        });

        const valid = runRenderDraftTool({components: [regionComponent("inside", 10)]});
        expect(valid.revision).toBe(1);
    });

    test("reports invalid layout geometry and the component that crosses a region boundary", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };

        let emptyLayoutFailure: unknown;
        try {
            runRenderDraftTool({
                action: "render", interactive: false, regionId: "left", ownerKey: "owner",
                layout: [], components: [regionComponent("inside", 10)],
            });
        } catch (error) {
            emptyLayoutFailure = serializeFrontendEffectError(error);
        }
        expect(emptyLayoutFailure).toMatchObject({
            code: "draft_layout_required", fieldPath: "layout", actualValue: [], actualType: "array", actualCount: 0,
            expectedValue: {type: "array", minItems: 1},
        });

        let layoutFailure: unknown;
        try {
            runRenderDraftTool({
                action: "render", interactive: false, regionId: "left", ownerKey: "owner",
                layout: [{id: "left", x: 0, y: 0, width: 2000, height: 1080}],
                components: [regionComponent("inside", 10)],
            });
        } catch (error) {
            layoutFailure = error;
        }
        expect(layoutFailure).toMatchObject({
            code: "draft_layout_region_invalid",
            fieldPath: "layout[0].width",
            actualValue: 2000,
            expectedValue: {minimumExclusive: 0, maximum: 1920},
            actualBounds: {id: "left", x: 0, y: 0, width: 2000, height: 1080},
            canvasBounds: {x: 0, y: 0, width: 1920, height: 1080},
        });

        for (const {layout, fieldPath, actualValue, expectedValue} of [
            {layout: [{id: "off-right", x: 1920, y: 0, width: 100, height: 100}], fieldPath: "layout[0].x", actualValue: 1920, expectedValue: {minimumInclusive: 0, exclusiveMaximum: 1920}},
            {layout: [{id: "off-bottom", x: 0, y: 1080, width: 100, height: 100}], fieldPath: "layout[0].y", actualValue: 1080, expectedValue: {minimumInclusive: 0, exclusiveMaximum: 1080}},
        ]) {
            let coordinateFailure: unknown;
            try {
                runRenderDraftTool({
                    action: "render", interactive: false, regionId: "left", ownerKey: "owner",
                    layout, components: [regionComponent("inside", 10)],
                });
            } catch (error) {
                coordinateFailure = error;
            }
            expect(coordinateFailure).toMatchObject({
                code: "draft_layout_region_invalid", fieldPath, actualValue, expectedValue,
            });
        }

        let regionFailure: unknown;
        try {
            runRenderDraftTool({
                action: "render", interactive: false, regionId: "left", ownerKey: "owner",
                layout: [{id: "left", x: 0, y: 0, width: 640, height: 1080}],
                components: [{...regionComponent("crossing", 630), width: 120}],
            });
        } catch (error) {
            regionFailure = error;
        }
        expect(regionFailure).toMatchObject({
            code: "draft_component_outside_region",
            regionId: "left",
            componentId: "crossing",
            actualValue: {x: 630, y: 0, width: 120, height: 30},
            expectedValue: {x: 0, y: 0, width: 640, height: 1080},
        });
    });

    test("rejects effective component ID collisions without advancing the existing draft", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const first = runRenderDraftTool({components: [regionComponent("", 10)]});

        let failure: unknown;
        try {
            runRenderDraftTool({incremental: true, components: [regionComponent("component-1", 20)]});
        } catch (error) {
            failure = error;
        }

        expect(failure).toMatchObject({
            code: "draft_component_id_conflict",
            actualValue: ["component-1"],
            duplicates: [expect.objectContaining({componentId: "component-1", regionId: undefined})],
        });
        expect(aiLayerDraftRuntime.activeDraft?.revision).toBe(first.revision);
    });

    test("stages three page regions without committing and previews only the complete revision", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const ownerKey = "project-1/thread-1/turn-1";
        const first = runRenderDraftTool({
            action: "render", incremental: false, interactive: false, regionId: "left", layout: pageLayout,
            ownerKey, components: [regionComponent("left-title", 10)],
        });
        expect(first).toMatchObject({status: "draft-rendered", revision: 1, layerCount: 1});
        const draftId = first.draftId;
        const second = runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "center", draftId, ownerKey,
            components: [regionComponent("center-title", 650)],
        });
        const third = runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "right", draftId, ownerKey,
            components: [regionComponent("right-title", 1290)],
        });

        expect(second).toMatchObject({status: "draft-rendered", draftId, revision: 2, layerCount: 2});
        expect(third).toMatchObject({status: "draft-rendered", draftId, revision: 3, layerCount: 3});
        const stagedDraft = aiLayerDraftRuntime.activeDraft!;
        expect(aiLayerDraftRuntime.acceptBatch(stagedDraft.batches[0].batchId)).toEqual([]);
        expect(aiLayerDraftRuntime.discardBatch(stagedDraft.batches[0].batchId)).toBe(false);
        expect(aiLayerDraftRuntime.activeDraft).toBe(stagedDraft);
        expect(() => runRenderDraftTool({
            action: "preview", draftId, expectedDraftRevision: 3, ownerKey,
        })).not.toThrow();
        expect(aiLayerDraftRuntime.activeDraft?.layerCount).toBe(3);
        expect(aiLayerDraftRuntime.activeDraft?.revision).toBe(3);
    });

    test("rejects preview when a layout region is missing and returns its id", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const ownerKey = "project-1/thread-1/turn-incomplete";
        const staged = runRenderDraftTool({
            action: "render", interactive: false, regionId: "left", layout: pageLayout, ownerKey,
            components: [regionComponent("left-title", 10)],
        });
        try {
            runRenderDraftTool({action: "preview", draftId: staged.draftId, expectedDraftRevision: 1, ownerKey});
            throw new Error("preview unexpectedly succeeded");
        } catch (error) {
            expect(error).toMatchObject({code: "draft_incomplete", missingRegionIds: ["center", "right"]});
        }
    });

    test("failed region replacement preserves completed regions and the old revision", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const ownerKey = "project-1/thread-1/turn-replace";
        const first = runRenderDraftTool({
            action: "render", interactive: false, regionId: "left", layout: pageLayout, ownerKey,
            components: [regionComponent("left-old", 10)],
        });
        runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "center", draftId: first.draftId, ownerKey,
            components: [regionComponent("center-title", 650)],
        });
        const before = aiLayerDraftRuntime.activeDraft!;
        expect(() => runRenderDraftTool({
            action: "render", incremental: false, interactive: false, regionId: "left", layout: pageLayout, ownerKey,
            components: [regionComponent("reset-page", 10)],
        })).toThrow("已有分区草稿");
        expect(aiLayerDraftRuntime.activeDraft).toBe(before);
        expect(() => runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "center", draftId: first.draftId, ownerKey,
            components: [regionComponent("center-bad", 1300)],
        })).toThrow("超出该区域边界");
        expect(aiLayerDraftRuntime.activeDraft?.revision).toBe(before.revision);
        expect(aiLayerDraftRuntime.activeDraft?.batches.flatMap((batch) => Object.keys(batch.componentLayerIds)))
            .toEqual(expect.arrayContaining(["left-old", "center-title"]));
    });

    test("regenerating one region replaces only that region and rejects cross-region id collisions", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const ownerKey = "project-1/thread-1/turn-regenerate";
        const first = runRenderDraftTool({
            action: "render", interactive: false, regionId: "left", layout: pageLayout, ownerKey,
            components: [regionComponent("left-old", 10)],
        });
        runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "center", draftId: first.draftId, ownerKey,
            components: [regionComponent("center-title", 650)],
        });
        const centerManager = aiLayerDraftRuntime.activeDraft!.batches.find((batch) => batch.regionId === "center")!.manager;
        const replacement = runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "left", draftId: first.draftId, ownerKey,
            components: [regionComponent("left-new", 10)],
        });
        expect(replacement).toMatchObject({revision: 3, layerCount: 2});
        const ids = aiLayerDraftRuntime.activeDraft!.batches.flatMap((batch) => Object.keys(batch.componentLayerIds));
        expect(aiLayerDraftRuntime.activeDraft!.batches.map((batch) => batch.regionId)).toEqual(["left", "center"]);
        expect(aiLayerDraftRuntime.activeDraft!.batches.find((batch) => batch.regionId === "center")!.manager).toBe(centerManager);
        expect(ids).toEqual(expect.arrayContaining(["left-new", "center-title"]));
        expect(ids).not.toContain("left-old");
        expect(() => runRenderDraftTool({
            action: "render", incremental: true, interactive: false, regionId: "right", draftId: first.draftId, ownerKey,
            components: [regionComponent("center-title", 1290)],
        })).toThrow("不同区域的组件 id 不能重复");
        expect(aiLayerDraftRuntime.activeDraft?.revision).toBe(3);
    });

    test("clears only the matching turn draft and returns its previous revision", () => {
        managerStore.currentManager = currentManager as any;
        (window as any).DATAVISOOL_ENV = {
            currentManager,
            mode: DesignerMode.EDIT,
            definitions: {BaseText: {getInitConfig: () => ({base: {type: "BaseText"}})}},
        };
        const ownerKey = "project-1/thread-1/turn-clear";
        const staged = runRenderDraftTool({
            action: "render", interactive: false, regionId: "left", layout: pageLayout, ownerKey,
            components: [regionComponent("left-title", 10)],
        });
        expect(() => runRenderDraftTool({action: "clear", ownerKey: "another-turn"}))
            .toThrow("不属于此 Agent 作用域");
        expect(aiLayerDraftRuntime.activeDraft?.draftId).toBe(staged.draftId);

        expect(runRenderDraftTool({action: "clear", ownerKey})).toMatchObject({
            status: "draft-cleared", cleared: true, draftId: staged.draftId, revision: staged.revision,
        });
        expect(aiLayerDraftRuntime.activeDraft).toBeNull();
    });
});
