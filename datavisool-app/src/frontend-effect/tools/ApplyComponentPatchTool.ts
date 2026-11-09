/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep, isEqual, merge} from "lodash";
import {FrontendEffectClientError, sanitizeFrontendEffectDetails} from "@/frontend-effect/FrontendEffectClientError.ts";
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
import componentDataGvParser from "@/designer/left/global-variable/parse/ComponentDataGvParser.ts";
import {canvasRevision, runIdempotentCanvasOperation} from "@/frontend-effect/CanvasOperationJournal.ts";
import {toSerializableSnapshot} from "@/frontend-effect/SerializableSnapshot.ts";

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
export async function runApplyComponentPatchTool(payload: unknown): Promise<ComponentPatchResult> {
    requireApprovalTicketForStructuralPatch(payload);
    return runIdempotentCanvasOperation(payload, () => applyComponentPatch(payload), (result) => result.failed.length === 0);
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

async function applyComponentPatch(payload: unknown): Promise<ComponentPatchResult> {
    const {patches, expectedSnapshots} = normalizePayload(payload);
    const initialManager = window.DATAVISOOL_ENV?.currentManager;
    const layerManager = initialManager?.layerManager;
    const baselines = expectedSnapshots ?? captureCurrentSnapshots(patches, layerManager);
    const baseRevision = canvasRevision(baselines);
    const expectedById = new Map(baselines.map((snapshot) => [snapshot.componentId, snapshot]));
    const prepared: Array<{
        patch: ComponentPatchItem;
        controller: any;
        previousStyle: unknown;
        previousData: unknown;
        previousLayer: any;
        previousFilter: unknown;
        nextStyle?: unknown;
        nextData?: Awaited<ReturnType<typeof normalizeDataConfigAsync>>;
        nextLayer?: any;
        nextFilter?: Record<string, unknown>;
    }> = [];
    const failures: ComponentPatchFailure[] = [];

    patches.forEach((patch) => {
        const controller = layerManager?.controllers?.[patch.componentId];
        const layer = layerManager?.layerConfigs?.[patch.componentId];
        const currentConfig = controller?.getConfig?.();
        const currentType = currentConfig?.base?.type ?? layer?.type;
        if (!controller) {
            failures.push(failure(patch, "controller_not_found", `未找到组件控制器：${patch.componentId}`, {
                fieldPath: "componentId", actualValue: patch.componentId, expectedValue: "当前画布中存在对应组件控制器",
            }));
            return;
        }
        if (currentType !== patch.componentType) {
            failures.push(failure(
                patch,
                "component_type_mismatch",
                `组件类型不匹配：期望 ${patch.componentType}，实际 ${currentType || "unknown"}`,
                {fieldPath: "componentType", actualValue: currentType ?? null, expectedValue: patch.componentType},
            ));
            return;
        }
        const expected = expectedById.get(patch.componentId)!;
        const changedPaths = changedSnapshotPaths(patch, currentConfig, layer, expected);
        if (changedPaths.length > 0) {
            failures.push(failure(patch, "component_revision_conflict", `组件读取后以下字段已变化：${changedPaths.map((item) => item.fieldPath).join("、")}`, {
                fieldPath: changedPaths[0].fieldPath,
                changedPaths,
            }));
            return;
        }
        const currentData = isRecord(currentConfig?.data) ? currentConfig.data : {};
        if (patch.dataPatch) {
            const userInput = getDataPatchUserInputRequirement(currentData, patch.dataPatch);
            if (userInput.required) {
                failures.push(failure(patch, "requires_user_input", userInput.message ?? "数据源配置缺少用户需要补充的信息", {
                    fieldPath: userInput.path,
                    actualValue: null,
                    expectedValue: "用户补充该连接信息后再提交 dataPatch",
                }));
                return;
            }
        }
        prepared.push({
            patch,
            controller,
            previousStyle: cloneDeep(currentConfig?.style),
            previousData: cloneDeep(currentConfig?.data),
            previousLayer: cloneDeep(layer),
            previousFilter: cloneDeep(currentConfig?.filter),
            nextStyle: patch.stylePatch
                ? merge({}, cloneDeep(currentConfig?.style ?? {}), cloneDeep(patch.stylePatch.style))
                : undefined,
            nextData: undefined,
            nextLayer: patch.layerPatch
                ? merge({}, cloneDeep(layer ?? {}), cloneDeep(patch.layerPatch), {id: patch.componentId})
                : undefined,
            nextFilter: patch.filterPatch
                ? merge({}, defaultFilter(), cloneDeep(currentConfig?.filter ?? {}), cloneDeep(patch.filterPatch))
                : undefined,
        });
    });

    if (failures.length > 0)
        return {...rejectBatch(patches, failures), baseRevision, resultRevision: baseRevision};

    for (const item of prepared) {
        if (item.patch.dataPatch)
            item.nextData = await normalizeDataConfigAsync(isRecord(item.previousData) ? item.previousData : {}, item.patch.dataPatch);
    }
    const mappingFailures = prepared.flatMap((item) => {
        const stylePatch = item.patch.stylePatch?.style;
        const mappingChanged = stylePatch
            && COMPONENT_DATA_FIELD_MAPPING_KEYS.some((key) => Object.prototype.hasOwnProperty.call(stylePatch, key));
        const staticDataChanged = item.patch.dataPatch?.sourceType === "static";
        if (!mappingChanged && !staticDataChanged)
            return [];
        if (item.patch.dataPatch && !staticDataChanged)
            return [];
        const finalStyle = item.nextStyle ?? item.previousStyle;
        const finalData = item.nextData ?? item.previousData;
        const issues = validateComponentFieldMappings(finalStyle, isRecord(finalData) ? finalData.value : undefined);
        return issues.length > 0
            ? [failure(item.patch, issues[0].code, issues[0].message, {
                fieldPath: issues[0].path,
                actualValue: issues[0].path?.startsWith("config.style.")
                    ? ((item.nextStyle ?? item.previousStyle) as Record<string, unknown> | undefined)?.[issues[0].path.slice("config.style.".length)]
                    : undefined,
                expectedValue: issues[0].message,
            })]
            : [];
    });
    if (mappingFailures.length > 0)
        return {...rejectBatch(patches, mappingFailures), baseRevision, resultRevision: baseRevision};
    if (window.DATAVISOOL_ENV?.currentManager?.layerManager !== layerManager)
        throw new FrontendEffectClientError("agent_scope_changed_before_apply", "数据归一化期间画布已切换，整批补丁未应用", {
            fieldPath: "currentManager.layerManager",
            actualValue: window.DATAVISOOL_ENV?.currentManager?.id,
            expectedValue: initialManager?.id,
        });
    const conflicts = prepared.filter(({patch, controller}) => {
        const currentConfig = controller.getConfig?.();
        const currentLayer = layerManager?.layerConfigs?.[patch.componentId];
        const expected = expectedById.get(patch.componentId)!;
        return (patch.stylePatch && !matchesSnapshot(currentConfig?.style ?? null, expected.style))
            || (patch.dataPatch && !matchesSnapshot(currentConfig?.data ?? null, expected.data))
            || (patch.layerPatch && !matchesSnapshot(currentLayer ?? null, expected.layer))
            || (patch.filterPatch && !matchesSnapshot(currentConfig?.filter ?? null, expected.filter));
    });
    if (conflicts.length > 0) {
        return {
            ...rejectBatch(patches, conflicts.map(({patch, controller}) => {
                const currentConfig = controller.getConfig?.();
                const currentLayer = layerManager?.layerConfigs?.[patch.componentId];
                const expected = expectedById.get(patch.componentId)!;
                const changedPaths = changedSnapshotPaths(patch, currentConfig, currentLayer, expected);
                return failure(patch, "component_revision_conflict", `组件读取后以下字段已变化：${changedPaths.map((item) => item.fieldPath).join("、")}`, {
                    fieldPath: changedPaths[0]?.fieldPath,
                    changedPaths,
                });
            })),
            baseRevision,
            resultRevision: baseRevision,
        };
    }

    const previousLayerData = layerManager?.getData?.();
    const started: typeof prepared = [];
    let currentlyApplying: ComponentPatchItem | undefined;
    try {
        prepared.forEach((item) => {
            const {patch, controller, nextStyle, nextData, nextLayer, nextFilter} = item;
            currentlyApplying = patch;
            started.push(item);
            const update: Record<string, unknown> = {};
            if (nextStyle !== undefined)
                update.style = nextStyle;
            if (nextData !== undefined)
                update.data = nextData;
            if (nextFilter !== undefined)
                update.filter = nextFilter;
            if (nextLayer !== undefined)
                layerManager?.updateLayer?.([nextLayer], true);
            controller.update(update, {reRender: true});
            if (nextData !== undefined)
                controller.changeData(nextData.value);
            if (nextFilter !== undefined)
                controller.updateFilter?.(nextFilter);
            if (nextData !== undefined)
                syncGlobalVariableBinding(patch.componentId, nextData);
            const actual = controller.getConfig?.();
            const actualLayer = layerManager?.layerConfigs?.[patch.componentId];
            if ((patch.stylePatch && !containsPatch(actual?.style, patch.stylePatch.style))
                || (patch.dataPatch && !containsPatch(actual?.data, patch.dataPatch))
                || (patch.layerPatch && !containsPatch(actualLayer, patch.layerPatch))
                || (patch.filterPatch && !containsPatch(actual?.filter, patch.filterPatch))) {
                throw new Error(`组件补丁未实际生效：${patch.componentId}`);
            }
        });
        currentlyApplying = undefined;
    } catch (error) {
        const rollbackFailures: string[] = [];
        [...started].reverse().forEach(({patch, controller, previousStyle, previousData, previousLayer, previousFilter}) => {
            const current = controller.getConfig?.();
            const restoreStyle = Boolean(patch.stylePatch) && !isEqual(current?.style, previousStyle);
            const restoreData = Boolean(patch.dataPatch) && !isEqual(current?.data, previousData);
            const restoreLayer = Boolean(patch.layerPatch) && !isEqual(layerManager?.layerConfigs?.[patch.componentId], previousLayer);
            const restoreFilter = Boolean(patch.filterPatch) && !isEqual(current?.filter, previousFilter);
            if (!restoreStyle && !restoreData && !restoreLayer && !restoreFilter)
                return;
            try {
                const rollback: Record<string, unknown> = {};
                if (restoreStyle)
                    rollback.style = cloneDeep(previousStyle);
                if (restoreData)
                    rollback.data = cloneDeep(previousData);
                if (restoreFilter)
                    rollback.filter = cloneDeep(previousFilter);
                if (restoreLayer)
                    layerManager?.updateLayer?.([cloneDeep(previousLayer)], true);
                controller.update(rollback, {reRender: true});
                if (restoreFilter)
                    controller.updateFilter?.(cloneDeep(previousFilter));
                if (restoreData)
                    syncGlobalVariableBinding(patch.componentId, previousData);
                const restored = controller.getConfig?.();
                if ((restoreStyle && !isEqual(restored?.style, previousStyle))
                    || (restoreData && !isEqual(restored?.data, previousData))
                    || (restoreLayer && !isEqual(layerManager?.layerConfigs?.[patch.componentId], previousLayer))
                    || (restoreFilter && !isEqual(restored?.filter, previousFilter))) {
                    throw new Error("rollback verification failed");
                }
            } catch {
                rollbackFailures.push(patch.componentId);
            }
        });
        if (previousLayerData && layerManager?.init) {
            try {
                layerManager.init(cloneDeep(previousLayerData));
            } catch {
                rollbackFailures.push("layerManager");
            }
        }
        const message = error instanceof Error ? error.message : String(error);
        const rollbackComplete = rollbackFailures.length === 0;
        const rollbackFailedComponentIds = rollbackFailures.filter((id) => id !== "layerManager");
        const rootItem = prepared.find((item) => item.patch.componentId === currentlyApplying?.componentId);
        const actualPatchDifferences = rootItem
            ? actualPatchMismatchPaths(rootItem.patch, rootItem.controller.getConfig?.(), layerManager?.layerConfigs?.[rootItem.patch.componentId])
            : [];
        const partiallyApplied = rollbackFailedComponentIds.flatMap((componentId) => {
            const item = prepared.find((candidate) => candidate.patch.componentId === componentId);
            if (!item)
                return [];
            const actualConfig = item.controller.getConfig?.();
            const actualLayer = layerManager?.layerConfigs?.[componentId];
            return [{
                componentId,
                componentType: item.patch.componentType,
                actual: {
                    ...(item.patch.stylePatch ? {style: cloneDeep(actualConfig?.style)} : {}),
                    ...(item.patch.dataPatch ? {data: cloneDeep(actualConfig?.data)} : {}),
                    ...(item.patch.layerPatch ? {layer: cloneDeep(actualLayer)} : {}),
                    ...(item.patch.filterPatch ? {filter: cloneDeep(actualConfig?.filter)} : {}),
                },
            }];
        });
        return {
            applied: [],
            partial: !rollbackComplete,
            partiallyApplied: sanitizeFrontendEffectDetails({partiallyApplied}).partiallyApplied as ComponentPatchResult["partiallyApplied"],
            rollbackFailedComponentIds,
            actualStateUnknown: rollbackFailures.includes("layerManager"),
            failed: patches.map((patch) => {
                const isRootFailure = patch.componentId === currentlyApplying?.componentId;
                return failure(
                    patch,
                    rollbackComplete ? (isRootFailure ? "batch_apply_rolled_back" : "batch_aborted") : "batch_rollback_failed",
                    isRootFailure
                        ? (rollbackComplete ? `组件补丁应用失败并已回滚：${message}`
                            : `组件补丁应用失败；回滚未完整成功，受影响组件：${rollbackFailedComponentIds.join("、") || "画布状态未知"}；${message}`)
                        : `同批次组件 ${currentlyApplying?.componentId ?? "unknown"} 应用失败，整批未提交`,
                    isRootFailure ? {
                        fieldPath: actualPatchDifferences[0]?.fieldPath ?? "patches[].apply",
                        actualValue: actualPatchDifferences.length ? undefined : message,
                        expectedValue: "补丁成功写入并通过回滚校验",
                        changedPaths: actualPatchDifferences,
                    }
                        : {fieldPath: "patches", expectedValue: "整批补丁均通过预检和写入校验"},
                );
            }),
            baseRevision,
            resultRevision: baseRevision,
        };
    }

    const actualSnapshots = patches.map((patch) => {
        const config = layerManager?.controllers?.[patch.componentId]?.getConfig?.();
        return {
            componentId: patch.componentId,
            componentType: patch.componentType,
            style: patch.stylePatch ? cloneDeep(config?.style) : undefined,
            data: patch.dataPatch ? cloneDeep(config?.data) : undefined,
            layer: patch.layerPatch ? cloneDeep(layerManager?.layerConfigs?.[patch.componentId]) : undefined,
            filter: patch.filterPatch ? cloneDeep(config?.filter) : undefined,
        };
    });
    return {
        applied: patches.map((patch) => ({componentId: patch.componentId, componentType: patch.componentType})),
        failed: [],
        baseRevision,
        resultRevision: canvasRevision(actualSnapshots),
    };
}

function syncGlobalVariableBinding(componentId: string, data: any): void {
    if (!window.DATAVISOOL_ENV?.currentManager?.globalVariableManager)
        return;
    if (data?.sourceType === "globalVariable") {
        const gvId = isRecord(data.globalVariable) && typeof data.globalVariable.gvId === "string"
            ? data.globalVariable.gvId
            : "";
        componentDataGvParser.directBindByCompIdAndGvId(componentId, gvId);
        return;
    }
    componentDataGvParser.bindConfigToGvById([componentId]);
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

function captureCurrentSnapshots(patches: ComponentPatchItem[], layerManager: any): ExpectedComponentSnapshot[] {
    return patches.map((patch) => {
        const controller = layerManager?.controllers?.[patch.componentId];
        const layer = layerManager?.layerConfigs?.[patch.componentId];
        const config = controller?.getConfig?.();
        const snapshot: ExpectedComponentSnapshot = {
            componentId: patch.componentId,
            componentType: patch.componentType,
        };
        if (patch.stylePatch)
            snapshot.style = toSerializableSnapshot(config?.style ?? null);
        if (patch.dataPatch)
            snapshot.data = toSerializableSnapshot(config?.data ?? null);
        if (patch.layerPatch)
            snapshot.layer = toSerializableSnapshot(layer ?? null);
        if (patch.filterPatch)
            snapshot.filter = toSerializableSnapshot(config?.filter ?? null);
        return snapshot;
    });
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

function actualPatchMismatchPaths(
    patch: ComponentPatchItem,
    actualConfig: any,
    actualLayer: unknown,
): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    const mismatches: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> = [];
    if (patch.stylePatch) mismatches.push(...diffPatchValues(patch.stylePatch.style, actualConfig?.style, "style"));
    if (patch.dataPatch) mismatches.push(...diffPatchValues(patch.dataPatch, actualConfig?.data, "data"));
    if (patch.layerPatch) mismatches.push(...diffPatchValues(patch.layerPatch, actualLayer, "layer"));
    if (patch.filterPatch) mismatches.push(...diffPatchValues(patch.filterPatch, actualConfig?.filter, "filter"));
    return mismatches;
}

function diffPatchValues(
    expectedPatch: unknown,
    actualValue: unknown,
    fieldPath: string,
): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    if (isRecord(expectedPatch)) {
        if (!isRecord(actualValue))
            return [{fieldPath, expectedValue: expectedPatch, currentValue: actualValue}];
        return Object.entries(expectedPatch).flatMap(([key, value]) =>
            diffPatchValues(value, actualValue[key], `${fieldPath}.${key}`));
    }
    if (isEqual(expectedPatch, actualValue))
        return [];
    return [{fieldPath, expectedValue: expectedPatch, currentValue: actualValue}];
}

function containsPatch(actual: unknown, patch: unknown): boolean {
    if (!isRecord(patch))
        return isEqual(actual, patch);
    if (!isRecord(actual))
        return false;
    return Object.entries(patch).every(([key, value]) => containsPatch(actual[key], value));
}

function matchesSnapshot(actual: unknown, expected: unknown): boolean {
    return isEqual(toSerializableSnapshot(actual), toSerializableSnapshot(expected));
}

function defaultFilter(): Record<string, unknown> {
    return {enable: false, blur: 0, brightness: 1, contrast: 1, opacity: 1, saturate: 1, hueRotate: 0};
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
