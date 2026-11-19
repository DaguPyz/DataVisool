/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep, isEqual, merge} from "lodash";
import {FrontendEffectClientError, sanitizeFrontendEffectDetails} from "@/plugins/editor-ai/frontend-effect/FrontendEffectClientError.ts";
import {
    findInvalidExpressionInPatch,
    findSensitiveFieldInPatch,
    getDataPatchUserInputRequirement,
} from "@/util/DataSourceAiPolicy.ts";
import {normalizeDataConfigAsync} from "@/util/DataSourceConfigUtil.ts";
import {
    COMPONENT_DATA_FIELD_MAPPING_KEYS,
    validateComponentFieldMappings,
} from "@/util/DataSourceContractUtil.ts";
import {canvasRevision, type CanvasOperationJournal} from "@/plugins/editor-ai/frontend-effect/CanvasOperationJournal.ts";
import {toSerializableSnapshot} from "@/plugins/editor-ai/frontend-effect/SerializableSnapshot.ts";
import type {EditorAiEditingSession, EditorAiExpectedComponentSnapshot, EditorAiComponentPatch} from "@datavisool/sdk/plugin/contracts/editorCanvas";

interface ComponentPatchItem {
    componentId: string;
    componentType: string;
    stylePatch?: {style: Record<string, unknown>};
    dataPatch?: Record<string, unknown>;
    layerPatch?: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        name?: string;
    };
    filterPatch?: {
        enable?: boolean;
        blur?: number;
        brightness?: number;
        contrast?: number;
        opacity?: number;
        saturate?: number;
        hueRotate?: number;
    };
    reason?: string;
}

interface ExpectedComponentSnapshot {
    componentId: string;
    componentType: string;
    style?: unknown;
    data?: unknown;
    layer?: unknown;
    filter?: unknown;
}

interface ApplyComponentPatchPayload {
    patches: ComponentPatchItem[];
    expectedSnapshots?: ExpectedComponentSnapshot[];
}

interface ComponentPatchFailure {
    componentId: string;
    componentType?: string;
    code: string;
    message: string;
    fieldPath?: string;
    actualValue?: unknown;
    expectedValue?: unknown;
    changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>;
}

interface ComponentPatchResult {
    applied: Array<{componentId: string; componentType: string}>;
    failed: ComponentPatchFailure[];
    partial?: boolean;
    partiallyApplied?: Array<{componentId: string; componentType: string; actual: Record<string, unknown>}>;
    rollbackFailedComponentIds?: string[];
    actualStateUnknown?: boolean;
    baseRevision?: string;
    resultRevision?: string;
}

/** 对已有组件执行一批同时包含 style/data 的原子配置调整。 */
export async function runApplyComponentPatchTool(payload: unknown, session: EditorAiEditingSession, journal: CanvasOperationJournal): Promise<ComponentPatchResult> {
    requireApprovalTicketForStructuralPatch(payload);
    return journal.run(payload, () => applyComponentPatch(payload, session), (result) => result.failed.length === 0);
}

/** 数据内容可直接更新；位置和滤镜仍属于需确认的结构性改动。 */
function requireApprovalTicketForStructuralPatch(payload: unknown): void {
    if (!isRecord(payload) || !Array.isArray(payload.patches))
        return;
    const requiresApproval = payload.patches.some((patch) => isRecord(patch) && (
        patch.layerPatch !== undefined || patch.filterPatch !== undefined
    ));
    if (!requiresApproval)
        return;
    const ticket = payload.approvalTicket;
    if (!isRecord(ticket) || !text(ticket.approvalId) || !text(ticket.nonce))
        throw new FrontendEffectClientError("approval_ticket_missing", "结构性组件修改必须携带服务端签发的审批票据", {
            fieldPath: "approvalTicket",
            actualValue: isRecord(ticket) ? {providedFields: Object.keys(ticket)} : ticket ?? null,
            expectedValue: {approvalId: "non-empty string", nonce: "non-empty string"},
        });
}

async function applyComponentPatch(payload: unknown, session: EditorAiEditingSession): Promise<ComponentPatchResult> {
    const {patches, expectedSnapshots} = normalizePayload(payload);
    if (!session.isActive())
        throw new FrontendEffectClientError("agent_scope_changed_before_apply", "AI 编辑目标工作空间已失效", {fieldPath: "agentScope.workspaceScope"});

    const initial = session.readComponents(patches.map(patch => patch.componentId), ["layer", "config"]);
    const componentById = new Map(initial.components.map(component => [component.id, component]));
    const baselines = expectedSnapshots ?? patches.flatMap((patch): ExpectedComponentSnapshot[] => {
        const component = componentById.get(patch.componentId);
        if (!component) return [];
        const config = component.config ?? {};
        return [{
            componentId: patch.componentId,
            componentType: patch.componentType,
            ...(patch.stylePatch ? {style: cloneDeep(config.style ?? null)} : {}),
            ...(patch.dataPatch ? {data: cloneDeep(config.data ?? null)} : {}),
            ...(patch.layerPatch ? {layer: cloneDeep(component.layer)} : {}),
            ...(patch.filterPatch ? {filter: cloneDeep(config.filter ?? null)} : {}),
        }];
    });
    const baseRevision = canvasRevision(baselines);
    const expectedById = new Map(baselines.map(snapshot => [snapshot.componentId, snapshot]));
    const failures: ComponentPatchFailure[] = [];

    for (const patch of patches) {
        const component = componentById.get(patch.componentId);
        if (!component) {
            failures.push(failure(patch, "controller_not_found", `未找到组件：${patch.componentId}`, {
                fieldPath: "componentId", actualValue: patch.componentId, expectedValue: "当前画布中存在对应组件",
            }));
            continue;
        }
        const config = component.config ?? {};
        const currentType = (isRecord(config.base) ? config.base.type : undefined) ?? component.type;
        if (currentType !== patch.componentType) {
            failures.push(failure(patch, "component_type_mismatch", `组件类型不匹配：期望 ${patch.componentType}，实际 ${currentType || "unknown"}`, {
                fieldPath: "componentType", actualValue: currentType ?? null, expectedValue: patch.componentType,
            }));
            continue;
        }
        const expected = expectedById.get(patch.componentId);
        if (!expected) {
            failures.push(failure(patch, "expected_snapshot_missing", "缺少组件修改基线", {
                fieldPath: "expectedSnapshots", expectedValue: patch.componentId,
            }));
            continue;
        }
        const changedPaths = changedSnapshotPaths(patch, config, component.layer, expected);
        if (changedPaths.length) {
            failures.push(failure(patch, "component_revision_conflict", `组件读取后以下字段已变化：${changedPaths.map(item => item.fieldPath).join("、")}`, {
                fieldPath: changedPaths[0].fieldPath, changedPaths,
            }));
            continue;
        }
        if (patch.dataPatch) {
            const userInput = getDataPatchUserInputRequirement(isRecord(config.data) ? config.data : {}, patch.dataPatch);
            if (userInput.required)
                failures.push(failure(patch, "requires_user_input", userInput.message ?? "数据源配置缺少用户需要补充的信息", {
                    fieldPath: userInput.path, actualValue: null, expectedValue: "用户补充连接信息后再提交 dataPatch",
                }));
        }
    }
    if (failures.length)
        return {...rejectBatch(patches, failures), baseRevision, resultRevision: baseRevision};

    // Run policy and field-mapping checks on detached snapshots. The canvas repeats normalization
    // and checks the same expected values immediately before its atomic write.
    for (const patch of patches) {
        if (!patch.dataPatch) continue;
        const component = componentById.get(patch.componentId)!;
        const config = component.config ?? {};
        const normalized = await normalizeDataConfigAsync(isRecord(config.data) ? config.data : {}, patch.dataPatch);
        if (!session.isActive())
            throw new FrontendEffectClientError("agent_scope_changed_before_apply", "数据归一化期间画布已切换，整批补丁未应用", {fieldPath: "agentScope.workspaceScope"});
        const stylePatch = patch.stylePatch?.style;
        const mappingChanged = Boolean(stylePatch && COMPONENT_DATA_FIELD_MAPPING_KEYS.some(key => Object.prototype.hasOwnProperty.call(stylePatch, key)));
        if (patch.dataPatch.sourceType === "static" || mappingChanged) {
            const finalStyle = stylePatch ? merge({}, isRecord(config.style) ? config.style : {}, stylePatch) : config.style;
            const issues = validateComponentFieldMappings(finalStyle, isRecord(normalized.value) ? normalized.value : undefined);
            if (issues.length)
                failures.push(failure(patch, issues[0].code, issues[0].message, {fieldPath: issues[0].path, expectedValue: issues[0].message}));
        }
    }
    if (failures.length)
        return {...rejectBatch(patches, failures), baseRevision, resultRevision: baseRevision};

    if (!session.isActive())
        throw new FrontendEffectClientError("agent_scope_changed_before_apply", "AI 编辑目标工作空间已失效", {fieldPath: "agentScope.workspaceScope"});
    const latest = session.readComponents(patches.map(patch => patch.componentId), ["layer", "config"]);
    const latestById = new Map(latest.components.map(component => [component.id, component]));
    const conflicts = patches.flatMap(patch => {
        const component = latestById.get(patch.componentId);
        const expected = expectedById.get(patch.componentId)!;
        if (!component)
            return [failure(patch, "controller_not_found", "组件在预检期间已从画布移除", {fieldPath: "componentId", expectedValue: "组件仍存在"})];
        const changedPaths = changedSnapshotPaths(patch, component.config ?? {}, component.layer, expected);
        return changedPaths.length ? [failure(patch, "component_revision_conflict", "组件读取后状态已变化", {fieldPath: changedPaths[0].fieldPath, changedPaths})] : [];
    });
    if (conflicts.length)
        return {...rejectBatch(patches, conflicts), baseRevision, resultRevision: baseRevision};

    const mutation = await session.applyComponentPatch(patches as EditorAiComponentPatch[], baselines as EditorAiExpectedComponentSnapshot[]);
    if (!session.isActive())
        throw new FrontendEffectClientError("agent_scope_changed_after_apply", "画布在补丁写入后已切换，拒绝继续读取结果", {fieldPath: "agentScope.workspaceScope"});
    if (mutation.failed.length) {
        const failed = mutation.failed.map(item => {
            const patch = patches.find(candidate => candidate.componentId === item.componentId);
            return patch ? failure(patch, item.code, item.message, item) : undefined;
        }).filter((item): item is ComponentPatchFailure => Boolean(item));
        return {...rejectBatch(patches, failed), baseRevision, resultRevision: baseRevision,
            ...(mutation.partial ? {partial: true, actualStateUnknown: true} : {})};
    }
    const actual = session.readComponents(patches.map(patch => patch.componentId), ["layer", "config"]);
    const actualById = new Map(actual.components.map(component => [component.id, component]));
    const resultSnapshots = patches.map(patch => {
        const component = actualById.get(patch.componentId);
        const config = component?.config ?? {};
        return {
            componentId: patch.componentId,
            componentType: patch.componentType,
            ...(patch.stylePatch ? {style: cloneDeep(config.style)} : {}),
            ...(patch.dataPatch ? {data: cloneDeep(config.data)} : {}),
            ...(patch.layerPatch ? {layer: cloneDeep(component?.layer)} : {}),
            ...(patch.filterPatch ? {filter: cloneDeep(config.filter)} : {}),
        };
    });
    return {
        applied: patches.map(patch => ({componentId: patch.componentId, componentType: patch.componentType})),
        failed: [], baseRevision, resultRevision: canvasRevision(resultSnapshots),
    };
}

function normalizePayload(payload: unknown): ApplyComponentPatchPayload {
    if (!isRecord(payload))
        throw new FrontendEffectClientError("invalid_payload", "组件补丁入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    if (!Array.isArray(payload.patches) || payload.patches.length === 0)
        throw new FrontendEffectClientError("invalid_payload", "组件补丁列表必须是非空数组", {
            fieldPath: "patches", actualValue: payload.patches,
            ...(Array.isArray(payload.patches) ? {actualCount: payload.patches.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });
    const patches = payload.patches.map(normalizePatch);
    if (new Set(patches.map((patch) => patch.componentId)).size !== patches.length) {
        throw new FrontendEffectClientError("invalid_payload", "组件补丁目标不能重复", {
            fieldPath: "patches[].componentId",
            actualValue: patches.map((patch) => patch.componentId),
            expectedValue: "每个 componentId 在 patches 中唯一",
        });
    }
    if (payload.expectedSnapshots === undefined)
        return {patches};
    if (!Array.isArray(payload.expectedSnapshots) || payload.expectedSnapshots.length !== patches.length)
        throw new FrontendEffectClientError("invalid_payload", "expectedSnapshots 数量必须与 patches 一致", {
            fieldPath: "expectedSnapshots",
            actualValue: payload.expectedSnapshots,
            ...(Array.isArray(payload.expectedSnapshots) ? {actualCount: payload.expectedSnapshots.length} : {}),
            expectedValue: {type: "array", exactItems: patches.length},
        });
    const expectedSnapshots = payload.expectedSnapshots.map((value, index) => normalizeExpectedSnapshot(value, patches[index], index));
    const targetIds = new Set(patches.map((patch) => patch.componentId));
    const expectedIds = new Set(expectedSnapshots.map((snapshot) => snapshot.componentId));
    if (targetIds.size !== patches.length || expectedIds.size !== expectedSnapshots.length
        || [...targetIds].some((componentId) => !expectedIds.has(componentId))) {
        throw new FrontendEffectClientError("invalid_payload", "组件补丁目标和 expectedSnapshots 的身份必须唯一且一一对应", {
            fieldPath: "expectedSnapshots[].componentId",
            actualValue: {patchComponentIds: patches.map((patch) => patch.componentId), snapshotComponentIds: expectedSnapshots.map((snapshot) => snapshot.componentId)},
            expectedValue: "每个 patch 对应且仅对应一个同 componentId 的快照",
        });
    }
    return {patches, expectedSnapshots};
}

function normalizePatch(value: unknown, index: number): ComponentPatchItem {
    if (!isRecord(value))
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}] 必须是对象`, {
            fieldPath: `patches[${index}]`, actualValue: value, expectedValue: "object",
        });
    const componentId = text(value.componentId);
    const componentType = text(value.componentType);
    if (!componentId)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].componentId 必须是非空字符串`, {
            fieldPath: `patches[${index}].componentId`, actualValue: value.componentId, expectedValue: "非空字符串",
        });
    if (!componentType)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].componentType 必须是非空字符串`, {
            componentId, fieldPath: `patches[${index}].componentType`, actualValue: value.componentType, expectedValue: "非空字符串",
        });
    const stylePatch = value.stylePatch === undefined ? undefined : normalizeStylePatch(value.stylePatch, index, componentId);
    const dataPatch = value.dataPatch === undefined ? undefined : normalizeDataPatch(value.dataPatch, index, componentId);
    const layerPatch = value.layerPatch === undefined ? undefined : normalizeLayerPatch(value.layerPatch, index, componentId);
    const filterPatch = value.filterPatch === undefined ? undefined : normalizeFilterPatch(value.filterPatch, index, componentId);
    if (!stylePatch && !dataPatch && !layerPatch && !filterPatch)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}] 至少需要一个可写补丁字段`, {
            componentId, componentType, fieldPath: `patches[${index}]`,
            actualValue: {stylePatch: value.stylePatch, dataPatch: value.dataPatch, layerPatch: value.layerPatch, filterPatch: value.filterPatch},
            expectedValue: "至少提供 stylePatch、dataPatch、layerPatch、filterPatch 中的一项",
        });
    return {componentId, componentType, stylePatch, dataPatch, layerPatch, filterPatch, reason: text(value.reason) || undefined};
}

function normalizeStylePatch(value: unknown, index: number, componentId: string): {style: Record<string, unknown>} {
    if (!isRecord(value) || Object.keys(value).length !== 1 || !isRecord(value.style) || Object.keys(value.style).length === 0)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch 必须只包含非空 style 对象`, {
            componentId, fieldPath: `patches[${index}].stylePatch`, actualValue: value,
            expectedValue: {style: "non-empty object; no sibling fields"},
        });
    return {style: value.style};
}

function normalizeDataPatch(value: unknown, index: number, componentId: string): Record<string, unknown> {
    if (!isRecord(value) || Object.keys(value).length === 0)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].dataPatch 必须是非空对象`, {
            componentId, fieldPath: `patches[${index}].dataPatch`, actualValue: value, expectedValue: "non-empty object",
        });
    const sensitivePath = findSensitiveFieldInPatch(value);
    if (sensitivePath)
        throw new FrontendEffectClientError("sensitive_field_rejected", `组件补丁不能包含敏感字段：${sensitivePath}`, {
            componentId,
            fieldPath: `patches[${index}].dataPatch.${sensitivePath}`,
            actualValue: "sensitive value supplied (redacted)",
            expectedValue: "通过用户输入流程提供敏感连接信息",
        });
    const invalidExpressionPath = findInvalidExpressionInPatch(value);
    if (invalidExpressionPath)
        throw new FrontendEffectClientError("invalid_expression_rejected", `组件补丁不能包含函数、表达式或非法值：${invalidExpressionPath}`, {
            componentId,
            fieldPath: `patches[${index}].dataPatch.${invalidExpressionPath}`,
            actualValue: "function/expression/invalid literal",
            expectedValue: "JSON-compatible literal value",
        });
    return value;
}

function normalizeLayerPatch(value: unknown, index: number, componentId: string): NonNullable<ComponentPatchItem["layerPatch"]> {
    if (!isRecord(value) || Object.keys(value).length === 0)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].layerPatch 必须是非空对象`, {
            componentId, fieldPath: `patches[${index}].layerPatch`, actualValue: value, expectedValue: "non-empty object",
        });
    const allowedValues = ["x", "y", "width", "height", "name"];
    const unknownKey = Object.keys(value).find((key) => !allowedValues.includes(key));
    if (unknownKey)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].layerPatch.${unknownKey} 未开放`, {
            componentId,
            fieldPath: `patches[${index}].layerPatch.${unknownKey}`,
            actualValue: value[unknownKey],
            expectedValue: "已开放字段之一",
            allowedValues,
        });
    const result: NonNullable<ComponentPatchItem["layerPatch"]> = {};
    for (const key of ["x", "y", "width", "height"] as const) {
        if (value[key] === undefined)
            continue;
        const number = value[key];
        const positive = key === "width" || key === "height";
        if (typeof number !== "number" || !Number.isFinite(number) || number < 0 || (positive && number === 0))
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].layerPatch.${key} 值无效`, {
                componentId,
                fieldPath: `patches[${index}].layerPatch.${key}`,
                actualValue: number,
                expectedValue: positive ? {type: "finite number", exclusiveMinimum: 0} : {type: "finite number", minimum: 0},
            });
        result[key] = number;
    }
    if (value.name !== undefined) {
        const name = text(value.name);
        if (!name || name.length > 200)
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].layerPatch.name 必须是 1–200 字符的非空字符串`, {
                componentId,
                fieldPath: `patches[${index}].layerPatch.name`, actualValue: value.name,
                expectedValue: {type: "non-empty string", minimumLength: 1, maximumLength: 200},
            });
        result.name = name;
    }
    return result;
}

function normalizeFilterPatch(value: unknown, index: number, componentId: string): NonNullable<ComponentPatchItem["filterPatch"]> {
    if (!isRecord(value) || Object.keys(value).length === 0)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].filterPatch 必须是非空对象`, {
            componentId, fieldPath: `patches[${index}].filterPatch`, actualValue: value, expectedValue: "non-empty object",
        });
    const ranges: Record<string, [number, number]> = {
        blur: [0, 100], brightness: [0, 10], contrast: [0, 10], opacity: [0, 1], saturate: [0, 10], hueRotate: [-360, 360],
    };
    const allowedValues = ["enable", ...Object.keys(ranges)];
    const unknownKey = Object.keys(value).find((key) => !allowedValues.includes(key));
    if (unknownKey)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].filterPatch.${unknownKey} 未开放`, {
            componentId,
            fieldPath: `patches[${index}].filterPatch.${unknownKey}`, actualValue: value[unknownKey],
            expectedValue: "已开放滤镜字段之一", allowedValues,
        });
    if (value.enable !== undefined && typeof value.enable !== "boolean")
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].filterPatch.enable 必须是布尔值`, {
            componentId,
            fieldPath: `patches[${index}].filterPatch.enable`, actualValue: value.enable, expectedValue: "boolean",
        });
    Object.entries(ranges).forEach(([key, [min, max]]) => {
        const number = value[key];
        if (number !== undefined && (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max))
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].filterPatch.${key} 超出允许范围 ${min}–${max}`, {
                componentId,
                fieldPath: `patches[${index}].filterPatch.${key}`,
                actualValue: number,
                expectedValue: {type: "finite number", minimum: min, maximum: max},
            });
    });
    return value as NonNullable<ComponentPatchItem["filterPatch"]>;
}

function normalizeExpectedSnapshot(value: unknown, patch: ComponentPatchItem, index: number): ExpectedComponentSnapshot {
    if (!isRecord(value))
        throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}] 必须是对象`, {
            componentId: patch.componentId, fieldPath: `expectedSnapshots[${index}]`,
            actualValue: value, expectedValue: "object",
        });
    if (text(value.componentId) !== patch.componentId)
        throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}].componentId 与补丁目标不匹配`, {
            componentId: patch.componentId, fieldPath: `expectedSnapshots[${index}].componentId`,
            actualValue: value.componentId, expectedValue: patch.componentId,
        });
    if (text(value.componentType) !== patch.componentType)
        throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}].componentType 与补丁目标不匹配`, {
            componentId: patch.componentId, fieldPath: `expectedSnapshots[${index}].componentType`,
            actualValue: value.componentType, expectedValue: patch.componentType,
        });
    const requiredFields = [
        ...(patch.stylePatch ? ["style"] : []),
        ...(patch.dataPatch ? ["data"] : []),
        ...(patch.layerPatch ? ["layer"] : []),
        ...(patch.filterPatch ? ["filter"] : []),
    ];
    const missingFields = requiredFields.filter((field) => !Object.prototype.hasOwnProperty.call(value, field));
    if (missingFields.length > 0) {
        throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}] 缺少补丁所需基线字段：${missingFields.join("、")}`, {
            componentId: patch.componentId,
            fieldPath: `expectedSnapshots[${index}].${missingFields[0]}`,
            missingFields: missingFields.map((field) => `expectedSnapshots[${index}].${field}`),
            actualValue: value[missingFields[0]],
            presentFields: Object.keys(value),
            expectedValue: requiredFields.map((field) => `expectedSnapshots[${index}].${field}`),
        });
    }
    return {
        componentId: patch.componentId,
        componentType: patch.componentType,
        style: cloneDeep(value.style),
        data: cloneDeep(value.data),
        layer: cloneDeep(value.layer),
        filter: cloneDeep(value.filter),
    };
}

function rejectBatch(patches: ComponentPatchItem[], failures: ComponentPatchFailure[]): ComponentPatchResult {
    const failureById = new Map(failures.map((item) => [item.componentId, item]));
    const cause = failures[0];
    return {
        applied: [],
        failed: patches.map((patch) => failureById.get(patch.componentId)
            ?? failure(patch, "batch_preflight_aborted", cause
                ? `同批次组件 ${cause.componentId} 未通过预检（${cause.code}），整批未应用`
                : "同批次存在无效组件补丁，整批未应用", {
                expectedValue: "所有补丁目标均通过预检",
                failedComponentId: cause?.componentId,
                causeCode: cause?.code,
            })),
    };
}

function failure(
    patch: ComponentPatchItem,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
): ComponentPatchFailure {
    return {
        componentId: patch.componentId,
        componentType: patch.componentType,
        code,
        message,
        ...sanitizeFrontendEffectDetails(details),
    };
}

function changedSnapshotPaths(
    patch: ComponentPatchItem,
    currentConfig: any,
    currentLayer: unknown,
    expected: ExpectedComponentSnapshot,
): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    const fields: Array<[string, unknown, unknown]> = [];
    if (patch.stylePatch) fields.push(["style", expected.style, currentConfig?.style ?? null]);
    if (patch.dataPatch) fields.push(["data", expected.data, currentConfig?.data ?? null]);
    if (patch.layerPatch) fields.push(["layer", expected.layer, currentLayer ?? null]);
    if (patch.filterPatch) fields.push(["filter", expected.filter, currentConfig?.filter ?? null]);
    return fields.flatMap(([field, expectedValue, currentValue]) => diffValues(
        toSerializableSnapshot(expectedValue),
        toSerializableSnapshot(currentValue),
        field,
    ));
}

function diffValues(
    expectedValue: unknown,
    currentValue: unknown,
    fieldPath: string,
): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    if (isEqual(expectedValue, currentValue))
        return [];
    if (isRecord(expectedValue) && isRecord(currentValue)) {
        const keys = [...new Set([...Object.keys(expectedValue), ...Object.keys(currentValue)])].sort();
        return keys.flatMap((key) => diffValues(expectedValue[key], currentValue[key], `${fieldPath}.${key}`));
    }
    if (Array.isArray(expectedValue) && Array.isArray(currentValue)) {
        const changes: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> = [];
        if (expectedValue.length !== currentValue.length)
            changes.push({fieldPath: `${fieldPath}.length`, expectedValue: expectedValue.length, currentValue: currentValue.length});
        for (let index = 0; index < Math.max(expectedValue.length, currentValue.length); index += 1)
            changes.push(...diffValues(expectedValue[index], currentValue[index], `${fieldPath}[${index}]`));
        return changes;
    }
    return [{fieldPath, expectedValue, currentValue}];
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
