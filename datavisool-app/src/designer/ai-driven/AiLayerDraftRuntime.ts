/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep} from "lodash";
import {action, isObservableProp, makeObservable, observable, reaction} from "mobx";
import {ObjectUtil} from "@datavisool/sdk";
import type {ILayerItem, ILayerManager} from "@datavisool/sdk/types";
import {DesignerMode, DesignerScene} from "@datavisool/sdk/types";
import DesignerManager from "@/designer/manager/DesignerManager.ts";
import managerStore from "@/designer/manager/ManagerStore.ts";
import historyRecordOperateProxy from "@/designer/operate-provider/undo-redo/HistoryRecordOperateProxy.ts";
import {normalizeDataConfig} from "@/util/DataSourceConfigUtil.ts";
import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {aiDrivenDevError} from "./AiDrivenDevLogger.ts";

/** 通用草稿组件描述，组件类型必须已经注册到设计器。 */
export interface AiLayerDraftComponent {
    id?: string;
    type: string;
    name?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    order?: number;
    config?: Record<string, unknown>;
    useDefaultConfig?: boolean;
}

/** 单个草稿批次在画布上的覆盖范围。 */
export interface AiLayerDraftBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AiLayerDraftRegion extends AiLayerDraftBounds {
    id: string;
}

/** 一次 renderDraft 调用生成的独立草稿批次。 */
export interface AiLayerDraftBatch {
    batchId: string;
    sequence: number;
    regionId?: string;
    layerCount: number;
    bounds: AiLayerDraftBounds;
    componentLayerIds: Record<string, string>;
    manager: DesignerManager;
}

/** 当前挂载到画布上的全部临时草稿批次。 */
export interface AiLayerActiveDraft {
    draftId: string;
    revision: number;
    layerCount: number;
    interactive: boolean;
    canvasWidth: number;
    canvasHeight: number;
    batches: AiLayerDraftBatch[];
    layout?: AiLayerDraftRegion[];
    ownerKey?: string;
    canvasManager?: DesignerManager;
}

/** 草稿渲染结果。 */
export interface AiLayerDraftRenderResult {
    status: "draft-rendered";
    draftId: string;
    layerCount: number;
    revision?: number;
}

export class AiLayerDraftRuntimeError extends FrontendEffectClientError {
    constructor(code: string, message: string, details: Record<string, unknown> = {}) {
        super(code, message, details);
        this.name = "AiLayerDraftRuntimeError";
    }
}

export interface AiLayerDraftAcceptResult {
    appliedLayerIds: string[];
    componentBindings: Record<string, string>;
}

interface DraftLayerData {
    layerManager: ILayerManager;
    layerCount: number;
    componentLayerIds: Record<string, string>;
}

interface AiLayerDraftBatchSource {
    batchId: string;
    sequence: number;
    regionId?: string;
    components: AiLayerDraftComponent[];
}

interface PartitionDraftState {
    draftId: string;
    ownerKey: string;
    layout: AiLayerDraftRegion[];
    manager: DesignerManager;
    canvasWidth: number;
    canvasHeight: number;
}

const createDraftId = (): string => (
    `ai-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const normalizeIdPart = (value: string): string => (
    value.replace(/[^A-Za-z0-9_-]/g, "-") || "component"
);

const normalizeRecord = (value: unknown): Record<string, any> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value as Record<string, any>;
};

const buildDraftBounds = (components: AiLayerDraftComponent[]): AiLayerDraftBounds => {
    const left = Math.min(...components.map((component) => component.x));
    const top = Math.min(...components.map((component) => component.y));
    const right = Math.max(...components.map((component) => component.x + component.width));
    const bottom = Math.max(...components.map((component) => component.y + component.height));
    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    };
};

const currentCanvasSize = (manager: any): {width: number; height: number} => {
    const rawWidth = manager?.canvasManager?.canvasConfig?.width;
    const rawHeight = manager?.canvasManager?.canvasConfig?.height;
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0)
        throw new AiLayerDraftRuntimeError("draft_canvas_size_invalid", "当前画布宽高必须是大于 0 的有限数字", {
            fieldPath: "canvas.size",
            actualValue: {width: rawWidth, height: rawHeight},
            expectedValue: {width: "finite number > 0", height: "finite number > 0"},
        });
    return {width, height};
};

/**
 * 使用组件默认配置构造草稿配置，传入 config 仅作为补丁。
 * 这样所有已经注册 Definition 的组件都能沿用正式画布的创建流程。
 */
const buildComponentConfig = (
    component: AiLayerDraftComponent,
    layerId: string,
): Record<string, any> => {
    const definition = window.DATAVISOOL_ENV?.definitions?.[component.type];
    if (!definition)
        throw new AiLayerDraftRuntimeError("draft_component_type_unavailable", `没有可渲染的组件定义：${component.type}`, {
            componentId: component.id,
            componentType: component.type,
            fieldPath: "components[].type",
            actualValue: component.type,
            allowedValues: Object.keys(window.DATAVISOOL_ENV?.definitions ?? {}),
        });

    const defaultConfig = normalizeRecord(definition.getInitConfig?.());
    const config = defaultConfig ? cloneDeep(defaultConfig) : {};
    const defaultData = normalizeRecord(config.data);
    if (component.config) {
        ObjectUtil.merge(config, cloneDeep(component.config));
        const dataPatch = normalizeRecord(component.config.data);
        if (dataPatch)
            config.data = normalizeDataConfig(defaultData, dataPatch);
    }

    const base = normalizeRecord(config.base) ?? {};
    config.base = {
        ...base,
        id: layerId,
        type: component.type,
        name: component.name?.trim() || base.name || component.type,
    };
    return config;
};

/** 按 order 建立与正式图层一致的双向链表。 */
const buildDraftLayerData = (
    draftId: string,
    components: AiLayerDraftComponent[],
): DraftLayerData => {
    const orderedComponents = components
        .map((component, index) => ({component, index}))
        .sort((previous, next) => {
            const previousOrder = previous.component.order ?? previous.index + 1;
            const nextOrder = next.component.order ?? next.index + 1;
            return previousOrder - nextOrder || previous.index - next.index;
        });
    const layerConfigs: Record<string, ILayerItem> = {};
    const elemConfigs: Record<string, any> = {};
    const componentLayerIds: Record<string, string> = {};
    let layerHeader: string | undefined;
    let layerTail: string | undefined;

    orderedComponents.forEach(({component, index}) => {
        const sourceId = component.id?.trim() || `component-${index + 1}`;
        const layerId = `${draftId}-${index + 1}-${normalizeIdPart(sourceId)}`;
        const layer: ILayerItem = {
            id: layerId,
            type: component.type,
            name: component.name?.trim() || component.type,
            x: component.x,
            y: component.y,
            width: component.width,
            height: component.height,
            order: component.order ?? index + 1,
        };

        if (layerHeader) {
            layer.next = layerHeader;
            layerConfigs[layerHeader].prev = layerId;
        } else {
            layerTail = layerId;
        }
        layerHeader = layerId;
        layerConfigs[layerId] = layer;
        elemConfigs[layerId] = buildComponentConfig(component, layerId);
        componentLayerIds[sourceId] = layerId;
    });

    return {
        layerCount: orderedComponents.length,
        layerManager: {
            layerConfigs,
            elemConfigs,
            layerHeader,
            layerTail,
        },
        componentLayerIds,
    };
};

/**
 * 管理画布上的多批次临时草稿。
 * 每个待处理批次使用独立 DesignerManager，接受前不会写入正式画布。
 */
export class AiLayerDraftRuntime {
    public activeDraft: AiLayerActiveDraft | null = null;
    private activeBatchSources: AiLayerDraftBatchSource[] = [];
    private draftSessionId: string | null = null;
    private sessionRevision = 0;
    private nextBatchSequence = 1;
    private previewConfirmation: {draftId: string; complete: (confirmed: boolean) => void} | null = null;
    private partitionDraft: PartitionDraftState | null = null;

    constructor() {
        makeObservable(this, {
            activeDraft: observable.ref,
            render: action,
            renderPartitioned: action,
            acceptDraft: action,
            acceptBatch: action,
            discardBatch: action,
            clear: action,
            clearPartitionedDraft: action,
        });
        if (isObservableProp(managerStore, "currentManager")) {
            reaction(() => managerStore.currentManager, (manager) => {
                const draft = this.activeDraft;
                if (draft?.ownerKey && draft.canvasManager && manager !== draft.canvasManager)
                    this.clearOwnedDraft(draft.ownerKey);
            });
        }
    }

    public render(components: AiLayerDraftComponent[], incremental = false, interactive = true, ownerKey?: string): AiLayerDraftRenderResult {
        if (this.partitionDraft)
            throw new AiLayerDraftRuntimeError("draft_kind_conflict", "当前存在分区页面草稿，不能混用普通草稿渲染", {
                fieldPath: "draft.kind",
                actualValue: "partitioned",
                expectedValue: "继续分区草稿，或先清理后再创建普通草稿",
            });
        const currentManager = managerStore.currentManager ?? window.DATAVISOOL_ENV?.currentManager;
        if (!currentManager)
            throw new AiLayerDraftRuntimeError("canvas_manager_unavailable", "当前没有可用的画布 Manager", {
                fieldPath: "currentManager", actualValue: null, expectedValue: "initialized canvas manager",
            });
        const {width: canvasWidth, height: canvasHeight} = currentCanvasSize(currentManager);
        if (ownerKey && this.activeDraft?.ownerKey && this.activeDraft.ownerKey !== ownerKey)
            throw new AiLayerDraftRuntimeError("draft_scope_conflict", "当前页面草稿属于另一 Agent 作用域", {
                actualValue: this.activeDraft.ownerKey,
                expectedValue: ownerKey,
                fieldPath: "draft.ownerKey",
            });
        if (incremental && this.activeDraft?.canvasManager && this.activeDraft.canvasManager !== currentManager) {
            if (this.activeDraft.ownerKey)
                this.clearOwnedDraft(this.activeDraft.ownerKey);
            throw new AiLayerDraftRuntimeError("draft_canvas_changed", "页面草稿所属画布已切换，请重新创建草稿", {
                actualValue: managerIdentity(currentManager),
                expectedValue: managerIdentity(this.activeDraft.canvasManager),
                fieldPath: "draft.canvasManager",
            });
        }

        const startsNewSession = !incremental || !this.draftSessionId;
        const previousDraft = incremental && !startsNewSession ? this.activeDraft : null;
        const draftId = startsNewSession ? createDraftId() : this.draftSessionId!;
        const revision = (startsNewSession ? 0 : this.sessionRevision) + 1;
        const nextSequence = startsNewSession ? 1 : this.nextBatchSequence;
        const incomingComponents = cloneDeep(components);
        const incomingIds = new Set(incomingComponents.map((component) => component.id?.trim()).filter(Boolean));
        const retainedSources = previousDraft
            ? this.activeBatchSources
                .map((batch) => ({
                    ...batch,
                    components: batch.components.filter((component) => !incomingIds.has(component.id?.trim())),
                }))
                .filter((batch) => batch.components.length > 0)
            : [];
        const nextSources = [
            ...retainedSources,
            {
                batchId: `${draftId}-batch-${nextSequence}`,
                sequence: nextSequence,
                components: incomingComponents,
            },
        ];
        const sourceIds = nextSources.flatMap((batch) => batch.components.map((component, index) => ({
            componentId: component.id?.trim() || `component-${index + 1}`,
            batchId: batch.batchId,
            regionId: batch.regionId,
            bounds: componentBounds(component),
        })));
        const duplicateIds = sourceIds.filter((entry, index) => sourceIds.findIndex((candidate) => candidate.componentId === entry.componentId) !== index);
        if (duplicateIds.length > 0)
            throw new AiLayerDraftRuntimeError("draft_component_id_conflict", "草稿组件 id 必须唯一", {
                fieldPath: "components[].id",
                actualValue: [...new Set(duplicateIds.map((item) => item.componentId))],
                expectedValue: "每个草稿组件对应唯一 componentId",
                duplicates: duplicateIds,
            });
        const canvasBounds = {x: 0, y: 0, width: canvasWidth, height: canvasHeight};
        const violations = nextSources.flatMap((batch) => batch.components.flatMap((component, index) => {
            const actualValue = componentBounds(component);
            return isInsideBounds(actualValue, canvasBounds) ? [] : [{
                componentId: component.id?.trim() || `component-${index + 1}`,
                actualValue,
                expectedValue: canvasBounds,
            }];
        }));
        if (violations.length > 0) {
            throw new AiLayerDraftRuntimeError("draft_component_out_of_bounds", "以下草稿组件超出画布边界", {
                fieldPath: "components[].bounds",
                componentId: violations.length === 1 ? violations[0].componentId : undefined,
                actualValue: violations.length === 1 ? violations[0].actualValue : undefined,
                expectedValue: canvasBounds,
                violations,
            });
        }
        const batches = nextSources.map((batch) => this.buildBatch(batch, currentManager));

        this.destroyActiveManagers();
        this.draftSessionId = draftId;
        this.sessionRevision = revision;
        this.nextBatchSequence = nextSequence + 1;
        this.activeBatchSources = nextSources;
        this.activeDraft = {
            draftId,
            revision,
            layerCount: batches.reduce((count, batch) => count + batch.layerCount, 0),
            interactive,
            canvasWidth,
            canvasHeight,
            batches,
            canvasManager: currentManager,
            ownerKey,
        };

        return {
            status: "draft-rendered",
            draftId,
            layerCount: this.activeDraft.layerCount,
            revision,
        };
    }

    /** 累积或替换指定区域的临时草稿，不会写入正式画布。 */
    public renderPartitioned(
        components: AiLayerDraftComponent[],
        options: {
            regionId: string;
            layout?: AiLayerDraftRegion[];
            draftId?: string;
            incremental: boolean;
            ownerKey: string;
        },
    ): AiLayerDraftRenderResult {
        const currentManager = managerStore.currentManager ?? window.DATAVISOOL_ENV?.currentManager;
        if (!currentManager)
            throw new AiLayerDraftRuntimeError("canvas_manager_unavailable", "当前没有可用的画布 Manager", {
                fieldPath: "currentManager", actualValue: null, expectedValue: "initialized canvas manager",
            });
        const {width: canvasWidth, height: canvasHeight} = currentCanvasSize(currentManager);
        const regionId = options.regionId.trim();
        const ownerKey = options.ownerKey.trim();
        if (!regionId || !ownerKey)
            throw new AiLayerDraftRuntimeError("draft_scope_required", "分区草稿必须提供 regionId 和 Agent 作用域", {
                fieldPath: !regionId ? "regionId" : "ownerKey",
                actualValue: !regionId ? options.regionId : options.ownerKey,
                expectedValue: "非空字符串",
            });

        let draftId: string;
        let layout: AiLayerDraftRegion[];
        let previousSources: AiLayerDraftBatchSource[];
        let previousDraft: AiLayerActiveDraft | null;
        let draftToReplace: AiLayerActiveDraft | null;
        let nextSequence: number;
        if (!options.incremental) {
            if (!options.layout || options.draftId)
                throw new AiLayerDraftRuntimeError("draft_initial_request_invalid", "首批分区草稿必须提供 layout，且不能提供 draftId", {
                    fieldPath: !options.layout ? "layout" : "draftId",
                    actualValue: !options.layout ? options.layout : options.draftId,
                    expectedValue: !options.layout ? "非空区域数组" : "省略 draftId",
                });
            if (this.partitionDraft)
                throw new AiLayerDraftRuntimeError("draft_already_exists", "已有分区草稿；请使用当前 draftId 和 incremental=true 更新指定区域", {
                    actualValue: options.draftId,
                    expectedValue: {draftId: this.partitionDraft.draftId, incremental: true},
                });
            if (this.activeDraft?.ownerKey && this.activeDraft.ownerKey !== ownerKey)
                throw new AiLayerDraftRuntimeError("draft_scope_conflict", "当前页面草稿属于另一 Agent 作用域", {
                    actualValue: this.activeDraft.ownerKey,
                    expectedValue: ownerKey,
                    fieldPath: "draft.ownerKey",
                });
            layout = normalizeLayout(options.layout, canvasWidth, canvasHeight);
            if (!layout.some((region) => region.id === regionId))
                throw new AiLayerDraftRuntimeError("draft_region_not_found", `layout 中不存在区域 ${regionId}`, {
                    fieldPath: "regionId",
                    actualValue: regionId,
                    allowedValues: layout.map((region) => region.id),
                });
            draftId = createDraftId();
            previousSources = [];
            previousDraft = null;
            draftToReplace = this.activeDraft;
            nextSequence = 1;
        } else {
            const active = this.partitionDraft;
            if (!active || !this.activeDraft)
                throw new AiLayerDraftRuntimeError("draft_not_found", "没有可继续编辑的分区草稿；请从首批 layout 请求开始", {
                    fieldPath: "draftId",
                    actualValue: options.draftId,
                    expectedValue: "首批请求需 incremental=false 且提供 layout",
                });
            if (options.draftId !== active.draftId || this.activeDraft.draftId !== active.draftId)
                throw new AiLayerDraftRuntimeError("draft_id_mismatch", "draftId 与当前分区草稿不匹配", {
                    fieldPath: "draftId",
                    actualValue: options.draftId,
                    expectedValue: active.draftId,
                });
            if (active.ownerKey !== ownerKey || this.activeDraft.ownerKey !== ownerKey)
                throw new AiLayerDraftRuntimeError("draft_scope_conflict", "分区草稿不属于当前 Agent 作用域", {
                    fieldPath: "ownerKey",
                    actualValue: ownerKey,
                    expectedValue: active.ownerKey,
                });
            if (active.manager !== currentManager || active.canvasWidth !== canvasWidth || active.canvasHeight !== canvasHeight) {
                this.clearPartitionedDraft(ownerKey);
                throw new AiLayerDraftRuntimeError("draft_canvas_changed", "分区草稿所属画布已切换，请重新创建草稿", {
                    fieldPath: "draft.canvasManager",
                    actualValue: {manager: managerIdentity(currentManager), width: canvasWidth, height: canvasHeight},
                    expectedValue: {manager: managerIdentity(active.manager), width: active.canvasWidth, height: active.canvasHeight},
                });
            }
            if (options.layout && !sameLayout(active.layout, normalizeLayout(options.layout, canvasWidth, canvasHeight)))
                throw new AiLayerDraftRuntimeError("draft_layout_changed", "后续分区草稿的 layout 不能改变", {
                    fieldPath: "layout",
                    actualValue: options.layout,
                    expectedValue: active.layout,
                });
            layout = active.layout;
            if (!layout.some((region) => region.id === regionId))
                throw new AiLayerDraftRuntimeError("draft_region_not_found", `layout 中不存在区域 ${regionId}`, {
                    fieldPath: "regionId",
                    actualValue: regionId,
                    allowedValues: layout.map((region) => region.id),
                });
            draftId = active.draftId;
            previousSources = this.activeBatchSources;
            previousDraft = this.activeDraft;
            draftToReplace = this.activeDraft;
            nextSequence = this.nextBatchSequence;
        }

        const region = layout.find((item) => item.id === regionId)!;
        const incomingComponents = cloneDeep(components);
        if (!incomingComponents.length)
            throw new AiLayerDraftRuntimeError("draft_components_required", "分区草稿组件列表不能为空", {
                fieldPath: "components",
                actualValue: incomingComponents.length,
                expectedValue: "至少 1 个组件",
            });
        const incomingIds = incomingComponents.map((component) => component.id?.trim() ?? "");
        const missingIdIndexes = incomingComponents.flatMap((component, index) => incomingIds[index] ? [] : [index]);
        const duplicateIds = incomingIds.filter((id, index) => !!id && incomingIds.indexOf(id) !== index);
        if (missingIdIndexes.length > 0 || duplicateIds.length > 0)
            throw new AiLayerDraftRuntimeError("draft_component_id_invalid", "分区草稿组件必须提供非空且不重复的 id", {
                fieldPath: "components[].id",
                actualValue: incomingIds,
                expectedValue: "每个组件均提供唯一的非空字符串 id",
                missingIdIndexes: [...new Set(missingIdIndexes)],
                duplicateComponentIds: [...new Set(duplicateIds)],
                regionId,
            });
        const regionBounds = {x: region.x, y: region.y, width: region.width, height: region.height};
        const regionViolations = incomingComponents.flatMap((component) => {
            const actualValue = componentBounds(component);
            return isInsideBounds(actualValue, regionBounds) ? [] : [{
                componentId: component.id?.trim(),
                actualValue,
                expectedValue: regionBounds,
            }];
        });
        if (regionViolations.length > 0)
            throw new AiLayerDraftRuntimeError("draft_component_outside_region", `区域 ${regionId} 中的组件超出该区域边界`, {
                fieldPath: "components[].bounds",
                regionId,
                componentId: regionViolations.length === 1 ? regionViolations[0].componentId : undefined,
                actualValue: regionViolations.length === 1 ? regionViolations[0].actualValue : undefined,
                expectedValue: regionBounds,
                violations: regionViolations,
            });

        const retainedSources = previousSources.filter((batch) => batch.regionId !== regionId);
        const retainedIds = new Set(retainedSources.flatMap((batch) => batch.components.map((component) => component.id?.trim() ?? "")));
        const crossRegionDuplicates = incomingIds.filter((id) => retainedIds.has(id));
        if (crossRegionDuplicates.length > 0)
            throw new AiLayerDraftRuntimeError("draft_component_id_conflict", "不同区域的组件 id 不能重复", {
                fieldPath: "components[].id",
                duplicateComponentIds: [...new Set(crossRegionDuplicates)],
                regionId,
                actualValue: [...new Set(crossRegionDuplicates)],
                expectedValue: "与其他区域组件 id 不重复",
            });
        const source: AiLayerDraftBatchSource = {
            batchId: `${draftId}-region-${normalizeIdPart(regionId)}-${nextSequence}`,
            sequence: layout.findIndex((item) => item.id === regionId) + 1,
            regionId,
            components: incomingComponents,
        };
        const nextSources = [...retainedSources, source]
            .sort((left, right) => left.sequence - right.sequence);
        const candidateBatch = this.buildBatch(source, currentManager);

        const retainedBatches = options.incremental
            ? previousDraft?.batches.filter((batch) => batch.regionId !== regionId) ?? []
            : [];
        const batches = [...retainedBatches, candidateBatch]
            .sort((left, right) => left.sequence - right.sequence);
        const replacedBatches = options.incremental
            ? previousDraft?.batches.filter((batch) => batch.regionId === regionId) ?? []
            : draftToReplace?.batches ?? [];
        replacedBatches.forEach((batch) => this.destroyManager(batch.manager));
        this.activeBatchSources = nextSources;
        this.partitionDraft = {
            draftId,
            ownerKey,
            layout,
            manager: currentManager,
            canvasWidth,
            canvasHeight,
        };
        this.sessionRevision = previousDraft ? this.sessionRevision + 1 : 1;
        this.nextBatchSequence = nextSequence + 1;
        this.draftSessionId = draftId;
        this.activeDraft = {
            draftId,
            revision: this.sessionRevision,
            layerCount: batches.reduce((count, batch) => count + batch.layerCount, 0),
            interactive: false,
            canvasWidth,
            canvasHeight,
            batches,
            canvasManager: currentManager,
            layout,
            ownerKey,
        };
        return {
            status: "draft-rendered",
            draftId,
            layerCount: this.activeDraft.layerCount,
            revision: this.activeDraft.revision,
        };
    }

    /** 校验草稿版本与归属；分区草稿还必须覆盖 layout 全部区域。 */
    public prepareDraftPreview(draftId: string, expectedRevision: number, ownerKey: string): AiLayerActiveDraft {
        const draft = this.activeDraft;
        const partition = this.partitionDraft;
        if (!draft || draft.draftId !== draftId || (partition && partition.draftId !== draftId))
            throw new AiLayerDraftRuntimeError("draft_not_found", "页面草稿不存在或 draftId 已变化", {
                fieldPath: "draftId",
                actualValue: draftId,
                expectedValue: draft?.draftId,
            });
        if (draft.ownerKey !== ownerKey || (partition && partition.ownerKey !== ownerKey))
            throw new AiLayerDraftRuntimeError("draft_scope_conflict", "页面草稿不属于当前 Agent 作用域", {
                fieldPath: "ownerKey",
                actualValue: ownerKey,
                expectedValue: draft.ownerKey,
            });
        if (!Number.isInteger(expectedRevision) || draft.revision !== expectedRevision)
            throw new AiLayerDraftRuntimeError(
                "draft_revision_conflict",
                "页面草稿版本已变化，请重新预览",
                {fieldPath: "expectedDraftRevision", actualValue: expectedRevision, expectedValue: draft.revision,
                    currentRevision: draft.revision},
            );
        const currentManager = managerStore.currentManager ?? window.DATAVISOOL_ENV?.currentManager;
        const size = currentManager ? currentCanvasSize(currentManager) : null;
        const expectedManager = partition?.manager ?? draft.canvasManager;
        if (!currentManager || (expectedManager && currentManager !== expectedManager) || !size
            || size.width !== draft.canvasWidth || size.height !== draft.canvasHeight) {
            this.clearOwnedDraft(ownerKey);
            throw new AiLayerDraftRuntimeError("draft_canvas_changed", "页面草稿所属画布已切换，请重新创建草稿", {
                fieldPath: "draft.canvas",
                actualValue: {manager: managerIdentity(currentManager), size},
                expectedValue: {manager: managerIdentity(expectedManager), width: draft.canvasWidth, height: draft.canvasHeight},
            });
        }
        if (partition) {
            const completed = new Set(this.activeBatchSources.map((source) => source.regionId));
            const missing = partition.layout.filter((region) => !completed.has(region.id)).map((region) => region.id);
            if (missing.length)
                throw new AiLayerDraftRuntimeError(
                    "draft_incomplete",
                    `尚未生成全部区域：${missing.join("、")}`,
                    {missingRegionIds: missing, fieldPath: "components[].regionId",
                        actualValue: [...completed], expectedValue: partition.layout.map((region) => region.id)},
                );
        }
        return draft;
    }

    public isOwnedDraftCurrent(draftId: string, expectedRevision: number, ownerKey: string): boolean {
        const draft = this.activeDraft;
        return !!draft && draft.ownerKey === ownerKey
            && draft.draftId === draftId
            && draft.revision === expectedRevision;
    }

    public clearOwnedDraft(ownerKey: string): boolean {
        if (!ownerKey || this.activeDraft?.ownerKey !== ownerKey)
            return false;
        this.clear();
        return true;
    }

    public clearPartitionedDraft(ownerKey?: string): void {
        if (!this.partitionDraft || (ownerKey && this.partitionDraft.ownerKey !== ownerKey))
            return;
        this.clear();
    }

    /** 将指定的整份草稿写入真实画布。 */
    public acceptDraft(draftId: string, expectedRevision?: number): AiLayerDraftAcceptResult | null {
        if (!this.activeDraft || this.activeDraft.draftId !== draftId)
            return null;
        if (expectedRevision != null && this.activeDraft.revision !== expectedRevision)
            return null;
        const currentManager = managerStore.currentManager ?? window.DATAVISOOL_ENV?.currentManager;
        if (!currentManager)
            return null;
        if (this.partitionDraft && currentManager !== this.partitionDraft.manager) {
            this.clearPartitionedDraft(this.partitionDraft.ownerKey);
            return null;
        }
        if (this.activeDraft.canvasManager && currentManager !== this.activeDraft.canvasManager) {
            if (this.activeDraft.ownerKey)
                this.clearOwnedDraft(this.activeDraft.ownerKey);
            return null;
        }
        const currentCanvas = currentCanvasSize(currentManager);
        if (currentCanvas.width !== this.activeDraft.canvasWidth
            || currentCanvas.height !== this.activeDraft.canvasHeight)
            return null;
        const layers: Record<string, ILayerItem> = {};
        const configs: Record<string, any> = {};
        this.activeDraft.batches
            .slice()
            .sort((left, right) => left.sequence - right.sequence)
            .forEach((batch) => {
                const data = batch.manager.layerManager.getData();
                Object.assign(layers, cloneDeep(data.layerConfigs ?? {}));
                Object.assign(configs, cloneDeep(data.elemConfigs ?? {}));
            });
        if (Object.keys(layers).length !== this.activeDraft.layerCount
            || Object.keys(configs).length !== this.activeDraft.layerCount)
            return null;

        const targetLayerManager = currentManager.layerManager;
        const previousLayerData = targetLayerManager?.getData?.();
        try {
            const result = historyRecordOperateProxy.doUseTemplate({layers, configs});
            if (result.appliedLayerIds.length !== this.activeDraft.layerCount) {
                previousLayerData && targetLayerManager?.init?.(cloneDeep(previousLayerData));
                return null;
            }
            const componentBindings = this.activeDraft.batches.reduce((bindings, batch) => {
                Object.entries(batch.componentLayerIds).forEach(([componentId, layerId]) => {
                    const canvasId = result.layerIdMap[layerId];
                    if (canvasId)
                        bindings[componentId] = canvasId;
                });
                return bindings;
            }, {} as Record<string, string>);
            if (Object.keys(componentBindings).length !== this.activeDraft.layerCount) {
                previousLayerData && targetLayerManager?.init?.(cloneDeep(previousLayerData));
                return null;
            }
            this.clear();
            return {appliedLayerIds: result.appliedLayerIds, componentBindings};
        } catch (error) {
            previousLayerData && targetLayerManager?.init?.(cloneDeep(previousLayerData));
            throw error;
        }
    }

    /** 等待 Agent 预览确认时，画布按钮完成同一次交互，由调用方统一写入草稿。 */
    public bindPreviewConfirmation(draftId: string, complete: (confirmed: boolean) => void): () => void {
        let settled = false;
        const confirmation = {
            draftId,
            complete: (confirmed: boolean) => {
                if (settled)
                    return;
                settled = true;
                complete(confirmed);
            },
        };
        this.previewConfirmation = confirmation;
        return () => {
            if (this.previewConfirmation === confirmation)
                this.previewConfirmation = null;
        };
    }

    /** Agent 预览交给共同确认入口；独立草稿批次直接写入真实画布。 */
    public acceptBatch(batchId: string): string[] {
        if (this.partitionDraft)
            return [];
        const batch = this.activeDraft?.batches.find((item) => item.batchId === batchId);
        if (!batch)
            return [];
        const confirmation = this.previewConfirmation;
        if (confirmation && confirmation.draftId === this.activeDraft?.draftId) {
            confirmation.complete(true);
            return [];
        }

        const {layerConfigs, elemConfigs} = batch.manager.layerManager.getData();
        const result = historyRecordOperateProxy.doUseTemplate({
            layers: cloneDeep(layerConfigs ?? {}),
            configs: cloneDeep(elemConfigs ?? {}),
        });
        this.removeBatch(batchId);
        return result.appliedLayerIds;
    }

    /** Agent 预览通知拒绝；独立草稿仅丢弃指定批次。 */
    public discardBatch(batchId: string): boolean {
        if (this.partitionDraft)
            return false;
        if (!this.activeDraft?.batches.some((item) => item.batchId === batchId))
            return false;
        const confirmation = this.previewConfirmation;
        if (confirmation && confirmation.draftId === this.activeDraft?.draftId) {
            confirmation.complete(false);
            return true;
        }
        this.removeBatch(batchId);
        return true;
    }

    public clear(): void {
        this.previewConfirmation = null;
        this.destroyActiveManagers();
        this.activeBatchSources = [];
        this.activeDraft = null;
        this.draftSessionId = null;
        this.sessionRevision = 0;
        this.nextBatchSequence = 1;
        this.partitionDraft = null;
    }

    private buildBatch(source: AiLayerDraftBatchSource, currentManager: DesignerManager): AiLayerDraftBatch {
        const draftLayerData = buildDraftLayerData(source.batchId, source.components);
        const manager = new DesignerManager(currentManager.scene ?? DesignerScene.DEFAULT);
        manager.init({
            ...currentManager.getData(),
            layerManager: draftLayerData.layerManager,
        }, window.DATAVISOOL_ENV?.mode ?? DesignerMode.EDIT);
        return {
            batchId: source.batchId,
            sequence: source.sequence,
            layerCount: draftLayerData.layerCount,
            bounds: buildDraftBounds(source.components),
            componentLayerIds: draftLayerData.componentLayerIds,
            manager,
            regionId: source.regionId,
        };
    }

    private removeBatch(batchId: string): void {
        const activeDraft = this.activeDraft;
        if (!activeDraft)
            return;

        const batch = activeDraft.batches.find((item) => item.batchId === batchId);
        this.destroyManager(batch?.manager);
        const batches = activeDraft.batches.filter((item) => item.batchId !== batchId);
        this.activeBatchSources = this.activeBatchSources.filter((item) => item.batchId !== batchId);
        const revision = ++this.sessionRevision;
        this.activeDraft = batches.length === 0
            ? null
            : {
                ...activeDraft,
                revision,
                layerCount: batches.reduce((count, item) => count + item.layerCount, 0),
                batches,
            };
    }

    private destroyActiveManagers(): void {
        this.activeDraft?.batches.forEach((batch) => this.destroyManager(batch.manager));
    }

    private destroyManager(manager?: DesignerManager): void {
        if (!manager)
            return;

        try {
            manager.destroy();
        } catch (error) {
            aiDrivenDevError("AI draft Manager destroy failed", error);
        }
    }
}

function normalizeLayout(layout: AiLayerDraftRegion[], canvasWidth: number, canvasHeight: number): AiLayerDraftRegion[] {
    if (!Array.isArray(layout) || layout.length === 0)
        throw new AiLayerDraftRuntimeError("draft_layout_required", "分区草稿 layout 必须是非空数组", {
            fieldPath: "layout",
            actualValue: layout,
            ...(Array.isArray(layout) ? {actualCount: layout.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });
    const normalized = layout.map((region, index) => {
        if (!region || typeof region !== "object" || Array.isArray(region))
            throw new AiLayerDraftRuntimeError("draft_layout_region_invalid", `layout[${index}] 必须是区域对象`, {
                fieldPath: `layout[${index}]`,
                actualValue: region,
                expectedValue: {id: "非空字符串", x: "有限数且 ≥ 0", y: "有限数且 ≥ 0", width: "有限数且 > 0", height: "有限数且 > 0"},
            });
        const id = typeof region.id === "string" ? region.id.trim() : "";
        const {x, y, width, height} = region;
        const actualValue = {id, x, y, width, height};
        let fieldPath = "";
        let expectedValue: unknown;
        if (!id) {
            fieldPath = `layout[${index}].id`;
            expectedValue = "非空字符串";
        } else if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x >= canvasWidth) {
            fieldPath = `layout[${index}].x`;
            expectedValue = {minimumInclusive: 0, exclusiveMaximum: canvasWidth};
        } else if (typeof y !== "number" || !Number.isFinite(y) || y < 0 || y >= canvasHeight) {
            fieldPath = `layout[${index}].y`;
            expectedValue = {minimumInclusive: 0, exclusiveMaximum: canvasHeight};
        } else if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || x + width > canvasWidth) {
            fieldPath = `layout[${index}].width`;
            expectedValue = {minimumExclusive: 0, maximum: canvasWidth - x};
        } else if (typeof height !== "number" || !Number.isFinite(height) || height <= 0 || y + height > canvasHeight) {
            fieldPath = `layout[${index}].height`;
            expectedValue = {minimumExclusive: 0, maximum: canvasHeight - y};
        }
        if (fieldPath)
            throw new AiLayerDraftRuntimeError("draft_layout_region_invalid", `${fieldPath} 的区域值无效或超出画布边界`, {
                fieldPath,
                actualValue: fieldPath.endsWith(".id") ? region.id : (actualValue as Record<string, unknown>)[fieldPath.split(".").at(-1)!],
                expectedValue,
                regionId: id || undefined,
                actualBounds: actualValue,
                canvasBounds: {x: 0, y: 0, width: canvasWidth, height: canvasHeight},
            });
        return {id, x, y, width, height};
    });
    const ids = normalized.map((region) => region.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0)
        throw new AiLayerDraftRuntimeError("draft_layout_region_id_duplicate", "layout 区域 id 必须唯一", {
            fieldPath: "layout[].id",
            actualValue: [...new Set(duplicateIds)],
            expectedValue: "每个区域 id 唯一",
            duplicateRegionIds: [...new Set(duplicateIds)],
        });
    return normalized;
}

function componentBounds(component: AiLayerDraftComponent): AiLayerDraftBounds {
    return {x: component.x, y: component.y, width: component.width, height: component.height};
}

function isInsideBounds(component: AiLayerDraftBounds, bounds: AiLayerDraftBounds): boolean {
    return component.x >= bounds.x && component.y >= bounds.y
        && component.x + component.width <= bounds.x + bounds.width
        && component.y + component.height <= bounds.y + bounds.height;
}

function managerIdentity(manager: unknown): string | undefined {
    return manager && typeof manager === "object" && typeof (manager as {id?: unknown}).id === "string"
        ? (manager as {id: string}).id
        : undefined;
}

function sameLayout(left: AiLayerDraftRegion[], right: AiLayerDraftRegion[]): boolean {
    return left.length === right.length && left.every((region, index) => {
        const next = right[index];
        return region.id === next.id && region.x === next.x && region.y === next.y
            && region.width === next.width && region.height === next.height;
    });
}

export const aiLayerDraftRuntime = new AiLayerDraftRuntime();
