/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {cloneDeep, isEqual} from "lodash";
import {FrontendEffectClientError, sanitizeFrontendEffectDetails} from "@/frontend-effect/FrontendEffectClientError.ts";
import {toSerializableSnapshot} from "@/frontend-effect/SerializableSnapshot.ts";

/** 统一样式补丁协议：顶层只能包含非空 style。 */
interface ComponentStylePatch {
    style: Record<string, unknown>;
}

/**
 * 单个组件样式补丁请求。
 */
interface ApplyComponentStylePatchItem {
    /** 目标组件 id。 */
    componentId: string;
    /** 目标组件类型，必须与当前画布组件类型一致。 */
    componentType: string;
    /** 只包含 style 根字段的完整组件配置补丁。 */
    stylePatch: ComponentStylePatch;
    /** AI 生成该补丁的简短原因。 */
    reason?: string;
}

/**
 * 批量组件样式补丁请求。
 */
interface ApplyComponentStylePatchPayload {
    /** 本次工具调用要应用的补丁列表。 */
    patches: ApplyComponentStylePatchItem[];
    /** 服务端从 inspect_current_page 结果保存的只读并发基线。 */
    expectedSnapshots?: ExpectedComponentStyleSnapshot[];
}

interface ExpectedComponentStyleSnapshot {
    componentId: string;
    componentType: string;
    style: unknown;
}

/**
 * 单个组件样式补丁应用成功结果。
 */
interface ApplyComponentStylePatchSuccess {
    /** 目标组件 id。 */
    componentId: string;
    /** 目标组件类型。 */
    componentType: string;
    /** 应用后的组件 style 快照。 */
    style: unknown;
}

/**
 * 单个组件样式补丁应用失败结果。
 */
interface ApplyComponentStylePatchFailure {
    /** 目标组件 id。 */
    componentId: string;
    /** 目标组件类型。 */
    componentType?: string;
    /** 稳定错误码。 */
    code: string;
    /** 错误说明。 */
    message: string;
    fieldPath?: string;
    actualValue?: unknown;
    expectedValue?: unknown;
    changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>;
}

/**
 * 批量组件样式补丁应用结果。
 */
interface ApplyComponentStylePatchResult {
    /** 成功应用的组件结果。 */
    applied: ApplyComponentStylePatchSuccess[];
    /** 应用失败的组件结果。 */
    failed: ApplyComponentStylePatchFailure[];
    partial?: boolean;
    partiallyApplied?: Array<{componentId: string; componentType: string; style: unknown}>;
    rollbackFailedComponentIds?: string[];
}

/**
 * 执行组件样式补丁应用工具。
 */
export function runApplyComponentStylePatchTool(payload: unknown): ApplyComponentStylePatchResult {
    const {patches, expectedSnapshots} = normalizePayload(payload);
    const failed: ApplyComponentStylePatchFailure[] = [];
    const layerManager = window.DATAVISOOL_ENV?.currentManager?.layerManager;

    if (expectedSnapshots) {
        const conflicts = findStyleRevisionConflicts(patches, expectedSnapshots, layerManager);
        if (conflicts.length > 0)
            return rejectStyleBatch(patches, conflicts);
    }

    const prepared = patches.flatMap((patch) => {
        const controller = layerManager?.controllers?.[patch.componentId];
        const layer = layerManager?.layerConfigs?.[patch.componentId];
        const currentConfig = controller?.getConfig?.();
        const currentType = currentConfig?.base?.type ?? layer?.type;

        if (!controller) {
            failed.push(styleFailure(patch, "controller_not_found", `未找到组件控制器：${patch.componentId}`, {
                fieldPath: "componentId", actualValue: patch.componentId, expectedValue: "当前画布存在此组件控制器",
            }));
            return [];
        }
        if (currentType !== patch.componentType) {
            failed.push(styleFailure(patch, "component_type_mismatch", `组件类型不匹配：期望 ${patch.componentType}，实际 ${currentType || "unknown"}`, {
                fieldPath: "componentType", actualValue: currentType ?? null, expectedValue: patch.componentType,
            }));
            return [];
        }
        return [{patch, controller, previousStyle: cloneDeep(currentConfig?.style)}];
    });

    if (failed.length > 0)
        return rejectStylePreflightBatch(patches, failed);

    const applied: ApplyComponentStylePatchSuccess[] = [];
    try {
        prepared.forEach(({patch, controller}) => {
            // stylePatch 已是完整组件配置补丁，不再额外包装 style。
            controller.update(cloneDeep(patch.stylePatch) as any, {reRender: true});
            const appliedStyle = controller.getConfig?.()?.style;
            if (!containsPatch(appliedStyle, patch.stylePatch.style)) {
                const changedPaths = diffPatchValues(patch.stylePatch.style, appliedStyle, "style");
                throw new FrontendEffectClientError("style_patch_not_applied", `组件 ${patch.componentId} 的样式补丁未生效`, {
                    componentId: patch.componentId,
                    fieldPath: changedPaths[0]?.fieldPath ?? "style",
                    expectedValue: patch.stylePatch.style,
                    changedPaths,
                });
            }
            applied.push({
                componentId: patch.componentId,
                componentType: patch.componentType,
                style: cloneDeep(appliedStyle),
            });
        });
    } catch (error) {
        const rollbackFailedComponentIds: string[] = [];
        prepared.forEach(({patch, controller, previousStyle}) => {
            try {
                controller.update({style: cloneDeep(previousStyle)} as any, {reRender: true});
                if (!isEqual(controller.getConfig?.()?.style, previousStyle))
                    rollbackFailedComponentIds.push(patch.componentId);
            } catch {
                rollbackFailedComponentIds.push(patch.componentId);
            }
        });
        const message = error instanceof Error ? error.message : String(error);
        const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
        const partiallyApplied = rollbackFailedComponentIds.flatMap((componentId) => {
            const item = prepared.find((candidate) => candidate.patch.componentId === componentId);
            return item ? [{componentId, componentType: item.patch.componentType, style: cloneDeep(item.controller.getConfig?.()?.style)}] : [];
        });
        return {
            applied: [],
            partial: rollbackFailedComponentIds.length > 0,
            partiallyApplied: sanitizeFrontendEffectDetails({partiallyApplied}).partiallyApplied as ApplyComponentStylePatchResult["partiallyApplied"],
            rollbackFailedComponentIds,
            failed: patches.map((patch) => ({
                componentId: patch.componentId,
                componentType: patch.componentType,
                code: rollbackFailedComponentIds.includes(patch.componentId) ? "batch_rollback_failed" : "batch_apply_rolled_back",
                message: rollbackFailedComponentIds.includes(patch.componentId)
                    ? `样式补丁应用失败且该组件未能完整回滚：${patch.componentId}；${message}`
                    : `样式补丁整批应用失败并已回滚：${message}`,
                ...sanitizeFrontendEffectDetails({
                    ...(typeof errorRecord.code === "string" ? {causeCode: errorRecord.code} : {}),
                    ...(isRecord(errorRecord.details) ? errorRecord.details : {}),
                }),
            })),
        };
    }

    return {applied, failed};
}

function rejectStylePreflightBatch(
    patches: ApplyComponentStylePatchItem[],
    failures: ApplyComponentStylePatchFailure[],
): ApplyComponentStylePatchResult {
    const failureById = new Map(failures.map((failure) => [failure.componentId, failure]));
    return {
        applied: [],
        failed: patches.map((patch) => failureById.get(patch.componentId) ?? ({
            componentId: patch.componentId,
            componentType: patch.componentType,
            code: "batch_preflight_aborted",
            message: "同批次存在无效样式补丁，整批未应用",
        })),
    };
}

/**
 * 归一化并校验工具入参。
 */
function normalizePayload(payload: unknown): {
    patches: ApplyComponentStylePatchItem[];
    expectedSnapshots?: ExpectedComponentStyleSnapshot[];
} {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new FrontendEffectClientError("invalid_payload", "样式补丁工具入参必须是对象", {
            fieldPath: "payload", actualValue: payload, expectedValue: "object",
        });
    }

    const rawPayload = payload as ApplyComponentStylePatchPayload;
    if (!Array.isArray(rawPayload.patches) || rawPayload.patches.length === 0) {
        throw new FrontendEffectClientError("invalid_payload", "样式补丁列表必须是非空数组", {
            fieldPath: "patches", actualValue: rawPayload.patches,
            ...(Array.isArray(rawPayload.patches) ? {actualCount: rawPayload.patches.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });
    }

    const patches = rawPayload.patches.map((patch, index) => {
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
            throw new FrontendEffectClientError("invalid_patch", `第 ${index + 1} 个样式补丁必须是对象`, {
                fieldPath: `patches[${index}]`, actualValue: patch, expectedValue: "object",
            });
        }
        const componentId = typeof patch.componentId === "string" ? patch.componentId.trim() : "";
        if (!componentId) {
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].componentId 必须是非空字符串`, {
                fieldPath: `patches[${index}].componentId`, actualValue: patch.componentId, expectedValue: "非空字符串",
            });
        }
        const componentType = typeof patch.componentType === "string" ? patch.componentType.trim() : "";
        if (!componentType) {
            throw new FrontendEffectClientError("invalid_patch", `patches[${index}].componentType 必须是非空字符串`, {
                componentId, fieldPath: `patches[${index}].componentType`, actualValue: patch.componentType, expectedValue: "非空字符串",
            });
        }
        return {
            componentId,
            componentType,
            stylePatch: normalizeStylePatch(patch.stylePatch, index),
            reason: patch.reason,
        };
    });
    return {
        patches,
        expectedSnapshots: normalizeExpectedSnapshots(rawPayload.expectedSnapshots, patches),
    };
}

function normalizeExpectedSnapshots(
    value: unknown,
    patches: ApplyComponentStylePatchItem[],
): ExpectedComponentStyleSnapshot[] | undefined {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.length === 0)
        throw new FrontendEffectClientError("invalid_payload", "expectedSnapshots 必须是非空数组", {
            fieldPath: "expectedSnapshots", actualValue: value,
            ...(Array.isArray(value) ? {actualCount: value.length} : {}),
            expectedValue: {type: "array", minItems: 1},
        });
    const snapshots = value.map((snapshot, index) => {
        if (!isRecord(snapshot) || typeof snapshot.componentId !== "string" || !snapshot.componentId.trim()
            || typeof snapshot.componentType !== "string" || !snapshot.componentType.trim()
            || !Object.prototype.hasOwnProperty.call(snapshot, "style")) {
            throw new FrontendEffectClientError("invalid_payload", `expectedSnapshots[${index}] 必须提供 componentId、componentType 和 style`, {
                fieldPath: `expectedSnapshots[${index}]`, actualValue: snapshot,
                expectedValue: {componentId: "non-empty string", componentType: "non-empty string", style: "snapshot"},
            });
        }
        return {
            componentId: snapshot.componentId.trim(),
            componentType: snapshot.componentType.trim(),
            style: cloneDeep(snapshot.style),
        };
    });
    const targetIds = new Set(patches.map((patch) => patch.componentId));
    const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.componentId));
    if (snapshots.length !== snapshotIds.size || snapshotIds.size !== targetIds.size
        || [...snapshotIds].some((componentId) => !targetIds.has(componentId))) {
        throw new FrontendEffectClientError("invalid_payload", "expectedSnapshots 的 componentId 必须与补丁目标唯一且一一对应", {
            fieldPath: "expectedSnapshots[].componentId",
            actualValue: {patchComponentIds: patches.map((patch) => patch.componentId), snapshotComponentIds: snapshots.map((snapshot) => snapshot.componentId)},
            expectedValue: "每个补丁目标对应且仅对应一个同 componentId 的基线",
        });
    }
    return snapshots;
}

function findStyleRevisionConflicts(
    patches: ApplyComponentStylePatchItem[],
    snapshots: ExpectedComponentStyleSnapshot[],
    layerManager: any,
): Array<{componentId: string; code: string; message: string; changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>; actualValue?: unknown; expectedValue?: unknown}> {
    const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.componentId, snapshot]));
    return patches.flatMap<{componentId: string; code: string; message: string; changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>; actualValue?: unknown; expectedValue?: unknown}>((patch) => {
        const expected = snapshotById.get(patch.componentId)!;
        const controller = layerManager?.controllers?.[patch.componentId];
        const layer = layerManager?.layerConfigs?.[patch.componentId];
        const currentConfig = controller?.getConfig?.();
        const currentType = currentConfig?.base?.type ?? layer?.type;
        if (!controller)
            return [{componentId: patch.componentId, code: "controller_not_found", message: `未找到组件控制器：${patch.componentId}`,
                changedPaths: [{fieldPath: "controller", expectedValue: "present", currentValue: null}], actualValue: null, expectedValue: "存在组件控制器"}];
        if (expected.componentType !== patch.componentType || currentType !== expected.componentType)
            return [{componentId: patch.componentId, code: "component_type_mismatch", message: `组件类型已变化：期望 ${expected.componentType}，实际 ${currentType ?? "unknown"}`, actualValue: currentType ?? null, expectedValue: expected.componentType}];
        if (!isEqual(toSerializableSnapshot(currentConfig?.style ?? null), toSerializableSnapshot(expected.style))) {
            const changedPaths = diffSnapshot(expected.style, currentConfig?.style ?? null, "style");
            return [{componentId: patch.componentId, code: "component_revision_conflict", message: `style 以下字段已变化：${changedPaths.map((item) => item.fieldPath).join("、")}`, changedPaths}];
        }
        return [];
    });
}

function rejectStyleBatch(
    patches: ApplyComponentStylePatchItem[],
    conflicts: Array<{componentId: string; code: string; message: string; changedPaths?: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}>; actualValue?: unknown; expectedValue?: unknown}>,
): ApplyComponentStylePatchResult {
    const failureById = new Map(conflicts.map((conflict) => [conflict.componentId, conflict]));
    const cause = conflicts[0];
    return {
        applied: [],
        failed: patches.map((patch) => {
            const conflict = failureById.get(patch.componentId);
            return styleFailure(patch, conflict?.code ?? "batch_preflight_aborted",
                conflict?.message ?? `同批次组件 ${cause?.componentId} 未通过预检，整批补丁未应用`, {
                    ...conflict,
                    failedComponentId: conflict ? undefined : cause?.componentId,
                    causeCode: conflict ? undefined : cause?.code,
                });
        }),
    };
}

/** 校验统一样式补丁协议，不兼容旧的扁平格式。 */
function normalizeStylePatch(value: unknown, index: number): ComponentStylePatch {
    if (!isRecord(value))
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch 必须是对象`, {
            fieldPath: `patches[${index}].stylePatch`, actualValue: value, expectedValue: "object",
        });
    const rootKeys = Object.keys(value);
    if (rootKeys.length !== 1 || rootKeys[0] !== "style")
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch 顶层只能包含 style`, {
            fieldPath: `patches[${index}].stylePatch`, actualValue: rootKeys, expectedValue: ["style"],
        });
    if (!isRecord(value.style) || Object.keys(value.style).length === 0)
        throw new FrontendEffectClientError("invalid_patch", `patches[${index}].stylePatch.style 必须是非空对象`, {
            fieldPath: `patches[${index}].stylePatch.style`, actualValue: value.style, expectedValue: "non-empty object",
        });
    return {style: value.style};
}

/** 判断应用后的真实 style 是否完整包含补丁内容。 */
function containsPatch(actual: unknown, patch: unknown): boolean {
    if (!isRecord(patch))
        return isEqual(actual, patch);
    if (!isRecord(actual))
        return false;
    return Object.entries(patch).every(([key, value]) => containsPatch(actual[key], value));
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function styleFailure(
    patch: ApplyComponentStylePatchItem,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
): ApplyComponentStylePatchFailure {
    return {
        componentId: patch.componentId,
        componentType: patch.componentType,
        code,
        message,
        ...sanitizeFrontendEffectDetails(details),
    };
}

function diffSnapshot(expected: unknown, current: unknown, fieldPath: string): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    if (isEqual(expected, current))
        return [];
    if (isRecord(expected) && isRecord(current))
        return [...new Set([...Object.keys(expected), ...Object.keys(current)])].sort()
            .flatMap((key) => diffSnapshot(expected[key], current[key], `${fieldPath}.${key}`));
    if (Array.isArray(expected) && Array.isArray(current)) {
        const changes: Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> = [];
        if (expected.length !== current.length)
            changes.push({fieldPath: `${fieldPath}.length`, expectedValue: expected.length, currentValue: current.length});
        for (let index = 0; index < Math.max(expected.length, current.length); index += 1)
            changes.push(...diffSnapshot(expected[index], current[index], `${fieldPath}[${index}]`));
        return changes;
    }
    return [{fieldPath, expectedValue: expected, currentValue: current}];
}

function diffPatchValues(expectedPatch: unknown, current: unknown, fieldPath: string): Array<{fieldPath: string; expectedValue: unknown; currentValue: unknown}> {
    if (isRecord(expectedPatch)) {
        if (!isRecord(current))
            return [{fieldPath, expectedValue: expectedPatch, currentValue: current}];
        return Object.entries(expectedPatch).flatMap(([key, value]) => diffPatchValues(value, current[key], `${fieldPath}.${key}`));
    }
    return isEqual(expectedPatch, current) ? [] : [{fieldPath, expectedValue: expectedPatch, currentValue: current}];
}
