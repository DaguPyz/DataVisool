/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {FrontendEffectClientError} from "@/frontend-effect/FrontendEffectClientError.ts";
import {
    aiLayerDraftRuntime,
    type AiLayerDraftComponent,
    type AiLayerDraftRegion,
} from "@/designer/ai-driven/AiLayerDraftRuntime.ts";
import {
    canvasRevision,
    hasCanvasOperationIdentity,
    runIdempotentCanvasOperation,
} from "@/frontend-effect/CanvasOperationJournal.ts";

interface RenderDraftPayload {
    action?: "render" | "preview" | "accept" | "clear";
    incremental?: boolean;
    interactive?: boolean;
    draftId?: string;
    regionId?: string;
    layout?: AiLayerDraftRegion[];
    expectedDraftRevision?: number;
    /** Added by the web bridge; never supplied by the Agent. */
    ownerKey?: string;
    components?: AiLayerDraftComponent[];
    approvalTicket?: unknown;
}

interface NormalizedRenderDraftPayload {
    action: "render" | "preview" | "accept" | "clear";
    incremental: boolean;
    interactive: boolean;
    draftId: string;
    regionId: string;
    layout?: AiLayerDraftRegion[];
    expectedDraftRevision?: number;
    ownerKey: string;
    components: AiLayerDraftComponent[];
}

export type RenderDraftToolResult =
    | {
        status: "draft-rendered";
        draftId: string;
        layerCount: number;
        revision?: number;
    }
    | {
        status: "draft-cleared";
        layerCount: 0;
        cleared?: boolean;
        draftId?: string;
        revision?: number;
    }
    | {
        status: "draft-preview-ready";
        draftId: string;
        revision: number;
        layerCount: number;
    }
    | {
        status: "draft-accepted";
        draftId: string;
        layerCount: number;
        componentBindings: Record<string, string>;
        resultRevision?: string;
    };

/** 创建、接受或清空画布上的临时草稿。 */
export function runRenderDraftTool(payload: unknown): RenderDraftToolResult | Promise<RenderDraftToolResult> {
    const input = normalizePayload(payload);
    if (input.action === "clear") {
        const previousDraft = aiLayerDraftRuntime.activeDraft;
        let cleared = false;
        if (input.ownerKey) {
            if (previousDraft && previousDraft.ownerKey !== input.ownerKey)
                throw new FrontendEffectClientError("draft_scope_conflict", "当前页面草稿不属于此 Agent 作用域", {
                    fieldPath: "ownerKey", actualValue: previousDraft.ownerKey, expectedValue: input.ownerKey,
                });
            cleared = aiLayerDraftRuntime.clearOwnedDraft(input.ownerKey);
        } else if (previousDraft?.ownerKey) {
            throw new FrontendEffectClientError("draft_scope_required", "清理分区草稿时必须匹配 Agent 作用域", {
                fieldPath: "ownerKey", actualValue: input.ownerKey, expectedValue: previousDraft.ownerKey,
            });
        } else {
            aiLayerDraftRuntime.clear();
            cleared = !!previousDraft;
        }
        return {
            status: "draft-cleared",
            layerCount: 0,
            cleared,
            ...(cleared && previousDraft ? {draftId: previousDraft.draftId, revision: previousDraft.revision} : {}),
        };
    }
    if (input.action === "accept") {
        requireApprovalTicket(payload);
        if (!hasCanvasOperationIdentity(payload))
            return acceptDraft(input.draftId);
        return runIdempotentCanvasOperation(payload, () => acceptDraft(input.draftId));
    }
    if (input.action === "preview") {
        try {
            const draft = aiLayerDraftRuntime.prepareDraftPreview(
                input.draftId,
                input.expectedDraftRevision!,
                input.ownerKey,
            );
            return {
                status: "draft-preview-ready",
                draftId: draft.draftId,
                revision: draft.revision,
                layerCount: draft.layerCount,
            };
        } catch (error) {
            if (error instanceof FrontendEffectClientError)
                throw error;
            const message = error instanceof Error ? error.message : String(error ?? "未知错误");
            throw new FrontendEffectClientError("draft_preview_failed", message, {causeName: error instanceof Error ? error.name : typeof error});
        }
    }

    try {
        if (input.layout || input.regionId || input.draftId) {
            if (input.interactive)
                throw new FrontendEffectClientError("invalid_payload", "分区草稿必须设置 interactive=false", {
                    fieldPath: "interactive", actualValue: input.interactive, expectedValue: false,
                });
            return aiLayerDraftRuntime.renderPartitioned(input.components, {
                regionId: input.regionId,
                layout: input.layout,
                draftId: input.draftId || undefined,
                incremental: input.incremental,
                ownerKey: input.ownerKey,
            });
        }
        return aiLayerDraftRuntime.render(input.components, input.incremental, input.interactive, input.ownerKey || undefined);
    } catch (error) {
        if (error instanceof FrontendEffectClientError)
            throw error;
        const message = error instanceof Error ? error.message : String(error ?? "未知错误");
        throw new FrontendEffectClientError("draft_render_failed", message, {
            causeName: error instanceof Error ? error.name : typeof error,
        });
    }
}

/**
 * 在独立的预览确认入口完成后接受草稿。
 *
 * 模型直接调用 render_draft(accept) 仍必须携带服务端审批票据；这里只能由
 * Web 前端在用户已经确认预览后调用，避免把“渲染预览”和“写入正式画布”混在一起。
 */
export function acceptRenderedDraftAfterUserConfirmation(draftId: string, expectedRevision?: number): RenderDraftToolResult {
    const normalizedDraftId = draftId.trim();
    if (!normalizedDraftId)
        throw new FrontendEffectClientError("invalid_payload", "接受页面草稿时必须提供 draftId", {
            fieldPath: "draftId", actualValue: draftId, expectedValue: "non-empty string",
        });
    return acceptDraft(normalizedDraftId, expectedRevision);
}

function requireApprovalTicket(payload: unknown): void {
    const ticket = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).approvalTicket
        : undefined;
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)
        || typeof (ticket as Record<string, unknown>).approvalId !== "string"
        || typeof (ticket as Record<string, unknown>).nonce !== "string") {
        throw new FrontendEffectClientError("approval_ticket_missing", "接受草稿必须携带服务端签发的审批票据", {
            fieldPath: "approvalTicket",
            actualValue: ticket && typeof ticket === "object" && !Array.isArray(ticket)
                ? {providedFields: Object.keys(ticket)}
                : ticket ?? null,
            expectedValue: {approvalId: "non-empty string", nonce: "non-empty string"},
        });
    }
}

function acceptDraft(draftId: string, expectedRevision?: number): RenderDraftToolResult {
    const activeDraft = aiLayerDraftRuntime.activeDraft;
    if (!activeDraft || activeDraft.draftId !== draftId)
        throw new FrontendEffectClientError("draft_not_found", "已确认的页面草稿不存在或已发生变化", {
            fieldPath: "draftId", actualValue: activeDraft?.draftId ?? null, expectedValue: draftId,
        });

    const layerCount = activeDraft.layerCount;
    const accepted = aiLayerDraftRuntime.acceptDraft(draftId, expectedRevision);
    if (!accepted || accepted.appliedLayerIds.length < layerCount)
        throw new FrontendEffectClientError("draft_accept_failed", "页面草稿未能完整写入画布", {
            fieldPath: "acceptedLayerIds",
            actualValue: accepted?.appliedLayerIds.length ?? 0,
            expectedValue: layerCount,
            partial: Boolean(accepted?.appliedLayerIds.length),
            partiallyAppliedComponentIds: accepted?.appliedLayerIds ?? [],
            expectedComponentIds: activeDraft.batches.flatMap((batch) => Object.keys(batch.componentLayerIds)),
        });
    const layerManager = window.DATAVISOOL_ENV?.currentManager?.layerManager;
    const applied = accepted.appliedLayerIds.map((componentId) => ({
        componentId,
        config: layerManager?.controllers?.[componentId]?.getConfig?.()
            ?? layerManager?.elemConfigs?.[componentId]
            ?? null,
    }));
    return {
        status: "draft-accepted",
        draftId,
        layerCount: accepted.appliedLayerIds.length,
        componentBindings: accepted.componentBindings,
        resultRevision: canvasRevision(applied),
    };
}

function normalizePayload(payload: unknown): NormalizedRenderDraftPayload {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new FrontendEffectClientError("invalid_payload", "草稿渲染工具入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });

    const input = payload as RenderDraftPayload;
    const action = input.action ?? "render";
    if (action !== "render" && action !== "preview" && action !== "accept" && action !== "clear")
        throw new FrontendEffectClientError("invalid_payload", `不支持的草稿操作：${String(action)}`, {
            fieldPath: "action", actualValue: action, allowedValues: ["render", "preview", "accept", "clear"],
        });
    if (input.incremental != null && typeof input.incremental !== "boolean")
        throw new FrontendEffectClientError("invalid_payload", "草稿增量渲染参数 incremental 必须是布尔值", {
            fieldPath: "incremental", actualValue: input.incremental, expectedValue: "boolean",
        });
    if (input.interactive != null && typeof input.interactive !== "boolean")
        throw new FrontendEffectClientError("invalid_payload", "草稿交互参数 interactive 必须是布尔值", {
            fieldPath: "interactive", actualValue: input.interactive, expectedValue: "boolean",
        });

    if (action === "clear")
        return {
            action,
            incremental: false,
            interactive: false,
            draftId: "",
            regionId: "",
            ownerKey: typeof input.ownerKey === "string" ? input.ownerKey.trim() : "",
            components: [],
        };
    if (action === "accept") {
        const draftId = typeof input.draftId === "string" ? input.draftId.trim() : "";
        if (!draftId)
            throw new FrontendEffectClientError("invalid_payload", "接受页面草稿时必须提供 draftId", {
                fieldPath: "draftId", actualValue: input.draftId, expectedValue: "非空字符串",
            });
        return {action, incremental: false, interactive: false, draftId, regionId: "", ownerKey: "", components: []};
    }
    if (action === "preview") {
        const draftId = typeof input.draftId === "string" ? input.draftId.trim() : "";
        const ownerKey = typeof input.ownerKey === "string" ? input.ownerKey.trim() : "";
        if (!draftId || !ownerKey)
            throw new FrontendEffectClientError("invalid_payload", "预览分区草稿时必须提供 draftId 和 Agent 作用域", {
                fieldPath: !draftId ? "draftId" : "ownerKey",
                actualValue: !draftId ? input.draftId : input.ownerKey,
                expectedValue: "非空字符串",
            });
        if (!Number.isInteger(input.expectedDraftRevision) || (input.expectedDraftRevision ?? 0) <= 0)
            throw new FrontendEffectClientError("invalid_payload", "预览分区草稿时必须提供正整数 expectedDraftRevision", {
                fieldPath: "expectedDraftRevision", actualValue: input.expectedDraftRevision,
                expectedValue: "positive integer",
            });
        if (input.components != null || input.layout != null || input.regionId != null)
            throw new FrontendEffectClientError("invalid_payload", "preview 操作不能携带组件或区域数据", {
                fieldPath: input.components != null ? "components" : input.layout != null ? "layout" : "regionId",
                actualValue: input.components ?? input.layout ?? input.regionId,
                expectedValue: "字段省略",
            });
        return {
            action,
            incremental: false,
            interactive: false,
            draftId,
            regionId: "",
            ownerKey,
            expectedDraftRevision: input.expectedDraftRevision,
            components: [],
        };
    }
    if (!Array.isArray(input.components) || input.components.length === 0)
        throw new FrontendEffectClientError("invalid_payload", "草稿组件列表必须是非空数组", {
            fieldPath: "components", actualValue: input.components,
            ...(Array.isArray(input.components) ? {actualCount: input.components.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });

    const incremental = input.incremental ?? false;
    const interactive = input.interactive ?? true;
    const regionId = typeof input.regionId === "string" ? input.regionId.trim() : "";
    const draftId = typeof input.draftId === "string" ? input.draftId.trim() : "";
    const ownerKey = typeof input.ownerKey === "string" ? input.ownerKey.trim() : "";
    const partitioned = input.layout != null || input.regionId != null || input.draftId != null;
    if (partitioned) {
        if (!regionId)
            throw new FrontendEffectClientError("invalid_payload", "分区草稿必须提供 regionId", {
                fieldPath: "regionId", actualValue: input.regionId, expectedValue: "非空字符串",
            });
        if (!ownerKey)
            throw new FrontendEffectClientError("invalid_payload", "分区草稿必须具有 Agent 作用域", {
                fieldPath: "ownerKey", actualValue: input.ownerKey, expectedValue: "非空字符串",
            });
        if (incremental && !draftId)
            throw new FrontendEffectClientError("invalid_payload", "后续分区草稿必须提供 draftId", {
                fieldPath: "draftId", actualValue: input.draftId, expectedValue: "当前分区草稿的非空 id",
            });
        if (!incremental && draftId)
            throw new FrontendEffectClientError("invalid_payload", "首批分区草稿不能提供 draftId", {
                fieldPath: "draftId", actualValue: draftId, expectedValue: "省略 draftId",
            });
        if (!incremental && !Array.isArray(input.layout))
            throw new FrontendEffectClientError("invalid_payload", "首批分区草稿必须提供 layout", {
                fieldPath: "layout", actualValue: input.layout, expectedValue: "非空区域数组",
            });
        if (incremental && input.layout != null)
            throw new FrontendEffectClientError("invalid_payload", "后续分区草稿不能携带 layout", {
                fieldPath: "layout", actualValue: input.layout, expectedValue: "省略 layout；沿用首批 layout",
            });
        if (interactive)
            throw new FrontendEffectClientError("invalid_payload", "分区草稿必须设置 interactive=false", {
                fieldPath: "interactive", actualValue: interactive, expectedValue: false,
            });
    }
    const components = input.components.map(normalizeComponent);
    const componentIds = components.flatMap((component) => component.id ? [component.id] : []);
    const duplicateComponentIds = componentIds.filter((id, index) => componentIds.indexOf(id) !== index);
    if (duplicateComponentIds.length > 0)
        throw new FrontendEffectClientError("invalid_component", "草稿组件 id 必须唯一", {
            fieldPath: "components[].id",
            actualValue: componentIds,
            expectedValue: "每个非空 id 只出现一次",
            duplicateComponentIds: [...new Set(duplicateComponentIds)],
        });
    if (incremental && components.some((component) => !component.id))
        throw new FrontendEffectClientError("invalid_component", "增量渲染的每个草稿组件都必须提供 id", {
            fieldPath: "components[].id",
            missingIdIndexes: components.flatMap((component, index) => component.id ? [] : [index]),
            expectedValue: "每个组件均提供非空字符串 id",
        });

    return {
        action,
        incremental,
        interactive,
        draftId,
        regionId,
        layout: input.layout,
        ownerKey,
        components,
    };
}

function normalizeComponent(component: AiLayerDraftComponent, index: number): AiLayerDraftComponent {
    if (!component || typeof component !== "object" || Array.isArray(component))
        throw new FrontendEffectClientError("invalid_component", `components[${index}] 必须是对象`, {
            fieldPath: `components[${index}]`, actualValue: component, expectedValue: "object",
        });

    const type = typeof component.type === "string" ? component.type.trim() : "";
    if (!type)
        throw new FrontendEffectClientError("invalid_component", `components[${index}].type 必须是非空字符串`, {
            fieldPath: `components[${index}].type`, actualValue: component.type, expectedValue: "非空组件类型字符串",
        });

    const x = requireFiniteNumber(component.x, "x", index, component.id);
    const y = requireFiniteNumber(component.y, "y", index, component.id);
    const width = requirePositiveNumber(component.width, "width", index, component.id);
    const height = requirePositiveNumber(component.height, "height", index, component.id);
    const order = component.order == null
        ? undefined
        : requireFiniteNumber(component.order, "order", index, component.id);

    if (component.config != null && (
        typeof component.config !== "object"
        || Array.isArray(component.config)
    )) {
        throw new FrontendEffectClientError("invalid_component", `components[${index}].config 必须是对象`, {
            componentId: component.id, componentType: type, fieldPath: `components[${index}].config`,
            actualValue: component.config, expectedValue: "object",
        });
    }
    if (component.useDefaultConfig != null && typeof component.useDefaultConfig !== "boolean") {
        throw new FrontendEffectClientError("invalid_component", `components[${index}].useDefaultConfig 必须是布尔值`, {
            componentId: component.id, componentType: type, fieldPath: `components[${index}].useDefaultConfig`,
            actualValue: component.useDefaultConfig, expectedValue: "boolean",
        });
    }
    if (component.useDefaultConfig === true && component.config != null) {
        throw new FrontendEffectClientError("invalid_component", `components[${index}] 不能同时提供 config 和 useDefaultConfig=true`, {
            componentId: component.id, componentType: type, fieldPath: `components[${index}].useDefaultConfig`,
            actualValue: {hasConfig: component.config != null, useDefaultConfig: true},
            expectedValue: "提供 config 或设置 useDefaultConfig=true，二选一",
        });
    }
    // 数据能力和业务配置由后端按组件文档校验；默认配置中的占位 data 不代表数据能力。

    return {
        id: typeof component.id === "string" ? component.id.trim() || undefined : undefined,
        type,
        name: typeof component.name === "string" ? component.name.trim() || undefined : undefined,
        x,
        y,
        width,
        height,
        order,
        config: component.config,
        useDefaultConfig: component.useDefaultConfig,
    };
}

function requireFiniteNumber(value: unknown, field: string, index: number, componentId?: string): number {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new FrontendEffectClientError("invalid_component", `components[${index}].${field} 必须是有限数字`, {
            componentId, fieldPath: `components[${index}].${field}`, actualValue: value, expectedValue: "finite number",
        });
    return value;
}

function requirePositiveNumber(value: unknown, field: string, index: number, componentId?: string): number {
    const number = requireFiniteNumber(value, field, index, componentId);
    if (number <= 0)
        throw new FrontendEffectClientError("invalid_component", `components[${index}].${field} 必须大于 0`, {
            componentId, fieldPath: `components[${index}].${field}`, actualValue: number,
            expectedValue: {exclusiveMinimum: 0},
        });
    return number;
}
